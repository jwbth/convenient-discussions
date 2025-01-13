/**
 * @typedef {object} ErrorData
 * @param {'network'|'api'|'parse'|'internal'} type Grouping of the error.
 * @param {string} [code] Error code.
 * @param {object} [apiResponse] API response.
 * @param {object} [apiError] API error code.
 * @param {object} [details] Additional details.
 * @param {string} [message] Error message for the user if they will see it.
 */

/**
 * Script's custom error class.
 *
 * @augments Error
 */
class CdError extends Error {
  /** @type {ErrorData} */
  data;

  /**
   * Create a custom error.
   *
   * @param {ErrorData} [data={}]
   */
  constructor(data = {}) {
    super(
      (data.type || 'internal') +
      (data.code ? `/${data.code}` : '') +
      (data.apiError ? `/${data.apiError}` : '') +
      (data.message ? `: ${data.message}` : '')
    );
    this.name = 'CdError';
    this.data = data;
  }
}

export default CdError;
