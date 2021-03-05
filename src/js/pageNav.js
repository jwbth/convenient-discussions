/**
 * The block displaying the current section tree according to the scroll position, along with the
 * page top and table of contents links. The bottom block also displays the page bottom link.
 *
 * @module pageNav
 */

import cd from './cd';
import { getExtendedRect } from './util';
import { handleScroll } from './eventHandlers';

let currentSection;
let $sectionWithBackLink;
let $backLinkContainer;
let backLinkLocation;

export default {
  /**
   * Render the page navigation block. This is done when the page is first loaded.
   */
  mount() {
    this.$topElement = $('<div>')
      .attr('id', 'cd-pageNav-top')
      .addClass('cd-pageNav')
      .appendTo(document.body);
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
    const mwBody = $('.skin-timeless #mw-content, .mw-body').get(0);
    if (mwBody) {
      const width = cd.g.CONTENT_DIR === 'ltr' && document.body.classList.contains('ltr') ?
        mwBody.getBoundingClientRect().left - 18 :
        $(window).width() - mwBody.getBoundingClientRect().right - 18;
      this.$topElement.css('width', width + 'px');
      this.$bottomElement.css('width', width + 'px');
    }
  },

  /**
   * Update the contents of the page navigation blocks.
   */
  update() {
    if (document.documentElement.scrollHeight === document.documentElement.clientHeight) {
      this.reset();
      return;
    }

    let afterLeadPos;
    let firstSectionOuterTop;
    if (cd.g.$toc.length) {
      afterLeadPos = cd.g.$toc.get(0).getBoundingClientRect().top;
    }
    if (window.scrollY > cd.g.BODY_SCROLL_PADDING_TOP) {
      cd.sections.some((section) => {
        const rect = getExtendedRect(section.$heading.get(0));
        if (rect.left === 0 && rect.height === 0) {
          return false;
        } else {
          firstSectionOuterTop = rect.outerTop;
          if (!afterLeadPos) {
            afterLeadPos = rect.outerTop;
          }
          return true;
        }
      });
    }

    if (afterLeadPos < cd.g.BODY_SCROLL_PADDING_TOP || backLinkLocation === 'top') {
      if (!this.$linksOnTop) {
        this.$linksOnTop = $('<ul>')
          .attr('id', 'cd-pageNav-linksOnTop')
          .addClass('cd-pageNav-list')
          .appendTo(this.$topElement);
        this.$topLink = $('<li>')
          .attr('id', 'cd-pageNav-topLink')
          .addClass('cd-pageNav-item')
          .text(cd.s('pagenav-pagetop'))
          .on('click', () => {
            this.jump(0, this.$topLink);
          })
          .appendTo(this.$linksOnTop);
      }
    } else {
      if (this.$linksOnTop) {
        this.reset('top');
      }
    }

    if (this.$linksOnTop) {
      if (cd.g.$toc.length && !this.$tocLink) {
        this.$tocLink = $('<li>')
          .attr('id', 'cd-pageNav-tocLink')
          .addClass('cd-pageNav-item')
          .text(cd.s('pagenav-toc'))
          .on('click', () => {
            this.jump(cd.g.$toc, this.$tocLink);
          })
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
      (
        cd.sections.length &&
        window.scrollY + window.innerHeight < document.documentElement.scrollHeight
      ) ||
      backLinkLocation === 'bottom'
    ) {
      if (!this.$bottomLink) {
        this.$bottomLink = $('<li>')
          .attr('id', 'cd-pageNav-bottomLink')
          .addClass('cd-pageNav-item')
          .on('click', () => {
            this.jump(document.documentElement.scrollHeight - window.innerHeight, this.$bottomLink);
          })
          .text(cd.s('pagenav-pagebottom'))
          .appendTo(this.$bottomElement);
      }
    } else {
      if (this.$bottomLink) {
        this.reset('bottom');
      }
    }

    // 1 as a threshold (also below, in "extendedRect.outerTop < BODY_SCROLL_PADDING_TOP + 1") works
    // better for Monobook for some reason.
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

        // If the element has 0 as the left position and height, it's probably invisible for some
        // reason.
        if (extendedRect.left === 0 && extendedRect.height === 0) return;

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
            const $item = (
              $sectionWithBackLink &&
              $sectionWithBackLink.data('section') === sectionInTree
            ) ?
              $sectionWithBackLink :
              $('<li>')
                .addClass(`cd-pageNav-item cd-pageNav-item-level-${level}`)
                .data('section', sectionInTree)
                .text(sectionInTree.headline)
                .on('click', () => {
                  this.jump(sectionInTree.$heading, $item);
                });
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
   */
  reset(part) {
    if (!part || part === 'top') {
      // Keep the data
      $sectionWithBackLink?.detach();

      this.$topElement.empty();
      this.$linksOnTop = null;
      this.$topLink = null;
      this.$tocLink = null;
      this.$currentSection = null;
      currentSection = null;
    }
    if (!part || part === 'bottom') {
      this.$bottomElement.empty();
      this.$bottomLink = null;
    }
    if (!part || part === backLinkLocation) {
      backLinkLocation = null;
      $backLinkContainer = null;
      $sectionWithBackLink = null;
    }
  },

  /**
   * Reset the current section variable and empty the contents of the current section block.
   */
  resetSections() {
    this.$currentSection.empty();
    currentSection = null;
  },

  jump($elementOrOffset, $link, isBackLink) {
    const offset = $elementOrOffset instanceof $ ?
      $elementOrOffset.offset().top - cd.g.BODY_SCROLL_PADDING_TOP :
      $elementOrOffset;
    if (!isBackLink && Math.abs(offset - window.scrollY) < 1) return;

    if (backLinkLocation) {
      backLinkLocation = null;
      $backLinkContainer.remove();
      $backLinkContainer = null;
      $sectionWithBackLink = null;
    }
    if (!isBackLink) {
      const scrollY = window.scrollY;
      const $backLink = $('<span>')
        .addClass('cd-pageNav-backLink')
        .text(cd.s('pagenav-back'))
        .on('click', (e) => {
          e.stopPropagation();
          this.jump(scrollY, $link, true);
        });
      $backLinkContainer = $('<span>')
        .addClass('cd-pageNav-backLinkContainer')
        .append(cd.sParse('dot-separator'), $backLink)
        .appendTo($link);
      if ($link.parent().is('#cd-pageNav-currentSection')) {
        $sectionWithBackLink = $link;
      }
      if ($link === this.$topLink || $link === this.$tocLink) {
        backLinkLocation = 'top';
      } else if ($link === this.$bottomLink) {
        backLinkLocation = 'bottom';
      } else {
        backLinkLocation = 'section';
      }
    }
    cd.g.autoScrollInProgress = true;
    $('body, html').animate({ scrollTop: offset }, {
      complete: () => {
        cd.g.autoScrollInProgress = false;
        handleScroll();
      },
    });
  },
};
