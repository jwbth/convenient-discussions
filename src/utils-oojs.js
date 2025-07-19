/**
 * Helpers for heavily used OOUI widgets and dialogs.
 *
 * @module utilsOoui
 */

import cd from './cd';
import { copyText } from './utils-window';

/**
 * OOjs namespace.
 *
 * @external OO
 * @global
 * @see https://doc.wikimedia.org/oojs/master/OO.html
 */

/**
 * Namespace for all classes, static methods and static properties of OOUI.
 *
 * @namespace ui
 * @memberof OO
 * @see https://doc.wikimedia.org/oojs-ui/master/js/#!/api/OO.ui
 */

/**
 * OOjs event emitter.
 *
 * @namespace EventEmitter
 * @memberof OO
 * @see https://doc.wikimedia.org/oojs/master/OO.EventEmitter.html
 */

/**
 * OOUI window manager.
 *
 * @class WindowManager
 * @memberof OO.ui
 * @see https://doc.wikimedia.org/oojs-ui/master/js/#!/api/OO.ui.WindowManager
 */

/**
 * OOUI field layout.
 *
 * @class FieldLayout
 * @memberof OO.ui
 * @see https://doc.wikimedia.org/oojs-ui/master/js/#!/api/OO.ui.FieldLayout
 */

/**
 * OOUI checkbox input widget.
 *
 * @class CheckboxInputWidget
 * @memberof OO.ui
 * @see https://doc.wikimedia.org/oojs-ui/master/js/#!/api/OO.ui.CheckboxInputWidget
 */

/**
 * OOUI radio select widget.
 *
 * @class RadioSelectWidget
 * @memberof OO.ui
 * @see https://doc.wikimedia.org/oojs-ui/master/js/#!/api/OO.ui.RadioSelectWidget
 */

/**
 * OOUI radio option widget.
 *
 * @class RadioOptionWidget
 * @memberof OO.ui
 * @see https://doc.wikimedia.org/oojs-ui/master/js/#!/api/OO.ui.RadioOptionWidget
 */

/**
 * OOUI copy text layout.
 *
 * @class CopyTextLayout
 * @memberof OO.ui
 * @see https://doc.wikimedia.org/oojs-ui/master/js/#!/api/OO.ui.CopyTextLayout
 */

/**
 * OOUI text input widget.
 *
 * @class TextInputWidget
 * @memberof OO.ui
 * @see https://doc.wikimedia.org/oojs-ui/master/js/#!/api/OO.ui.TextInputWidget
 */

/**
 * OOUI process dialog.
 *
 * @class ProcessDialog
 * @memberof OO.ui
 * @see https://doc.wikimedia.org/oojs-ui/master/js/#!/api/OO.ui.ProcessDialog
 */

/**
 * OOUI process.
 *
 * @class Process
 * @memberof OO.ui
 * @see https://doc.wikimedia.org/oojs-ui/master/js/#!/api/OO.ui.Process
 */

/**
 * OOUI page layout.
 *
 * @class PageLayout
 * @memberof OO.ui
 * @see https://doc.wikimedia.org/oojs-ui/master/js/#!/api/OO.ui.PageLayout
 */

/**
 * OOUI horizontal layout.
 *
 * @class HorizontalLayout
 * @memberof OO.ui
 * @see https://doc.wikimedia.org/oojs-ui/master/js/#!/api/OO.ui.HorizontalLayout
 */

/**
 * OOUI button widget.
 *
 * @class ButtonWidget
 * @memberof OO.ui
 * @see https://doc.wikimedia.org/oojs-ui/master/js/#!/api/OO.ui.ButtonWidget
 */

/**
 * OOUI popup button widget.
 *
 * @class PopupButtonWidget
 * @memberof OO.ui
 * @see https://doc.wikimedia.org/oojs-ui/master/js/#!/api/OO.ui.PopupButtonWidget
 */

/**
 * OOUI popup widget.
 *
 * @class PopupWidget
 * @memberof OO.ui
 * @see https://doc.wikimedia.org/oojs-ui/master/js/#!/api/OO.ui.PopupWidget
 */

/**
 * OOUI button menu select widget.
 *
 * @class ButtonMenuSelectWidget
 * @memberof OO.ui
 * @see https://doc.wikimedia.org/oojs-ui/master/js/#!/api/OO.ui.ButtonMenuSelectWidget
 */

/**
 * Display an OOUI message dialog where user is asked to confirm something. Compared to
 * {@link https://doc.wikimedia.org/oojs-ui/master/js/OO.ui.html#.confirm OO.ui.confirm}, returns an
 * action string, not a boolean (which helps to differentiate between more than two types of answer
 * and also a window close by pressing Esc).
 *
 * @param {string|JQuery} message
 * @param {{ [key: string]: any }} [options={}]
 * @returns {Promise.<'accept' | 'reject' | undefined>} `undefined` is possible when pressing Esc, I
 *   think.
 */
export async function showConfirmDialog(message, options = {}) {
  const dialog = new OO.ui.MessageDialog({ classes: ['cd-dialog-confirm'] });
  cd.getWindowManager().addWindows([dialog]);
  const win = cd.getWindowManager().openWindow(dialog, { message, ...options });
  win.opened.then(() => {
    if (message instanceof $) {
      mw.hook('wikipage.content').fire(message);
    }
  });
  const closeData = await win.closed;

  return closeData?.action;
}

/**
 * @typedef {object} ControlOptionsBase
 * @property {string} name
 * @property {ControlType} type
 * @property {string|JQuery} [label]
 * @property {string|JQuery} [help]
 * @property {string[]} [classes]
 * @property {boolean} [required]
 * @property {boolean} [disabled]
 */

/**
 * @typedef {ControlOptionsBase & {
 *   type: 'text';
 *   value?: string;
 *   maxLength?: number;
 * }} TextControlOptions
 */

/**
 * @typedef {ControlOptionsBase & {
 *   type: 'number';
 *   value: string;
 *   min: number;
 *   max: number;
 *   buttonStep?: number;
 * }} NumberControlOptions
 */

/**
 * @typedef {ControlOptionsBase & {
 *   type: 'checkbox';
 *   value: string;
 *   selected?: boolean;
 *   title?: string;
 *   tabIndex?: number;
 * }} CheckboxControlOptions
 */

/**
 * @typedef {ControlOptionsBase & {
 *   type: 'radio';
 *   selected?: string;
 *   options: Array<{
 *     data: any;
 *     label: string;
 *     help?: string|JQuery;
 *     selected?: boolean;
 *   }>;
 * }} RadioControlOptions
 */

/**
 * @typedef {ControlOptionsBase & {
 *   type: 'multilineText';
 *   value: string;
 *   maxLength: number;
 *   rows?: number;
 * }} MultilineTextControlOptions
 */

/**
 * @typedef {ControlOptionsBase & {
 *   type: 'copyText';
 *   value: string;
 *   copyCallback: (successful: boolean, field: OO.ui.CopyTextLayout) => void;
 * }} CopyTextControlOptions
 */

/**
 * @typedef {ControlOptionsBase & {
 *   type: 'multicheckbox';
 *   selected?: string[];
 *   options: Array<{
 *     data: any,
 *     label: string,
 *     help?: string|JQuery,
 *     selected?: boolean,
 *   }>;
 *   classes?: string[];
 * }} MulticheckboxControlOptions
 */

/**
 * @typedef {ControlOptionsBase & {
 *   type: 'multitag';
 *   selected?: string[];
 *   tagLimit?: number;
 *   placeholder?: string;
 *   dataToUi?: (value: Array<string|string[]>) => string[];
 *   uiToData?: (value: string[]) => (string|string[])[];
 * }} MultitagControlOptions
 */

/**
 * @typedef {ControlOptionsBase & {
 *   type: 'button';
 *   flags?: string[];
 *   fieldLabel?: string;
 * }} ButtonControlOptions
 */

/**
 * Create a text input field.
 *
 * @param {TextControlOptions} options
 * @returns {Control<'text'>}
 */
export function createTextControl({
  value,
  maxLength,
  required,
  classes,
  label,
  help,
}) {
  return createControl(
    /** @type {const} */ 'text',
    new (require('./TextInputWidget').default)({ value, maxLength, required, classes }),
    { label, help }
  );
}

/**
 * Create a number input field.
 *
 * @param {NumberControlOptions} options
 * @returns {Control<'number'>}
 */
export function createNumberControl({
  value,
  label,
  min,
  max,
  buttonStep = 1,
  help,
  classes,
}) {
  return createControl(
    /** @type {const} */ 'number',

    // See https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/oojs-ui#caveats for
    // why we need type casting here.
    /** @type {OO.ui.TextInputWidget} */ (/** @type {unknown} */ (new OO.ui.NumberInputWidget({
      input: { value },
      step: 1,
      buttonStep,
      min,
      max,
      classes: ['cd-numberInput'],
    }))),
    { label, help, classes }
  );
}

/**
 * Create a checkbox field.
 *
 * @param {CheckboxControlOptions} options
 * @returns {Control<'checkbox'>}
 */
export function createCheckboxControl({
  value,
  selected,
  disabled,
  label,
  title,
  help,
  tabIndex,
  classes,
}) {
  return createControl(
    /** @type {const} */ 'checkbox',
    new (require('./CheckboxInputWidget').default)({
      value,
      selected,
      disabled,
      tabIndex,
    }),
    {
      label,
      title,
      help,
      classes,
      align: 'inline',
    }
  );
}

/**
 * Create a radio select field.
 *
 * @param {RadioControlOptions} options
 * @returns {Control<'radio'>}
 */
export function createRadioControl({
  label,
  selected,
  help,
  options,
}) {
  const input = new OO.ui.RadioSelectWidget({ items: options.map((config) => new (require('./RadioOptionWidget').default)(config)) });

  // Workarounds for T359920
  input.$element.off('mousedown');
  input.$focusOwner = $();

  if (selected !== undefined) {
    input.selectItemByData(selected);
  }

  return createControl('radio', input, { label, help });
}

/**
 * Create an action field for copying text from an input.
 *
 * @param {CopyTextControlOptions} options
 * @returns {Control<'copyText'>}
 */
export function createCopyTextControl({
  label,
  value,
  disabled = false,
  help,
  copyCallback,
}) {
  let field;
  let input;
  if ('CopyTextLayout' in OO.ui) {
    field = new OO.ui.CopyTextLayout({
      align: 'top',
      label,
      copyText: value,
      button: { disabled },
      textInput: { disabled },
      help,
      helpInline: Boolean(help),
    });
    field.on('copy', (successful) => {
      copyCallback(successful, /** @type {OO.ui.CopyTextLayout} */ field);
    });
    input = field.textInput;
  } else {
    // MediaWiki versions before 1.34 do not have CopyTextLayout, so we use ActionFieldLayout
    // instead
    input = new OO.ui.TextInputWidget({ value, disabled });
    const button = new OO.ui.ButtonWidget({
      label: cd.s('copy'),
      icon: 'copy',
      disabled,
    });
    button.on('click', () => {
      copyCallback(copyText(input.getValue()), /** @type {OO.ui.TextInputWidget} */ field);
    });
    field = new OO.ui.ActionFieldLayout(input, button, {
      align: 'top',
      label,
      help,
      helpInline: Boolean(help),
    });
  }

  return { type: 'copyText', field, input };
}

/**
 * Create a checkbox multiselect field.
 *
 * @param {MulticheckboxControlOptions} options
 * @returns {Control<'multicheckbox'>}
 */
export function createMulticheckboxControl({
  type = 'multicheckbox',
  label,
  options,
  selected,
  classes,
}) {
  return createControl(
    type,
    new OO.ui.CheckboxMultiselectWidget({
      items: options.map(
        (option) =>
          new OO.ui.CheckboxMultioptionWidget({
            data: option.data,
            selected: selected ? selected.includes(option.data) : option.selected,
            label: option.label,
          })
      ),
      classes,
    }),
    { label }
  );
}

/**
 * Create a tag multiselect field.
 *
 * @param {MultitagControlOptions} options
 * @returns {Control<'multitag'>}
 */
export function createTagsControl({
  type = 'multitag',
  label,
  placeholder,
  tagLimit,
  selected,
  help,
  dataToUi,
  uiToData,
}) {
  return createControl(
    type,
    new OO.ui.TagMultiselectWidget({
      placeholder,
      allowArbitrary: true,
      inputPosition: 'outline',
      tagLimit,
      selected: (dataToUi || ((val) => val)).call(null, selected || []),
    }),
    { label, help },
    { uiToData },
  );
}

/**
 * Create a button field.
 *
 * @param {ButtonControlOptions} options
 * @returns {Control<'button'>}
 */
export function createButtonControl({
  type = 'button',
  label,
  flags,
  fieldLabel,
  help,
}) {
  return createControl(
    type,
    new OO.ui.ButtonWidget({ label, flags }),
    {
      label: fieldLabel,
      help,
    }
  );
}

/**
 * @typedef {object} GenericFieldConfig
 * @property {string|JQuery} [label]
 * @property {'top'|'inline'} [align='top']
 * @property {string|JQuery} [help]
 * @property {boolean} [helpInline]
 * @property {string[]} [classes]
 * @property {string} [title]
 */

/**
 * Create a generic control with a field layout.
 *
 * @template {ControlType} T
 * @param {T} type Control type identifier
 * @param {ControlTypeToControl[T]['input']} input The input widget
 * @param {GenericFieldConfig} [fieldConfig={}] Configuration for the field layout
 * @param {{ [key: string]: any }} [data={}] Additional data to attach to the control
 * @returns {Control<T>}
 */
export function createControl(type, input, fieldConfig = {}, data = {}) {
  const field = new OO.ui.FieldLayout(input, {
    align: 'top',
    helpInline: true,
    ...fieldConfig,
  });

  if (!fieldConfig.label) {
    field.$element.addClass('cd-field-labelless');
  }

  return { type, field, input, ...data };
}

/**
 * @typedef {object} OoJsClassSpecificProps
 * @property {OO.ConstructorLike} [parent] The parent constructor.
 * @property {OO.ConstructorLike} [super] The super constructor.
 * @property {object} static An object containing static properties.
 */

/**
 * @typedef {Constructor & OoJsClassSpecificProps} OoJsClassLike
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
  const OriginClass = Object.getPrototypeOf(TargetClass);
  TargetClass.parent = TargetClass.super = OriginClass;
  OO.initClass(OriginClass);

  Object.getOwnPropertyNames(OriginClass.prototype)
    .filter((name) => name !== 'constructor')
    .forEach((name) => {
      Object.defineProperty(
        TargetClass.prototype,
        name,
        /** @type {PropertyDescriptor} */ (
          Object.getOwnPropertyDescriptor(OriginClass.prototype, name)
        )
      );
    });

  TargetClass.static = Object.create(OriginClass.static);
  Object.keys(TargetClass)
    .filter((key) => !['parent', 'super', 'static'].includes(key))
    .forEach((key) => {
      TargetClass.static[key] = TargetClass[key];
    });

  return TargetClass;
}

/**
 * Mix in a class into a target class.
 *
 * @template {Constructor} TBase
 * @template {Constructor} TMixin
 * @param {TBase} Base
 * @param {TMixin} Mixin
 * @returns {TBase & MixinType}
 */
export function mixInClass(Base, Mixin) {
  /**
   * @typedef {{
   *   new (...args: any[]): InstanceType<TMixin>;
   *   prototype: InstanceType<TMixin>;
   * }} MixinType
   */

  // eslint-disable-next-line jsdoc/require-jsdoc
  class Class extends Base {}
  OO.mixinClass(Class, Mixin);

  return /** @type {TBase & MixinType} */ (Class);
}

/**
 * Add a mixin's (e.g. {@link OO.EventEmitter OO.EventEmitter}) methods to an arbitrary object
 * itself (the static side), not its prototype.
 *
 * @template {{}} TBase
 * @template {Constructor} TMixin
 * @param {TBase} obj
 * @param {TMixin} Mixin
 * @returns {TBase & InstanceType<TMixin>}
 */
export function mixInObject(obj, Mixin) {
  const dummy = () => {};
  dummy.prototype = /** @type {InstanceType<TMixin>} */ ({});
  OO.mixinClass(dummy, Mixin);
  Object.assign(obj, dummy.prototype, new Mixin());

  return /** @type {TBase & InstanceType<TMixin>} */ (obj);
}

/**
 * @template {{ [key: string]: OO.ArgTuple }} [EventMap = { [key: string]: OO.ArgTuple }]
 */
export class EventEmitter extends OO.EventEmitter {
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
   */
  on(event, method, args, context) {
    return super.on(event, method, args, context);
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
   */
  once(event, listener) {
    return super.once(event, listener);
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
   */
  off(event, method, context) {
    return super.off(event, method, context);
  }

  /**
   * @template {keyof EventMap} K
   * @overload
   * @param {K} event The event name.
   * @param {EventMap[K]} args Arguments to pass to the listeners.
   * @returns {boolean}
   */

  /**
   * @template {string} K
   * @overload
   * @param {K} event The event name.
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
   */
  emit(event, ...args) {
    return super.emit(event, ...args);
  }

  /**
   * @template {keyof EventMap} K
   * @overload
   * @param {K} event
   * @param {EventMap[K]} args
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
   */
  emitThrow(event, ...args) {
    return super.emitThrow(event, ...args);
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
   */
  connect(context, methods) {
    return super.connect(context, methods);
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
   */
  disconnect(context, methods) {
    return super.disconnect(context, methods);
  }
}

es6ClassToOoJsClass(EventEmitter);
