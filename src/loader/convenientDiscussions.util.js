export default {
	/**
	 * Get the first fallback language that exists in the collection if it passes the validity check.
	 *
	 * @param {string} lang
	 * @param {{ [key: string]: string[] }} fallbacks
	 * @param {(lang: string) => boolean} isValid
	 * @returns {string}
	 */
	getValidFallbackLanguage(lang, fallbacks, isValid) {
		// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
		return fallbacks[lang]?.find(isValid) || 'en';
	},

	/**
	 * Get a language or its fallback if the language is not valid.
	 *
	 * @param {string} lang
	 * @param {(lang: string) => boolean} isValid
	 * @param { {[key: string]: string[] }} fallbacks
	 * @returns {string}
	 */
	getValidLanguageOrFallback(lang, isValid, fallbacks) {
		return isValid(lang) ? lang : this.getValidFallbackLanguage(lang, fallbacks, isValid);
	},

	/**
	 * Check if the displayed revision is the current (last known) revision of the page.
	 *
	 * @returns {boolean}
	 */
	isCurrentRevision() {
		// RevisionSlider may show a revision newer than the revision in wgCurRevisionId due to a bug
		// (when navigating forward, at least twice, from a revision older than the revision in
		// wgCurRevisionId after some revisions were added). Unfortunately, it doesn't update the
		// wgCurRevisionId value.
		return mw.config.get('wgRevisionId') >= mw.config.get('wgCurRevisionId');
	},
};
