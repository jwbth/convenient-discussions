/**
 * Custom error class.
 *
 * @module CdError
 */
export default class CdError extends Error {
  constructor(data) {
    let message = data && data.type || '';
    if (data && data.code) {
      message += `/${data.code}`;
    }
    super(message);
    this.name = 'CdError';
    this.data = data;
  }
}
