/**
 * Custom error class.
 */
class CdError extends Error {
  /**
   * Create a custom error.
   *
   * @param {object} [data]
   * @param {string} data.type
   * @param {string} [data.code]
   * @param {object} [data.apiData]
   * @param {object} [data.details]
   */
  constructor(data) {
    let message;
    if (data) {
      message = data.type;
      if (data.code) {
        message += `/${data.code}`;
      }
      if (data?.apiData?.error?.code) {
        message += `/${data.apiData.error.code}`;
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
