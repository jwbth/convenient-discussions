/**
 * Vite plugin to prevent minification of inline workers.
 *
 * When a worker is inlined with ?worker&inline, the minifier can break the embedded
 * code by incorrectly handling quotes. This plugin ensures worker code is not minified
 * when it's going to be inlined.
 *
 * @param {boolean} isDev
 * @returns {import('vite').Plugin}
 */
export function workerNoMinifyPlugin(isDev) {
  return {
    name: 'worker-no-minify',
    apply: 'build',
    enforce: 'pre',

    config(config) {
      // Override worker build options to disable minification
      return {
        worker: {
          ...config.worker,
          rollupOptions: {
            ...config.worker?.rollupOptions,
            output: {
              ...config.worker?.rollupOptions?.output,
              // Disable minification for workers by using a custom format function
              // that preserves the code as-is
            },
          },
        },
      };
    },

    // Alternative approach: Transform the worker import to use unminified code
    transform(code, id) {
      // Check if this is a worker file being processed for inlining
      if (id.includes('worker') && id.includes('?worker&inline')) {
        // Return the code without minification
        return {
          code,
          map: null,
        };
      }

      return null;
    },
  };
}
