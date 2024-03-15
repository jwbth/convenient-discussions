/* global moment */

import Button from './Button';
import cd from './cd';
import controller from './controller';
import pageRegistry from './pageRegistry';
import { createCheckboxField, createTextField, getDivLabelWidgetClass, handleDialogError, tweakUserOoUiClass } from './ooui';
import { generateFixedPosTimestamp, getDbnameForHostname, wrap, zeroPad } from './utils';
import CdError from './CdError';

function createRadioField({ label, help, options }) {
  const items = options.map((config) => new RadioOptionWidget(config));
  const select = new OO.ui.RadioSelectWidget({ items });

  // Workarounds for T359920
  select.$element.off('mousedown');
  select.$focusOwner = $();

  const field = new OO.ui.FieldLayout(select, {
    label,
    align: 'top',
    help,
    helpInline: true,
  });

  return { field, select, items };
}

function generateHistoryText(hostname, pageName) {
  if (!pageName) {
    return '';
  }
  const path = mw.util.getUrl(pageName, {
    action: 'history',
    offset: generateFixedPosTimestamp(new Date(), zeroPad(new Date().getUTCSeconds(), 2)),
  });
  const link = `https://${hostname}${path}`;
  return `, see the [${link} history]`;
}

function canonicalUrlToPageName(url) {
  return decodeURIComponent(url.slice(url.indexOf('/wiki/') + 6)).replace(/_/g, ' ');
}

class RadioOptionWidget extends OO.ui.RadioOptionWidget {
  constructor(config) {
    super(config);

    this.$help = config.help ?
      this.createHelpElement(config.help) :
      $();
    this.$label.append(this.$help);
  }

  createHelpElement(text) {
    const helpWidget = new (getDivLabelWidgetClass())({
      label: text,
      classes: ['oo-ui-inline-help'],
    });
    this.radio.$input.attr('aria-describedby', helpWidget.getElementId());
    return helpWidget.$element;
  }
}

class PseudoLink extends Button {
  constructor(config) {
    super({
      classes: ['cd-pseudolink'],
      tooltip: cd.s('pseudolink-tooltip'),
      label: config.label,
      action: () => {
        config.input.setValue(config.text || config.label).focus();
      },
    });
  }
}

export default class UploadDialog extends mw.Upload.Dialog {
  constructor(config = {}) {
    super(Object.assign({
      bookletClass: ForeignStructuredUploadBookletLayout,
      booklet: {
        target: mw.config.get('wgServerName') === 'commons.wikimedia.org' ? 'local' : 'shared',
      },
      classes: ['cd-uploadDialog'],
    }, config));
  }

  getSetupProcess(data) {
    // This script is optional and used to improve description fields by using correct project
    // names and prefixes. With it, `wikt:fr:` will translate into "French Wiktionary" and
    // `fr.wiktionary.org` will translate into `wikt:fr:`.
    mw.loader.load('https://en.wikipedia.org/w/index.php?title=User:Jack_who_built_the_house/getUrlFromInterwikiLink.js&action=raw&ctype=text/javascript');

    const projectNameMsgName = 'project-localized-name-' + mw.config.get('wgDBname');
    const messagesPromise = controller.getApi().loadMessagesIfMissing([
      projectNameMsgName,

      // "I agree to irrevocably release this file under CC BY-SA 4.0"
      'upload-form-label-own-work-message-commons',

      // "Must contain a valid copyright tag"
      'mwe-upwiz-license-custom-explain',
      'mwe-upwiz-license-custom-url',
    ]);
    const enProjectNamePromise = cd.g.userLanguage === 'en' ?
      undefined :
      controller.getApi().getMessages(projectNameMsgName, { amlang: 'en' });

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

        // For some reason there is no handling of network errors, the dialog just outputs "http".
        if (
          messagesPromise.state() === 'rejected' ||
          this.uploadBooklet.upload.getApi().state() === 'rejected'
        ) {
          handleDialogError(this, new CdError(), 'cf-error-uploadimage', false);
          return;
        }

        this.uploadBooklet.modifyUploadForm();
        this.uploadBooklet.modifyInfoForm();

        if (data.file) {
          this.uploadBooklet.setFile(data.file);
        }
        this.uploadBooklet.enProjectName = enProjectName;
        this.uploadBooklet
          .on('changeSteps', this.updateActionLabels.bind(this))
          .on('submitUpload', () => {
            this.executeAction('upload');
          })
          .on('fileSaved', () => {
            // Pretend that the page hasn't changed to 'insert'
            this.uploadBooklet.setPage('info');
          });
        this.uploadBooklet.onPresetChange();
      });
  }

  getReadyProcess() {
    return super.getReadyProcess().next(() => {
      this.uploadBooklet.controls?.title.input.focus();
    });
  }

  getActionProcess(action) {
    if (action === 'upload') {
      let process = new OO.ui.Process(this.uploadBooklet.uploadFile());
      if (this.autosave) {
        process = process.next(() => {
          this.actions.setAbilities({ save: false });
          return this.executeAction('save').fail(() => {
            // Reset the ability
            this.uploadBooklet.onInfoFormChange();
          });
        });
      }
      return process;
    }
    if (action === 'cancelupload') {
      // The upstream dialog calls `initialize()` here which clears all inputs including the file.
      // We don't want that.
      return new OO.ui.Process(this.uploadBooklet.cancelUpload());
    }

    return super.getActionProcess(action);
  }

  getBodyHeight() {
    return 620;
  }

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

  showErrors(errors) {
    // // A hack to hide the second identical error message that can appear since we execute two
    // actions, not one ("Upload and save").
    this.hideErrors();

    super.showErrors(errors);
  }
}

class ForeignStructuredUploadBookletLayout extends mw.ForeignStructuredUpload.BookletLayout {
  constructor(...args) {
    super(...args);
  }

  modifyUploadForm() {
    // We hide that checkbox, replacing it with a radio select
    this.ownWorkCheckbox.setSelected(true);

    this.controls = {};

    const fieldset = this.uploadForm.items[0];

    // Hide everything related to the "own work" checkbox
    fieldset.items.slice(1).forEach((layout) => {
      layout.toggle(false);
    });

    this.controls.preset = createRadioField({
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
          help: wrap(cd.mws('upload-form-label-own-work-message-commons')),
        },
        {
          data: 'no',
          label: cd.s('ud-preset-no'),
        },
      ],
    });

    this.controls.title = {};
    this.controls.title.input = new mw.widgets.TitleInputWidget({
      $overlay: this.$overlay,
      showMissing: false,
      showSuggestionsOnFocus: false,
      value: '',
    });
    this.insertSubjectPageButton = new PseudoLink({
      label: pageRegistry.getCurrent().mwTitle.getSubjectPage().getPrefixedText(),
      input: this.controls.title.input,
    });
    if (pageRegistry.getCurrent().mwTitle.isTalkPage()) {
      this.insertTalkPageButton = new PseudoLink({
        label: pageRegistry.getCurrent().name,
        input: this.controls.title.input,
      });
    }
    this.controls.title.field = new OO.ui.FieldLayout(this.controls.title.input, {
      label: cd.s('ud-preset-projectscreenshot-title'),
      help: $.cdMerge(
        $('<div>').append(this.insertSubjectPageButton.element),
        this.insertTalkPageButton ? $('<div>').append(this.insertTalkPageButton.element) : undefined,
        $('<div>').html(cd.sParse('ud-preset-projectscreenshot-title-help')),
      ),
      align: 'top',
      helpInline: true,
      classes: ['cd-uploadDialog-fieldLayout-internal'],
    });
    const projectScreenshotItem = this.controls.preset.select.findItemFromData('projectScreenshot');
    projectScreenshotItem.$label.append(this.controls.title.field.$element);

    this.controls.configure = createCheckboxField({
      value: 'configure',
      label: cd.s('ud-configure'),
    });
    fieldset.addItems([this.controls.preset.field, this.controls.configure.field]);

    this.controls.preset.select
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
      .on('enter', () => {
        this.emit('submitUpload');
      });
  }

  async onUploadFormChange() {
    let valid = true;
    if (this.controls) {
      await this.controls.title.input.getValidity().catch(() => {
        valid = false;
      });
    }
    this.emit('uploadValid', this.selectFileWidget.getValue() && valid);
  }

  onPresetChange(itemOrSelected) {
    const preset = this.controls.preset.select.findSelectedItem().getData();
    const titleInputDisabled = preset !== 'projectScreenshot';
    this.controls.title.input.setDisabled(titleInputDisabled);
    this.insertSubjectPageButton.setDisabled(titleInputDisabled);
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

  isInfoFormOmitted() {
    const preset = this.controls.preset.select.findSelectedItem().getData();
    return (
      (preset === 'projectScreenshot' || preset === 'mediawikiScreenshot') &&
      !this.controls.configure.input.isSelected()
    );
  }

  areAddedInputsDisabled() {
    return (
      this.controls.preset.select.findSelectedItem().getData() === 'ownWork' &&
      !this.controls.configure.input.isSelected()
    );
  }

  modifyInfoForm() {
    this.controls.source = createTextField({
      label: cd.s('ud-source'),
      required: true,
    });
    this.controls.author = createTextField({
      label: cd.s('ud-author'),
      required: true,
    });
    this.controls.license = createTextField({
      label: cd.s('ud-license'),
      required: true,
      classes: ['cd-input-monospace'],
      help: wrap(
        cd.mws('mwe-upwiz-license-custom-explain', null, cd.mws('mwe-upwiz-license-custom-url')),
        { targetBlank: true }
      ),
    });

    this.controls.source.input.on('change', this.onInfoFormChange.bind(this));
    this.controls.author.input.on('change', this.onInfoFormChange.bind(this));
    this.controls.license.input.on('change', this.onInfoFormChange.bind(this));

    // Add items to the fieldset
    this.infoForm.items[1].addItems([
      this.controls.source.field,
      this.controls.author.field,
      this.controls.license.field,
    ], 2);
  }

  async onInfoFormChange() {
    let valid = true;
    await Promise.all(
      [
        this.uploadPromise,
        this.filenameWidget.getValidity(),
        this.descriptionWidget.getValidity(),
      ].concat(
        this.controls ?
          [
            this.controls.source.input.getValidity(),
            this.controls.author.input.getValidity(),
            this.controls.license.input.getValidity(),
          ] :
          []
      )
    ).catch(() => {
      valid = false;
    });
    this.emit('infoValid', valid);
  }

  createUpload() {
    return new ForeignStructuredUpload(this.target);
  }

  uploadFile() {
    let deferred = super.uploadFile();

    const preset = this.controls.preset.select.findSelectedItem().getData();

    let pageName = '';
    let historyText = '';
    let hasIwPrefix;
    let filenameDate;
    if (preset === 'projectScreenshot' || preset === 'mediawikiScreenshot') {
      // Use UTC dates to avoid leaking the user's timezone
      const date = moment().utc().locale('en');
      filenameDate = date.format('YYYY-MM-DD HH-mm-ss');
      this.dateWidget.calendar.setDate(date.format('YYYY-MM-DD'));
      this.dateWidget.mustBeBefore = moment(date.add(1, 'day').format('YYYY-MM-DD'));

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

        historyText = generateHistoryText(cd.g.serverName, pageName);
      }
    }

    switch (preset) {
      case 'projectScreenshot': {
        // * If the page name has an interwiki prefix, we don't know the project name.
        // * If the page name does not have an interwiki prefix, we don't know the interwiki prefix.
        // So, we use what is availble to us while trying to get/load missing parts if we can.

        const projectName = hasIwPrefix ? '' : this.enProjectName;
        const filenameMainPart = `${projectName} ${pageName}`.trim().replace(/:/g, '-');
        const pageNameOrProjectName = projectName || `[[${pageName}]]`;
        let projectNameOrPageName;
        if (!hasIwPrefix && pageName && getInterwikiPrefixForHostnameSync) {
          const prefix = getInterwikiPrefixForHostnameSync(
            cd.g.serverName,
            'commons.wikimedia.org'
          );
          projectNameOrPageName = `[[${prefix}${pageName}]]`;
        } else {
          projectNameOrPageName = pageNameOrProjectName;
        }
        const language = mw.config.get('wgContentLanguage');

        this.filenameWidget.setValue(`${filenameMainPart} ${filenameDate}`);
        this.descriptionWidget.setValue(`Screenshot of ${projectNameOrPageName}`);
        this.controls.source.input.setValue('Screenshot');
        this.controls.author.input.setValue(`${pageNameOrProjectName} authors${historyText}`);
        this.controls.license.input.setValue(
          cd.g.serverName.endsWith('.wikipedia.org') && !hasIwPrefix ?
            `{{Wikipedia-screenshot|1=${language}}}` :
            '{{Wikimedia-screenshot}}'
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
                const dbname = getDbnameForHostname(hostname);
                return Promise.all([
                  controller.getApi().getMessages(`project-localized-name-${dbname}`, {
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
                const historyText = generateHistoryText(hostname, unprefixedPageName);
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
      // Hack to reenable the upload action and clear the fields after an error
      this.clear();
    });

    // If the promise failed, return the failed promise, not catched
    return deferred;
  }

  getText() {
    this.upload.setSource(this.controls.source.input.getValue());
    this.upload.setUser(this.controls.author.input.getValue());
    this.upload.setLicense(this.controls.license.input.getValue());
    return super.getText();
  }

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

  cancelUpload() {
    this.clear();
    this.setPage('upload');
  }

  clear() {
    // Unlike the original dialog, we don't clear the upload form, including the file input, when
    // the user presses "Back". In the original dialog, there is not much to select on the first
    // page apart from the file, so clearing the file input would make sense there.
    //
    // No idea how `.setValidityFlag(true)` is helpful; borrowed it from
    // `mw.Upload.BookletLayout.prototype.clear`. When we clear the fields that were filled in (e.g.
    // by choosing the "Own work" preset, pressing "Upload", then pressing "Back", then choosing "No
    // preset", then pressing "Upload" again), they end up invalid anyway.
    this.progressBarWidget.setProgress(0);
    this.filenameWidget.setValue(null).setValidityFlag(true);
    this.descriptionWidget.setValue(null).setValidityFlag(true);
    this.categoriesWidget.setValue([]);
    this.dateWidget.setValue('').setValidityFlag(true);

    if (this.controls) {
      // Clear the fields we added as well. We add them on the "setup" step, so they aren't there when
      // `.clear()` initially runs.
      this.controls.source.input.setValue(null).setValidityFlag(true);
      this.controls.author.input.setValue(null).setValidityFlag(true);
      this.controls.license.input.setValue(null).setValidityFlag(true);
    }

    this.onUploadFormChange();
  }
}

class ForeignStructuredUpload extends mw.ForeignStructuredUpload {
  constructor(target) {
    super(target, {
      ...cd.getApiConfig(),
      ...cd.g.apiErrorFormatHtml,
    });
  }

  setSource(source) {
    this.source = source;
  }

  setUser(user) {
    this.user = user;
  }

  setLicense(license) {
    this.license = license;
  }

  getSource() {
    return this.source;
  }

  getUser() {
    return this.user || this.getDefaultUser();
  }

  getDefaultUser() {
    return super.getUser();
  }

  getLicense() {
    return this.license;
  }
}

tweakUserOoUiClass(RadioOptionWidget);
tweakUserOoUiClass(UploadDialog);
tweakUserOoUiClass(ForeignStructuredUploadBookletLayout)
tweakUserOoUiClass(ForeignStructuredUpload);
