import CdError from './CdError';
import cd from './cd';
import subscriptions from './subscriptions';
import { addPreventUnloadCondition } from './eventHandlers';
import { confirmCloseDialog, handleDialogError, isDialogUnsaved, tweakUserOoUiClass } from './ooui';
import { focusInput, unique } from './util';
import { getPageIds, getPageTitles } from './apiWrappers';

/**
 * Class used to create an "Edit subscriptions" dialog.
 *
 * @augments external:OO.ui.ProcessDialog
 */
class EditSubscriptionsDialog extends OO.ui.ProcessDialog {
  static name = 'editSubscriptionsDialog';
  static title = cd.s('ewsd-title');
  static actions = [
    {
      action: 'close',
      modes: ['edit'],
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
   * Create an "Edit subscriptions" dialog.
   */
  constructor() {
    super();
    if (cd.settings.useTopicSubscription) return;

    subscriptions.load();
  }

  /**
   * OOUI native method to get the height of the window body.
   *
   * @returns {number}
   * @see
   *   https://doc.wikimedia.org/mediawiki-core/master/js/#!/api/OO.ui.Window-method-getBodyHeight
   */
  getBodyHeight() {
    return this.$errorItems ? this.$errors.prop('scrollHeight') : this.$body.prop('scrollHeight');
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

    this.stackLayout = new OO.ui.StackLayout({
      items: [this.loadingPanel, this.sectionsPanel],
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
        await subscriptions.loadRequest;
        pages = await getPageTitles(subscriptions.getPageIds());
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
          subscriptions.getForPageId(page.pageid)
            .map((section) => `${page.title}#${section}`)
            .join('\n')
        ))
        .join('\n');

      this.input = new OO.ui.MultilineTextInputWidget({
        value,
        rows: 30,
        classes: ['cd-editSubscriptions-input'],
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

      this.updateSize();
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
      return new OO.ui.Process(this.save.bind(this));
    } else if (action === 'close') {
      return new OO.ui.Process(async () => {
        await confirmCloseDialog(this, 'ewsd');
      });
    }
    return super.getActionProcess(action);
  }

  /**
   * Save the subscriptions list.
   */
  async save() {
    this.updateSize();
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

    const registry = {};
    Object.keys(sections)
      .filter((key) => titleToId[key])
      .forEach((key) => {
        registry[titleToId[key]] = subscriptions.itemsToKeys(sections[key].filter(unique));
      });

    try {
      subscriptions.saveLegacy(registry);
    } catch (e) {
      if (e instanceof CdError) {
        const { type, code } = e.data;
        if (type === 'internal' && code === 'sizeLimit') {
          handleDialogError(this, e, 'ewsd-error-maxsize', false);
        } else {
          handleDialogError(this, e, 'ewsd-error-processing', true);
        }
      } else {
        handleDialogError(this, e);
      }
      this.actions.setAbilities({ save: true });
      return;
    }

    this.popPending();
    this.close();
    mw.notify(cd.s('ewsd-saved'));
  }
}

tweakUserOoUiClass(EditSubscriptionsDialog, OO.ui.ProcessDialog);

export default EditSubscriptionsDialog;
