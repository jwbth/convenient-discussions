export default {
  // Underlayer-related
  UNDERLAYER_FOCUSED_BGCOLOR: '#eaf3ff',
  UNDERLAYER_TARGET_BGCOLOR: '#fff1c7',
  UNDERLAYER_NEWEST_BGCOLOR: '#edffdb',
  UNDERLAYER_SIDE_MARGIN: 5,

  // Summary-related
  SUMMARY_LENGTH_LIMIT: mw.config.get('wgCommentCodePointLimit'),
  SUMMARY_FULL_MSG_TEXT_LENGTH_LIMIT: 50,
  HELP_LINK: cd.config.LOCAL_HELP_LINK ? 'U:JWBTH/CD' : 'w:ru:U:JWBTH/CD',

  // Unseen messages–related
  VISITS_OPTION_NAME: 'cd-visits',
  WATCHED_TOPICS_OPTION_NAME: 'cd-watchedTopics',
  HIGHLIGHT_NEW_INTERVAL: 15,

  // Config values
  NAMESPACE_NUMBER: mw.config.get('wgNamespaceNumber'),
  IS_DIFF_PAGE: mw.config.get('wgIsArticle') && /[?&]diff=[^&]/.test(location.search),
  CURRENT_PAGE: mw.config.get('wgPageName').replace(/_/g, ' '),
  CURRENT_USER: mw.config.get('wgUserName'),
  CURRENT_SKIN: mw.config.get('skin'),

  // Convenience constants
  SECONDS_IN_A_DAY: 60 * 60 * 24,
  MILLISECONDS_IN_A_MINUTE: 1000 * 60,

  firstRun: true,

  $content: $('#mw-content-text'),  // Set immediately – it is used below.

  underlayers: [],
  floatingRects: [],

  // Dynamic values
  mouseOverUpdatePanel: false,
  scrollHandleTimeout: false,
  recalculateUnderlayersTimeout: false,
  pageOverlaysOn: false,

  getTransparentColor(color) {
    const dummyElement = document.createElement('span');
    dummyElement.style.color = color;

    color = dummyElement.style.color;
    if (color.includes('rgba')) {
      color = color.replace(/\d+(?=\))/, '0');
    } else {
      color = color
        .replace(/rgb/, 'rgba')
        .replace(/\)/, ', 0)');
    }

    return color;
  },

  getMonthNumber(mesyats) {
    const month = cd.strings.monthNamesGenitive.indexOf(mesyats);
    if (month === -1) return;
    return month;
  },

  getTimestampFromDate(date, timezoneOffset) {
    const matches = date.match(/(\b\d?\d):(\d\d), (\d\d?) ([а-я]+) (\d\d\d\d)/);
    if (!matches) return;

    const hours = Number(matches[1]);
    const minutes = Number(matches[2]);
    const day = Number(matches[3]);
    const month = cd.env.getMonthNumber(matches[4]);
    const year = Number(matches[5]);

    if (month === undefined) return;

    return Date.UTC(year, month, day, hours, minutes) -
      (timezoneOffset ? timezoneOffset * cd.env.MILLISECONDS_IN_A_MINUTE : 0);
  },

  generateMsgAnchor(year, month, day, hours, minutes, author) {
    const zeroPad = (n, p) => ('0000' + n).slice(-p);

    if (year === undefined ||
      month === undefined ||
      day === undefined ||
      hours === undefined ||
      minutes === undefined
    ) {
      return;
    }

    return (
      zeroPad(year, 4) +
      zeroPad(month + 1, 2) +
      zeroPad(day, 2) +
      zeroPad(hours, 2) +
      zeroPad(minutes, 2) +
      (author ? '_' + author.replace(/ /g, '_') : '')
    );
  },

  generateCaseInsensitiveFirstCharPattern(s) {
    let pattern = '';

    const firstChar = s[0];
    if (mw.RegExp.escape(firstChar) === firstChar &&
      firstChar.toUpperCase() !== firstChar.toLowerCase()
    ) {
      pattern += '[' + firstChar.toUpperCase() + firstChar.toLowerCase() + ']';
    } else {
      pattern += firstChar;
    }

    pattern += mw.RegExp.escape(s.slice(1));

    return pattern;
  },

  // Talk pages and pages of "Project" ("Википедия"), "WikiProject" ("Проект") namespaces.
  isDiscussionNamespace(nsNumber) {
    return nsNumber % 2 === 1 || nsNumber === 4 || nsNumber === 104;
  },

  highlightFocused(e) {
    if (cd.env.scrollHandleTimeout || cd.env.pageOverlaysOn) return;

    const contentLeft = cd.env.contentElement.getBoundingClientRect().left;
    if (e.pageX < contentLeft - cd.env.UNDERLAYER_SIDE_MARGIN) {
      for (let i = 0; i < cd.env.underlayers.length; i++) {
        const underlayer = cd.env.underlayers[i];
        if (underlayer.classList.contains('cd-underlayer-focused')) {
          underlayer.cdTarget.unhighlightFocused();
        }
      }
      return;
    }

    for (let i = 0; i < cd.env.underlayers.length; i++) {
      const underlayer = cd.env.underlayers[i];
      if (!underlayer.classList.contains('cd-underlayer')) continue;

      const top = Number(underlayer.style.top.replace('px', ''));
      const left = Number(underlayer.style.left.replace('px', ''));
      const width = Number(underlayer.style.width.replace('px', ''));
      const height = Number(underlayer.style.height.replace('px', ''));

      if (!cd.env.mouseOverUpdatePanel &&
        e.pageY >= -cd.env.underlayersYCorrection + top &&
        e.pageY <= -cd.env.underlayersYCorrection + top + height &&
        e.pageX >= -cd.env.underlayersXCorrection + left &&
        e.pageX <= -cd.env.underlayersXCorrection + left + width
      ) {
        if (!underlayer.classList.contains('cd-underlayer-focused')) {
          underlayer.cdTarget.highlightFocused();
        }
      } else if (underlayer.classList.contains('cd-underlayer-focused')) {
        underlayer.cdTarget.unhighlightFocused();
      }
    }
  },

  updateUnderlayersCorrection() {
    if (cd.env.CURRENT_SKIN !== 'vector') {
      cd.env.underlayersXCorrection = -cd.env.underlayersContainer.offsetParent.offsetLeft;
      cd.env.underlayersYCorrection = -cd.env.underlayersContainer.offsetParent.offsetTop;
    } else {
      cd.env.underlayersYCorrection = cd.env.underlayersXCorrection = 0;
    }

    // A dirty hack because I was too lazy to find where this pixel comes from and why there's
    // no such in Vector. Maybe it's just a Chrome artifact.
    if (cd.env.CURRENT_SKIN === 'monobook' || cd.env.CURRENT_SKIN === 'timeless') {
      cd.env.underlayersYCorrection -= 1;
      cd.env.underlayersXCorrection -= 1;
    }
  },

  windowResizeHandler() {
    cd.env.updateUnderlayersCorrection();

    // To prevent horizontal scrollbar from appearing because of invisible layers.
    cd.env.recalculateUnderlayers(false);

    for (let i = 0; i < cd.msgForms.length; i++) {
      cd.msgForms[i].correctLabels();
    }
  },

  beforeUnloadHandler(e) {
    if (cd.getLastActiveAlteredMsgForm() ||
      (cd.env.alwaysConfirmLeavingPage &&
        cd.getLastActiveMsgForm()
      )
    ) {
      // Most browsers ignore this message, displaying a pre-defined one.
      const message = 'На странице есть неотправленные сообщения. Всё равно хотите уйти со страницы?';
      setTimeout(() => {
        const lastActiveAlteredMsgForm = cd.getLastActiveMsgForm();
        if (lastActiveAlteredMsgForm) {
          lastActiveAlteredMsgForm.textarea.focus();
        };
      }, 0);
      e.returnValue = message;
      return message;
    }
  },

  findMsgInViewport(findClosestDirection) {
    const viewportHeight = window.innerHeight;
    const viewportTop = window.pageYOffset;
    const viewportBottom = viewportTop + viewportHeight;

    let currentMsgId = 0;
    let prevMsgTop;
    let prevMsgBottom;
    let higherTop;
    let higherBottom;
    let lowerTop;
    let lowerBottom;
    let keepedMsgTop;
    let keepedMsgBottom;
    let prevMsgId;
    let foundMsgId;
    let keepedMsgId;

    // Search for any one message inside the viewport, intellectually narrowing the search region
    // (getting a proportion of the distance between far away messages and the viewport and
    // calculating the ID of the next message based on it; then, the position of this next message
    // is checked, and so on). cd.msgs.length value (could be not theoretically possible) is with
    // a large margin, ideally the cycle should finish after a couple of steps. It's more of
    // a protection against an endless cycle.
    for (let i = 0; i < cd.msgs.length; i++) {
      const msg = cd.msgs[currentMsgId];
      if (!msg) {
        console.error('Не найдено сообщение с ID ' + currentMsgId);
        return;
      }

      msg.getPositions();

      if (// First message below the bottom edge of the viewport.
        (currentMsgId === 0 && msg.positions.downplayedBottom > viewportBottom) ||
        // Last message above the top edge of the viewport.
        (currentMsgId === cd.msgs.length - 1 && msg.positions.top < viewportTop)
      ) {
        if (findClosestDirection === 'forward') {
          foundMsgId = 0;
        } else if (findClosestDirection === 'backward') {
          foundMsgId = cd.msgs.length - 1;
        }
        break;
      }

      if (msg.isInViewport(false)) {
        foundMsgId = currentMsgId;
        break;
      }

      let nextMsgId;
      if (prevMsgId !== undefined) {
        let changedDirection;
        if ((msg.positions.top < viewportTop && prevMsgTop < viewportTop) ||
          (msg.positions.downplayedBottom > viewportBottom && prevMsgBottom > viewportBottom)
        ) {
          if (keepedMsgId === undefined) {
            console.warn('keepedMsgId не определёна.');
          }
          prevMsgId = keepedMsgId;
          prevMsgTop = keepedMsgTop;
          prevMsgBottom = keepedMsgBottom;
          changedDirection = false;
        } else {
          changedDirection = true;
        }

        // There's not a single message in the viewport.
        if (Math.abs(currentMsgId - prevMsgId) === 1) {
          if (findClosestDirection === 'forward') {
            foundMsgId = Math.max(currentMsgId, prevMsgId);
          } else if (findClosestDirection === 'backward') {
            foundMsgId = Math.min(currentMsgId, prevMsgId);
          }
          break;
        }

        // Determine the ID of the next message.
        if (msg.positions.top > prevMsgTop) {
          higherTop = prevMsgTop;
          higherBottom = prevMsgBottom;
          lowerTop = msg.positions.top;
          lowerBottom = msg.positions.downplayedBottom;
        } else {
          higherTop = msg.positions.top;
          higherBottom = msg.positions.downplayedBottom;
          lowerTop = prevMsgTop;
          lowerBottom = prevMsgBottom;
        }
        const proportion = (viewportTop - higherTop) /
          ((lowerBottom - viewportBottom !== 0 ? lowerBottom - viewportBottom : 0.0001) +
            (viewportTop - higherTop)
          );
        if (proportion < 0 || proportion >= 1) {
          console.warn('Пропорция не должна быть меньше 0 или больше или равна 1.', proportion,
            currentMsgId, prevMsgId, viewportTop, viewportBottom);
        }
        nextMsgId = Math.round((Math.abs(currentMsgId - prevMsgId) - 1) * proportion +
          Math.min(prevMsgId, currentMsgId) + 0.5
        );
        if (changedDirection) {
          // If the convergence goes by a scheme: 1 – 10 – 5 – 3 (two times down), then the values
          // of prev... should be saved to use 1 and 5 for getting 3, not 5 and 10.
          keepedMsgId = prevMsgId;
          keepedMsgTop = prevMsgTop;
          keepedMsgBottom = prevMsgBottom;
        }
      } else {
        nextMsgId = cd.msgs.length - 1;
      }

      prevMsgId = currentMsgId;
      currentMsgId = nextMsgId;
      prevMsgTop = msg.positions.top;
      prevMsgBottom = msg.positions.downplayedBottom;
    }

    return cd.msgs[foundMsgId];
  },

  goToPrevNewMsg() {
    const foundMsg = cd.env.findMsgInViewport('forward');
    if (!foundMsg) return;

    for (let i = foundMsg.id; i >= 0; i--) {
      const msg = cd.msgs[i];
      if (!msg) {
        console.error('Не найдено сообщение с ID ' + foundMsg.id);
      }
      if (msg.newness) {
        if (!msg.isInViewport(true)) {
          msg.$elements.cdScrollTo('middle', cd.env.updateNextButton);
          return;
        }
      }
    }
    for (let i = cd.msgs.length - 1; i >= foundMsg.id; i--) {
      const msg = cd.msgs[i];
      if (!msg) {
        console.error('Не найдено сообщение с ID ' + foundMsg.id);
      }
      if (msg.newness) {
        if (!msg.isInViewport(true)) {
          msg.$elements.cdScrollTo('middle', cd.env.updateNextButton);
          return;
        }
      }
    }
  },

  goToNextNewMsg() {
    if (cd.env.newestCount) {
      for (let i = cd.env.lastNewestSeen || 0; i < cd.msgs.length; i++) {
        const msg = cd.msgs[i];
        if (msg.newness === 'newest' && !msg.seen) {
          msg.$elements.cdScrollTo('middle', () => {
            msg.registerSeen('forward', true);
            cd.env.updateNextButton();
          });
          cd.env.lastNewestSeen = i;
          break;
        }
      }
      if (cd.env.$prevButton.css('display') === 'none') {
        cd.env.$prevButton.show();
      }
    } else {
      const foundMsg = cd.env.findMsgInViewport('backward');
      if (!foundMsg) return;

      for (let i = foundMsg.id; i < cd.msgs.length; i++) {
        const msg = cd.msgs[i];
        if (!msg) {
          console.error('Не найдено сообщение с ID ' + foundMsg.id);
        }
        if (msg.newness) {
          if (!msg.isInViewport(true)) {
            msg.$elements.cdScrollTo('middle', cd.env.updateNextButton);
            return;
          }
        }
      }
      for (let i = 0; i < foundMsg.id; i++) {
        const msg = cd.msgs[i];
        if (!msg) {
          console.error('Не найдено сообщение с ID ' + foundMsg.id);
        }
        if (msg.newness) {
          if (!msg.isInViewport(true)) {
            msg.$elements.cdScrollTo('middle', cd.env.updateNextButton);
            return;
          }
        }
      }
    }
  },

  globalKeyDownHandler(e) {
    if (cd.env.pageOverlaysOn) return;

    if (// Ctrl+Alt+Q
      (e.ctrlKey && !e.shiftKey && e.altKey && e.keyCode === 81) ||
      // Q
      (!e.ctrlKey && !e.shiftKey && !e.altKey && e.keyCode === 81 &&
        !$(':focus:input').length &&
        (!$(':focus').length || !$(':focus')[0].isContentEditable)
      )
    ) {
      e.preventDefault();

      const msgForm = cd.env.lastActiveMsgForm;
      if (!msgForm) return;

      const selectionText = window.getSelection().toString();
      // With just "Q" hotkey, empty selection doesn't count.
      if (selectionText || (e.ctrlKey && !e.shiftKey && e.altKey)) {
        const quotePre = "> ''";
        const quotePost = "''\n";

        if (!msgForm.textarea.$input.is(':focus')) {
          const textarea = msgForm.textarea.$input[0];
          // We don't use the native insertContent() function here in order to prevent harm from replacing
          // the selected text, nor encapsulateContent() function to insert exactly at the cursor position,
          // which can be in the beginning or in the end of the selection depending on where it started.
          const cursorPos = textarea.selectionDirection === 'backward' ?
            textarea.selectionStart :
            textarea.selectionEnd;
          const value = textarea.value;
          const citationCode = quotePre + selectionText.trim() + quotePost;
          const newCursorPos = cursorPos + citationCode.length;
          const newValue = value.slice(0, cursorPos) + citationCode + value.slice(cursorPos);
          msgForm.textarea.setValue(newValue);
          msgForm.textarea.selectRange(newCursorPos);
        } else {
          msgForm.textarea.encapsulateContent(quotePre, quotePost);
          if (selectionText) {
            const cursorPos = msgForm.textarea.$input[0].selectionEnd;
            msgForm.textarea.selectRange(cursorPos + quotePost.length);
          }
        }
      }
    }

    // W
    if (!e.ctrlKey && !e.shiftKey && !e.altKey && e.keyCode === 87 &&
      !$(':focus:input').length &&
      (!$(':focus').length || !$(':focus')[0].isContentEditable) &&
      cd.env.$prevButton.css('display') !== 'none'
    ) {
      cd.env.goToPrevNewMsg();
    }

    // S
    if (!e.ctrlKey && !e.shiftKey && !e.altKey && e.keyCode === 83 &&
      !$(':focus:input').length &&
      (!$(':focus').length || !$(':focus')[0].isContentEditable)
    ) {
      cd.env.goToNextNewMsg();
    }
  },

  recalculateUnderlayers(newOnly = false) {
    // It is assumed that if we need to recount not only new (highlighted) underlayers, others need to be
    // removed ("removeNotNew" parameter was removed as redundant), otherwise there's no point to recalculate.

    if (!cd.env.underlayers.length) return;
    if (cd.env.recalculateUnderlayersTimeout || cd.env.scrollHandleTimeout) return;

    if (newOnly) {
      cd.env.recalculateUnderlayersTimeout = true;
    }

    // In order not to count for every element when bypassing.
    for (let i = 0; i < cd.env.floatingElements.length; i++) {
      cd.env.floatingRects[i] = cd.env.floatingElements[i].getBoundingClientRect();
    }

    // We declare variables here for recalculate() function to work.
    let msg;
    let positions;
    let i;
    let lastI = 0;
    const allKeys = [];

    const recalculate = (msg) => {
      if (!msg.newness && !newOnly && msg.$underlayer && msg.$underlayer.length) {
        msg.removeUnderlayer();
      } else if (msg.newness) {
        positions = msg.configureUnderlayer(true);

        if (positions) {
          allKeys.push(i);
        } else {
          lastI = i;
          return false;
        }
      }
      return true;
    };
    // Go from two sides: from the end and from the beginning, and stop at the first message
    // in which nothing has changed.
    for (i = cd.msgs.length - 1; i >= 0; i--) {
      msg = cd.msgs[i];
      if (!msg) {
        console.error('Не найдено сообщение с ID ' + foundMsgId);
      }

      if (!recalculate(msg)) break;
    }

    for (i = 0; i < lastI; i++) {
      msg = cd.msgs[i];
      if (!msg) {
        console.error('Не найдено сообщение с ID ' + foundMsgId);
      }

      if (!recalculate(msg)) break;
    }

    cd.env.floatingRects = [];

    if (allKeys.length) {
      for (let i = 0; i < allKeys.length; i++) {
        cd.msgs[allKeys[i]].updateUnderlayerPositions();
      }
    }
    if (newOnly) {
      cd.env.recalculateUnderlayersTimeout = false;
    }
  },

  updateNextButton() {
    if (cd.env.newestCount) {
      if (!cd.env.$nextButton.hasClass('cd-updatePanel-nextButton-digit')) {
        cd.env.$nextButton
          .addClass('cd-updatePanel-nextButton-digit')
          .attr('title', 'Перейти к первому сообщению, которое вы ещё не видели');

      }
      cd.env.$nextButton.text(cd.env.newestCount);
    } else if (cd.env.$nextButton.hasClass('cd-updatePanel-nextButton-digit')) {
      cd.env.$nextButton
        .removeClass('cd-updatePanel-nextButton-digit')
        .attr('title', 'Перейти к следующему новому сообщению');
      cd.env.$nextButton.text('');
      cd.env.$prevButton.show();
    }
  },

  setLoadingOverlay() {
    if (!cd.env.$loadingOverlay || !cd.env.$loadingOverlay.length) {
      cd.env.$loadingOverlay = $('<div>').addClass('cd-loadingOverlay');
      const $loadingPopup = $('<div>')
        .addClass('cd-loadingPopup')
        .appendTo(cd.env.$loadingOverlay);
      const $logo = $('<img>')
        .addClass('cd-loadingPopup-logo')
        .attr('src', 'data:image/png;base64,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')
        .appendTo($loadingPopup);

      $('body').append(cd.env.$loadingOverlay);
    } else {
      cd.env.$loadingOverlay.show();
    }

    cd.env.pageOverlaysOn = true;
  },

  removeLoadingOverlay() {
    if (cd.env.$loadingOverlay && cd.env.$loadingOverlay.length) {
      cd.env.$loadingOverlay.hide();

      cd.env.pageOverlaysOn = false;
    }
  },

  createWindowManager() {
    cd.env.windowManager = new OO.ui.WindowManager();
    cd.env.windowManager.on('opening', () => {
      cd.env.pageOverlaysOn = true;
    });
    cd.env.windowManager.on('closing', () => {
      cd.env.pageOverlaysOn = false;
    });
  },

  removeDuplicates(array) {
    if (typeof array !== 'object') return;
    return array.filter((value, index) => array.indexOf(value) === index);
  },

  toJquerySpan(html) {
    return $($.parseHTML(html))
      .wrapAll('<span>')
      .parent();
  },

  requestOptions() {
    cd.env.optionsRequest = new mw.Api().get({
      action: 'query',
      meta: 'userinfo',
      uiprop: 'options',
      formatversion: 2,
    })
      // This is returned to a handler with ".done", so the use of ".then" is deliberate.
      .then(
        (data) => {
          const options = data &&
            data.query &&
            data.query.userinfo &&
            data.query.userinfo.options;
          if (!options) {
            return $.Deferred().reject(['api', 'no data']).promise();
          }

          const visitsCompressed = options['userjs-' + cd.env.VISITS_OPTION_NAME];
          const visitsString = visitsCompressed ?
            lzString.decompressFromEncodedURIComponent(visitsCompressed) :
            '';
          const visits = unpackVisits(visitsString);

          const watchedTopicsCompressed = options['userjs-' + cd.env.WATCHED_TOPICS_OPTION_NAME];
          const watchedTopicsString = watchedTopicsCompressed ?
            lzString.decompressFromEncodedURIComponent(watchedTopicsCompressed) :
            '';
          const watchedTopics = unpackWatchedTopics(watchedTopicsString);

          return { visits, watchedTopics };
        },
        (jqXHR, textStatus, errorThrown) =>
          $.Deferred().reject(['network', [jqXHR, textStatus, errorThrown]]).promise()
      );
  },

  getVisits() {
    if (cd.env.optionsRequest) {
      return cd.env.optionsRequest.then(options => options.visits);
    } else if (mw.user.options.get('userjs-' + cd.env.VISITS_OPTION_NAME) !== null) {
      const visits = unpackVisits(
        lzString.decompressFromEncodedURIComponent(mw.user.options.get('userjs-' + cd.env.VISITS_OPTION_NAME))
      );

      return $.Deferred().resolve(visits).promise();
    } else {
      return $.Deferred().resolve(
        localStorage[cd.env.VISITS_OPTION_NAME] ? JSON.parse(localStorage[cd.env.VISITS_OPTION_NAME]) : {}
      ).promise();
    }
  },

  setVisits(visits) {
    const visitsString = packVisits(visits);
    const visitsStringCompressed = lzString.compressToEncodedURIComponent(visitsString);
    if (visitsStringCompressed.length > 65535) {
      return $.Deferred().reject(['internal', 'sizelimit']);
    }

    return new mw.Api().postWithToken('csrf', {
      action: 'options',
      optionname: 'userjs-' + cd.env.VISITS_OPTION_NAME,
      optionvalue: visitsStringCompressed,
    })
      // This is returned to a handler with ".done", so the use of ".then" is deliberate.
      .then(
        (data) => {
          if (!data || data.options !== 'success') {
            return $.Deferred().reject(['api', 'no success']).promise();
          }
        },
        (jqXHR, textStatus, errorThrown) =>
          $.Deferred().reject(['network', [jqXHR, textStatus, errorThrown]]).promise()
      );
  },

  getWatchedTopics() {
    if (cd.env.optionsRequest) {
      return cd.env.optionsRequest.then(options => options.watchedTopics);
    } else if (mw.user.options.get('userjs-' + cd.env.WATCHED_TOPICS_OPTION_NAME) !== null) {
      const watchedTopics = unpackWatchedTopics(lzString.decompressFromEncodedURIComponent(
        mw.user.options.get('userjs-' + cd.env.WATCHED_TOPICS_OPTION_NAME)
      ));

      return $.Deferred().resolve(watchedTopics).promise();
    } else {
      return $.Deferred().resolve({}).promise();
    }
  },

  setWatchedTopics(watchedTopics) {
    const watchedTopicsString = packWatchedTopics(watchedTopics);
    const watchedTopicsStringCompressed = (
      lzString.compressToEncodedURIComponent(watchedTopicsString)
    );
    if (watchedTopicsStringCompressed.length > 65535) {
      return $.Deferred().reject(['internal', 'sizelimit']);
    }

    return new mw.Api().postWithToken('csrf', {
      action: 'options',
      optionname: 'userjs-' + cd.env.WATCHED_TOPICS_OPTION_NAME,
      optionvalue: watchedTopicsStringCompressed,
    })
      // This is returned to a handler with ".done", so the use of ".then" is deliberate.
      .then(
        (data) => {
          if (!data || data.options !== 'success') {
            return $.Deferred().reject(['api', 'no success']).promise();
          }
        },
        (jqXHR, textStatus, errorThrown) =>
          $.Deferred().reject(['network', [jqXHR, textStatus, errorThrown]]).promise()
      );
  },

  async editWatchedTopics() {
    cd.env.requestOptions();
    await mw.loader.using([
      'mediawiki.api',
      'mediawiki.notify',
      'oojs',
      'oojs-ui',
      'user.options',
    ]);
    const watchedTopics = await cd.env.getWatchedTopics();
    let pageIds;
    let pageTitles;
    let pageIdToTitle;
    let pagesIdAndTitle;
    let pageTitleToId;
    let topics;

    const queryPageProperties = async function queryPageProperties(property, pageidOrTitleSet) {
      const queryOptions = {
        action: 'query',
        formatversion: 2,
      };

      let doneCallback;
      if (property === 'titles') {
        $.extend(queryOptions, {
          pageids: pageidOrTitleSet,
        });
        doneCallback = (query) => {
          const pages = query.pages;

          for (let i = 0; i < pages.length; i++) {
            pagesIdAndTitle.push([pages[i].pageid, pages[i].title]);
            pageIdToTitle[pages[i].pageid] = pages[i].title;
          }

          const nextPageIds = pageIds.splice(0, 50).join('|');
          if (nextPageIds.length) {
            // Query next titles.
            queryPageProperties('titles', nextPageIds);
          } else {
            // Finally fill the input.
            pagesIdAndTitle.sort((a, b) => a[1] > b[1]? 1 : -1);

            const sortedWatchedTopics = [];
            for (let i = 0; i < pagesIdAndTitle.length; i++) {
              sortedWatchedTopics.push(
                [pagesIdAndTitle[i][0], watchedTopics[pagesIdAndTitle[i][0]]]
              );
            }

            let topicList = '';
            for (let i = 0; i < sortedWatchedTopics.length; i++) {
              for (let j = 0; j < sortedWatchedTopics[i][1].length; j++) {
                topicList += pageIdToTitle[sortedWatchedTopics[i][0]] + '#' +
                  sortedWatchedTopics[i][1][j] + '\n';
              }
            }

            editWatchedTopicsDialog.textarea.setValue(topicList.trim());
            editWatchedTopicsDialog.popPending();
          }
        };
      } else if (property === 'pageids') {
        $.extend(queryOptions, {
          titles: pageidOrTitleSet,
          redirects: true,
        });
        doneCallback = async function (query) {
          const normalized = query.normalized || [];
          const redirects = query.redirects || [];
          const pages = query.pages;

          // Correct to normalized titles, add to the collection.
          for (let i = 0; i < normalized.length; i++) {
            if (topics[normalized[i].from]) {
              topics[normalized[i].to] = topics[normalized[i].from];
              delete topics[normalized[i].from];
            }
          }

          // Correct to redirect targets, add to the collection.
          for (let i = 0; i < redirects.length; i++) {
            if (topics[redirects[i].from]) {
              if (topics[redirects[i].to]) {
                topics[redirects[i].to] = topics[redirects[i].to]
                  .concat(topics[redirects[i].from]);
              } else {
                topics[redirects[i].to] = topics[redirects[i].from];
              }
              delete topics[redirects[i].from];
            }
          }

          for (let i = 0; i < pages.length; i++) {
            if (pages[i].pageid) {
              pageTitleToId[pages[i].title] = pages[i].pageid;
            }
          }

          const nextTitles = pageTitles.splice(0, 50).join('|');
          if (nextTitles.length) {
            // Query next id's.
            queryPageProperties('pageids', nextTitles);
          } else {
            // Finally set watched topics.
            const newWatchedTopics = {};
            for (let key in topics) {
              if (pageTitleToId[key]) {
                newWatchedTopics[pageTitleToId[key]] = cd.env.removeDuplicates(topics[key]);
              }
            }

            try {
              await setWatchedTopics(newWatchedTopics);
              editWatchedTopicsDialog.popPending();
              editWatchedTopicsDialog.close();
            } catch (e) {
              const [errorType, data] = e;
              if (errorType === 'internal' && data === 'sizelimit') {
                editWatchedTopicsDialog.showErrors(new OO.ui.Error(
                  'Не удалось обновить настройки: размер списка отслеживаемых тем превышает максимально допустимый. Уменьшите размер списка, чтобы это исправить.',
                  true
                ));
              } else {
                editWatchedTopicsDialog.showErrors(new OO.ui.Error(
                  `Возникли проблемы при обработке списка тем: ${errorType}/${data}`,
                  true
                ));
              }
              console.log(errorType, data);
              editWatchedTopicsDialog.popPending();
            }
          }
        };
      }

      try {
        const data = await new mw.Api().post(queryOptions);

        const error = data.error &&
          data.error.code &&
          data.error.info &&
          data.error.code + ': ' + data.error.info;
        if (error) {
          return $.Deferred().reject(['api', error]).promise();
        }

        if (!data || !data.query || !data.query.pages) {
          return $.Deferred().reject(['api', 'no data']).promise();
        }

        doneCallback(data.query);
      } catch (e) {
        const [errorType, data] = e;
        editWatchedTopicsDialog.showErrors(new OO.ui.Error(
          `Возникли проблемы при обработке списка тем: ${errorType}/${data}`,
          true
        ));
        console.log(errorType, data);
        editWatchedTopicsDialog.popPending();
      }
    };

    function EditWatchedTopicsDialog() {
      EditWatchedTopicsDialog.parent.call(this);
    }
    OO.inheritClass(EditWatchedTopicsDialog, OO.ui.ProcessDialog);

    EditWatchedTopicsDialog.static.name = 'editWatchedTopicsDialog';
    EditWatchedTopicsDialog.static.title = 'Править список тем';
    EditWatchedTopicsDialog.static.actions = [
      {
        action: 'save',
        label: 'Сохранить',
        flags: ['primary', 'progressive'],
      },
      {
        label: 'Отмена',
        flags: 'safe',
      }
    ];

    EditWatchedTopicsDialog.prototype.initialize = function () {
      EditWatchedTopicsDialog.parent.prototype.initialize.apply(this, arguments);

      this.pushPending();

      this.textarea = new OO.ui.MultilineTextInputWidget({
        value: '',
        rows: 30,
      });

      this.$body.append(this.textarea.$element);

      pageIds = Object.keys(watchedTopics);
      pageIdToTitle = {};
      pagesIdAndTitle = [];

      let nextPageIds = pageIds.splice(0, 50).join('|');
      if (nextPageIds !== '') {
        queryPageProperties('titles', nextPageIds);
      } else {
        this.popPending();
      }
    };

    EditWatchedTopicsDialog.prototype.getActionProcess = function (action) {
      const dialog = this;

      const abort = (text, recoverable) => {
        dialog.showErrors(new OO.ui.Error(text, recoverable));
      };

      if (action === 'save') {
        return new OO.ui.Process(function () {
          dialog.pushPending();

          const rawTopics = dialog.textarea.getValue().split('\n');
          topics = {};
          pageTitles = [];
          for (let i = 0; i < rawTopics.length; i++) {
            const matches = rawTopics[i].split('#');
            if (!matches[0] || !matches[1]) {
              continue;
            } else {
              matches[0] = matches[0].trim();
              matches[1] = matches[1].trim();
              if (!topics[matches[0]]) {
                topics[matches[0]] = [];
                pageTitles.push(matches[0]);
              }
              topics[matches[0]].push(matches[1]);
            }
          }

          pageTitleToId = {};

          let nextTitles = pageTitles.splice(0, 50).join('|');
          if (nextTitles !== '') {
            queryPageProperties('pageids', nextTitles);
          } else {
            dialog.popPending();
          }
        });
      }
      return EditWatchedTopicsDialog.parent.prototype.getActionProcess.call(dialog, action);
    };

    let editWatchedTopicsDialog = new EditWatchedTopicsDialog();

    if (!cd.env.windowManager) {
      cd.env.createWindowManager();
    }
    $('body').append(cd.env.windowManager.$element);
    cd.env.windowManager.addWindows([editWatchedTopicsDialog]);

    let editWatchedTopicsWindow = cd.env.windowManager.openWindow(editWatchedTopicsDialog);
    editWatchedTopicsWindow.opened.then(() => {
      editWatchedTopicsDialog.textarea.focus();
    });
  },

  getLastGlobalCapture(s, regexp) {
    let matches;
    let lastCapture;
    while (matches = regexp.exec(s)) {
      lastCapture = matches[1];
    }
    return lastCapture;
  },

  findPrevMsg(code) {
    // We use .* in front of cd.env.SIG_PATTERN to search for the last signature in the code.
    const regexp = new RegExp(`^[^]*(?:^|\\n)(.*${cd.env.SIG_PATTERN}.*\\n)`);
    let match = code.match(regexp);
    while (match &&
      cd.env.MSG_ANTIPATTERN_REGEXP &&
      cd.env.MSG_ANTIPATTERN_REGEXP.test(match[0])
    ) {
      code = code.replace(/(?:^|\n).*$/, '');
      match = code.match(regexp);
    }
    return match;
  },

  findFirstMsg(code) {
    code += '\n';
    // We use .* in front of cd.env.SIG_PATTERN to search for the last signature in the code.
    // Note ^[^]*? to search for the _first_ message.
    const regexp = new RegExp(`^[^]*?(?:^|\\n)(.*${cd.env.SIG_PATTERN}.*\\n)`);
    let match = code.match(regexp);
    let initialPos = 0;
    if (cd.env.MSG_ANTIPATTERN_REGEXP) {
      let antipatternMatch;
      while (antipatternMatch = match && match[0].match(cd.env.MSG_ANTIPATTERN_REGEXP)) {
        const increase = antipatternMatch.index + antipatternMatch[0].length;
        code = code.substr(increase);
        initialPos += increase;
        match = code.match(regexp);
      }
    }
    return [match, initialPos];
  },

  collectAuthorAndDate(match) {
    const text = match[1];
    let authorDate = [];
    let nextMatchNumber = 2;
    for (let i = 0; i < cd.config.SIG_PATTERNS.length; i++) {
      const captureNames = cd.config.SIG_PATTERNS[i][1];
      for (let j = 0; j < captureNames.length; j++, nextMatchNumber++) {
        if (match[nextMatchNumber]) {
          authorDate[captureNames[j]] = match[nextMatchNumber];
        }
      }

      if (!captureNames.includes('author')) {
        for (let j = 0; j < cd.env.USER_NAME_REGEXPS.length; j++) {
          authorDate['author'] = cd.env.getLastGlobalCapture(text, cd.env.USER_NAME_REGEXPS[j]);
          if (authorDate['author']) break;
        }
      }
    }

    if (authorDate['date'] && !authorDate['date'].includes('(UTC)')) {
      authorDate['date'] += ' (UTC)';
    }

    if (authorDate['author']) {
      authorDate['author'] = (authorDate['author'][0].toUpperCase() + authorDate['author'].slice(1)).replace(/[ _]+/g, ' ');
    }

    return [authorDate['author'], authorDate['date']];
  },

  findFirstDate(code) {
    let [firstMsgMatch] = cd.env.findFirstMsg(code);

    if (firstMsgMatch) {
      if (firstMsgMatch[2]) {
        return firstMsgMatch[2];
      } else if (firstMsgMatch[3]) {
        return firstMsgMatch[4] || firstMsgMatch[3];
      } else if (firstMsgMatch[5]) {
        return firstMsgMatch[5];
      }
    }
  },

  isInline(el) {
    if (POPULAR_INLINE_ELEMENTS.includes(el.tagName)) {
      return true;
    } else if (POPULAR_NOT_INLINE_ELEMENTS.includes(el.tagName)) {
      return false;
    } else {
      // This is VERY resource-greedy. Avoid by any means.
      return window.getComputedStyle(el).display === 'inline';
    }
  },

  getLastMatch(s, regexp) {
    if (!regexp.global) {
      console.error('Функция работает только с регулярными выражениями с флагом global.');
      return;
    }
    let matches;
    let lastMatch;
    while (matches = regexp.exec(s)) {
      lastMatch = matches;
    }
    return lastMatch;
  },

  encodeWikiMarkup(text) {
    return text
      .replace('<', '&lt;')
      .replace('>', '&gt;')
      .replace('[', '&#91;')
      .replace(']', '&#93;')
      .replace('{', '&#123;')
      .replace('|', '&#124;')
      .replace('}', '&#125;')
      .replace(' ', ' ');  // Non-breaking space
  },

  cleanSectionHeading(heading) {
    return heading
      // Extract displayed text from wikilinks
      .replace(/\[\[:?(?:[^|]*\|)?([^\]]*)\]\]/g, '$1')
      // Remove bold
      .replace(/'''(.+?)'''/g, '$1')
      // Remove italics
      .replace(/''(.+?)''/g, '$1')
      // Remove opening tags (won't work with <smth param=">">, but wikiparser fails too)
      .replace(/<\w+(?: [\w ]+?=[^<>]+?| ?\/?)>/g, '')
      // Remove closing tags
      .replace(/<\/\w+ ?>/g, '')
      // Remove multiple spaces
      .replace(/ {2,}/g, ' ')
      .trim();
  },

  formSummary(text) {
    return text + cd.env.SUMMARY_POSTFIX;
  },

  createTextWithIcon(html, iconName) {
    const icon = new OO.ui.IconWidget({
      icon: iconName,
    });
    const iconLabel = new OO.ui.LabelWidget({
      label: html instanceof jQuery ? html : new OO.ui.HtmlSnippet(html),
    });

    return $('<div>').append(icon.$element, iconLabel.$element);
  },

  calculateWordsOverlap(s1, s2) {
    // Compare Latin & Cyrillic words starting with 3 characters.
    const words1 = cd.env.removeDuplicates(s1.match(/[A-Za-zА-Яа-яЁё]{3,}/g));
    const words2 = cd.env.removeDuplicates(s2.match(/[A-Za-zА-Яа-яЁё]{3,}/g));
    if (!words1 || !words2) return;

    let total = words2.length;
    let overlap = 0;
    let isOverlap;
    words1.forEach((word1) => {
      isOverlap = false;
      words2.forEach((word2) => {
        if (word2 === word1) {
          isOverlap = true;
          return;
        }
      });
      if (isOverlap) {
        overlap++;
      } else {
        total++;
      }
    });

    return total > 0 ? overlap / total : 0;
  },

  generateAuthorAndDateRegExp(author, date) {
    // These HTML entities are collected via a query like
    // "insource:/\[\[[УуUu](ser|частни)?:[^|\]]*\&/ prefix:ВП:" on Russian and English Wikipedias
    // (cases are collected from the results by ".*&.{10}", junk is removed by "^[^;]*$"
    // (lines without ;) and ";.+$" (text after ;), unique lines are kept.
    const popularHTMLEntities = {
      '"': ['&#34;', '&quot;'],
      '&': ['&#38;', '&amp;'],
      '\'': '&#39;',
      '*': '&#42;',
      ';': '&#59;',
      '=': '&#61;',
      '>': '&#62;',
      ']': '&#93;',
      '|': '&#124;',
      ' ': '&nbsp;',
      '–': '&ndash;',
      '—': '&mdash;',
    };

    let authorPattern = cd.env.generateCaseInsensitiveFirstCharPattern(author)
      .replace(/ /g, '[ _]');
    let entitiesPattern;
    for (let key in popularHTMLEntities) {
      if (author.includes(key)) {
        if (typeof popularHTMLEntities[key] === 'string') {
          entitiesPattern = popularHTMLEntities[key];
        } else {
          entitiesPattern = popularHTMLEntities[key].join('|');
        }
        authorPattern = authorPattern.replace(
          mw.RegExp.escape(key),
          `(?:${mw.RegExp.escape(key)}|${entitiesPattern})`
        );
      }
    }

    if (date !== null) {
      const dateInUnsignedTemplatesPattern = mw.RegExp.escape(date)
        .replace(/ \\\(UTC\\\)$/, '(?: \\(UTC\\))?');
      return new RegExp(
        // Caution: invisible character in [ ‎]. [  \t]* in the end needed to remove messages
        // properly.
        cd.config.USER_NAME_PATTERN + authorPattern + '[|\\]#].*' + mw.RegExp.escape(date) +
          '[  \t]*(?:\}\}|</small>)?[  \t]*|' +
        '\\{\\{ *(?:[uU]nsigned(?:IP)?2|[нН]еподписано|[нН]пп) *\\| *' +
          dateInUnsignedTemplatesPattern + '[ ‎]*\\|[ ‎]*' + authorPattern + ' *\\}\\}[  \t]*|' +
        '\\{\\{ *(?:[uU]nsigned(?:IP)?|[нН]е подписано) *\\|[ ‎]*' + authorPattern +
          ' *(?:\\| *[^}]+[ ‎]*)?\\}\\}[  \t]*',
        'g'
      );
    } else {
      // Caution: invisible character in [ ‎].
      return new RegExp(
        '\\{\\{ *(?:[uU]nsigned(?:IP)?|[нН]е подписано) *\\|[ ‎]*' + authorPattern +
          ' *(?:\\| *[^}]+[ ‎]*)?\\}\\}[  \t]*|' +
        '\\{\\{ *(?:[uU]nsigned(?:IP)?2|[нН]еподписано|[нН]пп) *\\| *[^|]*' +
          '[ ‎]*\\|[ ‎]*' + authorPattern + ' *\\}\\}[  \t]*',
        'g'
      );
    }
  },

  generateAuthorSelector(author) {
    const authorEncoded = $.escapeSelector(encodeURIComponent(author.replace(/ /g, '_')));
    return (
      `a[href^="/wiki/%D0%A3%D1%87%D0%B0%D1%81%D1%82%D0%BD%D0%B8%D0%BA:${authorEncoded}"]` +
        `:not(a[href^="/wiki/%D0%A3%D1%87%D0%B0%D1%81%D1%82%D0%BD%D0%B8%D0%BA:${authorEncoded}/"]), ` +
      `a[href^="/wiki/%D0%A3%D1%87%D0%B0%D1%81%D1%82%D0%BD%D0%B8%D1%86%D0%B0:${authorEncoded}"]` +
        `:not(a[href^="/wiki/%D0%A3%D1%87%D0%B0%D1%81%D1%82%D0%BD%D0%B8%D1%86%D0%B0:${authorEncoded}/"]), ` +
      `a[href^="/wiki/%D0%9E%D0%B1%D1%81%D1%83%D0%B6%D0%B4%D0%B5%D0%BD%D0%B8%D0%B5_%D1%83%D1%87%D0%B0%D1%81%D1%82%D0%BD%D0%B8%D0%BA%D0%B0:' + authorEncoded +'"]` +
        `:not(a[href^="/wiki/%D0%9E%D0%B1%D1%81%D1%83%D0%B6%D0%B4%D0%B5%D0%BD%D0%B8%D0%B5_%D1%83%D1%87%D0%B0%D1%81%D1%82%D0%BD%D0%B8%D0%BA%D0%B0:${authorEncoded}/"]), ` +
      `a[href^="/wiki/%D0%9E%D0%B1%D1%81%D1%83%D0%B6%D0%B4%D0%B5%D0%BD%D0%B8%D0%B5_%D1%83%D1%87%D0%B0%D1%81%D1%82%D0%BD%D0%B8%D1%86%D1%8B:${authorEncoded}"]` +
        `:not(a[href^="/wiki/%D0%9E%D0%B1%D1%81%D1%83%D0%B6%D0%B4%D0%B5%D0%BD%D0%B8%D0%B5_%D1%83%D1%87%D0%B0%D1%81%D1%82%D0%BD%D0%B8%D1%86%D1%8B:${authorEncoded}/"]), ` +
      `a[href^="/wiki/%D0%A1%D0%BB%D1%83%D0%B6%D0%B5%D0%B1%D0%BD%D0%B0%D1%8F:%D0%92%D0%BA%D0%BB%D0%B0%D0%B4/${authorEncoded}"]` +
        `:not(a[href^="/wiki/%D0%A1%D0%BB%D1%83%D0%B6%D0%B5%D0%B1%D0%BD%D0%B0%D1%8F:%D0%92%D0%BA%D0%BB%D0%B0%D0%B4/${authorEncoded}/"]), ` +
      `a[href^="/w/index.php?title=%D0%A3%D1%87%D0%B0%D1%81%D1%82%D0%BD%D0%B8%D0%BA:${authorEncoded}"]` +
        `:not(a[href^="/w/index.php?title=%D0%A3%D1%87%D0%B0%D1%81%D1%82%D0%BD%D0%B8%D0%BA:${authorEncoded}/"]), ` +
      `a[href^="/w/index.php?title=%D0%A3%D1%87%D0%B0%D1%81%D1%82%D0%BD%D0%B8%D1%86%D0%B0:${authorEncoded}"]`
        + `:not(a[href^="/w/index.php?title=%D0%A3%D1%87%D0%B0%D1%81%D1%82%D0%BD%D0%B8%D1%86%D0%B0:${authorEncoded}/"]), ` +
      `a[href*="/wiki/User:${authorEncoded}"]` +
        `:not(a[href*="/wiki/User:${authorEncoded}/"])`
    );
  },

  elementsToText(elements, classesToFilter = []) {
    return elements
      .map((el, index) => {
        if (el.nodeType === Node.ELEMENT_NODE) {
          for (let i = 0; i < el.classList.length; i++) {
            if (classesToFilter.includes(el.classList[i])) return '';
          }
        }

        let value = el.textContent;
        if (elements[index].nodeType === Node.ELEMENT_NODE &&
          (!cd.env.isInline(elements[index]) &&
            elements[index].tagName === 'BR'
          ) ||
          (elements[index - 1] &&
            elements[index - 1].nodeType === Node.ELEMENT_NODE &&
            !cd.env.isInline(elements[index - 1])
          )
        ) {
          value = ' ' + value;
        }

        return value;
      })
      .join('')
      .trim();
  },

  updatePageContent(html, anchor) {
    cd.env.underlayersContainer.innerHTML = '';
    cd.env.linksUnderlayersContainer.innerHTML = '';
    cd.env.underlayers = [];

    debug.endTimer('получение HTML');

    debug.startTimer('заливка HTML');

    cd.env.$content.html(html);
    mw.hook('wikipage.content').fire(cd.env.$content);
    parse(anchor);
  },

  reloadPage(anchor) {
    debug.initTimers();

    debug.startTimer('общее время');

    debug.startTimer('получение HTML');

    cd.env.requestOptions();

    if (cd.settings.showLoadingOverlay !== false) {
      cd.env.setLoadingOverlay();
    }

    return cd.env.parseCurrentPage().done(html => cd.env.updatePageContent(html, anchor));
  },

  parseCurrentPage() {
    const request = new mw.Api().get({
      action: 'parse',
      page: cd.env.CURRENT_PAGE,
      prop: 'text',
      formatversion: 2,
    })
      // This is returned to a handler with ".done", so the use of ".then" is deliberate.
      .then(
        (data) => {
          const error = data.error &&
            data.error.code &&
            data.error.info &&
            data.error.code + ': ' + data.error.info;
          if (error) {
            return $.Deferred().reject(['api', error]).promise();
          }

          const text = data &&
            data.parse &&
            data.parse.text;
          if (!text) {
            return $.Deferred().reject(['api', 'no data']).promise();
          }

          return text;
        },
        (jqXHR, textStatus, errorThrown) =>
          $.Deferred().reject(['network', [jqXHR, textStatus, errorThrown]]).promise()
      );

    // To make the page marked as read in the watchlist.
    $.get(mw.util.getUrl(cd.env.CURRENT_PAGE));

    return request;
  },

  loadPageCode(title) {
    if (title instanceof mw.Title) {
      title = title.toString();
    }
    const queryTimestamp = $.now();

    return new mw.Api().get({
      action: 'query',
      titles: title,
      prop: 'revisions',
      rvprop: 'content|timestamp',
      redirects: true,
      formatversion: 2,
    })
      .then(
        (data) => {
          const error = data.error &&
            data.error.code &&
            data.error.info &&
            data.error.code + ': ' + data.error.info;
          if (error) {
            return $.Deferred().reject(['api', error]).promise();
          }

          const query = data.query;
          if (!query) {
            return $.Deferred().reject(['api', 'no data']).promise();
          }

          const page = query &&
            query.pages &&
            query.pages[0];
          const revision = page &&
            page.revisions &&
            page.revisions[0];

          if (page.missing) {
            return $.Deferred().reject(['api', 'missing']).promise();
          }

          if (page.invalid) {
            return $.Deferred().reject(['api', 'invalid']).promise();
          }

          const code = revision && revision.content;
          const timestamp = revision && revision.timestamp;
          const redirectTarget = query &&
            query.redirects &&
            query.redirects[0] &&
            query.redirects[0].to;

          return { code, timestamp, redirectTarget, queryTimestamp };
        },
        (jqXHR, textStatus, errorThrown) =>
          $.Deferred().reject(['network', [jqXHR, textStatus, errorThrown]]).promise()
      );
  },

  registerSeenMsgs() {
    // Don't run the handler of an event more than once in 100ms, otherwise the scrolling may be
    // slowed down.
    if (!cd.env.newestCount || cd.env.scrollHandleTimeout) return;

    cd.env.scrollHandleTimeout = true;
    // 100 seems to a reasonable value.
    setTimeout(() => {
      cd.env.scrollHandleTimeout = false;

      const foundMsg = cd.env.findMsgInViewport();
      if (!foundMsg) return;
      const foundMsgId = foundMsg.id;

      // Back
      for (let i = foundMsgId - 1; i >= 0; i--) {
        const msg = cd.msgs[i];
        if (!msg) {
          console.error('Не найдено сообщение с ID ' + foundMsgId);
        }
        if (msg.isInViewport(true)) {
          msg.registerSeen();
        } else {
          break;
        }
      }
      // Forward
      for (let i = foundMsgId; i < cd.msgs.length; i++) {
        const msg = cd.msgs[i];
        if (!msg) {
          console.error('Не найдено сообщение с ID ' + foundMsgId);
        }
        if (msg.isInViewport(true)) {
          msg.registerSeen();
        } else {
          break;
        }
      }

      cd.env.updateNextButton();
    }, 100);
  },

  genericErrorHandler(options) {
    if (options.errorType === 'parse') {
      this.abort(options.data, null, options.retryFunc);
    } else if (options.errorType === 'api') {
      let text;
      if (options.data === 'missing') {
        text = 'Текущая страница была удалена.';
      } else {
        text = `Ошибка API: ${options.data}.`;
      }
      this.abort(options.message + '. ' + text, options.data, options.retryFunc);
    } else if (options.errorType === 'network') {
      this.abort(options.message + ' (сетевая ошибка).', options.data, options.retryFunc);
    } else {
      this.abort(options.message + ' (неизвестная ошибка).', options.data, options.retryFunc);
    }
  },

  Exception(message) {
    this.name = 'Exception';
    this.message = message;
    this.stack = (new Error()).stack;
  },
}