/**
 * Singleton related to the block displaying the current section tree according to the scroll
 * position, along with the page top and table of contents links. It is not mounted in Vector 2022,
 * because Vector 2022 has sticky TOC. The bottom block also displays the page bottom link.
 *
 * @module pageNav
 */

import Button from './Button';
import bootController from './bootController';
import cd from './cd';
import sectionRegistry from './sectionRegistry';
import talkPageController from './talkPageController';
import toc from './toc';
import { getVisibilityByRects } from './utils-window';

export default {
  /**
   * _For internal use._ Setup the page navigation block (mount or update).
   */
  setup() {
    if (this.isMounted()) {
      this.update();
    } else {
      this.mount();
    }
  },

  /**
   * Render the page navigation block. This is done when the page is first loaded.
   *
   * @private
   */
  mount() {
    if (cd.g.skin === 'vector-2022') return;

    this.$topElement = $('<div>')
      .attr('id', 'cd-pageNav-top')
      .addClass('cd-pageNav')
      .appendTo(document.body);
    if (cd.g.bodyScrollPaddingTop) {
      this.$topElement.css('margin-top', `${cd.g.bodyScrollPaddingTop}px`);
    }
    this.$bottomElement = $('<ul>')
      .attr('id', 'cd-pageNav-bottom')
      .addClass('cd-pageNav cd-pageNav-list')
      .appendTo(document.body);

    this.updateWidth();
    this.update();

    talkPageController
      .on('scroll', this.update.bind(this))
      .on('horizontalScroll', this.updateWidth.bind(this))
      .on('resize', this.updateWidth.bind(this));
  },

  /**
   * Check whether the page navigation block is mounted.
   *
   * @returns {boolean}
   */
  isMounted() {
    return Boolean(this.$topElement);
  },

  /**
   * Update or set the width of the page nagivation blocks.
   *
   * @private
   */
  updateWidth() {
    if (!this.isMounted() || !bootController.$contentColumn.length) return;

    const left =
      /** @type {JQuery.Coordinates} */ (bootController.$contentColumn.offset()).left -
      /** @type {number} */ ($(window).scrollLeft());

    // 18px padding + 1px comment markers / thread lines
    const deductable = 18 + ((cd.g.commentMarkerWidth - 1) / 2);

    let width = cd.g.userDirection === 'ltr'
      ? left - deductable
      : /** @type {number} */ ($(window).width()) -
        (left + /** @type {number} */ (bootController.$contentColumn.outerWidth())) -
        deductable;
    if (cd.g.skin === 'minerva') {
      width -= bootController.getContentColumnOffsets().startMargin;
    }

    // Some skins when the viewport is narrowed
    if (width <= 100) {
      this.$topElement.hide();
      this.$bottomElement.hide();
    } else {
      this.$topElement.show();
      this.$bottomElement.show();
    }

    this.$topElement.css('width', width + 'px');
    this.$bottomElement.css('width', width + 'px');
  },

  /**
   * Get offsets of some important elements relative to the viewport.
   *
   * @param {number} scrollY
   * @returns {object}
   * @private
   */
  getRelativeOffsets(scrollY) {
    let afterLeadOffset;
    if (toc.isPresent()) {
      const rect = toc.$element[0].getBoundingClientRect();
      if (getVisibilityByRects(rect)) {
        afterLeadOffset = rect.top;
      }
    }

    const firstSectionTop = sectionRegistry.getFirstSectionRelativeTopOffset(
      scrollY,
      afterLeadOffset
    );
    afterLeadOffset ??= firstSectionTop;

    return { afterLeadOffset, firstSectionTop };
  },

  /**
   * Create of update the basic DOM structure of the page navigation.
   *
   * @param {number} afterLeadOffset
   * @param {number} scrollY
   * @private
   */
  createOrUpdateSkeleton(afterLeadOffset, scrollY) {
    if (
      (afterLeadOffset !== null && afterLeadOffset < cd.g.bodyScrollPaddingTop + 1) ||
      this.backLinkLocation === 'top'
    ) {
      if (!this.$linksOnTop) {
        this.$linksOnTop = $('<ul>')
          .attr('id', 'cd-pageNav-linksOnTop')
          .addClass('cd-pageNav-list')
          .appendTo(this.$topElement);
        this.$topLink = $('<li>')
          .attr('id', 'cd-pageNav-topLink')
          .addClass('cd-pageNav-item')
          .append(
            (new Button({
              href: '#',
              classes: ['cd-pageNav-link'],
              label: cd.s('pagenav-pagetop'),
              action: () => {
                this.jump(0, this.$topLink);
              },
            })).element
          )
          .appendTo(this.$linksOnTop);
      }
    } else {
      if (this.$linksOnTop) {
        this.reset('top');
      }
    }

    if (this.$linksOnTop) {
      if (toc.isPresent() && !this.$tocLink) {
        const tocLink = new Button({
          href: '#toc',
          classes: ['cd-pageNav-link'],
          label: cd.s('pagenav-toc'),
          action: () => {
            this.jump(toc.$element, this.$tocLink);
          },
        });
        this.$tocLink = $('<li>')
          .attr('id', 'cd-pageNav-tocLink')
          .addClass('cd-pageNav-item')
          .append(tocLink.element)
          .appendTo(this.$linksOnTop);
      }
      this.$currentSection ||= $('<ul>')
        .attr('id', 'cd-pageNav-currentSection')
        .addClass('cd-pageNav-list')
        .appendTo(this.$topElement);
    }

    if (
      (
        sectionRegistry.getCount() &&
        scrollY + window.innerHeight < document.documentElement.scrollHeight
      ) ||
      this.backLinkLocation === 'bottom'
    ) {
      if (!this.$bottomLink) {
        const bottomLink = new Button({
          href: '#footer',
          classes: ['cd-pageNav-link'],
          label: cd.s('pagenav-pagebottom'),
          action: () => {
            this.jump(document.documentElement.scrollHeight - window.innerHeight, this.$bottomLink);
          },
        });
        this.$bottomLink = $('<li>')
          .attr('id', 'cd-pageNav-bottomLink')
          .addClass('cd-pageNav-item')
          .append(bottomLink.element)
          .appendTo(this.$bottomElement);
      }
    } else {
      if (this.$bottomLink) {
        this.reset('bottom');
      }
    }
  },

  /**
   * Update the name of the current section and its ancestors.
   *
   * @param {number} firstSectionTop
   * @private
   */
  updateCurrentSection(firstSectionTop) {
    // `1` as a threshold (also below, in `extendedRect.outerTop < BODY_SCROLL_PADDING_TOP + 1`)
    // works better for Monobook for some reason (scroll to the first section using the page
    // navigation to see the difference).
    if (firstSectionTop === null || firstSectionTop >= cd.g.bodyScrollPaddingTop + 1) {
      if (this.currentSection) {
        this.resetSections();
      }
      return;
    }

    const updatedCurrentSection = sectionRegistry.getCurrentSection();
    if (!updatedCurrentSection || updatedCurrentSection === this.currentSection) return;

    this.currentSection = updatedCurrentSection;

    // Keep the data
    this.$sectionWithBackLink?.detach();

    this.$currentSection.empty();
    [this.currentSection, ...this.currentSection.getAncestors()]
      .reverse()
      .forEach((sectionInTree, level) => {
        let $item;
        if (
          this.$sectionWithBackLink &&
          this.$sectionWithBackLink.data('section') === sectionInTree
        ) {
          $item = this.$sectionWithBackLink;
        } else {
          const button = new Button({
            href: sectionInTree.getUrl(),
            classes: ['cd-pageNav-link'],
            label: sectionInTree.headline,
            action: () => {
              this.jump(sectionInTree.$heading, $item);
            },
          });
          $item = $('<li>')
            .addClass(`cd-pageNav-item cd-pageNav-item-level-${level}`)
            .data('section', sectionInTree)
            .append(button.element);
        }
        $item.appendTo(this.$currentSection);
      });
  },

  /**
   * Update the contents of the page navigation blocks.
   *
   * @private
   */
  update() {
    if (!this.isMounted()) return;

    // Vertical scrollbar disappeared
    if (document.documentElement.scrollHeight === document.documentElement.clientHeight) {
      this.reset();
      return;
    }

    const scrollY = window.scrollY;

    // afterLeadOffset is the top position of the TOC or the first section.
    const { afterLeadOffset, firstSectionTop } = this.getRelativeOffsets(scrollY);

    this.createOrUpdateSkeleton(afterLeadOffset, scrollY);
    this.updateCurrentSection(firstSectionTop);
  },

  /**
   * Reset the page navigation state partly or completely.
   *
   * @param {string} [part]
   * @private
   */
  reset(part) {
    if (!part || part === 'top') {
      // Keep the data
      this.$sectionWithBackLink?.detach();

      this.$topElement.empty();
      this.$linksOnTop = this.$topLink = this.$tocLink = this.$currentSection = null;
      this.currentSection = null;
    }
    if (!part || part === 'bottom') {
      this.$bottomElement.empty();
      this.$bottomLink = null;
    }
  },

  /**
   * Reset the current section variable and empty the contents of the current section block.
   *
   * @private
   */
  resetSections() {
    this.$sectionWithBackLink?.detach();
    this.$currentSection.empty();
    this.currentSection = null;
  },

  /**
   * Jump to an element or top offset.
   *
   * @param {JQuery|number} $elementOrOffset Element or top offset to jump to.
   * @param {JQuery} $item Navigation item that initiated the jump.
   * @param {boolean} [isBackLink=false] Was the jump initiated by a back link.
   * @private
   */
  jump($elementOrOffset, $item, isBackLink = false) {
    const offset = typeof $elementOrOffset === 'number' ?
      $elementOrOffset :
      /** @type {JQuery.Coordinates} */ ($elementOrOffset.offset()).top - cd.g.bodyScrollPaddingTop;
    if (!isBackLink && Math.abs(offset - window.scrollY) < 1) return;

    if (this.backLinkLocation) {
      this.backLinkLocation = null;
      this.$backLinkContainer.prev().removeClass('cd-pageNav-link-inline');
      this.$backLinkContainer.remove();
      this.$backLinkContainer = this.$sectionWithBackLink = null;
    }
    if (!isBackLink) {
      const scrollY = window.scrollY;
      const backLink = new Button({
        classes: ['cd-pageNav-backLink'],
        label: cd.s('pagenav-back'),
        action: (event) => {
          // When inside links without href
          event.stopPropagation();

          this.jump(scrollY, $item, true);
        },
      });
      this.$backLinkContainer = $('<span>')
        .addClass('cd-pageNav-backLinkContainer')
        .append(cd.sParse('dot-separator'), backLink.element)
        .appendTo($item);
      this.$backLinkContainer.prev().addClass('cd-pageNav-link-inline');
      if ($item.parent().is('#cd-pageNav-currentSection')) {
        this.$sectionWithBackLink = $item;
      }
      if ($item === this.$topLink || $item === this.$tocLink) {
        this.backLinkLocation = 'top';
      } else if ($item === this.$bottomLink) {
        this.backLinkLocation = 'bottom';
      } else {
        this.backLinkLocation = 'section';
      }
    }

    talkPageController.toggleAutoScrolling(true);
    talkPageController.scrollToY(offset);
  },
};
