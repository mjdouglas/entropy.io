# Rubik's Cube Speed Solving Viewer

Interactive Three.js experience that continuously scrambles and solves a GLTF Rubik's Cube. The model is sourced from Sketchfab (“Rubik's Cube Speed Solving” by romullus) and ships with a rig/animation that captures one full solve. The app rewinds the rig to the solved pose, procedurally scrambles the cube, and then animates the optimal Kociemba solution.

## Requirements

- Node.js 20 or newer

## High-Level Architecture

- **Three.js scene setup**
  - Creates renderer, camera, orbit controls, and multiple lights for glossy materials.
  - Loads `scene.gltf` via `GLTFLoader`, centers/scales the `gltf.scene`, and keeps a reference to the resulting root for animation.
- **Model preparation**
  - `applySolvedPoseFromAnimation` walks every animation track, grabs the last keyframe value, and stamps it on the corresponding node (position/rotation/scale). This bakes the mesh into its canonical solved state before the procedural animation runs.
  - `identifyPiecesAndBuildFaceMap` traverses the rig, finds cubie root nodes (centers, edges, corners), and exposes `getPiecesForFace(face)` which executes a live position test (> threshold) for each axis so face membership stays accurate after every twist.
- **Kociemba solver**
  - `KociembaSolver` wraps the browser builds of [`cubejs`](https://github.com/ldez/cubejs) (`cube.min.js` + `solve.min.js`) which implement Herbert Kociemba’s two-phase algorithm.
  - The helper lazily calls `Cube.initSolver()` once, then applies each scramble to a new `Cube` instance and returns `cube.solve()`’s optimized solution sequence.
- **Move execution**
  - `MoveExecutor` turns a face move (e.g., `R'`, `F2`) into an axis + angle, creates a temporary pivot `Group` at the cube origin, parents the relevant cubies to that pivot, rotates it (animated or instant), then restores each cubie to its original parent. This approach preserves piece positions and lets us reuse animation vs. instant rotations.
- **Animation controller**
  - `CubeAnimationController` coordinates the perpetual loop:
    1. Generate a 25-move scramble.
    2. Execute scramble (instant on the first loop so the page opens in a scrambled position, otherwise 100 ms per move).
    3. Pause (skip on first loop) and compute the Kociemba solution via `Cube` (`cube.move(...); cube.solve()`).
    4. Animate the solve at 500 ms per move.
    5. Idle for 2 seconds and repeat.

## Key Files

- `index.html` – Houses all Three.js setup, animation system, and solver logic.
- `scene.gltf`, `scene.bin`, `textures/` – The GLTF model, binary buffer, and PBR textures from Sketchfab.
- `license.txt` – Attribution/license info required by the asset.

## Extending / Debugging

- Use the existing console logs (all node names, face counts, scramble/solution strings) to verify the rig structure and animation flow.
- To tweak scramble behavior, adjust `generateScramble` length or `CubeAnimationController` timing constants.
- If you replace `scene.gltf`, confirm that the naming scheme for cubies stays consistent (`R2Center_*`, `R2Edge_*`, etc.) or update the filters in `identifyPiecesAndBuildFaceMap`.

## Hosting Notes

Everything is static: just serve this folder (e.g., `npx http-server .`) and open `index.html`. No bundling required thanks to native ES modules + import maps. Make sure the GLTF + textures stay relative to `index.html` so the loader paths remain valid.
