/**
 * Helpers for class manipulation in OOUI.
 * Extracted from utils-oojs.js to avoid circular dependencies.
 *
 * @module utilsOojsClass
 */

/**
 * @typedef {object} OoJsClassSpecificProps
 * @property {OO.ConstructorLike} [parent] The parent constructor.
 * @property {OO.ConstructorLike} [super] The super constructor.
 * @property {AnyByKey} [static] An object containing static properties.
 */

/**
 * @typedef {Constructor & OoJsClassSpecificProps & AnyByKey} OoJsClassLike
 */

/**
 * Make a class conform to the structure used by OOjs' ES5-based classes, with its
 * {@link https://www.mediawiki.org/wiki/OOjs/Inheritance inheritance mechanism} and peculiar way to
 * store static properties. It partly replicates the operations made in
 * {@link https://doc.wikimedia.org/oojs/master/OO.html#.inheritClass OO.inheritClass}.
 *
 * @template {OoJsClassLike} T
 * @param {T} TargetClass
 * @returns {T}
 */
export function es6ClassToOoJsClass(TargetClass) {
	const OriginClass = Object.getPrototypeOf(TargetClass)
	if (OriginClass?.prototype) {
		TargetClass.parent = TargetClass.super = OriginClass
		OO.initClass(OriginClass)

		// Move prototype properties
		Object.getOwnPropertyNames(OriginClass.prototype)
			.filter((name) => name !== 'constructor' && !(name in TargetClass.prototype))
			.forEach((name) => {
				Object.defineProperty(
					TargetClass.prototype,
					name,
					/** @type {PropertyDescriptor} */ (
						Object.getOwnPropertyDescriptor(OriginClass.prototype, name)
					),
				)
			})
	}

	// Move static properties
	TargetClass.static = Object.create(OriginClass?.static || null)
	Object.keys(TargetClass)
		.filter((key) => !['parent', 'super', 'static'].includes(key))
		.forEach((key) => {
			const targetClassStatic = /** @type {AnyByKey} */ (TargetClass.static)
			targetClassStatic[key] = TargetClass[key]
		})

	return TargetClass
}

/**
 * Mix in a class into a target class.
 *
 * @template {Constructor} TBase
 * @template {Constructor} TMixin
 * @param {TBase} Base
 * @param {TMixin} Mixin
 * @returns {TBase & MixinType<TMixin>}
 */
export function mixInClass(Base, Mixin) {
	// eslint-disable-next-line jsdoc/require-jsdoc
	class Class extends Base {
		/**
		 * @param {any} args
		 */
		constructor(...args) {
			super(...args)

			if ('construct' in Mixin.prototype) {
				Mixin.prototype.construct.call(this)
			}
		}
	}
	OO.mixinClass(Class, Mixin)

	// for...in in OO.mixinClass doesn't catch prototype properties declared with the `class` syntax
	// (because they are not enumerable), so we set them manually. Alternatively, we could make them
	// enumerable in es6ClassToOoJsClass().
	Object.getOwnPropertyNames(Mixin.prototype)
		.filter((name) => name !== 'constructor')
		.forEach((name) => {
			Object.defineProperty(
				Class.prototype,
				name,
				/** @type {PropertyDescriptor} */ (Object.getOwnPropertyDescriptor(Mixin.prototype, name)),
			)
		})

	return /** @type {TBase & MixinType<TMixin>} */ (Class)
}

/**
 * Add a mixin's (e.g. {@link EventEmitter EventEmitter}) methods to an arbitrary object
 * itself (the static side), not its prototype.
 *
 * @template {{}} TBase
 * @template {Constructor} TMixin
 * @param {TBase} obj
 * @param {TMixin} Mixin
 * @returns {TBase & InstanceType<TMixin>}
 */
export function mixInObject(obj, Mixin) {
	// for...in in OO.mixinClass doesn't catch prototype properties declared with the `class` syntax
	// (because they are not enumerable), so we set them manually. Alternatively, we could make them
	// enumerable in es6ClassToOoJsClass().
	Object.getOwnPropertyNames(Mixin.prototype)
		.filter((name) => name !== 'constructor')
		.forEach((name) => {
			Object.defineProperty(
				obj,
				name,
				/** @type {PropertyDescriptor} */ (Object.getOwnPropertyDescriptor(Mixin.prototype, name)),
			)
		})

	// Run the mixin's constructor
	return /** @type {TBase & InstanceType<TMixin>} */ (Object.assign(obj, new Mixin()))
}
