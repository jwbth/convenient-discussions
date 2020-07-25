/**
 * Custom error class.
 *
 * @module CdError
 */
export default class CdError extends Error {
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
