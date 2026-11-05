import { beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock('../src/Comment', () => ({ default: { isId: () => false } }))
vi.mock('../src/commentManager', () => ({ default: { getByDtId: vi.fn() } }))
vi.mock('../src/sectionManager', () => ({ default: { findByHeadlineParts: vi.fn() } }))
vi.mock('../src/userRegistry', () => ({ default: {} }))
vi.mock('../src/utils-date', () => ({ formatDateNative: vi.fn() }))
vi.mock('../src/loader/cd', () => ({
	default: {
		config: { idleFragments: [] },
		page: { isArchive: () => false, canHaveArchives: () => false },
		sParse: vi.fn((key, ...args) => [key, ...args].join(' ')),
	},
}))
vi.mock('../src/utils-window', async (importOriginal) => ({
	...(await importOriginal()),
	wrapHtml: (html) => html,
}))

import processUrlOnLoad from '../src/processUrl'

describe('processUrlOnLoad', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		document.body.replaceChildren()
		vi.stubGlobal('$', (selector) => document.querySelectorAll(selector))
		vi.stubGlobal('CSS', { escape: (value) => value })
		mw.notify = vi.fn()
	})

	test.each(['top', 'TOP', 'Top', '%74op'])('does not report #%s as a missing section', async (fragment) => {
		history.replaceState({}, '', '#' + fragment)
		await processUrlOnLoad()
		expect(mw.notify).not.toHaveBeenCalled()
	})

	test('reports a missing section', async () => {
		history.replaceState({}, '', '#Missing_section')
		await processUrlOnLoad()
		expect(mw.notify).toHaveBeenCalledWith(
			'deadanchor-section-lead Missing section deadanchor-section-reason',
			{ type: 'warn', autoHideSeconds: 'long' },
		)
	})
})
