/** @typedef {import('../src/shared/CdError').default} CdError */

/**
 * Await a promise expected to reject, failing the test if it fulfills.
 *
 * @param {Promise<unknown>} promise
 * @returns {Promise<CdError>} The rejection reason
 */
export async function rejection(promise) {
	try {
		await promise
	} catch (error) {
		return /** @type {CdError} */ (error)
	}
	throw new Error('Expected a rejection')
}
