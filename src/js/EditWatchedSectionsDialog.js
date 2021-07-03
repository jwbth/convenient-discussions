/**
 * "Edit watched sections" dialog class.
 *
 * @module EditWatchedSectionsDialog
 */

import CdError from './CdError';
import cd from './cd';
import { addPreventUnloadCondition } from './eventHandlers';
import { confirmCloseDialog, handleDialogError, isDialogUnsaved, tweakUserOoUiClass } from './ooui';
import { focusInput, unique } from './util';
import { getPageIds, getPageTitles } from './apiWrappers';
import { getWatchedSections, setWatchedSections } from './options';

/**
 * Class used to create an "Edit watched sections" dialog.
 *
 * @augments external:OO.ui.ProcessDialog
 */
export default class EditWatchedSectionsDialog extends OO.ui.ProcessDialog {
  static name = 'editWatchedSectionsDialog';
  static title = cd.s('ewsd-title');
  static actions = [
    {
      action: 'close',
      modes: ['edit', 'saved'],
      flags: ['safe', 'close'],
      disabled: true,
    },
    {
      action: 'save',
      modes: ['edit'],
      label: cd.s('ewsd-save'),
      flags: ['primary', 'progressive'],
      disabled: true,
    },
  ];
  static size = 'large';

  /**
   * Create an "Edit watched sections" dialog.
   */
  constructor() {
    super();
    this.watchedSectionsRequest = getWatchedSections();
  }

  /**
   * OOUI native method to get the height of the window body.
   *
   * @returns {number}
   * @see
   *   https://doc.wikimedia.org/mediawiki-core/master/js/#!/api/OO.ui.Window-method-getBodyHeight
   */
  getBodyHeight() {
    return this.$errorItems ? this.$errors.get(0).scrollHeight : this.$body.get(0).scrollHeight;
  }

  /**
   * OOUI native method that initializes window contents.
   *
   * @param {...*} [args]
   * @see
   *   https://doc.wikimedia.org/mediawiki-core/master/js/#!/api/OO.ui.ProcessDialog-method-initialize
   * @see https://www.mediawiki.org/wiki/OOUI/Windows#Window_lifecycle
   */
  initialize(...args) {
    super.initialize(...args);

    this.pushPending();

    const $loading = $('<div>').text(cd.s('loading-ellipsis'));
    this.loadingPanel = new OO.ui.PanelLayout({
      padded: true,
      expanded: false,
    });
    this.loadingPanel.$element.append($loading);

    this.sectionsPanel = new OO.ui.PanelLayout({
      padded: false,
      expanded: false,
    });

    const $watchedSectionsSaved = $('<p>').text(cd.s('ewsd-saved'));
    this.savedPanel = new OO.ui.PanelLayout({
      padded: true,
      expanded: false,
    });
    this.savedPanel.$element.append($watchedSectionsSaved);

    this.stackLayout = new OO.ui.StackLayout({
      items: [this.loadingPanel, this.sectionsPanel, this.savedPanel],
    });

    this.$body.append(this.stackLayout.$element);
  }

  /**
   * OOUI native method that returns a "setup" process which is used to set up a window for use in a
   * particular context, based on the `data` argument.
   *
   * @param {object} [data] Dialog opening data
   * @returns {external:OO.ui.Process}
   * @see
   *   https://doc.wikimedia.org/mediawiki-core/master/js/#!/api/OO.ui.Dialog-method-getSetupProcess
   * @see https://www.mediawiki.org/wiki/OOUI/Windows#Window_lifecycle
   */
  getSetupProcess(data) {
    return super.getSetupProcess(data).next(() => {
      this.stackLayout.setItem(this.loadingPanel);
      this.actions.setMode('edit');
    });
  }

  /**
   * OOUI native method that returns a "ready" process which is used to ready a window for use in a
   * particular context, based on the `data` argument.
   *
   * @param {object} data Window opening data
   * @returns {external:OO.ui.Process}
   * @see
   *   https://doc.wikimedia.org/mediawiki-core/master/js/#!/api/OO.ui.Window-method-getReadyProcess
   * @see https://www.mediawiki.org/wiki/OOUI/Windows#Window_lifecycle
   */
  getReadyProcess(data) {
    return super.getReadyProcess(data).next(async () => {
      let pages;
      try {
        await this.watchedSectionsRequest;
        const pageIds = Object.keys(cd.g.watchedSections)
          .filter((pageId) => cd.g.watchedSections[pageId].length);
        pages = await getPageTitles(pageIds);
      } catch (e) {
        handleDialogError(this, e, 'ewsd-error-processing', false);
        return;
      }

      // Logically, there should be no coinciding titles between pages, so we don't need a
      // separate "return 0" condition.
      pages.sort((page1, page2) => page1.title > page2.title ? 1 : -1);

      const value = pages
        // Filter out deleted pages
        .filter((page) => page.title)

        .map((page) => (
          cd.g.watchedSections[page.pageid]
            .map((section) => `${page.title}#${section}`)
            .join('\n')
        ))
        .join('\n');

      this.input = new OO.ui.MultilineTextInputWidget({
        value,
        rows: 30,
        classes: ['cd-editWatchedSections-input'],
      });
      this.input.on('change', (newValue) => {
        this.actions.setAbilities({ save: newValue !== value });
      });

      this.sectionsPanel.$element.append(this.input.$element);

      this.stackLayout.setItem(this.sectionsPanel);
      focusInput(this.input);
      this.actions.setAbilities({ close: true });

      // A dirty workaround to avoid a scrollbar appearing when the window is loading. Couldn't
      // figure out a way to do this out of the box.
      this.$body.css('overflow', 'hidden');
      setTimeout(() => {
        this.$body.css('overflow', '');
      }, 500);

      cd.g.windowManager.updateWindowSize(this);
      this.popPending();

      addPreventUnloadCondition('dialog', () => isDialogUnsaved(this));
    });
  }

  /**
   * OOUI native method that returns a process for taking action.
   *
   * @param {string} action Symbolic name of the action.
   * @returns {external:OO.ui.Process}
   * @see
   *   https://doc.wikimedia.org/mediawiki-core/master/js/#!/api/OO.ui.Dialog-method-getActionProcess
   */
  getActionProcess(action) {
    if (action === 'save') {
      return new OO.ui.Process(async () => {
        this.pushPending();

        const sections = {};
        const pageTitles = [];
        this.input
          .getValue()
          .split('\n')
          .forEach((section) => {
            const match = section.match(/^(.+?)#(.+)$/);
            if (match) {
              const pageTitle = match[1].trim();
              const sectionTitle = match[2].trim();
              if (!sections[pageTitle]) {
                sections[pageTitle] = [];
                pageTitles.push(pageTitle);
              }
              sections[pageTitle].push(sectionTitle);
            }
          });

        let normalized;
        let redirects;
        let pages;
        try {
          ({ normalized, redirects, pages } = await getPageIds(pageTitles) || {});
        } catch (e) {
          handleDialogError(this, e, 'ewsd-error-processing', true);
          return;
        }

        // Correct to normalized titles && redirect targets, add to the collection.
        normalized
          .concat(redirects)
          .filter((page) => sections[page.from])
          .forEach((page) => {
            if (!sections[page.to]) {
              sections[page.to] = [];
            }
            sections[page.to].push(...sections[page.from]);
            delete sections[page.from];
          });

        const titleToId = {};
        pages
          .filter((page) => page.pageid !== undefined)
          .forEach((page) => {
            titleToId[page.title] = page.pageid;
          });

        cd.g.watchedSections = {};
        Object.keys(sections)
          .filter((key) => titleToId[key])
          .forEach((key) => {
            cd.g.watchedSections[titleToId[key]] = sections[key].filter(unique);
          });

        try {
          await setWatchedSections();
        } catch (e) {
          if (e instanceof CdError) {
            const { type, code, apiData } = e.data;
            if (type === 'internal' && code === 'sizeLimit') {
              const error = new OO.ui.Error(cd.s('ewsd-error-maxsize'), { recoverable: false });
              this.showErrors(error);
            } else {
              const error = new OO.ui.Error(cd.s('ewsd-error-processing'), { recoverable: true });
              this.showErrors(error);
            }
            console.warn(type, code, apiData);
          } else {
            const error = new OO.ui.Error(cd.s('error-javascript'), { recoverable: false });
            this.showErrors(error);
            console.warn(e);
          }
          this.popPending();
          return;
        }

        this.stackLayout.setItem(this.savedPanel);
        this.actions.setMode('saved');

        this.popPending();
      });
    } else if (action === 'close') {
      return new OO.ui.Process(async () => {
        await confirmCloseDialog(this, 'ewsd');
      });
    }
    return super.getActionProcess(action);
  }
}

tweakUserOoUiClass(EditWatchedSectionsDialog, OO.ui.ProcessDialog);
