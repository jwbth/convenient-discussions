import { createServer } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Development server that serves the built bundle with live reload support.
 * Similar to webpack-dev-server behavior.
 */
async function startDevServer() {
  // Create a Vite server in middleware mode
  const vite = await createServer({
    server: {
      middlewareMode: true,
      port: 9000,
      cors: {
        origin: '*',
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['*'],
      },
      hmr: {
        protocol: 'ws',
        host: 'localhost',
        port: 9000,
      },
    },
    appType: 'custom',
  });

  // Create an HTTP server
  const { createServer: createHttpServer } = await import('node:http');
  const server = createHttpServer((req, res) => {
    // Serve built bundle files
    if (req.url?.startsWith('/convenientDiscussions')) {
      const filePath = path.join(__dirname, 'dist', req.url);

      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf-8');

        // Inject HMR client code for live reload
        const hmrClient = `
// HMR Client for live reload
if (typeof WebSocket !== 'undefined') {
  const ws = new WebSocket('ws://localhost:9000');
  ws.addEventListener('message', (event) => {
    const data = JSON.parse(event.data);
    if (data.type === 'full-reload' || data.type === 'update') {
      console.log('[CD Dev] Reloading due to file changes...');
      location.reload();
    }
  });
  ws.addEventListener('error', () => {
    console.log('[CD Dev] HMR connection failed');
  });
}
`;

        res.setHeader('Content-Type', 'application/javascript');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.end(hmrClient + '\n' + content);
        return;
      }
    }

    // Serve other files from dist
    if (req.url && req.url !== '/') {
      const filePath = path.join(__dirname, 'dist', req.url);
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath);
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.end(content);
        return;
      }
    }

    // Default response
    res.setHeader('Content-Type', 'text/html');
    res.end(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Convenient Discussions Dev Server</title>
        </head>
        <body>
          <h1>Convenient Discussions Development Server</h1>
          <p>Bundle available at: <a href="/convenientDiscussions.dev.js">/convenientDiscussions.dev.js</a></p>
          <p>Load in MediaWiki with: <code>mw.loader.load('http://localhost:9000/convenientDiscussions.dev.js');</code></p>
        </body>
      </html>
    `);
  });

  // Use Vite's middleware for WebSocket HMR
  server.on('upgrade', vite.httpServer.emit.bind(vite.httpServer, 'upgrade'));

  // Watch dist directory for changes
  const distPath = path.join(__dirname, 'dist');
  fs.watch(distPath, { recursive: true }, (eventType, filename) => {
    if (filename?.includes('convenientDiscussions')) {
      console.log(`[CD Dev] File changed: ${filename}`);
      // Trigger full reload via HMR
      vite.ws.send({
        type: 'full-reload',
        path: '*',
      });
    }
  });

  server.listen(9000, () => {
    console.log('\n  Convenient Discussions Dev Server running at:\n');
    console.log('  ➜  Local:   http://localhost:9000/');
    console.log('  ➜  Bundle:  http://localhost:9000/convenientDiscussions.dev.js\n');
    console.log('  Load in MediaWiki:');
    console.log('  mw.loader.load(\'http://localhost:9000/convenientDiscussions.dev.js\');\n');
  });
}

startDevServer().catch((err) => {
  console.error('Failed to start dev server:', err);
  process.exit(1);
});
