import { identifyPiecesAndBuildFaceMap } from '../scene/identifyPieces.js';
import { generateScramble } from '../solver/generateScramble.js';
import { KociembaSolver } from '../solver/KociembaSolver.js';
import { MoveExecutor } from './MoveExecutor.js';

/**
 * Main animation controller - orchestrates scramble/solve loop
 */
export class CubeAnimationController {
  constructor(gltfModel, solver = null, callbacks = {}) {
    this.pieceLocator = identifyPiecesAndBuildFaceMap(gltfModel);
    this.executor = new MoveExecutor(this.pieceLocator, gltfModel);
    this.solver = solver || new KociembaSolver(); // Use provided or create new
    this.isRunning = false;
    this.firstCycle = true;
    this.onSolved = callbacks.onSolved || (() => {});
    this.onScrambling = callbacks.onScrambling || (() => {});
    this.onMove = callbacks.onMove || (() => {});
    this.loopPromise = null;
    this.pendingSleeps = new Set();
  }

  async startContinuousLoop(initialScramble = null) {
    if (this.isRunning) return this.loopPromise;
    this.isRunning = true;

    console.log('Starting continuous solve/scramble loop...');

    this.loopPromise = (async () => {
      while (this.isRunning) {
        try {
          let executedScramble;

          // 1. Use initial scramble on first cycle, or generate new one
          if (this.firstCycle && initialScramble) {
            console.log(
              'Using pre-applied scramble:',
              initialScramble.join(' '),
            );
            executedScramble = initialScramble;
          } else {
            // Generate scramble
            const scramble = generateScramble(25);
            console.log('Scrambling:', scramble.join(' '));

            // 2. Execute scramble (instant for first cycle, fast animation otherwise)
            const scrambleDuration = this.firstCycle ? 0 : 100;
            executedScramble = [];
            for (const move of scramble) {
              if (!this.isRunning) break;
              const success = await this.executor.executeMove(
                move,
                scrambleDuration,
              );
              if (success) {
                executedScramble.push(move);
                this.onMove(move);
              }
            }

            if (this.isRunning && !this.firstCycle) {
              // 3. Brief pause after scramble
              await this.sleep(1000);
            }
          }

          if (!this.isRunning) break;

          // 4. Solve using cube.js' Kociemba implementation
          console.log('Solving cube with Kociemba...');
          const scrambleForSolver = executedScramble;
          const solution = await this.solver.solve(scrambleForSolver);
          console.log(
            'Solution:',
            solution.join(' '),
            `(${solution.length} moves)`,
          );

          // 5. Execute solution (normal: 500ms per move)
          for (const move of solution) {
            if (!this.isRunning) break;
            await this.executor.executeMove(move, 500);
            this.onMove(move);
          }

          if (!this.isRunning) break;

          // 6. Cube is now solved - trigger callback
          this.onSolved();

          // 7. Pause before next cycle
          await this.sleep(2000);

          if (!this.isRunning) break;

          // 8. About to scramble - trigger callback
          this.onScrambling();

          this.firstCycle = false;
        } catch (error) {
          console.error('Error in animation loop:', error);
          await this.sleep(5000); // Wait before retry
        }
      }
    })();

    await this.loopPromise;
    this.loopPromise = null;
  }

  sleep(ms) {
    return new Promise((resolve) => {
      const pendingSleep = {
        resolve: () => {
          this.pendingSleeps.delete(pendingSleep);
          resolve();
        },
        timeoutId: null,
      };

      pendingSleep.timeoutId = setTimeout(() => {
        pendingSleep.resolve();
      }, ms);

      this.pendingSleeps.add(pendingSleep);
    });
  }

  wakeSleeps() {
    this.pendingSleeps.forEach((pendingSleep) => {
      clearTimeout(pendingSleep.timeoutId);
      pendingSleep.resolve();
    });
  }

  stop() {
    this.isRunning = false;
    this.wakeSleeps();
  }

  stopImmediately() {
    this.isRunning = false;
    this.wakeSleeps();
    this.executor.cancelCurrentMove();
  }

  async waitForStop() {
    if (this.loopPromise) {
      await this.loopPromise;
    }
  }
}
