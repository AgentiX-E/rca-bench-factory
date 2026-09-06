/**
 * Re-exports used by the edge-case suite.
 *
 * Kept separate so a test file never reaches into two different import styles
 * for the same module.
 */
export { computeCoverage } from '../src/coverage.js';
export { exportOpenRca } from '../src/export/openrca.js';
export { exportRcaEval } from '../src/export/rcaeval.js';
