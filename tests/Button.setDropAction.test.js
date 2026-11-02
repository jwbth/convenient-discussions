import { beforeEach, describe, expect, test, vi } from 'vitest'

import Button from '../src/Button'

/**
 * @param {string} type
 * @param {object} [props]
 * @returns {DragEvent}
 */
const createDragEvent = (type, props = {}) => {
	const event = new Event(type, { bubbles: true, cancelable: true })
	Object.assign(event, { dataTransfer: { dropEffect: 'none' }, relatedTarget: null, ...props })

	return /** @type {DragEvent} */ (event)
}

describe('Button#setDropAction', () => {
	/** @type {Button} */
	let button
	/** @type {{ accepts: import('vitest').Mock, drop: import('vitest').Mock }} */
	let dropAction

	beforeEach(() => {
		button = new Button({ label: 'Reply' })
		dropAction = { accepts: vi.fn(() => true), drop: vi.fn() }
		button.setDropAction(dropAction)
	})

	test('accepts a drag and highlights the button', () => {
		const event = createDragEvent('dragover')
		button.buttonElement.dispatchEvent(event)
		expect(event.defaultPrevented).toBe(true)
		expect(event.dataTransfer?.dropEffect).toBe('copy')
		expect(button.element.classList.contains('cd-button-dropTarget')).toBe(true)
	})

	test('rejects a drag with data it does not accept', () => {
		dropAction.accepts.mockReturnValue(false)
		const event = createDragEvent('dragover')
		button.buttonElement.dispatchEvent(event)
		expect(event.defaultPrevented).toBe(false)
		expect(button.element.classList.contains('cd-button-dropTarget')).toBe(false)
	})

	test('rejects a drag when disabled', () => {
		button.setDisabled(true)
		const event = createDragEvent('dragover')
		button.buttonElement.dispatchEvent(event)
		expect(event.defaultPrevented).toBe(false)
	})

	test('runs the drop action on drop', () => {
		button.buttonElement.dispatchEvent(createDragEvent('dragover'))
		const event = createDragEvent('drop')
		button.buttonElement.dispatchEvent(event)
		expect(event.defaultPrevented).toBe(true)
		expect(dropAction.drop).toHaveBeenCalledWith(event.dataTransfer)
		expect(button.element.classList.contains('cd-button-dropTarget')).toBe(false)
	})

	test('keeps the highlight while the drag moves onto a child', () => {
		const child = document.createElement('span')
		button.buttonElement.append(child)
		button.buttonElement.dispatchEvent(createDragEvent('dragover'))
		button.buttonElement.dispatchEvent(createDragEvent('dragleave', { relatedTarget: child }))
		expect(button.element.classList.contains('cd-button-dropTarget')).toBe(true)
		button.buttonElement.dispatchEvent(createDragEvent('dragleave'))
		expect(button.element.classList.contains('cd-button-dropTarget')).toBe(false)
	})

	test('stops being a drop target when unset', () => {
		button.setDropAction(undefined)
		const event = createDragEvent('drop')
		button.buttonElement.dispatchEvent(event)
		expect(dropAction.drop).not.toHaveBeenCalled()
	})
})
