import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Vite plugin to inline worker code as a string literal.
 * This allows creating workers using Blob URLs to comply with CSP policies.
 *
 * @returns {import('vite').Plugin}
 */
export function inlineWorkerStringPlugin() {
	/** @type {Map<string, string>} */
	const workerCodeCache = new Map();

	return {
		name: 'inline-worker-string',
		enforce: 'pre',

		async resolveId(source, importer) {
			// Match imports like './worker/worker-gate?worker&inline-string'
			if (source.includes('?worker&inline-string')) {
				const [path] = source.split('?');
				// Resolve the path relative to the importer
				if (importer) {
					const importerDir = dirname(importer);
					const resolved = resolve(importerDir, path);
					return resolved + '?worker&inline-string';
				}
			}
			return null;
		},

		async load(id) {
			// Match imports like './worker/worker-gate?worker&inline-string'
			if (!id.includes('?worker&inline-string')) return null;

			const [workerPath] = id.split('?');

			// Check cache first
			if (workerCodeCache.has(workerPath)) {
				return `export default ${JSON.stringify(workerCodeCache.get(workerPath))};`;
			}

			// Build the worker as a separate bundle
			try {
				const result = await build({
					configFile: false,
					build: {
						write: false,
						minify: 'terser',
						terserOptions: {
							compress: { passes: 2 },
							format: { ascii_only: true },
						},
						lib: {
							entry: workerPath,
							formats: ['iife'],
							name: 'Worker',
						},
						rollupOptions: {
							output: {
								inlineDynamicImports: true,
							},
						},
					},
				});

				if (Array.isArray(result)) {
					const output = result[0];
					if ('output' in output) {
						const chunk = output.output.find((c) => c.type === 'chunk');
						if (chunk && chunk.type === 'chunk') {
							const workerCode = chunk.code;
							workerCodeCache.set(workerPath, workerCode);
							return `export default ${JSON.stringify(workerCode)};`;
						}
					}
				}
			} catch (error) {
				console.error('Failed to build worker:', error);
				throw error;
			}

			throw new Error(`Failed to inline worker: ${workerPath}`);
		},
	};
}
