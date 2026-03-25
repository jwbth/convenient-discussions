import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vite'

import nonNullableConfig from './config.mjs'
import { inlineWorkerStringPlugin } from './vite-plugin-inline-worker-string.mjs'

/** @type {DeepPartial<typeof nonNullableConfig>} */
const cdConfig = nonNullableConfig

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/**
 * Custom plugin to append closing nowiki tag to the bundle.
 *
 * @param {string} bundleFilename
 * @returns {import('vite').Plugin}
 */
function appendNowikiPlugin(bundleFilename) {
	return {
		name: 'append-nowiki',
		apply: 'build',
		enforce: 'post',
		generateBundle(_options, bundle) {
			// Only apply to the main bundle (not worker)
			for (const [fileName, chunk] of Object.entries(bundle)) {
				if (chunk.type === 'chunk' && fileName === bundleFilename) {
					chunk.code = chunk.code + '\n/* </nowiki> */'
				}
			}
		},
	}
}

/**
 * Custom plugin to extract license comments to separate files.
 *
 * @param {BuildMode} buildMode
 * @returns {import('vite').Plugin}
 */
function licenseExtractionPlugin(buildMode) {
	return {
		name: 'license-extraction',
		apply: 'build',
		enforce: 'post',
		generateBundle(_options, bundle) {
			// Only apply to production/staging builds (not dev or single)
			if (buildMode.isDev || buildMode.isSingle) {
				return
			}

			const licensePattern = /@preserve|@license|@cc_on/i
			const commentPattern = /\/\*!?\s*([\s\S]*?)\s*\*\//g
			const extractedLicenses = new Map()

			// Extract licenses from all chunks
			for (const [fileName, chunk] of Object.entries(bundle)) {
				if (chunk.type === 'chunk' && fileName.endsWith('.js')) {
					const licenses = []
					let match

					// Find all comments that match the license pattern
					while ((match = commentPattern.exec(chunk.code)) !== null) {
						const commentContent = match[1]
						if (licensePattern.test(commentContent)) {
							licenses.push(match[0])
						}
					}

					if (licenses.length > 0) {
						extractedLicenses.set(fileName, licenses)

						// Remove license comments from the source code
						let modifiedCode = chunk.code
						for (const license of licenses) {
							modifiedCode = modifiedCode.replace(license, '')
						}
						chunk.code = modifiedCode
					}
				}
			}

			// Generate LICENSE files
			for (const [fileName, licenses] of extractedLicenses.entries()) {
				/** @type {string} */
				const fileNameStr = fileName
				const licenseFileName = fileNameStr + '.LICENSE.js'
				/** @type {string} */
				let licenseContent = licenses.join('\n\n')

				// Add custom banner based on file type
				if (fileNameStr.includes('worker')) {
					// For worker files, add source map URL
					if (cdConfig.sourceMapsBaseUrl) {
						const sourceMapUrl =
							cdConfig.sourceMapsBaseUrl + 'convenientDiscussions.worker.js.map'
						licenseContent =
							'//# sourceMappingURL=' + sourceMapUrl + '\n\n' + licenseContent
					}
				} else {
					// For main bundle, add documentation banner
					let licenseUrl = ''
					if (
						cdConfig.main?.server &&
						cdConfig.main.rootPath &&
						cdConfig.protocol
					) {
						licenseUrl =
							cdConfig.protocol +
							'://' +
							cdConfig.main.server +
							cdConfig.main.rootPath +
							'/' +
							licenseFileName
					}

					const customBanner =
						"\n  * For documentation and feedback, see the script's homepage:\n  * https://commons.wikimedia.org/wiki/User:Jack_who_built_the_house/Convenient_Discussions\n  *\n  * For license information, see\n  * " +
						licenseUrl +
						'\n  '
					licenseContent = '/*' + customBanner + '*/\n\n' + licenseContent
				}

				// Emit the license file
				this.emitFile({
					type: 'asset',
					fileName: licenseFileName,
					source: licenseContent,
				})
			}
		},
	}
}

/**
 * Custom plugin to disable full page reload on HMR failure.
 *
 * @returns {import('vite').Plugin}
 */
function disableFullReloadPlugin() {
	return {
		name: 'disable-full-reload',
		configureServer(server) {
			const hot = server.hot || server.ws
			const originalSend = hot.send
			hot.send = function (payload, ...args) {
				if (
					typeof payload === 'object' &&
					payload !== null &&
					payload.type === 'full-reload'
				) {
					return
				}

				return Reflect.apply(originalSend, this, [payload, ...args])
			}
		},
	}
}

/**
 * Custom plugin for build notifications. Matches webpack-build-notifier behavior: suppress success
 * and warning notifications, only show errors (unless it's the first successful build after an
 * error).
 *
 * @returns {import('vite').Plugin}
 */
function buildNotificationPlugin() {
	let lastBuildFailed = false

	return {
		name: 'build-notification',
		buildEnd(error) {
			if (error) {
				// Build failed - show error notification
				console.error('\n❌ Build failed with errors:\n', error)
				lastBuildFailed = true
			} else if (lastBuildFailed) {
				// First successful build after an error - show success notification
				console.log('\n✅ Build succeeded after previous error\n')
				lastBuildFailed = false
			}
			// Otherwise, suppress success notifications (matching webpack-build-notifier behavior)
		},
		buildStart() {
			// Reset error state at the start of each build
			// (lastBuildFailed is preserved across builds to track state)
		},
	}
}

/**
 * Custom plugin to inject custom source map URL.
 *
 * @param {string} baseUrl
 * @param {BuildMode} buildMode
 * @returns {import('vite').Plugin}
 */
function customSourceMapUrlPlugin(baseUrl, buildMode) {
	return {
		name: 'custom-sourcemap-url',
		apply: 'build',
		enforce: 'post',
		generateBundle(_options, bundle) {
			// Only apply to production/staging builds (not dev or single)
			if (buildMode.isDev || buildMode.isSingle) {
				return
			}

			for (const [fileName, chunk] of Object.entries(bundle)) {
				if (chunk.type === 'chunk' && fileName.endsWith('.js')) {
					const mapFileName = `${fileName}.map`

					// Check if source map exists
					if (mapFileName in bundle) {
						// Replace the default sourceMappingURL comment with custom URL
						const customUrl = `${baseUrl}${mapFileName}`
						chunk.code = chunk.code.replace(
							/\/\/# sourceMappingURL=.*$/m,
							`//# sourceMappingURL=${customUrl}`,
						)
					}
				}
			}
		},
	}
}

/**
 * @typedef {object} BuildMode
 * @property {boolean} isDev
 * @property {boolean} isStaging
 * @property {boolean} isSingle
 * @property {string} [project]
 * @property {string} [lang]
 * @property {string} [wiki]
 * @property {string} filenamePostfix
 */

/**
 * Determine the build mode from environment variables.
 *
 * @param {NodeJS.ProcessEnv} env
 * @param {string} mode
 * @returns {BuildMode}
 */
function determineBuildMode(env, mode) {
	const isDev = Boolean(env.VITE_DEV || mode === 'development')
	const isStaging = Boolean(env.VITE_STAGING || mode === 'staging')
	const isSingle = Boolean(env.VITE_SINGLE || mode === 'single')

	let filenamePostfix = ''
	let lang
	let wiki
	let project

	if (isSingle) {
		project = env.VITE_PROJECT || 'w'
		lang = env.VITE_LANG || 'en'
		wiki = ['w', 'b', 'n', 'q', 's', 'v', 'voy', 'wikt'].includes(project)
			? `${project}-${lang}`
			: project
		filenamePostfix = `.single.${wiki}`
	} else if (isDev) {
		filenamePostfix = '.dev'
	} else if (isStaging) {
		filenamePostfix = '.staging'
	}

	return {
		isDev,
		isStaging,
		isSingle,
		project,
		lang,
		wiki,
		filenamePostfix,
	}
}

export default defineConfig(({ mode, command }) => {
	const buildMode = determineBuildMode(process.env, mode)
	const bundleFilename = `convenientDiscussions${buildMode.filenamePostfix}`

	if (!cdConfig.protocol || !cdConfig.main?.rootPath || !cdConfig.articlePath) {
		throw new Error(
			'No protocol/server/root path/article path found in config.json5.',
		)
	}

	// For dev server (serve command), always use dev mode settings
	const isDevServer = command === 'serve'
	const effectiveIsDev = isDevServer || buildMode.isDev

	// Environment variable defines for build-time replacement
	const defines = {
		IS_DEV: JSON.stringify(effectiveIsDev),
		IS_STAGING: JSON.stringify(buildMode.isStaging),
		IS_SINGLE: JSON.stringify(buildMode.isSingle),
		SINGLE_CONFIG_FILE_NAME:
			buildMode.isSingle && buildMode.wiki
				? JSON.stringify(buildMode.wiki)
				: 'undefined',
		SINGLE_LANG_CODE:
			buildMode.isSingle && buildMode.lang
				? JSON.stringify(buildMode.lang)
				: 'undefined',
		CACHE_BUSTER: JSON.stringify(generateRandomId()),
	}

	const plugins = []

	// Add inline worker string plugin (must be early in pipeline)
	plugins.push(inlineWorkerStringPlugin())

	// Add define plugin for dev server (Vite's define only works in build mode)
	if (isDevServer) {
		plugins.push({
			name: 'define-env-vars',
			/**
			 * @param {string} code
			 * @param {string} id
			 * @returns {string | undefined}
			 */
			transform(code, id) {
				if (id.includes('node_modules')) return

				// Replace environment defines in source code
				let transformedCode = code
				for (const [key, value] of Object.entries(defines)) {
					const regex = new RegExp(`\\b${key}\\b`, 'g')
					transformedCode = transformedCode.replace(regex, value)
				}

				return transformedCode === code ? undefined : transformedCode
			},
		})

		plugins.push(disableFullReloadPlugin())
	}

	plugins.push(buildNotificationPlugin())

	// // Add nowiki banner plugins for non-single builds
	// if (!buildMode.isSingle) {
	//   // Top banner - prepend /* <nowiki> */
	//   // Bottom banner - append /* </nowiki> */
	//   plugins.push(
	//     banner({
	//       content: '/* <nowiki> */',
	//       verify: false,
	//     }),
	//     appendNowikiPlugin(`${bundleFilename}.js`)
	//   );
	// }

	// Add license extraction plugin for production/staging builds
	if (!buildMode.isDev && !buildMode.isSingle) {
		// plugins.push(licenseExtractionPlugin(buildMode));
	}

	// Add custom source map URL plugin for production/staging builds
	// if (cdConfig.sourceMapsBaseUrl && !buildMode.isDev && !buildMode.isSingle) {
	//   plugins.push(customSourceMapUrlPlugin(cdConfig.sourceMapsBaseUrl, buildMode));
	// }

	return {
		plugins,
		define: defines,
		// Disable public directory to avoid conflicts with outDir
		publicDir: false,
		build: {
			// Output directory
			outDir: 'dist',

			// Don't clean dist folder - configs and i18n are built separately before Vite
			emptyOutDir: false,

			// Target browsers using browserslist (ES2020 supports all required transforms)
			target: 'es2020',

			// Minification configuration
			minify: effectiveIsDev ? false : 'esbuild',

			// esbuild minification options
			esbuildOptions: {
				// Preserve class names for better debugging
				keepNames: true,

				// ASCII-only output
				charset: 'ascii',

				// Minify options
				minifyIdentifiers: true,
				minifySyntax: true,
				minifyWhitespace: true,

				// Reserve 'cd' identifier from mangling
				// Note: esbuild doesn't support property mangling with reserved lists like Terser
				// The 'cd' global is preserved by using IIFE format which doesn't mangle globals
			},

			// Terser minification options
			terserOptions: {
				compress: {
					passes: 2,
				},
				mangle: {
					// Reserve 'cd' identifier from mangling
					reserved: ['cd'],
				},
				format: {
					// ASCII-only output
					ascii_only: true,
					// Preserve comments with @license or @preserve
					comments: /@license|@preserve|@cc_on/i,
				},
			},

			// Source map configuration based on build mode
			sourcemap: buildMode.isSingle
				? 'inline'
				: buildMode.isDev
					? 'inline'
					: true,

			// Entry point and output configuration
			rollupOptions: {
				input: {
					[bundleFilename]: path.resolve(__dirname, 'src/loader/startup.js'),
					'convenientDiscussions-styles': path.resolve(
						__dirname,
						'src/styles.less',
					),
				},
				output: {
					// Output filename with mode-specific postfix
					entryFileNames: '[name].js',

					// Asset filename for CSS
					assetFileNames: (assetInfo) => {
						if (
							assetInfo.name?.endsWith('.css') ||
							assetInfo.names?.some((n) => n.endsWith('.css'))
						) {
							return `${bundleFilename}-styles.css`
						}

						return '[name].[ext]'
					},

					// Chunk filename for dynamic imports
					chunkFileNames: `${bundleFilename}-[name].js`,

					// Module format (IIFE for browser global)
					// format: 'iife',

					// Inline all dynamic imports for production, allow code splitting for dev
					inlineDynamicImports: false,

					// Enable module concatenation (hoisting transitive imports)
					// hoistTransitiveImports: true,
				},

				// Tree-shaking is enabled by default in Rollup/Vite
				treeshake: true,
			},

			// Disable code splitting
			cssCodeSplit: false,

			// Disable performance hints (no warnings about chunk size)
			chunkSizeWarningLimit: Infinity,
		},

		// esbuild configuration for JavaScript transformation
		esbuild: {
			// Target ES2020 for browser compatibility
			target: 'es2020',

			// esbuild natively supports all required transforms:
			// - class properties
			// - class static blocks
			// - logical assignment operators
			// - nullish coalescing
			// - optional catch binding
			// - optional chaining
			// - numeric separators
		},

		// CSS preprocessing configuration
		css: {
			preprocessorOptions: {
				less: {
					// Less-specific options can be added here if needed
				},
			},
			postcss: {
				plugins: [
					{
						postcssPlugin: 'filter-mediawiki-urls',
						Declaration(decl) {
							// Filter out URLs starting with /w/ (MediaWiki paths)
							// Note: Vite's CSS processing automatically handles URL filtering
							// This plugin serves as a placeholder for any custom URL filtering logic
							if (
								(decl.prop.includes('url') || decl.value.includes('url(')) &&
								decl.value.match(/url\(['"]?\/w\/[^'"()]+['"]?\)/)
							) {
								// URLs starting with /w/ are MediaWiki paths and should not be processed
								// Vite will leave them as-is by default
							}
						},
					},
				],
			},
		},

		// Module resolution
		resolve: {
			extensions: ['.js', '.json'],
		},

		// Worker configuration
		worker: {
			format: 'iife',

			// Worker source maps follow the same strategy as the main bundle. When inlined
			// (?worker&inline), the worker code becomes part of the main bundle and shares the same
			// source map.
			rollupOptions: {
				output: {
					// Worker filename with mode-specific postfix
					entryFileNames: `convenientDiscussions.worker${buildMode.filenamePostfix}.js`,

					// Source maps for workers (when not inlined)
					sourcemap: buildMode.isSingle
						? 'inline'
						: buildMode.isDev
							? 'inline'
							: true,
				},
			},
		},

		// Development server configuration (for HMR with npm run start)
		server: {
			// Port configuration
			port: 9000,

			// CORS headers for cross-origin development access
			cors: {
				origin: '*',
				methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
				allowedHeaders: ['*'],
			},

			// HMR configuration
			hmr: {
				// WebSocket configuration for hot module replacement
				protocol: 'ws',
				host: 'localhost',
				port: 9000,
				overlay: false,
			},

			// Don't open browser automatically
			open: false,

			// Static file serving
			fs: {
				// Allow serving files from outside root if needed
				strict: false,
			},

			// File watching configuration
			watch: {
				// Watch source files for changes
				ignored: ['**/node_modules/**', '**/dist/**'],
			},
		},

		// Preview server configuration (for production builds)
		preview: {
			port: 9000,
			cors: {
				origin: '*',
			},
		},
	}
})

/**
 * Generate an 8-character random ID.
 *
 * @returns {string}
 */
function generateRandomId() {
	return Math.random().toString(36).substring(2, 10)
}
