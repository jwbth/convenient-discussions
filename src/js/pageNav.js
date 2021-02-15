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
      .addClass('cd-pageNav')
      .addClass('cd-pageNav-list')
      .appendTo(document.body);

    this.updateWidth();
  },

  /**
   * Update or set the width of the page nagivation blocks.
   */
  updateWidth() {
    const mwBody = $('.mw-body').get(0);
    const width = cd.g.CONTENT_DIR === 'ltr' && document.body.classList.contains('ltr') ?
      mwBody?.getBoundingClientRect().left - 18 :
      $(window).width() - mwBody?.getBoundingClientRect().right - 18;
    this.$topElement.css('width', width + 'px');
    this.$bottomElement.css('width', width + 'px');
  },

  /**
   * Update the contents of the page navigation blocks.
   */
  update() {
    if (document.body.scrollHeight === document.body.clientHeight) {
      this.reset();
      return;
    }

    if (window.scrollY > 0 || backLinkLocation === 'top') {
      if (!this.$linksToTop) {
        this.$linksToTop = $('<ul>')
          .attr('id', 'cd-pageNav-linksToTop')
          .addClass('cd-pageNav-list')
          .appendTo(this.$topElement);
      }
    } else {
      if (this.$linksToTop) {
        this.$topElement.empty();
        this.$linksToTop = null;
        this.$topLink = null;
        this.$tocLink = null;
        this.$currentSection = null;
      }
      return;
    }

    if (!this.$topLink) {
      this.$topLink = $('<li>')
        .attr('id', 'cd-pageNav-topLink')
        .text(cd.s('pagenav-pagetop'))
        .addClass('cd-pageNav-item')
        .on('click', () => {
          this.jump(0, this.$topLink);
        })
        .appendTo(this.$linksToTop);
    }
    if (cd.g.$toc.length && !this.$tocLink) {
      this.$tocLink = $('<li>')
        .attr('id', 'cd-pageNav-tocLink')
        .text(cd.s('pagenav-toc'))
        .addClass('cd-pageNav-item')
        .on('click', () => {
          this.jump(cd.g.$toc, this.$tocLink);
        })
        .appendTo(this.$linksToTop);
    }
    if (!this.$currentSection) {
      this.$currentSection = $('<ul>')
        .attr('id', 'cd-pageNav-currentSection')
        .addClass('cd-pageNav-list')
        .appendTo(this.$topElement);
    }
    if (
      window.scrollY + window.innerHeight < document.body.scrollHeight ||
      backLinkLocation === 'bottom'
    ) {
      if (!this.$bottomLink) {
        this.$bottomLink = $('<li>')
          .attr('id', 'cd-pageNav-bottomLink')
          .addClass('cd-pageNav-item')
          .on('click', () => {
            this.jump(document.body.scrollHeight - window.innerHeight, this.$bottomLink);
          })
          .text(cd.s('pagenav-pagebottom'))
          .appendTo(this.$bottomElement);
      }
    } else {
      if (this.$bottomLink) {
        this.$bottomLink.remove();
        this.$bottomLink = null;
      }
    }

    if (currentSection && (window.scrollY === 0 || !cd.sections.length)) {
      this.resetSections();
      return;
    }

    for (const section of cd.sections) {
      const rect = getExtendedRect(section.$heading.get(0));
      if (rect.left !== 0 || rect.height !== 0) {
        if (rect.outerTop >= 0) {
          this.resetSections();
          return;
        } else {
          break;
        }
      }
    }

    cd.sections
      .slice()
      .reverse()
      .some((section) => {
        const extendedRect = getExtendedRect(section.$heading.get(0));

        // If the element has 0 as the left position and height, it's probably invisible for some
        // reason.
        if (extendedRect.left === 0 && extendedRect.height === 0) return;

        if (extendedRect.outerTop < 0) {
          if (currentSection === section) {
            return true;
          }
          currentSection = section;
          if ($sectionWithBackLink) {
            // Keep the data
            $sectionWithBackLink.detach();
          }
          this.$currentSection.empty();
          const ancestors = [section, ...section.getAncestors()].reverse();
          ancestors.forEach((sectionInTree, level) => {
            const $item = (
              $sectionWithBackLink &&
              $sectionWithBackLink.data('section') === sectionInTree
            ) ?
              $sectionWithBackLink :
              $('<li>')
                .addClass('cd-pageNav-item')
                .addClass(`cd-pageNav-level-${level}`)
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

  reset() {
    this.$topElement.empty();
    this.$bottomElement.empty();
    this.$linksToTop = null;
    this.$topLink = null;
    this.$tocLink = null;
    this.$currentSection = null;
    this.$bottomLink = null;
    currentSection = null;
    $backLinkContainer = null;
    $sectionWithBackLink = null;
    backLinkLocation = null;
  },

  /**
   * Reset the current section variable and empty the contents of the current section block.
   */
  resetSections() {
    this.$currentSection.empty();
    currentSection = null;
  },

  jump($elementOrOffset, $link, isBackLink) {
    const offset = $elementOrOffset instanceof $ ? $elementOrOffset.offset().top : $elementOrOffset;
    if (!isBackLink && Math.abs(offset - window.scrollY) < 1) return;

    if ($backLinkContainer) {
      $backLinkContainer.remove();
      $backLinkContainer = null;
      $sectionWithBackLink = null;
      backLinkLocation = null;
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
      backLinkLocation = $link === this.$bottomLink ? 'bottom' : 'top';
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
