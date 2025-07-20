import CdError from './CdError';
import ProcessDialog from './ProcessDialog';
import PseudoLink from './Pseudolink';
import cd from './cd';
import { canonicalUrlToPageName, defined, generateFixedPosTimestamp, getDbnameForHostname, zeroPad } from './utils-general';
import { createTextControl, createCheckboxControl, createRadioControl, es6ClassToOoJsClass, mixInClass, createTitleControl } from './utils-oojs';
import { mergeJquery, wrapHtml } from './utils-window';

/**
 * @class Upload
 * @memberof mw
 * @see https://doc.wikimedia.org/mediawiki-core/master/js/mw.Upload.html
 */

/**
 * @class Dialog
 * @memberof mw.Upload
 * @see https://doc.wikimedia.org/mediawiki-core/master/js/mw.Upload.Dialog.html
 */

/**
 * Class that extends {@link mw.Upload.Dialog} and adds some logic we need. Uses
 * {@link ForeignStructuredUploadBookletLayout}, which in turn uses {@link ForeignStructuredUpload}.
 */
export class UploadDialog extends mixInClass(
  /** @type {typeof mw.Upload.Dialog<typeof ForeignStructuredUploadBookletLayout>} */ (
    mw.Upload.Dialog
  ),
  ProcessDialog
) {
  /**
   * Create an upload dialog.
   *
   * @param {object} [config={}]
   */
  constructor(config = {}) {
    super(/** @type {mw.Upload.Dialog.Config<typeof ForeignStructuredUploadBookletLayout>} */ ({
      bookletClass: ForeignStructuredUploadBookletLayout,
      booklet: {
        target: mw.config.get('wgServerName') === 'commons.wikimedia.org' ? 'local' : 'shared',
      },
      classes: ['cd-uploadDialog'],
      ...config,
    }));
  }

  /**
   * OOUI native method that returns a "setup" process which is used to set up a window for use in a
   * particular context, based on the `data` argument.
   *
   * We load some stuff in here and modify the booklet's behavior (we can't do that in
   * {@link ForeignStructuredUploadBookletLayout#initialize} because we need some data loaded
   * first).
   *
   * @param {object} data Dialog opening data
   * @returns {OO.ui.Process}
   * @see https://doc.wikimedia.org/oojs-ui/master/js/OO.ui.ProcessDialog.html#getSetupProcess
   * @see https://www.mediawiki.org/wiki/OOUI/Windows#Window_lifecycle
   * @ignore
   */
  getSetupProcess(data) {
    // This script is optional and used to improve description field values by using correct project
    // names and prefixes. With it, `wikt:fr:` will translate into `French Wiktionary` and
    // `fr.wiktionary.org` will translate into `wikt:fr:`.
    mw.loader.load('https://en.wikipedia.org/w/index.php?title=User:Jack_who_built_the_house/getUrlFromInterwikiLink.js&action=raw&ctype=text/javascript');

    const projectNameMsgName = 'project-localized-name-' + mw.config.get('wgDBname');
    const messagesPromise = cd.getApi().loadMessagesIfMissing([
      projectNameMsgName,

      // "I agree to irrevocably release this file under CC BY-SA 4.0"
      'upload-form-label-own-work-message-commons',

      // "Must contain a valid copyright tag"
      'mwe-upwiz-license-custom-explain',
      'mwe-upwiz-license-custom-url',
    ]);
    const enProjectNamePromise = cd.g.userLanguage === 'en' ?
      undefined :
      cd.getApi().getMessages(projectNameMsgName, { amlang: 'en' });

    return super.getSetupProcess(data)
      .next(async () => {
        let enProjectName;
        try {
          await messagesPromise;
          enProjectName = (
            (await enProjectNamePromise)?.[projectNameMsgName] ||
            cd.mws(projectNameMsgName)
          );
        } catch {
          // Empty
        }

        data.commentForm?.popPending();

        // For some reason there is no handling of network errors; the dialog just outputs "http".
        if (
          messagesPromise.state() === 'rejected' ||
          this.uploadBooklet.upload.getApi().state() === 'rejected'
        ) {
          this.handleError(new CdError(), 'cf-error-uploadimage', false);
          return;
        }

        this.uploadBooklet
          .on('changeSteps', this.updateActionLabels.bind(this))
          .on('submitUpload', this.executeAction.bind(this, 'upload'));
        this.uploadBooklet.setup(data.file, enProjectName);
      });
  }

  /**
   * OOUI native method that returns a "ready" process which is used to ready a window for use in a
   * particular context.
   *
   * We focus the title input here.
   *
   * @returns {OO.ui.Process}
   * @see https://doc.wikimedia.org/oojs-ui/master/js/OO.ui.ProcessDialog.html#getReadyProcess
   * @see https://www.mediawiki.org/wiki/OOUI/Windows#Window_lifecycle
   * @ignore
   */
  getReadyProcess() {
    return super.getReadyProcess().next(() => {
      this.uploadBooklet.controls?.title.input.focus();
    });
  }

  /**
   * OOUI native method that returns a process for taking action.
   *
   * We alter the handling of the `'upload'` and `'cancelupload'` actions.
   *
   * @param {string} action Symbolic name of the action.
   * @returns {OO.ui.Process}
   * @see https://doc.wikimedia.org/oojs-ui/master/js/OO.ui.ProcessDialog.html#getActionProcess
   * @ignore
   */
  getActionProcess(action) {
    if (action === 'upload') {
      // @ts-ignore: We need this protected method here
      let process = new OO.ui.Process(this.uploadBooklet.uploadFile());
      if (this.autosave) {
        process = process.next(() => {
          // eslint-disable-next-line no-one-time-vars/no-one-time-vars
          const promise = this.executeAction('save').fail(() => {
            // Reset the ability
            // @ts-ignore: We need this protected method here
            this.uploadBooklet.onInfoFormChange();
          });
          this.actions.setAbilities({ save: false });

          return promise;
        });
      }
      return process;
    } else if (action === 'cancelupload') {
      // The upstream dialog calls .initialize() here which clears all inputs including the file.
      // We don't want that.
      this.uploadBooklet.cancelUpload()
      return new OO.ui.Process();
    }

    return super.getActionProcess(action);
  }

  /**
   * OOUI native method to get the height of the window body.
   *
   * @returns {number}
   * @see https://doc.wikimedia.org/oojs-ui/master/js/OO.ui.ProcessDialog.html#getBodyHeight
   * @ignore
   */
  getBodyHeight() {
    return 620;
  }

  /**
   * Update the labels of actions.
   *
   * @param {boolean} autosave Whether to save the upload when clicking the main button.
   * @protected
   */
  updateActionLabels(autosave) {
    this.autosave = autosave;
    if (this.autosave) {
      this.actions.get({ actions: ['upload', 'save'] }).forEach((action) => {
        action.setLabel(cd.s('ud-uploadandsave'));
      });
    } else {
      this.actions.get({ actions: ['upload', 'save'] }).forEach((action) => {
        action.setLabel(cd.mws(`upload-dialog-button-${action.getAction()}`));
      });
    }
  }

  /**
   * @class Error
   * @memberof OO.ui
   * @see https://doc.wikimedia.org/oojs-ui/master/js/OO.ui.Error.html
   */

  /**
   * OOUI native method.
   *
   * Here we use a hack to hide the second identical error message that can appear since we execute
   * two actions, not one ("Upload and save").
   *
   * @param {OO.ui.Error} errors
   */
  showErrors(errors) {
    this.hideErrors();

    super.showErrors(errors);
  }
}

/**
 * @class BookletLayout
 * @memberof mw.ForeignStructuredUpload
 * @see https://doc.wikimedia.org/mediawiki-core/master/js/mw.ForeignStructuredUpload.BookletLayout.html
 */

/**
 * Class extending
 * {@link mw.ForeignStructuredUpload.BookletLayout mw.ForeignStructuredUpload.BookletLayout} and
 * adding more details to the process of uploading a file using the {@link ForeignStructuredUpload}
 * model. See {@link UploadDialog} for the dialog itself.
 *
 * @augments mw.ForeignStructuredUpload.BookletLayout
 */
class ForeignStructuredUploadBookletLayout extends mw.ForeignStructuredUpload.BookletLayout {
  /**
   * @typedef {{
   *   preset: 'radio';
   *   title: 'title';
   *   configure: 'checkbox';
   *   source: 'text';
   *   author: 'text';
   *   license: 'text';
   * }} UploadDialogControlTypes
   */

  controls = /** @type {ControlTypesByName<UploadDialogControlTypes>} */ ({});

  /**
   * @type {ForeignStructuredUpload}
   */
  upload;

  /**
   * Create a booklet layout for foreign structured upload.
   *
   * @param  {...any} args
   */
  constructor(...args) {
    super(...args);

    // Workaround to make this.constructor in methods to be type checked correctly
    this.constructor = ForeignStructuredUploadBookletLayout;
  }

  /**
   * Setup the booklet with some data. (This method is not in the parent class - it's our own.)
   *
   * @param {File} file
   * @param {string} [enProjectName]
   */
  setup(file, enProjectName) {
    this.modifyUploadForm();
    this.modifyInfoForm();

    if (file) {
      this.setFile(file);
    }
    this.enProjectName = enProjectName;
    this
      .on('fileSaved', () => {
        // Pretend that the page hasn't changed to 'insert'
        this.setPage('info');
      });
    this.onPresetChange();
  }

  /**
   * Add content and logic to the upload form.
   *
   * @protected
   */
  modifyUploadForm() {
    // We hide that checkbox, replacing it with a radio select
    this.ownWorkCheckbox.setSelected(true);

    const fieldset = /** @type {OO.ui.FieldsetLayout} */ (this.uploadForm.getItems()[0]);

    // Hide everything related to the "own work" checkbox
    /** @type {OO.ui.FieldLayout[]} */ (fieldset.getItems()).slice(1).forEach((layout) => {
      layout.toggle(false);
    });

    this.controls.preset = createRadioControl({
      label: cd.s('ud-preset'),
      options: [
        {
          data: 'projectScreenshot',
          label: cd.s(
            'ud-preset-projectscreenshot',
            cd.mws('project-localized-name-' + mw.config.get('wgDBname'))
          ),
          help: cd.s('ud-preset-projectscreenshot-help'),
          selected: true,
        },
        {
          data: 'mediawikiScreenshot',
          label: cd.s('ud-preset-mediawikiscreenshot'),
        },
        {
          data: 'ownWork',
          label: cd.s('ud-preset-ownwork'),
          help: wrapHtml(cd.mws('upload-form-label-own-work-message-commons')),
        },
        {
          data: 'no',
          label: cd.s('ud-preset-no'),
        },
      ],
    });

    this.controls.title = createTitleControl({
      $overlay: this.$overlay,
      showMissing: false,
      showSuggestionsOnFocus: false,
      value: '',
      label: cd.s('ud-preset-projectscreenshot-title'),
      help: mergeJquery(
        this.insertSubjectPageButton
          ? $('<div>').append(this.insertSubjectPageButton.element)
          : undefined,
        this.insertTalkPageButton
          ? $('<div>').append(this.insertTalkPageButton.element)
          : undefined,
        $('<div>').html(cd.sParse('ud-preset-projectscreenshot-title-help'))
      ),
      classes: ['cd-uploadDialog-fieldLayout-internal'],
    });

    const subjectPage = cd.page.mwTitle.getSubjectPage();
    if (subjectPage) {
      this.insertSubjectPageButton = new PseudoLink({
        label: subjectPage.getPrefixedText(),
        input: this.controls.title.input,
      });
    }
    if (cd.page.mwTitle.isTalkPage()) {
      this.insertTalkPageButton = new PseudoLink({
        label: cd.page.name,
        input: this.controls.title.input,
      });
    }
    const projectScreenshotItem = /** @type {import('./RadioOptionWidget').default} */ (
      this.controls.preset.input.findItemFromData('projectScreenshot')
    );
    projectScreenshotItem.$label.append(this.controls.title.field.$element);

    this.controls.configure = createCheckboxControl({
      value: 'configure',
      label: cd.s('ud-configure'),
    });
    fieldset.addItems([this.controls.preset.field, this.controls.configure.field]);

    this.controls.preset.input
      .on('select', this.onPresetChange.bind(this));
    projectScreenshotItem.radio.$input
      .on('focus', () => {
        this.controls.title.input.focus();
      });
    this.configureManuallySelected = false;
    this.controls.configure.input
      .on('change', this.onPresetChange.bind(this))
      .on('manualChange', (selected) => {
        this.configureManuallySelected = selected;
      });
    this.controls.title.input
      .on('change', this.onUploadFormChange.bind(this))
      .on('enter', this.emit.bind(this, 'submitUpload'));
  }

  /**
   * Handle change events to the upload form.
   *
   * @see https://doc.wikimedia.org/mediawiki-core/master/js/mw.ForeignStructuredUpload.BookletLayout.html#onUploadFormChange
   * @protected
   * @override
   */
  async onUploadFormChange() {
    let valid = true;
    if (this.controls) {
      await this.controls.title.input.getValidity().catch(() => {
        valid = false;
      });
    }
    this.emit('uploadValid', this.selectFileWidget.getValue() && valid);
  }

  /**
   * Handle events changing the preset.
   *
   * @param {OO.ui.RadioOptionWidget|boolean} [itemOrSelected]
   * @protected
   */
  onPresetChange(itemOrSelected) {
    const preset = /** @type {import('./RadioOptionWidget').default} */ (
      this.controls.preset.input.findSelectedItem()
    )?.getData();
    const titleInputDisabled = preset !== 'projectScreenshot';
    this.controls.title.input.setDisabled(titleInputDisabled);
    this.insertSubjectPageButton?.setDisabled(titleInputDisabled);
    this.insertTalkPageButton?.setDisabled(titleInputDisabled);

    if (typeof itemOrSelected !== 'boolean') {
      // A radio option was selected, not the checkbox.
      if (preset === 'no') {
        this.configureManuallySelected = this.controls.configure.input.isSelected();
        this.controls.configure.input.setDisabled(true).setSelected(true);
      } else {
        this.controls.configure.input.setDisabled(false).setSelected(this.configureManuallySelected);
      }
    }

    this.emit('changeSteps', this.isInfoFormOmitted());
  }

  /**
   * Find out whether the information form should be omitted given the current state of controls.
   *
   * @returns {boolean}
   * @protected
   */
  isInfoFormOmitted() {
    const preset = /** @type {import('./RadioOptionWidget').default} */ (
      this.controls.preset.input.findSelectedItem()
    )?.getData();
    return (
      (preset === 'projectScreenshot' || preset === 'mediawikiScreenshot') &&
      !this.controls.configure.input.isSelected()
    );
  }

  /**
   * Find out whether the inputs we added to the information form should be disabled.
   *
   * @returns {boolean}
   * @protected
   */
  areAddedInputsDisabled() {
    return (
      /** @type {import('./RadioOptionWidget').default} */ (
        this.controls.preset.input.findSelectedItem()
      )?.getData() === 'ownWork' && !this.controls.configure.input.isSelected()
    );
  }

  /**
   * Add content and logic to the information form.
   *
   * @protected
   */
  modifyInfoForm() {
    this.controls.source = createTextControl({
      label: cd.s('ud-source'),
      required: true,
    });
    this.controls.author = createTextControl({
      label: cd.s('ud-author'),
      required: true,
    });
    this.controls.license = createTextControl({
      label: cd.s('ud-license'),
      required: true,
      classes: ['cd-input-monospace'],
      help: wrapHtml(
        cd.mws('mwe-upwiz-license-custom-explain', null, cd.mws('mwe-upwiz-license-custom-url')),
        { targetBlank: true }
      ),
    });

    this.controls.source.input.on('change', this.onInfoFormChange.bind(this));
    this.controls.author.input.on('change', this.onInfoFormChange.bind(this));
    this.controls.license.input.on('change', this.onInfoFormChange.bind(this));

    // Add items to the fieldset
    /** @type {OO.ui.FieldsetLayout} */ (this.infoForm.getItems()[1]).addItems([
      this.controls.source.field,
      this.controls.author.field,
      this.controls.license.field,
    ], 2);
  }

  /**
   * Handle change events to the information form.
   *
   * @see https://doc.wikimedia.org/mediawiki-core/master/js/mw.ForeignStructuredUpload.BookletLayout.html#onInfoFormChange
   * @protected
   * @override
   */
  async onInfoFormChange() {
    let valid = true;
    await Promise.all(
      [
        this.uploadPromise,
        this.filenameWidget.getValidity(),
        this.descriptionWidget.getValidity(),
        this.controls?.source.input.getValidity(),
        this.controls?.author.input.getValidity(),
        this.controls?.license.input.getValidity(),
      ].filter(defined)
    ).catch(() => {
      valid = false;
    });
    this.emit('infoValid', valid);
  }

  /**
   * Returns a {@link mw.ForeignStructuredUpload mw.ForeignStructuredUpload} with the target
   * specified in config.
   *
   * @returns {ForeignStructuredUpload}
   * @protected
   * @override
   */
  createUpload() {
    return new ForeignStructuredUpload(this.target);
  }

  /**
   * Native methods that uploads the file that was added in the upload form. Uses
   * {@link mw.Upload.BookletLayout#getFile getFile} to get the HTML5 file object.
   *
   * We add logic that changes the information form according to the user input in the upload form.
   *
   * @see
   * https://doc.wikimedia.org/mediawiki-core/master/js/mw.ForeignStructuredUpload.BookletLayout.html#uploadFile
   * @returns {JQuery.Promise}
   * @protected
   * @override
   */
  uploadFile() {
    const preset = /** @type {import('./RadioOptionWidget').default} */ (
      this.controls.preset.input.findSelectedItem()
    )?.getData();

    // Keep the inputs if the user pressed "Back" and didn't choose another preset.
    if (this.preset && preset !== this.preset) {
      this.clear();
    }
    this.preset = preset;

    let deferred = super.uploadFile();

    // Use UTC date to make it precise and avoid leaking the user's timezone
    const date = moment().utc().locale('en');

    // Use +2 days as the max date to avoid getting the user confused if they want to set the local
    // date nevertheless
    this.dateWidget.mustBeBefore = moment(date.clone().add(2, 'day').format('YYYY-MM-DD'));

    let pageName = '';
    let historyText = '';
    let hasIwPrefix;
    let filenameDate;
    if (this.preset === 'projectScreenshot' || this.preset === 'mediawikiScreenshot') {
      filenameDate = (
        this.getExactDateFromLastModified(/** @type {File} */ (this.getFile())) ||
        date.format('YYYY-MM-DD HH-mm-ss')
      );

      const title = this.controls.title.input.getMWTitle();
      if (title) {
        pageName = title.getPrefixedText();

        // Rough check, because we don't need to know for sure (that's just to make the description
        // more human-readable, with a project name instead of a domain).
        hasIwPrefix = /:[^ ]/.test(title.getMainText());

        if (hasIwPrefix) {
          // Avoid uppercasing the first character; that would make interwiki prefixes look weird.
          pageName = this.controls.title.input.getValue();
        }

        historyText = this.constructor.generateHistoryText(cd.g.serverName, pageName);
      }
    }

    switch (this.preset) {
      case 'projectScreenshot': {
        // * If the page name has an interwiki prefix, we don't know the project name.
        // * If the page name does not have an interwiki prefix, we don't know the interwiki prefix.
        // So, we use what is availble to us while trying to get/load missing parts if we can.

        const projectName = hasIwPrefix ? '' : this.enProjectName;
        const filenameMainPart = `${projectName} ${pageName}`
          .trim()
          .replace(new RegExp('[' + mw.config.get('wgIllegalFileChars', '') + ']', 'g'), '-');
        const projectNameOrPageLink = (
          projectName ||
          (hasIwPrefix && !pageName.startsWith(':') ? `[[:${pageName}]]` : `[[${pageName}]]`)
        );
        let pageNameOrProjectName;
        if (!hasIwPrefix && pageName && getInterwikiPrefixForHostnameSync) {
          const prefix = getInterwikiPrefixForHostnameSync(
            cd.g.serverName,
            'commons.wikimedia.org'
          );
          pageNameOrProjectName = `[[:${prefix}${pageName}]]`;
        } else {
          pageNameOrProjectName = projectNameOrPageLink;
        }
        this.filenameWidget.setValue(`${filenameMainPart} ${filenameDate}`);
        this.descriptionWidget.setValue(`Screenshot of ${pageNameOrProjectName}`);
        this.controls.source.input.setValue('Screenshot');
        this.controls.author.input.setValue(`${projectNameOrPageLink} authors${historyText}`);
        this.controls.license.input.setValue(
          hasIwPrefix ?
            '{{Wikimedia-screenshot}}' :
            this.constructor.getTemplateForHostname(cd.g.serverName)
        );

        // Load the English project name for the file name if we can
        if (hasIwPrefix) {
          deferred = deferred
            .then(
              () => getUrlFromInterwikiLink?.(pageName),
              (error) => {
                throw ['badUpload', error];
              }
            )
            .then(
              (url) => {
                if (!url) {
                  throw [];
                }
                const hostname = new URL(url, cd.g.server).hostname;
                this.controls.license.input.setValue(
                  this.constructor.getTemplateForHostname(hostname)
                );
                const dbname = getDbnameForHostname(hostname);
                return Promise.all([
                  cd.getApi().getMessages(`project-localized-name-${dbname}`, {
                    amlang: 'en',
                  }),
                  canonicalUrlToPageName(url),
                  hostname,
                ]);
              })
            .then(
              ([messages, unprefixedPageName, hostname]) => {
                if (!messages) return;
                const projectName = Object.values(messages)[0];
                const historyText = this.constructor.generateHistoryText(
                  hostname,
                  unprefixedPageName
                );
                this.filenameWidget.setValue(`${projectName} ${unprefixedPageName} ${filenameDate}`);
                this.controls.author.input.setValue(`${projectName} authors${historyText}`);
              },
              (error) => {
                // Unless there is something wrong with uploading, always resolve - this
                // functionality is non-essential.
                if (error[0] === 'badUpload') {
                  throw error[1];
                }
              }
            );
        }
        break;
      }

      case 'mediawikiScreenshot': {
        this.filenameWidget.setValue(`MediaWiki ${filenameDate}`);
        this.descriptionWidget.setValue(`Screenshot of MediaWiki`);
        this.controls.source.input.setValue('Screenshot');
        this.controls.author.input.setValue(`[[Special:Version|MediaWiki contributors]]`);
        this.controls.license.input.setValue('{{MediaWiki-screenshot}}');
        this.categoriesWidget.addTag('MediaWiki screenshots');
        break;
      }

      case 'ownWork': {
        this.controls.source.input.setValue(this.upload.config.format.ownwork);
        this.controls.author.input.setValue(this.upload.getDefaultUser());
        this.controls.license.input.setValue(this.upload.config.format.license);
        break;
      }
    }

    const omitted = this.isInfoFormOmitted();
    const addedInputsDisabled = this.areAddedInputsDisabled();
    this.filenameWidget.setDisabled(omitted);
    this.descriptionWidget.setDisabled(omitted);
    this.categoriesWidget.setDisabled(omitted);
    this.dateWidget.setDisabled(omitted);
    this.controls.source.input.setDisabled(omitted || addedInputsDisabled);
    this.controls.author.input.setDisabled(omitted || addedInputsDisabled);
    this.controls.license.input.setDisabled(omitted || addedInputsDisabled);

    deferred.catch(() => {
      // Hack to reenable the upload action after an error
      this.onUploadFormChange();
    });

    // If the promise failed, return the failed promise, not catched
    return deferred;
  }

  /**
   * Native method that gets last modified date from file.
   *
   * We make the last modified date to use UTC to make it precise and avoid leaking the user's
   * timezone. This is for screenshots and files on the computer; we keep the original behavior for
   * EXIF.
   *
   * See also
   * {@link ForeignStructuredUploadBookletLayout#getExactDateFromLastModified getExactDateFromLastModified}.
   *
   * @param {File} [file]
   * @returns {string|undefined} Last modified date from file
   * @see
   *   https://doc.wikimedia.org/mediawiki-core/master/js/mw.ForeignStructuredUpload.BookletLayout.html#getDateFromLastModified
   * @protected
   * @override
   */
  getDateFromLastModified(file) {
    if (file?.lastModified) {
      return moment(file.lastModified).utc().format('YYYY-MM-DD');
    }
  }

  /**
   * Get the last modified date from file in UTC, including hours, minutes, and seconds.
   *
   * See also
   * {@link ForeignStructuredUploadBookletLayout#getDateFromLastModified getDateFromLastModified}.
   *
   * @param {File} file
   * @returns {string|undefined} Last modified date from file
   * @protected
   */
  getExactDateFromLastModified(file) {
    if (file.lastModified) {
      return moment(file.lastModified).utc().format('YYYY-MM-DD HH-mm-ss');
    }
  }

  /**
   * Native method that gets the page text from the
   * {@link mw.ForeignStructuredUpload.BookletLayout#infoForm information form}.
   *
   * @returns {string}
   * @see
   *   https://doc.wikimedia.org/mediawiki-core/master/js/mw.ForeignStructuredUpload.BookletLayout.html#getText
   * @protected
   * @override
   */
  getText() {
    this.upload.setSource(this.controls.source.input.getValue());
    this.upload.setUser(this.controls.author.input.getValue());
    this.upload.setLicense(this.controls.license.input.getValue());
    return super.getText();
  }

  /**
   * Native method that saves the stash finalizes upload. Uses
   * {@link mw.Upload.ForeignStructuredUpload#getFilename getFilename}, and
   * {@link ForeignStructuredUpload#getText getText} to get details from the form.
   *
   * @returns {JQuery.Promise}
   * @see
   *   https://doc.wikimedia.org/mediawiki-core/master/js/mw.ForeignStructuredUpload.BookletLayout.html#saveFile
   * @protected
   * @override
   */
  saveFile() {
    this.categoriesWidget.addTag('Uploaded with Convenient Discussions');

    const promise = super.saveFile();
    promise.catch(() => {
      if (this.isInfoFormOmitted()) {
        this.cancelUpload();
      }
    });

    // If the promise failed, return the failed promise, not catched
    return promise;
  }

  /**
   * Cancel the upload. (This method is not in the parent class - it's our own.)
   */
  cancelUpload() {
    this.onUploadFormChange();
    this.setPage('upload');
  }

  /**
   * Clear the values of the information form fields. Unlike the original dialog, we don't clear the
   * upload form, including the file input, when the user presses "Back". We don't clear the date
   * too. In the original dialog, there is not much to select on the first page apart from the file,
   * so clearing the file input would make sense there.
   *
   * @see
   *   https://doc.wikimedia.org/mediawiki-core/master/js/mw.ForeignStructuredUpload.BookletLayout.html#clear
   * @protected
   * @override
   */
  clear() {
    // No idea how .setValidityFlag(true) is helpful; borrowed it from
    // mw.Upload.BookletLayout.prototype.clear. When we clear the fields that were filled in (e.g.
    // by choosing the "Own work" preset, pressing "Upload", then pressing "Back", then choosing "No
    // preset", then pressing "Upload" again), they end up invalid anyway.
    this.progressBarWidget.setProgress(0);
    this.filenameWidget.setValue('').setValidityFlag(true);
    this.descriptionWidget.setValue('').setValidityFlag(true);
    this.categoriesWidget.setValue([]);
    if (!this.dateWidget.getValue()) {
      this.dateWidget.setValidityFlag(true);
    }

    // Clear the fields we added as well. We add them on the "setup" step, so they aren't there
    // when .clear() initially runs.
    this.controls?.source.input.setValue('').setValidityFlag(true);
    this.controls?.author.input.setValue('').setValidityFlag(true);
    this.controls?.license.input.setValue('').setValidityFlag(true);
  }

  /**
   * Generate the end part of text for the author input, linking page history.
   *
   * @param {string} hostname
   * @param {string} pageName
   * @returns {string}
   * @protected
   */
  static generateHistoryText(hostname, pageName) {
    if (
      !pageName ||

      // Don't link the history page for Special pages
      (hostname === location.hostname && mw.Title.newFromText(pageName)?.getNamespaceId() === -1)
    ) {
      return '';
    }
    const path = mw.util.getUrl(pageName, {
      action: 'history',
      offset: generateFixedPosTimestamp(new Date(), zeroPad(new Date().getUTCSeconds(), 2)),
    });
    const link = `https://${hostname}${path}`;
    return `, see the [${link} page history]`;
  }

  /**
   * Get the template markup for the hostname of a screenshot.
   *
   * @param {string} hostname
   * @returns {string}
   */
  static getTemplateForHostname(hostname) {
    let template;
    /** @type {Array<[RegExp, string]>} */ ([
      [/^(.+)\.wikipedia.org$/, `{{Wikipedia-screenshot%s}}`],

      // Language codes aren't supported on most templates, but they may become supported at some
      // point
      [/^(.+)\.wiktionary.org$/, `{{Wiktionary-screenshot%s}}`],
      [/^(.+)\.wikiquote.org$/, `{{Wikiquote-screenshot%s}}`],
      [/^(.+)\.wikiversity.org$/, `{{Wikiversity-screenshot%s}}`],

      // https://wikisource.org/ exists, so the subdomain is not necessary
      [/^(?:(.+)\.)?wikisource.org$/, `{{Wikisource-screenshot%s}}`],

      [/^(.+)\.wikivoyage.org$/, `{{Wikivoyage-screenshot%s}}`],
    ]).some(([regexp, format]) => {
      const match = hostname.match(regexp);
      if (match) {
        template = format.replace('%s', match[1] ? '|' + match[1] : '')
        return true;
      }
      return false;
    });
    return template || '{{Wikimedia-screenshot}}';
  }
}

/**
 * @class ForeignStructuredUpload
 * @memberof mw
 * @see https://doc.wikimedia.org/mediawiki-core/master/js/mw.ForeignStructuredUpload.html
 */

/**
 * Class extending {@link mw.ForeignStructuredUpload mw.ForeignStructuredUpload} and allowing to get
 * and set additional fields. See {@link UploadDialog} for the dialog.
 *
 * @augments mw.ForeignStructuredUpload
 */
class ForeignStructuredUpload extends mw.ForeignStructuredUpload {
  /**
   * Create a foreign structured upload.
   *
   * @param {string} [target] Used to choose the target repository. If nothing is passed,
   *   `mw.ForeignUpload#target` will be used (`'local'`).
   */
  constructor(target) {
    super(target, { ...cd.getApiConfig(), ...cd.g.apiErrorFormatHtml });
  }

  /**
   * Set the source.
   *
   * @param {string} source
   */
  setSource(source) {
    this.source = source;
  }

  /**
   * Set the author.
   *
   * @param {string} user
   */
  setUser(user) {
    this.user = user;
  }

  /**
   * Set the license.
   *
   * @param {string} license
   */
  setLicense(license) {
    this.license = license;
  }

  /**
   * Get the source.
   *
   * @returns {string}
   * @override
   */
  getSource() {
    return this.source ?? super.getSource();
  }

  /**
   * Get the author.
   *
   * @returns {string}
   * @override
   */
  getUser() {
    return this.user ?? this.getDefaultUser();
  }

  /**
   * Get the author as the parent method returns it.
   *
   * @returns {string}
   */
  getDefaultUser() {
    return super.getUser();
  }

  /**
   * Get the license.
   *
   * @returns {string}
   * @override
   */
  getLicense() {
    return this.license ?? super.getLicense();
  }
}

es6ClassToOoJsClass(UploadDialog);
es6ClassToOoJsClass(ForeignStructuredUploadBookletLayout)
es6ClassToOoJsClass(ForeignStructuredUpload);

export default UploadDialog;
