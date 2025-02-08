declare global {
  namespace mw {
    namespace Upload {
      /**
       * Controls a {@link mw.Upload.BookletLayout BookletLayout}.
       *
       * ## Usage
       *
       * To use, set up a {@link OO.ui.WindowManager window manager} like for normal
       * dialogs:
       * ```js
       * var uploadDialog = new mw.Upload.Dialog();
       * var windowManager = new OO.ui.WindowManager();
       * $( document.body ).append( windowManager.$element );
       * windowManager.addWindows( [ uploadDialog ] );
       * windowManager.openWindow( uploadDialog );
       * ```
       *
       * The dialog's closing promise can be used to get details of the upload.
       *
       * If you want to use a different {@link OO.ui.BookletLayout}, for example the
       * {@link mw.ForeignStructuredUpload.BookletLayout}, like in the case of the upload
       * interface in VisualEditor, you can pass it in through the `bookletClass` config option:
       * ```js
       * var uploadDialog = new mw.Upload.Dialog( {
       *     bookletClass: mw.ForeignStructuredUpload.BookletLayout
       * } );
       * ```
       */
      class Dialog<C extends typeof BookletLayout = typeof BookletLayout> extends OO.ui.ProcessDialog {
        /**
         *
         * @param {Dialog.Config<C>} [config] Configuration options.
         */
        constructor(config?: Dialog.Config<C>);

        /** The booklet class to be used for the upload steps. */
        bookletClass: typeof BookletLayout;
        /** The configuration for the booklet. */
        bookletConfig: any;
        /** The upload booklet instance. */
        uploadBooklet: InstanceType<C>;
        /** The upload result (if any). */
        upload: any;

        /**
         * Initialize the dialog.
         *
         * @inheritdoc
         */
        initialize(): this;

        /**
         * Create an upload booklet.
         *
         * @protected
         * @return {mw.Upload.BookletLayout} An upload booklet
         */
        createUploadBooklet(): BookletLayout;

        /**
         * Get the height of the dialog body.
         *
         * @return {number}
         */
        getBodyHeight(): number;

        /**
         * Handle panelNameSet events from the upload booklet.
         *
         * @protected
         * @param {OO.ui.PageLayout} page Current page
         */
        onUploadBookletSet(page: OO.ui.PageLayout): void;

        /**
         * Handle uploadValid events.
         *
         * @protected
         * @param {boolean} isValid The panel is complete and valid
         */
        onUploadValid(isValid: boolean): void;

        /**
         * Handle infoValid events.
         *
         * @protected
         * @param {boolean} isValid The panel is complete and valid
         */
        onInfoValid(isValid: boolean): void;

        /**
         * Get the setup process for the dialog.
         *
         * @inheritdoc
         * @param {any} data
         * @return {OO.ui.Process}
         */
        getSetupProcess(data: any): OO.ui.Process;

        /**
         * Get the action process for the dialog.
         *
         * @inheritdoc
         * @param {string} action
         * @return {OO.ui.Process}
         */
        getActionProcess(action: string): OO.ui.Process;

        /**
         * Get the teardown process for the dialog.
         *
         * @inheritdoc
         * @param {any} data
         * @return {OO.ui.Process}
         */
        getTeardownProcess(data: any): OO.ui.Process;

        /** Static properties */

        /**
         * @inheritdoc
         * @property {string} name
         */
        static name: string;
        /**
         * @inheritdoc
         * @property {Function|string} title
         */
        static title: string | (() => string);
        /**
         * @inheritdoc
         * @property {Object[]} actions
         */
        static actions: Array<{
          flags: string | string[];
          action: string;
          label: string;
          modes: string | string[];
        }>;
      }

      namespace Dialog {
        interface Config<C extends typeof BookletLayout = typeof BookletLayout> extends OO.ui.ProcessDialog.ConfigOptions {
          /**
           * Booklet class to be used for the steps.
           *
           * Defaults to {@link mw.Upload.BookletLayout}.
           */
          bookletClass?: C;
          /** Booklet constructor configuration. */
          booklet?: any;
        }
      }
    }
  }
}

export {};
