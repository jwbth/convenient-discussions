declare global {
	namespace mw {
		/**
		 * Upload to another MediaWiki site using structured metadata.
		 *
		 * This subclass uses a structured metadata system similar to (or identical to)
		 * the one on Wikimedia Commons. See <https://commons.wikimedia.org/wiki/Commons:Structured_data>
		 * for a more detailed description of how that system works.
		 *
		 * @classdesc
		 * @extends mw.ForeignUpload
		 */
		interface ForeignStructuredUpload extends ForeignStructuredUpload.Props, ForeignStructuredUpload.Prototype {}

		namespace ForeignStructuredUpload {
			interface EventMap extends ForeignUpload.EventMap {}

			interface ConfigOptions extends ForeignUpload.ConfigOptions {}

			interface Static extends ForeignUpload.Static {}

			interface Props extends ForeignUpload.Props {
				/**
				 * The creation date for the upload.
				 */
				date?: Date;
				/**
				 * An array of descriptions. Each description consists of a language code and the description text.
				 */
				descriptions: Array<{ language: string; text: string }>;
				/**
				 * An array of category names to which this upload will be added.
				 */
				categories: string[];
				/**
				 * Configuration for uploads. Initialized from the local config and may be overridden
				 * by foreign wiki configuration when loadConfig is called.
				 */
				config: any;
				/**
				 * A promise that resolves to the configuration object.
				 */
				configPromise?: JQuery.Promise<any>;
			}

			interface Prototype extends ForeignUpload.Prototype {
				/**
				 * Get the configuration for the form and filepage from the foreign wiki, if any,
				 * and use it for this upload.
				 *
				 * @return Promise resolving to the configuration object
				 */
				loadConfig(): JQuery.Promise<any>;

				/**
				 * Add categories to the upload.
				 *
				 * @param categories Array of categories to add
				 */
				addCategories(categories: string[]): void;

				/**
				 * Empty the list of categories for the upload.
				 */
				clearCategories(): void;

				/**
				 * Add a description to the upload.
				 *
				 * @param language The language code for the description
				 * @param description The description text
				 */
				addDescription(language: string, description: string): void;

				/**
				 * Empty the list of descriptions for the upload.
				 */
				clearDescriptions(): void;

				/**
				 * Set the creation date for the upload.
				 *
				 * @param date The creation date
				 */
				setDate(date: Date): void;

				/**
				 * Get the text of the file page to be created on upload. This method assembles
				 * various pieces of information into a formatted text.
				 *
				 * @return The file page text
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
				 * @return The creation date as a string
				 */
				getDate(): string;

				/**
				 * Fetches the wikitext for any descriptions that have been added to the upload.
				 *
				 * @private
				 * @return The descriptions as a formatted string
				 */
				getDescriptions(): string;

				/**
				 * Fetches the wikitext for the categories to which the upload will be added.
				 *
				 * @private
				 * @return The categories as a formatted string
				 */
				getCategories(): string;

				/**
				 * Gets the wikitext for the license of the upload.
				 *
				 * @private
				 * @return The license text
				 */
				getLicense(): string;

				/**
				 * Get the source. This should be localized text for \"Own work\".
				 *
				 * @private
				 * @return The source text
				 */
				getSource(): string;

				/**
				 * Get the username.
				 *
				 * @private
				 * @return The username as a formatted string
				 */
				getUser(): string;
			}

			interface Constructor {
				/**
				 * @param target Used to set up the target wiki. If not provided,
				 * it defaults to the first available foreign target or local uploads.
				 * @param apiconfig Passed to the constructor of {@link mw.ForeignApi} or {@link mw.Api}, as needed.
				 */
				new(target?: string, apiconfig?: object): ForeignStructuredUpload;
				prototype: Prototype;
				static: Static;
				super: ForeignUpload.Constructor;
				/** @deprecated Use `super` instead */
				parent: ForeignUpload.Constructor;
			}
		}

		const ForeignStructuredUpload: ForeignStructuredUpload.Constructor;
	}
}

export {};
