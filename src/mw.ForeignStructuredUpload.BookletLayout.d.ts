declare global {
  namespace mw {
    namespace ForeignStructuredUpload {
      /**
       * Encapsulates the process of uploading a file to MediaWiki
       * using the {@link mw.ForeignStructuredUpload} model.
       *
       * @example
       * var uploadDialog = new mw.Upload.Dialog({
       *   bookletClass: mw.ForeignStructuredUpload.BookletLayout,
       *   booklet: {
       *     target: 'local'
       *   }
       * });
       * var windowManager = new OO.ui.WindowManager();
       * $( document.body ).append( windowManager.$element );
       * windowManager.addWindows([ uploadDialog ]);
       *
       * @class mw.ForeignStructuredUpload.BookletLayout
       * @extends mw.Upload.BookletLayout
       */
      interface BookletLayout extends BookletLayout.Props, BookletLayout.Prototype {}

      namespace BookletLayout {
        interface EventMap extends mw.Upload.BookletLayout.EventMap {}

        interface ConfigOptions extends mw.Upload.BookletLayout.ConfigOptions {
          /**
           * Used to choose the target repository.
           * If nothing is passed, the default from {@link mw.ForeignUpload#target} is used.
           */
          target?: string;
        }

        interface Props extends mw.Upload.BookletLayout.Props {
          /**
           * The underlying upload model.
           */
          override upload: mw.ForeignUpload;
          /**
           * The target repository.
           */
          target?: string;
          /**
           * jQuery element for the "own work" message.
           */
          $ownWorkMessage: JQuery;
          /**
           * jQuery element for the "not own work" message.
           */
          $notOwnWorkMessage: JQuery;
          /**
           * jQuery element for the "not own work local" message.
           */
          $notOwnWorkLocal: JQuery;
          /**
           * Checkbox widget for own work selection.
           */
          ownWorkCheckbox: OO.ui.CheckboxInputWidget;
          /**
           * Label widget for displaying messages.
           */
          messageLabel: OO.ui.LabelWidget;
          /**
           * Widget for selecting categories.
           */
          categoriesWidget: mw.widgets.CategoryMultiselectWidget;
          /**
           * Date input widget.
           */
          dateWidget: mw.widgets.DateInputWidget;
          /**
           * Field layout for the filename input.
           */
          filenameField: OO.ui.FieldLayout;
          /**
           * Field layout for the description input.
           */
          descriptionField: OO.ui.FieldLayout;
          /**
           * Field layout for the categories input.
           */
          categoriesField: OO.ui.FieldLayout;
          /**
           * Field layout for the date input.
           */
          dateField: OO.ui.FieldLayout;
        }

        interface Prototype extends mw.Upload.BookletLayout.Prototype {
          /**
           * Initialize for a new upload.
           *
           * @returns A promise resolved when initialization is complete.
           */
          initialize(): JQuery.Promise<any>;

          /**
           * Create a new upload model.
           *
           * @protected
           * @returns The upload model.
           */
          createUpload(): mw.ForeignStructuredUpload;

          /**
           * Renders and returns the upload form.
           *
           * @returns The upload form layout.
           */
          renderUploadForm(): OO.ui.FormLayout;

          /**
           * Handles change events on the upload form.
           *
           * @fires mw.ForeignStructuredUpload.BookletLayout#uploadValid
           */
          onUploadFormChange(): void;

          /**
           * Renders and returns the information form for collecting metadata.
           *
           * @returns The info form layout.
           */
          renderInfoForm(): OO.ui.FormLayout;

          /**
           * Handles change events on the info form.
           *
           * @fires mw.ForeignStructuredUpload.BookletLayout#infoValid
           */
          onInfoFormChange(): void;

          /**
           * Validates the filename by checking if the file already exists.
           *
           * @param filename - The mw.Title representing the filename.
           * @returns A promise that resolves if the filename is valid,
           *          or rejects with an OO.ui.Error.
           */
          validateFilename(filename: mw.Title): JQuery.Promise<void>;

          /**
           * Saves the file.
           *
           * @returns A promise that resolves if the file is saved successfully.
           */
          saveFile(): JQuery.Promise<any>;

          /**
           * Gets the text of the file page.
           *
           * @returns The file page text.
           */
          getText(): string;

          /**
           * Extracts the date from EXIF data of the given file.
           *
           * @param file - The file object.
           * @returns A promise that resolves with the date string.
           */
          getDateFromExif(file: File): JQuery.Promise<string>;

          /**
           * Gets the last modified date from the file.
           *
           * @param file - The file object.
           * @returns The formatted date string, or undefined.
           */
          getDateFromLastModified(file: File): string | undefined;

          /**
           * Clears the values of all fields.
           */
          clear(): void;
        }

        interface Constructor {
          /**
           * @param config - Configuration options.
           */
          new (config: ConfigOptions): BookletLayout;
          prototype: Prototype;
          static: any;
          super: mw.Upload.BookletLayout.Constructor;
          /** @deprecated Use `super` instead */
          parent: mw.Upload.BookletLayout.Constructor;
        }
      }

      const BookletLayout: BookletLayout.Constructor;
    }
  }
}

export {};
