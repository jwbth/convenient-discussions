/**
 * Module loaded on pages where we add comment links to history entries (sometimes more).
 *
 * @module addCommentLinks
 */

import PrototypeRegistry from './PrototypeRegistry';
import bootManager from './bootManager';
import cd from './cd';
import { definedAndNotNull, generatePageNamePattern, isProbablyTalkPage, isUndo, removeDirMarks, spacesToUnderlines } from './shared/utils-general';
import { parseTimestamp } from './shared/utils-timestamp';
import { initDayjs } from './utils-window';

/** @type {string} */
let colon;
/** @type {string | undefined} */
let moveFromBeginning;
/** @type {string | undefined} */
let moveToBeginning;
/** @type {string} */
let goToCommentToYou;
/** @type {string} */
let goToCommentWatchedSection;
/** @type {RegExp} */
let currentUserRegexp;
/** @type {import('./LegacySubscriptions').default | undefined} */
let subscriptions;

/**
 * @type {PrototypeRegistry<{
 *   wrapperRegular: HTMLElement
 *   wrapperRelevant: HTMLElement
  }>} */
const prototypes = new PrototypeRegistry();

/**
 * Initialize variables.
 *
 * @private
 */
async function init() {
  const settings = (await import('./settings')).default;

  // This could have been executed from init.talkPage() already.
  bootManager.initGlobals();
  await settings.init();

  /** @type {PromiseLike<any>[]} */
  const requests = [...bootManager.getSiteData()];
  if (cd.user.isRegistered() && !settings.get('useTopicSubscription')) {
    // Loading the subscriptions is not critical, as opposed to messages, so we catch the possible
    // error, not letting it be caught by the try/catch block.
    subscriptions = /** @type {import('./LegacySubscriptions').default} */ (
      (await import('./pageController')).default.getSubscriptionsInstance()
    );
    requests.push(subscriptions.load(undefined, true).catch(() => {}));
  }

  try {
    await Promise.all(requests);
  } catch (error) {
    throw new Error(`Couldn't load the data required for the script.`, { cause: error });
  }

  mw.loader.addStyleTag(`:root {
    --cd-parentheses-start: '${cd.mws('parentheses-start')}';
    --cd-parentheses-end: '${cd.mws('parentheses-end')}';
  }`);

  colon = cd.mws('colon-separator', { language: 'content' }).trim();
  [moveFromBeginning] = cd.s('es-move-from').match(/^[^[$]+/) || [];
  [moveToBeginning] = cd.s('es-move-to').match(/^[^[$]+/) || [];

  goToCommentToYou = goToCommentWatchedSection = cd.s('lp-comment-tooltip') + ' ';
  goToCommentToYou += cd.mws('parentheses', cd.s('lp-comment-toyou'));
  goToCommentWatchedSection += cd.mws('parentheses', cd.s('lp-comment-watchedsection'));

  // eslint-disable-next-line no-one-time-vars/no-one-time-vars
  const $aRegularPrototype = $('<a>')
    .text(cd.s('lp-comment'))
    .attr('title', cd.s('lp-comment-tooltip'));
  // eslint-disable-next-line no-one-time-vars/no-one-time-vars
  const $spanRegularPrototype = $('<span>')
    .addClass('cd-commentLink-innerWrapper')
    .append($aRegularPrototype);
  const $wrapperRegularPrototype = $('<span>')
    .addClass('cd-commentLink')
    .append($spanRegularPrototype)
    .prepend(' ');
  prototypes.add('wrapperRegular', $wrapperRegularPrototype[0]);
  prototypes.add(
    'wrapperRelevant',
    $wrapperRegularPrototype
      .clone()
      .addClass('cd-commentLink-relevant')[0]
  );

  const currentUserNamePattern = generatePageNamePattern(cd.g.userName);
  currentUserRegexp = new RegExp(
    `(?:^|[^${cd.g.letterPattern}])${currentUserNamePattern}(?![${cd.g.letterPattern}])`
  );
}

/**
 * Show/hide relevant edits.
 *
 * @param {OO.ui.ButtonWidget} switchRelevantButton
 * @private
 */
function switchRelevant(switchRelevantButton) {
  // This is for many watchlist types at once.
  const $collapsibles = bootManager.$content
    .find('.mw-changeslist .mw-collapsible:not(.mw-changeslist-legend)');
  const $lines = bootManager.$content.find('.mw-changeslist-line:not(table)');

  if (switchRelevantButton.hasFlag('progressive')) {
    // Show all
    // FIXME: Old watchlist (no JS) + ?enhanced=1&urlversion=2

    // Check if item grouping switched on. This may be done in the settings or via the URL parameter.
    if ($('.mw-changeslist').find('ul.special').length) {
      $lines
        .not(':has(.cd-commentLink-relevant)')
        .show();
    } else {
      $lines
        .filter('table')
        .show();
    }
    $collapsibles
      .not(':has(.cd-commentLink-relevant)')
      .find('.mw-rcfilters-ui-highlights-enhanced-toplevel')
      .show();
    $collapsibles
      .not('.mw-collapsed')
      .find('.mw-enhancedchanges-arrow')
      .trigger('click');
  } else {
    // Show relevant only
    $collapsibles
      .not('.mw-collapsed')
      .find('.mw-enhancedchanges-arrow')
      .trigger('click');
    $collapsibles
      .has('.cd-commentLink-relevant')
      .find('.mw-enhancedchanges-arrow')
      .trigger('click');
    $collapsibles
      .not(':has(.cd-commentLink-relevant)')
      .find('.mw-rcfilters-ui-highlights-enhanced-toplevel')
      .hide();
    $lines
      .not(':has(.cd-commentLink-relevant)')
      .hide();
  }
  switchRelevantButton.setFlags({ progressive: !switchRelevantButton.hasFlag('progressive') });
}

/**
 * Add watchlist menu (a block with buttons).
 *
 * @private
 */
function addWatchlistMenu() {
  if (!subscriptions) return;

  // For auto-updating watchlists
  mw.hook('wikipage.content').add(() => {
    switchRelevantButton.setFlags({ progressive: false });
  });

  const $menu = $('<div>').addClass('cd-watchlistMenu');
  $('<a>')
    .attr('href', mw.util.getUrl(cd.config.scriptPageWikilink))
    .attr('target', '_blank')
    .addClass('cd-watchlistMenu-scriptPageLink')
    .text(cd.s('script-name-short'))
    .appendTo($menu);

  const switchRelevantButton = new OO.ui.ButtonWidget({
    framed: false,
    icon: 'speechBubble',
    label: cd.s('wl-button-switchrelevant-tooltip', mw.user),
    invisibleLabel: true,
    title: cd.s('wl-button-switchrelevant-tooltip', mw.user),
    classes: ['cd-watchlistMenu-button', 'cd-watchlistMenu-button-switchRelevant'],
    disabled: !subscriptions.areLoaded(),
  });
  switchRelevantButton.on('click', () => {
    switchRelevant(switchRelevantButton);
  });
  switchRelevantButton.$element.appendTo($menu);

  const editSubscriptionsButtonConfig = {
    framed: false,
    icon: 'listBullet',
    label: cd.s('wl-button-editwatchedsections-tooltip', mw.user),
    invisibleLabel: true,
    title: cd.s('wl-button-editwatchedsections-tooltip', mw.user),
    classes: ['cd-watchlistMenu-button', 'cd-watchlistMenu-button-editSubscriptions'],
  };
  const editSubscriptionsButton = new OO.ui.ButtonWidget(editSubscriptionsButtonConfig);
  editSubscriptionsButton.on('click', () => {
    bootManager.showEditSubscriptionsDialog();
  });
  editSubscriptionsButton.$element.appendTo($menu);

  const settingsButton = new OO.ui.ButtonWidget({
    framed: false,
    icon: 'settings',
    label: cd.s('wl-button-settings-tooltip'),
    invisibleLabel: true,
    title: cd.s('wl-button-settings-tooltip'),
    classes: ['cd-watchlistMenu-button', 'cd-watchlistMenu-button-scriptSettings'],
  });
  settingsButton.on('click', async () => {
    initDayjs();
    (await import('./settings')).default.showDialog();
  });
  settingsButton.$element.appendTo($menu);

  // New watchlist
  bootManager.$content.find('.mw-rcfilters-ui-changesLimitAndDateButtonWidget').prepend($menu);

  // Old watchlist
  bootManager.$content.find('#mw-watchlist-options .mw-changeslist-legend').after($menu);
}

/**
 * Whether the provided link element points to a Wikidata item.
 *
 * @param {Element} linkElement
 * @returns {boolean}
 * @private
 */
function isWikidataItem(linkElement) {
  return Boolean(
    cd.g.serverName === 'www.wikidata.org' &&
    linkElement.firstElementChild?.classList.contains('wb-itemlink')
  );
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
 * Given a wrapper element of any known kind, change an attribute on its link element.
 *
 * @param {HTMLElement} wrapper
 * @param {string} attr
 * @param {string} value
 */
function setWrapperLinkAttr(wrapper, attr, value) {
  // eslint-disable-next-line no-one-time-vars/no-one-time-vars
  const linkElement = /** @type {HTMLAnchorElement} */ (
    /** @type {HTMLElement} */ (wrapper.lastChild).lastChild
  );
  linkElement.setAttribute(attr, value);
}

/**
 * Check by an edit summary if an edit is probably a move performed by our script.
 *
 * @param {string} summary
 * @returns {boolean}
 * @private
 */
function isMoved(summary) {
  return Boolean(
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
 * Check by an edit summary if it is an edit in a section with given name.
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
  return cd.g.contentDirection === 'ltr'
    ? summary.includes(`→${name}${colon}`) || summary.endsWith(`→${name}`)
    : summary.includes(`←${name}${colon}`) || summary.endsWith(`←${name}`);
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
    !bootManager.$content.find('.cd-watchlistMenu').length
  ) {
    if (mw.user.options.get('wlenhancedfilters-disable')) {
      addWatchlistMenu();
    } else {
      mw.hook('structuredChangeFilters.ui.initialized').add(() => {
        addWatchlistMenu();
      });
    }

    if (subscriptions) {
      $('.mw-rcfilters-ui-filterWrapperWidget-showNewChanges a').on('click', async () => {
        // Reload in case the subscription list has changed (which should be a pretty common
        // occasion)
        await /** @type {NonNullable<typeof subscriptions>} */ (subscriptions).load();
      });
    }
  }

  // There are 2 ^ 3 = 8 (!) different watchlist modes:
  // * expanded and not (Special:Preferences#mw-prefsection-watchlist "Expand watchlist to show all
  //   changes, not just the most recent")
  // * with item grouping and without (Special:Preferences#mw-prefsection-rc "Group changes by page
  //   in recent changes and watchlist")
  // * with enhanced fitlers and without (Special:Preferences#mw-prefsection-watchlist "Use
  //   non-JavaScript interface")
  // eslint-disable-next-line no-one-time-vars/no-one-time-vars
  const lines = /** @type {NodeListOf<HTMLElement>} */ (
    $content[0].querySelectorAll('.mw-changeslist-line[data-mw-revid]')
  );
  lines.forEach((lineOrBareTr) => {
    const line = lineOrBareTr.className
      ? lineOrBareTr
      : /** @type {HTMLElement} */ (
          /** @type {HTMLElement} */ (lineOrBareTr.parentElement).parentElement
        );
    const nsMatch = line.className.match(/mw-changeslist-ns(\d+)/);
    const nsNumber = nsMatch && Number(nsMatch[1]);
    if (nsNumber === null) return;

    const linkElement = /** @type {HTMLAnchorElement | undefined} */ (
      (line.tagName === 'TR' ? /** @type {HTMLElement} */ (line.parentElement) : line).querySelector(
        '.mw-changeslist-title'
      )
    );
    if (!linkElement || isWikidataItem(linkElement)) return;

    if (!isProbablyTalkPage(linkElement.textContent, nsNumber)) return;

    if (line.querySelector('.minoredit')) return;

    let summary = line.querySelector('.comment')?.textContent;
    summary &&= removeDirMarks(summary);
    if (summary && (isCommentEdit(summary) || isUndo(summary) || isMoved(summary))) return;

    const bytesAddedElement = line.querySelector('.mw-plusminus-pos');
    if (!bytesAddedElement) return;

    if (bytesAddedElement.tagName !== 'STRONG') {
      const bytesAddedMatch = bytesAddedElement.textContent.match(/\d+/);
      const bytesAdded = bytesAddedMatch && Number(bytesAddedMatch[0]);
      if (!bytesAdded || bytesAdded < cd.config.bytesToDeemComment) return;
    }

    const timestamp = line.dataset.mwTs?.slice(0, 12);
    if (!timestamp) return;

    const author = extractAuthor(line);
    if (!author) return;

    const id = timestamp + '_' + spacesToUnderlines(author);

    const link = linkElement.href;
    if (!link) return;

    let wrapper;
    if (summary && currentUserRegexp.test(` ${summary} `)) {
      wrapper = prototypes.get('wrapperRelevant');
      setWrapperLinkAttr(wrapper, 'title', goToCommentToYou);
    } else {
      if (summary) {
        const curLink = (
          // Expanded watchlist
          line.querySelector('.mw-changeslist-diff-cur') ||

          // Non-expanded watchlist
          line.querySelector('.mw-changeslist-history')
        );
        const curIdMatch =
          curLink instanceof HTMLAnchorElement ? curLink.href.match(/[&?]curid=(\d+)/) : undefined;
        const curId = curIdMatch && Number(curIdMatch[1]);
        if (
          curId &&
          (subscriptions?.getForPageId(curId) || []).some((headline) =>
            isInSection(summary, headline)
          )
        ) {
          wrapper = prototypes.get('wrapperRelevant');
          setWrapperLinkAttr(wrapper, 'title', goToCommentWatchedSection);
        }
      }
      wrapper ??= prototypes.get('wrapperRegular');
    }

    setWrapperLinkAttr(wrapper, 'href', `${link}#${id}`);

    const destination = line.querySelector('.comment') || line.querySelector('.mw-usertoollinks');
    if (!destination) return;

    /** @type {HTMLElement} */ (destination.parentElement).insertBefore(
      wrapper,
      destination.nextSibling
    );
  });
}

/**
 * Check by an edit summary if an edit is probably an edit of a comment.
 *
 * @param {string} summary
 * @returns {boolean}
 */
function isCommentEdit(summary) {
  return Boolean(
    summary &&
    (
      summary.includes(`${cd.s('es-edit')} ${cd.s('es-reply-genitive')}`) ||
      summary.includes(`${cd.s('es-edit')} ${cd.s('es-addition-genitive')}`)
    )
  );
}

/**
 * Add comment links to a contributions page.
 *
 * @param {JQuery} $content
 * @private
 */
async function processContributions($content) {
  await bootManager.initTimestampParsingTools('user');
  if (cd.g.uiTimezone === undefined) return;

  const Comment = (await import('./Comment')).default;
  const pageRegistry = (await import('./pageRegistry')).default;

  [
    ...$content[0].querySelectorAll('.mw-contributions-list > li:not(.mw-tag-mw-new-redirect)'),
  ].forEach((line) => {
    const linkElement = /** @type {HTMLAnchorElement | null} */ (
      line.querySelector('.mw-contributions-title')
    );
    if (!linkElement || isWikidataItem(linkElement)) return;

    const page = pageRegistry.get(linkElement.textContent, true);
    if (!page?.isProbablyTalkPage()) return;

    const link = linkElement.href;
    if (!link) return;

    if (line.querySelector('.minoredit')) return;

    let summary = line.querySelector('.comment')?.textContent;
    summary &&= removeDirMarks(summary);
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

    const { date } = parseTimestamp(dateElement.textContent, cd.g.uiTimezone) || {};
    if (!date) return;

    const id = Comment.generateId(date, mw.config.get('wgRelevantUserName') || undefined);
    if (!id) return;

    let wrapper;
    if (summary && currentUserRegexp.test(` ${summary} `)) {
      wrapper = prototypes.get('wrapperRelevant');
      setWrapperLinkAttr(wrapper, 'title', goToCommentToYou);
    } else {
      // We have no place to extract the article ID from :-(
      wrapper = prototypes.get('wrapperRegular');
    }
    setWrapperLinkAttr(wrapper, 'href', `${link}#${id}`);

    let destination = line.querySelector('.comment');
    if (!destination) {
      destination = linkElement;
      if (destination.nextSibling) {
        destination.nextSibling.textContent = destination.nextSibling.textContent.replace(/^\s/, '');
      }
    }
    /** @type {HTMLElement} */ (destination.parentElement).insertBefore(
      wrapper,
      destination.nextSibling
    );
  });
}

/**
 * Add comment links to a history page.
 *
 * @param {JQuery} $content
 * @private
 */
async function processHistory($content) {
  await bootManager.initTimestampParsingTools('user');
  if (cd.g.uiTimezone === undefined) return;

  const Comment = (await import('./Comment')).default;

  const link = cd.page.getUrl();
  [
    ...$content[0]
      .querySelectorAll('#pagehistory > li, #pagehistory > .mw-contributions-list > li:not(.mw-tag-mw-new-redirect)'),
  ].forEach((line) => {
    if (line.querySelector('.minoredit')) return;

    let summary = line.querySelector('.comment')?.textContent;
    summary &&= removeDirMarks(summary);
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

    const { date } = parseTimestamp(dateElement.textContent, cd.g.uiTimezone) || {};
    if (!date) return;

    const author = extractAuthor(line);
    if (!author) return;

    const id = Comment.generateId(date, author);

    let wrapper;
    if (summary && currentUserRegexp.test(` ${summary} `)) {
      wrapper = prototypes.get('wrapperRelevant');
      setWrapperLinkAttr(wrapper, 'title', goToCommentToYou);
    } else {
      if (
        summary &&
        (subscriptions?.getForCurrentPage() || []).some((headline) =>
          isInSection(summary, headline)
        )
      ) {
        wrapper = prototypes.get('wrapperRelevant');
        setWrapperLinkAttr(wrapper, 'title', goToCommentWatchedSection);
      }
      wrapper ??= prototypes.get('wrapperRegular');
    }
    setWrapperLinkAttr(wrapper, 'href', `${link}#${id}`);

    const destination =
      line.querySelector('.comment') ||
      [...line.querySelectorAll('.mw-changeslist-separator')].at(-1);
    if (!destination) return;

    /** @type {HTMLElement} */ (destination.parentElement).insertBefore(
      wrapper,
      destination.nextSibling
    );
  });
}

/**
 * Add a comment link to a diff view.
 *
 * @param {JQuery} [$diff]
 * @fires commentLinksAdded
 * @private
 */
async function processDiff($diff) {
  const pageController = (await import('./pageController')).default;

  // Filter out cases when wikipage.diff was fired for the native MediaWiki's diff at the top of
  // the page that is a diff page (unless only a diff, and no content, is displayed - if
  // mw.user.options.get('diffonly') or the `diffonly` URL parameter is true). We parse that diff on
  // convenientDiscussions.pageReady hook instead.
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if ($diff?.parent().is(bootManager.$content) && pageController.$root) return;

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (!cd.g.uiTimestampRegexp) {
    await bootManager.initTimestampParsingTools('user');
  }
  if (cd.g.uiTimezone === undefined) return;

  const Comment = (await import('./Comment')).default;
  const pageRegistry = (await import('./pageRegistry')).default;
  const commentManager = (await import('./commentManager')).default;

  const $root = $diff || bootManager.$content;
  const root = $root[0];
  [root.querySelector('.diff-otitle'), root.querySelector('.diff-ntitle')]
    .filter(definedAndNotNull)
    .forEach((area) => {
      if (area.querySelector('.minoredit')) return;

      area.querySelector('.cd-commentLink')?.remove();

      let summary = area.querySelector('.comment')?.textContent;
      summary &&= removeDirMarks(summary);

      // In diffs, archivation can't be captured by looking at bytes added.
      if (
        summary &&
        (isCommentEdit(summary) || isUndo(summary) || isMoved(summary) || isArchiving(summary))
      ) {
        return;
      }

      const dateElement = /** @type {HTMLAnchorElement | null} */ (
        area.querySelector('#mw-diff-otitle1 a, #mw-diff-ntitle1 a')
      );
      if (!(dateElement)) return;

      const { date } = parseTimestamp(dateElement.textContent, cd.g.uiTimezone) || {};
      if (!date) return;

      const author = extractAuthor(area);
      if (!author) return;

      const id = Comment.generateId(date, author);

      /** @type {import('./Comment').default | undefined} */
      let comment;
      let page;
      if ($diff) {
        const title = (new URL(dateElement.href)).searchParams.get('title');
        if (!title) return;

        page = pageRegistry.get(title, true);
        if (!page) return;
      } else {
        comment = commentManager.getById(id, true);
      }
      if (comment || page?.isProbablyTalkPage()) {
        let wrapper;
        if (summary && currentUserRegexp.test(` ${summary} `)) {
          wrapper = prototypes.get('wrapperRelevant');
          setWrapperLinkAttr(wrapper, 'title', goToCommentToYou);
        } else {
          if (
            !$diff &&
            summary &&
            (subscriptions?.getForCurrentPage() || []).some((headline) =>
              isInSection(summary, headline)
            )
          ) {
            wrapper = prototypes.get('wrapperRelevant');
            setWrapperLinkAttr(wrapper, 'title', goToCommentWatchedSection);
          }
          wrapper ??= prototypes.get('wrapperRegular');
        }

        const linkElement = /** @type {HTMLAnchorElement} */ (
          /** @type {HTMLElement} */ (wrapper.lastChild).lastChild
        );
        if (page) {
          linkElement.href = page.getUrl() + '#' + id;

          // Non-diff pages that have a diff, like with Serhio Magpie's Instant Diffs.
          if (bootManager.isPageOfType('talk')) {
            linkElement.target = '_blank';
          }
        } else {
          linkElement.href = '#' + id;
          linkElement.addEventListener('click', (event) => {
            event.preventDefault();
            /** @type {NonNullable<typeof comment>} */ (comment).scrollTo({
              smooth: false,
              pushState: true,
              expandThreads: true,
            });
          });
        }

        const destination = area.querySelector('#mw-diff-otitle3, #mw-diff-ntitle3');
        if (!destination) return;

        destination.append(wrapper);
      }
    });

  /**
   * Comments links have been added to the revisions listed on the page.
   *
   * @event commentLinksAdded
   * @param {JQuery} $root Root element of content to which the comment links were added.
   * @param {object} cd {@link convenientDiscussions} object.
   * @global
   */
  mw.hook('convenientDiscussions.commentLinksAdded').fire($root, cd);
}

/**
 * Add comment links to the revisions listed on the page that is a revision list page (not a diff
 * page, for instance).
 *
 * @param {JQuery} $content
 * @private
 */
function processRevisionListPage($content) {
  // Occurs in the watchlist when mediawiki.rcfilters.filters.ui module for some reason fires
  // wikipage.content for the second time with an element that is not in the DOM,
  // fieldset#mw-watchlist-options (in the mw.rcfilters.ui.FormWrapperWidget#onChangesModelUpdate
  // function).
  if (!$content.parent().length) return;

  if (bootManager.isPageOfType('watchlist')) {
    processWatchlist($content);
  } else if (bootManager.isPageOfType('contributions')) {
    processContributions($content);
  } else if (bootManager.isPageOfType('history')) {
    processHistory($content);
  }

  mw.hook('convenientDiscussions.commentLinksAdded').fire($content, cd);
}

/**
 * _For internal use._ The entry function for the comment links adding mechanism.
 */
export default async function addCommentLinks() {
  try {
    await init();
  } catch (error) {
    console.warn(error);

    return;
  }

  if (bootManager.isPageOfType('diff')) {
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
 * _For internal use._ When on the Special:Search page, searching for a comment after choosing that
 * option from the "Couldn't find the comment" message, add comment links to titles.
 */
export function addCommentLinksToSpecialSearch() {
  if (mw.config.get('wgCanonicalSpecialPageName') !== 'Search') return;

  const [, commentId] = location.search.match(/[?&]cdcomment=([^&]+)(?:&|$)/) || [];
  if (commentId) {
    mw.loader.using('mediawiki.api').then(
      async () => {
        await Promise.all(bootManager.getSiteData());
        $('.mw-search-result-heading').each((_, el) => {
          const originalHref = $(el)
            .find('a')
            .first()
            .attr('href');
          if (!originalHref) return;

          $(el).append(
            ' ',
            $('<span>')
              .addClass('cd-searchCommentLink')
              .append(
                document.createTextNode(cd.mws('parentheses-start')),
                $('<a>')
                  .attr('href', `${originalHref}#${commentId}`)
                  .text(cd.s('deadanchor-search-gotocomment')),
                document.createTextNode(cd.mws('parentheses-end')),
              )
          );
        });
      },
      console.error
    );
  }
}
