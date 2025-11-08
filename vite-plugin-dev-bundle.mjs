import fs from 'node:fs';
import path from 'node:path';

/**
 * Vite plugin to serve the built bundle in dev mode (like webpack-dev-server).
 * This plugin intercepts requests to the bundle file and serves the built output.
 *
 * @param {object} options
 * @param {string} options.bundlePath - Path to the bundle file (e.g., '/convenientDiscussions.dev.js')
 * @param {string} options.distDir - Directory where the bundle is built (e.g., 'dist')
 * @returns {import('vite').Plugin}
 */
export function devBundlePlugin(options) {
  const { bundlePath, distDir } = options;

  return {
    name: 'dev-bundle',
    apply: 'serve',
    configureServer(server) {
      // Add middleware to serve the built bundle
      server.middlewares.use((req, res, next) => {
        if (req.url === bundlePath) {
          const filePath = path.join(distDir, path.basename(bundlePath));

          // Check if file exists
          if (fs.existsSync(filePath)) {
            // Read the bundle file
            const content = fs.readFileSync(filePath, 'utf-8');

            // Set appropriate headers
            res.setHeader('Content-Type', 'application/javascript');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Access-Control-Allow-Origin', '*');

            // Send the bundle
            res.end(content);
          } else {
            res.statusCode = 404;
            res.end(`Bundle not found: ${filePath}`);
          }
        } else {
          next();
        }
      });

      // Watch the bundle file for changes and trigger HMR
      const bundleFile = path.join(distDir, path.basename(bundlePath));
      server.watcher.add(bundleFile);

      server.watcher.on('change', (file) => {
        if (file === bundleFile) {
          // Trigger full page reload when bundle changes
          server.ws.send({
            type: 'full-reload',
            path: '*',
          });
        }
      });
    },
  };
}
