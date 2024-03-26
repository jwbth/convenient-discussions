import cd from './cd';

/**
 * Class representing a table of contents item.
 */
export default class TocItem {
  /**
   * Create a table of contents item object.
   *
   * @param {object} a
   * @param {object} toc
   * @throws {Array.<string|Element>}
   */
  constructor(a, toc) {
    this.toc = toc;
    this.canBeModified = this.toc.canBeModified;

    const textSpan = a.querySelector(this.toc.isInSidebar() ? '.vector-toc-text' : '.toctext');
    if (!textSpan) {
      throw ['Couldn\'t find text for a link', a];
    }

    const headline = textSpan.textContent;
    const id = a.getAttribute('href').slice(1);
    const li = a.parentNode;
    const level = Number(
      li.className.match(this.toc.isInSidebar() ? /vector-toc-level-(\d+)/ : /\btoclevel-(\d+)/)[1]
    );
    const numberSpan = a.querySelector(this.toc.isInSidebar() ? '.vector-toc-numb' : '.tocnumber');
    let number;
    if (numberSpan) {
      number = numberSpan.textContent;
    } else {
      console.error(['Couldn\'t find a number for a link', a]);
      number = '?';
    }

    /**
     * Link jQuery element.
     *
     * @name $link
     * @type {external:jQuery}
     * @memberof TocItem
     * @instance
     */

    Object.assign(this, {
      headline,
      id,
      level,
      number,
      $element: $(li),
      $link: $(a),
      $text: $(textSpan),
    });
  }

  /**
   * _For internal use._ Generate HTML to use it in the TOC for the section. Only a limited number
   * of HTML elements is allowed in TOC.
   *
   * @param {external:jQuery} $headline
   */
  replaceText($headline) {
    if (!this.canBeModified) return;

    const html = $headline
      .clone()
      .find('*')
      .each((i, el) => {
        if (['B', 'EM', 'I', 'S', 'STRIKE', 'STRONG', 'SUB', 'SUP'].includes(el.tagName)) {
          [...el.attributes].forEach((attr) => {
            el.removeAttribute(attr.name);
          });
        } else {
          [...el.childNodes].forEach((child) => {
            el.parentNode.insertBefore(child, el);
          });
          el.remove();
        }
      })
      .end()
      .html();
    this.$text.html(html);
    this.headline = this.$text.text().trim();
  }

  /**
   * Add/remove a subscription mark to the section's TOC link according to its subscription state
   * and update the `title` attribute.
   *
   * @param {?boolean} subscriptionState
   */
  updateSubscriptionState(subscriptionState) {
    if (!this.canBeModified) return;

    if (subscriptionState) {
      this.$link
        .find(this.toc.isInSidebar() ? '.vector-toc-text' : '.toctext')
        .append(
          $('<span>').addClass('cd-toc-subscriptionIcon-before'),
          $('<span>')
            .addClass('cd-toc-subscriptionIcon')
            .attr('title', cd.s('toc-watched'))
        );
    } else {
      this.$link
        .removeAttr('title')
        .find('.cd-toc-subscriptionIcon, .cd-toc-subscriptionIcon-before')
        .remove();
    }
  }
}
