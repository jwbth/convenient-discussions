import CommentForm from './CommentForm';
import Page from './Page';
import bootController from './bootController';
import cd from './cd';
import commentFormRegistry from './commentFormRegistry';
import commentRegistry from './commentRegistry';
import pageRegistry from './pageRegistry';
import sectionRegistry from './sectionRegistry';
import { areObjectsEqual } from './utils-general';

/**
 * Class representing the current page the user is visiting. Extends the base Page class with
 * methods and properties specific to the current page context.
 */
export default class CurrentPage extends Page {
  /**
   * @type {JQuery}
   * @private
   */
  $archivingInfo;

  /**
   * @type {JQuery}
   * @private
   */
  $addSectionButtonContainer;

  /**
   * @type {CommentForm}
   * @private
   */
  addSectionForm;

  /**
   * Create a CurrentPage instance.
   *
   * @param {mw.Title} mwTitle
   * @param {string} [genderedName]
   */
  constructor(mwTitle, genderedName) {
    super(mwTitle, genderedName);
    this.isActionable = Boolean(this.isCommentable());
  }

  /**
   * Check if the page is an archive page, checking both regex rules from the parent class and page
   * DOM elements.
   *
   * @override
   * @returns {boolean}
   */
  isArchive() {
    return (
      super.isArchive() || Boolean(this.findArchivingInfoElement()?.attr('data-is-archive-page'))
    );
  }

  /**
   * Check if this page can have archives. Checks both regex rules from the parent class and page
   * DOM elements.
   *
   * @override
   * @returns {?boolean}
   */
  canHaveArchives() {
    const $archivingInfo = this.findArchivingInfoElement();
    if ($archivingInfo?.length) {
      return !$archivingInfo.attr('data-is-archive-page');
    }

    return super.canHaveArchives();
  }

  /**
   * Get the archive prefix for the page. Checks both regex rules from the parent class and page
   * DOM elements.
   *
   * @override
   * @param {boolean} [onlyExplicit=false]
   * @returns {?string}
   */
  getArchivePrefix(onlyExplicit = false) {
    const $archivingInfo = this.findArchivingInfoElement();
    if ($archivingInfo?.length) {
      if ($archivingInfo.attr('data-is-archive-page')) {
        return null;
      }
      const archivePrefix = $archivingInfo.attr('data-archive-prefix');
      if (archivePrefix) {
        return archivePrefix;
      }
    }

    return super.getArchivePrefix(onlyExplicit);
  }

  /**
   * Get the source page for the page (i.e., the page from which archiving is happening). Checks
   * both regex rules from the parent class and page DOM elements.
   *
   * @override
   * @returns {Page}
   */
  getArchivedPage() {
    const $archivingInfo = this.findArchivingInfoElement();
    if ($archivingInfo?.length) {
      const sourcePage = $archivingInfo.attr('data-source-page');
      if (sourcePage) {
        const page = pageRegistry.get(sourcePage);
        if (page) {
          return page;
        }
      }
    }

    return super.getArchivedPage();
  }

  /**
   * Check whether the current page is eligible for submitting comments to.
   *
   * @returns {boolean}
   */
  isCommentable() {
    return bootController.isPageOfType('talk') && (this.isActive() || !this.exists());
  }

  /**
   * Check whether the current page exists (is not 404).
   *
   * @returns {boolean}
   */
  exists() {
    return Boolean(mw.config.get('wgArticleId'));
  }

  /**
   * Check whether the current page is an active talk page: existing, the current revision, not an
   * archive page.
   *
   * This value is constant in most cases, but there are exceptions:
   *   1. The user may switch to another revision using
   *      {@link https://www.mediawiki.org/wiki/Extension:RevisionSlider RevisionSlider}.
   *   2. On a really rare occasion, an active page may become inactive if it becomes identified as
   *      an archive page. This was switched off when I wrote this.
   *
   * @returns {boolean}
   */
  isActive() {
    return (
      bootController.isPageOfType('talk') &&
      this.exists() &&
      bootController.isCurrentRevision() &&
      !this.isArchive()
    );
  }

  /**
   * Check whether the current page is an archive and the displayed revision the current one.
   *
   * @returns {boolean}
   */
  isCurrentArchive() {
    return bootController.isCurrentRevision() && this.isArchive();
  }

  /**
   * Find an archiving info element on the page.
   *
   * @returns {?JQuery}
   * @private
   */
  findArchivingInfoElement() {
    // This is not reevaluated after page reloads. Since archive settings we need rarely change, the
    // reevaluation is unlikely to make any difference. `$root?` because the $root can not be set
    // when it runs from the addCommentLinks module.
    this.$archivingInfo ||= bootController.$root?.find('.cd-archivingInfo');

    return this.$archivingInfo;
  }

  /**
   * _For internal use._ Add an "Add topic" button to the bottom of the page if there is an "Add
   * topic" tab. (Otherwise, it may be added to a wrong place.)
   */
  addAddTopicButton() {
    if (
      !$('#ca-addsection').length ||
      // There is a special welcome text in New Topic Tool for 404 pages.
      (cd.g.isDtNewTopicToolEnabled && !this.exists())
    ) {
      return;
    }

    this.$addSectionButtonContainer = $('<div>')
      .addClass('cd-section-button-container cd-addTopicButton-container')
      .append(
        new OO.ui.ButtonWidget({
          label: cd.s('addtopic'),
          framed: false,
          classes: ['cd-button-ooui', 'cd-section-button'],
        }).on('click', () => {
          this.addSection();
        }).$element
      )
      // If appending to bootController.rootElement, it can land on a wrong place, like on 404 pages
      // with New Topic Tool enabled.
      .insertAfter(bootController.$root);
  }

  /**
   * Add an "Add section" form or not on page load depending on the URL and presence of a
   * DiscussionTools' "New topic" form.
   *
   * @param {object} dtFormData
   */
  autoAddSection(dtFormData) {
    const { searchParams } = new URL(location.href);

    // &action=edit&section=new when DT's New Topic Tool is enabled.
    if (
      searchParams.get('section') === 'new' ||
      Number(searchParams.get('cdaddtopic')) ||
      dtFormData
    ) {
      this.addSection(dtFormData);
    }
  }

  /**
   * Create an add section form if not existent.
   *
   * @param {object} [initialState]
   * @param {import('./CommentForm').default} [commentForm]
   * @param {object} [preloadConfig=CommentForm.getDefaultPreloadConfig()] See
   *   {@link CommentForm.getDefaultPreloadConfig}.
   * @param {boolean} [newTopicOnTop=false]
   * @returns {?import('./CommentForm').default}
   */
  addSection(
    initialState,
    commentForm,
    preloadConfig = CommentForm.getDefaultPreloadConfig(),
    newTopicOnTop = false
  ) {
    if (this.addSectionForm) {
      // Sometimes there is more than one "Add section" button on the page, and they lead to opening
      // forms with different content.
      if (!areObjectsEqual(preloadConfig, this.addSectionForm.getPreloadConfig())) {
        mw.notify(cd.s('cf-error-formconflict'), { type: 'error' });

        return null;
      }

      this.addSectionForm.$element.cdScrollIntoView('center');

      // Headline input may be missing if the `nosummary` preload parameter is truthy.
      (this.addSectionForm.headlineInput || this.addSectionForm.commentInput).focus();
    } else {
      this.addSectionForm = commentFormRegistry.setupCommentForm(
        this,
        {
          mode: 'addSection',
          preloadConfig,
          newTopicOnTop,
        },
        initialState,
        commentForm
      );

      this.$addSectionButtonContainer?.hide();
      if (!this.exists()) {
        bootController.$content.children('.noarticletext, .warningbox').hide();
      }
      $('#ca-addsection').addClass('selected');
      $('#ca-view').removeClass('selected');
      this.addSectionForm.on('teardown', () => {
        $('#ca-addsection').removeClass('selected');
        $('#ca-view').addClass('selected');
      });
    }

    return this.addSectionForm;
  }

  /**
   * Clean up traces of a comment form {@link CommentForm#getTarget targeted} at this page.
   *
   * @param {import('./CommentForm').CommentFormMode} _mode
   * @param {import('./CommentForm').default} commentForm
   */
  addCommentFormToPage(_mode, commentForm) {
    const firstSection = sectionRegistry.getByIndex(0);
    if (firstSection && commentForm.isNewTopicOnTop()) {
      firstSection.$heading.before(commentForm.$element);
    } else {
      bootController.$root.after(commentForm.$element);
    }
  }

  /**
   * Remove a comment form {@link CommentForm#getTarget targeted} at this page from the page.
   */
  cleanUpCommentFormTraces() {
    if (!this.exists()) {
      bootController.$content
        // In case DT's new topic tool is enabled. This is responsible for correct styles being set.
        .removeClass('ext-discussiontools-init-replylink-open')

        .children('.noarticletext, .warningbox')
        .show();
    }

    this.$addSectionButtonContainer?.show();
  }

  /**
   * Get the comment that will end up directly above the section the user is adding with a comment
   * form.
   *
   * @override
   * @param {import('./CommentForm').default} commentForm
   * @returns {?import('./Comment').default}
   */
  getCommentAboveCommentToBeAdded(commentForm) {
    return commentForm.isNewTopicOnTop() ? null : commentRegistry.getByIndex(-1);
  }
}
