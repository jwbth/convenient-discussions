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
   * @param {object} [data.details] Additional details.
   */
  constructor(data = {}) {
    let message;
    if (data) {
      message = data.type;
      if (data.code) {
        message += `/${data.code}`;
      }
      if (data.apiResp?.error?.code) {
        message += `/${data.apiResp.error.code}`;
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
