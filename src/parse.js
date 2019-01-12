import debug from './debug';
import Msg from './Msg';
import Section from './Section';
import MsgForm from './MsgForm';

export default function parse(msgAnchorToScrollTo) {
  if (cd.env.firstRun) {
    debug.endTimer('загрузка модулей');
  } else {
    debug.endTimer('заливка HTML');
  }

  debug.startTimer('приготовления');


  /* Preparation */

  const $parserOutput = cd.env.$content.children('.mw-parser-output');
  if ($parserOutput.length) {
    cd.env.$content = $parserOutput;
    cd.env.contentElement = $parserOutput[0];
  } else {
    cd.env.contentElement = cd.env.$content[0];
  }

  cd.msgs = [];
  cd.sections = [];
  cd.msgForms = [];

  // Settings in variables like cdAlowEditOthersMsgs
  ['allowEditOthersMsgs', 'closerTemplate', 'defaultCopyLinkType', 'mySig', 'slideEffects',
    'showLoadingOverlay']
    .forEach((name) => {
      const settingName = 'cd' + name[0].toUpperCase() + name.slice(1);
      if (settingName in window) {
        cd.settings[name] = window[settingName];
      }
    });

  // We fill the settings after the modules are loaded so that user settings had more chance
  // to load.
  cd.defaultSettings = {
    allowEditOthersMsgs: false,
    alwaysExpandSettings: false,
    closerTemplate: '{{\subst:ПИ}}',
    defaultCopyLinkType: 'wikilink',  // 'wikilink', 'link', 'discord'
    mySig: '~~\~~',
    slideEffects: true,
    showLoadingOverlay: true,
    storeDataOnServer: true,
  };

  cd.settings = $.extend({}, cd.defaultSettings, cd.settings || {});

  const highlightLastMessagesEnabled = typeof highlightMessagesAfterLastVisit !== 'undefined';
  if (cd.settings.highlightNew && highlightLastMessagesEnabled) {
    // Suppress the work of [[Участник:Кикан/highlightLastMessages.js]] in possible ways.
    highlightMessagesAfterLastVisit = false;
    highlightMessages = 0;
  }

  cd.env.createWindowManager();

  if (!cd.env.MSG_REPLY_BUTTON_PROTOTYPE) {  // Saves a little time.
    cd.env.MSG_UP_BUTTON_PROTOTYPE = new OO.ui.ButtonWidget({
      label: '▲',
      title: 'Перейти к родительскому сообщению',
      framed: false,
      classes: ['cd-msgButton'],
    }).$element[0];
    cd.env.MSG_EDIT_BUTTON_PROTOTYPE = new OO.ui.ButtonWidget({
      label: 'Редактировать',
      framed: false,
      classes: ['cd-msgButton'],
    }).$element[0];
    cd.env.MSG_REPLY_BUTTON_PROTOTYPE = new OO.ui.ButtonWidget({
      label: 'Ответить',
      framed: false,
      classes: ['cd-msgButton'],
    }).$element[0];
    cd.env.MSG_LINK_BUTTON_PROTOTYPE = new OO.ui.ButtonWidget({
      label: '#',
      title: 'Нажмите, чтобы скопировать вики-ссылку. Нажмите с зажатым Ctrl, чтобы выбрать другой вид ссылки.',
      framed: false,
      classes: ['cd-msgButton'],
    }).$element[0];
    cd.env.SECTION_REPLY_BUTTON_PROTOTYPE = new OO.ui.ButtonWidget({
      label: 'Ответить',
      framed: false,
      classes: ['cd-sectionButton'],
    }).$element[0];
    cd.env.SECTION_ADDSUBSECTION_BUTTON_PROTOTYPE = new OO.ui.ButtonWidget({
      label: 'Добавить подраздел',
      framed: false,
      classes: ['cd-sectionButton'],
    }).$element[0];

    cd.env.UNDERLAYER_PROTOTYPE = document.createElement('div');
    cd.env.UNDERLAYER_PROTOTYPE.className = 'cd-underlayer';

    cd.env.LINKS_UNDERLAYER_PROTOTYPE = document.createElement('div');
    cd.env.LINKS_UNDERLAYER_PROTOTYPE.className = 'cd-linksUnderlayer';

    const LINKS_UNDERLAYER_WRAPPER = document.createElement('div');
    LINKS_UNDERLAYER_WRAPPER.className = 'cd-linksUnderlayer-wrapper';
    cd.env.LINKS_UNDERLAYER_PROTOTYPE.appendChild(LINKS_UNDERLAYER_WRAPPER);

    const LINKS_UNDERLAYER_GRADIENT = document.createElement('div');
    LINKS_UNDERLAYER_GRADIENT.textContent = ' ';
    LINKS_UNDERLAYER_GRADIENT.className = 'cd-linksUnderlayer-gradient';
    LINKS_UNDERLAYER_WRAPPER.appendChild(LINKS_UNDERLAYER_GRADIENT);

    const LINKS_UNDERLAYER_TEXT = document.createElement('div');
    LINKS_UNDERLAYER_TEXT.className = 'cd-linksUnderlayer-text';
    LINKS_UNDERLAYER_WRAPPER.appendChild(LINKS_UNDERLAYER_TEXT);
  }

  cd.env.CURRENT_USER_SIG = mw.user.options.get('nickname');

  const authorInSigMatches = cd.env.CURRENT_USER_SIG.match(new RegExp(cd.config.USER_NAME_PATTERN));
  if (authorInSigMatches) {
    // Signature contents before the user name – in order to cut it out from the message endings
    // when editing.
    cd.env.CURRENT_USER_SIG_PREFIX_REGEXP = new RegExp(
      (cd.settings.mySig === cd.defaultSettings.mySig || !cd.settings.mySig.includes('~~\~') ?
        '' :
        mw.RegExp.escape(cd.settings.mySig.slice(0, cd.settings.mySig.indexOf('~~\~')))
      ) +
      mw.RegExp.escape(cd.env.CURRENT_USER_SIG.slice(0, authorInSigMatches.index)) + '$'
    );
  }

  const POPULAR_NOT_INLINE_ELEMENTS = ['P', 'OL', 'UL', 'LI', 'PRE', 'BLOCKQUOTE', 'DL', 'DD',
    'DIV', 'HR', 'H2', 'H3', 'H4', 'H5', 'H6', 'TABLE', 'INPUT', 'FORM'];
  const POPULAR_INLINE_ELEMENTS = ['A', 'SMALL', 'B', 'STRONG', 'I', 'EM', 'U', 'S', 'SPAN', 'CODE',
    'TT', 'KBD', 'BR', 'IMG', 'SUP', 'SUB', 'ABBR', 'CITE'];
  cd.env.PNIE_PATTERN = `(?:${POPULAR_NOT_INLINE_ELEMENTS.join('|')})`;

  cd.env.EVERYTHING_MUST_BE_FROZEN = !!(
    cd.env.CURRENT_PAGE.includes('/Архив') ||
    ((/[?&]diff=[^&]/.test(location.search) ||
        /[?&]oldid=[^&]/.test(location.search)
      ) &&
      mw.config.get('wgRevisionId') !== mw.config.get('wgCurRevisionId')
    )
  );

  const msgAntipatternPatternParts = [];
  // true relates to '-- ?\\[\\[Участник:DimaBot\\|DimaBot\\]\\]'
  if (cd.config.BLOCKS_TO_EXCLUDE_CLASSES || cd.config.TEMPLATES_TO_EXCLUDE || true) {
    if (cd.config.BLOCKS_TO_EXCLUDE_CLASSES) {
      msgAntipatternPatternParts.push(
        'class=([\\\'"])[^\\1]*(?:\\b' + cd.config.BLOCKS_TO_EXCLUDE_CLASSES.join('\\b|\\b') +
        '\\b)[^\\1]*\\1'
      );
    }
    if (cd.config.TEMPLATES_TO_EXCLUDE) {
      msgAntipatternPatternParts.push('\\{\\{ *(?:' +
        cd.config.TEMPLATES_TO_EXCLUDE
          .map(template => cd.env.generateCaseInsensitiveFirstCharPattern(template))
          .join('|') +
        ') *(?:\\||\\}\\})');
    }
    cd.config.MSG_ANTIPATTERNS.forEach((antiPattern) => {
      msgAntipatternPatternParts.push(antiPattern);
    });
    cd.env.MSG_ANTIPATTERN_REGEXP = new RegExp(
      `(?:${msgAntipatternPatternParts.join('|')}).*\\n$`
    );
  }


  /* Save the viewport position */

  let firstVisibleElement;
  let firstVisibleElementTopOffset;
  if (cd.env.firstRun) {
    if (window.pageYOffset !== 0 && cd.env.contentElement.getBoundingClientRect().top <= 0) {
      let currentElement = cd.env.contentElement.firstElementChild;
      while (currentElement) {
        if (POPULAR_NOT_INLINE_ELEMENTS.includes(currentElement.tagName)) {
          const rect = currentElement.getBoundingClientRect();
          if (rect.bottom >= 0 &&
            rect.height !== 0
          ) {
            firstVisibleElement = currentElement;
            firstVisibleElementTopOffset = rect.top;

            const child = currentElement.firstElementChild;
            if (child) {
              currentElement = child;
              continue;
            } else {
              break;
            }
          }
        }

        currentElement = currentElement.nextElementSibling;
      }
    }
  }


  /* Process the fragment (hash) for topic titles */

  const processFragment = (fragment) => {
    const dotToPercent = code => code.replace(/\.([0-9A-F][0-9A-F])/g, '%$1');

    // Some ancient links with dots, you never know
    fragment = fragment
      .replace(/(^|[^0-9A-F\.])(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)/g, '$1$2,$3,$4,$5')  // Hide IP
      .replace(/\.F[0-4]\.[89AB][\dA-F]\.[89AB][\dA-F]\.[89AB][\dA-F]/g, dotToPercent)
      .replace(/\.E[\dA-F]\.[89AB][\dA-F]\.[89AB][\dA-F]/g, dotToPercent)
      .replace(/\.[CD][\dA-F]\.[89AB][\dA-F]/g, dotToPercent)
      .replace(/\.[2-7][0-9A-F]/g, (code) => {
        const ch = decodeURIComponent(dotToPercent(code));
        if ('!"#$%&\'()*+,/;<=>?@\\^`~'.includes(ch)) {
          return dotToPercent(code);
        } else {
          return code;
        }
      })
      .replace(/(^|[^0-9A-F\.])(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?),(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?),(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?),(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)/g, '$1$2.$3.$4.$5')  // Restore IP
      .replace(/_/g, ' ');

    try {
      fragment = decodeURIComponent(fragment);
    } catch (e) {
      console.error(e.stack);
      return;
    }

    return fragment.trim();
  };

  const proceedToArchiveDialog = () => {
    const messageDialog = new OO.ui.MessageDialog();
    $('body').append(cd.env.windowManager.$element);
    cd.env.windowManager.addWindows([messageDialog]);

    const proceedToArchiveWindow = cd.env.windowManager.openWindow(messageDialog, {
      message: $(
        '<div style="text-align:center;"><p style="margin-top:0;">' +
        '<span style="color:#c61313;">Тема не найдена.</span> Она могла быть переименована или уйти в архив.' +
        '</p><p style="font-size:125%;">Поискать в архиве?</p></div>'
      ),
      actions: [
        { label: 'Да', action: 'yes' },
        { label: 'Нет', action: 'no' },
      ],
    });
    proceedToArchiveWindow.closed.then((data) => {
      if (data && data.action === 'yes') {
        const heading = processFragment(fragment).replace(/"/g, '');
        const PAGE_TITLE = mw.config.get('wgTitle');
        let archivePrefix;
        if (PAGE_TITLE.indexOf('Форум/') === 0) {
          if (PAGE_TITLE.indexOf('Форум/Географический') === 0) {
            archivePrefix = 'Форум/Географический/Архивы';
          } else {
            archivePrefix = 'Форум/Архив/' + PAGE_TITLE.slice(6);
          }
        } else {
          archivePrefix = PAGE_TITLE;
        };
        const searchQuery = `"${heading}" prefix:` +
          mw.config.get('wgFormattedNamespaces')[cd.env.NAMESPACE_NUMBER] + ':' + archivePrefix;
        const url = mw.util.getUrl('Служебная:Поиск', {
          profile: 'default',
          fulltext: 'Search',
          search: searchQuery,
        });
        location.assign(mw.config.get('wgServer') + url);
      }
    });
  };

  const fragment = location.hash.slice(1);
  let decodedFragment;
  try {
    decodedFragment = decodeURIComponent(fragment);
  } catch (e) {
    console.error(e.stack);
  }
  const escapedFragment = $.escapeSelector(fragment);
  const escapedDecodedFragment = decodedFragment && $.escapeSelector(decodedFragment);
  const isMsgFragment = /^\d{12}_.+$/.test(fragment);

  // Except for nomination pages that have no archives
  if (!window.proceedToArchiveHasRun &&  // So that there weren't two copies
    fragment &&
    decodedFragment &&
    !isMsgFragment &&
    !cd.env.CURRENT_PAGE.includes('/Архив') &&
    !/^Википедия:(К удалению|К восстановлению|К переименованию|К объединению|К разделению|К улучшению)\//
      .test(cd.env.CURRENT_PAGE) &&
    !mw.util.getParamValue('oldid') &&
    !mw.util.getParamValue('diff') &&
    fragment !== 'Преамбула' &&
    decodedFragment !== 'Преамбула' &&
    !fragment.startsWith('/media/') &&
    !$(':target').length &&
    !$(`a[name="${escapedDecodedFragment}"]`).length &&
    !$(`*[id="${escapedDecodedFragment}"]`).length &&
    !$(`a[name="${escapedFragment}"]`).length &&
    !$(`*[id="${escapedFragment}"]`).length
  ) {
    window.proceedToArchiveHasRun = true;
    proceedToArchiveDialog();
  }


  /* Functions */

  // Methods of the main object

  $.extend(cd, {
    getMsgByAnchor(anchor) {
      if (!cd.msgs || !anchor) return;

      for (let i = 0; i < cd.msgs.length; i++) {
        if (cd.msgs[i].anchor === anchor) {
          return cd.msgs[i];
        }
      }
    },

    getLastActiveMsgForm() {
      if (cd.env.lastActiveMsgForm && cd.env.lastActiveMsgForm.isActive()) {
        return cd.env.lastActiveMsgForm;
      } else {
        for (let i = cd.msgForms.length - 1; i >= 0; i--) {
          if (cd.msgForms[i].isActive()) {
            return cd.msgForms[i];
          }
        }
      }
    },

    getLastActiveAlteredMsgForm() {
      if (cd.env.lastActiveMsgForm && cd.env.lastActiveMsgForm.isActiveAndAltered()) {
        return cd.env.lastActiveMsgForm;
      } else {
        for (let i = cd.msgForms.length - 1; i >= 0; i--) {
          if (cd.msgForms[i].isActiveAndAltered()) {
            return cd.msgForms[i];
          }
        }
      }
    },
  });

  // Extensions of the cd.env object

  $.extend(cd.env, {
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
  });


  // jQuery extensions

  $.fn.extend({
    cdRemoveNonTagNodes() {
      return $(this).filter(function () {
        return this.nodeType === Node.ELEMENT_NODE;
      });
    },

    cdScrollTo(positionOnScreen = 'top', callback, smooth = true, yCorrection = 0) {
      cd.env.scrollHandleTimeout = true;

      let $el = $(this).cdRemoveNonTagNodes();
      if (!$el.is(':visible')) {
        // If the message that we need to scroll to is being edited.
        if ($el.prev().hasClass('cd-msgForm')) {
          $el = $el.prev();
        }
      }

      let offset;
      if (positionOnScreen === 'middle') {
        offset = Math.min(
          $el.first().offset().top,
          $el.first().offset().top +
            ((($el.last().offset().top + $el.last().height()) - $el.first().offset().top) * 0.5) -
            $(window).height() * 0.5 +  // 0.4
            yCorrection
        );
      } else if (positionOnScreen === 'bottom') {
        offset = $el.last().offset().top + $el.last().height() + yCorrection;
      } else {
        offset = $el.first().offset().top + yCorrection;
      }

      if (smooth) {
        $('body, html').animate({
          scrollTop: offset
        }, {
          complete: () => {
            cd.env.scrollHandleTimeout = false;
            if (callback) {
              callback();
            }
          }
        });
      } else {
        window.scrollTo(0, offset);
        cd.env.scrollHandleTimeout = false;
      }
    },

    cdIsInViewport(partly = false) {
      const $elements = $(this).cdRemoveNonTagNodes();

      // Workaround
      let wasHidden = false;
      if ($elements.length === 1 && $elements.css('display') === 'none') {
        wasHidden = true;
        $elements.show();
      }

      const elementTop = $elements.first().offset().top;
      const elementBottom = $elements.last().offset().top + $elements.last().height();

      if (wasHidden) {
        $elements.hide();
      }

      const viewportTop = $(window).scrollTop();
      const viewportBottom = viewportTop + $(window).height();

      if (!partly) {
        return elementBottom < viewportBottom && elementTop > viewportTop;
      } else {
        return elementTop < viewportBottom && elementBottom > viewportTop;
      }
    },

    cdAddCloseButton(blockName, msg) {
      const $obj = $(this);

      const $closeButton = $('<a>')
        .attr('title', 'Закрыть ' + blockName)
        .addClass('cd-closeButton')
        .css('display', 'none')
        .click(() => {
          $obj.children('.mw-parser-output, table.diff').cdFadeOut('fast', () => {
            $obj.empty();
          }, msg);
        });
      $obj
        .prepend($closeButton)
        .mouseenter(() => {
          $closeButton.fadeIn('fast');
        })
        .mouseleave(() => {
          $closeButton.fadeOut('fast');
        });

      return $(this);
    },

    // Our own animation functions, taking the redrawal of underlayers into account.
    cdHide(msg) {
      if (!msg) {
        msg = cd.env.findMsgInViewport();
      }

      $(this).hide();

      if (msg) {
        msg.prepareUnderlayersInViewport(false);
        msg.updateUnderlayersInViewport(false);
      }

      return $(this);
    },

    cdShow(msg = cd.env.findMsgInViewport()) {
      if (msg) {
        msg.prepareUnderlayersInViewport(false);
      }

      $(this).show();

      if (msg) {
        msg.updateUnderlayersInViewport(false);
      }

      return $(this);
    },

    cdSlideDown(duration, msg = cd.env.findMsgInViewport()) {
      if (msg) {
        msg.prepareUnderlayersInViewport(true);
      }

      $(this).slideDown(duration, () => {
        if (msg) {
          msg.updateUnderlayersInViewport(true);
        }
      });

      return $(this);
    },

    cdSlideUp(duration, callback, msg = cd.env.findMsgInViewport()) {
      if (msg) {
        msg.prepareUnderlayersInViewport(true, 0);
      }

      $(this).slideUp(duration, () => {
        if (callback) {
          callback();
        }
        if (msg) {
          // So that the messages that weren't in the viewport before were included.
          msg.prepareUnderlayersInViewport(false);

          msg.updateUnderlayersInViewport(true);
        }
      });

      return $(this);
    },

    cdFadeIn(duration, msg = cd.env.findMsgInViewport()) {
      if (msg) {
        msg.prepareUnderlayersInViewport(false);
      }

      $(this).fadeIn(duration);

      if (msg) {
        msg.updateUnderlayersInViewport(false);
      }

      return $(this);
    },

    cdFadeOut(duration, callback, msg = cd.env.findMsgInViewport()) {
      $(this).fadeOut(duration, () => {
        if (callback) {
          callback();
        }
        if (msg) {
          msg.prepareUnderlayersInViewport(false);
          msg.updateUnderlayersInViewport(false);
        }
      });

      return $(this);
    },

    cdHtml(html, msg = cd.env.findMsgInViewport()) {
      if (msg) {
        msg.prepareUnderlayersInViewport(false);
      }

      $(this).html(html);

      if (msg) {
        msg.updateUnderlayersInViewport(false);
      }

      return $(this);
    },

    cdAppend(content, msg = cd.env.findMsgInViewport()) {
      if (msg) {
        msg.prepareUnderlayersInViewport(false);
      }

      $(this).append(content);

      if (msg) {
        msg.updateUnderlayersInViewport(false);
      }

      return $(this);
    },

    cdAppendTo(content, msg = cd.env.findMsgInViewport()) {
      if (msg) {
        msg.prepareUnderlayersInViewport(false);
      }

      $(this).appendTo(content);

      if (msg) {
        msg.updateUnderlayersInViewport(false);
      }

      return $(this);
    },

    cdRemove(msg = cd.env.findMsgInViewport()) {
      $(this).remove();

      if (msg) {
        msg.prepareUnderlayersInViewport(false);
        msg.updateUnderlayersInViewport(false);
      }

      return $(this);
    },

    cdEmpty(msg = cd.env.findMsgInViewport()) {
      if (!msg) return;

      $(this).empty();

      if (msg) {
        msg.prepareUnderlayersInViewport(false);
        msg.updateUnderlayersInViewport(false);
      }

      return $(this);
    },
  });

  cd.env.Exception.prototype = new Error();

  debug.endTimer('приготовления');


  /* Main code */

  // Here and below vanilla JavaScript is used for recurring operations that together take up a lot
  // of time.

  debug.startTimer('основной код');

  cd.parse = {};

  cd.parse.closedDiscussions = cd.env.$content.find('.ruwiki-closedDiscussion').get();
  cd.parse.pageHasOutdents = !!cd.env.$content.find('.outdent-template').length;

  const blocksToExcludeSelector = 'blockquote, ' +
    cd.config.BLOCKS_TO_EXCLUDE_CLASSES.map(s => '.' + s).join(', ');
  const blocksToExclude = cd.env.$content.find(blocksToExcludeSelector).get();

  const potentialDateContainers = cd.env.contentElement.querySelectorAll('li, dd, p, div');
  const dateContainers = [];
  for (let i = 0; i < potentialDateContainers.length; i++) {
    const potentialDateContainer = potentialDateContainers[i];
    const pmChildNodes = potentialDateContainer.childNodes;

    for (let j = pmChildNodes.length - 1; j >= 0; j--) {
      const pmChildNode = pmChildNodes[j];
      const pmChildNodeText = pmChildNode.textContent;
      if ((pmChildNode.nodeType === Node.TEXT_NODE || cd.env.isInline(pmChildNode)) &&
        (pmChildNodeText.includes('(UTC)') ||
          pmChildNodeText.includes('Эта реплика добавлена') ||
          pmChildNodeText === 'обс.'
        )
      ) {
        let broken = false;
        for (let k = 0; k < blocksToExclude.length; k++) {
          if (blocksToExclude[k].contains(potentialDateContainer) ||
            (cd.env.EVERYTHING_MUST_BE_FROZEN &&
              potentialDateContainer.className.includes('boilerplate')
            )
          ) {
            broken = true;
            break;
          }
        }
        if (broken) break;

        dateContainers.push(potentialDateContainer);
        break;
      }
    }
  }

  if (cd.env.firstRun) {
    const $underlayersContainer = $('<div>').attr('id', 'cd-underlayersContainer');
    $('.mw-body').prepend($underlayersContainer);
    cd.env.underlayersContainer = $underlayersContainer[0];

    cd.env.updateUnderlayersCorrection();

    // "#cd-linksUnderlayersContainer" element must be placed outside of all elements with z-index
    // set. In Vector, a common container for "underlayers" and "links underlayers" can be used,
    // but in Monobook, a separate container on the topmost level is needed.
    const $linksUnderlayersContainer = $('<div>').attr('id', 'cd-linksUnderlayersContainer');
    $('body').prepend($linksUnderlayersContainer);
    cd.env.linksUnderlayersContainer = $linksUnderlayersContainer[0];
  }

  cd.parse.currentMsgId = 0;
  for (let i = 0; i < dateContainers.length; i++) {
    try {
      const msg = new Msg(dateContainers[i]);
      if (msg.id !== undefined) {
        cd.msgs.push(msg);
        cd.parse.currentMsgId++;
      }
    } catch (e) {
      if (!(e instanceof cd.env.Exception)) {
        console.error(e.stack);
      }
    }
  }

  const collapseAdjacentMsgLevels = (levels) => {
    if (!levels || !levels[0]) return;
    debug.startTimer('collapse');

    const changeElementType = (element, newType) => {
      const newElement = document.createElement(newType);

      while (element.firstChild) {
        newElement.appendChild(element.firstChild);
      }

      let id;
      if (element.classList.contains('cd-msgPart')) {
        id = Number(element.getAttribute('data-id'));
        newElement.onmouseenter = element.onmouseenter;
        newElement.onmouseleave = element.onmouseleave;
      }
      for (let i = 0, a = element.attributes; i < a.length; i++) {
        newElement.setAttribute(a[i].name, a[i].value);
      }

      element.parentNode.replaceChild(newElement, element);

      if (id) {
        const msg = cd.msgs[id];
        for (let i = msg.elements.length - 1; i >= 0; i--) {
          if (msg.elements[i] === element) {
            msg.elements.splice(i, 1, newElement);
            break;
          }
        }
      }

      if (element === firstVisibleElement) {
        firstVisibleElement = newElement;
      }

      return newElement;
    };

    for (let i = 0; i < levels.length; i++) {
      const bottomElement = levels[i];
      const topElement = bottomElement.previousElementSibling;
      // If the previous element was removed in this cycle. (Or it could be absent for some other
      // reason? There was a case where the element was absent.)
      if (!topElement) continue;
      let currentTopElement = topElement;
      let currentBottomElement = bottomElement;

      do {
        const topTag = currentTopElement.tagName;
        const bottomInnerTags = {};
        switch (topTag) {
          case 'UL':
            bottomInnerTags.DD = 'LI';
            break;
          case 'DL':
            bottomInnerTags.LI = 'DD';
            break;
        }

        let firstMoved = null;
        if ((currentTopElement.classList.contains('cd-msgLevel') &&
            currentTopElement.tagName !== 'OL'
          ) ||
          currentTopElement.querySelector('.cd-msgLevel:not(ol)')
        ) {
          while (currentBottomElement.childNodes.length) {
            let child = currentBottomElement.firstChild;
            if (child.tagName) {
              if (bottomInnerTags[child.tagName]) {
                child = changeElementType(child, bottomInnerTags[child.tagName]);
              }
              if (firstMoved === null) {
                firstMoved = child;
              }
            } else {
              if (firstMoved === null && child.textContent.trim()) {
                // Don't fill the variable that is used further to collapse elements when there is
                // a non-empty text node between, like in NBS reply
                // at [[Википедия:Форум/Викиданные#Порядок наград]]. Instead, wrap the text node
                // into an element to prevent it from being ignored when searching next time for
                // adjacent .msgLevel elements. This could be seen only as an additional
                // precaution, since it doesn't fix the source of the problem: the fact that a bare
                // text node is (probably) a part of the reply. It shouldn't be happening.
                firstMoved = false;
                const newChild = document.createElement('span');
                newChild.appendChild(child);
                child = newChild;
              }
            }
            currentTopElement.appendChild(child);
          }
          currentBottomElement.parentElement.removeChild(currentBottomElement);
        }

        currentBottomElement = firstMoved;
        currentTopElement = firstMoved && firstMoved.previousElementSibling;
      } while (currentTopElement && currentBottomElement &&
        ((currentBottomElement.classList.contains('cd-msgLevel') && currentBottomElement.tagName !== 'OL') ||
          currentBottomElement.querySelector('.cd-msgLevel:not(ol)')
        )
      );
    }
    debug.endTimer('collapse');
  };

  collapseAdjacentMsgLevels(
    cd.env.contentElement.querySelectorAll('.cd-msgLevel:not(ol) + .cd-msgLevel:not(ol)')
  );
  collapseAdjacentMsgLevels(
    cd.env.contentElement.querySelectorAll('.cd-msgLevel:not(ol) + .cd-msgLevel:not(ol)')
  );
  if (cd.env.contentElement.querySelectorAll('.cd-msgLevel:not(ol) + .cd-msgLevel:not(ol)').length
  ) {
    console.error('Остались соседства .cd-msgLevel.');
  }

  // A workaround; cover messages with "minus 1 level" indentation with their background colors.
  const elements = document.getElementsByClassName('ruwiki-msgIndentation-minus1level');
  let currentElement;
  for (let i = 0; i < elements.length; i++) {
    const element = elements[i];
    let currentElement = element;
    let bgcolor;
    while (currentElement &&
      currentElement !== cd.env.contentElement &&
      (!bgcolor ||
        !bgcolor.includes('rgb(')
      )
    ) {
      currentElement = currentElement.parentElement;
      bgcolor = currentElement.style.backgroundColor;
    }
    element.style.backgroundColor = bgcolor || '#fff';
    if (element.classList.contains('cd-msgPart')) {
      element.style.margin = '0';
    }

  }

  mw.hook('cd.msgsReady').fire(cd.msgs);

  const ARTICLE_ID = mw.config.get('wgArticleId');
  cd.env.watchedTopicsPromise = cd.env.getWatchedTopics()
    .done((gotWatchedTopics) => {
      cd.env.watchedTopics = gotWatchedTopics;
      cd.env.thisPageWatchedTopics = cd.env.watchedTopics && cd.env.watchedTopics[ARTICLE_ID] || [];
      if (!cd.env.thisPageWatchedTopics.length) {
        cd.env.watchedTopics[ARTICLE_ID] = cd.env.thisPageWatchedTopics;
      }
    })
    .fail(() => {
      console.error('Не удалось загрузить настройки с сервера');
    });

  cd.parse.currentSectionId = 0;
  const headingCandidates = cd.env.contentElement.querySelectorAll('h2, h3, h4, h5, h6');
  const headings = [];
  for (let i = 0; i < headingCandidates.length; i++) {
    const headingCandidate = headingCandidates[i];
    if (headingCandidate.querySelector('.mw-headline')) {
      headings.push(headingCandidate);
    }
  }

  for (let i = 0; i < headings.length; i++) {
    try {
      const section = new Section(headings[i], i === headings.length - 1);
      if (section.id !== undefined) {
        cd.sections.push(section);
        cd.parse.currentSectionId++;
      }
    } catch (e) {
      if (!(e instanceof cd.env.Exception)) {
        console.error(e.stack);
      }
    }
  }

  for (let i = 0; i < cd.msgs.length; i++) {
    if (!cd.msgs[i].isOpeningSection) {
      cd.msgs[i].isOpeningSection = false;
    }
  }

  let subsections;
  for (let i = 0; i < cd.sections.length; i++) {
    subsections = [];
    const section = cd.sections[i];
    for (let j = i + 1; j < cd.sections.length; j++) {
      if (cd.sections[j].level > section.level) {
        subsections.push(cd.sections[j]);

        if (section.level === 2) {
          cd.sections[j].baseSection = section;
        }
      } else {
        break;
      }
    }
    section.subsections = subsections;

    if (!section.frozen && section.level === 2) {
      let sectionWithLastReplyButton;
      if (subsections.length && !subsections[subsections.length - 1].frozen) {
        sectionWithLastReplyButton = subsections[subsections.length - 1];
      } else {
        sectionWithLastReplyButton = section;
      }
      const replyButtonA = sectionWithLastReplyButton.$replyButtonContainer &&
        sectionWithLastReplyButton.$replyButtonContainer[0].firstChild.firstChild;
      replyButtonA.onmouseenter = section.replyButtonHoverHandler;
      replyButtonA.onmouseleave = section.replyButtonUnhoverHandler;
    }
  }

  mw.hook('cd.sectionsReady').fire(cd.sections);

  debug.endTimer('основной код');

  debug.startTimer('заключительный код и рендеринг');

  // Restore the initial viewport position.
  if (firstVisibleElement) {
    window.scrollTo(0, window.pageYOffset + firstVisibleElement.getBoundingClientRect().top -
      firstVisibleElementTopOffset);
  }

  // Describe all floating elements on page in order to calculate the right border (temporarily
  // setting overflow: hidden) for all messages that they intersect with.
  const floatingElementsNodeList = cd.env.contentElement.querySelectorAll(
    '.tright, .floatright, .infobox, *[style*="float:right"], *[style*="float: right"]'
  );
  cd.env.floatingElements = [];
  for (let i = 0; i < floatingElementsNodeList.length; i++) {
    const floatingElement = floatingElementsNodeList[i];
    // Hardcodely delete all known elements. They should probably be assigned a class, like
    // "cd-ignoreFloating".
    if (!(floatingElement.tagName === 'SPAN' ||
      floatingElement.classList.contains('mw-collapsible-toggle') ||
      floatingElement.style.padding === '1em 21px 0.5em' ||
      floatingElement.style.margin === '-4px 0px 0px 0.5em'
    )) {
      cd.env.floatingElements.push(floatingElement);
    }
  }

  let msgAnchor = cd.env.firstRun ? isMsgFragment && decodedFragment : msgAnchorToScrollTo;
  if (msgAnchor) {
    let $targetMsg = $(`[id="${$.escapeSelector(msgAnchor)}"]`);
    if (cd.env.firstRun && !$targetMsg.length) {  // By a link from the watchlist
      const msgDataMatches = msgAnchor.match(/^(\d\d\d\d)(\d\d)(\d\d)(\d\d)(\d\d)_(.+)$/);
      const year = Number(msgDataMatches[1]);
      const month = Number(msgDataMatches[2]) - 1;
      const day = Number(msgDataMatches[3]);
      const hours = Number(msgDataMatches[4]);
      const minutes = Number(msgDataMatches[5]);
      const author = msgDataMatches[6];

      const date = new Date(year, month, day, hours, minutes);

      for (let gap = 1; gap <= 5; gap++) {
        let dateToFind = new Date(date.getTime() - cd.env.MILLISECONDS_IN_A_MINUTE * gap);
        msgAnchor = cd.env.generateMsgAnchor(
          dateToFind.getFullYear(),
          dateToFind.getMonth(),
          dateToFind.getDate(),
          dateToFind.getHours(),
          dateToFind.getMinutes(),
          author
        );
        $targetMsg = $(`[id="${$.escapeSelector(msgAnchor)}"]`);
        if ($targetMsg.length) break;
      }
    }

    if ($targetMsg.length) {
      const msg = cd.getMsgByAnchor(msgAnchor);
      if (msg) {
        // setTimeout is for Firefox – otherwise, it positions the underlayer incorrectly.
        setTimeout((msg) => {
          msg.scrollToAndHighlightTarget();
        }, 0, msg);
      }
    }
  }

  cd.env.lastNewestSeen = 0;
  if (!cd.env.EVERYTHING_MUST_BE_FROZEN && !mw.util.getParamValue('diff')) {
    if (cd.env.firstRun) {
      cd.env.$updatePanel = $('<div>')
        .attr('id', 'cd-updatePanel')
        .mouseenter(() => {
          cd.env.mouseOverUpdatePanel = true;
        })
        .mouseleave(() => {
          cd.env.mouseOverUpdatePanel = false;
        });
      cd.env.$refreshButton = $('<div>')
        .attr('id', 'cd-updatePanel-refreshButton')
        .attr('title', 'Обновить страницу')
        .appendTo(cd.env.$updatePanel)
        .click(() => {
          if (!cd.getLastActiveAlteredMsgForm()) {
            cd.env.reloadPage();
          } else {
            if (confirm(
              'На странице имеются неотправленные формы. Перезагрузить страницу всё равно?'
            )) {
              cd.env.reloadPage();
            } else {
              let lastActiveAlteredMsgForm = cd.getLastActiveAlteredMsgForm();
              if (lastActiveAlteredMsgForm) {
                lastActiveAlteredMsgForm.textarea.focus();
              }
            }
          }
        });
      cd.env.$prevButton = $('<div>')
        .attr('id', 'cd-updatePanel-prevButton')
        .attr('title', 'Перейти к предыдущему новому сообщению')
        .click(cd.env.goToPrevNewMsg)
        .css('display', 'none')
        .appendTo(cd.env.$updatePanel);
      cd.env.$nextButton = $('<div>')
        .attr('id', 'cd-updatePanel-nextButton')
        .attr('title', 'Перейти к следующему новому сообщению')
        .click(cd.env.goToNextNewMsg)
        .css('display', 'none')
        .appendTo(cd.env.$updatePanel);

      cd.env.$updatePanel.appendTo($('body'));
    } else {
      cd.env.$nextButton
        .hide()
        .addClass('cd-updatePanel-nextButton-digit');
      cd.env.$prevButton.hide();
    }

    cd.env.getVisits()
      .done((visits) => {
        cd.env.newestCount = 0;
        cd.env.newCount = 0;

        const thisPageVisits = visits && visits[ARTICLE_ID] || [];
        const currentUnixTime = Math.floor($.now() / 1000);
        let firstVisit;

        if (thisPageVisits.length) {
          firstVisit = false;
          // Cleanup
          for (let i = thisPageVisits.length - 1; i >= 0; i--) {
            if (thisPageVisits[i] < currentUnixTime - 60 * cd.env.HIGHLIGHT_NEW_INTERVAL) {
              thisPageVisits.splice(0, i);
              break;
            }
          }
        } else {
          firstVisit = true;
          visits[ARTICLE_ID] = thisPageVisits;
        }

        if (!firstVisit) {
          for (let i = 0; i < cd.env.floatingElements.length; i++) {
            cd.env.floatingRects[i] = cd.env.floatingElements[i].getBoundingClientRect();
          }

          const underlayersToAdd = [];
          for (let i = 0; i < cd.msgs.length; i++) {
            const msg = cd.msgs[i];

            // + 60 to avoid situation when a message is considered read but it was added the same
            // minute with the last visit. This behaviour has a side effect: if you posted
            // a message, it will be marked as "new" the next time you visit until
            // cd.env.HIGHLIGHT_NEW_INTERVAL minutes pass.
            const msgUnixTime = Math.floor(msg.timestamp / 1000);

            if (thisPageVisits.length &&
              msgUnixTime > thisPageVisits[thisPageVisits.length - 1] &&
              msg.author !== cd.env.CURRENT_USER
            ) {
              msg.newness = 'newest';
              msg.seen = false;
              const underlayerData = msg.configureUnderlayer(true);
              if (underlayerData) {
                underlayersToAdd.push(underlayerData);
              }
              msg.$underlayer[0].className += ' cd-underlayer-newest';
              cd.env.newestCount++;
              cd.env.newCount++;
            } else if (msgUnixTime > thisPageVisits[0]) {
              msg.newness = 'new';
              msg.seen = false;
              const underlayerData = msg.configureUnderlayer(true);
              if (underlayerData) {
                underlayersToAdd.push(underlayerData);
              }
              msg.$underlayer[0].className += ' cd-underlayer-new';
              cd.env.newCount++;
            }
          }

          cd.env.floatingRects = [];

          for (let i = 0; i < underlayersToAdd.length; i++) {
            cd.env.underlayersContainer.appendChild(underlayersToAdd[i].underlayer);
            cd.env.linksUnderlayersContainer.appendChild(underlayersToAdd[i].linksUnderlayer);
          }
        }

        thisPageVisits.push(currentUnixTime);

        cd.env.setVisits(visits)
          .fail((e) => {
            const [errorType, data] = e;
            if (errorType === 'internal' && data === 'sizelimit') {
              // Cleanup: remove oldest 1/3 of visits.
              const timestamps = [];
              for (let key in visits) {
                for (let i = 0; i < visits[key].length; i++) {
                  timestamps.push(visits[key][i]);
                  }
              }
              timestamps.sort((a, b) => {
                if (a > b) {
                  return 1;
                } else {
                  return -1;
                }
              });
              const boundary = timestamps[Math.floor(timestamps.length / 3)];

              for (let key in visits) {
                for (let i = visits[key].length - 1; i >= 0; i--) {
                  if (visits[key][i] < boundary) {
                    visits[key].splice(i, 1);
                  }
                }
                if (!visits[key].length) {
                  delete visits[key];
                }
              }

              cd.env.setVisits(visits);
            }
          });

        if (cd.env.newCount) {
          cd.env.$nextButton.show();
          if (cd.env.newestCount === 0) {
            cd.env.$prevButton.show();
          }
          cd.env.updateNextButton();

        }

        if (cd.env.newestCount && cd.msgs.length) {
          cd.env.registerSeenMsgs();
        }
      })
      .fail(() => {
        console.error('Не удалось загрузить настройки с сервера');
      });
  }

  if (cd.env.firstRun) {
    // mouseover allows to capture when the cursor is not moving but ends up above the element
    // (for example, as a result of scrolling). The handlers are in outer scope so that they don't
    // run twice after each refresh.
    $(document)
      .on('mousemove mouseover', cd.env.highlightFocused)
      .keydown(cd.env.globalKeyDownHandler);
    $(window)
      .on('resize orientationchange', cd.env.windowResizeHandler)
      .on('beforeunload', cd.env.beforeUnloadHandler);

    if (!cd.env.EVERYTHING_MUST_BE_FROZEN) {
      $(document).on('scroll resize orientationchange', cd.env.registerSeenMsgs);

      setInterval(() => {
        cd.env.recalculateUnderlayers(true);
      }, 500);
    }

    const defaultAdjustSizePrototype = OO.ui.MultilineTextInputWidget.prototype.adjustSize;
    OO.ui.MultilineTextInputWidget.prototype.adjustSize = function () {
      let initialHeight;
      if (this.cdMsgForm) {
        initialHeight = this.$input.outerHeight();
      }
      defaultAdjustSizePrototype.call(this);
      if (this.cdMsgForm && initialHeight !== this.$input.outerHeight()) {
        let msg = this.cdMsgForm.getTargetMsg(true, true);
        if (msg) {
          msg.prepareUnderlayersInViewport(false);
          msg.updateUnderlayersInViewport(false);
        }
      }
    };
  }

  const generateEditCommonJsLink = () =>
    mw.util.getUrl(`User:${cd.env.CURRENT_USER}/common.js`, { action: 'edit' });

  if (highlightLastMessagesEnabled && !mw.cookie.get('cd-hlmConflict')) {
    // Remove the results of work of [[Участник:Кикан/highlightLastMessages.js]]
    if (typeof messagesHighlightColor !== 'undefined') {
      const dummyElement = document.createElement('span');
      dummyElement.style.color = messagesHighlightColor;
      const hlmStyledElements = cd.env.contentElement.querySelectorAll(
        `.cd-msgPart[style="background-color: ${dummyElement.style.color};"],` +
        `.cd-msgPart[style="background-color: ${messagesHighlightColor}"]`
      );
      for (let i = 0; i < hlmStyledElements.length; i++) {
        hlmStyledElements[i].style.backgroundColor = null;
      }
    }

    mw.notify(
      cd.env.toJquerySpan(`У вас подключён скрипт <a href="//ru.wikipedia.org/wiki/Участник:Кикан/highlightLastMessages.js">highlightLastMessages.js</a>, конфликтующий с функциональностью подсветки скрипта «Удобные дискуссии». Рекомендуется отключить его в <a href="${generateEditCommonJsLink()}">вашем common.js</a> (или другом файле настроек).`),
      { autoHide: false }
    );
    mw.cookie.set('cd-hlmConflict', '1', { path: '/', expires: cd.env.SECONDS_IN_A_DAY * 30 });
  }

  if (typeof proceedToArchiveRunned !== 'undefined' &&
    !mw.cookie.get('cd-ptaConflict')
  ) {
    mw.notify(
      cd.env.toJquerySpan(`У вас подключён скрипт <a href="//ru.wikipedia.org/wiki/Участник:Jack_who_built_the_house/proceedToArchive.js">proceedToArchive.js</a>, функциональность которого включена в скрипт «Удобные дискуссии». Рекомендуется отключить его в <a href="${generateEditCommonJsLink()}">вашем common.js</a> (или другом файле настроек).`),
      { autoHide: false }
    );
    mw.cookie.set('cd-ptaConflict', '1', { path: '/', expires: cd.env.SECONDS_IN_A_DAY * 30 });
  }

  if (document.querySelector('.localcomments[style="font-size: 95%; white-space: nowrap;"]')) {
    mw.notify(
      cd.env.toJquerySpan(`Скрипт <a href="//ru.wikipedia.org/wiki/Участник:Александр_Дмитриев/comments_in_local_time_ru.js">comments in local time ru.js</a> выполняется раньше скрипта «Удобные дискуссии», что мешает работе последнего. Проследуйте инструкциям <a href="${mw.util.getUrl(cd.env.HELP_LINK)}#Совместимость">здесь</a>, чтобы обеспечить их совместимость.`),
      { autoHide: false }
    );
  }

  cd.env.alwaysConfirmLeavingPage = false;
  if (mw.user.options.get('editondblclick')) {
    mw.loader.using('mediawiki.action.view.dblClickEdit').done(() => {
      $('#ca-edit').off('click');
      cd.env.alwaysConfirmLeavingPage = true;
    });
  }

  if (mw.user.options.get('editsectiononrightclick')) {
    mw.loader.using('mediawiki.action.view.rightClickEdit').done(() => {
      $('.mw-editsection a').off('click');
      cd.env.alwaysConfirmLeavingPage = true;
    });
  }

  mw.hook('cd.pageReady').fire(cd);

  if (cd.settings.showLoadingOverlay !== false) {
    cd.env.removeLoadingOverlay();
  }

  cd.env.firstRun = false;

  // The next line is useful for calculating the time for rendering: it won't run until everything
  // gets rendered. (getBoundingClientRect(), hovewer, could run a little earlier.)
  cd.env.contentElement.getBoundingClientRect();

  debug.endTimer('заключительный код и рендеринг');

  debug.endTimer('общее время');

  const baseTime = debug.timers['основной код'] + debug.timers['заключительный код и рендеринг'];
  const timePerMsg = baseTime / cd.msgs.length;

  const totalTime = debug.timers['общее время'];

  debug.logAndResetTimer('общее время');
  console.log('число сообщений: ' + cd.msgs.length);
  console.log('на одно сообщение: ' + timePerMsg.toFixed(1));
  debug.logAndResetTimers();

  for (let i = 0; i < debug.abstractCounters.length; i++) {
    if (debug.abstractCounters[i] !== null) {
      console.log(`счётчик ${i}: ${debug.abstractCounters[i]}`);
    }
  }

  for (let i = 0; i < debug.abstractGlobalVars.length; i++) {
    console.log(`глобальная переменная ${i}: ${debug.abstractGlobalVars[i]}`);
  }

  const comparativeValue = 4 / 1;  // ms / message
  const currentValue = totalTime / cd.msgs.length;
  console.log(Math.round((currentValue / comparativeValue) * 100) + '% от ориентировочного значения');
}
