import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { fetchRetryingOn429 } from './utils-fetch.js'

/**
 * @param {number} status
 * @param {Record<string, string>} [headers]
 * @returns {Response}
 */
function response(status, headers = {}) {
	return new Response(status === 200 ? '{}' : undefined, { status, headers })
}

describe('fetchRetryingOn429', () => {
	/** @type {import('vitest').Mock} */
	let fetchMock
	/** @type {import('vitest').Mock} */
	let sleep

	beforeEach(() => {
		fetchMock = vi.fn()
		vi.stubGlobal('fetch', fetchMock)
		sleep = vi.fn(() => Promise.resolve())
	})

	afterEach(() => {
		vi.unstubAllGlobals()
	})

	it('returns the first response that is not a 429 without waiting', async () => {
		fetchMock.mockResolvedValueOnce(response(200))

		const result = await fetchRetryingOn429('https://example.org', {}, sleep)

		expect(result.status).toBe(200)
		expect(sleep).not.toHaveBeenCalled()
	})

	it('waits for Retry-After seconds before retrying', async () => {
		fetchMock
			.mockResolvedValueOnce(response(429, { 'Retry-After': '3' }))
			.mockResolvedValueOnce(response(200))

		const result = await fetchRetryingOn429('https://example.org', {}, sleep)

		expect(result.status).toBe(200)
		expect(sleep.mock.calls).toEqual([[3000]])
	})

	it('backs off exponentially from 5 s when Retry-After is absent', async () => {
		fetchMock
			.mockResolvedValueOnce(response(429))
			.mockResolvedValueOnce(response(429))
			.mockResolvedValueOnce(response(429))
			.mockResolvedValueOnce(response(200))

		await fetchRetryingOn429('https://example.org', {}, sleep)

		expect(sleep.mock.calls).toEqual([[5000], [10_000], [20_000]])
	})

	it('returns the 429 response after 5 retries', async () => {
		fetchMock.mockImplementation(() => Promise.resolve(response(429)))

		const result = await fetchRetryingOn429('https://example.org', {}, sleep)

		expect(result.status).toBe(429)
		expect(fetchMock).toHaveBeenCalledTimes(6)
		expect(sleep).toHaveBeenCalledTimes(5)
	})
})
