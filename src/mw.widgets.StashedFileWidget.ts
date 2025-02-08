declare global {
  namespace mw {
    namespace widgets {
      /**
       * Accepts a stashed file and displays the information for purposes of publishing the file.
       * Note that this widget will not finish an upload for you. Use {@link mw.Upload} and
       * {@link mw.Upload#setFilekey}, then {@link mw.Upload#finishStashUpload} to accomplish that.
       *
       * @example
       * ```js
       * const widget = new mw.widgets.StashedFileWidget( {
       *   filekey: '12r9e4rugeec.ddtmmp.1.jpg',
       * } );
       *
       * widget.getValue(); // '12r9e4rugeec.ddtmmp.1.jpg'
       * widget.setValue( '12r9epfbnskk.knfiy7.1.jpg' );
       * widget.getValue(); // '12r9epfbnskk.knfiy7.1.jpg'
       * ```
       */
      class StashedFileWidget extends OO.ui.Widget
        implements
          OO.ui.mixin.IconElement,
          OO.ui.mixin.LabelElement,
          OO.ui.mixin.PendingElement
      {
        constructor(config?: StashedFileWidget.ConfigOptions);

        /**
         * API to use for thumbnail retrieval.
         */
        api: mw.Api;
        /**
         * The filekey of the stashed file.
         */
        filekey: string | null;
        /**
         * A jQuery element holding additional information.
         */
        $info: JQuery;
        /**
         * The jQuery element used as the thumbnail container.
         */
        $thumbnail: JQuery;
        /**
         * The jQuery element that wraps the thumbnail and info.
         */
        $thumbContain: JQuery;

        // Mixin properties from IconElement, LabelElement, and PendingElement are assumed to be present,
        // for example: $icon, $label, etc.

        /**
         * Returns the current filekey.
         *
         * @return {string|null} The filekey.
         */
        getValue(): string | null;

        /**
         * Sets the filekey and updates the UI.
         *
         * @param {string|null} filekey The filekey to set.
         */
        setValue(filekey: string | null): void;

        /**
         * Updates the user interface based on the current filekey.
         */
        updateUI(): void;

        /**
         * Loads and returns the thumbnail URL and MIME type for the stashed file.
         *
         * If the filekey is valid, this method calls the API to retrieve image information.
         * On success, the promise is resolved with a tuple containing the thumbnail URL and MIME type.
         * If no filekey is present, the promise is rejected with the string "No filekey".
         *
         * @return {JQuery.Promise<[thumbUrl: string, mime?: string]>} A promise that resolves with the thumbnail URL and MIME type.
         */
        loadAndGetImageUrl(): JQuery.Promise<[string, string?]>;
      }

      interface StashedFileWidget
        extends
          OO.ui.Widget,
          OO.ui.mixin.IconElement,
          OO.ui.mixin.LabelElement,
          OO.ui.mixin.PendingElement
      {}

      namespace StashedFileWidget {
        /**
         * Configuration options for {@link mw.widgets.StashedFileWidget}.
         */
        interface ConfigOptions extends OO.ui.Widget.ConfigOptions,
          OO.ui.mixin.IconElement.ConfigOptions,
          OO.ui.mixin.LabelElement.ConfigOptions,
          OO.ui.mixin.PendingElement.ConfigOptions {
          /**
           * The filekey of the stashed file.
           */
          filekey?: string;
          /**
           * API to use for thumbnails.
           */
          api?: mw.Api;
        }
      }
    }
  }
}

export {};
