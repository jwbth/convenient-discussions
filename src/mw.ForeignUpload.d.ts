import { Api, ApiResponse } from "./Api";

declare global {
    namespace mw {
        /**
         * Upload to another MediaWiki site.
         *
         * Subclassed to upload to a foreign API, with no other goodies. Use
         * this for a generic foreign image repository on your wiki farm.
         *
         * Note you can provide the `target` or not – if the first argument is
         * an object, we assume you want the default, and treat it as apiconfig
         * instead.
         *
         * @class mw.ForeignUpload
         * @extends mw.Upload
         *
         * @constructor
         * @description Used to represent an upload in progress on the frontend.
         * @param {string|mw.Api.Options} [target] Used to set up the target
         *     wiki. If not remote, this class behaves identically to mw.Upload (unless further subclassed).
         *     Use the same names as set in $wgForeignFileRepos for this. Also,
         *     make sure there is an entry in the $wgForeignUploadTargets array for this name.
         * @param {mw.Api.Options} [apiconfig] Passed to the constructor of {@link mw.ForeignApi} or {@link mw.Api}, as needed.
         */
        class ForeignUpload extends Upload {
            constructor(target?: string | Api.Options, apiconfig?: Api.Options);

            /**
             * Used to specify the target repository of the upload.
             *
             * If you set this to something that isn't `'local'`, you must be sure to
             * add that target to `$wgForeignUploadTargets` in LocalSettings, and the
             * repository must be set up to use CORS and CentralAuth.
             *
             * Most wikis use `"shared"` to refer to Wikimedia Commons; we assume that
             * in this class and in the messages linked to it.
             *
             * Defaults to the first available foreign upload target,
             * or to local uploads if no foreign target is configured.
             *
             * @type {string}
             */
            target: string;

            /**
             * @inheritdoc
             */
            getApi(): JQuery.Promise<Api>;

            /**
             * @inheritdoc
             */
            upload(): JQuery.Promise<ApiResponse>;

            /**
             * @inheritdoc
             */
            uploadToStash(): JQuery.Promise<ApiResponse>;
        }
    }
}

export {};
