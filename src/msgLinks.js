export default async function msgLinks() {
  function addMsgLinks($content) {
    // Occurs in the watchlist when mediawiki.rcfilters.filters.ui module for some reason fires
    // wikipage.content for the second time with an element that is not in the DOM,
    // fieldset#mw-watchlist-options
    // (in mw.rcfilters.ui.FormWrapperWidget.prototype.onChangesModelUpdate() function).
    if (!$content.parent().length) return;

    if (mw.config.get('wgCanonicalSpecialPageName') === 'Watchlist') {
      const lines = $content[0].querySelectorAll('.mw-changeslist-line:not(.mw-collapsible)');
      let blueIconsPresent = false;
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        const nsMatches = line.className.match(/mw-changeslist-ns(\d+)/);
        const nsNumber = nsMatches && Number(nsMatches[1]);
        if (nsNumber === undefined) continue;

        const linkElement = (!isNested ? line : line.parentElement)
          .querySelector('.mw-changeslist-title');
        const pageName = linkElement.textContent;
        if (!isDiscussionPage(pageName, nsNumber)) continue;

        const minorMark = line.querySelector('.minoredit');
        if (minorMark) continue;

        const botMark = line.querySelector('.botedit');
        const comment = line.querySelector('.comment');
        const commentText = comment && comment.textContent;
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

        const isNested = line.tagName === 'TR';

        const bytesAddedElement = line.querySelector('.mw-plusminus-pos');
        if (!bytesAddedElement) {
          continue;
        }
        if (bytesAddedElement.tagName !== 'STRONG') {
          const bytesAddedMatches = bytesAddedElement.textContent.match(/\d+/);
          const bytesAdded = bytesAddedMatches && Number(bytesAddedMatches[0]);
          if (!bytesAdded || bytesAdded < 50) {
            continue;
          }
        }

        let date = line.getAttribute('data-mw-ts');
        date = date && date.slice(0, 12);
        if (!date) continue;

        let author = line.querySelector('.mw-userlink');
        author = author && author.textContent;
        if (!author || author === 'MediaWiki message delivery') continue;

        const anchor = date + '_' + author.replace(/ /g, '_');

        const link = linkElement && linkElement.href;
        if (!link) continue;

        let wrapper;
        if (commentText && currentUserRegexp.test(' ' + commentText + ' ')) {
          wrapper = $wrapperInterestingPrototype[0].cloneNode(true);
          wrapper.lastChild.title = 'Ссылка на сообщение (сообщение адресовано вам)';
          blueIconsPresent = true;
        } else {
          let isWatched = false;
          if (commentText) {
            const curLink = line.querySelector('.mw-changeslist-diff-cur');
            const curIdMatches = curLink &&
              curLink.href &&
              curLink.href.match(/[&?]curid=(\d+)/);
            const curId = curIdMatches && Number(curIdMatches[1]);
            if (curId) {
              const thisPageWatchedTopics = watchedTopics && watchedTopics[curId] || [];
              if (thisPageWatchedTopics.length) {
                for (let j = 0; j < thisPageWatchedTopics.length; j++) {
                  // Caution: invisible character after →.
                  if (commentText.includes('→‎' + thisPageWatchedTopics[j])) {
                    isWatched = true;
                    break;
                  }
                }
                if (isWatched) {
                  wrapper = $wrapperInterestingPrototype[0].cloneNode(true);
                  wrapper.lastChild.title = 'Ссылка на сообщение (вы следите за этой темой)';
                  blueIconsPresent = true;
                }
              }
            }
          }
          if (!isWatched) {
            wrapper = $wrapperRegularPrototype[0].cloneNode(true);
          }
        }

        wrapper.lastChild.href = link + '#' + anchor;

        const destination = line.querySelector('.mw-usertoollinks');
        if (!destination) {
          continue;
        }
        destination.parentElement.insertBefore(wrapper, destination.nextSibling);
      }

      if (blueIconsPresent) {
        const isEnhanced = !$('.mw-changeslist').find('ul.special').length;
        let interestingOnly = false;
        if (!$content.find('.mw-rcfilters-ui-changesLimitAndDateButtonWidget .cd-switchInterestingLink')
          .length
        ) {
          const $wlinfo = $content.find('.wlinfo');
          const $switchInteresting = $('<a>').addClass('cd-switchInterestingLink');
          $switchInteresting
            .attr('title', 'Показать только сообщения в темах, за которыми я слежу, и адресованные мне')
            .click(function () {
              // This is for many watchlist types at once.
              const $collapsibles = $content
                .find('.mw-changeslist .mw-collapsible:not(.mw-changeslist-legend)');
              const $lines = $content.find('.mw-changeslist-line:not(.mw-collapsible)');
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
      const timezone = mw.user.options.get('timecorrection');
      const timezoneParts = timezone && timezone.split('|');
      const timezoneOffset = timezoneParts && Number(timezoneParts[1]);
      if (timezoneOffset == null || isNaN(timezoneOffset)) return;

      const list = $content[0].querySelector('.mw-contributions-list');
      const lines = list.children;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        const linkElement = line.querySelector('.mw-contributions-title');
        const pageName = linkElement.textContent;
        if (!(pageName.startsWith('Обсуждение ') && pageName.includes(':') ||
          (pageName.startsWith('Википедия:') || pageName.startsWith('Проект:')) &&
          cd.config.discussionPageRegexp.test(pageName)
        )) {
          continue;
        }
        const link = linkElement && linkElement.href;
        if (!link) continue;

        const minorMark = line.querySelector('.minoredit');
        if (minorMark) continue;

        const comment = line.querySelector('.comment');
        const commentText = comment && comment.textContent;
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

        const bytesAddedElement = line.querySelector('.mw-plusminus-pos');
        if (!bytesAddedElement) continue;
        if (bytesAddedElement.tagName !== 'STRONG') {
          const bytesAddedMatches = bytesAddedElement.textContent.match(/\d+/);
          const bytesAdded = bytesAddedMatches && Number(bytesAddedMatches[0]);
          if (!bytesAdded || bytesAdded < 50) continue;
        }

        const dateElement = line.querySelector('.mw-changeslist-date');
        if (!dateElement) continue;
        const timestamp = cd.env.getTimestampFromDate(dateElement.textContent, timezoneOffset);
        if (!timestamp) continue;

        const dateObj = new Date(timestamp);
        const year = dateObj.getUTCFullYear();
        const month = dateObj.getUTCMonth();
        const day = dateObj.getUTCDate();
        const hour = dateObj.getUTCHours();
        const minute = dateObj.getUTCMinutes();

        const anchor = cd.env.generateMsgAnchor(year, month, day, hour, minute,
          mw.config.get('wgRelevantUserName'));

        let wrapper;
        if (commentText && currentUserRegexp.test(' ' + commentText + ' ')) {
          wrapper = $wrapperInterestingPrototype[0].cloneNode(true);
          wrapper.lastChild.title = 'Ссылка на сообщение (сообщение адресовано вам)';
        } else {
          // We have no place to extract article ID from :-(
          wrapper = $wrapperRegularPrototype[0].cloneNode(true);
        }

        wrapper.lastChild.href = link + '#' + anchor;

        if (linkElement.nextSibling) {
          linkElement.nextSibling.textContent =
            linkElement.nextSibling.textContent.replace(/^\s/, '');
        }
        linkElement.parentElement.insertBefore(wrapper, linkElement.nextSibling);
      }
    }

    if (mw.config.get('wgAction') === 'history' &&
      isDiscussionPage(cd.env.CURRENT_PAGE, cd.env.NAMESPACE_NUMBER)
    ) {
      const timezone = mw.user.options.get('timecorrection');
      const timezoneParts = timezone && timezone.split('|');
      const timezoneOffset = timezoneParts && Number(timezoneParts[1]);
      if (timezoneOffset == null || isNaN(timezoneOffset)) return;

      const list = $content[0].querySelector('#pagehistory');
      const lines = list.children;
      const link = mw.util.getUrl(cd.env.CURRENT_PAGE);

      const ARTICLE_ID = mw.config.get('wgArticleId');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        const minorMark = line.querySelector('.minoredit');
        if (minorMark) continue;

        const comment = line.querySelector('.comment');
        const commentText = comment && comment.textContent;
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

        const bytesAddedElement = line.querySelector('.mw-plusminus-pos');
        if (!bytesAddedElement) continue;
        if (bytesAddedElement.tagName !== 'STRONG') {
          const bytesAddedMatches = bytesAddedElement.textContent.match(/\d+/);
          const bytesAdded = bytesAddedMatches && Number(bytesAddedMatches[0]);
          if (!bytesAdded || bytesAdded < 50) continue;
        }

        const dateElement = line.querySelector('.mw-changeslist-date');
        if (!dateElement) continue;
        const timestamp = cd.env.getTimestampFromDate(dateElement.textContent, timezoneOffset);
        if (!timestamp) continue;

        const dateObj = new Date(timestamp);
        const year = dateObj.getUTCFullYear();
        const month = dateObj.getUTCMonth();
        const day = dateObj.getUTCDate();
        const hour = dateObj.getUTCHours();
        const minute = dateObj.getUTCMinutes();

        let author = line.querySelector('.mw-userlink');
        author = author && author.textContent;
        if (!author || author === 'MediaWiki message delivery') continue;

        const anchor = cd.env.generateMsgAnchor(year, month, day, hour, minute, author);

        let wrapper;
        if (commentText && currentUserRegexp.test(' ' + commentText + ' ')) {
          wrapper = $wrapperInterestingPrototype[0].cloneNode(true);
          wrapper.lastChild.title = 'Ссылка на сообщение (сообщение адресовано вам)';
        } else {
          let isWatched = false;
          if (commentText) {
            const thisPageWatchedTopics = watchedTopics && watchedTopics[ARTICLE_ID] || [];
            if (thisPageWatchedTopics.length) {
              for (let j = 0; j < thisPageWatchedTopics.length; j++) {
                // Caution: invisible character after →.
                if (commentText.includes('→‎' + thisPageWatchedTopics[j])) {
                  isWatched = true;
                  break;
                }
              }
              if (isWatched) {
                wrapper = $wrapperInterestingPrototype[0].cloneNode(true);
                wrapper.lastChild.title = 'Ссылка на сообщение (вы следите за этой темой)';
              }
            }
          }
          if (!isWatched) {
            wrapper = $wrapperRegularPrototype[0].cloneNode(true);
          }
        }

        wrapper.lastChild.href = link + '#' + anchor;

        const separators = line.querySelectorAll('.mw-changeslist-separator');
        const destination = separators && separators[separators.length - 1];
        if (!destination) continue;
        destination.parentElement.insertBefore(wrapper, destination.nextSibling);
      }
    }

    mw.hook('cd.msgLinksCreated').fire(cd);
  }

  // Quite a rough check for mobile browsers, a mix of what is advised at
  // https://stackoverflow.com/a/24600597 (sends to
  // https://developer.mozilla.org/en-US/docs/Browser_detection_using_the_user_agent)
  // and https://stackoverflow.com/a/14301832
  const isMobile = /Mobi|Android/i.test(navigator.userAgent) ||
    typeof window.orientation !== 'undefined';

  const $aRegularPrototype = $('<a>').addClass('cd-rcMsgLink cd-rcMsgLink-regular');
  const $aInterestingPrototype = $('<a>').addClass('cd-rcMsgLink cd-rcMsgLink-interesting');
  const $wrapperRegularPrototype = $('<span>')
    .addClass('cd-rcMsgLink-wrapper')
    .append($aRegularPrototype)
    [cd.env.IS_DIFF_PAGE ? 'append' : 'prepend'](document.createTextNode(' '));
  const $wrapperInterestingPrototype = $('<span>')
    .addClass('cd-rcMsgLink-wrapper')
    .append($aInterestingPrototype)
    [cd.env.IS_DIFF_PAGE ? 'append' : 'prepend'](document.createTextNode(' '));

  if (!isMobile) {
    $aRegularPrototype.addClass('cd-rcMsgLink-image');
    $aInterestingPrototype.addClass('cd-rcMsgLink-image');
    $wrapperRegularPrototype.addClass('cd-rcMsgLink-image-wrapper');
    $wrapperInterestingPrototype.addClass('cd-rcMsgLink-image-wrapper');
  } else {
    $aRegularPrototype.text('сообщение');
    $aInterestingPrototype.text('(!) сообщение');
  }

  const currentUserRegexp = new RegExp(
    '[^A-ZА-ЯЁa-zа-яё]' +
    cd.env.generateCaseInsensitiveFirstCharPattern(cd.env.CURRENT_USER).replace(/ /g, '[ _]') +
    '[^A-ZА-ЯЁa-zа-яё]'
  );

  const watchedTopics = await cd.env.getWatchedTopics();

  // Hook on wikipage.content to make the code work with the watchlist auto-update feature.
  mw.hook('wikipage.content').add(addMsgLinks);

  if (mw.config.get('wgIsArticle') && /[?&]diff=[^&]/.test(location.search)) {
    mw.hook('cd.pageReady').add(function () {
      const timezone = mw.user.options.get('timecorrection');
      const timezoneParts = timezone && timezone.split('|');
      const timezoneOffset = timezoneParts && Number(timezoneParts[1]);
      if (timezoneOffset == null || isNaN(timezoneOffset)) return;

      const area = document.querySelector('.diff-ntitle');
      if (!area) return;

      const minorMark = area.querySelector('.minoredit');
      if (minorMark) return;

      const comment = area.querySelector('.comment');
      const commentText = comment && comment.textContent;
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

      const dateElement = area.querySelector('#mw-diff-ntitle1 a');
      if (!dateElement) return;
      const timestamp = cd.env.getTimestampFromDate(dateElement.textContent, timezoneOffset);
      if (!timestamp) return;

      const dateObj = new Date(timestamp);
      const year = dateObj.getUTCFullYear();
      const month = dateObj.getUTCMonth();
      const day = dateObj.getUTCDate();
      const hour = dateObj.getUTCHours();
      const minute = dateObj.getUTCMinutes();

      let author = area.querySelector('.mw-userlink');
      author = author && author.textContent;
      if (!author || author === 'MediaWiki message delivery') return;

      const anchor = cd.env.generateMsgAnchor(year, month, day, hour, minute, author);

      let wrapper;
      if (commentText && currentUserRegexp.test(' ' + commentText + ' ')) {
        wrapper = $wrapperInterestingPrototype[0].cloneNode(true);
        wrapper.lastChild.title = 'Ссылка на сообщение (сообщение адресовано вам)';
      } else {
        let isWatched = false;
        if (commentText) {
          const curId = mw.config.get('wgArticleId');
          const thisPageWatchedTopics = watchedTopics && watchedTopics[curId] || [];
          if (thisPageWatchedTopics.length) {
            for (let j = 0; j < thisPageWatchedTopics.length; j++) {
              // Caution: invisible character after →.
              if (commentText.includes('→‎' + thisPageWatchedTopics[j])) {
                isWatched = true;
                break;
              }
            }
            if (isWatched) {
              wrapper = $wrapperInterestingPrototype[0].cloneNode(true);
              wrapper.lastChild.title = 'Ссылка на сообщение (вы следите за этой темой)';
            }
          }
        }
        if (!isWatched) {
          wrapper = $wrapperRegularPrototype[0].cloneNode(true);
        }
      }

      wrapper.firstChild.href = '#' + anchor;
      wrapper.onclick = function (e) {
        e.preventDefault();
        const msg = cd.getMsgByAnchor(anchor);
        if (msg) {
          msg.scrollToAndHighlightTarget();
          history.replaceState({}, '', '#' + anchor);
        }
      };

      const destination = area.querySelector('#mw-diff-ntitle3');
      if (!destination) return;
      destination.insertBefore(wrapper, destination.firstChild);

      mw.hook('cd.msgLinksCreated').fire(cd);
    });
  }
}
