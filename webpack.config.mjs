import path from 'node:path';
import { fileURLToPath } from 'node:url';

import TerserPlugin from 'terser-webpack-plugin';
// eslint-disable-next-line import/no-named-as-default
import webpack from 'webpack';
import WebpackBuildNotifierPlugin from 'webpack-build-notifier';

import nonNullableConfig from './config.mjs';
import { getUrl } from './misc/utils.mjs';

/** @type {DeepPartial<typeof nonNullableConfig>} */
const cdConfig = nonNullableConfig;

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * @typedef {object} Environment
 * @property {boolean} dev
 * @property {boolean} staging
 * @property {boolean} single
 * @property {string} project
 * @property {string} lang
 */

const config = (/** @type {Environment} */ env) => {
	/**
	 * Production builds are created by running
	 * - npm run build
	 *
	 * Development builds are for debugging locally. Create them like this:
	 * - npm run start
	 *   - which runs `webpack serve --env dev`
	 * - npm run build --dev
	 *   - which runs `webpack` and sets the `dev` npm config variable.
	 *
	 * The first command will not create the files themselves but serve at the specified paths.
	 */
	const isDev = Boolean(env.dev || process.env.npm_config_dev);

	/**
	 * Staging builds are for creating a production build with files (main file and configuration
	 * file) having the .staging postfix. They are created by running
	 * - npm run build --staging
	 */
	const isStaging = Boolean(env.staging || process.env.npm_config_staging);

	/**
	 * Single builds include the main file, configuration and localization, as well as source maps, in
	 * a single file. Create them like this:
	 * - npm run single -- project=w lang=en
	 */
	const isSingle = Boolean(env.single || process.env.npm_config_single);

	let filenamePostfix = '';
	let lang;
	let wiki;
	if (isSingle) {
		const project = env.project || 'w';
		lang = env.lang || 'en';
		wiki = ['w', 'b', 'n', 'q', 's', 'v', 'voy', 'wikt'].includes(project)
			? `${project}-${lang}`
			: project;
		filenamePostfix = `.single.${wiki}`;
	} else if (isDev) {
		filenamePostfix = '.dev';
	} else if (isStaging) {
		filenamePostfix = '.staging';
	}
	const bundleFilename = `convenientDiscussions${filenamePostfix}.js`;

	if (!cdConfig.protocol || !cdConfig.main?.rootPath || !cdConfig.articlePath) {
		throw new Error('No protocol/server/root path/article path found in config.json5.');
	}

	let devtool;
	if (isSingle) {
		devtool = 'eval';
	} else if (isDev) {
		devtool = 'eval-source-map';
	} else {
		// SourceMapDevToolPlugin is used.
		devtool = false;
	}

	/** @type {import('webpack').WebpackPluginInstance[]} */
	const plugins = [
		new webpack.DefinePlugin({
			IS_STAGING: isStaging,
			IS_DEV: isDev,
			SINGLE_CONFIG_FILE_NAME: isSingle ? JSON.stringify(wiki) : undefined,
			SINGLE_LANG_CODE: isSingle ? JSON.stringify(lang) : undefined,
		}),
		new WebpackBuildNotifierPlugin({
			suppressSuccess: true,
			suppressWarning: true,
		}),
	];

	if (!isSingle) {
		// Top banner
		plugins.push(new webpack.BannerPlugin({
			banner: '<nowiki>',

			// Don't add the banner to the inline worker, otherwise the source maps for it won't work (I
			// think).
			test: bundleFilename,
		}),

		// Bottom banner. Use a custom plugin to append the closing nowiki tag
		{
			apply(compiler) {
				compiler.hooks.compilation.tap('AppendBannerPlugin', (compilation) => {
					compilation.hooks.processAssets.tap(
						{
							name: 'AppendBannerPlugin',
							stage: compilation.PROCESS_ASSETS_STAGE_ADDITIONS,
						},
						(assets) => {
							Object.keys(assets).forEach((filename) => {
								if (filename === filename.replace('.map.json', '') && filename.endsWith('.js')) {
									assets[filename] = new compiler.webpack.sources.RawSource(
										assets[filename].source().toString() + '\n/*! </nowiki> */'
									);
								}
							});
						}
					);
				});
			},
		});
	}

	if (!isDev && cdConfig.sourceMapsBaseUrl) {
		plugins.push(new webpack.SourceMapDevToolPlugin({
			filename: '[file].map.json',
			append: `\n//# sourceMappingURL=${cdConfig.sourceMapsBaseUrl}[url]`,
		}));
	}

	if (process.env.CI) {
		plugins.push(new webpack.ProgressPlugin());
	}

	return /** @type {import('webpack').Configuration} */ ({
		mode: isDev || isSingle ? 'development' : 'production',
		entry: './src/app.js',
		output: {
			path: path.resolve(__dirname, 'dist'),
			filename: bundleFilename,
		},
		resolve: {
			extensions: ['.js', '.json'],
		},
		performance: {
			hints: false,
		},
		devtool,
		module: {
			rules: [
				{
					test: /\.js$/,
					use: {
						loader: 'babel-loader',
					},
				},
				{
					test: /\.less$/,
					use: [
						'style-loader',
						{
							loader: 'css-loader',
							options: {
								url: {
									// Don't process URLs starting with /w/
									filter: (/** @type {string} */ url) => !url.startsWith('/w/'),
								},
							},
						},
						'less-loader',
					],
				},
				{
					test: /\bworker-gate\.js$/,
					use: {
						loader: 'worker-loader',
						options: {
							filename: `convenientDiscussions.worker${filenamePostfix}.js`,
							inline: 'no-fallback',
						},
					},
				},
			],
		},
		optimization: {
			// Less function calls when debugging, but one scope for all modules. To change this, `!dev`
			// could be used.
			concatenateModules: true,

			minimizer: [
				new TerserPlugin({
					terserOptions: {
						// This provides better debugging (more places where you can set a breakpoint) while
						// costing not so much size.
						compress: {
							// + 0.3% to the file size
							sequences: false,

							// + 1% to the file size
							conditionals: false,
						},

						format: {
							// Otherwise messes with \x01 \x02 \x03 \x04.
							ascii_only: true,

							comments: /^\**!/,
						},
						mangle: {
							keep_classnames: true,
							reserved: ['cd'],
						},
					},
					extractComments: {
						// Removed "\**!|" at the beginning to not extract the <nowiki> comment.
						condition: /@preserve|@license|@cc_on/i,

						filename: (/** @type {{ filename: string }} */ pathData) =>
							`${pathData.filename}.LICENSE.js`,

						banner: (licenseFile) => {
							const licenseUrl = getUrl(
								nonNullableConfig.main.server,
								nonNullableConfig.main.rootPath + '/' + licenseFile
							);

							return licenseFile.includes('worker')
							// A really messed up hack to include source maps for a web worker (works with
							// .map.json extension for webpack.SourceMapDevToolPlugin's `filename` property,
							// doesn't work with .map for some reason).
								? `//# sourceMappingURL=${nonNullableConfig.sourceMapsBaseUrl}convenientDiscussions.worker.js.map.json`

								: `
	* For documentation and feedback, see the script's homepage:
	* https://commons.wikimedia.org/wiki/User:Jack_who_built_the_house/Convenient_Discussions
	*
	* For license information, see
	* ${licenseUrl}
	`;
						},
					},
				}),
			],
		},
		plugins,
		devServer: {
			static: {
				directory: path.join(__dirname, 'dist'),
			},
			port: 9000,
			client: {
				webSocketURL: 'ws://localhost:9000/ws',
			},
			hot: 'only',
			liveReload: false,

			headers: {
				'Access-Control-Allow-Origin': '*',
				'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
				'Access-Control-Allow-Headers': 'X-Requested-With, content-type, Authorization',
			},

			// Fixes "GET https://localhost:9000/sockjs-node/info?t=... net::ERR_SSL_PROTOCOL_ERROR".
			allowedHosts: 'all',

			// For easier copypaste to use in a DevTools snippet (if can't load from 127.0.0.1:9000 for
			// some reason).
			// writeToDisk: single,
		},
	});
};
export default config;
