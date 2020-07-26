/**
 * Module loaded on pages where we need to add comment links to history entries (at minimum).
 *
 * @module commentLinks
 */

import { create as nanoCssCreate } from 'nano-css';

import Comment from './Comment';
import Page from './Page';
import cd from './cd';
import {
  caseInsensitiveFirstCharPattern,
  isCommentEdit,
  isProbablyTalkPage,
  isUndo,
  notNull,
  spacesToUnderlines,
} from './util';
import { editWatchedSections, settingsDialog } from './modal';
import { generateCommentAnchor, parseTimestamp } from './timestamp';
import { getWatchedSections } from './options';
import { initSettings } from './boot';
import { initTimestampParsingTools, loadMessages } from './dateFormat';

let moveFromBeginning;
let moveToBeginning;
let goToCommentToYou;
let goToCommentWatchedSection;
let currentUserRegexp;
let $wrapperRegularPrototype;
let $wrapperInterestingPrototype;
let switchInterestingButton;

let processDiffFirstRun = true;

/**
 * Prepare variables.
 *
 * @param {object} [data] Data passed from the main module.
 * @param {Promise} [data.messagesRequest] Promise returned by {@link
 *   module:dateFormat.loadMessages}.
 * @private
 */
async function prepare({ messagesRequest }) {
  cd.g.api = cd.g.api || new mw.Api();

  // Loading the watched sections is not critical, as opposed to messages, so we catch the possible
  // error, not letting it be caught by the try/catch block.
  const watchedSectionsRequest = getWatchedSections(true).catch((e) => {
    console.warn('Couldn\'t load the settings from the server.', e);
  });
  messagesRequest = messagesRequest || loadMessages();

  try {
    await Promise.all([watchedSectionsRequest, messagesRequest]);
  } catch (e) {
    throw ['Couldn\'t load the messages required for the script.', e];
  }

  cd.g.nanoCss = nanoCssCreate();
  cd.g.nanoCss.put('.cd-commentLink-innerWrapper', {
    '::before': {
      content: `"${mw.msg('parentheses-start')}"`,
    },
    '::after': {
      content: `"${mw.msg('parentheses-end')}"`,
    },
  });

  cd.g.PHP_CHAR_TO_UPPER_JSON = mw.loader.moduleRegistry['mediawiki.Title'].script
    .files["phpCharToUpper.json"];
  cd.g.CURRENT_PAGE = new Page(cd.g.CURRENT_PAGE_NAME);
  cd.g.QQX_MODE = mw.util.getParamValue('uselang') === 'qqx';

  initTimestampParsingTools();

  [moveFromBeginning] = cd.s('es-move-from').match(/^[^[$]+/) || [];
  [moveToBeginning] = cd.s('es-move-to').match(/^[^[$]+/) || [];

  goToCommentToYou = `${cd.s('lp-comment-tooltip')} ${mw.msg('parentheses', cd.s('lp-comment-toyou'))}`;
  goToCommentWatchedSection = `${cd.s('lp-comment-tooltip')} ${mw.msg('parentheses', cd.s('lp-comment-watchedsection'))}`;

  const $aRegularPrototype = $('<a>')
    .text(cd.s('lp-comment'))
    .attr('title', cd.s('lp-comment-tooltip'));
  const $spanRegularPrototype = $('<span>')
    .addClass('cd-commentLink-innerWrapper')
    .append($aRegularPrototype);
  $wrapperRegularPrototype = $('<span>')
    .addClass('cd-commentLink')
    .append($spanRegularPrototype)
    .prepend(' ');
  $wrapperInterestingPrototype = $wrapperRegularPrototype
    .clone()
    .addClass('cd-commentLink-interesting');

  const currentUserNamePattern = caseInsensitiveFirstCharPattern(cd.g.CURRENT_USER_NAME)
    .replace(/ /g, '[ _]');
  currentUserRegexp = new RegExp(
    `(?:^|[^${cd.g.LETTER_PATTERN}])${currentUserNamePattern}(?![${cd.g.LETTER_PATTERN}])`
  );
}

/**
 * Show/hide interesting edits.
 *
 * @private
 */
function switchInteresting() {
  // Item grouping switched on. This may be done in the settings or in the URL.
  const isEnhanced = !$('.mw-changeslist').find('ul.special').length;

  // This is for many watchlist types at once.
  const $collapsibles = cd.g.$content
    .find('.mw-changeslist .mw-collapsible:not(.mw-changeslist-legend)');
  const $lines = cd.g.$content.find('.mw-changeslist-line:not(.mw-collapsible)');

  if (switchInterestingButton.hasFlag('progressive')) {
    // Show all
    // FIXME: old watchlist (no JS) + ?enhanced=1&urlversion=2
    if (isEnhanced) {
      $lines
        .filter('table')
        .show();
    } else {
      $lines
        .not(':has(.cd-commentLink-interesting)')
        .show();
    }
    $collapsibles
      .not(':has(.cd-commentLink-interesting)')
      .find('.mw-rcfilters-ui-highlights-enhanced-toplevel')
      .show();
    $collapsibles
      .not('.mw-collapsed')
      .find('.mw-enhancedchanges-arrow')
      .click();
  } else {
    // Show interesting only
    $collapsibles
      .not('.mw-collapsed')
      .find('.mw-enhancedchanges-arrow')
      .click();
    $collapsibles
      .has('.cd-commentLink-interesting')
      .find('.mw-enhancedchanges-arrow')
      .click()
    $collapsibles
      .not(':has(.cd-commentLink-interesting)')
      .find('.mw-rcfilters-ui-highlights-enhanced-toplevel')
      .hide();
    $lines
      .not(':has(.cd-commentLink-interesting)')
      .hide();
  }
  switchInterestingButton
    .setFlags({ progressive: !switchInterestingButton.hasFlag('progressive') });
}

/**
 * Add watchlist menu (a fieldset with buttons).
 *
 * @private
 */
function addWatchlistMenu() {
  // For auto-updating watchlists
  mw.hook('wikipage.content').add(() => {
    if (switchInterestingButton) {
      switchInterestingButton.setFlags({ progressive: false });
    }
  });

  const $menu = $('<fieldset>').addClass('cd-watchlistMenu');
  const $legend = $('<legend>')
    .addClass('cd-watchlistMenu-legend')
    .appendTo($menu);
  $('<a>')
    .attr('href', mw.util.getUrl(cd.config.helpWikilink))
    .html(cd.s('script-name-short'))
    .appendTo($legend);

  switchInterestingButton = new OO.ui.ButtonWidget({
    framed: false,
    icon: 'speechBubble',
    label: cd.s('wl-button-switchinteresting-tooltip'),
    invisibleLabel: true,
    title: cd.s('wl-button-switchinteresting-tooltip'),
    classes: ['cd-watchlistMenu-button', 'cd-watchlistMenu-button-switchInteresting'],
    disabled: !cd.g.watchedSections,
  });
  switchInterestingButton.on('click', () => {
    switchInteresting();
  });
  switchInterestingButton.$element.appendTo($menu);

  const editWatchedSectionsButton = new OO.ui.ButtonWidget({
    framed: false,
    icon: 'listBullet',
    label: cd.s('wl-button-editwatchedsections-tooltip'),
    invisibleLabel: true,
    title: cd.s('wl-button-editwatchedsections-tooltip'),
    classes: ['cd-watchlistMenu-button', 'cd-watchlistMenu-button-editWatchedSections'],
  });
  editWatchedSectionsButton.on('click', editWatchedSections);
  editWatchedSectionsButton.$element.appendTo($menu);

  const scriptSettingsButton = new OO.ui.ButtonWidget({
    framed: false,
    icon: 'settings',
    label: cd.s('wl-button-scriptsettings-tooltip'),
    invisibleLabel: true,
    title: cd.s('wl-button-scriptsettings-tooltip'),
    classes: ['cd-watchlistMenu-button', 'cd-watchlistMenu-button-scriptSettings'],
  });
  scriptSettingsButton.on('click', () => {
    settingsDialog();
  });
  scriptSettingsButton.$element.appendTo($menu);

  // New watchlist, old watchlist
  cd.g.$content.find('.mw-rcfilters-ui-changesLimitAndDateButtonWidget').prepend($menu);
  cd.g.$content.find('#mw-watchlist-options .mw-changeslist-legend').after($menu);
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
 * Add comment links to a watchlist or a recent changes page. Add a watchlist menu to the watchlist.
 *
 * @param {JQuery} $content
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
    const linkElement = (isNested ? line.parentElement : line)
      .querySelector('.mw-changeslist-title');
    if (!linkElement) return;

    const pageName = linkElement.textContent;
    if (!isProbablyTalkPage(pageName, nsNumber)) return;

    if (line.querySelector('.minoredit')) return;

    const summary = line.querySelector('.comment')?.textContent;
    if (summary && (isCommentEdit(summary) || isUndo(summary) || isMoved(summary))) return;

    const bytesAddedElement = line.querySelector('.mw-plusminus-pos');
    if (!bytesAddedElement) {
      return;
    }
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
      wrapper = $wrapperInterestingPrototype.get(0).cloneNode(true);
      wrapper.lastChild.lastChild.title = goToCommentToYou;
    } else {
      let watched = false;
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
          const thisPageWatchedSections = (
            (cd.g.watchedSections && cd.g.watchedSections[curId]) ||
            []
          );
          if (thisPageWatchedSections.length) {
            for (let j = 0; j < thisPageWatchedSections.length; j++) {
              // \u200E is the left-to-right mark.
              if (summary.includes('→\u200E' + thisPageWatchedSections[j])) {
                watched = true;
                break;
              }
            }
            if (watched) {
              wrapper = $wrapperInterestingPrototype.get(0).cloneNode(true);
              wrapper.lastChild.lastChild.title = goToCommentWatchedSection;
            }
          }
        }
      }
      if (!watched) {
        wrapper = $wrapperRegularPrototype.get(0).cloneNode(true);
      }
    }

    wrapper.lastChild.lastChild.href = `${link}#${anchor}`;

    const destination = line.querySelector('.comment') || line.querySelector('.mw-usertoollinks');
    if (!destination) return;
    destination.parentElement.insertBefore(wrapper, destination.nextSibling);
  });
}

/**
 * Add comment links to a contributions page.
 *
 * @param {JQuery} $content
 * @private
 */
function processContributions($content) {
  const timezone = mw.user.options.get('timecorrection');
  const timezoneParts = timezone?.split('|');
  const timezoneOffset = timezoneParts && Number(timezoneParts[1]);
  if (timezoneOffset == null || isNaN(timezoneOffset)) return;

  const list = $content.get(0).querySelector('.mw-contributions-list');
  const lines = Array.from(list.children);

  lines.forEach((line) => {
    const linkElement = line.querySelector('.mw-contributions-title');
    if (!linkElement) return;

    const pageName = linkElement.textContent;
    const page = new Page(pageName);
    if (!page.isProbablyTalkPage()) return;

    const link = linkElement.href;
    if (!link) return;

    if (line.querySelector('.minoredit')) return;

    const summary = line.querySelector('.comment')?.textContent;
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
    const { date } = parseTimestamp(dateElement.textContent, timezoneOffset) || {};
    if (!date) return;

    const anchor = generateCommentAnchor(date, mw.config.get('wgRelevantUserName'));

    let wrapper;
    if (summary && currentUserRegexp.test(` ${summary} `)) {
      wrapper = $wrapperInterestingPrototype.get(0).cloneNode(true);
      wrapper.lastChild.lastChild.title = goToCommentToYou;
    } else {
      // We have no place to extract the article ID from :-(
      wrapper = $wrapperRegularPrototype.get(0).cloneNode(true);
    }

    wrapper.lastChild.lastChild.href = `${link}#${anchor}`;

    let destination = line.querySelector('.comment');
    if (!destination) {
      destination = linkElement;
      destination.nextSibling.textContent = destination.nextSibling.textContent.replace(/^\s/, '');
    }
    destination.parentElement.insertBefore(wrapper, destination.nextSibling);
  });
}

/**
 * Add comment links to a history page.
 *
 * @param {JQuery} $content
 * @private
 */
function processHistory($content) {
  const timezone = mw.user.options.get('timecorrection');
  const timezoneParts = timezone?.split('|');
  const timezoneOffset = timezoneParts && Number(timezoneParts[1]);
  if (timezoneOffset == null || isNaN(timezoneOffset)) return;

  const list = $content.get(0).querySelector('#pagehistory');
  const lines = Array.from(list.children);
  const link = cd.g.CURRENT_PAGE.getUrl();

  lines.forEach((line) => {
    if (line.querySelector('.minoredit')) return;

    const summary = line.querySelector('.comment')?.textContent;
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
    const { date } = parseTimestamp(dateElement.textContent, timezoneOffset) || {};
    if (!date) return;

    const author = extractAuthor(line);
    if (!author) return;

    const anchor = generateCommentAnchor(date, author);

    let wrapper;
    if (summary && currentUserRegexp.test(` ${summary} `)) {
      wrapper = $wrapperInterestingPrototype.get(0).cloneNode(true);
      wrapper.lastChild.lastChild.title = goToCommentToYou;
    } else {
      let watched = false;
      if (summary) {
        const thisPageWatchedSections = (
          (cd.g.watchedSections && cd.g.watchedSections[mw.config.get('wgArticleId')]) ||
          []
        );
        if (thisPageWatchedSections.length) {
          for (let j = 0; j < thisPageWatchedSections.length; j++) {
            // \u200E is the left-to-right mark.
            if (summary.includes('→\u200E' + thisPageWatchedSections[j])) {
              watched = true;
              break;
            }
          }
          if (watched) {
            wrapper = $wrapperInterestingPrototype.get(0).cloneNode(true);
            wrapper.lastChild.lastChild.title = goToCommentWatchedSection;
          }
        }
      }
      if (!watched) {
        wrapper = $wrapperRegularPrototype.get(0).cloneNode(true);
      }
    }

    wrapper.lastChild.lastChild.href = `${link}#${anchor}`;

    let destination = line.querySelector('.comment');
    if (!destination) {
      const separators = line.querySelectorAll('.mw-changeslist-separator');
      destination = separators && separators[separators.length - 1];
    }
    if (!destination) return;
    destination.parentElement.insertBefore(wrapper, destination.nextSibling);
  });
}

/**
 * Add comment link to a diff page.
 *
 * @fires commentLinksCreated
 * @private
 */
async function processDiff() {
  if (!processDiffFirstRun) return;

  const timezone = mw.user.options.get('timecorrection');
  const timezoneParts = timezone?.split('|');
  const timezoneOffset = timezoneParts && Number(timezoneParts[1]);
  if (timezoneOffset == null || isNaN(timezoneOffset)) return;

  const areas = [document.querySelector('.diff-otitle'), document.querySelector('.diff-ntitle')]
    .filter(notNull);

  areas.forEach((area) => {
    if (area.querySelector('.minoredit')) return;

    const summary = area.querySelector('.comment')?.textContent;
    if (
      summary &&

      // Here, archivation can't be captured by looking at bytes added.
      (isCommentEdit(summary) || isUndo(summary) || isMoved(summary) || isArchiving(summary))
    ) {
      return;
    }

    const dateElement = area.querySelector('#mw-diff-otitle1 a, #mw-diff-ntitle1 a');
    if (!dateElement) return;
    const { date } = parseTimestamp(dateElement.textContent, timezoneOffset) || {};
    if (!date) return;

    const author = extractAuthor(area);
    if (!author) return;

    const anchor = generateCommentAnchor(date, author);

    let comment = Comment.getCommentByAnchor(anchor);
    if (!comment) {
      let commentAnchorToCheck;
      // There can be a time difference between the time we know (taken from the watchlist or
      // generated in the script) and the time on the page. We take it to be not higher than 5
      // minutes for the watchlist time and not higher than 1 minute for the script-generated time.
      for (let gap = 1; !comment && gap <= 5; gap++) {
        const dateToFind = new Date(date.getTime() - cd.g.MILLISECONDS_IN_A_MINUTE * gap);
        commentAnchorToCheck = generateCommentAnchor(dateToFind, author);
        comment = Comment.getCommentByAnchor(commentAnchorToCheck);
      }
    }

    if (comment) {
      let wrapper;
      if (summary && currentUserRegexp.test(` ${summary} `)) {
        wrapper = $wrapperInterestingPrototype.get(0).cloneNode(true);
        wrapper.lastChild.lastChild.title = goToCommentToYou;
      } else {
        let watched = false;
        if (summary && cd.g.thisPageWatchedSections.length) {
          for (let j = 0; j < cd.g.thisPageWatchedSections.length; j++) {
            // \u200E is the left-to-right mark.
            if (summary.includes('→\u200E' + cd.g.thisPageWatchedSections[j])) {
              watched = true;
              break;
            }
          }
          if (watched) {
            wrapper = $wrapperInterestingPrototype.get(0).cloneNode(true);
            wrapper.lastChild.lastChild.title = goToCommentWatchedSection;
          }
        }
        if (!watched) {
          wrapper = $wrapperRegularPrototype.get(0).cloneNode(true);
        }
      }

      wrapper.lastChild.lastChild.href = '#' + anchor;
      wrapper.onclick = function (e) {
        e.preventDefault();
        comment.scrollToAndHighlightTarget(false);
      };

      const destination = area.querySelector('#mw-diff-otitle3, #mw-diff-ntitle3');
      if (!destination) return;
      destination.appendChild(wrapper);
    }
  });

  /**
   * Comments links have been created.
   *
   * @event commentLinksCreated
   * @type {module:cd~convenientDiscussions}
   */
  mw.hook('convenientDiscussions.commentLinksCreated').fire(cd);

  processDiffFirstRun = false;
}

/**
 * Add comment links to the page.
 *
 * @param {JQuery} $content
 * @private
 */
async function addCommentLinks($content) {
  // Occurs in the watchlist when mediawiki.rcfilters.filters.ui module for some reason fires
  // wikipage.content for the second time with an element that is not in the DOM,
  // fieldset#mw-watchlist-options (in the mw.rcfilters.ui.FormWrapperWidget#onChangesModelUpdate
  // function).
  if (!$content.parent().length) return;

  if (['Recentchanges', 'Watchlist'].includes(mw.config.get('wgCanonicalSpecialPageName'))) {
    processWatchlist($content);
  } else if (mw.config.get('wgCanonicalSpecialPageName') === 'Contributions') {
    processContributions($content);
  } else if (mw.config.get('wgAction') === 'history' && cd.g.CURRENT_PAGE.isProbablyTalkPage()) {
    processHistory($content);
  }

  mw.hook('convenientDiscussions.commentLinksCreated').fire(cd);
}

/**
 * The entry function for the comment links adding mechanism.
 *
 * @param {object} [data] Data passed from the main module.
 */
export default async function commentLinks({ messagesRequest }) {
  try {
    await prepare({ messagesRequest });
  } catch (e) {
    console.warn(...e);
    return;
  }

  if (cd.g.IS_DIFF_PAGE) {
    mw.hook('convenientDiscussions.pageReady').add(processDiff);
  } else {
    // Hook on wikipage.content to make the code work with the watchlist auto-update feature.
    mw.hook('wikipage.content').add(addCommentLinks);
  }
}
