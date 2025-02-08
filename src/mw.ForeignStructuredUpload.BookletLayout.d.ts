declare global {
  namespace mw {
    namespace ForeignStructuredUpload {
      /**
       * Encapsulates the process of uploading a file to MediaWiki using the
       * {@link mw.ForeignStructuredUpload} model.
       *
       * @param {mw.ForeignStructuredUpload.BookletLayoutConfig} [config] Configuration options.
       */
      class BookletLayout extends mw.Upload.BookletLayout {
        constructor(config?: BookletLayout.ConfigOptions);

        /**
         * Used to choose the target repository.
         */
        target?: string;

        /* Additional properties set up by this subclass */

        /**
         * A jQuery object representing the "own work" message element.
         */
        $ownWorkMessage: JQuery;
        /**
         * A jQuery object representing the "not own work" message element.
         */
        $notOwnWorkMessage: JQuery;
        /**
         * A jQuery object representing the "not own work (local)" message element.
         */
        $notOwnWorkLocal: JQuery;
        /**
         * A label widget for displaying messages.
         */
        messageLabel: OO.ui.LabelWidget;
        /**
         * A checkbox widget for selecting whether the work is owned.
         */
        ownWorkCheckbox: OO.ui.CheckboxInputWidget;
        /**
         * A widget for selecting categories.
         */
        categoriesWidget: mw.widgets.CategoryMultiselectWidget;
        /**
         * A date input widget.
         */
        dateWidget: mw.widgets.DateInputWidget;
        /**
         * A field layout wrapping the filename input widget.
         */
        filenameField: OO.ui.FieldLayout;
        /**
         * A field layout wrapping the description input widget.
         */
        descriptionField: OO.ui.FieldLayout;
        /**
         * A field layout wrapping the categories widget.
         */
        categoriesField: OO.ui.FieldLayout;
        /**
         * A field layout wrapping the date widget.
         */
        dateField: OO.ui.FieldLayout;

        /* Methods */

        /**
         * Initializes the booklet layout for a new upload.
         *
         * This method extends the parent's initialize method by setting up
         * additional fields (such as license messages and category widget API configuration)
         * based on the target wiki’s configuration.
         *
         * @inheritdoc
         * @return {JQuery.Promise<any>} A promise resolved when initialization is complete.
         */
        initialize(): JQuery.Promise<any>;

        /**
         * Returns a {@link mw.ForeignStructuredUpload} instance with the target specified in config.
         *
         * @return {mw.Upload} The upload model.
         */
        protected createUpload(): mw.Upload;

        /**
         * Renders and returns the upload form.
         *
         * Sets up elements for file selection and "own work" confirmation.
         *
         * @inheritdoc
         * @return {OO.ui.FormLayout} The upload form layout.
         */
        protected renderUploadForm(): OO.ui.FormLayout;

        /**
         * Handles change events on the upload form.
         *
         * Determines form validity by ensuring a file is selected and the own work checkbox is selected,
         * then emits the `uploadValid` event with a boolean indicating validity.
         *
         * @inheritdoc
         */
        protected onUploadFormChange(): void;

        /**
         * Renders and returns the information form for collecting metadata.
         *
         * Sets up fields for filename, description, categories, and date.
         *
         * @inheritdoc
         * @return {OO.ui.FormLayout} The information form layout.
         */
        protected renderInfoForm(): OO.ui.FormLayout;

        /**
         * Handles change events on the information form.
         *
         * Checks validity of the filename, description, and date fields and emits the `infoValid` event.
         *
         * @inheritdoc
         */
        protected onInfoFormChange(): void;

        /**
         * Validates the given filename by checking if a file page already exists.
         *
         * @param {mw.Title} filename The title object representing the filename.
         * @return {JQuery.Promise<any>} A promise that resolves on success or rejects with an OO.ui.Error.
         */
        protected validateFilename(filename: mw.Title): JQuery.Promise<any>;

        /**
         * Saves the file.
         *
         * This method validates the filename before delegating to the parent saveFile method.
         *
         * @inheritdoc
         * @return {JQuery.Promise<any>} A promise that resolves if the file is saved successfully.
         */
        protected saveFile(): JQuery.Promise<any>;

        /**
         * Gets the wikitext for the file page.
         *
         * Collects data from the description, date, and categories fields and
         * returns the complete file page text.
         *
         * @inheritdoc
         * @return {string} The wikitext for the file page.
         */
        protected getText(): string;

        /**
         * Extracts the original date from EXIF data of the given file.
         *
         * @param {File} file The file from which to extract EXIF data.
         * @return {JQuery.Promise<string>} A promise resolved with the date string in 'YYYY-MM-DD' format.
         */
        protected getDateFromExif(file: File): JQuery.Promise<string>;

        /**
         * Gets the last modified date from the file.
         *
         * @param {File} file The file from which to retrieve the last modified date.
         * @return {string | undefined} The formatted date string in 'YYYY-MM-DD' format, or undefined.
         */
        protected getDateFromLastModified(file: File): string | undefined;

        /**
         * Clears all fields in the booklet layout.
         *
         * Extends the parent's clear method by also clearing the own work checkbox,
         * categories widget, and date widget.
         *
         * @inheritdoc
         */
        protected clear(): void;
      }

      namespace BookletLayout {
        /**
         * Configuration options for a ForeignStructuredUpload BookletLayout.
         *
         * @interface
         * @extends mw.Upload.BookletLayoutConfig
         */
        interface ConfigOptions extends mw.Upload.BookletLayoutConfig {
          /**
           * Used to choose the target repository.
           * If nothing is passed, the default target from mw.ForeignUpload is used.
           */
          target?: string;
        }
      }
    }
  }
}

export {};
