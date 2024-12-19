/**
 * Script's custom error class.
 *
 * @augments Error
 */
class CdError extends Error {
  /**
   * Create a custom error.
   *
   * @param {object} [data]
   * @param {'network'|'api'|'parse'|'internal'} data.type Grouping of the error.
   * @param {string} [data.code] Error code.
   * @param {object} [data.apiResp] API response.
   * @param {object} [data.apiError] API error code.
   * @param {object} [data.details] Additional details.
   */
  constructor(data = { type: 'internal' }) {
    let message;
    if (data) {
      message = data.type;
      if (data.code) {
        message += `/${data.code}`;
      }
      if (data.apiError) {
        message += `/${data.apiError}`;
      }
    } else {
      message = '';
    }
    super(message);
    this.name = 'CdError';
    this.data = data;
  }
}

export default CdError;
