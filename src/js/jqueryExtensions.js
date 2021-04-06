/**
 * jQuery extensions. See {@link $.fn}.
 *
 * @module jqueryExtensions
 */

import cd from './cd';
import { handleScroll } from './eventHandlers';

/**
 * jQuery. See {@link $.fn} for extensions.
 *
 * @namespace $
 * @type {object}
 */

/**
 * (`$.fn`) jQuery extensions.
 *
 * @namespace fn
 * @memberof $
 */
export default {
  /**
   * Remove non-element and also non-displayable (`'STYLE'`, `'LINK'`) nodes from a jQuery
   * collection.
   *
   * @returns {JQuery}
   * @memberof $.fn
   */
  cdRemoveNonElementNodes: function () {
    return this.filter(function () {
      return this.nodeType === Node.ELEMENT_NODE && !['STYLE', 'LINK'].includes(this.tagName);
    });
  },

  /**
   * Scroll to the element.
   *
   * @param {string} [alignment='top'] Where should the element be positioned relative to the
   *   viewport. Possible values: `'top'`, `'center'`, and `'bottom'`.
   * @param {boolean} [smooth=true] Whether to use a smooth animation.
   * @param {Function} [callback] Callback to run after the animation has completed.
   * @returns {JQuery}
   * @memberof $.fn
   */
  cdScrollTo(alignment = 'top', smooth = true, callback) {
    cd.g.autoScrollInProgress = true;

    let $elements = this.cdRemoveNonElementNodes();
    const offsetFirst = $elements.first().offset();
    const offsetLast = $elements.last().offset();
    if ((offsetFirst.top === 0 || offsetLast.top === 0) && offsetFirst.left === 0) {
      cd.g.autoScrollInProgress = false;
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

    const onComplete = () => {
      cd.g.autoScrollInProgress = false;
      handleScroll();
    };

    if (smooth) {
      $('body, html').animate({ scrollTop: top }, {
        complete: function () {
          if (this !== document.documentElement) return;
          onComplete();
          if (callback) {
            callback();
          }
        },
      });
    } else {
      window.scrollTo(0, top);
      onComplete();
      if (callback) {
        callback();
      }
    }

    return this;
  },

  /**
   * Check if the element is in the viewport. Hidden elements are checked as if they were visible.
   *
   * This method is not supposed to be used on element collections that are partially visible,
   * partially hidden, as it can't remember their state.
   *
   * @param {boolean} partially Return `true` even if only a part of the element is in the viewport.
   * @returns {?boolean}
   * @memberof $.fn
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
   * @param {string} [alignment] One of the values that {@link $.fn.cdScrollTo} accepts: `'top'`,
   *   `'center'`, or `'bottom'`.
   * @param {boolean} [smooth=true] Whether to use a smooth animation.
   * @param {Function} [callback] Callback to run after the animation has completed.
   * @returns {JQuery}
   * @memberof $.fn
   */
  cdScrollIntoView(alignment, smooth = true, callback) {
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
   * @memberof $.fn
   */
  cdGetText() {
    let text;
    const dummyElement = document.createElement('div');
    Array.from(this.get(0).childNodes).forEach((node) => {
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
   * @memberof $.fn
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
