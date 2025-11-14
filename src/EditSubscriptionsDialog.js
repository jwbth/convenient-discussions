import MultilineTextInputWidget from './MultilineTextInputWidget';
import ProcessDialog from './ProcessDialog';
import bootManager from './loader/bootManager';
import cd from './loader/cd';
import pageController from './pageController';
import CdError from './shared/CdError';
import { sleep, unique } from './shared/utils-general';
import { getPageIds, getPageTitles } from './utils-api';
import { es6ClassToOoJsClass } from './utils-oojs';

/**
 * Class used to create an "Edit subscriptions" dialog.
 *
 * @augments ProcessDialog
 */
class EditSubscriptionsDialog extends ProcessDialog {
  // @ts-expect-error: https://phabricator.wikimedia.org/T358416
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
   * @override
   */
  static cdKey = 'ewsd';

  /** @type {OO.ui.StackLayout} */
  stack;

  /** @type {OO.ui.PanelLayout} */
  loadingPanel;

  /** @type {OO.ui.PanelLayout} */
  sectionsPanel;

  /** @type {OO.ui.MultilineTextInputWidget} */
  input;

  /**
   * Create an "Edit subscriptions" dialog.
   */
  constructor() {
    super();

    this.subscriptions = /** @type {import('./LegacySubscriptions').default} */ (
      pageController.getSubscriptionsInstance()
    );
  }

  /**
   * OOUI native method to get the height of the window body.
   *
   * @override
   * @returns {number}
   * @see {https} ://doc.wikimedia.org/oojs-ui/master/js/OO.ui.ProcessDialog.html#getBodyHeight
   * @ignore
   */
  getBodyHeight() {
    // `1` fixes double scrollbar with some system font settings.
    return (this.$errorItems ? this.$errors[0].scrollHeight : this.$body[0].scrollHeight) + 1;
  }

  /**
   * OOUI native method that initializes window contents.
   *
   * @override
   * @see https://doc.wikimedia.org/oojs-ui/master/js/OO.ui.ProcessDialog.html#initialize
   * @see https://www.mediawiki.org/wiki/OOUI/Windows#Window_lifecycle
   * @ignore
   */
  initialize() {
    super.initialize();

    this.pushPending();

    this.initPromise = this.subscriptions.load();

    this.loadingPanel = new OO.ui.PanelLayout({
      padded: true,
      expanded: false,
    });
    this.loadingPanel.$element.append($('<div>').text(cd.s('loading-ellipsis')));

    this.sectionsPanel = new OO.ui.PanelLayout({
      padded: false,
      expanded: false,
    });

    this.stack = new OO.ui.StackLayout({
      items: [this.loadingPanel, this.sectionsPanel],
    });

    this.$body.append(this.stack.$element);

    return this;
  }

  /**
   * OOUI native method that returns a "setup" process which is used to set up a window for use in a
   * particular context, based on the `data` argument.
   *
   * @override
   * @param {object} [data] Dialog opening data
   * @returns {OO.ui.Process}
   * @see https://doc.wikimedia.org/oojs-ui/master/js/OO.ui.ProcessDialog.html#getSetupProcess
   * @see https://www.mediawiki.org/wiki/OOUI/Windows#Window_lifecycle
   * @ignore
   */
  getSetupProcess(data) {
    return super.getSetupProcess(data).next(() => {
      this.stack.setItem(this.loadingPanel);
      this.actions.setMode('edit');
    });
  }

  /**
   * OOUI native method that returns a "ready" process which is used to ready a window for use in a
   * particular context, based on the `data` argument.
   *
   * @override
   * @param {object} data Window opening data
   * @returns {OO.ui.Process}
   * @see https://doc.wikimedia.org/oojs-ui/master/js/OO.ui.ProcessDialog.html#getReadyProcess
   * @see https://www.mediawiki.org/wiki/OOUI/Windows#Window_lifecycle
   * @ignore
   */
  getReadyProcess(data) {
    return super.getReadyProcess(data).next(async () => {
      let pages;
      try {
        await this.initPromise;
        pages = await getPageTitles(this.subscriptions.getPageIds());
      } catch (error) {
        this.handleError(/** @type {Error} */ (error), 'ewsd-error-processing', false);

        return;
      }

      // Logically, there should be no coinciding titles between pages, so we don't need a
      // separate "return 0" condition.
      pages.sort((page1, page2) => page1.title > page2.title ? 1 : -1);

      const value = pages
        .flatMap((page) =>
          page.pageid
            ? this.subscriptions
                .getForPageId(page.pageid)
                .map((section) => `${page.title}#${section}`)
            : []
        )
        .join('\n');

      this.input = new MultilineTextInputWidget({
        value,
        rows: 30,
        classes: ['cd-editSubscriptions-input'],
      });
      this.input.on('change', (newValue) => {
        this.actions.setAbilities({ save: newValue !== value });
      });

      this.sectionsPanel.$element.append(this.input.$element);

      this.stack.setItem(this.sectionsPanel);
      this.input.focus();
      this.actions.setAbilities({ close: true });

      // A dirty workaround to avoid a scrollbar appearing when the window is loading. Couldn't
      // figure out a way to do this out of the box.
      this.$body.css('overflow', 'hidden');
      sleep(500).then(() => {
        this.$body.css('overflow', '');
      });

      this.updateSize();
      this.popPending();

      bootManager.addPreventUnloadCondition('dialog', () => this.isUnsaved());
    });
  }

  /**
   * OOUI native method that returns a process for taking action.
   *
   * @override
   * @param {string} action Symbolic name of the action.
   * @returns {OO.ui.Process}
   * @see https://doc.wikimedia.org/oojs-ui/master/js/OO.ui.ProcessDialog.html#getActionProcess
   * @ignore
   */
  getActionProcess(action) {
    if (action === 'save') {
      return new OO.ui.Process(this.save);
    } else if (action === 'close') {
      return new OO.ui.Process(() => {
        this.confirmClose();
      });
    }

    return super.getActionProcess(action);
  }

  /**
   * Save the subscriptions list.
   *
   * @protected
   */
  save = async () => {
    this.updateSize();
    this.pushPending();

    /** @type {Map<string, string[]>} */
    const sections = new Map();
    /** @type {string[]} */
    const pageTitles = [];
    this.input
      .getValue()
      .split('\n')
      .forEach((section) => {
        const match = section.match(/^(.+?)#(.+)$/);
        if (match) {
          const pageTitle = match[1].trim();
          if (!sections.has(pageTitle)) {
            sections.set(pageTitle, []);
            pageTitles.push(pageTitle);
          }
          /** @type {string[]} */ (sections.get(pageTitle)).push(match[2].trim());
        }
      });

    let normalized;
    let redirects;
    let pages;
    try {
      ({ normalized, redirects, pages } = await getPageIds(pageTitles));
    } catch (error) {
      this.handleError(/** @type {Error | CdError} */ (error), 'ewsd-error-processing', true);

      return;
    }

    // Correct to normalized titles && redirect targets, add to the collection.
    normalized
      .concat(redirects)
      .filter((page) => sections.has(page.from))
      .forEach((page) => {
        if (!sections.has(page.to)) {
          sections.set(page.to, []);
        }
        /** @type {string[]} */ (sections.get(page.to)).push(
          .../** @type {string[]} */ (sections.get(page.from))
        );
        sections.delete(page.from);
      });

    const titleToId = new Map(
      pages
        .filter((page) => page.pageid !== undefined)
        .map((page) => [page.title, page.pageid])
    );

    /** @type {Record<number, import('./Subscriptions').SubscriptionsData>} */
    const allPagesData = {};
    for (const [pageTitle, sectionList] of sections) {
      const pageId = titleToId.get(pageTitle);
      if (pageId) {
        allPagesData[pageId] = this.subscriptions.itemsToKeys(sectionList.filter(unique));
      }
    }

    try {
      this.subscriptions.save(allPagesData);
    } catch (error) {
      if (error instanceof CdError) {
        if (error.getType() === 'internal' && error.getCode() === 'sizeLimit') {
          this.handleError(error, 'ewsd-error-maxsize', false);
        } else {
          this.handleError(error, 'ewsd-error-processing', true);
        }
      } else {
        this.handleError(/** @type {Error} */ (error));
      }
      this.actions.setAbilities({ save: true });

      return;
    }

    this.popPending();
    this.close();
    mw.notify(cd.s('ewsd-saved'));
  };
}

es6ClassToOoJsClass(EditSubscriptionsDialog);

export default EditSubscriptionsDialog;
