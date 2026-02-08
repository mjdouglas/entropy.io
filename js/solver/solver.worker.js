// Web Worker for Rubik's cube solver
// Loads pre-computed tables for instant initialization

import Cube from 'cubejs';

let initialized = false;

self.onmessage = async (e) => {
  const { type, id } = e.data;

  if (type === 'init') {
    const startTime = performance.now();

    try {
      // Try to load pre-computed tables
      const response = await fetch('/solver-tables.json');
      if (response.ok) {
        const tables = await response.json();
        Cube.moveTables = tables.moveTables;
        Cube.pruningTables = tables.pruningTables;
        const elapsed = performance.now() - startTime;
        console.log(`Solver tables loaded in ${elapsed.toFixed(0)}ms`);
      } else {
        // Fall back to computing tables if file not found
        console.log('Pre-computed tables not found, computing...');
        Cube.initSolver();
        const elapsed = performance.now() - startTime;
        console.log(`Solver initialization took ${elapsed.toFixed(0)}ms`);
      }
    } catch (err) {
      // Fall back to computing tables on error
      console.log('Failed to load tables, computing...', err.message);
      Cube.initSolver();
      const elapsed = performance.now() - startTime;
      console.log(`Solver initialization took ${elapsed.toFixed(0)}ms`);
    }

    initialized = true;
    self.postMessage({ type: 'ready', id });
  } else if (type === 'solve') {
    if (!initialized) {
      self.postMessage({ type: 'error', id, error: 'Solver not initialized' });
      return;
    }

    try {
      const { scrambleMoves } = e.data;
      const scrambleString = scrambleMoves.join(' ');
      const cube = new Cube();
      cube.move(scrambleString);
      const solutionString = cube.solve();
      const solution = solutionString.trim().split(/\s+/).filter(Boolean);

      self.postMessage({ type: 'solution', id, solution });
    } catch (err) {
      console.error('Solver error:', err);
      self.postMessage({ type: 'error', id, error: err.message });
    }
  }
};
