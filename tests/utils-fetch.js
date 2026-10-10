/**
 * @param {number} ms
 * @returns {Promise<void>}
 */
export function sleep(ms) {
	return new Promise((resolve) => {
		setTimeout(resolve, ms)
	})
}

/**
 * Fetch, retrying up to 5 times on 429: after `Retry-After` seconds, or with exponential backoff
 * from 5 s if the header is absent. The last response is returned as is, 429 included.
 *
 * @param {string | URL} url
 * @param {RequestInit} init
 * @param {(ms: number) => Promise<void>} [wait] Injected by tests to skip real waiting
 * @returns {Promise<Response>}
 */
export async function fetchRetryingOn429(url, init, wait = sleep) {
	for (let attempt = 0; ; attempt++) {
		const response = await fetch(url, init)
		if (response.status !== 429 || attempt === 5) {
			return response
		}
		await wait(Number(response.headers.get('Retry-After')) * 1000 || 5000 * 2 ** attempt)
	}
}
