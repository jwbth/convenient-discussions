declare global {
  namespace mw {
    namespace widgets {
      /**
       * Title input widget.
       *
       * @param config Configuration options
       * @param {mw.widgets.TitleInputWidget.ConfigOptions} [config] Configuration options
       */
      class TitleInputWidget extends OO.ui.TextInputWidget implements mw.widgets.TitleWidget, OO.ui.mixin.LookupElement {
        constructor(config?: TitleInputWidget.ConfigOptions);

        suggestions: boolean;
        lookupCache: any;

        /**
         * @inheritdoc
         */
        getQueryValue(): string;

        /**
         * @inheritdoc
         */
        setNamespace(namespace: number | null): void;

        /**
         * @inheritdoc
         */
        getLookupRequest(): JQuery.Promise<any>;

        /**
         * @inheritdoc
         */
        getLookupCacheDataFromResponse(response: any): any;

        /**
         * @inheritdoc
         */
        getLookupMenuOptionsFromData(response: any): any;

        /**
         * @override
         * @param {OO.ui.MenuOptionWidget} item Selected menu option.
         */
        onLookupMenuChoose(item: OO.ui.MenuOptionWidget): void;

        /**
         * @override
         * @return {this} The widget instance.
         */
        focus(): this;

        /**
         * @override
         * @param {string} value Input value.
         * @return {string} Cleaned value.
         */
        cleanUpValue(value: string): string;
      }

      namespace TitleInputWidget {
        interface ConfigOptions
          extends
            OO.ui.TextInputWidget.ConfigOptions,
            mw.widgets.TitleWidget.ConfigOptions,
            OO.ui.mixin.LookupElement.ConfigOptions
        {
          /**
           * Display search suggestions.
           *
           * @default true
           */
          suggestions?: boolean;

          /**
           * Perform title validation.
           *
           * Can be a RegExp, function, or string.
           */
          validate?: RegExp | string | ((value: string) => boolean | JQuery.Promise<boolean>);
        }

        interface EventMap extends TitleWidget.EventMap {}
      }

      interface TitleInputWidget
        extends
          OO.ui.TextInputWidget,
          mw.widgets.TitleWidget,
          OO.ui.mixin.LookupElement
      {
        // #region EventEmitter overloads
        on<K extends keyof TitleInputWidget.EventMap, A extends OO.ArgTuple = [], C = null>(
          event: K,
          method: OO.EventHandler<C, (this: C, ...args: [...A, ...TitleInputWidget.EventMap[K]]) => void>,
          args?: A,
          context?: C,
        ): this;
        on<K extends string, C = null>(
          event: K extends keyof TitleInputWidget.EventMap ? never : K,
          method: OO.EventHandler<C>,
          args?: any[],
          context?: C,
        ): this;

        once<K extends keyof TitleInputWidget.EventMap>(event: K, listener: (this: null, ...args: TitleInputWidget.EventMap[K]) => void): this;
        once<K extends string>(
          event: K extends keyof TitleInputWidget.EventMap ? never : K,
          listener: (this: null, ...args: any[]) => void,
        ): this;

        off<K extends keyof TitleInputWidget.EventMap, C = null>(
          event: K,
          method?: OO.EventHandler<C, (this: C, ...args: TitleInputWidget.EventMap[K]) => void>,
          context?: C,
        ): this;
        off<K extends string, C = null>(
          event: K extends keyof TitleInputWidget.EventMap ? never : K,
          method?: OO.EventHandler<C>,
          context?: C,
        ): this;

        emit<K extends keyof TitleInputWidget.EventMap>(event: K, ...args: TitleInputWidget.EventMap[K]): boolean;
        emit<K extends string>(event: K extends keyof TitleInputWidget.EventMap ? never : K, ...args: any[]): boolean;

        emitThrow<K extends keyof TitleInputWidget.EventMap>(event: K, ...args: TitleInputWidget.EventMap[K]): boolean;
        emitThrow<K extends string>(event: K extends keyof TitleInputWidget.EventMap ? never : K, ...args: any[]): boolean;

        connect<T extends Partial<Record<keyof TitleInputWidget.EventMap, any>>, C>( // eslint-disable-line @definitelytyped/no-unnecessary-generics
          context: C,
          methods: OO.EventConnectionMap<T, C, TitleInputWidget.EventMap>,
        ): this;

        disconnect<T extends Partial<Record<keyof TitleInputWidget.EventMap, any>>, C>( // eslint-disable-line @definitelytyped/no-unnecessary-generics
          context: C,
          methods?: OO.EventConnectionMap<T, C, TitleInputWidget.EventMap>,
        ): this;
        // #endregion
      }
    }
  }
}

export {};
