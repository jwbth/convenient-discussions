export default function msgLinks() {
  function addMsgLinks($content) {
    // Occurs in the watchlist when mediawiki.rcfilters.filters.ui module for some reason fires
    // wikipage.content for the second time with an element that is not in the DOM,
    // fieldset#mw-watchlist-options (in  mw.rcfilters.ui.FormWrapperWidget.prototype.onChangesModelUpdate
    // function).
    if (!$content.parent().length) return;

    if (mw.config.get('wgCanonicalSpecialPageName') === 'Watchlist') {
      let lines = $content[0].querySelectorAll('.mw-changeslist-line:not(.mw-collapsible)');
      let blueIconsPresent = false;
      for (let i = 0; i < lines.length; i++) {
        let line = lines[i];

        let nsMatches = line.className.match(/mw-changeslist-ns(\d+)/);
        let nsNumber = nsMatches && Number(nsMatches[1]);
        if (nsNumber === undefined || !cd.env.isDiscussionNamespace(nsNumber)) {
          continue;
        }

        let minorMark = line.querySelector('.minoredit');
        if (minorMark) continue;

        let botMark = line.querySelector('.botedit');
        let comment = line.querySelector('.comment');
        let commentText = comment && comment.textContent;
        // Cut BotDR; other bots can write meaningful messages.
        if (commentText &&
          (botMark && commentText.includes('Archiving') ||
            commentText.includes('редактирование ответа') ||
            commentText.includes('отмена правки') ||
            commentText.includes(': перенесено')
          )
        ) {
          continue;
        }

        let isNested = line.tagName === 'TR';

        let bytesAddedElement = line.querySelector('.mw-plusminus-pos');
        if (!bytesAddedElement) {
          continue;
        }
        if (bytesAddedElement.tagName !== 'STRONG') {
          let bytesAddedMatches = bytesAddedElement.textContent.match(/\d+/);
          let bytesAdded = bytesAddedMatches && Number(bytesAddedMatches[0]);
          if (!bytesAdded || bytesAdded < 50) {
            continue;
          }
        }

        let date = line.getAttribute('data-mw-ts');
        date = date && date.slice(0, 12);
        if (!date) {
          continue;
        }

        let author = line.querySelector('.mw-userlink');
        author = author && author.textContent;
        if (!author || author === 'MediaWiki message delivery') {
          continue;
        }

        let anchor = date + '_' + author.replace(/ /g, '_');

        let linkElement = (!isNested ? line : line.parentElement).querySelector('.mw-changeslist-title');
        let pageName = linkElement.textContent;
        if ((nsNumber === 4 || nsNumber === 104) && !cd.config.DISCUSSION_PAGE_REGEXP.test(pageName)) {
          continue;
        }
        let link = linkElement && linkElement.href;
        if (!link) {
          continue;
        }

        let wrapper;
        if (commentText && CURRENT_USER_REGEXP.test(' ' + commentText + ' ')) {
          wrapper = $wrapperBluePrototype[0].cloneNode(true);
          wrapper.lastChild.title = 'Ссылка на сообщение (сообщение адресовано вам)';
          blueIconsPresent = true;
        } else {
          let isWatched = false;
          if (commentText) {
            let curLink = line.querySelector('.mw-changeslist-diff-cur');
            let curIdMatches = curLink &&
              curLink.href &&
              curLink.href.match(/[&?]curid=(\d+)/);
            let curId = curIdMatches && Number(curIdMatches[1]);
            if (curId) {
              thisPageWatchedTopics = watchedTopics && watchedTopics[curId] || [];
              if (thisPageWatchedTopics.length) {
                for (let j = 0; j < thisPageWatchedTopics.length; j++) {
                  // Caution: invisible character after →.
                  if (commentText.includes('→‎' + thisPageWatchedTopics[j])) {
                    isWatched = true;
                    break;
                  }
                }
                if (isWatched) {
                  wrapper = $wrapperBluePrototype[0].cloneNode(true);
                  wrapper.lastChild.title = 'Ссылка на сообщение (вы следите за этой темой)';
                  blueIconsPresent = true;
                }
              }
            }
          }
          if (!isWatched) {
            wrapper = $wrapperBlackPrototype[0].cloneNode(true);
          }
        }

        wrapper.lastChild.href = link + '#' + anchor;

        let destination = line.querySelector('.mw-usertoollinks');
        if (!destination) {
          continue;
        }
        destination.parentElement.insertBefore(wrapper, destination.nextSibling);
      }

      if (blueIconsPresent) {
        let isEnhanced = !$('.mw-changeslist').find('ul.special').length;
        let interestingOnly = false;
        if (!$content.find('.mw-rcfilters-ui-changesLimitAndDateButtonWidget .cd-switchInterestingLink')
          .length
        ) {
          let $wlinfo = $content.find('.wlinfo');
          let $switchInteresting = $('<a>').addClass('cd-switchInterestingLink');
          $switchInteresting
            .attr('title', 'Показать только сообщения в темах, за которыми я слежу, и адресованные мне')
            .click(function () {
              // This is for many watchlist types at once.
              let $collapsibles = $content
                .find('.mw-changeslist .mw-collapsible:not(.mw-changeslist-legend)');
              let $lines = $content.find('.mw-changeslist-line:not(.mw-collapsible)');
              if (!interestingOnly) {
                $collapsibles
                  .not('.mw-collapsed')
                  .find('.mw-enhancedchanges-arrow')
                  .click();
                $collapsibles
                  .has('.cd-rcMsgLink-interesting')
                  .find('.mw-enhancedchanges-arrow')
                  .click()
                $collapsibles
                  .not(':has(.cd-rcMsgLink-interesting)')
                  .find('.mw-rcfilters-ui-highlights-enhanced-toplevel')
                  .hide();
                $lines
                  .not(':has(.cd-rcMsgLink-interesting)')
                  .hide();

              } else {
                if (!isEnhanced) {
                  $lines
                    .not(':has(.cd-rcMsgLink-interesting)')
                    .show();
                }
                $collapsibles
                  .not(':has(.cd-rcMsgLink-interesting)')
                  .find('.mw-rcfilters-ui-highlights-enhanced-toplevel')
                  .show();
                $collapsibles
                  .not('.mw-collapsed')
                  .find('.mw-enhancedchanges-arrow')
                  .click();
              }
              interestingOnly = !interestingOnly;
            });

          //$wlinfo.append(switchInteresting);
          $content.find('.mw-rcfilters-ui-changesLimitAndDateButtonWidget').prepend($switchInteresting);
        }
      }
    }

    if (mw.config.get('wgCanonicalSpecialPageName') === 'Contributions') {
      let timezone = mw.user.options.get('timecorrection');
      let timezoneParts = timezone && timezone.split('|');
      let timezoneOffset = timezoneParts && Number(timezoneParts[1]);
      if (timezoneOffset == null || isNaN(timezoneOffset)) return;

      let list = $content[0].querySelector('.mw-contributions-list');
      let lines = list.children;

      for (let i = 0; i < lines.length; i++) {
        let line = lines[i];

        let linkElement = line.querySelector('.mw-contributions-title');
        let pageName = linkElement.textContent;
        if (!(pageName.startsWith('Обсуждение ') && pageName.includes(':') ||
          (pageName.startsWith('Википедия:') || pageName.startsWith('Проект:')) &&
          cd.config.DISCUSSION_PAGE_REGEXP.test(pageName)
        )) {
          continue;
        }
        let link = linkElement && linkElement.href;
        if (!link) continue;

        let minorMark = line.querySelector('.minoredit');
        if (minorMark) continue;

        let comment = line.querySelector('.comment');
        let commentText = comment && comment.textContent;
        // Cut BotDR; other bots can write meaningful messages.
        if (commentText &&
          (commentText.includes('Archiving') ||
            commentText.includes('редактирование ответа') ||
            commentText.includes('отмена правки') ||
            commentText.includes(': перенесено')
          )
        ) {
          continue;
        }

        let bytesAddedElement = line.querySelector('.mw-plusminus-pos');
        if (!bytesAddedElement) continue;
        if (bytesAddedElement.tagName !== 'STRONG') {
          let bytesAddedMatches = bytesAddedElement.textContent.match(/\d+/);
          let bytesAdded = bytesAddedMatches && Number(bytesAddedMatches[0]);
          if (!bytesAdded || bytesAdded < 50) continue;
        }

        let dateElement = line.querySelector('.mw-changeslist-date');
        if (!dateElement) continue;
        let timestamp = cd.env.getTimestampFromDate(dateElement.textContent, timezoneOffset);
        if (!timestamp) continue;

        let dateObj = new Date(timestamp);
        let year = dateObj.getUTCFullYear();
        let month = dateObj.getUTCMonth();
        let day = dateObj.getUTCDate();
        let hour = dateObj.getUTCHours();
        let minute = dateObj.getUTCMinutes();

        let anchor = cd.env.generateMsgAnchor(year, month, day, hour, minute,
          mw.config.get('wgRelevantUserName'));

        let wrapper;
        if (commentText && CURRENT_USER_REGEXP.test(' ' + commentText + ' ')) {
          wrapper = $wrapperBluePrototype[0].cloneNode(true);
          wrapper.lastChild.title = 'Ссылка на сообщение (сообщение адресовано вам)';
        } else {
          let isWatched = false;
          if (commentText) {
            let curLink = line.querySelector('.mw-changeslist-diff-cur');
            let curIdMatches = curLink &&
              curLink.href &&
              curLink.href.match(/[&?]curid=(\d+)/);
            let curId = curIdMatches && Number(curIdMatches[1]);
            if (curId) {
              let thisPageWatchedTopics = watchedTopics && watchedTopics[curId] || [];
              if (thisPageWatchedTopics.length) {
                for (let j = 0; j < thisPageWatchedTopics.length; j++) {
                  // Caution: invisible character after →.
                  if (commentText.includes('→‎' + thisPageWatchedTopics[j])) {
                    isWatched = true;
                    break;
                  }
                }
                if (isWatched) {
                  wrapper = $wrapperBluePrototype[0].cloneNode(true);
                  wrapper.lastChild.title = 'Ссылка на сообщение (вы следите за этой темой)';
                }
              }
            }
          }
          if (!isWatched) {
            wrapper = $wrapperBlackPrototype[0].cloneNode(true);
          }
        }

        wrapper.lastChild.href = link + '#' + anchor;

        if (linkElement.nextSibling) {
          linkElement.nextSibling.textContent =
            linkElement.nextSibling.textContent.replace(/^\s/, '');
        }
        linkElement.parentElement.insertBefore(wrapper, linkElement.nextSibling);
      }
    }

    if (mw.config.get('wgAction') === 'history') {
      let timezone = mw.user.options.get('timecorrection');
      let timezoneParts = timezone && timezone.split('|');
      let timezoneOffset = timezoneParts && Number(timezoneParts[1]);
      if (timezoneOffset == null || isNaN(timezoneOffset)) return;

      let list = $content[0].querySelector('#pagehistory');
      let lines = list.children;
      let link = mw.util.getUrl(cd.env.CURRENT_PAGE);

      let ARTICLE_ID = mw.config.get('wgArticleId');

      for (let i = 0; i < lines.length; i++) {
        let line = lines[i];

        let minorMark = line.querySelector('.minoredit');
        if (minorMark) continue;

        let comment = line.querySelector('.comment');
        let commentText = comment && comment.textContent;
        // Cut BotDR; other bots can write meaningful messages.
        if (commentText &&
          (commentText.includes('Archiving') ||
            commentText.includes('редактирование ответа') ||
            commentText.includes('отмена правки') ||
            commentText.includes(': перенесено')
          )
        ) {
          continue;
        }

        let bytesAddedElement = line.querySelector('.mw-plusminus-pos');
        if (!bytesAddedElement) continue;
        if (bytesAddedElement.tagName !== 'STRONG') {
          let bytesAddedMatches = bytesAddedElement.textContent.match(/\d+/);
          let bytesAdded = bytesAddedMatches && Number(bytesAddedMatches[0]);
          if (!bytesAdded || bytesAdded < 50) continue;
        }

        let dateElement = line.querySelector('.mw-changeslist-date');
        if (!dateElement) continue;
        let timestamp = cd.env.getTimestampFromDate(dateElement.textContent, timezoneOffset);
        if (!timestamp) continue;

        let dateObj = new Date(timestamp);
        let year = dateObj.getUTCFullYear();
        let month = dateObj.getUTCMonth();
        let day = dateObj.getUTCDate();
        let hour = dateObj.getUTCHours();
        let minute = dateObj.getUTCMinutes();

        let author = line.querySelector('.mw-userlink');
        author = author && author.textContent;
        if (!author || author === 'MediaWiki message delivery') continue;

        let anchor = cd.env.generateMsgAnchor(year, month, day, hour, minute, author);

        let wrapper;
        if (commentText && CURRENT_USER_REGEXP.test(' ' + commentText + ' ')) {
          wrapper = $wrapperBluePrototype[0].cloneNode(true);
          wrapper.lastChild.title = 'Ссылка на сообщение (сообщение адресовано вам)';
        } else {
          let isWatched = false;
          if (commentText) {
            let thisPageWatchedTopics = watchedTopics && watchedTopics[ARTICLE_ID] || [];
            if (thisPageWatchedTopics.length) {
              for (let j = 0; j < thisPageWatchedTopics.length; j++) {
                // Caution: invisible character after →.
                if (commentText.includes('→‎' + thisPageWatchedTopics[j])) {
                  isWatched = true;
                  break;
                }
              }
              if (isWatched) {
                wrapper = $wrapperBluePrototype[0].cloneNode(true);
                wrapper.lastChild.title = 'Ссылка на сообщение (вы следите за этой темой)';
              }
            }
          }
          if (!isWatched) {
            wrapper = $wrapperBlackPrototype[0].cloneNode(true);
          }
        }

        wrapper.lastChild.href = link + '#' + anchor;

        let separators = line.querySelectorAll('.mw-changeslist-separator');
        let destination = separators && separators[separators.length - 1];
        if (!destination) continue;
        destination.parentElement.insertBefore(wrapper, destination.nextSibling);
      }
    }

    mw.hook('cd.msgLinksCreated').fire(cd);
  }

  let $aBlackPrototype = $('<a>').addClass('cd-rcMsgLink cd-rcMsgLink-regular');
  let $aBluePrototype = $('<a>').addClass('cd-rcMsgLink cd-rcMsgLink-interesting');

  let $wrapperBlackPrototype = $('<span>')
    .addClass('cd-rcMsgLink-wrapper')
    .append($aBlackPrototype)
    [cd.env.IS_DIFF_PAGE ? 'append' : 'prepend'](document.createTextNode(' '));
  let $wrapperBluePrototype = $('<span>')
    .addClass('cd-rcMsgLink-wrapper')
    .append($aBluePrototype)
    [cd.env.IS_DIFF_PAGE ? 'append' : 'prepend'](document.createTextNode(' '));

  let CURRENT_USER_REGEXP = new RegExp(
    '[^A-ZА-ЯЁa-zа-яё]' +
    cd.env.generateCaseInsensitiveFirstCharPattern(cd.env.CURRENT_USER).replace(/ /g, '[ _]') +
    '[^A-ZА-ЯЁa-zа-яё]'
  );

  let watchedTopics;

  cd.env.getWatchedTopics().always(function (gotWatchedTopics) {
    watchedTopics = gotWatchedTopics;

    // Hook on wikipage.content to make the code work with the watchlist auto-update feature.
    mw.hook('wikipage.content').add(addMsgLinks);

    if (mw.config.get('wgIsArticle') && /[?&]diff=[^&]/.test(location.search)) {
      mw.hook('cd.pageReady').add(function () {
        let timezone = mw.user.options.get('timecorrection');
        let timezoneParts = timezone && timezone.split('|');
        let timezoneOffset = timezoneParts && Number(timezoneParts[1]);
        if (timezoneOffset == null || isNaN(timezoneOffset)) return;

        let area = document.querySelector('.diff-ntitle');
        if (!area) return;

        let minorMark = area.querySelector('.minoredit');
        if (minorMark) return;

        let comment = area.querySelector('.comment');
        let commentText = comment && comment.textContent;
        // Cut BotDR; other bots can write meaningful messages.
        if (commentText &&
          (commentText.includes('Archiving') ||
            commentText.includes('редактирование ответа') ||
            commentText.includes('отмена правки') ||
            commentText.includes(': перенесено')
          )
        ) {
          return;
        }

        let dateElement = area.querySelector('#mw-diff-ntitle1 a');
        if (!dateElement) return;
        let timestamp = cd.env.getTimestampFromDate(dateElement.textContent, timezoneOffset);
        if (!timestamp) return;

        let dateObj = new Date(timestamp);
        let year = dateObj.getUTCFullYear();
        let month = dateObj.getUTCMonth();
        let day = dateObj.getUTCDate();
        let hour = dateObj.getUTCHours();
        let minute = dateObj.getUTCMinutes();

        let author = area.querySelector('.mw-userlink');
        author = author && author.textContent;
        if (!author || author === 'MediaWiki message delivery') return;

        let anchor = cd.env.generateMsgAnchor(year, month, day, hour, minute, author);

        let wrapper;
        if (commentText && CURRENT_USER_REGEXP.test(' ' + commentText + ' ')) {
          wrapper = $wrapperBluePrototype[0].cloneNode(true);
          wrapper.lastChild.title = 'Ссылка на сообщение (сообщение адресовано вам)';
        } else {
          let isWatched = false;
          if (commentText) {
            let curId = mw.config.get('wgArticleId');
            thisPageWatchedTopics = watchedTopics && watchedTopics[curId] || [];
            if (thisPageWatchedTopics.length) {
              for (let j = 0; j < thisPageWatchedTopics.length; j++) {
                // Caution: invisible character after →.
                if (commentText.includes('→‎' + thisPageWatchedTopics[j])) {
                  isWatched = true;
                  break;
                }
              }
              if (isWatched) {
                wrapper = $wrapperBluePrototype[0].cloneNode(true);
                wrapper.lastChild.title = 'Ссылка на сообщение (вы следите за этой темой)';
              }
            }
          }
          if (!isWatched) {
            wrapper = $wrapperBlackPrototype[0].cloneNode(true);
          }
        }

        wrapper.firstChild.href = '#' + anchor;
        wrapper.onclick = function (e) {
          e.preventDefault();
          let msg = cd.getMsgByAnchor(anchor);
          if (msg) {
            msg.scrollToAndHighlightTarget();
            history.replaceState({}, '', '#' + anchor);
          }
        };

        let destination = area.querySelector('#mw-diff-ntitle3');
        if (!destination) return;
        destination.insertBefore(wrapper, destination.firstChild);

        mw.hook('cd.msgLinksCreated').fire(cd);
      });
    }
  });
}