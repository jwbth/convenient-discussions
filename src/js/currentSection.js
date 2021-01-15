/**
 * Block displaying the current section and subsections.
 *
 * @module currentSection
 */

import cd from './cd';

let currentSection;
const headingMargins = [];

export default {
  mount() {
    this.$element = $('<ul>')
      .attr('id', 'cd-currentSection')
      .appendTo(document.body);
  },

  fillHeadingMargins() {
    cd.debug.startTimer('headingMargins');
    const $headings = [];
    for (let level = 1; level <= 6; level++) {
      $headings[level] = $(`<h${level}>`);
      cd.g.$root.append($headings[level]);
      headingMargins[level] = parseFloat($headings[level].css('margin-top'));
    }
    $headings.forEach(($heading) => {
      $heading.remove();
    });
    cd.debug.stopTimer('headingMargins');
  },

  update() {
    if (!headingMargins.length && cd.sections[0]) {
      this.fillHeadingMargins();
    }

    if (
      currentSection &&
      (
        document.body.scrollHeight === document.body.clientHeight ||
        window.pageYOffset === 0 ||
        !cd.sections.length ||
        (
          cd.sections[0].$heading.get(0).getBoundingClientRect().top >=
          headingMargins[cd.sections[0].level]
        )
      )
    ) {
      this.reset();
      return;
    }

    cd.debug.startTimer('currentSection update');
    cd.sections
      .slice()
      .reverse()
      .some((section) => {
        const rect = section.$heading.get(0).getBoundingClientRect();

        // If the element has 0 as the left position and height, it's probably invisible for some
        // reason.
        if (rect.left === 0 && rect.height === 0) return;

        if (rect.top < headingMargins[section.level]) {
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
    cd.debug.stopTimer('currentSection update');
  },

  reset() {
    currentSection = null;
    this.$element.empty();
  },
}
