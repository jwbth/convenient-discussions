// PART 3: Site data loading functions (exposed on cd.loader)

/**
 * @typedef {object} DateFormats
 * @property {string} [key]
 */

/**
 * @typedef {object} DigitsData
 * @property {string} [key]
 */

/**
 * @typedef {'xg' | 'D' | 'l' | 'F' | 'M'} DateToken
 */

/**
 * Set the global variables related to date format.
 *
 * @private
 */
function initFormats() {
  const getLanguageOrFallback = (/** @type {string} */ lang) =>
    getValidLanguageOrFallback(lang, (l) => isKeyOf(l, dateFormats), languageFallbacks);

  const contentLanguage = getLanguageOrFallback(mw.config.get('wgContentLanguage'));
  const userLanguage = getLanguageOrFallback(mw.config.get('wgUserLanguage'));

  cd.g.timestampTools.content.dateFormat = /** @type {DateFormats} */ (dateFormats)[
    contentLanguage
  ];
  cd.g.digits.content = mw.config.get('wgTranslateNumerals')
    ? /** @type {DigitsData} */ (digitsData)[contentLanguage]
    : undefined;
  cd.g.timestampTools.user.dateFormat = /** @type {DateFormats} */ (dateFormats)[userLanguage];
  cd.g.digits.user = mw.config.get('wgTranslateNumerals')
    ? /** @type {DigitsData} */ (digitsData)[userLanguage]
    : undefined;
}

/**
 * Get date tokens used in a format (to load only the needed tokens).
 *
 * @param {string} format
 * @returns {DateToken[]}
 * @private
 * @author Bartosz Dziewoński <matma.rex@gmail.com>
 * @license MIT
 */
function getUsedDateTokens(format) {
  const tokens = /** @type {DateToken[]} */ ([]);

  for (let p = 0; p < format.length; p++) {
    let code = format[p];
