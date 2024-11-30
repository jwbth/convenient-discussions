import CdError from './CdError';
import MultilineTextInputWidget from './MultilineTextInputWidget';
import ProcessDialog from './ProcessDialog';
import cd from './cd';
import controller from './controller';
import { getPageIds, getPageTitles } from './utils-api';
import { sleep, unique } from './utils-general';
import { tweakUserOoUiClass } from './utils-oojs';

/**
 * Class used to create an "Edit subscriptions" dialog.
 *
 * @augments ProcessDialog
 */
class EditSubscriptionsDialog extends ProcessDialog {
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
  static cdKey = 'ewsd';

  /**
   * Create an "Edit subscriptions" dialog.
   */
  constructor() {
    super();

    this.subscriptions = controller.getSubscriptionsInstance();
  }

  /**
   * OOUI native method to get the height of the window body.
   *
   * @returns {number}
   * @see https://doc.wikimedia.org/oojs-ui/master/js/OO.ui.ProcessDialog.html#getBodyHeight
   * @ignore
   */
  getBodyHeight() {
    return (
      (this.$errorItems ? this.$errors.prop('scrollHeight') : this.$body.prop('scrollHeight')) +

      // Fixes double scrollbar with some system font settings.
      1
    );
  }

  /**
   * OOUI native method that initializes window contents.
   *
   * @param {...*} [args]
   * @see https://doc.wikimedia.org/oojs-ui/master/js/OO.ui.ProcessDialog.html#initialize
   * @see https://www.mediawiki.org/wiki/OOUI/Windows#Window_lifecycle
   * @ignore
   */
  initialize(...args) {
    super.initialize(...args);

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
  }

  /**
   * OOUI native method that returns a "setup" process which is used to set up a window for use in a
   * particular context, based on the `data` argument.
   *
   * @param {object} [data] Dialog opening data
   * @returns {external:OO.ui.Process}
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
   * @param {object} data Window opening data
   * @returns {external:OO.ui.Process}
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
      } catch (e) {
        this.handleError(e, 'ewsd-error-processing', false);
        return;
      }

      // Logically, there should be no coinciding titles between pages, so we don't need a
      // separate "return 0" condition.
      pages.sort((page1, page2) => page1.title > page2.title ? 1 : -1);

      const value = pages
        // Filter out deleted pages
        .filter((page) => page.title)

        .map((page) => (
          this.subscriptions.getForPageId(page.pageid)
            .map((section) => `${page.title}#${section}`)
            .join('\n')
        ))
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

      controller.addPreventUnloadCondition('dialog', () => this.isUnsaved());
    });
  }

  /**
   * OOUI native method that returns a process for taking action.
   *
   * @param {string} action Symbolic name of the action.
   * @returns {external:OO.ui.Process}
   * @see https://doc.wikimedia.org/oojs-ui/master/js/OO.ui.ProcessDialog.html#getActionProcess
   * @ignore
   */
  getActionProcess(action) {
    if (action === 'save') {
      return new OO.ui.Process(this.save.bind(this));
    } else if (action === 'close') {
      return new OO.ui.Process(async () => {
        await this.confirmClose();
      });
    }
    return super.getActionProcess(action);
  }

  /**
   * Save the subscriptions list.
   *
   * @protected
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
      this.handleError(e, 'ewsd-error-processing', true);
      return;
    }

    // Correct to normalized titles && redirect targets, add to the collection.
    normalized
      .concat(redirects)
      .filter((page) => sections[page.from])
      .forEach((page) => {
        sections[page.to] ||= [];
        sections[page.to].push(...sections[page.from]);
        delete sections[page.from];
      });

    const titleToId = {};
    pages
      .filter((page) => page.pageid !== undefined)
      .forEach((page) => {
        titleToId[page.title] = page.pageid;
      });

    const allPagesData = {};
    Object.keys(sections)
      .filter((key) => titleToId[key])
      .forEach((key) => {
        allPagesData[titleToId[key]] = this.subscriptions.itemsToKeys(sections[key].filter(unique));
      });

    try {
      this.subscriptions.save(allPagesData);
    } catch (e) {
      if (e instanceof CdError) {
        const { type, code } = e.data;
        if (type === 'internal' && code === 'sizeLimit') {
          this.handleError(e, 'ewsd-error-maxsize', false);
        } else {
          this.handleError(e, 'ewsd-error-processing', true);
        }
      } else {
        this.handleError(e);
      }
      this.actions.setAbilities({ save: true });
      return;
    }

    this.popPending();
    this.close();
    mw.notify(cd.s('ewsd-saved'));
  }
}

tweakUserOoUiClass(EditSubscriptionsDialog);

export default EditSubscriptionsDialog;
