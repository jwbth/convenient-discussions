import debug from './debug';
import MsgForm from './MsgForm';

export default class Msg {
  #firstWidth;
  #underlayer;
  #underlayerTop;
  #underlayerLeft;
  #underlayerWidth;
  #underlayerHeight;
  #linksUnderlayer;
  #linksUnderlayerTop;
  #linksUnderlayerLeft;
  #linksUnderlayer_text;
  #linksUnderlayer_gradient;
  #highlightedMsgsInViewportBelow;
  #$underlayersInViewportBelow;
  #cached$elements;
  #cachedMsgText;
  #cachedParent;
  #cachedSection;
  #cachedIsAuthorRegistered;

  constructor(dateContainer) {
    // The most expensive part. We avoid using jQuery here and try to implement everything
    // at the lowest level.

    // Extract the date data, sometimes the author too. We take the last date on the first line
    // where there are dates (farther, there would be dates of the replies to this message).
    const dateContainerText = dateContainer.textContent;
    let author;
    let date;
    let year;
    let month;
    let day;
    let hours;
    let minutes;
    // Taking into account the second call below, it's a long but cost-effective analogue of this
    // expression:
    // /(.*)(((\b\d?\d):(\d\d), (\d\d?) ([а-я]+) (\d\d\d\d)) \(UTC\))/
    let dateMatches = /\b\d?\d:\d\d, \d\d? [а-я]+ \d\d\d\d \(UTC\)|Эта реплика добавлена (?:участником|с IP) .+[  ]\(о(?: · в)?\)|\(обс\.\)/
      .exec(dateContainerText);
    if (dateMatches) {
      // Workaround / FIXME
      if (!dateContainerText.includes('-- DimaBot') && !dateContainerText.includes('--DimaBot')) {
        const dateContainerTextLine = dateContainerText.slice(
          dateMatches.index,
          dateMatches.index + 1 + (dateContainerText + '\n').slice(dateMatches.index).indexOf('\n')
        );
        dateMatches = cd.env.getLastMatch(
          dateContainerTextLine,
          /((\b\d?\d):(\d\d), (\d\d?) ([а-я]+) (\d\d\d\d) \(UTC\))|Эта реплика добавлена (?:участником|с IP) (.+)[  ]\(о(?: · в)?\)|\(обс\.\)/g
        );
      } else {
        dateMatches = cd.env.getLastMatch(
          dateContainerText,
          /((\b\d?\d):(\d\d), (\d\d?) ([а-я]+) (\d\d\d\d) \(UTC\))|Эта реплика добавлена (?:участником|с IP) (.+)[  ]\(о(?: · в)?\)|\(обс\.\)/g
        );
      }
      if (!dateMatches) {  // Logically, this should never happen.
        throw new cd.env.Exception();
      }

      if (dateMatches[1]) {
        date = dateMatches[1];

        hours = Number(dateMatches[2]);
        minutes = Number(dateMatches[3]);
        day = Number(dateMatches[4]);
        month = cd.env.getMonthNumber(dateMatches[5]);
        year = Number(dateMatches[6]);
      } else {
        if (dateMatches[7]) {
          author = dateMatches[7];
        } else {
          author = '';
          // A flag to ignore this message when comparing previous messages as part of locating
          // message in the code.
          this.ignoreInComparison = true;
        }
        date = null;
      }
    }
    if (date === undefined) {
      throw new cd.env.Exception();
    }

    // Start the traversal.
    const parts = [];
    const dateOrAuthor = date || author;
    let current = dateContainer;
    let closestPartWithDate = current;
    let closestBeforeGoingParent = current;
    let steppedUpFromNotInline = false;
    let steppedUpFromNotInlineOnce = false;
    let steppedBack = false;
    let hasForeignDateLaterCounter = 0;

    const recursiveGetLastNotInlineChildren = ($el) => {
      let $temp = $el.children().last();
      while ($temp.length && !cd.env.isInline($temp[0])) {
        $el = $temp;
        $temp = $el.children().last();
      }
      return $el;
    };

    // 300 seems to be a pretty safe value.
    for (let i = 0; i < 300; i++) {
      const prev = current.previousElementSibling;
      // Go back.
      if (prev) {
        steppedBack = true;
        steppedUpFromNotInline = false;
        current = prev;
      // Go up, but it's important for us not to capture the higher nodes that add nothing
      // (otherwise we can capture replies to our message). To achieve that, we fill
      // steppedUpFromNotInline. Going up from inline nodes doesn't add nothing.
      } else {
        steppedBack = false;
        if (!cd.env.isInline(current)) {
          steppedUpFromNotInline = true;
          steppedUpFromNotInlineOnce = true;
        }
        current = current.parentElement;
        if (!current) {
          break;
        }
      }
      if (current.className.includes('cd-msgPart')) {
        break;
      }
      if (cd.env.isInline(current)) {
        continue;
      }

      const currentText = current.textContent;
      if (// {{outdent}} template
        currentText.includes('┌───') ||
        // The next is some blocker.
        ['H1', 'H2', 'H3', 'H4', 'H5', 'H6'].includes(current.tagName) ||
        cd.env.NAMESPACE_NUMBER % 2 === 1 && current.className.includes('tmbox') ||
        (current.tagName === 'HR' &&
          current.previousElementSibling &&
          current.previousElementSibling.classList.contains('cd-msgLevel')
        ) ||
        current === cd.env.contentElement
      ) {
        break;
      }

      if (currentText.includes('(UTC)')) {
        let isBlockToExclude = false;
        if (current.tagName === 'BLOCKQUOTE') {
          isBlockToExclude = true;
        }
        if (!isBlockToExclude && current.className && cd.config.BLOCKS_TO_EXCLUDE_CLASSES.length) {
          for (let j = 0; j < current.classList.length; j++) {
            for (let k = 0; k < cd.config.BLOCKS_TO_EXCLUDE_CLASSES.length; k++) {
              if (current.classList[j] === cd.config.BLOCKS_TO_EXCLUDE_CLASSES[k]) {
                isBlockToExclude = true;
                break;
              }
            }
            if (isBlockToExclude) break;
          }
        }

        if (!isBlockToExclude &&
          !currentText.includes('-- DimaBot') &&
          !currentText.includes('--DimaBot')
        ) {
          const authorLink = current.querySelector(cd.config.AUTHOR_SELECTOR) ||
            current.querySelector('a[href*="/wiki/User:"]');
          // If there's no user links then it's most probably a quote.
          if (authorLink) {
            // Experimentally: if there is "(обс.)" in the end of the paragraph, it means that
            // somebody has signed without time.
            if (currentText.includes('(обс.)\n\n')) {
              break;
            }
            // There is no our date but there is some other date, i.e. we have gone too far, – get
            // inside and try to find the elements from the end where there are no dates; this
            // happens with the following structure:
            // :* Smth. [signature]
            // :* Smth. <!-- The part of the message that we need to grab, while it is in the same
            //               element with the upper part. -->
            // :: Smth. [signature] <!-- The part of the message that we start from. -->
            // Exit if unsuccessful.
            if (steppedBack || !currentText.includes(dateOrAuthor)) {
              // Another date at the end of the line – nothing more to search for.
              if (/\(UTC\)\s*$/.test(currentText)) {
                break;
              }

              const $textNodesWithDate = $(current).contents().filter(function () {
                return this.nodeType === Node.TEXT_NODE && this.textContent.includes('(UTC)');
              });
              if ($textNodesWithDate.length) {
                break;
              }

              current = recursiveGetLastNotInlineChildren($(current))[0];
              currentText = current.textContent;
              if (currentText.includes('(UTC)') ||
                current.className.includes('outdent-template')
              ) {
                break;
              }
            // If there is some other date before our date and they are not parts of one line, i.e.
            // we have gone too far, exit. An example of a complex case –
            // [[Википедия:Форум/Вниманию участников#Обозначение статуса Ельцина в статьях про события октября 1993 года]],
            // "Ещё один момент" message. There, "07:38, 24 октября 2016 (UTC)" as a quote is
            // repeated not only in the message but in the reply to it too.
            } else if (currentText.indexOf('(UTC)') < currentText.indexOf(dateOrAuthor)) {
              const foreignDateMatch = currentText.match(
                /\b\d?\d:\d\d, \d\d? [а-я]+ \d\d\d\d \(UTC\)/
              );
              const foreignDate = foreignDateMatch && foreignDateMatch[0];
              if (foreignDate) {
                // Long but cost-saving analogue of a regular expression
                // "'.+?' + mw.RegExp.escape(foreignDate) + '.+' + mw.RegExp.escape(dateOrAuthor)"
                // Saves not much, however: 40 ms on a megabyte Ф-ПРА.
                if (currentText.includes(
                  '\n',
                  currentText.indexOf(foreignDate) +
                    foreignDate.length, currentText.indexOf(foreignDate) +
                    1 +
                    currentText.slice(currentText.indexOf(foreignDate)).indexOf(dateOrAuthor)
                )) {
                  break;
                }
              }
            // If there is a date after, i.e. there is a reply, we can't climb up the tree, so that
            // we are able to exclude the reply afterwards.
            } else if (currentText.includes(
              '(UTC)',
              currentText.lastIndexOf(dateOrAuthor) + dateOrAuthor.length
            )) {
              hasForeignDateLaterCounter++;
            }
          }
        }
      }
      // There's no date, but since there is some element, consider it a part of the message.
      if (!currentText.includes(dateOrAuthor)) {
        parts.push(current);
      // Move on.
      // * !steppedBack is needed so that the second reply in a row with the same date wasn't
      //   considered the same reply.
      // * current.tagName === 'DIV' is needed for cases like
      //   [[Википедия:Форум/Технический#We need your feedback to improve Lua functions]] where
      //   a part of a message is in an additional <div> tag.
      } else if ((!steppedUpFromNotInline ||
          current.tagName === 'DIV'
        ) &&
        !steppedBack &&
        hasForeignDateLaterCounter <= 1
      ) {
        closestPartWithDate = current;
      }
    }

    // Extract only this answer, exluding replies to it.
    const partsToAddIfHasAnswers = [];
    const cpwdChildNodes = closestPartWithDate.childNodes;
    let metReply = false, waitForNotInline = false;
    for (let i = 0; i < cpwdChildNodes.length; i++) {
      const cpwdChildNode = cpwdChildNodes[i];
      const cpwdChildNodeText = cpwdChildNode.textContent;
      if (cpwdChildNode.nodeType === Node.TEXT_NODE || cd.env.isInline(cpwdChildNode)) {
        // Everything after our date will be not our message. Except that somebody has written
        // something to the end – we wait for the next not inline element and stop at it. (Example:
        // [[Википедия:Форум/Архив/Вниманию_участников/2017/06]] "Если о том значке".)
        if (cpwdChildNodeText.includes(date)) {
          waitForNotInline = true;
        }
        partsToAddIfHasAnswers.push(cpwdChildNode);
        continue;
      }
      if (!cd.env.isInline(cpwdChildNode) && waitForNotInline) {
        metReply = true;
        break;
      }

      // If it contains a date, but doesn't contain our date, it's a reply.
      metReply = cpwdChildNodeText.includes('(UTC)') && !cpwdChildNodeText.includes(date);
      if (metReply) {
        break;
      } else {
        partsToAddIfHasAnswers.push(cpwdChildNode);
        continue;
      }
    }

    let elements = metReply ? partsToAddIfHasAnswers : [closestPartWithDate];
    if (elements.length > 1 || elements[0].nodeType === Node.TEXT_NODE) {
      const wrapper = document.createElement('div');
      const parent = elements[0].parentElement;
      for (let i = 0; i < elements.length; i++) {
        wrapper.appendChild(elements[i]);
      }
      parent.insertBefore(wrapper, parent.firstChild);
      elements = [wrapper];
    }

    if (!author) {
      // Extract the author. Take the last link to the corresponding page.
      // Участни, Обсуждение_участни, Служебная:Вклад (in cd.config.AUTHOR_SELECTOR); the rest
      // (users from other WMF projects). TODO: encompass cases like
      // [[w:en:Wikipedia:TWL/Coordinators|The Wikipedia Library Team]]). It should also be done in
      // other places where various author selectors are used.
      let authorLinks = elements[elements.length - 1].querySelectorAll(cd.config.AUTHOR_SELECTOR);
      if (!authorLinks.length) {
        authorLinks = elements[elements.length - 1].querySelectorAll('a[href*="/wiki/User:"]');
      }
      if (!authorLinks.length) {
        throw new cd.env.Exception();
      }

      const authorMatches = cd.config.AUTHOR_LINK_REGEXP.exec(
        authorLinks[authorLinks.length - 1].getAttribute('href')
      );
      author = authorMatches && decodeURIComponent(authorMatches[1] || authorMatches[2] ||
         authorMatches[3] || authorMatches[4]);
      author = author && author
        .replace(/&action=edit.*/, '')
        .replace(/_/g, ' ');
      if (!author && author === 'DimaBot') {
        throw new cd.env.Exception();
      }
    }

    const anchor = cd.env.generateMsgAnchor(year, month, day, hours, minutes, author);

    for (let i = parts.length - 1; i >= 0; i--) {
      const part = parts[i];
      const class_ = part.className;
      if (part.tagName === 'STYLE' ||
        part.tagName === 'LINK' ||
        class_.includes('cd-msg') ||
        class_.includes('tleft') ||
        class_.includes('tright') ||
        class_.includes('float') ||
        class_.includes('infobox') ||
        part.style.float === 'left' ||
        part.style.float === 'right'
      ) {
        parts.splice(i, 1);
      }
    }
    if (parts.length) {
      elements = elements.concat(parts);
    }

    if (!elements.length) {
      throw new cd.env.Exception();
    }

    const sortElements = () => {
      // Sort elements according to their position in the DOM.
      elements.sort((a, b) => {
        if (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_PRECEDING) {
          // b earlier than a
          return 1;
        } else {
          return -1;
        }
      });
    };

    sortElements();

    let broken;
    for (let i = elements.length - 1; i >= 0; i--) {
      broken = false;
      // Remove duplicates and elements contained by others.
      for (let j = 0; j < i; j++) {
        if (elements[i] === elements[j] ||
          elements[j].compareDocumentPosition(elements[i]) & Node.DOCUMENT_POSITION_CONTAINED_BY
        ) {
          elements.splice(i, 1);
          broken = true;
          break;
        }
      }
      if (broken) continue;
      if (elements[i].className.includes('mw-empty-elt')) {
        elements.splice(i, 1);
      }
    }

    // dd, li instead of dl, ul, ol in collections.
    let changed = false;
    if (steppedUpFromNotInlineOnce) {
      for (let i = elements.length - 1; i >= 0; i--) {
        if (['UL', 'DL', 'OL'].includes(elements[i].tagName)) {
          // Transform into a simple array.
          let children = Array.prototype.slice.call(elements[i].children);
          while (
            children &&
            children[0] &&
            children[0].children &&
            children[0].children.length === 1 &&
            cd.env.elementsToText($.makeArray(children[0].children)) ===
              cd.env.elementsToText($.makeArray(children[0].childNodes)) &&
            ['UL', 'DL', 'OL', 'LI', 'DD'].includes(children[0].children[0].tagName)
          ) {
            children = Array.prototype.slice.call(children[0].children);
          }

          elements = elements.concat(children);
          elements.splice(i, 1);
          changed = true;
        }
      }
    }

    if (changed) {
      sortElements();
    }

    if (cd.env.EVERYTHING_MUST_BE_FROZEN) {
      this.frozen = true;
    } else if (cd.parse.closedDiscussions.length) {
      for (let i = 0; i < cd.parse.closedDiscussions.length; i++) {
        if (cd.parse.closedDiscussions[i].contains(elements[0])) {
          this.frozen = true;
          break;
        }
      }
    }
    if (this.frozen === undefined) {
      this.frozen = false;
    }

    this.id = cd.parse.currentMsgId;
    this.author = author;
    if (anchor) {
      this.anchor = anchor;
    }
    this.date = date;
    this.timestamp = Date.UTC(year, month, day, hours, minutes);
    this.elements = elements;

    if (anchor && !elements[0].id) {
      elements[0].id = anchor;
    }
    for (let i = 0; i < elements.length; i++) {
      const element = elements[i];
      if (elements.length === 1) {
        element.className += ' cd-msgPart cd-msgPart-first cd-msgPart-last';
      } else {
        if (i === 0) {
          element.className += ' cd-msgPart cd-msgPart-first';
        } else if (i === elements.length - 1) {
          element.className += ' cd-msgPart cd-msgPart-last';
        }
      }

      element.setAttribute('data-id', cd.parse.currentMsgId);

      if (!element.className.includes('ruwiki-movedTemplate')) {
        element.onmouseenter = this.highlightFocused.bind(this);
        element.onmouseleave = this.unhighlightFocused.bind(this);
      }
    }

    const setMsgLevels = (initialElement, isTop) => {
      const msgsToTopLevel = [];
      let topLevel = 0;
      for (let currentElement = initialElement;
        currentElement && currentElement !== cd.env.contentElement;
        currentElement = currentElement.parentElement
      ) {
        if (currentElement.tagName === 'UL' ||
          currentElement.tagName === 'DL' ||
          (currentElement.tagName === 'OL' && isTop)
        ) {
          if (!currentElement.classList.contains('cd-msgLevel') && msgBottomLevel !== 0) {
            currentElement.className += ' cd-msgLevel';
            msgsToTopLevel.unshift(currentElement);
          } else {
            const topLevelMatches = currentElement.className.match(/cd-msgLevel-(\d+)/);
            if (topLevelMatches) {
              topLevel = Number(topLevelMatches[1]);
            }
            break;
          }
        }
      }

      if (msgsToTopLevel.length) {
        let currentLevel = topLevel;
        for (let i = 0; i < msgsToTopLevel.length; i++) {
          currentLevel++;
          msgsToTopLevel[i].className += ' cd-msgLevel-' + currentLevel;
        }
        if (!isTop) {
          msgBottomLevel = currentLevel;
        } else {
          this.level = currentLevel;
        }
      } else {
        if (!isTop) {
          msgBottomLevel = topLevel;
        } else {
          this.level = topLevel;
        }
      }
    };

    // msgBottomLevel is used to prevent the message from being considered to be at a lower level
    // (and thus draw a line to the left of its top) if only its top is on it (more precisely, if
    // the top is on the zero level).
    let msgBottomLevel;
    if (elements.length > 1) {
      setMsgLevels(elements[elements.length - 1], false);
    }
    setMsgLevels(elements[0], true);
  }

  getPositions(considerFloating = false, rectTop, rectBottom) {
    rectTop = rectTop || this::getFirstElementRect();
    rectBottom = rectBottom || (this.elements.length === 1 ?
      rectTop :
      this.elements[this.elements.length - 1].getBoundingClientRect()
    );

    const viewportTop = window.pageYOffset;
    const viewportHeight = window.innerHeight;

    const msgTop = viewportTop + rectTop.top;
    const msgBottom = viewportTop + rectBottom.bottom;

    let msgLeft;
    let msgRight;
    if (!considerFloating) {
      msgLeft = window.pageXOffset + Math.min(rectTop.left, rectBottom.left);
      msgRight = window.pageXOffset + Math.min(rectTop.right, rectBottom.right);
    } else {
      let intersectsFloating = false;
      for (let i = 0; i < cd.env.floatingElements.length; i++) {
        const rect = cd.env.floatingRects[i] || cd.env.floatingElements[i].getBoundingClientRect();
        const floatingTop = viewportTop + rect.top;
        const floatingBottom = viewportTop + rect.bottom;
        if (// A precise value in Chrome is 37, but it's useful to leave a small reserve.
          msgTop > floatingTop && msgTop < floatingBottom && msgBottom <= floatingBottom + 35 ||
          msgBottom > floatingTop && msgBottom < floatingBottom
        ) {
          intersectsFloating = true;
          break;
        }
      }

      const defaultOverflows = [];
      // We count left and right separately – in that case, we need to change overflow to get the
      // desired value, otherwise floating elements are not taken into account.
      if (intersectsFloating) {
        for (let i = 0; i < this.elements.length; i++) {
          defaultOverflows.push(this.elements[i].style.overflow);
          this.elements[i].style.overflow = 'hidden';
        }
      }
      const rects = [];
      for (let i = 0; i < this.elements.length; i++) {
        rects[i] = this.elements[i].getBoundingClientRect();
      }
      for (let i = 0; i < rects.length; i++) {
        const elementLeft = window.pageXOffset + rects[i].left;
        if (!msgLeft || elementLeft < msgLeft) {
          msgLeft = elementLeft;
        }
      }
      for (let i = 0; i < rects.length; i++) {
        const elementRight = msgLeft + this.elements[i].offsetWidth;
        if (!msgRight || elementRight > msgRight) {
          msgRight = elementRight;
        }
      }
      if (intersectsFloating) {
        for (let i = 0; i < this.elements.length; i++) {
          this.elements[i].style.overflow = defaultOverflows[i];
        }
      }
    }

    // A solution for messages the height of which is bigger than the viewport height. In Chrome,
    // a scrolling step is 40 pixels.
    const downplayedBottom = msgBottom - msgTop > (viewportHeight - 200) ?
      msgTop + (viewportHeight - 200) :
      msgBottom;

    this.positions = {
      top: msgTop,
      bottom: msgBottom,
      left: msgLeft,
      right: msgRight,
      downplayedBottom,
    };

    return this.positions;
  }

  calculateUnderlayerPositions(firstElementRect, lastElementRect) {
    // getBoundingClientRect() calculation is a little costly, so we take the value that is already
    // calculated.

    this.getPositions(true, firstElementRect, lastElementRect);

    // This is for the comparison to determine if the element has shifted.
    this.#firstWidth = this.elements[0].offsetWidth;

    const underlayerTop = cd.env.underlayersYCorrection + this.positions.top;
    const underlayerLeft = cd.env.underlayersXCorrection + this.positions.left -
      cd.env.UNDERLAYER_SIDE_MARGIN;
    const underlayerWidth = this.positions.right - this.positions.left +
      cd.env.UNDERLAYER_SIDE_MARGIN * 2;
    const underlayerHeight = this.positions.bottom - this.positions.top;

    const linksUnderlayerTop = this.positions.top;
    const linksUnderlayerLeft = this.positions.left - cd.env.UNDERLAYER_SIDE_MARGIN;

    return {
      underlayerTop,
      underlayerLeft,
      underlayerWidth,
      underlayerHeight,
      linksUnderlayerTop,
      linksUnderlayerLeft,
    };
  }

  configureUnderlayer(returnResult = false) {
    const elements = this.elements;
    const rectTop = this::getFirstElementRect();
    const rectBottom = elements.length === 1 ?
      rectTop :
      elements[elements.length - 1].getBoundingClientRect();
    const underlayerMisplaced = this.#underlayer && (
      rectTop.top + window.pageYOffset + cd.env.underlayersYCorrection !== this.#underlayerTop ||
      rectBottom.bottom - rectTop.top !== this.#underlayerHeight ||
      elements[0].offsetWidth !== this.#firstWidth
    );

    // We configure underlayer only if it was unexistent or the message position changed to save
    // time.
    if (!this.#underlayer) {
      // Prepare the underlayer nodes.
      const positions = this.calculateUnderlayerPositions(rectTop, rectBottom);

      this.#underlayerTop = positions.underlayerTop;
      this.#underlayerLeft = positions.underlayerLeft;
      this.#underlayerWidth = positions.underlayerWidth;
      this.#underlayerHeight = positions.underlayerHeight;
      this.#linksUnderlayerTop = positions.linksUnderlayerTop;
      this.#linksUnderlayerLeft = positions.linksUnderlayerLeft;

      this.#underlayer = cd.env.UNDERLAYER_PROTOTYPE.cloneNode(true);
      if (this.newness === 'newest') {
        this.#underlayer.className += ' cd-underlayer-newest';
      } else if (this.newness === 'new') {
        this.#underlayer.className += ' cd-underlayer-new';
      }

      this.#underlayer.style.top = this.#underlayerTop + 'px';
      this.#underlayer.style.left = this.#underlayerLeft + 'px';
      this.#underlayer.style.width = this.#underlayerWidth + 'px';
      this.#underlayer.style.height = this.#underlayerHeight + 'px';

      this.#underlayer.cdTarget = this;
      cd.env.underlayers.push(this.#underlayer);

      this.#linksUnderlayer = cd.env.LINKS_UNDERLAYER_PROTOTYPE.cloneNode(true);

      this.#linksUnderlayer.style.top = this.#linksUnderlayerTop + 'px';
      this.#linksUnderlayer.style.left = this.#linksUnderlayerLeft + 'px';
      this.#linksUnderlayer.style.width = this.#underlayerWidth + 'px';
      this.#linksUnderlayer.style.height = this.#underlayerHeight + 'px';

      const linksUnderlayer_wrapper = this.#linksUnderlayer.firstChild;
      // These variables are "more global", we need to access them from the outside.
      this.#linksUnderlayer_gradient = linksUnderlayer_wrapper.firstChild;
      this.#linksUnderlayer_text = linksUnderlayer_wrapper.lastChild;

      if (this.parent) {
        const upButton = cd.env.MSG_UP_BUTTON_PROTOTYPE.cloneNode(true);
        upButton.firstChild.href = this.parent.anchor ?
          '#' + this.parent.anchor :
          'javascript:';
        upButton.onclick = this.scrollToParent.bind(this);
        this.#linksUnderlayer_text.appendChild(upButton);
      }

      if (this.anchor) {
        const  linkButton = cd.env.MSG_LINK_BUTTON_PROTOTYPE.cloneNode(true);
        this.#linksUnderlayer_text.appendChild(linkButton);
        const linkButtonLink = linkButton.firstChild;
        linkButtonLink.href = mw.util.getUrl(cd.env.CURRENT_PAGE) + '#' + this.anchor;
        linkButtonLink.onclick = this.copyLink.bind(this);
      }

      if (!this.frozen) {
        if (this.author === cd.env.CURRENT_USER || cd.settings.allowEditOthersMsgs) {
          const editButton = cd.env.MSG_EDIT_BUTTON_PROTOTYPE.cloneNode(true);
          editButton.firstChild.onclick = () => {
            this.#underlayer.classList.remove('cd-underlayer-focused');
            this.#linksUnderlayer.classList.remove('cd-linksUnderlayer-focused');
            this.edit();
          };
          this.#linksUnderlayer_text.appendChild(editButton);
        }

        const replyButton = cd.env.MSG_REPLY_BUTTON_PROTOTYPE.cloneNode(true);
        replyButton.firstChild.onclick = this.reply.bind(this);
        this.#linksUnderlayer_text.appendChild(replyButton);
      } else {
        let currentElement = elements[elements.length - 1];
        while (currentElement && currentElement !== cd.env.contentElement) {
          currentElement = currentElement.parentElement;
          let bgcolor = currentElement.style.backgroundColor;
          if (bgcolor.includes('rgb(')) {
            this.bgcolor = bgcolor;
            break;
          }
        }
      }

      let returnValue;
      if (!returnResult) {
        cd.env.underlayersContainer.appendChild(this.#underlayer);
        cd.env.linksUnderlayersContainer.appendChild(this.#linksUnderlayer);

        // To eliminate flickering when hovering 1 pixel above the linksUnderlayer.
        if (cd.env.CURRENT_SKIN === 'monobook') {
          this.#linksUnderlayer.onmouseenter = this.highlightFocused.bind(this);
          this.#linksUnderlayer.onmouseleave = this.unhighlightFocused.bind(this);
        }
      } else {
        returnValue = {
          underlayer: this.#underlayer,
          linksUnderlayer: this.#linksUnderlayer,
        };
      }

      this.$underlayer = $(this.#underlayer);
      this.$linksUnderlayer = $(this.#linksUnderlayer);
      this.$linksUnderlayer_text = $(this.#linksUnderlayer_text);
      this.$linksUnderlayer_gradient = $(this.#linksUnderlayer_gradient);

      return returnValue || false;
    } else if (underlayerMisplaced) {
      debug.startTimer('underlayer misplaced');
      const positions = this.calculateUnderlayerPositions(rectTop, rectBottom);

      this.#underlayerTop = positions.underlayerTop;
      this.#underlayerLeft = positions.underlayerLeft;
      this.#underlayerWidth = positions.underlayerWidth;
      this.#underlayerHeight = positions.underlayerHeight;
      this.#linksUnderlayerTop = positions.linksUnderlayerTop;
      this.#linksUnderlayerLeft = positions.linksUnderlayerLeft;

      if (!returnResult) {
        this.#underlayer.style.top = this.#underlayerTop + 'px';
        this.#underlayer.style.left = this.#underlayerLeft + 'px';
        this.#underlayer.style.width = this.#underlayerWidth + 'px';
        this.#underlayer.style.height = this.#underlayerHeight + 'px';

        this.#linksUnderlayer.style.top = this.#linksUnderlayerTop + 'px';
        this.#linksUnderlayer.style.left = this.#linksUnderlayerLeft + 'px';
        this.#linksUnderlayer.style.width = this.#underlayerWidth + 'px';
        this.#linksUnderlayer.style.height = this.#underlayerHeight + 'px';

        debug.resetTimer('underlayer misplaced');

        return true;
      } else {
        debug.resetTimer('underlayer misplaced');

        // This wasn't used anywhere.
        return {
          underlayer: {
            top: this.#underlayerTop,
            left: this.#underlayerLeft,
            width: this.#underlayerWidth,
            height: this.#underlayerHeight,
          },
          linksUnderlayer: {
            top: this.#linksUnderlayerTop,
            left: this.#linksUnderlayerLeft,
            width: this.#underlayerWidth,
            height: this.#underlayerHeight,
          },
        };
      }

      return true;
    } else {
      return false;
    }
  }

  updateUnderlayerPositions() {
    this.#underlayer.style.top = this.#underlayerTop + 'px';
    this.#underlayer.style.left = this.#underlayerLeft + 'px';
    this.#underlayer.style.width = this.#underlayerWidth + 'px';
    this.#underlayer.style.height = this.#underlayerHeight + 'px';

    this.#linksUnderlayer.style.top = this.#linksUnderlayerTop + 'px';
    this.#linksUnderlayer.style.left = this.#linksUnderlayerLeft + 'px';
    this.#linksUnderlayer.style.width = this.#underlayerWidth + 'px';
    this.#linksUnderlayer.style.height = this.#underlayerHeight + 'px';
  }

  // Highlight even in zones where DOM thinks the message is not (between paragraphs and such).
  highlightFocused() {
    if (cd.env.recalculateUnderlayersTimeout) return;

    let misplaced = !!this.configureUnderlayer();

    if (!misplaced) {
      this.#underlayer.classList.add('cd-underlayer-focused');
      this.#linksUnderlayer.classList.add('cd-linksUnderlayer-focused');

      // Settings of the nice gradient to the left from the links underlayer
      if (this.bgcolor) {
        this.#linksUnderlayer_text.style.backgroundColor = this.bgcolor;
        let transparentColor = cd.env.getTransparentColor(this.bgcolor);
        this.#linksUnderlayer_gradient.style.backgroundImage = 'linear-gradient(to left, ' +
          this.bgcolor + ', ' + transparentColor + ')';
      }
    }
  }

  unhighlightFocused() {
    if (!this.#underlayer || !this.#linksUnderlayer) {
      return;
    }

    this.#underlayer.classList.remove('cd-underlayer-focused');
    this.#linksUnderlayer.classList.remove('cd-linksUnderlayer-focused');

    // Just in case
    if (this.bgcolor) {
      this.#linksUnderlayer_text.style.backgroundColor = null;
      this.#linksUnderlayer_gradient.style.backgroundImage = null;
    }
  }

  // Highlight a message opened by a link or just posted.
  highlightTarget() {
    this.configureUnderlayer();

    const $elementsToAnimate = this.$underlayer
      .add(this.$linksUnderlayer_text)
      .add(this.$linksUnderlayer_gradient);

    let initialBgcolor = window.getComputedStyle(this.$underlayer[0]).backgroundColor;

    $elementsToAnimate
      .css('background-image', 'none')
      .css('background-color', cd.env.UNDERLAYER_TARGET_BGCOLOR)
      .delay(1000)
      .animate({ backgroundColor: initialBgcolor }, 400, 'swing', function () {
        $(this)
          .css('background-image', '')
          .css('background-color', '');
      });
  }

  scrollToAndHighlightTarget(smooth = false) {
    this.highlightTarget();
    if (!this.isOpeningSection) {
      this.$elements.cdScrollTo('middle', null, smooth);
    } else {
      this.section.$heading.cdScrollTo('top', null, smooth);
    }
  }

  scrollToParent(e) {
    if (e) {
      e.preventDefault();
    }
    if (!this.parent) {
      console.error('У этого сообщения нет родительского.');
      return;
    }

    if (!this.parent.isOpeningSection) {
      this.parent.$elements.cdScrollTo('top');
    } else {
      this.parent.section.$heading.cdScrollTo('top');
    }

    const downButton = new OO.ui.ButtonWidget({
      label: '▼',
      title: 'Вернуться к дочернему сообщению',
      framed: false,
      href: this.anchor ? '#' + this.anchor : 'javascript:',
      classes: ['cd-msgButton'],
    });
    downButton.on('click', this.parent.scrollToChild.bind(this.parent));

    if (!this.parent.$underlayer || !this.parent.$underlayer.length) {
      this.parent.configureUnderlayer();
    }
    if (!this.parent.downButton) {
      this.parent.$linksUnderlayer_text.prepend(downButton.$element);
    } else {
      this.parent.downButton.$element.remove();
      this.parent.$linksUnderlayer_text.prepend(downButton.$element);
    }
    this.parent.downButton = downButton;
    this.parent.childToScrollBack = this;
  }

  scrollToChild(e) {
    if (e) {
      e.preventDefault();
    }
    if (!this.childToScrollBack) {
      console.error('У этого сообщения нет дочернего, от которого перешли ранее.');
      return;
    }

    this.childToScrollBack.$elements.cdScrollTo('top');
  }

  copyLink(e) {
    let url;
    const wikilink = '[[' + cd.env.CURRENT_PAGE + '#' + this.anchor + ']]';
    try {
      url = 'https:' + mw.config.get('wgServer') + decodeURI(mw.util.getUrl(cd.env.CURRENT_PAGE)) +
        '#' + this.anchor;
    } catch (e) {
      console.error(e.stack);
      return;
    }

    if (!e.ctrlKey) {
      let link;
      let subject;
      switch (cd.settings.defaultCopyLinkType) {
        default:
        case 'wikilink':
          link = wikilink;
          subject = 'Вики-ссылка';
          break;
        case 'link':
          link = url;
          subject = 'Ссылка';
          break;
        case 'discord':
          link = '<' + url + '>';
          subject = 'Discord-ссылка';
          break;
      }

      const $textarea = $('<textarea>')
        .val(link)
        .appendTo($('body'))
        .select();
      const successful = document.execCommand('copy');
      $textarea.remove();

      if (successful) {
        e.preventDefault();
        mw.notify(subject + ' на сообщение скопирована в буфер обмена.');
      }
    } else {
      e.preventDefault();

      const messageDialog = new OO.ui.MessageDialog();
      $('body').append(cd.env.windowManager.$element);
      cd.env.windowManager.addWindows([messageDialog]);

      const textInputWikilink = new OO.ui.TextInputWidget({
        value: wikilink,
      });
      const textFieldWikilink = new OO.ui.FieldLayout(textInputWikilink, {
        align: 'top',
        label: 'Вики-ссылка',
      });

      const textInputAnchorWikilink = new OO.ui.TextInputWidget({
        value: '[[#' + this.anchor + ']]'
      });
      const textFieldAnchorWikilink = new OO.ui.FieldLayout(textInputAnchorWikilink, {
        align: 'top',
        label: 'Вики-ссылка с этой же страницы',
      });

      const textInputUrl = new OO.ui.TextInputWidget({
        value: url,
      });
      const textFieldUrl = new OO.ui.FieldLayout(textInputUrl, {
        align: 'top',
        label: 'Обычная ссылка',
      });

      const textInputDiscord = new OO.ui.TextInputWidget({
        value: '<' + url + '>',
      });
      const textFieldDiscord = new OO.ui.FieldLayout(textInputDiscord, {
        align: 'top',
        label: 'Ссылка для Discord',
      });

      const copyLinkWindow = cd.env.windowManager.openWindow(messageDialog, {
        message: textFieldWikilink.$element
          .add(textFieldAnchorWikilink.$element)
          .add(textFieldUrl.$element)
          .add(textFieldDiscord.$element),
        actions: [
          { label: 'Закрыть', action: 'close' },
        ],
        size: 'large',
      });
      const closeOnCtrlC = (e) => {
        if (e.ctrlKey && e.keyCode === 67) {  // Ctrl+C
          setTimeout(() => {
            messageDialog.close();
          }, 100);
        }
      };
      copyLinkWindow.opened.then(() => {
        (cd.settings.defaultCopyLinkType === 'wikilink' ? textInputUrl : textInputWikilink)
          .focus()
          .select();
        $(document).keydown(closeOnCtrlC);
      });
      copyLinkWindow.closed.then(() => {
        $(document).off('keydown', closeOnCtrlC);
      });
    }
  }

  locateInCode(pageCode, timestamp) {
    if (pageCode == null) {
      console.error('В первый параметр не передан код страницы. Используйте Msg.loadCode для получения местоположения сообщения в коде (оно появится в свойстве Msg.inCode).');
      return;
    }

    const authorAndDateRegExp = cd.env.generateAuthorAndDateRegExp(this.author, this.date);
    let authorAndDateMatches = authorAndDateRegExp.exec(pageCode);
    if (!authorAndDateMatches) return;

    // We declare variables here for correctMsgBeginning() function to work.
    const headingRegExp = /(^[^]*(?:^|\n))(=+)(.*?)\2[ \t]*(?:<!--[^]*?-->[ \t]*)*\n/;
    const commentRegExp = /^<!--[^]*?-->\n*/;
    const horizontalLineRegExp = /^(?:----+|<hr>)\n*/;
    let bestMatchData = {};
    let msgCode, msgStartPos, msgEndPos, headingMatch, headingCode, headingStartPos, headingLevel;

    const prevMsgs = [];
    // For the reserve method; the main method uses one date.
    let numberOfPrevDatesToCheck = 2;

    for (let i = 1;
      prevMsgs.length < numberOfPrevDatesToCheck && this.id - i >= 0;
      i++
    ) {
      if (!cd.msgs[this.id - i].ignoreInComparison) {
        prevMsgs.push(cd.msgs[this.id - i]);
      }
    }

    const correctMsgBeginning = () => {
      headingMatch = msgCode.match(headingRegExp);
      if (headingMatch) {
        if (!this.isOpeningSection) {
          console.warn('Найден заголовок раздела перед сообщением, которое не отмечено как открывающее раздел.');

          msgStartPos += headingMatch[0].length;
          msgCode = msgCode.slice(headingMatch[0].length);
        } else {
          headingStartPos = msgStartPos + headingMatch[1].length;
          headingLevel = headingMatch[2].length;
          headingCode = headingMatch[3].trim();

          msgStartPos += headingMatch[0].length;
          msgCode = msgCode.slice(headingMatch[0].length);
        }
      }
      if (!headingMatch && this.isOpeningSection) {
        console.error('Не найдено заголовка раздела перед сообщением, которое отмечено как открывающее раздел.');
      }

      const commentMatch = msgCode.match(commentRegExp);
      if (commentMatch) {
        msgStartPos += commentMatch[0].length;
        msgCode = msgCode.slice(commentMatch[0].length);
      }

      const horizontalLineMatch = msgCode.match(horizontalLineRegExp);
      if (horizontalLineMatch) {
        msgStartPos += horizontalLineMatch[0].length;
        msgCode = msgCode.slice(horizontalLineMatch[0].length);
      }

      return true;
    };

    // Main method: by the current & previous author & date & message heading & message text
    // overlap. Necessary is the current author & date & message text overlap.
    do {
      msgStartPos = 0;
      msgEndPos = authorAndDateMatches.index;
      msgCode = pageCode.slice(0, msgEndPos);

      const prevMsgInCodeMatch = cd.env.findPrevMsg(msgCode);

      let authorInCode;
      let dateInCode;
      if (prevMsgInCodeMatch) {
        msgStartPos = prevMsgInCodeMatch[0].length;
        msgCode = msgCode.slice(msgStartPos);

        [authorInCode, dateInCode] = cd.env.collectAuthorAndDate(prevMsgInCodeMatch);
      }

      let prevMsgMatched = false;
      if (prevMsgs[0]) {
        if (prevMsgs[0].date === dateInCode && prevMsgs[0].author === authorInCode) {
          prevMsgMatched = true;
        }
      } else {
        if (dateInCode === undefined && authorInCode === undefined) {
          prevMsgMatched = true;
        }
      }

      correctMsgBeginning();

      let headingMatched = false;
      if (this.isOpeningSection) {
        if (headingMatch) {
          if (this.section && this.section.heading &&
            cd.env.encodeWikiMarkup(cd.env.cleanSectionHeading(headingCode)) ===
              cd.env.encodeWikiMarkup(this.section.heading)
          ) {
            headingMatched = true;
          }
        }
      } else {
        if (!headingMatch) {
          headingMatched = true;
        }
      }

      const msgCodeToCompare = msgCode
        .replace(/<!--[^]*?-->/g, '')
        // Extract displayed text from [[wikilinks]]
        .replace(/\[\[:?(?:[^|\]]+\|)?(.+?)\]\]/g, '$1')
        // Remove URL part from [links]
        .replace(/\[https?:\/\/[^\]\[\n\r<>" ]+/, '')
        // Remove opening tags
        .replace(/<\w+( [\w ]+?=[^<>]+?| ?\/?)>/g, ' ')
        // Remove closing tags
        .replace(/<\/\w+ ?>/g, ' ');

      const overlap = cd.env.calculateWordsOverlap(this.text, msgCodeToCompare);
      if (overlap > 0.67 &&
        ((!bestMatchData.overlap || overlap > bestMatchData.overlap) ||
          (!bestMatchData.headingMatched && headingMatched) ||
          (bestMatchData.headingMatched === headingMatched &&
            !bestMatchData.prevMsgMatched && prevMsgMatched
          )
        )
      ) {
        bestMatchData = {
          overlap,
          msgStartPos,
          msgEndPos,
          sigLastPart: authorAndDateMatches[0],
          prevMsgMatched,
          headingMatched,
        };
        if (headingMatch) {
          bestMatchData.headingStartPos = headingStartPos;
          bestMatchData.headingLevel = headingLevel;
          bestMatchData.headingCode = headingCode;
        }
      }
    } while (authorAndDateMatches = authorAndDateRegExp.exec(pageCode));

    // Reserve method: by this & previous two dates + authors.
    if (!bestMatchData.msgStartPos) {
      // Should always find something (otherwise it wouldn't have found anything the previous time
      // and would've exited), so we don't specify exit the second time.
      while (authorAndDateMatches = authorAndDateRegExp.exec(pageCode)) {
        msgStartPos = 0;
        msgEndPos = authorAndDateMatches.index;
        msgCode = pageCode.slice(0, msgEndPos);
        let pageCodeToMsgEnd = msgCode;

        let fail = true;
        for (let i = 0; i < prevMsgs.length; i++) {
          const prevMsgInCodeMatch = cd.env.findPrevMsg(pageCodeToMsgEnd);
          if (!prevMsgInCodeMatch) break;

          let nextEndPos = prevMsgInCodeMatch[0].length - prevMsgInCodeMatch[1].length;
          // We could optimize it if we wanted – we identify the message start two times: here
          // and when running the first method.
          if (i === 0) {
            msgStartPos = prevMsgInCodeMatch[0].length;
            msgCode = pageCodeToMsgEnd.slice(msgStartPos);
          }
          pageCodeToMsgEnd = pageCodeToMsgEnd.slice(0, nextEndPos);

          const [authorInCode, dateInCode] = cd.env.collectAuthorAndDate(prevMsgInCodeMatch);

          if (dateInCode !== prevMsgs[i].date || authorInCode !== prevMsgs[i].author) {
            fail = true;
            break;
          }

          // At least one coincided message is enough, if the second is unavailable.
          fail = false;
        }
        if (!fail) {
          correctMsgBeginning();

          bestMatchData = {
            prevAuthorsAndDatesMatchCount: i,
            msgStartPos,
            msgEndPos,
            sigLastPart: authorAndDateMatches[0],
          };
          if (headingMatch) {
            bestMatchData.headingStartPos = headingStartPos;
            bestMatchData.headingLevel = headingLevel;
            bestMatchData.headingCode = headingCode;
          }
          break;
        }
      }

      if (fail) {
        return;
      }
    }

    msgCode = pageCode.slice(bestMatchData.msgStartPos, bestMatchData.msgEndPos);
    let msgCodeLengthReduction = 0;
    const lineStartPos = bestMatchData.msgStartPos;

    const movePartToSig = (s) => {
      msgCodeLengthReduction += s.length;
      bestMatchData.sigLastPart = s + bestMatchData.sigLastPart;
      return '';
    }

    if (this.author === cd.env.CURRENT_USER && cd.env.CURRENT_USER_SIG_PREFIX_REGEXP) {
      msgCode = msgCode.replace(cd.env.CURRENT_USER_SIG_PREFIX_REGEXP, movePartToSig);
    }
    msgCode = msgCode
      .replace(/&nbsp;$/, movePartToSig)
      .replace(cd.config.SIG_PREFIX_REGEXP, movePartToSig)
      .replace(/<(?:small|span|sup|sub)(?: [\w ]+?=[^<>]+?)?>$/i, movePartToSig)
      .replace(cd.config.SIG_PREFIX_REGEXP, movePartToSig);
    bestMatchData.msgEndPos -= msgCodeLengthReduction;

    let indentationCharacters = '';
    let inSmallTag = false;
    msgCode = msgCode
      .replace(
        /^\n*(?:\{\{(?:-vote|[зЗ]ачёркнутый голос|-голос)\|)?([:\*#]*)[ \t]*/,
        (s, m1) => {
          if (this.level === 0 ||  // FIXME: This should be done more elegantly.
            !s.trim()) {
            return s;
          }
          indentationCharacters = m1;
          bestMatchData.msgStartPos += s.length;
          return '';
        }
      )
      .replace(/^(?:\{\{block-small\|1=|<small>)/, () => {
        inSmallTag = true;
        return '';
      });

    // The message contains several indentation character sets – then use different sets depending
    // on the mode.
    let replyIndentationCharacters = indentationCharacters;
    if (!this.isOpeningSection) {
      const otherIndentationCharactersMatch = msgCode.match(/\n([:\*#]*[:\*]).*$/);
      if (otherIndentationCharactersMatch) {
        if (otherIndentationCharactersMatch[1].length <= indentationCharacters.length) {
          let replyMustUseAsterisk = false;
          if (/\*$/.test(indentationCharacters)) {
            replyMustUseAsterisk = true;
          }

          indentationCharacters = otherIndentationCharactersMatch[1];
          if (replyMustUseAsterisk) {
            indentationCharacters = indentationCharacters.replace(/:$/, '*');
          }
        } else {
          replyIndentationCharacters = otherIndentationCharactersMatch[1];
        }
      }
    }
    replyIndentationCharacters += '*';

    this.inCode = {
      lineStartPos,
      startPos: bestMatchData.msgStartPos,
      endPos: bestMatchData.msgEndPos,
      code: msgCode,
      inSmallTag,
      indentationCharacters,
      replyIndentationCharacters,
      sig: bestMatchData.sigLastPart,
      timestamp,
    };
    if (bestMatchData.headingStartPos !== undefined) {
      this.inCode.headingStartPos = bestMatchData.headingStartPos;
      this.inCode.headingLevel = bestMatchData.headingLevel;
      this.inCode.headingCode = bestMatchData.headingCode;
    }

    return this.inCode;
  }

  reply() {
    if (!this.replyForm || this.replyForm.submitted) {
      this.replyForm = new MsgForm('reply', this);
      cd.msgForms.push(this.replyForm);
      this.replyForm.show(cd.settings.slideEffects ? 'slideDown' : 'fadeIn');
      this.replyForm.textarea.focus();
    } else {
      if (this.replyForm.$element.css('display') === 'none') {
        this.replyForm.show(cd.settings.slideEffects ? 'slideDown' : 'fadeIn');
        this.replyForm.textarea.focus();
      } else {
        this.prepareUnderlayersInViewport(true);
        this.replyForm.$previewArea.empty();
        this.replyForm.$element[cd.settings.slideEffects ? 'slideUp' : 'fadeOut']('fast', () => {
          this.replyForm.$element.addClass('cd-msgForm-hidden');
          this.updateUnderlayersInViewport(true);
        });
      }
    }
  }

  edit() {
    let formExists = this.editForm && !this.editForm.submitted;
    if (!formExists) {
      this.editForm = new MsgForm('edit', this);
      cd.msgForms.push(this.editForm);
    }
    this.$elements.hide();
    if (this.isOpeningSection) {
      this.section.$heading.hide();
    }
    this.removeUnderlayer();
    this.editForm.show('fadeIn');

    if (formExists) {
      this.editForm.textarea.focus();
    }
  }

  codeToText() {
    if (!this.inCode) {
      console.error('Первый параметр должен содержать объект с характеристиками кода сообщения.');
      return;
    }
    const { code, indentationCharacters } = this.inCode;
    if (code === undefined || indentationCharacters === undefined) {
      console.error('Отсутствует свойство code или indentationCharacters.');
      return;
    }

    let text = code.trim();

    const hidden = [];
    const hide = (re) => {
      text = text.replace(re, s => '\x01' + hidden.push(s) + '\x02');
    };
    const hideTags = function hideTags() {
      for (let i = 0; i < arguments.length; i++) {
        hide(
          new RegExp('<' + arguments[i] + '( [^>]+)?>[\\s\\S]+?<\\/' + arguments[i] + '>', 'gi')
        );
      }
    };
    // Simple function for hiding templates which have no nested ones.
    hide(/\{\{([^{]\{?)+?\}\}/g);
    // Hide tables
    hide(/^\{\|[^]*?\n\|\}/gm);
    hideTags('nowiki', 'pre', 'source', 'syntaxhighlight');

    text = text
      .replace(
        /^(?![:\*#]).*<br[ \n]?\/?>\n?/gmi,
        s => s.replace(/<br[ \n]?\/?>\n?/gmi, '\n')
      )
      .replace(/^([:\*#]*[:\*])([ \t]*)/gm, (s, m1, m2) => {
        if (m1.length >= indentationCharacters.length) {
          return m1.slice(indentationCharacters.length) +
            (m1.length > indentationCharacters.length ? m2 : '');
        } else {
          return m1 + m2;
        }
      });

    if (this.level === 0) {
      // Random line breaks that do not affect text rendering but will transform into <br> when
      // posting. We do it very discreetly, connecting only text consisting of alphabet characters
      // and punctuation, but we could act more like in case
      // ".replace(/^(.*[^\n])\n(?![\n:\*# ]|<\/\w+ ?>)/gm, (s, m1) => {" below.
      text = text.replace(
        /^(.*[A-Za-z0-9А-Яа-яЁё,\.;\?!:»"\)] *)\n(?=[A-Za-z0-9А-Яа-яЁё])/gm,
        (s, m1) => m1 +
            (!/^[:\*# ]/.test(m1) &&
                !/(?:\x02|<\w+(?: [\w ]+?=[^<>]+?| ?\/?)>|<\/\w+ ?>)$/.test(m1) ?
              ' ' :
              '\n'
            )
      );
    }

    while (text.match(/\x01\d+\x02/)) {
      text = text.replace(/\x01(\d+)\x02/g, (s, num) => hidden[num - 1]);
    }

    text = text.replace(/\{\{(?:pb|абзац)\}\}/g, '\n\n');

    return text;
  }

  loadCode() {
    return cd.env.loadPageCode(cd.env.CURRENT_PAGE)
      // This is returned to a handler with ".done", so the use of ".then" is deliberate.
      .then(
        (result) => {
          const inCode = this.locateInCode(result.code, result.queryTimestamp);
          if (!inCode) {
            return $.Deferred().reject(['parse', cd.strings.couldntLocateMsgInCode]).promise();
          }

          return $.Deferred().resolve(this.codeToText(), this.inCode.headingCode).promise();
        },
        e => $.Deferred().reject(e).promise()
      );
  }

  registerSeen(registerAllInDirection, highlight) {
    if (this.newness === 'newest' && !this.seen) {
      this.seen = true;
      cd.env.newestCount--;
      if (highlight) {
        this.highlightTarget();
      }
    }

    if (registerAllInDirection && cd.env.newestCount) {
      const nextMsg = cd.msgs[this.id + (registerAllInDirection === 'forward' ? 1 : -1)];
      if (nextMsg && nextMsg.isInViewport(true)) {
        nextMsg.registerSeen(registerAllInDirection, highlight);  // We have a recursive call here.
      }
    }
  }

  // Determination of the message visibility for the refresh panel operations
  isInViewport(updatePositions, partly) {
    const viewportTop = window.pageYOffset;
    const viewportBottom = viewportTop + window.innerHeight;

    if (updatePositions || !this.positions) {
      this.getPositions();
    }

    if (!partly) {
      return this.positions.top > viewportTop && this.positions.downplayedBottom < viewportBottom;
    } else {
      return this.positions.downplayedBottom > viewportTop && this.positions.top < viewportBottom;
    }
  }

  findHighlightedMsgsInViewportBelow(msgsBelowViewportCount) {
    msgsBelowViewportCount = msgsBelowViewportCount !== undefined ? msgsBelowViewportCount : 5;

    const highlightedMsgsInViewportBelow = [];
    let currentMsg;
    let thisMsgsBelowViewportCount = 0;
    for (let i = this.id + 1; i < cd.msgs.length; i++) {
      currentMsg = cd.msgs[i];
      if (!currentMsg) {
        console.error('Не найдено сообщение с ID ' + foundMsgId);
      }
      if (currentMsg.isInViewport(true, true)) {
        if (currentMsg.newness) {
          highlightedMsgsInViewportBelow.push(currentMsg);
        }
      } else {
        // Also get not more than 5 messages below the viewport.
        thisMsgsBelowViewportCount++;
        if (thisMsgsBelowViewportCount >= msgsBelowViewportCount) break;
        if (currentMsg.newness) {
          highlightedMsgsInViewportBelow.push(currentMsg);
        }
      }
    }
    return highlightedMsgsInViewportBelow;
  }

  prepareUnderlayersInViewport(hide, msgsBelowViewportCount) {
    cd.env.recalculateUnderlayersTimeout = true;

    this.#highlightedMsgsInViewportBelow = this.findHighlightedMsgsInViewportBelow(
      msgsBelowViewportCount
    );
    if (hide) {
      this.#$underlayersInViewportBelow = $($.map(
        this.#highlightedMsgsInViewportBelow,
        value => value.$underlayer && value.$underlayer[0]
      ));
      this.#$underlayersInViewportBelow.hide();
    }
  }

  updateUnderlayersInViewport(unhide) {
    for (let i = 0; i < this.#highlightedMsgsInViewportBelow.length; i++) {
      this.#highlightedMsgsInViewportBelow[i].configureUnderlayer();
    }
    if (unhide) {
      this.#$underlayersInViewportBelow.show();
    }

    cd.env.recalculateUnderlayersTimeout = false;
  }

  removeUnderlayer() {
    if (!this.#underlayer) return false;

    cd.env.underlayers.splice(cd.env.underlayers.indexOf(this.#underlayer), 1);

    this.#underlayer.parentElement.removeChild(this.#underlayer);
    this.#underlayer = null;
    this.$underlayer = null;

    this.#linksUnderlayer.parentElement.removeChild(this.#linksUnderlayer);
    this.#linksUnderlayer = null;
    this.$linksUnderlayer = null;

    return true;
  }

  // Using a getter allows to save a little time on running $().
  get $elements() {
    if (this.#cached$elements === undefined) {
      this.#cached$elements = $(this.elements);
    }
    return this.#cached$elements;
  }

  get text() {
    if (this.#cachedMsgText === undefined) {
      this.#cachedMsgText = this::getText();
    }
    return this.#cachedMsgText;
  }

  get parent() {
    if (this.#cachedParent === undefined) {
      this.#cachedParent = this::getParent();
    }
    return this.#cachedParent;
  }

  get section() {
    if (this.#cachedSection === undefined) {
      this.#cachedSection = this::getSection();
    }
    return this.#cachedSection;
  }

  get isAuthorRegistered() {
    if (this.#cachedIsAuthorRegistered === undefined) {
      this.#cachedIsAuthorRegistered = this::getAuthorRegistered();
    }
    return this.#cachedIsAuthorRegistered;
  }
}

function getFirstElementRect() {
  // Makes elements with "ruwiki-movedTemplate" class excluded from the highlight zone.
  for (let i = 0; i < this.elements.length; i++) {
    if (!this.elements[i].className.includes('ruwiki-movedTemplate')) {
      return this.elements[i].getBoundingClientRect();
    }
  }

  return this.elements[0].getBoundingClientRect();
}

function getParent() {
  // This would work only if messages in cd.msgs are in order of their presence on the page.

  let level = this.level;
  if (this.$elements[0].classList.contains('ruwiki-msgIndentation-minus1level')) {
    level -= 1;
  }

  if (cd.parse.pageHasOutdents) {
    let currentElement = this.elements[0];
    let outdented = false;
    while (currentElement && currentElement !== cd.env.contentElement) {
      if (currentElement.previousElementSibling) {
        currentElement = currentElement.previousElementSibling;
        if (currentElement.className.includes('outdent-template') ||
          (currentElement.querySelector('.outdent-template') &&
            !currentElement.querySelector('.cd-msgPart')
          )
        ) {
          outdented = true;
        }
        break;
      } else {
        currentElement = currentElement.parentElement;
      }
    }
    if (outdented && cd.msgs[this.id - 1]) {
      return cd.msgs[this.id - 1];
    }
  }

  if (level <= 0) {
    return null;
  }

  for (let i = this.id - 1; i >= 0; i--) {
    const currentMsg = cd.msgs[i];
    if (currentMsg.level !== undefined && currentMsg.level < level) {
      if (currentMsg.section === this.section) {
        return currentMsg;
      }
    }
  }

  return null;  // Not undefined, so that the variable would be considered filled.
}

function getSection() {
  if (!cd.sections) {
    return null;  // Not undefined, so that the variable would be considered filled.
  }

  for (let i = cd.sections.length - 1; i >= 0; i--) {
    const currentSection = cd.sections[i];
    if (currentSection.msgs.includes(this)) {
      return currentSection;
    }
  }

  return null;  // Not undefined, so that the variable would be considered filled.
}

function getAuthorRegistered() {
  return !/((^\s*((([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])\.){3}([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5]))\s*$)|(^\s*((([0-9A-Fa-f]{1,4}:){7}([0-9A-Fa-f]{1,4}|:))|(([0-9A-Fa-f]{1,4}:){6}(:[0-9A-Fa-f]{1,4}|((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3})|:))|(([0-9A-Fa-f]{1,4}:){5}(((:[0-9A-Fa-f]{1,4}){1,2})|:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3})|:))|(([0-9A-Fa-f]{1,4}:){4}(((:[0-9A-Fa-f]{1,4}){1,3})|((:[0-9A-Fa-f]{1,4})?:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(([0-9A-Fa-f]{1,4}:){3}(((:[0-9A-Fa-f]{1,4}){1,4})|((:[0-9A-Fa-f]{1,4}){0,2}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(([0-9A-Fa-f]{1,4}:){2}(((:[0-9A-Fa-f]{1,4}){1,5})|((:[0-9A-Fa-f]{1,4}){0,3}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(([0-9A-Fa-f]{1,4}:){1}(((:[0-9A-Fa-f]{1,4}){1,6})|((:[0-9A-Fa-f]{1,4}){0,4}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(:(((:[0-9A-Fa-f]{1,4}){1,7})|((:[0-9A-Fa-f]{1,4}){0,5}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:)))(%.+)?\s*$))/.test(this.author);
}

function getText() {
  // Get message text without a signature.
  const $msgWithNoSig = $();
  if (this.$elements.length > 1) {
    $msgWithNoSig = $msgWithNoSig.add(this.$elements.slice(0, -1));
  }
  const currentAuthorSelector = cd.env.generateAuthorSelector(this.author);
  const $parentOfDate = this.$elements
    .last()
    .find(currentAuthorSelector)
    .last()
    // Not "(UTC" to make scripts altering timezone not break.
    .closest(':contains("(UTC"), :contains("Эта реплика добавлена"), :contains("(обс.)")');

  // $parentOfDate might be empty if scripts altering date are used.
  if ($parentOfDate.length) {
    const lastElement = this.$elements.last()[0];
    if ($parentOfDate[0] !== lastElement &&
      !($parentOfDate[0].compareDocumentPosition(lastElement) & Node.DOCUMENT_POSITION_CONTAINED_BY)
    ) {
      let currentElement = $parentOfDate[0];
      while (true) {
        if (currentElement.previousSibling) {
          currentElement = currentElement.previousSibling;
        } else {
          while (currentElement &&
            currentElement !== lastElement &&
            !currentElement.previousSibling
          ) {
            currentElement = currentElement.parentElement;
          }
          if (!currentElement || currentElement === lastElement) break;

          currentElement = currentElement.previousSibling;
        }
        if (currentElement && currentElement !== lastElement) {
          $msgWithNoSig = $msgWithNoSig.add(currentElement);
        } else {
          break;
        }
      }
    }
    let foundAuthorNode = false;
    $msgWithNoSig = $msgWithNoSig.add(
      $parentOfDate
        .contents()
        .filter(function () {
          if (foundAuthorNode) {
            return false;
          }
          if ((this.nodeType === Node.ELEMENT_NODE) &&
            ($(this).is(currentAuthorSelector) || $(this).has(currentAuthorSelector).length)
          ) {
            foundAuthorNode = true;
            return false;
          } else {
            return true;
          }
        })
    );
  } else {
    // Actually, it will have a signature :(
    $msgWithNoSig = $msgWithNoSig.add(this.$elements.last());
  }

  return cd.env.elementsToText($msgWithNoSig.get())
    .replace(/Эта реплика добавлена (?:участником|с IP)$/, '')
    .replace(/Эта реплика добавлена (?:участником|с IP).{1,50}$/, '')
    .replace('(обс.)$', '')
    .replace(cd.config.SIG_PREFIX_REGEXP, '');
}
