/**
 * Singleton related to the block displaying the current section tree according to the scroll
 * position, along with the page top and table of contents links. The bottom block also displays the
 * page bottom link.
 *
 * @module pageNav
 */

import Button from './Button';
import cd from './cd';
import { getExtendedRect, getVisibilityByRects } from './util';
import { scrollToY } from './jqueryExtensions';

let currentSection;
let $sectionWithBackLink;
let $backLinkContainer;
let backLinkLocation;

export default {
  /**
   * _For internal use._ Render the page navigation block. This is done when the page is first
   * loaded.
   */
  mount() {
    this.$topElement = $('<div>')
      .attr('id', 'cd-pageNav-top')
      .addClass('cd-pageNav')
      .appendTo(document.body);
    if (cd.g.BODY_SCROLL_PADDING_TOP) {
      this.$topElement.css('margin-top', `${cd.g.BODY_SCROLL_PADDING_TOP}px`);
    }
    this.$bottomElement = $('<ul>')
      .attr('id', 'cd-pageNav-bottom')
      .addClass('cd-pageNav cd-pageNav-list')
      .appendTo(document.body);

    this.updateWidth();
    this.update();
  },

  /**
   * Update or set the width of the page nagivation blocks.
   */
  updateWidth() {
    if (cd.g.$contentColumn.length) {
      const left = cd.g.$contentColumn.offset().left;
      const padding = 18;
      let width = $(document.body).hasClass('ltr') ?
        left - padding :
        $(window).width() - (left + cd.g.$contentColumn.outerWidth()) - padding;
      if (cd.g.SKIN === 'minerva') {
        width -= cd.g.CONTENT_START_MARGIN;
      } else if (cd.g.SKIN === 'vector') {
        width = Math.min(width, $('#p-search').offset().left - 24 - padding);
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
    }
  },

  /**
   * Update the contents of the page navigation blocks.
   */
  update() {
    const htmlElement = document.documentElement;
    if (htmlElement.scrollHeight === htmlElement.clientHeight) {
      this.reset();
      return;
    }

    // The top position of the TOC or the first section
    let afterLeadPos;

    let firstSectionOuterTop;
    if (cd.g.$toc.length) {
      const rect = cd.g.$toc.get(0).getBoundingClientRect();
      if (getVisibilityByRects(rect)) {
        afterLeadPos = rect.top;
      }
    }
    const scrollY = window.scrollY;
    if (scrollY > cd.g.BODY_SCROLL_PADDING_TOP) {
      cd.sections.some((section) => {
        const rect = getExtendedRect(section.$heading.get(0));
        if (!getVisibilityByRects(rect)) {
          return false;

        // The second check to exclude the possibility that the first section is above the TOC, like
        // at https://commons.wikimedia.org/wiki/Project:Graphic_Lab/Illustration_workshop.
        } else if (!afterLeadPos || rect.outerTop > afterLeadPos) {
          firstSectionOuterTop = rect.outerTop;

          if (!afterLeadPos) {
            afterLeadPos = rect.outerTop;
          }
          return true;
        } else {
          return false;
        }
      });
    }

    if (afterLeadPos < cd.g.BODY_SCROLL_PADDING_TOP + 1 || backLinkLocation === 'top') {
      if (!this.$linksOnTop) {
        this.$linksOnTop = $('<ul>')
          .attr('id', 'cd-pageNav-linksOnTop')
          .addClass('cd-pageNav-list')
          .appendTo(this.$topElement);
        const topLink = new Button({
          href: '#',
          classes: ['cd-pageNav-link'],
          label: cd.s('pagenav-pagetop'),
          action: () => {
            this.jump(0, this.$topLink);
          },
        });
        this.$topLink = $('<li>')
          .attr('id', 'cd-pageNav-topLink')
          .addClass('cd-pageNav-item')
          .append(topLink.element)
          .appendTo(this.$linksOnTop);
      }
    } else {
      if (this.$linksOnTop) {
        this.reset('top');
      }
    }

    if (this.$linksOnTop) {
      if (cd.g.$toc.length && !this.$tocLink) {
        const tocLink = new Button({
          href: '#toc',
          classes: ['cd-pageNav-link'],
          label: cd.s('pagenav-toc'),
          action: () => {
            this.jump(cd.g.$toc, this.$tocLink);
          },
        });
        this.$tocLink = $('<li>')
          .attr('id', 'cd-pageNav-tocLink')
          .addClass('cd-pageNav-item')
          .append(tocLink.element)
          .appendTo(this.$linksOnTop);
      }
      if (!this.$currentSection) {
        this.$currentSection = $('<ul>')
          .attr('id', 'cd-pageNav-currentSection')
          .addClass('cd-pageNav-list')
          .appendTo(this.$topElement);
      }
    }

    if (
      (cd.sections.length && scrollY + window.innerHeight < htmlElement.scrollHeight) ||
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

    // 1 as a threshold (also below, in "extendedRect.outerTop < BODY_SCROLL_PADDING_TOP + 1") works
    // better for Monobook for some reason (scroll to the first section using the page navigation to
    // see the difference).
    if (
      firstSectionOuterTop === undefined ||
      firstSectionOuterTop >= cd.g.BODY_SCROLL_PADDING_TOP + 1
    ) {
      if (currentSection) {
        this.resetSections();
      }
      return;
    }

    cd.sections
      .slice()
      .reverse()
      .some((section) => {
        const extendedRect = getExtendedRect(section.$heading.get(0));
        if (!getVisibilityByRects(extendedRect)) {
          return false;
        }

        if (extendedRect.outerTop < cd.g.BODY_SCROLL_PADDING_TOP + 1) {
          if (currentSection === section) {
            return true;
          }
          currentSection = section;

          // Keep the data
          $sectionWithBackLink?.detach();

          this.$currentSection.empty();
          const ancestors = [section, ...section.getAncestors()].reverse();
          ancestors.forEach((sectionInTree, level) => {
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
          return true;
        }
        return false;
      });
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
      $elementOrOffset.offset().top - cd.g.BODY_SCROLL_PADDING_TOP :
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

    cd.state.isAutoScrollInProgress = true;
    scrollToY(offset);
  },
};
