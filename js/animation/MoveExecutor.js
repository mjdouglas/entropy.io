import * as THREE from 'three';
import { AXES } from '../utils/constants.js';

/**
 * Handles execution and animation of Rubik's Cube moves
 */
export class MoveExecutor {
  constructor(pieceLocator, cubeRoot) {
    this.pieceLocator = pieceLocator;
    this.cubeRoot = cubeRoot;
    this.sceneRoot = cubeRoot.parent;
    this.AXES = AXES;
    this.activeAnimation = null;
  }

  parseMove(move) {
    const face = move[0];
    let angle = -Math.PI / 2; // Clockwise when looking at the face

    if (move.includes("'")) {
      angle = Math.PI / 2; // Counter-clockwise
    } else if (move.includes('2')) {
      angle = Math.PI; // 180 degrees
    }

    return { face, angle };
  }

  async executeMove(move, duration) {
    const { face, angle } = this.parseMove(move);

    // Get pieces to rotate
    const pieces = this.pieceLocator.getPiecesForFace(face);
    if (!pieces || pieces.length === 0) {
      console.warn(`No pieces found for face ${face}`);
      return false;
    }

    // Prepare pivot group at cube center so positions follow rotation
    const pivot = new THREE.Group();
    const cubeWorldPos = new THREE.Vector3();
    this.cubeRoot.getWorldPosition(cubeWorldPos);
    pivot.position.copy(cubeWorldPos);
    this.sceneRoot.add(pivot);

    // Reparent pieces to pivot temporarily
    const originalParents = new Map();
    pieces.forEach((piece) => {
      originalParents.set(piece, piece.parent);
      pivot.attach(piece);
    });

    // Animate rotation
    await this.animatePivotRotation(pivot, this.AXES[face], angle, duration);

    // Restore parents
    pieces.forEach((piece) => {
      const parent = originalParents.get(piece);
      parent.attach(piece);
    });
    this.sceneRoot.remove(pivot);

    return true;
  }

  animatePivotRotation(pivot, axis, angle, duration) {
    return new Promise((resolve) => {
      const startTime = performance.now();
      const startQuat = pivot.quaternion.clone();
      const targetQuat = startQuat
        .clone()
        .multiply(new THREE.Quaternion().setFromAxisAngle(axis, angle));

      if (duration <= 0) {
        pivot.quaternion.copy(targetQuat).normalize();
        resolve();
        return;
      }

      const animationState = {
        canceled: false,
        finishImmediately: () => {
          if (animationState.canceled) return;
          animationState.canceled = true;
          pivot.quaternion.copy(targetQuat).normalize();
          resolve();
        },
      };
      this.activeAnimation = animationState;

      const animate = (currentTime) => {
        if (animationState.canceled) {
          return;
        }
        const elapsed = currentTime - startTime;
        const t = Math.min(elapsed / duration, 1);
        const eased = this.easeInOutCubic(t);

        pivot.quaternion.copy(startQuat).slerp(targetQuat, eased);

        if (t < 1) {
          requestAnimationFrame(animate);
        } else {
          this.activeAnimation = null;
          pivot.quaternion.copy(targetQuat).normalize();
          resolve();
        }
      };

      requestAnimationFrame(animate);
    });
  }

  cancelCurrentMove() {
    if (!this.activeAnimation) {
      return;
    }
    this.activeAnimation.finishImmediately();
    this.activeAnimation = null;
  }

  easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
  }
}
