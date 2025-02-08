declare global {
  namespace mw {
    /**
     * Upload to another MediaWiki site using structured metadata.
     *
     * This subclass uses a structured metadata system similar to
     * (or identical to) the one on Wikimedia Commons.
     * See <https://commons.wikimedia.org/wiki/Commons:Structured_data> for
     * a more detailed description of how that system works.
     *
     * TODO: This currently only supports uploads under CC-BY-SA 4.0,
     * and should really have support for more licenses.
     *
     * @description Used to represent an upload in progress on the frontend.
     * @param {string} [target]
     * @param {object} [apiconfig]
     */
    class ForeignStructuredUpload extends ForeignUpload {
      constructor(target?: string, apiconfig?: any);

      /** The creation date for the upload. */
      date?: Date;
      /** Array of description objects. Each has a language code and text. */
      descriptions: Array<{ language: string; text: string }>;
      /** Array of category names for the upload. */
      categories: string[];
      /** Configuration for uploads (loaded from config.json or via loadConfig). */
      config: any;
      /** Promise that resolves with the configuration object. */
      configPromise?: JQuery.Promise<any>;

      /**
       * Get the configuration for the form and filepage from the foreign wiki, if any, and use it for
       * this upload.
       *
       * @return {JQuery.Promise<any>} Promise returning config object.
       */
      loadConfig(): JQuery.Promise<any>;

      /**
       * Add categories to the upload.
       *
       * @param {string[]} categories Array of categories to which this upload will be added.
       */
      addCategories(categories: string[]): void;

      /**
       * Empty the list of categories for the upload.
       */
      clearCategories(): void;

      /**
       * Add a description to the upload.
       *
       * @param {string} language The language code for the description's language. Must have a template on the target wiki.
       * @param {string} description The description of the file.
       */
      addDescription(language: string, description: string): void;

      /**
       * Empty the list of descriptions for the upload.
       */
      clearDescriptions(): void;

      /**
       * Set the date of creation for the upload.
       *
       * @param {Date} date
       */
      setDate(date: Date): void;

      /**
       * Get the text of the file page, to be created on upload. Brings together
       * several different pieces of information to create useful text.
       *
       * @return {string}
       */
      getText(): string;

      /**
       * @inheritdoc
       */
      getComment(): string;

      /**
       * Gets the wikitext for the creation date of this upload.
       *
       * @private
       * @return {string}
       */
      getDate(): string;

      /**
       * Fetches the wikitext for any descriptions that have been added to the upload.
       *
       * @private
       * @return {string}
       */
      getDescriptions(): string;

      /**
       * Fetches the wikitext for the categories to which the upload will be added.
       *
       * @private
       * @return {string}
       */
      getCategories(): string;

      /**
       * Gets the wikitext for the license of the upload.
       *
       * @private
       * @return {string}
       */
      getLicense(): string;

      /**
       * Get the source. This should be some sort of localized text for "Own work".
       *
       * @private
       * @return {string}
       */
      getSource(): string;

      /**
       * Get the username.
       *
       * @private
       * @return {string}
       */
      getUser(): string;
    }
  }
}

export {};
