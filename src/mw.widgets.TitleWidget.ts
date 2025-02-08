declare global {
  namespace mw {
    namespace widgets {
      namespace TitleWidget {
        interface ConfigOptions extends OO.ui.Widget.ConfigOptions {
          /** Number of results to show (default: 10) */
          limit?: number;
          /** Namespace to prepend to queries */
          namespace?: number;
          /** Maximum query length (default: 255) */
          maxLength?: number;
          /** If a namespace is set, display titles relative to it (default: true) */
          relative?: boolean;
          /** Display search suggestions (default: true) */
          suggestions?: boolean;
          /** Show the targets of redirects (default: true) */
          showRedirectTargets?: boolean;
          /** Show page images (default: false) */
          showImages?: boolean;
          /** Show page descriptions (default: false) */
          showDescriptions?: boolean;
          /** Show disambiguation pages as the last results (default: false) */
          showDisambigsLast?: boolean;
          /**
           * Show the user's input as a missing page when a page with this exact name doesn't exist.
           * Disabled by default when the namespace option is used, otherwise enabled by default.
           */
          showMissing?: boolean;
          /** Show pages with a valid interwiki prefix (default: false) */
          showInterwikis?: boolean;
          /** Search for hash fragments on a specific page when typed (default: false) */
          searchFragments?: boolean;
          /** Add exact user's input query to results (default: true) */
          addQueryInput?: boolean;
          /** Exclude the current page from suggestions (default: false) */
          excludeCurrentPage?: boolean;
          /** Exclude pages whose namespace is negative (default: false) */
          excludeDynamicNamespaces?: boolean;
          /** Whether the input must be a valid title (default: true) */
          validateTitle?: boolean;
          /** Whether the input must not be empty (default: false) */
          required?: boolean;
          /** Highlight the partial query the user used for this title (default: true) */
          highlightSearchQuery?: boolean;
          /** Result cache which implements a 'set' method */
          cache?: any;
          /** API object to use; creates a default mw.Api instance if not specified */
          api?: mw.Api;
        }

        interface EventMap extends OO.ui.TextInputWidget.EventMap {}
      }

      interface TitleWidget extends OO.ui.Widget {
        // #region EventEmitter overloads
        on<K extends keyof TitleWidget.EventMap, A extends OO.ArgTuple = [], C = null>(
          event: K,
          method: OO.EventHandler<C, (this: C, ...args: [...A, ...TitleWidget.EventMap[K]]) => void>,
          args?: A,
          context?: C,
        ): this;
        on<K extends string, C = null>(
          event: K extends keyof TitleWidget.EventMap ? never : K,
          method: OO.EventHandler<C>,
          args?: any[],
          context?: C,
        ): this;

        once<K extends keyof TitleWidget.EventMap>(event: K, listener: (this: null, ...args: TitleWidget.EventMap[K]) => void): this;
        once<K extends string>(
          event: K extends keyof TitleWidget.EventMap ? never : K,
          listener: (this: null, ...args: any[]) => void,
        ): this;

        off<K extends keyof TitleWidget.EventMap, C = null>(
          event: K,
          method?: OO.EventHandler<C, (this: C, ...args: TitleWidget.EventMap[K]) => void>,
          context?: C,
        ): this;
        off<K extends string, C = null>(
          event: K extends keyof TitleWidget.EventMap ? never : K,
          method?: OO.EventHandler<C>,
          context?: C,
        ): this;

        emit<K extends keyof TitleWidget.EventMap>(event: K, ...args: TitleWidget.EventMap[K]): boolean;
        emit<K extends string>(event: K extends keyof TitleWidget.EventMap ? never : K, ...args: any[]): boolean;

        emitThrow<K extends keyof TitleWidget.EventMap>(event: K, ...args: TitleWidget.EventMap[K]): boolean;
        emitThrow<K extends string>(event: K extends keyof TitleWidget.EventMap ? never : K, ...args: any[]): boolean;

        connect<T extends Partial<Record<keyof TitleWidget.EventMap, any>>, C>( // eslint-disable-line @definitelytyped/no-unnecessary-generics
          context: C,
          methods: OO.EventConnectionMap<T, C, TitleWidget.EventMap>,
        ): this;

        disconnect<T extends Partial<Record<keyof TitleWidget.EventMap, any>>, C>( // eslint-disable-line @definitelytyped/no-unnecessary-generics
          context: C,
          methods?: OO.EventConnectionMap<T, C, TitleWidget.EventMap>,
        ): this;
        // #endregion
      }

      /**
       * Mixin for title widgets.
       */
      abstract class TitleWidget extends OO.ui.Widget {
        /**
         * Create an instance of mw.widgets.TitleWidget.
         * @param config Configuration options
         */
        constructor(config?: TitleWidget.ConfigOptions);

        /** Number of results to show */
        limit: number;
        /** Maximum query length */
        maxLength: number;
        /** Namespace to prepend to queries, or null */
        namespace: number | null;
        /** If a namespace is set, display titles relative to it */
        relative: boolean;
        /** Display search suggestions */
        suggestions: boolean;
        /** Show the targets of redirects */
        showRedirectTargets: boolean;
        /** Show page images */
        showImages: boolean;
        /** Show page descriptions */
        showDescriptions: boolean;
        /** Show disambiguation pages as the last results */
        showDisambigsLast: boolean;
        /** Show the user's input as a missing page when a page with this exact name doesn't exist */
        showMissing: boolean;
        /** Show pages with a valid interwiki prefix */
        showInterwikis: boolean;
        /** Search for hash fragments on a specific page when typed */
        searchFragments: boolean;
        /** Add exact user's input query to results */
        addQueryInput: boolean;
        /** Exclude the current page from suggestions */
        excludeCurrentPage: boolean;
        /** Exclude pages whose namespace is negative */
        excludeDynamicNamespaces: boolean;
        /** Whether the input must be a valid title */
        validateTitle: boolean;
        /** Whether the input must not be empty */
        required: boolean;
        /** Highlight the partial query the user used for this title */
        highlightSearchQuery: boolean;
        /** Result cache */
        cache: any;
        /** API object for title requests */
        api: mw.Api;
        /** Function for comparing two strings */
        compare: (a: string, b: string) => number;
        /** Cache for section suggestions */
        sectionsCache: { [key: string]: JQuery.Promise<any> };

        /** Static cache for interwiki prefixes promises */
        static interwikiPrefixesPromiseCache: { [key: string]: JQuery.Promise<string[]> };

        /**
         * Get the current value of the search query.
         *
         * @return {string} Search query
         */
        abstract getQueryValue(): string;

        /**
         * Get the namespace to prepend to titles in suggestions, if any.
         *
         * @return {number | null}
         */
        getNamespace(): number | null;

        /**
         * Set the namespace to prepend to titles in suggestions, if any.
         *
         * @param namespace {number | null} Namespace number
         * @return {void}
         */
        setNamespace(namespace: number | null): void;

        /**
         * Get interwiki prefixes promise.
         *
         * @return {JQuery.Promise<string[]>} Promise resolving with an array of interwiki prefixes.
         */
        getInterwikiPrefixesPromise(): JQuery.Promise<string[]>;

        /**
         * Suggest link fragments from the sections API.
         *
         * @param title {string} Title, extracted from the user input
         * @param fragmentQuery {string} Partial link fragment, from the user input
         * @return {JQuery.Promise<{ query: { pages: any[] } }>} Suggestions promise
         */
        getSectionSuggestions(title: string, fragmentQuery: string): JQuery.Promise<{ query: { pages: any[] } }>;

        /**
         * Get a promise which resolves with an API response for suggested links for the current query.
         *
         * @return {JQuery.Promise<any> & { abort(): void }} Suggestions promise
         */
        getSuggestionsPromise(): JQuery.Promise<any> & { abort(): void };

        /**
         * Check for the existence of a given title in an API result set.
         *
         * @param apiResponse {object} The API result set to search in.
         * @param title {string} The page title to search for.
         * @return {boolean}
         */
        responseContainsNonExistingTitle(apiResponse: object, title: string): boolean;

        /**
         * Get API params for a given query.
         *
         * @param query {string} User query
         * @return {object} API params
         */
        getApiParams(query: string): object;

        /**
         * Get the API object for title requests.
         *
         * @return {mw.Api} MediaWiki API
         */
        getApi(): mw.Api;

        /**
         * Get option widgets from the server response.
         *
         * @param data {object} Query result
         * @return {OO.ui.OptionWidget[]} Menu items
         */
        getOptionsFromData(data: object): OO.ui.OptionWidget[];

        /**
         * Create a menu option widget with specified data.
         *
         * @param data {object} Data for option widget
         * @return {OO.ui.MenuOptionWidget} Menu option widget
         */
        createOptionWidget(data: object): OO.ui.MenuOptionWidget;

        /**
         * Get menu option widget data from the title and page data.
         *
         * @param title {string} Title object
         * @param data {object} Page data
         * @return {object} Data for option widget
         */
        getOptionWidgetData(title: string, data: object): object;

        /**
         * Get title object corresponding to given value, or getQueryValue if not given.
         *
         * @param value {string} [Optional] Value to get a title for
         * @return {mw.Title | null} Title object, or null if value is invalid
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
