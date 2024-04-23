/**
 * Singleton related to the block displaying the current section tree according to the scroll
 * position, along with the page top and table of contents links. The bottom block also displays the
 * page bottom link.
 *
 * @module pageNav
 */

import Button from './Button';
import cd from './cd';
import controller from './controller';
import sectionRegistry from './sectionRegistry';
import toc from './toc';
import { getVisibilityByRects } from './utils-window';

const htmlElement = document.documentElement;

let currentSection;
let $sectionWithBackLink;
let $backLinkContainer;
let backLinkLocation;

export default {
  /**
   * _For internal use._ Setup the page navigation block (mount or update).
   */
  setup() {
    if (!this.isMounted()) {
      this.mount();
    } else {
      this.update();
    }
  },

  /**
   * Render the page navigation block. This is done when the page is first
   * loaded.
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

    controller
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
    if (!this.isMounted() || !controller.$contentColumn.length) return;

    const left = controller.$contentColumn.offset().left - $(window).scrollLeft();
    const padding = 18;
    let width = $(document.body).hasClass('ltr') ?
      left - padding :
      $(window).width() - (left + controller.$contentColumn.outerWidth()) - padding;
    if (cd.g.skin === 'minerva') {
      width -= controller.getContentColumnOffsets().startMargin;
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
      backLinkLocation === 'top'
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
      (sectionRegistry.getCount() && scrollY + window.innerHeight < htmlElement.scrollHeight) ||
      backLinkLocation === 'bottom'
    ) {
      if (!this.$bottomLink) {
        const bottomLink = new Button({
          href: '#footer',
          classes: ['cd-pageNav-link'],
          label: cd.s('pagenav-pagebottom'),
          action: () => {
            this.jump(htmlElement.scrollHeight - window.innerHeight, this.$bottomLink);
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
      if (currentSection) {
        this.resetSections();
      }
      return;
    }

    const updatedCurrentSection = sectionRegistry.getCurrentSection();
    if (!updatedCurrentSection || updatedCurrentSection === currentSection) return;

    currentSection = updatedCurrentSection;

    // Keep the data
    $sectionWithBackLink?.detach();

    this.$currentSection.empty();
    [currentSection, ...currentSection.getAncestors()]
      .reverse()
      .forEach((sectionInTree, level) => {
        let $item;
        if ($sectionWithBackLink && $sectionWithBackLink.data('section') === sectionInTree) {
          $item = $sectionWithBackLink;
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
    if (htmlElement.scrollHeight === htmlElement.clientHeight) {
      this.reset();
      return;
    }

    const scrollY = window.scrollY;

    // `afterLeadOffset` is the top position of the TOC or the first section.
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
      $sectionWithBackLink?.detach();

      this.$topElement.empty();
      this.$linksOnTop = this.$topLink = this.$tocLink = this.$currentSection = null;
      currentSection = null;
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
    $sectionWithBackLink?.detach();
    this.$currentSection.empty();
    currentSection = null;
  },

  /**
   * Jump to an element or top offset.
   *
   * @param {external:jQuery|number} $elementOrOffset Element or top offset to jump to.
   * @param {external:jQuery} $item Navigation item that initiated the jump.
   * @param {boolean} isBackLink Was the jump initiated by a back link.
   * @private
   */
  jump($elementOrOffset, $item, isBackLink) {
    const offset = $elementOrOffset instanceof $ ?
      $elementOrOffset.offset().top - cd.g.bodyScrollPaddingTop :
      $elementOrOffset;
    if (!isBackLink && Math.abs(offset - window.scrollY) < 1) return;

    if (backLinkLocation) {
      backLinkLocation = null;
      $backLinkContainer.prev().removeClass('cd-pageNav-link-inline');
      $backLinkContainer.remove();
      $backLinkContainer = $sectionWithBackLink = null;
    }
    if (!isBackLink) {
      const scrollY = window.scrollY;
      const backLink = new Button({
        classes: ['cd-pageNav-backLink'],
        label: cd.s('pagenav-back'),
        action: (e) => {
          // When inside links without href
          e.stopPropagation();

          this.jump(scrollY, $item, true);
        },
      });
      $backLinkContainer = $('<span>')
        .addClass('cd-pageNav-backLinkContainer')
        .append(cd.sParse('dot-separator'), backLink.element)
        .appendTo($item);
      $backLinkContainer.prev().addClass('cd-pageNav-link-inline');
      if ($item.parent().is('#cd-pageNav-currentSection')) {
        $sectionWithBackLink = $item;
      }
      if ($item === this.$topLink || $item === this.$tocLink) {
        backLinkLocation = 'top';
      } else if ($item === this.$bottomLink) {
        backLinkLocation = 'bottom';
      } else {
        backLinkLocation = 'section';
      }
    }

    controller.toggleAutoScrolling(true);
    controller.scrollToY(offset);
  },
};
