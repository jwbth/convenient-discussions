declare global {
  namespace mw {
    namespace widgets {
      namespace TitleWidget {
        /**
         * @param config Configuration options
         * @param {number} [config.limit=10] Number of results to show
         * @param {number} [config.namespace] Namespace to prepend to queries
         * @param {number} [config.maxLength=255] Maximum query length
         * @param {boolean} [config.relative=true] If a namespace is set, display titles relative to it
         * @param {boolean} [config.suggestions=true] Display search suggestions
         * @param {boolean} [config.showRedirectTargets=true] Show the targets of redirects
         * @param {boolean} [config.showImages=false] Show page images
         * @param {boolean} [config.showDescriptions=false] Show page descriptions
         * @param {boolean} [config.showDisambigsLast=false] Show disambiguation pages as the last results
         * @param {boolean} [config.showMissing] Show the user's input as a missing page when a page with this exact name doesn't exist. Disabled by default when the namespace option is used, otherwise enabled by default.
         * @param {boolean} [config.showInterwikis=false] Show pages with a valid interwiki prefix
         * @param {boolean} [config.searchFragments=false] Search for hash fragments on a specific page when typed
         * @param {boolean} [config.addQueryInput=true] Add exact user's input query to results
         * @param {boolean} [config.excludeCurrentPage=false] Exclude the current page from suggestions
         * @param {boolean} [config.excludeDynamicNamespaces=false] Exclude pages whose namespace is negative
         * @param {boolean} [config.validateTitle=true] Whether the input must be a valid title
         * @param {boolean} [config.required=false] Whether the input must not be empty
         * @param {boolean} [config.highlightSearchQuery=true] Highlight the partial query the user used for this title
         * @param {object} [config.cache] Result cache which implements a 'set' method, taking keyed values as an argument
         * @param {mw.Api} [config.api] API object to use; creates a default mw.Api instance if not specified
         */
        interface ConfigOptions extends OO.ui.Widget.ConfigOptions {
          limit?: number;
          namespace?: number;
          maxLength?: number;
          relative?: boolean;
          suggestions?: boolean;
          showRedirectTargets?: boolean;
          showImages?: boolean;
          showDescriptions?: boolean;
          showDisambigsLast?: boolean;
          showMissing?: boolean;
          showInterwikis?: boolean;
          searchFragments?: boolean;
          addQueryInput?: boolean;
          excludeCurrentPage?: boolean;
          excludeDynamicNamespaces?: boolean;
          validateTitle?: boolean;
          required?: boolean;
          highlightSearchQuery?: boolean;
          cache?: any;
          api?: mw.Api;
        }
      }

      /**
       * Mixin for title widgets.
       *
       * @inheritdoc
       */
      abstract class TitleWidget extends OO.ui.Widget {
        constructor(config?: TitleWidget.ConfigOptions);

        limit: number;
        maxLength: number;
        namespace: number | null;
        relative: boolean;
        suggestions: boolean;
        showRedirectTargets: boolean;
        showImages: boolean;
        showDescriptions: boolean;
        showDisambigsLast: boolean;
        showMissing: boolean;
        showInterwikis: boolean;
        searchFragments: boolean;
        addQueryInput: boolean;
        excludeCurrentPage: boolean;
        excludeDynamicNamespaces: boolean;
        validateTitle: boolean;
        required: boolean;
        highlightSearchQuery: boolean;
        cache: any;
        api: mw.Api;
        compare: (a: string, b: string) => number;
        sectionsCache: { [key: string]: JQuery.Promise<any> };

        static interwikiPrefixesPromiseCache: { [key: string]: JQuery.Promise<string[]> };

        /**
         * Get the current value of the search query.
         *
         * @abstract
         * @inheritdoc
         * @return {string} Search query
         */
        abstract getQueryValue(): string;

        /**
         * Get the namespace to prepend to titles in suggestions, if any.
         *
         * @return {number|null} Namespace number
         */
        getNamespace(): number | null;

        /**
         * Set the namespace to prepend to titles in suggestions, if any.
         *
         * @param {number|null} namespace Namespace number
         */
        setNamespace(namespace: number | null): void;

        /**
         * Get interwiki prefixes promise.
         *
         * @return {jQuery.Promise} Promise resolving with an array of interwiki prefixes.
         */
        getInterwikiPrefixesPromise(): JQuery.Promise<string[]>;

        /**
         * Suggest link fragments from the sections API.
         *
         * @param {string} title Title, extracted form the user input
         * @param {string} fragmentQuery Partial link fragment, from the user input
         * @return {jQuery.Promise} Suggestions promise
         */
        getSectionSuggestions(
          title: string,
          fragmentQuery: string
        ): JQuery.Promise<{ query: { pages: any[] } }>;

        /**
         * Get a promise which resolves with an API response for suggested links for the current query.
         *
         * @return {jQuery.Promise} Suggestions promise
         */
        getSuggestionsPromise(): (JQuery.Promise<any> & { abort(): void });

        /**
         * Check for the existence of a given title in an API result set.
         *
         * @private
         * @param {object} apiResponse The API result set to search in.
         * @param {string} title The page title to search for.
         * @return {boolean}
         */
        responseContainsNonExistingTitle(apiResponse: any, title: string): boolean;

        /**
         * Get API params for a given query.
         *
         * @param {string} query User query
         * @return {object} API params
         */
        getApiParams(query: string): any;

        /**
         * Get the API object for title requests.
         *
         * @return {mw.Api} MediaWiki API
         */
        getApi(): mw.Api;

        /**
         * Get option widgets from the server response.
         *
         * @param {object} data Query result
         * @return {OO.ui.OptionWidget[]} Menu items
         */
        getOptionsFromData(data: any): OO.ui.OptionWidget[];

        /**
         * Create a menu option widget with specified data.
         *
         * @param {object} data Data for option widget
         * @return {OO.ui.MenuOptionWidget} Menu option widget
         */
        createOptionWidget(data: any): OO.ui.MenuOptionWidget;

        /**
         * Get menu option widget data from the title and page data.
         *
         * @param {string} title Title object
         * @param {object} data Page data
         * @return {object} Data for option widget
         */
        getOptionWidgetData(title: string, data: any): any;

        /**
         * Get title object corresponding to given value, or #getQueryValue if not given.
         *
         * @param {string} [value] Value to get a title for
         * @return {mw.Title|null} Title object, or null if value is invalid
         */
        getMWTitle(value?: string): mw.Title | null;

        /**
         * Check if the query is valid.
         *
         * @return {boolean} The query is valid
         */
        isQueryValid(): boolean;
      }
    }
  }
}

export {};
