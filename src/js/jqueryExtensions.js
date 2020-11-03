/**
 * jQuery extensions. See {@link $.fn}.
 *
 * @module jqueryExtensions
 */

import cd from './cd';
import navPanel from './navPanel';

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
   * Removes non-element nodes from a jQuery collection.
   *
   * @returns {JQuery}
   * @memberof $.fn
   */
  cdRemoveNonElementNodes: function () {
    return this.filter(function () {
      return this.nodeType === Node.ELEMENT_NODE;
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
    const offsetTop = $elements.first().offset().top;
    const offsetTopLast = $elements.last().offset().top;
    let offsetBottom = offsetTopLast + $elements.last().outerHeight();
    if (offsetTop === 0 || offsetTopLast === 0) {
      cd.g.autoScrollInProgress = false;
      mw.notify(cd.s('error-elementhidden'), { type: 'error' })
      return this;
    }

    let offset;
    if (alignment === 'center') {
      offset = Math.min(
        offsetTop,
        offsetTop + ((offsetBottom - offsetTop) * 0.5) - $(window).height() * 0.5
      );
    } else if (alignment === 'bottom') {
      offset = offsetBottom - $(window).height();
    } else {
      offset = offsetTop;
    }

    const onComplete = () => {
      cd.g.autoScrollInProgress = false;
      navPanel.registerSeenComments();
      navPanel.updateCommentFormButton();
    };

    if (smooth) {
      $('body, html').animate({ scrollTop: offset }, {
        complete: () => {
          onComplete();
          if (callback) {
            callback();
          }
        }
      });
    } else {
      window.scrollTo(0, offset);
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
   * partially hidden, as it can not remember their state.
   *
   * @param {boolean} partially Return true even if only a part of the element is in the viewport.
   * @returns {JQuery}
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

    if (wasHidden) {
      $elements.hide();
    }

    const viewportTop = $(window).scrollTop();
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
      this.cdScrollTo(alignment, smooth, callback);
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
    document.body.removeChild(dummyElement);
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
