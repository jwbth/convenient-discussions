declare global {
  namespace mw {
    namespace Upload {
      /**
       * Encapsulates the process of uploading a file to MediaWiki using the {@link mw.Upload upload model}.
       *
       * The booklet emits events that can be used to get the stashed upload and the final file.
       * It can be extended to accept additional fields from the user for specific scenarios.
       *
       * ## Structure
       *
       * The {@link OO.ui.BookletLayout booklet layout} has three steps:
       *  - **Upload**: Contains a {@link OO.ui.SelectFileInputWidget file input widget}.
       *  - **Information**: Contains a {@link OO.ui.FormLayout form} for metadata collection.
       *  - **Insert**: Provides details on how to use the uploaded file.
       *
       * The methods {@link mw.Upload.BookletLayout#getFile getFile}, {@link mw.Upload.BookletLayout#getFilename getFilename},
       * and {@link mw.Upload.BookletLayout#getText getText} return data from these forms,
       * which are required by {@link mw.Upload mw.Upload}.
       *
       * ## Events
       *
       * - **fileUploadProgress**: Reports upload progress.
       * - **fileUploaded**: Fires when the file has finished uploading.
       * - **fileSaved**: Fires when the file is saved to the database.
       * - **uploadValid**: Fires when the upload form changes.
       * - **infoValid**: Fires when the info form changes.
       *
       * @class mw.Upload.BookletLayout
       * @extends OO.ui.BookletLayout
       */
      interface BookletLayout
        extends BookletLayout.Props, BookletLayout.Prototype {}

      namespace BookletLayout {
        /**
         * Event map for {@link mw.Upload.BookletLayout}.
         */
        interface EventMap {
          fileUploadProgress: [progress: number, duration: any];
          fileUploaded: [];
          fileSaved: [imageInfo: any];
          uploadValid: [isValid: boolean];
          infoValid: [isValid: boolean];
        }

        /**
         * Configuration options for constructing a {@link mw.Upload.BookletLayout}.
         */
        interface ConfigOptions extends OO.ui.BookletLayout.ConfigOptions {
          /**
           * Overlay to use for widgets in the booklet.
           */
          $overlay?: JQuery;
          /**
           * Sets the stashed file key to finish uploading.
           */
          filekey?: string;
        }

        /**
         * Properties for {@link mw.Upload.BookletLayout}.
         */
        interface Props extends OO.ui.BookletLayout.Props {
          $overlay?: JQuery;
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
           * The form rendered in the third step to show file usage.
           */
          insertForm: OO.ui.FormLayout;
          /**
           * The widget used for file selection.
           */
          selectFileWidget: OO.ui.SelectFileInputWidget | mw.widgets.StashedFileWidget;
          /**
           * Widget for displaying the file preview.
           */
          filePreview: OO.ui.Widget;
          /**
           * Widget for showing upload progress.
           */
          progressBarWidget: OO.ui.ProgressBarWidget;
          /**
           * Widget for the filename input.
           */
          filenameWidget: OO.ui.TextInputWidget;
          /**
           * Widget for the file description.
           */
          descriptionWidget: OO.ui.MultilineTextInputWidget;
          /**
           * Widget showing the final filename usage.
           */
          filenameUsageWidget: OO.ui.TextInputWidget;
          /**
           * The file extension (if applicable).
           */
          filenameExtension?: string | null;
          /**
           * The underlying upload model.
           */
          upload: mw.Upload;
          /**
           * Promise representing the ongoing upload.
           */
          uploadPromise?: JQuery.Promise<any>;
        }

        /**
         * Prototype methods for {@link mw.Upload.BookletLayout}.
         */
        interface Prototype extends OO.ui.BookletLayout.Prototype {
          /**
           * Initialize for a new upload.
           *
           * @returns Promise resolved when initialization is complete.
           */
          initialize(): JQuery.Promise<any>;

          /**
           * Create a new upload model.
           *
           * @protected
           * @returns The upload model.
           */
          createUpload(): mw.Upload;

          /**
           * Uploads the file from the upload form.
           *
           * @protected
           * @fires mw.Upload.BookletLayout.fileUploadProgress
           * @fires mw.Upload.BookletLayout.fileUploaded
           * @returns Promise for the upload process.
           */
          uploadFile(): JQuery.Promise<any>;

          /**
           * Saves the file after upload.
           *
           * @protected
           * @fires mw.Upload.BookletLayout.fileSaved
           * @returns Promise that resolves if the upload is successful.
           */
          saveFile(): JQuery.Promise<any>;

          /**
           * Get an error message for the current upload state.
           *
           * @protected
           * @returns Promise resolving to an OO.ui.Error.
           */
          getErrorMessageForStateDetails(): JQuery.Promise<OO.ui.Error>;

          /**
           * Renders and returns the upload form.
           *
           * @protected
           * @returns The upload form layout.
           */
          renderUploadForm(): OO.ui.FormLayout;

          /**
           * Gets the widget for file selection.
           *
           * @returns The file selection widget.
           */
          getFileWidget(): OO.ui.SelectFileInputWidget | mw.widgets.StashedFileWidget;

          /**
           * Updates the file preview on the info form.
           *
           * @protected
           */
          updateFilePreview(): void;

          /**
           * Handles change events on the upload form.
           *
           * @protected
           * @fires mw.Upload.BookletLayout.uploadValid
           */
          onUploadFormChange(): void;

          /**
           * Renders and returns the information form for metadata.
           *
           * @protected
           * @returns The info form layout.
           */
          renderInfoForm(): OO.ui.FormLayout;

          /**
           * Handles change events on the info form.
           *
           * @protected
           * @fires mw.Upload.BookletLayout.infoValid
           */
          onInfoFormChange(): void;

          /**
           * Renders and returns the insert form showing file usage.
           *
           * @protected
           * @returns The insert form layout.
           */
          renderInsertForm(): OO.ui.FormLayout;

          /**
           * Gets the file object from the upload form.
           *
           * @protected
           * @returns The selected file, or null.
           */
          getFile(): File | null;

          /**
           * Gets the filename from the info form.
           *
           * @protected
           * @returns The filename.
           */
          getFilename(): string;

          /**
           * Prefills the info form with the given filename.
           *
           * @protected
           * @param filename - The filename to set.
           */
          setFilename(filename: string): void;

          /**
           * Gets the text from the info form.
           *
           * @protected
           * @returns The text (description).
           */
          getText(): string;

          /**
           * Sets the file object.
           *
           * @protected
           * @param file - The file to select.
           */
          setFile(file: File | null): void;

          /**
           * Sets the file key for a stashed file.
           *
           * @protected
           * @param filekey - The file key.
           */
          setFilekey(filekey: string): void;

          /**
           * Clears the values of all fields.
           *
           * @protected
           */
          clear(): void;
        }

        /**
         * Constructor interface for {@link mw.Upload.BookletLayout}.
         */
        interface Constructor {
          /**
           * @param config - Configuration options.
           */
          new (config: ConfigOptions): BookletLayout;
          prototype: Prototype;
          static: any;
          super: OO.ui.BookletLayout.Constructor;
          /** @deprecated Use `super` instead */
          parent: OO.ui.BookletLayout.Constructor;
        }
      }
    }

    namespace Upload {
      const BookletLayout: BookletLayout.Constructor;
    }
  }
}

export {};
