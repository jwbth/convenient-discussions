/**
 * Block displaying the current section and subsections.
 *
 * @module currentSection
 */

import cd from './cd';
import { getExtendedRect } from './util';

let currentSection;

export default {
  mount() {
    this.$element = $('<ul>')
      .attr('id', 'cd-currentSection')
      .appendTo(document.body);
    this.updateWidth();
  },

  updateWidth() {
    const mwBody = $('.mw-body').get(0);
    const width = cd.g.CONTENT_DIR === 'ltr' && document.body.classList.contains('ltr') ?
      mwBody?.getBoundingClientRect().left - 18 :
      $(window).width() - mwBody?.getBoundingClientRect().right - 18;
    this.$element.css('width', width + 'px');
  },
  update() {
    if (
      currentSection &&
      (
        document.documentElement.scrollHeight === document.documentElement.clientHeight ||
        window.pageYOffset === 0 ||
        !cd.sections.length ||
        getExtendedRect(cd.sections[0].$heading.get(0)).outerTop >= 0
      )
    ) {
      this.reset();
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

        if (extendedRect.outerTop < 0) {
          if (currentSection === section) {
            return true;
          }
          currentSection = section;
          this.$element.empty();
          const parentTree = [section, ...section.getParentTree()].reverse();
          parentTree.forEach((sectionInTree, level) => {
            $('<li>')
              .addClass('cd-currentSection-level')
              .addClass(`cd-currentSection-level-${level}`)
              .text(sectionInTree.headline)
              .on('click', (e) => {
                e.preventDefault();
                sectionInTree.$heading.cdScrollTo('top');
              })
              .appendTo(this.$element);
          });
          return true;
        }
        return false;
      });
  },

  reset() {
    currentSection = null;
    this.$element.empty();
  },
};
