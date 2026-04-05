import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vite'

import nonNullableConfig from './config.mjs'
import { inlineWorkerStringPlugin } from './vite-plugin-inline-worker-string.mjs'

/** @type {DeepPartial<typeof nonNullableConfig>} */
const cdConfig = nonNullableConfig

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/**
 * Custom plugin to prepend opening nowiki tag to the bundle, updating the source map to keep it
 * aligned.
 *
 * @param {string} bundleFilename
 * @returns {import('vite').Plugin}
 */
function prependNowikiPlugin(bundleFilename) {
	const bannerText = '/* <nowiki> */\n'
	const bannerLineCount = (bannerText.match(/\n/g) ?? []).length
	return {
		name: 'prepend-nowiki',
		apply: 'build',
		enforce: 'post',
		generateBundle(_options, bundle) {
			for (const [fileName, chunk] of Object.entries(bundle)) {
				if (chunk.type === 'chunk' && fileName === bundleFilename) {
					chunk.code = bannerText + chunk.code
					const mapChunk = bundle[`${fileName}.map`]
					if (
						mapChunk?.type === 'asset' &&
						typeof mapChunk.source === 'string'
					) {
						const map = JSON.parse(mapChunk.source)
						map.mappings = ';'.repeat(bannerLineCount) + map.mappings
						mapChunk.source = JSON.stringify(map)
					}
				}
			}
		},
	}
}

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
 * Custom plugin to preserve control character escape sequences in strings.
 *
 * @returns {import('vite').Plugin}
 */
function preserveControlEscapesPlugin() {
	return {
		name: 'preserve-control-escapes',
		apply: 'build',
		enforce: 'post',
		generateBundle(_options, bundle) {
			for (const chunk of Object.values(bundle)) {
				if (chunk.type === 'chunk' && chunk.code) {
					chunk.code = chunk.code.replace(
						/[\u0001-\u0004\u001F]/g,
						(match) =>
							`\\u${(match.codePointAt(0) || 0).toString(16).padStart(4, '0')}`,
					)
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
			const licensePattern = /@preserve|@license|@cc_on/i
			const commentPattern = /\/\*+\s*([\s\S]*?)\s*\*\//g
			const extractedLicenses = new Map()

			/**
			 * Generate banner text with the given URL.
			 *
			 * @param {string} url
			 * @returns {string}
			 */
			const generateBannerText = (url) =>
				url
					? `
 * For documentation and feedback, see the script's homepage:
 * https://commons.wikimedia.org/wiki/User:Jack_who_built_the_house/Convenient_Discussions
 *
 * For license information, see
 * ${url}
 `
					: ''

			let mainLicenseUrl = ''
			if (
				cdConfig.main?.server &&
				cdConfig.main.rootPath &&
				cdConfig.protocol &&
				cdConfig.articlePath
			) {
				mainLicenseUrl =
					cdConfig.protocol +
					'://' +
					cdConfig.main.server +
					cdConfig.articlePath.replace(
						'$1',
						cdConfig.main.rootPath + '/convenientDiscussions.js.LICENSE.js',
					)
			}
			const customBannerText = generateBannerText(mainLicenseUrl)

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

						// Replace license comments with blank lines to preserve line count,
						// keeping source map line numbers aligned.
						let modifiedCode = chunk.code
						for (const license of licenses) {
							modifiedCode = modifiedCode.replace(
								license,
								'\n'.repeat((license.match(/\n/g) ?? []).length),
							)
						}
						chunk.code = modifiedCode

						// Add license banner to main bundle
						if (!fileName.includes('worker') && customBannerText) {
							const bannerText = '/*' + customBannerText + '*/\n\n'
							chunk.code = bannerText + chunk.code
							const bannerLineCount = (bannerText.match(/\n/g) ?? []).length
							const mapChunk = bundle[`${fileName}.map`]
							if (
								mapChunk?.type === 'asset' &&
								typeof mapChunk.source === 'string'
							) {
								const map = JSON.parse(mapChunk.source)
								map.mappings = ';'.repeat(bannerLineCount) + map.mappings
								mapChunk.source = JSON.stringify(map)
							}
						}
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
						cdConfig.protocol &&
						cdConfig.articlePath
					) {
						licenseUrl =
							cdConfig.protocol +
							'://' +
							cdConfig.main.server +
							cdConfig.articlePath.replace(
								'$1',
								cdConfig.main.rootPath + '/' + licenseFileName,
							)
					}

					const customBanner = generateBannerText(licenseUrl)
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
			// Only apply to production/staging builds (not single)
			if (buildMode.isSingle) {
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
	} else if (isStaging) {
		filenamePostfix = '.staging'
	}

	return {
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

	// Environment variable defines for build-time replacement
	const defines = {
		IS_DEV: JSON.stringify(isDevServer),
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
		plugins.push(
			{
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
			},
			disableFullReloadPlugin(),
		)
	}

	plugins.push(buildNotificationPlugin(), preserveControlEscapesPlugin())

	if (!buildMode.isSingle) {
		plugins.push(
			// Append closing nowiki first so it ends up at the very bottom after all prepends
			appendNowikiPlugin(`${bundleFilename}.js`),
			// Extract licenses and add documentation banner
			licenseExtractionPlugin(buildMode),
			// Prepend opening nowiki last so it sits above the license banner
			prependNowikiPlugin(`${bundleFilename}.js`),
		)
	}

	// Add custom source map URL plugin for production/staging builds
	if (cdConfig.sourceMapsBaseUrl && !buildMode.isSingle) {
		plugins.push(
			customSourceMapUrlPlugin(cdConfig.sourceMapsBaseUrl, buildMode),
		)
	}

	// Remove empty JS file generated during the styles build
	if (process.env.VITE_BUILD_PART === 'styles') {
		/** @type {import('vite').Plugin} */
		const removeEmptyStylesPlugin = {
			name: 'remove-empty-styles-js',
			apply: 'build',
			enforce: 'post',
			generateBundle(_options, bundle) {
				for (const fileName of Object.keys(bundle)) {
					if (fileName.endsWith('.js') || fileName.endsWith('.js.map')) {
						delete bundle[fileName]
					}
				}
			},
		}
		plugins.push(removeEmptyStylesPlugin)
	}

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
			minify: 'oxc',

			// Source map configuration based on build mode
			sourcemap: buildMode.isSingle ? 'inline' : true,

			// Entry point and output configuration
			rollupOptions: {
				input: buildMode.isSingle
					? {
							[bundleFilename]: path.resolve(
								__dirname,
								'src/loader/startup.js',
							),
						}
					: process.env.VITE_BUILD_PART === 'loader'
						? {
								[bundleFilename]: path.resolve(
									__dirname,
									'src/loader/startup.js',
								),
							}
						: process.env.VITE_BUILD_PART === 'styles'
							? {
									'convenientDiscussions-styles': path.resolve(
										__dirname,
										'src/styles.less',
									),
								}
							: {
									[`convenientDiscussions-main${buildMode.filenamePostfix}`]:
										path.resolve(__dirname, 'src/app.js'),
								},

				output: {
					name:
						process.env.VITE_BUILD_PART === 'main'
							? 'convenientDiscussionsMain'
							: process.env.VITE_BUILD_PART === 'styles'
								? 'convenientDiscussionsStyles'
								: undefined,

					// Output filename with mode-specific postfix
					entryFileNames: '[name].js',

					// Asset filename for CSS
					assetFileNames: (assetInfo) => {
						if (
							assetInfo.name?.endsWith('.css') ||
							assetInfo.names?.some((n) => n.endsWith('.css'))
						) {
							return `${bundleFilename}.css`
						}

						return '[name].[ext]'
					},

					// Preserve comments for license extraction
					comments: true,

					// Module format (IIFE for browser global)
					format: 'iife',

					// Preserve class names for better debugging. We also use it in
					// getMixinBaseClassPrototype()
					keepNames: true,
				},
			},

			// Disable code splitting
			cssCodeSplit: false,

			// Disable performance hints (no warnings about chunk size)
			chunkSizeWarningLimit: Infinity,
		},

		// oxc configuration for JavaScript transformation
		oxc: {
			// Target ES2020 for browser compatibility
			target: 'es2020',

			// oxc natively supports all required transforms:
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
					sourcemap: buildMode.isSingle ? 'inline' : true,
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
