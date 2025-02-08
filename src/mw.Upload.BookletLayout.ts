declare global {
  namespace mw {
    namespace Upload {
      /**
       * Encapsulates the process of uploading a file to MediaWiki using the {@link mw.Upload upload model}.
       *
       * The booklet emits events that can be used to get the stashed upload and the final file.
       * It can be extended to accept additional fields from the user for specific scenarios such as Commons or campaigns.
       *
       * ## Structure
       *
       * The {@link OO.ui.BookletLayout booklet layout} has three steps:
       *
       *  - **Upload**: Contains a {@link OO.ui.SelectFileInputWidget field} to get the file object.
       *  - **Information**: Contains a {@link OO.ui.FormLayout form} to collect metadata.
       *  - **Insert**: Displays details on how to use the uploaded file.
       *
       * The methods {@link #getFile}, {@link #getFilename}, and {@link #getText} are used to retrieve
       * data from the corresponding forms. The upload process is driven by the {@link mw.Upload upload model}.
       *
       * @param {mw.Upload.BookletLayoutConfig} [config] Configuration options.
       */
      class BookletLayout extends OO.ui.BookletLayout {
        constructor(config?: BookletLayout.ConfigOptions);

        /* Properties */

        /**
         * Overlay to use for widgets in the booklet.
         */
        $overlay?: JQuery;
        /**
         * Filekey for a file already stashed on the server.
         */
        filekey?: string;
        /**
         * The form rendered in the first step to get the file object.
         */
        uploadForm: OO.ui.FormLayout;
        /**
         * The form rendered in the second step to get metadata.
         */
        infoForm: OO.ui.FormLayout;
        /**
         * The form rendered in the third step to show usage.
         */
        insertForm: OO.ui.FormLayout;
        /**
         * Widget for selecting a file. May be an OO.ui.SelectFileInputWidget or an mw.widgets.StashedFileWidget.
         */
        selectFileWidget: OO.ui.SelectFileInputWidget | mw.widgets.StashedFileWidget;
        /**
         * Widget for displaying the file preview.
         */
        filePreview: OO.ui.Widget;
        /**
         * Progress bar widget to show upload progress.
         */
        progressBarWidget: OO.ui.ProgressBarWidget;
        /**
         * Text input widget for the filename.
         */
        filenameWidget: OO.ui.TextInputWidget;
        /**
         * Multiline text input widget for the description.
         */
        descriptionWidget: OO.ui.MultilineTextInputWidget;
        /**
         * Text input widget for file usage.
         */
        filenameUsageWidget: OO.ui.TextInputWidget;
        /**
         * The upload model.
         */
        upload: mw.Upload;
        /**
         * Promise representing the current upload process.
         */
        uploadPromise: JQuery.Promise<any>;
        /**
         * The file's extension (if any).
         */
        filenameExtension: string | null;

        /* Methods */

        /**
         * Initializes for a new upload.
         *
         * This method clears any previous values, creates a new upload model,
         * sets the initial page to "initializing" and then transitions to "upload"
         * once the API is available.
         *
         * @return {JQuery.Promise<any>} Promise resolved when initialization is complete.
         */
        initialize(): JQuery.Promise<any>;

        /**
         * Creates a new upload model.
         *
         * @return {mw.Upload} A new upload model instance.
         */
        protected createUpload(): mw.Upload;

        /**
         * Uploads the file that was added in the upload form.
         *
         * Uses {@link #getFile} to retrieve the file object and calls the
         * {@link mw.Upload#uploadToStash uploadToStash} method on the upload model.
         *
         * Fires the following events:
         * - `fileUploadProgress` (with progress and estimated remaining time)
         * - `fileUploaded` when the file has finished uploading.
         *
         * @return {JQuery.Promise<any>} A promise that resolves when the file is uploaded.
         */
        protected uploadFile(): JQuery.Promise<any>;

        /**
         * Saves the file by finalizing the stashed upload.
         *
         * Uses {@link #getFilename} and {@link #getText} to get data from the forms,
         * then calls {@link mw.Upload#finishStashUpload finishStashUpload} on the upload model.
         *
         * Fires the `fileSaved` event with the image information.
         *
         * @return {JQuery.Promise<any>} A promise that resolves if the file was saved successfully.
         */
        protected saveFile(): JQuery.Promise<any>;

        /**
         * Returns an error message (as an OO.ui.Error) for the current upload state.
         *
         * @return {JQuery.Promise<OO.ui.Error>} A promise resolved with an OO.ui.Error.
         */
        protected getErrorMessageForStateDetails(): JQuery.Promise<OO.ui.Error>;

        /**
         * Renders and returns the upload form.
         *
         * Sets the {@link #uploadForm} property.
         *
         * @return {OO.ui.FormLayout} The upload form layout.
         */
        protected renderUploadForm(): OO.ui.FormLayout;

        /**
         * Gets the widget for displaying or inputting the file to upload.
         *
         * If a filekey is provided, returns an mw.widgets.StashedFileWidget; otherwise,
         * returns an OO.ui.SelectFileInputWidget.
         *
         * @return {OO.ui.SelectFileInputWidget|mw.widgets.StashedFileWidget}
         */
        getFileWidget(): OO.ui.SelectFileInputWidget | mw.widgets.StashedFileWidget;

        /**
         * Updates the file preview on the information form when a file is added.
         */
        protected updateFilePreview(): void;

        /**
         * Handles change events on the upload form.
         *
         * Fires the `uploadValid` event indicating whether the form is valid.
         */
        protected onUploadFormChange(): void;

        /**
         * Renders and returns the information form for collecting metadata.
         *
         * Sets the {@link #infoForm} property.
         *
         * @return {OO.ui.FormLayout} The information form layout.
         */
        protected renderInfoForm(): OO.ui.FormLayout;

        /**
         * Handles change events on the information form.
         *
         * Fires the `infoValid` event indicating whether the form is valid.
         */
        protected onInfoFormChange(): void;

        /**
         * Renders and returns the insert form to show file usage.
         *
         * Sets the {@link #insertForm} property.
         *
         * @return {OO.ui.FormLayout} The insert form layout.
         */
        protected renderInsertForm(): OO.ui.FormLayout;

        /**
         * Retrieves the file object from the upload form.
         *
         * @return {File|null} The selected file, or null if none.
         */
        protected getFile(): File | null;

        /**
         * Retrieves the file name from the information form.
         *
         * If a filename extension was set, it is appended to the name.
         *
         * @return {string} The filename.
         */
        protected getFilename(): string;

        /**
         * Prefills the information form with the given filename.
         *
         * Also normalizes and stores the filename extension.
         *
         * @param {string} filename The full filename.
         */
        protected setFilename(filename: string): void;

        /**
         * Retrieves the text (description) from the information form.
         *
         * @return {string} The description text.
         */
        protected getText(): string;

        /**
         * Sets the file object in the upload form.
         *
         * @param {File|null} file The file to set.
         */
        protected setFile(file: File | null): void;

        /**
         * Sets the filekey for a file already stashed on the server.
         *
         * Also updates the file input widget and triggers validation.
         *
         * @param {string} filekey The filekey to set.
         */
        protected setFilekey(filekey: string): void;

        /**
         * Clears the values of all fields in the booklet layout.
         */
        protected clear(): void;
      }

      namespace BookletLayout {
        /**
         * Configuration options for a BookletLayout.
         */
        interface ConfigOptions extends OO.ui.BookletLayout.ConfigOptions {
          /**
           * Overlay to use for widgets in the booklet.
           */
          $overlay?: JQuery;
          /**
           * Sets the stashed file to finish uploading. Overrides most of the file
           * selection process, and fetches a thumbnail from the server.
           */
          filekey?: string;
        }
      }
    }
  }
}

export {};
