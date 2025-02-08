declare global {
  namespace mw {
    namespace widgets {
      namespace TitleInputWidget {
        interface ConfigOptions extends OO.ui.TextInputWidget.ConfigOptions {
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
      }

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
    }
  }
}

export {};
