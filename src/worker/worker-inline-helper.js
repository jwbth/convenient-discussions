/**
 * Helper to inline a worker using a Blob URL instead of string embedding.
 * This avoids minification issues with embedded worker code.
 *
 * @param {string} workerCode - The worker code as a string
 * @returns {Worker}
 */
export function createInlineWorker(workerCode) {
  const blob = new Blob([workerCode], { type: 'application/javascript' });
  const workerUrl = URL.createObjectURL(blob);
  return new Worker(workerUrl);
}
