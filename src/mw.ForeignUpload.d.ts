declare global {
	namespace mw {
		/**
		 * Upload to another MediaWiki site.
		 *
		 * Subclassed to upload to a foreign API, with no other goodies.
		 * Use this for a generic foreign image repository on your wiki farm.
		 *
		 * Note: If the first argument is an object, it is treated as `apiconfig`
		 * and the default target is assumed.
		 *
		 * @see https://www.mediawiki.org/wiki/API:Upload
		 */
		interface ForeignUpload extends ForeignUpload.Props, ForeignUpload.Prototype {}

		namespace ForeignUpload {
			interface EventMap extends Upload.EventMap {}

			interface ConfigOptions extends Upload.ConfigOptions {}

			interface Static extends Upload.Static {}

			interface Props extends Upload.Props {
				/** Target repository name. */
				target: string;
				/** Promise resolving to an API instance. */
				apiPromise: JQuery.Promise<mw.Api | mw.ForeignApi>;
			}

			interface Prototype extends Upload.Prototype {
				/**
				 * Get the API instance for this upload.
				 *
				 * @return Promise resolving to an API instance.
				 */
				getApi(): JQuery.Promise<mw.Api | mw.ForeignApi>;

				/**
				 * Override to ensure API info is available before upload.
				 *
				 * @inheritdoc
				 */
				upload(): JQuery.Promise<any>;

				/**
				 * Override to ensure API info is available before upload to stash.
				 *
				 * @inheritdoc
				 */
				uploadToStash(): JQuery.Promise<any>;
			}

			interface Constructor {
				/**
				 * @param target Used to set up the target wiki. If not provided,
				 * it defaults to the first available foreign target or local uploads.
				 * @param apiconfig Passed to the constructor of {@link mw.ForeignApi} or {@link mw.Api}, as needed.
				 */
				new(target?: string, apiconfig?: object): ForeignUpload;
				prototype: Prototype;
				static: Static;
				super: Upload.Constructor;
				/** @deprecated Use `super` instead. */
				parent: Upload.Constructor;
			}
		}

		const ForeignUpload: ForeignUpload.Constructor;
	}
}

export {};
