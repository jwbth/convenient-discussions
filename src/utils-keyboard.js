/**
 * Keyboard and input event utilities.
 *
 * @module utilsKeyboard
 */

/**
 * Check if the provided key combination is pressed given an event.
 *
 * @param {JQuery.KeyDownEvent|KeyboardEvent} event
 * @param {number} keyCode
 * @param {('cmd' | 'shift' | 'alt' | 'meta' | 'ctrl')[]} modifiers Use `'cmd'` instead of `'ctrl'`
 *   to capture both Windows and Mac machines.
 * @returns {boolean}
 */
export function keyCombination(event, keyCode, modifiers = []) {
	if (modifiers.includes('cmd')) {
		modifiers.splice(
			modifiers.indexOf('cmd'),
			1,

			// In Chrome on Windows, e.metaKey corresponds to the Windows key, so we better check for a
			// platform.
			$.client.profile().platform === 'mac' ? 'meta' : 'ctrl',
		)
	}

	return (
		// eslint-disable-next-line @typescript-eslint/no-deprecated
		event.keyCode === keyCode &&
		/** @type {typeof modifiers} */ (['ctrl', 'shift', 'alt', 'meta']).every(
			(mod) => modifiers.includes(mod) === event[/** @type {keyof typeof event} */ (mod + 'Key')],
		)
	)
}

/**
 * Whether a command modifier is pressed. On Mac, this means the Cmd key. On Windows, this means the
 * Ctrl key.
 *
 * @param {MouseEvent | KeyboardEvent | JQuery.MouseEventBase | JQuery.KeyboardEventBase} event
 * @returns {boolean}
 */
export function isCmdModifierPressed(event) {
	// In Chrome on Windows, e.metaKey corresponds to the Windows key, so we better check for a
	// platform.
	return $.client.profile().platform === 'mac' ? event.metaKey : event.ctrlKey
}
