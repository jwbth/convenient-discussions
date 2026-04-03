/**
 * @typedef {object} Config
 * @property {string} server
 * @property {WikiConfig} [default]
 * @property {WikiConfig} [staging]
 * @property {string} [protocol]
 * @property {string} [scriptPath]
 * @property {string} [articlePath]
 */

/**
 * @typedef {object} WikiConfig
 * @property {string} source
 * @property {string[]} targets
 * @property {boolean} [editGadgetsDefinition]
 * @property {string[]} [modules]
 * @property {string} [protocol]
 * @property {string} [scriptPath]
 */

export default {
	protocol: 'https',
	proxy: /** @type {string | undefined} */ (undefined),

	// No ending slash, as in mw.config.get('wgScriptPath')
	scriptPath: '/w',

	// With a placeholder, as in mw.config.get('wgArticlePath')
	articlePath: '/wiki/$1',

	main: {
		server: 'commons.wikimedia.org',

		// Root path for wiki pages of the script files. "/" is placed between it and the filenames.
		rootPath: 'User:Jack who built the house',

		// First file in the arrays is considered the main file. Commit subjects are added to the edit
		// summary only for this file.
		assets: {
			default: [
				'convenientDiscussions.js',
				'convenientDiscussions-main.js',
				'convenientDiscussions-main.js.LICENSE.js',
				'convenientDiscussions.css',
				'convenientDiscussions-generateBasicConfig.js',
				'convenientDiscussions.js.LICENSE.js',
				'convenientDiscussions-i18n/',
			],
			staging: [
				'convenientDiscussions.staging.js',
				'convenientDiscussions.staging.js.LICENSE.js',
				'convenientDiscussions-main.staging.js',
				'convenientDiscussions-main.staging.js.LICENSE.js',
				'convenientDiscussions.staging.css',
			],
		},
	},

	configs: /** @type {Config[]} */ ([
		{
			server: 'ru.wikipedia.org',
			default: {
				source: 'w-ru.js',
				targets: [
					'MediaWiki:Gadget-convenientDiscussions.js',
					'User:Jack who built the house/convenientDiscussions.js',
				],
				editGadgetsDefinition: true,
				modules: [
					'ext.CodeMirror.v6.WikiEditor',
					'ext.checkUser.styles',
					'ext.checkUser.userInfoCard',
					'ext.confirmEdit.CaptchaInputWidget',
					'jquery.client',
					'jquery.ui',
					'mediawiki.Title',
					'mediawiki.Uri',
					'mediawiki.api',
					'mediawiki.cookie',
					'mediawiki.interface.helpers.styles',
					'mediawiki.jqueryMsg',
					'mediawiki.notification',
					'mediawiki.storage',
					'mediawiki.user',
					'mediawiki.util',
					'mediawiki.widgets.visibleLengthLimit',
					'oojs',
					'oojs-ui-core',
					'oojs-ui-widgets',
					'oojs-ui-windows',
					'oojs-ui.styles.icons-alerts',
					'oojs-ui.styles.icons-content',
					'oojs-ui.styles.icons-editing-advanced',
					'oojs-ui.styles.icons-editing-citation',
					'oojs-ui.styles.icons-editing-core',
					'oojs-ui.styles.icons-interactions',
					'oojs-ui.styles.icons-movement',
					'user.options',
				],
			},
			staging: {
				source: 'w-ru.staging.js',
				targets: [
					'User:Jack who built the house/convenientDiscussions.staging.js',
				],
			},
		},
		{
			server: 'en.wikipedia.org',
			default: {
				source: 'w-en.js',
				targets: ['User:Jack who built the house/convenientDiscussions.js'],
			},
		},
		{
			server: 'fr.wikipedia.org',
			default: {
				source: 'w-fr.js',
				targets: ['User:Jack who built the house/convenientDiscussions.js'],
			},
		},
		{
			server: 'commons.wikimedia.org',
			default: {
				source: 'commons.js',
				targets: [
					'User:Jack who built the house/convenientDiscussions-commonsConfig.js',
				],
			},
		},
		{
			server: 'meta.wikimedia.org',
			default: {
				source: 'meta.js',
				targets: ['User:Jack who built the house/convenientDiscussions.js'],
			},
		},
		{
			server: 'www.mediawiki.org',
			default: {
				source: 'mw.js',
				targets: [
					'User:Jack who built the house/convenientDiscussions-mwConfig.js',
				],
			},
		},
	]),

	sourceMapsBaseUrl:
		'https://tools-static.wmflabs.org/convenient-discussions/source-maps/',
}
