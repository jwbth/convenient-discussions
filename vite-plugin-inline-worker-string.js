import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { build } from 'vite'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/**
 * @typedef {object} InlineWorkerStringPluginOptions
 * @property {string} [sourceMapsBaseUrl] Base URL for source map files. When provided, the worker
 *   sub-build emits a separate .map file and appends a `//# sourceMappingURL=` comment pointing to
 *   it. When absent, the source map is inlined as a data URI instead.
 * @property {string} [workerMapFileName] Output filename for the emitted .map file, including any
 *   build mode postfix (e.g. `convenientDiscussions.worker.staging.js.map`).
 */

/**
 * Vite plugin to inline worker code as a string literal.
 * This allows creating workers using Blob URLs to comply with CSP policies.
 *
 * @param {InlineWorkerStringPluginOptions} [options]
 * @returns {import('vite').Plugin}
 */
export function inlineWorkerStringPlugin({
	sourceMapsBaseUrl,
	workerMapFileName = 'convenientDiscussions.worker.js.map',
} = {}) {
	/** @type {Map<string, string>} */
	const workerCodeCache = new Map()

	return {
		name: 'inline-worker-string',
		enforce: 'pre',

		resolveId(source, importer) {
			// Match imports like './worker/worker-gate?worker&inline-string'
			if (source.includes('?worker&inline-string')) {
				const [pathname] = source.split('?')
				// Resolve the path relative to the importer
				if (importer) {
					const importerDir = path.dirname(importer)
					const resolved = path.resolve(importerDir, pathname)

					return resolved + '?worker&inline-string'
				}
			}

			return null
		},

		async load(id) {
			// Match imports like './worker/worker-gate?worker&inline-string'
			if (!id.includes('?worker&inline-string')) return null

			const [workerPath] = id.split('?')

			// Check cache first
			if (workerCodeCache.has(workerPath)) {
				return `export default ${JSON.stringify(workerCodeCache.get(workerPath))};`
			}

			// Build the worker as a separate bundle
			try {
				const result = await build({
					configFile: false,
					build: {
						write: false,
						// When a base URL is provided, emit a separate .map file (true).
						// Otherwise (dev/single builds), embed the map as a data URI (inline).
						sourcemap: sourceMapsBaseUrl ? true : 'inline',
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
								exports: 'named',
							},
						},
					},
				})

				if (Array.isArray(result)) {
					const output = result[0]
					if ('output' in output) {
						const chunk = output.output.find((c) => c.type === 'chunk')
						if (chunk?.type === 'chunk') {
							let workerCode = chunk.code

							if (sourceMapsBaseUrl) {
								const mapAsset = output.output.find(
									(c) => c.type === 'asset' && c.fileName.endsWith('.map'),
								)
								if (mapAsset?.type === 'asset') {
									const map = JSON.parse(
										/** @type {string} */ (mapAsset.source),
									)
									map.file = 'convenientDiscussions.worker.js'
									this.emitFile({
										type: 'asset',
										fileName: workerMapFileName,
										source: JSON.stringify(map),
									})
									workerCode = workerCode.replace(
										/\/\/#\s*sourceMappingURL=.*$/m,
										`//# sourceMappingURL=${sourceMapsBaseUrl + workerMapFileName}`,
									)
								}
							}

							workerCodeCache.set(workerPath, workerCode)

							return `export default ${JSON.stringify(workerCode)};`
						}
					}
				}
			} catch (error) {
				console.error('Failed to build worker:', error)
				throw error
			}

			throw new Error(`Failed to inline worker: ${workerPath}`)
		},
	}
}
