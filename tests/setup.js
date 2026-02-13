global.OO = {
	ui: new Proxy(
		{},
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

				process.stderr.write(`Proxy call: cd.${String(name)}("${msgKey}") -> "${result}"\n`)

				return result
			}

			return ''
		},
	})

	return proxy
}

global.convenientDiscussions = createProxy()
