/**
 * Get the first fallback language that exists in the collection if it passes the validity check.
 *
 * @param {string} lang
 * @param {{ [key: string]: string[] }} fallbacks
 * @param {(lang: string) => boolean} isValid
 * @returns {string}
 */
export function getValidFallbackLanguage(lang, fallbacks, isValid) {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  return fallbacks[lang]?.find(isValid) || 'en';
}

/**
 * Get a language or its fallback if the language is not valid.
 *
 * @param {string} lang
 * @param {(lang: string) => boolean} isValid
 * @param { {[key: string]: string[] }} fallbacks
 * @returns {string}
 */
export function getValidLanguageOrFallback(lang, isValid, fallbacks) {
  return isValid(lang) ? lang : getValidFallbackLanguage(lang, fallbacks, isValid);
}
