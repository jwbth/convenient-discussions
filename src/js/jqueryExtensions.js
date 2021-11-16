/**
 * jQuery extensions. See {@link $.fn}.
 *
 * @module jqueryExtensions
 */

import cd from './cd';
import { handleScroll } from './eventHandlers';

/**
 * Scroll to a specified position vertically.
 *
 * @param {number} y
 * @param {boolean} [smooth=true]
 * @param {Function} [callback]
 */
export function scrollToY(y, smooth = true, callback) {
  const onComplete = () => {
    cd.state.isAutoScrollInProgress = false;
    handleScroll();
    if (callback) {
      callback();
    }
  };

  if (smooth) {
    $('body, html').animate({ scrollTop: y }, {
      complete: function () {
        if (this !== document.documentElement) return;
        onComplete();
      },
    });
  } else {
    window.scrollTo(window.scrollX, y);
    onComplete();
  }
}

/**
 * jQuery. See {@link external:jQuery.fn} for extensions.
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
 * @memberof external:jQuery
 */
export default {
  /**
   * Remove non-element and also non-displayable (`'STYLE'`, `'LINK'`) nodes from a jQuery
   * collection.
   *
   * @returns {external:jQuery}
   * @memberof external:jQuery.fn
   */
  cdRemoveNonElementNodes: function () {
    return this.filter(function () {
      return this.tagName && !['STYLE', 'LINK'].includes(this.tagName);
    });
  },

  /**
   * Scroll to the element.
   *
   * @param {string} [alignment='top'] Where should the element be positioned relative to the
   *   viewport. Possible values: `'top'`, `'center'`, and `'bottom'`.
   * @param {boolean} [smooth=true] Whether to use a smooth animation.
   * @param {Function} [callback] Callback to run after the animation has completed.
   * @returns {external:jQuery}
   * @memberof external:jQuery.fn
   */
  cdScrollTo(alignment = 'top', smooth = true, callback) {
    let $elements = this.cdRemoveNonElementNodes();
    const offsetFirst = $elements.first().offset();
    const offsetLast = $elements.last().offset();
    if ((offsetFirst.top === 0 || offsetLast.top === 0) && offsetFirst.left === 0) {
      mw.notify(cd.s('error-elementhidden'), { type: 'error' })
      return this;
    }
    const offsetBottom = offsetLast.top + $elements.last().outerHeight();

    let top;
    if (alignment === 'center') {
      top = Math.min(
        offsetFirst.top,
        offsetFirst.top + ((offsetBottom - offsetFirst.top) * 0.5) - $(window).height() * 0.5
      );
    } else if (alignment === 'bottom') {
      top = offsetBottom - $(window).height();
    } else {
      top = offsetFirst.top - cd.g.BODY_SCROLL_PADDING_TOP;
    }

    cd.state.isAutoScrollInProgress = true;
    scrollToY(top, smooth, callback);

    return this;
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
   * @memberof external:jQuery.fn
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

    const viewportTop = $(window).scrollTop() + cd.g.BODY_SCROLL_PADDING_TOP;
    const viewportBottom = viewportTop + $(window).height();

    return partially ?
      elementBottom > viewportTop && elementTop < viewportBottom :
      elementTop >= viewportTop && elementBottom <= viewportBottom;
  },

  /**
   * Scroll to the element if it is not in the viewport.
   *
   * @param {string} [alignment='top'] One of the values that {@link $.fn.cdScrollTo} accepts:
   *   `'top'`, `'center'`, or `'bottom'`.
   * @param {boolean} [smooth=true] Whether to use a smooth animation.
   * @param {Function} [callback] Callback to run after the animation has completed.
   * @returns {external:jQuery}
   * @memberof external:jQuery.fn
   */
  cdScrollIntoView(alignment = 'top', smooth = true, callback) {
    if (this.cdIsInViewport()) {
      if (callback) {
        callback();
      }
    } else {
      if (callback) {
        // Wrap in setTimeout() for a more smooth animation in case there is .focus() in the
        // callback.
        setTimeout(() => {
          this.cdScrollTo(alignment, smooth, callback);
        });
      } else {
        this.cdScrollTo(alignment, smooth, callback);
      }
    }

    return this;
  },

  /**
   * Get the element text as it is rendered in the browser, i.e. line breaks, paragraphs etc. are
   * taken into account. **This function is expensive.**
   *
   * @returns {string}
   * @memberof external:jQuery.fn
   */
  cdGetText() {
    let text;
    const dummyElement = document.createElement('div');
    [...this.get(0).childNodes].forEach((node) => {
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
   * @returns {external:jQuery}
   * @memberof external:jQuery.fn
   */
  cdAddCloseButton() {
    if (this.find('.cd-closeButton').length) return this;

    const $closeButton = $('<a>')
      .attr('title', cd.s('cf-block-close'))
      .addClass('cd-closeButton')
      .on('click', () => {
        this.empty();
      });
    this.prepend($closeButton);

    return this;
  },
};
