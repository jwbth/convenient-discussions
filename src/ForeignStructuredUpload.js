import cd from './loader/cd';
import { es6ClassToOoJsClass } from './utils-oojs';

/**
 * @class ForeignStructuredUpload
 * @memberof mw
 * @see https://doc.wikimedia.org/mediawiki-core/master/js/mw.ForeignStructuredUpload.html
 */

/**
 * Class extending {@link mw.ForeignStructuredUpload mw.ForeignStructuredUpload} and allowing to get
 * and set additional fields. See {@link UploadDialog} for the dialog.
 *
 * @augments mw.ForeignStructuredUpload
 */
class ForeignStructuredUpload extends mw.ForeignStructuredUpload {
  /**
   * Create a foreign structured upload.
   *
   * @param {string} [target] Used to choose the target repository. If nothing is passed,
   *   `mw.ForeignUpload#target` will be used (`'local'`).
   */
  constructor(target) {
    super(target, { ...cd.getApiConfig(), ...cd.g.apiErrorFormatHtml });
  }

  /**
   * Set the source.
   *
   * @param {string} source
   */
  setSource(source) {
    this.source = source;
  }

  /**
   * Set the author.
   *
   * @param {string} user
   */
  setUser(user) {
    this.user = user;
  }

  /**
   * Set the license.
   *
   * @param {string} license
   */
  setLicense(license) {
    this.license = license;
  }

  /**
   * Get the source.
   *
   * @returns {string}
   * @override
   */
  getSource() {
    return this.source ?? super.getSource();
  }

  /**
   * Get the author.
   *
   * @returns {string}
   * @override
   */
  getUser() {
    return this.user ?? this.getDefaultUser();
  }

  /**
   * Get the author as the parent method returns it.
   *
   * @returns {string}
   */
  getDefaultUser() {
    return super.getUser();
  }

  /**
   * Get the license.
   *
   * @returns {string}
   * @override
   */
  getLicense() {
    return this.license ?? super.getLicense();
  }
}

es6ClassToOoJsClass(ForeignStructuredUpload);

export default ForeignStructuredUpload;
