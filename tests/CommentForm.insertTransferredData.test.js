// Mock mw global before imports. The mock is partial, so cast through `any`.
globalThis.mw = /** @type {any} */ ({
	Title: class MockTitle {
		static newFromText(title) {
			return new this(title)
		}

		constructor(title) {
			this.title = title
		}

		getPrefixedText() {
			return this.title
		}
	},
})

import { vi, describe, it, expect, beforeEach } from 'vitest'

vi.mock('../src/CrossSiteMwTitle', () => ({
	default: class MockCrossSiteMwTitle {
		constructor(title) {
			this.title = title
		}
	},
}))

vi.mock('../src/loader/cd', () => ({
	default: {
		g: {
			pageName: 'Test_Page',
		},
		s: vi.fn((key) => key),
		utils: {
			skin$: vi.fn(() => ({ length: 0 })),
		},
	},
}))

vi.mock('../src/pageRegistry', () => ({
	default: {
		canonicalCurrentPageName: 'Test_Page',
		get: vi.fn(),
		getCurrent: vi.fn(),
	},
}))

vi.mock('../src/controller', () => ({
	default: {},
}))

vi.mock('../src/commentManager', () => ({
	default: {},
}))

vi.mock('../src/sectionManager', () => ({
	default: {},
}))

vi.mock('../src/userRegistry', () => ({
	default: {},
}))

vi.mock('../src/notifications', () => ({
	default: {},
}))

vi.mock('../src/utils-window', async (importOriginal) => ({
	...(await importOriginal()),
	getElementFromPasteHtml: vi.fn((html) => html),
	// Treat HTML with bold text as rich formatting.
	cleanUpPasteDom: vi.fn((html) => ({ isConvertible: html.includes('<b>') })),
}))

import CommentForm from '../src/CommentForm'

/**
 * Create a stand-in for a `DataTransfer` that, like the browser's, can be emptied after the `drop`
 * event is over.
 *
 * @param {{ [type: string]: string }} strings
 * @param {File[]} [files]
 */
function createDataTransfer(strings, files = []) {
	let store = { ...strings }
	let items = [
		...files.map((file) => ({ kind: 'file', type: file.type, getAsFile: () => file })),
	]

	return {
		dataTransfer: /** @type {any} */ ({
			get items() {
				return items
			},
			get types() {
				return Object.keys(store)
			},
			getData: (/** @type {string} */ type) => store[type] ?? '',
		}),
		empty: () => {
			store = {}
			items = []
		},
	}
}

/**
 * @param {Promise<void>} [buildPromise]
 */
function createForm(buildPromise = Promise.resolve()) {
	const form = /** @type {any} */ (Object.create(CommentForm.prototype))
	form.buildPromise = buildPromise
	form.commentInput = { insertContent: vi.fn(), $element: [{}] }
	form.uploadImage = vi.fn()
	form.suggestConvertToWikitext = vi.fn()

	return form
}

describe('CommentForm#insertTransferredData', () => {
	it('inserts dropped text into the input', async () => {
		const form = createForm()
		await form.insertTransferredData(createDataTransfer({ 'text/plain': 'Hello\r\nworld' }).dataTransfer)

		expect(form.commentInput.insertContent).toHaveBeenCalledWith('Hello\nworld')
		expect(form.uploadImage).not.toHaveBeenCalled()
		expect(form.suggestConvertToWikitext).not.toHaveBeenCalled()
	})

	it('sends a dropped image to the upload dialog', async () => {
		const form = createForm()
		const file = new File(['x'], 'pic.png', { type: 'image/png' })
		await form.insertTransferredData(createDataTransfer({}, [file]).dataTransfer)

		expect(form.uploadImage).toHaveBeenCalledWith(file)
		expect(form.commentInput.insertContent).not.toHaveBeenCalled()
	})

	it('suggests converting rich HTML to wikitext', async () => {
		const form = createForm()
		await form.insertTransferredData(
			createDataTransfer({ 'text/plain': 'bold', 'text/html': '<b>bold</b>' }).dataTransfer,
		)

		expect(form.commentInput.insertContent).toHaveBeenCalledWith('bold')
		expect(form.suggestConvertToWikitext).toHaveBeenCalledWith({ isConvertible: true }, 'bold')
	})

	it('reads the data before the form is built', async () => {
		/** @type {() => void} */
		let finishBuild = () => {}
		const form = createForm(new Promise((resolve) => (finishBuild = resolve)))
		const file = new File(['x'], 'pic.png', { type: 'image/png' })
		const textDrop = createDataTransfer({ 'text/plain': 'bold', 'text/html': '<b>bold</b>' })
		const imageDrop = createDataTransfer({}, [file])
		const textInsertion = form.insertTransferredData(textDrop.dataTransfer)
		const imageInsertion = form.insertTransferredData(imageDrop.dataTransfer)
		textDrop.empty()
		imageDrop.empty()
		finishBuild()
		await Promise.all([textInsertion, imageInsertion])

		expect(form.commentInput.insertContent).toHaveBeenCalledWith('bold')
		expect(form.suggestConvertToWikitext).toHaveBeenCalledWith({ isConvertible: true }, 'bold')
		expect(form.uploadImage).toHaveBeenCalledWith(file)
	})
})
