/* eslint-disable jsdoc/valid-types */
import { es6ClassToOoJsClass } from './utils-oojs-class'

/**
 * @template {{ [key: string]: OO.ArgTuple }} [EventMap = { [key: string]: OO.ArgTuple }]
 */
export default class EventEmitter extends OO.EventEmitter {
	/**
	 * Initialize the mixin.
	 *
	 * @this {EventEmitter & OO.EventEmitter}
	 */
	construct() {
		// For the Comment class where EventEmitter is used as a mixin
		OO.EventEmitter.call(this)
	}

	/**
	 * @template {keyof EventMap} K
	 * @template {any[]} [A=[]]
	 * @template [C=null]
	 * @overload
	 * @param {K} event
	 * @param {OO.EventHandler<C, (this: C, ...args: [...A, ...EventMap[K]]) => void>} method
	 * @param {A} [args]
	 * @param {C} [context]
	 * @returns {this}
	 */
	/**
	 * @template {string} K
	 * @template [C=null]
	 * @overload
	 * @param {K extends keyof EventMap ? never : K} event
	 * @param {OO.EventHandler<C>} method
	 * @param {any[]} [args]
	 * @param {C} [context]
	 * @returns {this}
	 */
	/**
	 * Add a listener to events of a specific event.
	 *
	 * The listener can be a function or the string name of a method; if the latter, then the name
	 * lookup happens at the time the listener is called.
	 *
	 * @template [C=null]
	 * @param {string} event Type of event to listen to.
	 * @param {OO.EventHandler<C>} method Function or method name to call when event occurs.
	 * @param {any[]} [args] Arguments to pass to listener, will be prepended to emitted arguments.
	 * @param {C} [context] Context object for function or method call.
	 * @returns {this}
	 * @throws {Error} Listener argument is not a function or a valid method name.
	 * @override
	 */
	on(event, method, args, context) {
		return super.on(event, method, args, context)
	}

	/**
	 * @template {keyof EventMap} K
	 * @overload
	 * @param {K} event
	 * @param {(this: null, ...args: EventMap[K]) => void} listener
	 * @returns {this}
	 */
	/**
	 * @template {string} K
	 * @overload
	 * @param {K extends keyof EventMap ? never : K} event
	 * @param {(this: null, ...args: any[]) => void} listener
	 * @returns {this}
	 */
	/**
	 * Add a one-time listener to a specific event.
	 *
	 * @param {string} event Type of event to listen to.
	 * @param {(this: null, ...args: EventMap[K]) => void} listener Listener to call when event
	 *   occurs.
	 * @returns {this}
	 * @override
	 */
	once(event, listener) {
		return super.once(event, listener)
	}

	/**
	 * @template {keyof EventMap} K
	 * @template [C=null]
	 * @overload
	 * @param {K} event The event name.
	 * @param {OO.EventHandler<C, (this: C, ...args: EventMap[K]) => void>} [method]
	 * @param {C} [context]
	 * @returns {this}
	 */
	/**
	 * @template {string} K
	 * @template [C=null]
	 * @overload
	 * @param {K extends keyof EventMap ? never : K} event
	 * @param {OO.EventHandler<C>} [method]
	 * @param {C} [context]
	 * @returns {this}
	 */
	/**
	 * Remove a specific listener from a specific event.
	 *
	 * @template C
	 * @param {string} event Type of event to remove the listener from.
	 * @param {OO.EventHandler<C>} [method] Listener to remove. Must be in the same form as was passed
	 *   to {@link on()}. Omit to remove all listeners.
	 * @param {C} [context] Context object for the function or method call.
	 * @throws {Error} Listener argument is not a function or a valid method name.
	 * @returns {this}
	 * @override
	 */
	off(event, method, context) {
		return super.off(event, method, context)
	}

	// @ts-expect-error: TypeScript-in-JSDoc bug
	// eslint-disable-next-line jsdoc/multiline-blocks
	/** @template {keyof EventMap} K @overload
	 * @param {K} event Thse event name.
	 * @param {...EventMap[K]} args Arguments to pass to the listeners.
	 * @returns {boolean}
	 */
	/**
	 * @template {string} K
	 * @overload
	 * @param {K extends keyof EventMap ? never : K} event The event name.
	 * @param {...any[]} args Arguments to pass to the listeners.
	 * @returns {boolean}
	 */
	/**
	 * Emit an event.
	 *
	 * All listeners for the event will be called synchronously, in an unspecified order. If any
	 * listeners throw an exception, this won't disrupt the calls to the remaining listeners; however,
	 * the exception won't be thrown until the next tick.
	 *
	 * Listeners should avoid mutating the emitting object, as this is an anti-pattern that can result
	 * in hard-to-understand code with hidden side-effects and dependencies.
	 *
	 * @param {string} event Type of event.
	 * @param {...any[]} args Arguments passed to the event handler.
	 * @returns {boolean} Whether the event was handled by at least one listener.
	 * @override
	 */
	emit(event, ...args) {
		return super.emit(event, ...args)
	}

	// @ts-expect-error: TypeScript-in-JSDoc bug
	// eslint-disable-next-line jsdoc/multiline-blocks
	/** @template {keyof EventMap} K @overload
	 * @param {K} event
	 * @param {...EventMap[K]} args
	 * @returns {boolean}
	 */
	/**
	 * @template {string} K
	 * @overload
	 * @param {K extends keyof EventMap ? never : K} event
	 * @param {any[]} args
	 * @returns {boolean}
	 */
	/**
	 * Emit an event, propagating the first exception some listener throws.
	 *
	 * All listeners for the event will be called synchronously, in an unspecified order. If any
	 * listener throws an exception, this won't disrupt the calls to the remaining listeners. The
	 * first exception thrown will be propagated back to the caller; any others won't be thrown until
	 * the next tick.
	 *
	 * Listeners should avoid mutating the emitting object, as this is an anti-pattern that can result
	 * in hard-to-understand code with hidden side-effects and dependencies.
	 *
	 * @param {string} event Type of event.
	 * @param {...any[]} args Arguments passed to the event handler.
	 * @returns {boolean} Whether the event was handled by at least one listener.
	 * @override
	 */
	emitThrow(event, ...args) {
		return super.emitThrow(event, ...args)
	}

	/**
	 * Connect event handlers to an object.
	 *
	 * @template {Partial<{ [key in keyof EventMap]: any }>} T
	 * @template C
	 * @param {C} context Object to call methods on when events occur.
	 * @param {OO.EventConnectionMap<T, C, EventMap>} methods List of event bindings keyed by event
	 *   name containing either method names, functions, or arrays containing a method name or
	 *   function followed by a list of arguments to be passed to the callback before emitted
	 *   arguments.
	 * @returns {this}
	 * @override
	 */
	connect(context, methods) {
		return super.connect(context, methods)
	}

	/**
	 * Disconnect event handlers from an object.
	 *
	 * @template {Partial<{ [key in keyof EventMap]: any }>} T
	 * @template C
	 * @param {C} context Object to disconnect methods from
	 * @param {OO.EventConnectionMap<T, C, EventMap>} [methods] List of event bindings keyed by event
	 *   name. Values can be method names, functions, or arrays containing a method name.
	 *
	 *   NOTE: To allow matching call sites with {@link connect()}, array values are allowed to
	 *   contain the parameters as well, but only the method name is used to find bindings. It is
	 *   discouraged to have multiple bindings for the same event to the same listener, but if used
	 *   (and only the parameters vary), disconnecting one variation of (event name, event listener,
	 *   parameters) will disconnect other variations as well.
	 * @returns {this}
	 * @override
	 */
	disconnect(context, methods) {
		return super.disconnect(context, methods)
	}
}
es6ClassToOoJsClass(EventEmitter)
