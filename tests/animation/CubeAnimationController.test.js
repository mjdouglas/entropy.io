// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CubeAnimationController } from '../../js/animation/CubeAnimationController.js';

// Mock dependencies
vi.mock('../../js/scene/identifyPieces.js', () => ({
  identifyPiecesAndBuildFaceMap: vi.fn(() => ({
    getPiecesForFace: vi.fn(() => []),
  })),
}));

vi.mock('../../js/solver/generateScramble.js', () => ({
  generateScramble: vi.fn(() => ['R', 'U', "R'"]),
}));

vi.mock('../../js/animation/MoveExecutor.js', () => ({
  MoveExecutor: vi.fn().mockImplementation(() => ({
    executeMove: vi.fn().mockResolvedValue(true),
  })),
}));

import { MoveExecutor } from '../../js/animation/MoveExecutor.js';
// Import mocks after vi.mock declarations
import { identifyPiecesAndBuildFaceMap } from '../../js/scene/identifyPieces.js';
import { generateScramble } from '../../js/solver/generateScramble.js';

describe('CubeAnimationController', () => {
  let mockGltfModel;
  let mockSolver;
  let controller;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    mockGltfModel = { scene: {} };
    mockSolver = {
      solve: vi.fn().mockResolvedValue(['R', 'U']),
    };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('constructor', () => {
    it('initializes with provided solver', () => {
      controller = new CubeAnimationController(mockGltfModel, mockSolver);

      expect(controller.solver).toBe(mockSolver);
    });

    it('initializes pieceLocator from gltf model', () => {
      controller = new CubeAnimationController(mockGltfModel, mockSolver);

      expect(identifyPiecesAndBuildFaceMap).toHaveBeenCalledWith(mockGltfModel);
      expect(controller.pieceLocator).toBeDefined();
    });

    it('creates MoveExecutor with pieceLocator and model', () => {
      controller = new CubeAnimationController(mockGltfModel, mockSolver);

      expect(MoveExecutor).toHaveBeenCalled();
      expect(controller.executor).toBeDefined();
    });

    it('starts with isRunning false', () => {
      controller = new CubeAnimationController(mockGltfModel, mockSolver);

      expect(controller.isRunning).toBe(false);
    });

    it('starts with firstCycle true', () => {
      controller = new CubeAnimationController(mockGltfModel, mockSolver);

      expect(controller.firstCycle).toBe(true);
    });

    it('uses provided callbacks', () => {
      const onSolved = vi.fn();
      const onScrambling = vi.fn();

      controller = new CubeAnimationController(mockGltfModel, mockSolver, {
        onSolved,
        onScrambling,
      });

      expect(controller.onSolved).toBe(onSolved);
      expect(controller.onScrambling).toBe(onScrambling);
    });

    it('uses no-op callbacks when not provided', () => {
      controller = new CubeAnimationController(mockGltfModel, mockSolver);

      // Should not throw when called
      expect(() => controller.onSolved()).not.toThrow();
      expect(() => controller.onScrambling()).not.toThrow();
    });
  });

  describe('stop', () => {
    it('sets isRunning to false', () => {
      controller = new CubeAnimationController(mockGltfModel, mockSolver);
      controller.isRunning = true;

      controller.stop();

      expect(controller.isRunning).toBe(false);
    });
  });

  describe('sleep', () => {
    it('returns a promise that resolves after specified ms', async () => {
      controller = new CubeAnimationController(mockGltfModel, mockSolver);

      const promise = controller.sleep(1000);
      vi.advanceTimersByTime(1000);

      await expect(promise).resolves.toBeUndefined();
    });
  });

  describe('startContinuousLoop', () => {
    it('returns early if already running', async () => {
      controller = new CubeAnimationController(mockGltfModel, mockSolver);
      controller.isRunning = true;
      const initialSolverCallCount = mockSolver.solve.mock.calls.length;

      controller.startContinuousLoop();

      await vi.advanceTimersByTimeAsync(1000);

      // Should not have started another solve cycle
      expect(mockSolver.solve).toHaveBeenCalledTimes(initialSolverCallCount);
    });

    it('sets isRunning to true when started', () => {
      controller = new CubeAnimationController(mockGltfModel, mockSolver);

      controller.startContinuousLoop();

      expect(controller.isRunning).toBe(true);
      controller.stop();
    });

    it('uses initial scramble on first cycle', async () => {
      controller = new CubeAnimationController(mockGltfModel, mockSolver);
      const initialScramble = ['F', 'B', 'L'];

      controller.startContinuousLoop(initialScramble);

      // Let the first cycle start
      await vi.advanceTimersByTimeAsync(0);

      expect(mockSolver.solve).toHaveBeenCalledWith(initialScramble);

      controller.stop();
      await vi.advanceTimersByTimeAsync(10000);
    });

    it('generates new scramble when no initial scramble provided', async () => {
      controller = new CubeAnimationController(mockGltfModel, mockSolver);

      controller.startContinuousLoop();

      await vi.advanceTimersByTimeAsync(0);

      expect(generateScramble).toHaveBeenCalledWith(25);

      controller.stop();
      await vi.advanceTimersByTimeAsync(10000);
    });

    it('calls onSolved callback after solution is executed', async () => {
      const onSolved = vi.fn();
      controller = new CubeAnimationController(mockGltfModel, mockSolver, {
        onSolved,
      });

      controller.startContinuousLoop(['R']);

      await vi.advanceTimersByTimeAsync(0);

      expect(onSolved).toHaveBeenCalled();

      controller.stop();
      await vi.advanceTimersByTimeAsync(10000);
    });

    it('calls onScrambling callback before next scramble', async () => {
      const onScrambling = vi.fn();
      controller = new CubeAnimationController(mockGltfModel, mockSolver, {
        onScrambling,
      });

      controller.startContinuousLoop(['R']);

      // Wait for solution + 2000ms pause
      await vi.advanceTimersByTimeAsync(2000);

      expect(onScrambling).toHaveBeenCalled();

      controller.stop();
      await vi.advanceTimersByTimeAsync(10000);
    });

    it('sets firstCycle to false after first iteration', async () => {
      controller = new CubeAnimationController(mockGltfModel, mockSolver);

      controller.startContinuousLoop(['R']);

      await vi.advanceTimersByTimeAsync(2000);

      expect(controller.firstCycle).toBe(false);

      controller.stop();
      await vi.advanceTimersByTimeAsync(10000);
    });

    it('executes solution moves via executor', async () => {
      controller = new CubeAnimationController(mockGltfModel, mockSolver);
      const executorMock = controller.executor;

      controller.startContinuousLoop(['R']);

      await vi.advanceTimersByTimeAsync(0);

      // Should execute solution moves (R, U from mock solver)
      expect(executorMock.executeMove).toHaveBeenCalledWith('R', 500);
      expect(executorMock.executeMove).toHaveBeenCalledWith('U', 500);

      controller.stop();
      await vi.advanceTimersByTimeAsync(10000);
    });

    it('uses instant scramble duration on first cycle with no initial scramble', async () => {
      controller = new CubeAnimationController(mockGltfModel, mockSolver);
      const executorMock = controller.executor;

      controller.startContinuousLoop();

      await vi.advanceTimersByTimeAsync(0);

      // First scramble should be instant (duration 0)
      expect(executorMock.executeMove).toHaveBeenCalledWith('R', 0);
      expect(executorMock.executeMove).toHaveBeenCalledWith('U', 0);
      expect(executorMock.executeMove).toHaveBeenCalledWith("R'", 0);

      controller.stop();
      await vi.advanceTimersByTimeAsync(10000);
    });

    it('handles errors gracefully and continues loop', async () => {
      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      mockSolver.solve.mockRejectedValueOnce(new Error('Solver error'));

      controller = new CubeAnimationController(mockGltfModel, mockSolver);

      controller.startContinuousLoop(['R']);

      await vi.advanceTimersByTimeAsync(0);

      expect(consoleSpy).toHaveBeenCalledWith(
        'Error in animation loop:',
        expect.any(Error),
      );

      // Should wait 5 seconds before retry
      await vi.advanceTimersByTimeAsync(5000);

      // Loop should continue (solver gets called again)
      expect(mockSolver.solve).toHaveBeenCalledTimes(2);

      controller.stop();
      consoleSpy.mockRestore();
      await vi.advanceTimersByTimeAsync(10000);
    });

    it('stops loop when stop() is called', async () => {
      controller = new CubeAnimationController(mockGltfModel, mockSolver);

      controller.startContinuousLoop(['R']);

      await vi.advanceTimersByTimeAsync(0);

      const callCountBeforeStop = mockSolver.solve.mock.calls.length;

      controller.stop();

      await vi.advanceTimersByTimeAsync(10000);

      expect(mockSolver.solve).toHaveBeenCalledTimes(callCountBeforeStop);
    });
  });

  describe('second cycle behavior', () => {
    it('generates scramble and adds pause on non-first cycles', async () => {
      controller = new CubeAnimationController(mockGltfModel, mockSolver);
      controller.firstCycle = false;

      controller.startContinuousLoop();

      await vi.advanceTimersByTimeAsync(0);

      // Should use 100ms duration for scramble moves
      const executorMock = controller.executor;
      expect(executorMock.executeMove).toHaveBeenCalledWith('R', 100);

      controller.stop();
      await vi.advanceTimersByTimeAsync(10000);
    });

    it('tracks successfully executed scramble moves', async () => {
      const executorMock = {
        executeMove: vi
          .fn()
          .mockResolvedValueOnce(true) // R succeeds
          .mockResolvedValueOnce(false) // U fails
          .mockResolvedValueOnce(true), // R' succeeds
      };
      MoveExecutor.mockImplementation(() => executorMock);

      controller = new CubeAnimationController(mockGltfModel, mockSolver);
      controller.firstCycle = false;

      controller.startContinuousLoop();

      await vi.advanceTimersByTimeAsync(1000);

      // Solver should only receive successfully executed moves
      expect(mockSolver.solve).toHaveBeenCalledWith(['R', "R'"]);

      controller.stop();
      await vi.advanceTimersByTimeAsync(10000);
    });
  });
});
