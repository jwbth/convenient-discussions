import CdError from './shared/CdError'
import { spacesToUnderlines } from './shared/utils-general'

/**
 * @typedef {object} ApiResponseQuerySiteinfoNamespace
 * @property {number} id
 * @property {string} name
 * @property {string} [canonical]
 * @property {'first-letter'|'case-sensitive'} case
 * @property {boolean} subpages
 * @property {boolean} content
 */

/**
 * @typedef {object} ApiResponseQuerySiteinfoParams
 * @property {{ namespaces: Record<string, ApiResponseQuerySiteinfoNamespace>, namespacealiases: { id: number, alias: string }[] }} [query]
 */

/**
 * @typedef {object} HostData
 * @property {Record<number, string>} formattedNamespaces
 * @property {Record<string, number>} namespaceIds
 * @property {number[]} caseSensitiveNamespaces
 * @property {number[]} contentNamespaces
 */

export default class CrossSiteMwTitle extends mw.Title {
	/**
	 * @type {Record<string, HostData>}
	 */
	static hostData = {
		// We can't call super.method() on private methods so we better just refer to
		// .hostData[hostname] for the current hostname as well.
		[mw.config.get('wgServerName')]: {
			formattedNamespaces: mw.config.get('wgFormattedNamespaces'),
			namespaceIds: mw.config.get('wgNamespaceIds'),
			caseSensitiveNamespaces: mw.config.get('wgCaseSensitiveNamespaces'),
			contentNamespaces: mw.config.get('wgContentNamespaces'),
		},
	}

	/** @type {Map<string, JQuery.Promise<void>>} */
	static hostDataPromises = new Map()

	/** @type {{ charAt: (string: string, offset: number, backwards?: boolean) => string }} */
	static mwString = mw.loader.require('mediawiki.String')

	/** @type {number} */
	namespace = this.namespace

	/** @type {string} */
	title = this.title

	/** @type {string} */
	hostname = this.hostname

	/**
	 * @param {string} title
	 * @param {number} [namespace]
	 * @param {string} [hostname]
	 */
	constructor(title, namespace, hostname = mw.config.get('wgServerName')) {
		const originalNamespaceIds = mw.config.get('wgNamespaceIds')

		if (hostname !== mw.config.get('wgServerName')) {
			if (!(hostname in CrossSiteMwTitle.hostData)) {
				throw new Error(
					`Use CrossSiteMwTitle.loadHostData(hostname) to load the host data before creating an instance.`,
				)
			}

			// A hack to temporarily replace wgNamespaceIds while we're running this constructor
			mw.config.set('wgNamespaceIds', CrossSiteMwTitle.hostData[hostname].namespaceIds)
		}
		try {
			super(title, namespace)
		} finally {
			mw.config.set('wgNamespaceIds', originalNamespaceIds)
		}

		this.hostname = hostname
	}

	/**
	 * @param {number} namespace
	 * @param {string} [hostname]
	 * @returns {boolean}
	 */
	static isKnownNamespace(namespace, hostname = mw.config.get('wgServerName')) {
		return namespace === 0 || namespace in this.hostData[hostname].formattedNamespaces
	}

	/**
	 * Get the host data for a given hostname. The hostname must have been loaded via
	 * {@link loadHostData} first.
	 *
	 * @param {string} [hostname]
	 * @returns {HostData}
	 */
	static getHostData(hostname = mw.config.get('wgServerName')) {
		return this.hostData[hostname]
	}

	/**
	 * @param {number} namespace
	 * @param {string} [hostname]
	 * @returns {string}
	 */
	static getNamespacePrefix(namespace, hostname = mw.config.get('wgServerName')) {
		return namespace === 0
			? ''
			: this.hostData[hostname].formattedNamespaces[namespace].replace(/ /g, '_') + ':'
	}

	/**
	 * @param {string} title
	 * @param {number} [namespace]
	 * @param {string} [hostname]
	 * @returns {JQuery.Promise<CrossSiteMwTitle|null>}
	 */
	static getInstancePromise(title, namespace, hostname = mw.config.get('wgServerName')) {
		return this.loadHostData(hostname).then(() => this.newFromText(title, namespace, hostname))
	}

	/**
	 * @param {string} hostname
	 * @param {mw.ForeignApi} [api]
	 * @returns {JQuery.Promise<void>}
	 */
	static loadHostData(hostname, api) {
		if (hostname === mw.config.get('wgServerName')) {
			return $.Deferred().resolve().promise()
		}

		// Return a successful or pending promise if any. Don't keep failed promises.
		if (!this.hostDataPromises.has(hostname)) {
			const wgScriptPath = mw.config.get('wgScriptPath')
			const promise = (api || new mw.ForeignApi(`https://${hostname}${wgScriptPath}/api.php`))
				.get({
					action: 'query',
					meta: 'siteinfo',
					siprop: ['namespaces', 'namespacealiases'],
					formatversion: 2,
				})
				.then(
					/** @param {ApiResponseQuerySiteinfoParams} resp */ (resp) => {
						const { query } = resp
						if (!query || !('namespaces' in query) || !('namespacealiases' in query)) {
							throw new CdError()
						}
						this.hostData[hostname] = {
							formattedNamespaces: Object.values(query.namespaces).reduce((obj, value) => {
								obj[value.id] = value.name

								return obj
							}, /** @type {HostData['formattedNamespaces']} */ ({})),
							namespaceIds: {
								...Object.values(query.namespaces).reduce((obj, value) => {
									obj[spacesToUnderlines(value.name.toLowerCase())] = value.id
									if (value.canonical) {
										obj[spacesToUnderlines(value.canonical.toLowerCase())] = value.id
									}

									return obj
								}, /** @type {HostData['namespaceIds']} */ ({})),
								...query.namespacealiases.reduce((obj, alias) => {
									obj[alias.alias.toLowerCase()] = alias.id

									return obj
								}, /** @type {HostData['namespaceIds']} */ ({})),
							},
							caseSensitiveNamespaces: Object.values(query.namespaces)
								.filter((value) => value.case === 'case-sensitive')
								.map((value) => value.id),
							contentNamespaces: Object.values(query.namespaces)
								.filter((value) => value.content)
								.map((value) => value.id),
						}
					},
				)
			promise.catch(() => {
				this.hostDataPromises.delete(hostname)
			})
			this.hostDataPromises.set(hostname, promise)
		}

		return this.hostDataPromises.get(hostname)
	}

	/**
	 * @param {string} title
	 * @param {number} [namespace]
	 * @param {string} [hostname]
	 * @returns {JQuery.Promise<boolean>}
	 */
	static isTitleValid(title, namespace, hostname = mw.config.get('wgServerName')) {
		// Consider the title valid if we have no internet connection as well
		return this.getInstancePromise(title, namespace, hostname).then(Boolean, () => true)
	}

	/**
	 * @override
	 * @param {string} title
	 * @param {number} [namespace]
	 * @param {string} [hostname]
	 * @returns {CrossSiteMwTitle|null}
	 */
	static newFromText(title, namespace, hostname) {
		let instance
		try {
			instance = new this(title, namespace, hostname)
		} catch {
			return null
		}

		return instance
	}

	/**
	 * @override
	 * @param {number} namespace
	 * @param {string} title
	 * @param {string} [hostname]
	 * @returns {CrossSiteMwTitle|null}
	 */
	static makeTitle(namespace, title, hostname = mw.config.get('wgServerName')) {
		return this.isKnownNamespace(namespace, hostname)
			? this.newFromText(this.getNamespacePrefix(namespace, hostname) + title, undefined, hostname)
			: null
	}

	// Can't inherit the methods below, because mw.Title has the class name hardcoded 😬

	/**
	 * @override
	 * @returns {null}
	 */
	static newFromUserInput() {
		this.doesntWork()

		return null
	}

	/**
	 * @override
	 * @returns {null}
	 */
	static newFromFileName() {
		this.doesntWork()

		return null
	}

	/**
	 * @override
	 * @returns {null}
	 */
	static newFromImg() {
		this.doesntWork()

		return null
	}

	/**
	 * @override
	 * @returns {null}
	 */
	static exists() {
		this.doesntWork()

		return null
	}

	// This would require mw.config.get('wgExtraSignatureNamespaces') for the remote hostname which we
	// can't get via the API
	/**
	 * @returns {void}
	 */
	static wantSignaturesNamespace() {
		this.doesntWork()
	}

	/**
	 * @returns {void}
	 */
	static doesntWork() {
		console.warn(`This method doesn\`t work in the ${this.name} subclass.`)
	}

	/**
	 * @returns {string}
	 */
	getHostname() {
		return this.hostname
	}

	/**
	 * @override
	 * @returns {string}
	 */
	getNamespacePrefix() {
		return this.constructor.getNamespacePrefix(this.namespace, this.hostname)
	}

	/**
	 * @override
	 * @returns {string}
	 */
	getMain() {
		if (
			this.constructor.hostData[this.hostname].caseSensitiveNamespaces.includes(this.namespace) ||
			!this.title.length
		) {
			return this.title
		}
		const firstChar = this.constructor.mwString.charAt(this.title, 0)

		return mw.Title.phpCharToUpper(firstChar) + this.title.slice(firstChar.length)
	}

	/**
	 * @override
	 * @param {import('types-mediawiki/mw/Uri').QueryParams} [params]
	 * @returns {string}
	 */
	getUrl(params) {
		return this.hostname === mw.config.get('wgServerName')
			? super.getUrl(params)
			: 'https://' + this.hostname + super.getUrl(params)
	}

	/**
	 * @override
	 * @returns {CrossSiteMwTitle|null}
	 */
	getTalkPage() {
		if (!this.canHaveTalkPage()) {
			return null
		}

		return this.isTalkPage()
			? this
			: this.constructor.makeTitle(
					this.getNamespaceId() + 1,
					this.getMainText(),
					this.getHostname(),
				)
	}

	/**
	 * @override
	 * @returns {CrossSiteMwTitle|null}
	 */
	getSubjectPage() {
		return this.isTalkPage()
			? this.constructor.makeTitle(
					this.getNamespaceId() - 1,
					this.getMainText(),
					this.getHostname(),
				)
			: this
	}

	/**
	 * @override
	 * @returns {null}
	 */
	exists() {
		this.constructor.doesntWork()

		return null
	}

	/**
	 * @returns {boolean}
	 */
	isContentNamespace() {
		return this.constructor.hostData[this.hostname].contentNamespaces.includes(this.namespace)
	}
}
