/**
 * jQuery extensions. See {@link JQuery.fn jQuery.fn}.
 *
 * @module jqueryExtensions
 */

import cd from './cd';
import controller from './controller';
import { defined, isMetadataNode, sleep } from './utils-general';
import { createSvg } from './utils-window';

/**
 * Merge many jQuery objects into one. Works like {@link https://api.jquery.com/add/ .add()}, but
 * accepts many parameters and is faster. Unlike `.add()`, only accepts jQuery objects though and
 * doesn't reorder elements based on their relative position in the DOM.
 *
 * @param {Array.<JQuery|undefined>} arrayOfJquery jQuery objects. Undefined values will be
 *   omitted.
 * @returns {JQuery} jQuery
 * @name cdMerge
 * @memberof JQuery
 */
$.cdMerge = function (...arrayOfJquery) {
  return $($.map(arrayOfJquery.filter(defined), ($object) => $object.get()));
};

/**
 * jQuery. See {@link JQuery.fn jQuery.fn} for extensions.
 *
 * @external jQuery
 * @type {object}
 * @see https://jquery.com/
 * @global
 */

/**
 * jQuery extensions.
 *
 * @namespace fn
 * @memberof JQuery
 */
export default {
  /**
   * Remove non-element nodes and metadata elements (`'STYLE'`, `'LINK'`) from a jQuery collection.
   *
   * @returns {JQuery}
   * @memberof JQuery.fn
   */
  cdRemoveNonElementNodes: function () {
    return this.filter((i, el) => el.tagName && !isMetadataNode(el));
  },

  cdScrollTo(alignment = 'top', smooth = true, callback) {
    const defaultScrollPaddingTop = 7;
    let $elements = this.cdRemoveNonElementNodes();

    // Filter out elements like .mw-empty-elt
    const findFirstVisibleElementOffset = (direction) => {
      const elements = $elements.get();
      if (direction === 'backward') {
        elements.reverse();
      }
      for (const el of elements) {
        const offset = $(el).offset();
        if (!(offset.top === 0 && offset.left === 0)) {
          return offset;
        }
      }
      return null;
    }

    let offsetFirst = findFirstVisibleElementOffset();
    let offsetLast = findFirstVisibleElementOffset('backward');
    if (!offsetFirst || !offsetLast) {
      const $firstVisibleAncestor = $elements.first().closest(':visible');
      if ($firstVisibleAncestor.length && !$firstVisibleAncestor.is(controller.$root)) {
        $elements = $firstVisibleAncestor;
        offsetFirst = findFirstVisibleElementOffset();
        offsetLast = findFirstVisibleElementOffset('backward');
        mw.notify(cd.s('error-elementhidden-container'), {
          tag: 'cd-elementhidden-container',
        });
      } else {
        mw.notify(cd.s('error-elementhidden'), {
          type: 'error',
          tag: 'cd-elementhidden',
        });

        return /** @type {JQuery} */ (/** @type {unknown} */ (this));
      }
    }
    const offsetBottom = offsetLast.top + $elements.last().outerHeight();

    let top;
    if (alignment === 'center') {
      top = Math.min(
        offsetFirst.top,
        offsetFirst.top + ((offsetBottom - offsetFirst.top) * 0.5) - $(window).height() * 0.5
      );
    } else if (alignment === 'bottom') {
      top = offsetBottom - $(window).height() + defaultScrollPaddingTop;
    } else {
      top = offsetFirst.top - (cd.g.bodyScrollPaddingTop || defaultScrollPaddingTop);
    }

    controller.toggleAutoScrolling(true);
    controller.scrollToY(top, smooth, callback);

    return /** @type {JQuery} */ (/** @type {unknown} */ (this));
  },

  /**
   * Check if the element is in the viewport. Elements hidden with `display: none` are checked as if
   * they were visible. Elements inside other hidden elements return `false`.
   *
   * This method is not supposed to be used on element collections that are partially visible,
   * partially hidden, as it can't remember their state.
   *
   * @param {boolean} partially Return `true` even if only a part of the element is in the viewport.
   * @returns {?boolean}
   * @memberof JQuery.fn
   */
  cdIsInViewport(partially = false) {
    const $elements = this.cdRemoveNonElementNodes();

    // Workaround for hidden elements (use cases like checking if the add section form is in the
    // viewport).
    const wasHidden = $elements.get().every((el) => el.style.display === 'none');
    if (wasHidden) {
      $elements.show();
    }

    const elementTop = $elements.first().offset().top;
    const elementBottom = $elements.last().offset().top + $elements.last().height();

    // The element is hidden.
    if (elementTop === 0 && elementBottom === 0) {
      return false;
    }

    if (wasHidden) {
      $elements.hide();
    }

    const scrollTop = $(window).scrollTop();
    const viewportTop = scrollTop + cd.g.bodyScrollPaddingTop;
    const viewportBottom = scrollTop + $(window).height();

    return partially ?
      elementBottom > viewportTop && elementTop < viewportBottom :
      elementTop >= viewportTop && elementBottom <= viewportBottom;
  },

  /**
   * Scroll to the element if it is not in the viewport.
   *
   * @param {'top'|'center'|'bottom'} [alignment='top'] Where should the element be positioned
   *   relative to the viewport.
   * @param {boolean} [smooth=true] Whether to use a smooth animation.
   * @param {Function} [callback] Callback to run after the animation has completed.
   * @returns {JQuery}
   * @memberof JQuery.fn
   */
  cdScrollIntoView(alignment = 'top', smooth = true, callback) {
    if (this.cdIsInViewport()) {
      callback?.();
    } else {
      if (callback) {
        // Add sleep() for a more smooth animation in case there is .focus() in the callback.
        sleep().then(() => {
          this.cdScrollTo(alignment, smooth, callback);
        });
      } else {
        this.cdScrollTo(alignment, smooth, callback);
      }
    }

    return /** @type {JQuery} */ (/** @type {unknown} */ (this));
  },

  /**
   * Get the element text as it is rendered in the browser, i.e. line breaks, paragraphs etc. are
   * taken into account. **This function is expensive.**
   *
   * @returns {string}
   * @memberof JQuery.fn
   */
  cdGetText() {
    let text;
    const dummyElement = document.createElement('div');
    [...this[0].childNodes].forEach((node) => {
      dummyElement.appendChild(node.cloneNode(true));
    });
    document.body.appendChild(dummyElement);
    text = dummyElement.innerText;
    dummyElement.remove();
    return text;
  },

  /**
   * Add a close button to the element.
   *
   * @returns {JQuery}
   * @memberof JQuery.fn
   */
  cdAddCloseButton() {
    if (this.find('.cd-closeButton').length) {
      return /** @type {JQuery} */ (/** @type {unknown} */ (this));
    }

    const $closeButton = $('<a>')
      .attr('title', cd.s('cf-block-close'))
      .append(
        createSvg(20, 20).html(
          `<path d="M4.34 2.93l12.73 12.73-1.41 1.41L2.93 4.35z" /><path d="M17.07 4.34L4.34 17.07l-1.41-1.41L15.66 2.93z" />
        `)
      )
      .addClass('cd-closeButton cd-icon')
      .on('click', () => {
        this.empty();
      });
    this.prepend($closeButton);

    return /** @type {JQuery} */ (/** @type {unknown} */ (this));
  },

  /**
   * Remove the close button from the element.
   *
   * @returns {JQuery}
   * @memberof JQuery.fn
   */
  cdRemoveCloseButton() {
    this.find('.cd-closeButton').remove();

    return /** @type {JQuery} */ (/** @type {unknown} */ (this));
  },
};
