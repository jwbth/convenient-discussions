/**
 * Module loaded on pages where we add comment links to history entries (sometimes more).
 *
 * @module commentLinks
 */

import Comment from './Comment';
import Page from './Page';
import cd from './cd';
import userRegistry from './userRegistry';
import { createApi, initSettings } from './boot';
import { editWatchedSections, showSettingsDialog } from './modal';
import {
  generateCommentAnchor,
  initDayjs,
  initTimestampParsingTools,
  parseTimestamp,
} from './timestamp';
import {
  generatePageNamePattern,
  isCommentEdit,
  isProbablyTalkPage,
  isUndo,
  removeDirMarks,
  spacesToUnderlines,
} from './util';
import { getWatchedSections } from './options';
import { loadSiteData } from './siteData';

let serverName;
let colon;
let moveFromBeginning;
let moveToBeginning;
let goToCommentToYou;
let goToCommentWatchedSection;
let currentUserRegexp;
let wrapperRegularPrototype;
let wrapperRelevantPrototype;
let switchRelevantButton;

/**
 * Prepare variables.
 *
 * @param {Promise[]} [siteDataRequests] Array of requests returned by
 *   {@link module:siteData.loadSiteData}.
 * @private
 */
async function prepare(siteDataRequests) {
  createApi();

  // Loading the watched sections is not critical, as opposed to messages, so we catch the possible
  // error, not letting it be caught by the try/catch block.
  const watchedSectionsRequest = getWatchedSections(true).catch((e) => {
    console.warn('Couldn\'t load the settings from the server.', e);
  });
  if (!siteDataRequests.length) {
    siteDataRequests = loadSiteData();
  }

  try {
    await Promise.all([watchedSectionsRequest, ...siteDataRequests]);
  } catch (e) {
    throw ['Couldn\'t load the messages required for the script.', e];
  }

  mw.loader.addStyleTag(`:root {
  --cd-parentheses-start: '${cd.mws('parentheses-start')}';
  --cd-parentheses-end: '${cd.mws('parentheses-end')}';
}`);

  // Used in util.firstCharToUpperCase() via boot.initSettings().
  cd.g.PHP_CHAR_TO_UPPER_JSON = mw.loader.moduleRegistry['mediawiki.Title'].script
    .files['phpCharToUpper.json'];

  cd.page = new Page(cd.g.PAGE_NAME, false);
  cd.user = userRegistry.getUser(cd.g.USER_NAME);

  serverName = mw.config.get('wgServerName');
  colon = cd.mws('colon-separator', { language: 'content' }).trim();
  [moveFromBeginning] = cd.s('es-move-from').match(/^[^[$]+/) || [];
  [moveToBeginning] = cd.s('es-move-to').match(/^[^[$]+/) || [];

  goToCommentToYou = goToCommentWatchedSection = cd.s('lp-comment-tooltip') + ' ';
  goToCommentToYou += cd.mws('parentheses', cd.s('lp-comment-toyou'));
  goToCommentWatchedSection += cd.mws('parentheses', cd.s('lp-comment-watchedsection'));

  const $aRegularPrototype = $('<a>')
    .text(cd.s('lp-comment'))
    .attr('title', cd.s('lp-comment-tooltip'));
  const $spanRegularPrototype = $('<span>')
    .addClass('cd-commentLink-innerWrapper')
    .append($aRegularPrototype);
  const $wrapperRegularPrototype = $('<span>')
    .addClass('cd-commentLink')
    .append($spanRegularPrototype)
    .prepend(' ');
  wrapperRegularPrototype = $wrapperRegularPrototype.get(0);
  wrapperRelevantPrototype = $wrapperRegularPrototype
    .clone()
    .addClass('cd-commentLink-relevant')
    .get(0);

  const currentUserNamePattern = generatePageNamePattern(cd.g.USER_NAME);
  currentUserRegexp = new RegExp(
    `(?:^|[^${cd.g.LETTER_PATTERN}])${currentUserNamePattern}(?![${cd.g.LETTER_PATTERN}])`
  );
}

/**
 * Show/hide relevant edits.
 *
 * @private
 */
function switchRelevant() {
  // Item grouping switched on. This may be done in the settings or in the URL.
  const isEnhanced = !$('.mw-changeslist').find('ul.special').length;

  // This is for many watchlist types at once.
  const $collapsibles = cd.g.$content
    .find('.mw-changeslist .mw-collapsible:not(.mw-changeslist-legend)');
  const $lines = cd.g.$content.find('.mw-changeslist-line:not(.mw-collapsible)');

  if (switchRelevantButton.hasFlag('progressive')) {
    // Show all
    // FIXME: Old watchlist (no JS) + ?enhanced=1&urlversion=2
    if (isEnhanced) {
      $lines
        .filter('table')
        .show();
    } else {
      $lines
        .not(':has(.cd-commentLink-relevant)')
        .show();
    }
    $collapsibles
      .not(':has(.cd-commentLink-relevant)')
      .find('.mw-rcfilters-ui-highlights-enhanced-toplevel')
      .show();
    $collapsibles
      .not('.mw-collapsed')
      .find('.mw-enhancedchanges-arrow')
      .click();
  } else {
    // Show relevant only
    $collapsibles
      .not('.mw-collapsed')
      .find('.mw-enhancedchanges-arrow')
      .click();
    $collapsibles
      .has('.cd-commentLink-relevant')
      .find('.mw-enhancedchanges-arrow')
      .click()
    $collapsibles
      .not(':has(.cd-commentLink-relevant)')
      .find('.mw-rcfilters-ui-highlights-enhanced-toplevel')
      .hide();
    $lines
      .not(':has(.cd-commentLink-relevant)')
      .hide();
  }
  switchRelevantButton
    .setFlags({ progressive: !switchRelevantButton.hasFlag('progressive') });
}

/**
 * Add watchlist menu (a block with buttons).
 *
 * @private
 */
function addWatchlistMenu() {
  // For auto-updating watchlists
  mw.hook('wikipage.content').add(() => {
    if (switchRelevantButton) {
      switchRelevantButton.setFlags({ progressive: false });
    }
  });

  const $menu = $('<div>').addClass('cd-watchlistMenu');
  $('<a>')
    .attr('href', mw.util.getUrl(cd.config.scriptPageWikilink))
    .attr('target', '_blank')
    .addClass('cd-watchlistMenu-scriptPageLink')
    .text(cd.s('script-name-short'))
    .appendTo($menu);

  switchRelevantButton = new OO.ui.ButtonWidget({
    framed: false,
    icon: 'speechBubble',
    label: cd.s('wl-button-switchrelevant-tooltip'),
    invisibleLabel: true,
    title: cd.s('wl-button-switchrelevant-tooltip'),
    classes: ['cd-watchlistMenu-button', 'cd-watchlistMenu-button-switchRelevant'],
    disabled: !cd.g.watchedSections,
  });
  switchRelevantButton.on('click', () => {
    switchRelevant();
  });
  switchRelevantButton.$element.appendTo($menu);

  const editWatchedSectionsButton = new OO.ui.ButtonWidget({
    framed: false,
    icon: 'listBullet',
    label: cd.s('wl-button-editwatchedsections-tooltip'),
    invisibleLabel: true,
    title: cd.s('wl-button-editwatchedsections-tooltip'),
    classes: ['cd-watchlistMenu-button', 'cd-watchlistMenu-button-editWatchedSections'],
  });
  editWatchedSectionsButton.on('click', () => {
    editWatchedSections();
  });
  editWatchedSectionsButton.$element.appendTo($menu);

  const settingsButton = new OO.ui.ButtonWidget({
    framed: false,
    icon: 'settings',
    label: cd.s('wl-button-settings-tooltip'),
    invisibleLabel: true,
    title: cd.s('wl-button-settings-tooltip'),
    classes: ['cd-watchlistMenu-button', 'cd-watchlistMenu-button-scriptSettings'],
  });
  settingsButton.on('click', () => {
    initDayjs();
    showSettingsDialog();
  });
  settingsButton.$element.appendTo($menu);

  // New watchlist, old watchlist
  cd.g.$content.find('.mw-rcfilters-ui-changesLimitAndDateButtonWidget').prepend($menu);
  cd.g.$content.find('#mw-watchlist-options .mw-changeslist-legend').after($menu);
}

/**
 * Whether the provided link element points to a Wikidata item.
 *
 * @param {Element} linkElement
 * @returns {boolean}
 * @private
 */
function isWikidataItem(linkElement) {
  return (
    serverName === 'www.wikidata.org' &&
    linkElement.firstElementChild?.classList.contains('wb-itemlink')
  )
}

/**
 * Extract an author given a revision line.
 *
 * @param {Element} line
 * @returns {?string}
 * @private
 */
function extractAuthor(line) {
  const authorElement = line.querySelector('.mw-userlink');
  if (!authorElement) {
    return null;
  }
  let author = authorElement.textContent;
  if (author === 'MediaWiki message delivery') {
    return null;
  }
  if (mw.util.isIPv6Address(author)) {
    author = author.toUpperCase();
  }
  return author;
}

/**
 * Check by an edit summary if an edit is probably a move performed by our script.
 *
 * @param {string} summary
 * @returns {boolean}
 * @private
 */
function isMoved(summary) {
  return (
    (moveFromBeginning && summary.includes(': ' + moveFromBeginning)) ||
    (moveToBeginning && summary.includes(': ' + moveToBeginning))
  );
}

/**
 * Check by an edit summary if an edit is probably an archiving operation.
 *
 * @param {string} summary
 * @returns {boolean}
 * @private
 */
function isArchiving(summary) {
  return summary.includes('Archiving');
}

/**
 * Check by an edit summary if it is an edit in a section this given name.
 *
 * @param {string} summary
 * @param {string} name
 * @returns {boolean}
 * @private
 */
function isInSection(summary, name) {
  if (!name) {
    return false;
  }

  // This can run many thousand times, so we use the cheapest way.
  return cd.g.CONTENT_DIR === 'ltr' ?
    summary.includes(`→${name}${colon}`) || summary.endsWith(`→${name}`) :
    summary.includes(`←${name}${colon}`) || summary.endsWith(`←${name}`);
}

/**
 * Add comment links to a watchlist or a recent changes page. Add a watchlist menu to the watchlist.
 *
 * @param {external:jQuery} $content
 * @private
 */
function processWatchlist($content) {
  if (
    mw.config.get('wgCanonicalSpecialPageName') === 'Watchlist' &&
    !cd.g.$content.find('.cd-watchlistMenu').length
  ) {
    initSettings();

    if (mw.user.options.get('wlenhancedfilters-disable')) {
      addWatchlistMenu();
    } else {
      mw.hook('structuredChangeFilters.ui.initialized').add(() => {
        addWatchlistMenu();
      });
    }

    $('.mw-rcfilters-ui-filterWrapperWidget-showNewChanges a').on('click', async () => {
      try {
        await getWatchedSections();
      } catch (e) {
        console.warn('Couldn\'t load the settings from the server.', e);
      }
    });
  }

  // There are 2 ^ 3 = 8 (!) different watchlist modes:
  // * expanded and not
  // * with item grouping and without
  // * with enhanced fitlers and without

  const lines = $content.get(0).querySelectorAll('.mw-changeslist-line:not(.mw-collapsible)');
  lines.forEach((line) => {
    const nsMatch = line.className.match(/mw-changeslist-ns(\d+)/);
    const nsNumber = nsMatch && Number(nsMatch[1]);
    if (nsNumber === null) return;

    const isNested = line.tagName === 'TR';
    const linkElement = (isNested ? line.parentNode : line).querySelector('.mw-changeslist-title');
    if (!linkElement || isWikidataItem(linkElement)) return;

    const pageName = linkElement.textContent;
    if (!isProbablyTalkPage(pageName, nsNumber)) return;

    if (line.querySelector('.minoredit')) return;

    let summary = line.querySelector('.comment')?.textContent;
    summary = summary && removeDirMarks(summary);
    if (summary && (isCommentEdit(summary) || isUndo(summary) || isMoved(summary))) return;

    const bytesAddedElement = line.querySelector('.mw-plusminus-pos');
    if (!bytesAddedElement) return;

    if (bytesAddedElement.tagName !== 'STRONG') {
      const bytesAddedMatch = bytesAddedElement.textContent.match(/\d+/);
      const bytesAdded = bytesAddedMatch && Number(bytesAddedMatch[0]);
      if (!bytesAdded || bytesAdded < cd.config.bytesToDeemComment) return;
    }

    const timestamp = line.getAttribute('data-mw-ts')?.slice(0, 12);
    if (!timestamp) return;

    const author = extractAuthor(line);
    if (!author) return;

    const anchor = timestamp + '_' + spacesToUnderlines(author);

    const link = linkElement.href;
    if (!link) return;

    let wrapper;
    if (summary && currentUserRegexp.test(` ${summary} `)) {
      wrapper = wrapperRelevantPrototype.cloneNode(true);
      wrapper.lastChild.lastChild.title = goToCommentToYou;
    } else {
      let isWatched = false;
      if (summary) {
        const curLink = (
          // Expanded watchlist
          line.querySelector('.mw-changeslist-diff-cur') ||
          // Non-expanded watchlist
          line.querySelector('.mw-changeslist-history')
        );
        const curIdMatch = curLink?.href?.match(/[&?]curid=(\d+)/);
        const curId = curIdMatch && Number(curIdMatch[1]);
        if (curId) {
          const currentPageWatchedSections = cd.g.watchedSections?.[curId] || [];
          if (currentPageWatchedSections.length) {
            for (let j = 0; j < currentPageWatchedSections.length; j++) {
              if (isInSection(summary, currentPageWatchedSections[j])) {
                isWatched = true;
                break;
              }
            }
            if (isWatched) {
              wrapper = wrapperRelevantPrototype.cloneNode(true);
              wrapper.lastChild.lastChild.title = goToCommentWatchedSection;
            }
          }
        }
      }
      if (!isWatched) {
        wrapper = wrapperRegularPrototype.cloneNode(true);
      }
    }

    wrapper.lastChild.lastChild.href = `${link}#${anchor}`;

    const destination = line.querySelector('.comment') || line.querySelector('.mw-usertoollinks');
    if (!destination) return;

    destination.parentNode.insertBefore(wrapper, destination.nextSibling);
  });
}

/**
 * Add comment links to a contributions page.
 *
 * @param {external:jQuery} $content
 * @private
 */
function processContributions($content) {
  initTimestampParsingTools('user');
  if (cd.g.UI_TIMEZONE === null) return;

  const list = $content.get(0).querySelector('.mw-contributions-list');

  // Empty contributions list
  if (!list) return;
  const lines = Array.from(list.children);

  lines.forEach((line) => {
    const linkElement = line.querySelector('.mw-contributions-title');
    if (!linkElement || isWikidataItem(linkElement)) return;

    const pageName = linkElement.textContent;
    const page = new Page(pageName);
    if (!page.isProbablyTalkPage()) return;

    const link = linkElement.href;
    if (!link) return;

    if (line.querySelector('.minoredit')) return;

    let summary = line.querySelector('.comment')?.textContent;
    summary = summary && removeDirMarks(summary);
    if (summary && (isCommentEdit(summary) || isUndo(summary) || isMoved(summary))) return;

    const bytesAddedElement = line.querySelector('.mw-plusminus-pos');
    if (!bytesAddedElement) return;

    if (bytesAddedElement.tagName !== 'STRONG') {
      const bytesAddedMatch = bytesAddedElement.textContent.match(/\d+/);
      const bytesAdded = bytesAddedMatch && Number(bytesAddedMatch[0]);
      if (!bytesAdded || bytesAdded < cd.config.bytesToDeemComment) return;
    }

    const dateElement = line.querySelector('.mw-changeslist-date');
    if (!dateElement) return;

    const { date } = parseTimestamp(dateElement.textContent, cd.g.UI_TIMEZONE) || {};
    if (!date) return;

    const anchor = generateCommentAnchor(date, mw.config.get('wgRelevantUserName'));

    let wrapper;
    if (summary && currentUserRegexp.test(` ${summary} `)) {
      wrapper = wrapperRelevantPrototype.cloneNode(true);
      wrapper.lastChild.lastChild.title = goToCommentToYou;
    } else {
      // We have no place to extract the article ID from :-(
      wrapper = wrapperRegularPrototype.cloneNode(true);
    }

    wrapper.lastChild.lastChild.href = `${link}#${anchor}`;

    let destination = line.querySelector('.comment');
    if (!destination) {
      destination = linkElement;
      destination.nextSibling.textContent = destination.nextSibling.textContent.replace(/^\s/, '');
    }
    destination.parentNode.insertBefore(wrapper, destination.nextSibling);
  });
}

/**
 * Add comment links to a history page.
 *
 * @param {external:jQuery} $content
 * @private
 */
function processHistory($content) {
  initTimestampParsingTools('user');
  if (cd.g.UI_TIMEZONE === null) return;

  const list = $content.get(0).querySelector('#pagehistory');
  const lines = Array.from(list.children);
  const link = cd.page.getUrl();

  lines.forEach((line) => {
    if (line.querySelector('.minoredit')) return;

    let summary = line.querySelector('.comment')?.textContent;
    summary = summary && removeDirMarks(summary);
    if (summary && (isCommentEdit(summary) || isUndo(summary) || isMoved(summary))) return;

    const bytesAddedElement = line.querySelector('.mw-plusminus-pos');
    if (!bytesAddedElement) return;

    if (bytesAddedElement.tagName !== 'STRONG') {
      const bytesAddedMatch = bytesAddedElement.textContent.match(/\d+/);
      const bytesAdded = bytesAddedMatch && Number(bytesAddedMatch[0]);
      if (!bytesAdded || bytesAdded < cd.config.bytesToDeemComment) return;
    }

    const dateElement = line.querySelector('.mw-changeslist-date');
    if (!dateElement) return;

    const { date } = parseTimestamp(dateElement.textContent, cd.g.UI_TIMEZONE) || {};
    if (!date) return;

    const author = extractAuthor(line);
    if (!author) return;

    const anchor = generateCommentAnchor(date, author);

    let wrapper;
    if (summary && currentUserRegexp.test(` ${summary} `)) {
      wrapper = wrapperRelevantPrototype.cloneNode(true);
      wrapper.lastChild.lastChild.title = goToCommentToYou;
    } else {
      let isWatched = false;
      if (summary) {
        if (cd.g.currentPageWatchedSections?.length) {
          for (let j = 0; j < cd.g.currentPageWatchedSections.length; j++) {
            if (isInSection(summary, cd.g.currentPageWatchedSections[j])) {
              isWatched = true;
              break;
            }
          }
          if (isWatched) {
            wrapper = wrapperRelevantPrototype.cloneNode(true);
            wrapper.lastChild.lastChild.title = goToCommentWatchedSection;
          }
        }
      }
      if (!isWatched) {
        wrapper = wrapperRegularPrototype.cloneNode(true);
      }
    }

    wrapper.lastChild.lastChild.href = `${link}#${anchor}`;

    let destination = line.querySelector('.comment');
    if (!destination) {
      const separators = line.querySelectorAll('.mw-changeslist-separator');
      destination = separators?.[separators.length - 1];
    }
    if (!destination) return;

    destination.parentNode.insertBefore(wrapper, destination.nextSibling);
  });
}

/**
 * Add comment link to a diff view.
 *
 * @param {external:jQuery} [$diff]
 * @fires commentLinksAdded
 * @private
 */
async function processDiff($diff) {
  // Filter out cases when "wikipage.diff" was fired for the diff at the top of the page that is a
  // diff page (unless only a diff, and no content, is displayed - if
  // mw.user.options.get('diffonly') or the diffonly URL parameter is true). We parse that diff on
  // "convenientDiscussions.pageReady".
  if (cd.g.isPageProcessed && $diff?.parent().is(cd.g.$content)) return;

  if (!cd.g.UI_TIMESTAMP_REGEXP) {
    initTimestampParsingTools('user');
  }
  if (cd.g.UI_TIMEZONE === null) return;

  const $root = $diff || cd.g.$content;
  const root = $root.get(0);
  [root.querySelector('.diff-otitle'), root.querySelector('.diff-ntitle')]
    .filter((el) => el !== null)
    .forEach((area) => {
      if (area.querySelector('.minoredit')) return;

      area.querySelector('.cd-commentLink')?.remove();

      let summary = area.querySelector('.comment')?.textContent;
      summary = summary && removeDirMarks(summary);

      // In diffs, archivation can't be captured by looking at bytes added.
      if (
        summary &&
        (isCommentEdit(summary) || isUndo(summary) || isMoved(summary) || isArchiving(summary))
      ) {
        return;
      }

      const dateElement = area.querySelector('#mw-diff-otitle1 a, #mw-diff-ntitle1 a');
      if (!dateElement) return;

      const { date } = parseTimestamp(dateElement.textContent, cd.g.UI_TIMEZONE) || {};
      if (!date) return;

      const author = extractAuthor(area);
      if (!author) return;

      const anchor = generateCommentAnchor(date, author);

      let comment;
      let page;
      if ($diff) {
        const revUrl = new mw.Uri(dateElement.href);
        page = new Page(revUrl.query.title);
      } else {
        comment = Comment.getByAnchor(anchor, true);
      }
      if (comment || ($diff && page.isProbablyTalkPage())) {
        let wrapper;
        if (summary && currentUserRegexp.test(` ${summary} `)) {
          wrapper = wrapperRelevantPrototype.cloneNode(true);
          wrapper.lastChild.lastChild.title = goToCommentToYou;
        } else {
          let isWatched = false;
          if (!$diff && summary && cd.g.currentPageWatchedSections?.length) {
            for (let j = 0; j < cd.g.currentPageWatchedSections.length; j++) {
              if (isInSection(summary, cd.g.currentPageWatchedSections[j])) {
                isWatched = true;
                break;
              }
            }
            if (isWatched) {
              wrapper = wrapperRelevantPrototype.cloneNode(true);
              wrapper.lastChild.lastChild.title = goToCommentWatchedSection;
            }
          }
          if (!isWatched) {
            wrapper = wrapperRegularPrototype.cloneNode(true);
          }
        }

        const linkElement = wrapper.lastChild.lastChild;
        if ($diff) {
          linkElement.href = page.getUrl() + '#' + anchor;

          // Not diff pages with a diff only
          if (cd.g.isPageProcessed) {
            linkElement.target = '_blank';
          }
        } else {
          linkElement.href = '#' + anchor;
          linkElement.onclick = function (e) {
            e.preventDefault();
            comment.scrollTo(false, true);
          };
        }

        const destination = area.querySelector('#mw-diff-otitle3, #mw-diff-ntitle3');
        if (!destination) return;

        destination.appendChild(wrapper);
      }
    });

  /**
   * Comments links have been added to the revisions listed on the page.
   *
   * @event commentLinksAdded
   * @param {external:jQuery} $root Root element of content to which the comment links were added.
   * @param {object} cd {@link convenientDiscussions} object.
   */
  mw.hook('convenientDiscussions.commentLinksAdded').fire($root, cd);
}

/**
 * Add comment links to the revisions listed on the page that is a revision list page (not a diff
 * page, for instance).
 *
 * @param {external:jQuery} $content
 * @private
 */
async function processRevisionListPage($content) {
  // Occurs in the watchlist when mediawiki.rcfilters.filters.ui module for some reason fires
  // wikipage.content for the second time with an element that is not in the DOM,
  // fieldset#mw-watchlist-options (in the mw.rcfilters.ui.FormWrapperWidget#onChangesModelUpdate
  // function).
  if (!$content.parent().length) return;

  if (['Recentchanges', 'Watchlist'].includes(mw.config.get('wgCanonicalSpecialPageName'))) {
    processWatchlist($content);
  } else if (mw.config.get('wgCanonicalSpecialPageName') === 'Contributions') {
    processContributions($content);
  } else if (mw.config.get('wgAction') === 'history' && cd.page.isProbablyTalkPage()) {
    processHistory($content);
  }

  mw.hook('convenientDiscussions.commentLinksAdded').fire($content, cd);
}

/**
 * _For internal use._ The entry function for the comment links adding mechanism.
 *
 * @param {Promise[]} siteDataRequests Array of requests returned by
 *   {@link module:siteData.loadSiteData}.
 */
export default async function addCommentLinks(siteDataRequests) {
  try {
    await prepare(siteDataRequests);
  } catch (e) {
    console.warn(...e);
    return;
  }

  if (cd.g.isDiffPage) {
    mw.hook('convenientDiscussions.pageReady').add(() => {
      processDiff();
    });
  } else {
    // Hook on wikipage.content to make the code work with the watchlist auto-update feature.
    mw.hook('wikipage.content').add(processRevisionListPage);
  }

  // Diffs generated by scripts, like Serhio Magpie's Instant Diffs.
  mw.hook('wikipage.diff').add(processDiff);
}

/**
 * When on the Special:Search page, searching for a comment after choosing that option from the
 * "Couldn't find the comment" message, add comment links to titles.
 */
export function addCommentLinksToSpecialSearch() {
  const [, commentAnchor] = location.search.match(/[?&]cdcomment=([^&]+)(?:&|$)/) || [];
  if (commentAnchor) {
    mw.loader.using('mediawiki.api').then(
      async () => {
        await Promise.all(...loadSiteData());
        $('.mw-search-result-heading').each((i, el) => {
          const originalHref = $(el)
            .find('a')
            .first()
            .attr('href');
          const href = originalHref + '#' + commentAnchor;
          const $a = $('<a>')
            .attr('href', href)
            .text(cd.s('deadanchor-search-gotocomment'));
          const $start = $('<span>').text(cd.mws('parentheses-start'));
          const $end = $('<span>').text(cd.mws('parentheses-end'));
          const $span = $('<span>')
            .addClass('cd-searchCommentLink')
            .append($start, $a, $end);
          $(el).append(' ', $span.clone());
        });
      },
      console.error
    );
  }
}
