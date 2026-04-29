global.OO = {
	ui: new Proxy(
		{
			throttle: (fn) => fn,
		},
		{
			get: (target, prop) => {
				if (!(prop in target)) {
					target[prop] = class {}
				}

				return target[prop]
			},
		},
	),
	EventEmitter: class EventEmitter {
		on() {
			return this
		}

		once() {
			return this
		}

		off() {
			return this
		}

		emit() {
			return true
		}

		emitThrow() {
			return true
		}

		connect() {
			return this
		}

		disconnect() {
			return this
		}
	},
	initClass: () => {},
	mixinClass: () => {},
}

global.$ = () => ({
	on: () => {},
})

global.mw = {
	config: {
		/** @type {{ [key: string]: any }} */
		values: {},
		get: (/** @type {string} */ name) => mw.config.values[name],
		set: (/** @type {string} */ name, /** @type {any} */ value) => {
			mw.config.values[name] = value
		},
	},
	messages: {
		/** @type {{ [key: string]: string }} */
		values: {},
		get: (/** @type {string[]} | string */ ...args) => {
			if (Array.isArray(args[0])) {
				return args[0].reduce((obj, name) => {
					obj[name] = mw.messages.values[name]

					return obj
				}, {})
			}

			return mw.messages.values[args[0]]
		},
		set: (/** @type {string | { [key: string]: string }} */ name, /** @type {string} */ value) => {
			if (typeof name === 'object') {
				Object.assign(mw.messages.values, name)
			} else {
				mw.messages.values[name] = value
			}
		},
		exists: (/** @type {string} */ name) => name in mw.messages.values,
	},
	loader: {
		getState: () => {},
		require: () => ({}),
	},
	user: {
		options: {
			get: () => ({}),
		},
	},
	util: {
		escapeRegExp: (/** @type {string} */ str) =>
			str.replace(/[-[\]{}()*+!<=:?./\\^$|#\s,]/g, String.raw`\$&`),
		getUrl: (/** @type {string} */ page) => `/wiki/${encodeURIComponent(page)}`,
	},
	msg: (/** @type {string} */ name) => mw.messages.values[name] || name,
	Title: class Title {
		constructor(namespace, title) {
			this.namespace = namespace
			this.title = title
		}

		getNamespaceId() {
			return this.namespace
		}

		getMainText() {
			return this.title
		}

		getPrefixedText() {
			const namespaceNames = {
				0: '',
				2: 'User:',
				4: 'Wikipedia:',
				6: 'File:',
				10: 'Template:',
				12: 'Help:',
				14: 'Category:',
			}

			return (namespaceNames[this.namespace] || '') + this.title
		}

		static newFromText(name) {
			if (!name) return null

			// Parse namespace from the name
			let namespaceId = 0 // Main namespace by default
			let mainText = name

			// Handle leading colon
			if (name.startsWith(':')) {
				name = name.slice(1)
			}

			// Check for namespace prefix
			const colonIndex = name.indexOf(':')
			if (colonIndex !== -1) {
				const prefix = name.slice(0, colonIndex).toLowerCase()
				const namespaceMap = {
					template: 10,
					user: 2,
					wikipedia: 4,
					help: 12,
					category: 14,
					file: 6,
				}

				if (prefix in namespaceMap) {
					namespaceId = namespaceMap[prefix]
					mainText = name.slice(colonIndex + 1)
				} else {
					// Not a valid namespace, treat the whole thing as main text
					mainText = name
				}
			}

			// Capitalize first letter of main text
			if (mainText) {
				mainText = mainText.charAt(0).toUpperCase() + mainText.slice(1)
			}

			return new mw.Title(namespaceId, mainText)
		}
	},
}

const createProxy = (/** @type {string | symbol} */ name = '') => {
	const proxy = new Proxy(() => {}, {
		get: (target, prop) => {
			if (prop === 'then' || typeof prop === 'symbol') {
				return undefined
			}
			if (!(prop in target)) {
				target[prop] = createProxy(prop)
			}

			return target[prop]
		},
		apply: (target, thisArg, args) => {
			if (name === 's' || name === 'mws' || name === 'm' || name === 'i18n') {
				const msgKey = args[0]
				const result = mw.msg(msgKey)

				// process.stderr.write(`Proxy call: cd.${String(name)}("${msgKey}") -> "${result}"\n`)

				return result
			}

			return ''
		},
	})

	return proxy
}

global.convenientDiscussions = createProxy()
