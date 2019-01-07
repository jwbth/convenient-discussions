import debug from './debug';
import Msg from './Msg';
import Section from './Section';
import MsgForm from './MsgForm';

export default function parse(msgAnchorToScrollTo) {
	if (typeof msgAnchorToScrollTo !== 'string') {
		msgAnchorToScrollTo = null;
	}
	
	if (cd.env.firstRun) {
		debug.endTimer('загрузка модулей');
	} else {
		debug.endTimer('заливка HTML');
	}
	
	debug.startTimer('приготовления');
	
	
	/* Preparation */
	
	var $parserOutput = cd.env.$content.children('.mw-parser-output');
	if ($parserOutput.length) {
		cd.env.$content = $parserOutput;
		cd.env.contentElement = $parserOutput[0];
	} else {
		cd.env.contentElement = cd.env.$content[0];
	}

	cd.msgs = [];
	cd.sections = [];
	cd.msgForms = [];
	
	// We fill the settings after the modules are loaded so that user settings had more chance to load.
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
	
	var highlightLastMessagesEnabled = typeof highlightMessagesAfterLastVisit !== 'undefined';
	if (cd.settings.highlightNew && highlightLastMessagesEnabled) {
		// Suppress the work of [[Участник:Кикан/highlightLastMessages.js]] in possible ways.
		highlightMessagesAfterLastVisit = false;
		highlightMessages = 0;
	}
	
	cd.env.createWindowManager();
	
	if (!cd.env.MSG_REPLY_BUTTON_PROTOTYPE) {  // Saves a little time.
		cd.env.MSG_UP_BUTTON_PROTOTYPE = new OO.ui.ButtonWidget({
			label: '↑',
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
		
		var LINKS_UNDERLAYER_WRAPPER = document.createElement('div');
		LINKS_UNDERLAYER_WRAPPER.className = 'cd-linksUnderlayer-wrapper';
		cd.env.LINKS_UNDERLAYER_PROTOTYPE.appendChild(LINKS_UNDERLAYER_WRAPPER);
		
		var LINKS_UNDERLAYER_GRADIENT = document.createElement('div');
		LINKS_UNDERLAYER_GRADIENT.textContent = ' ';
		LINKS_UNDERLAYER_GRADIENT.className = 'cd-linksUnderlayer-gradient';
		LINKS_UNDERLAYER_WRAPPER.appendChild(LINKS_UNDERLAYER_GRADIENT);
		
		var LINKS_UNDERLAYER_TEXT = document.createElement('div');
		LINKS_UNDERLAYER_TEXT.className = 'cd-linksUnderlayer-text';
		LINKS_UNDERLAYER_WRAPPER.appendChild(LINKS_UNDERLAYER_TEXT);
	}
	
	cd.env.CURRENT_USER_SIG = mw.user.options.get('nickname');
	
	var authorInSigMatches = cd.env.CURRENT_USER_SIG.match(new RegExp(cd.config.USER_NAME_PATTERN));
	if (authorInSigMatches) {
		// Signature contents before the user name – in order to cut it out from the message endings when editing.
		cd.env.CURRENT_USER_SIG_PREFIX_REGEXP = new RegExp(
			(cd.settings.mySig === cd.defaultSettings.mySig || !cd.settings.mySig.includes('~~\~') ?
				'' :
				mw.RegExp.escape(cd.settings.mySig.slice(0, cd.settings.mySig.indexOf('~~\~')))
			) +
			mw.RegExp.escape(cd.env.CURRENT_USER_SIG.slice(0, authorInSigMatches.index)) + '$'
		);
	}

	var POPULAR_NOT_INLINE_ELEMENTS = ['P', 'OL', 'UL', 'LI', 'PRE', 'BLOCKQUOTE', 'DL', 'DD', 'DIV', 'HR', 'H2',
	'H3', 'H4', 'H5', 'H6', 'TABLE', 'INPUT', 'FORM'];
	var POPULAR_INLINE_ELEMENTS = ['A', 'SMALL', 'B', 'STRONG', 'I', 'EM', 'U', 'S', 'SPAN', 'CODE', 'TT', 'KBD',
		'BR', 'IMG', 'SUP', 'SUB', 'ABBR', 'CITE'];
	cd.env.PNIE_PATTERN = '(?:' + POPULAR_NOT_INLINE_ELEMENTS.join('|') + ')';

	cd.env.EVERYTHING_MUST_BE_FROZEN = !!(
		cd.env.CURRENT_PAGE.includes('/Архив') ||
		((/[?&]diff=[^&]/.test(location.search) ||
				/[?&]oldid=[^&]/.test(location.search)
			) &&
			mw.config.get('wgRevisionId') !== mw.config.get('wgCurRevisionId')
		)
	);
	
	var msgAntipatternPatternParts = [];
	// true relates to '-- ?\\[\\[Участник:DimaBot\\|DimaBot\\]\\]'
	if (cd.config.BLOCKS_TO_EXCLUDE_CLASSES || cd.config.TEMPLATES_TO_EXCLUDE || true) {
		if (cd.config.BLOCKS_TO_EXCLUDE_CLASSES) {
			msgAntipatternPatternParts.push(
				'class=([\\\'"])[^\\1]*(?:\\b' + cd.config.BLOCKS_TO_EXCLUDE_CLASSES.join('\\b|\\b') + '\\b)[^\\1]*\\1'
			);
		}
		if (cd.config.TEMPLATES_TO_EXCLUDE) {
			msgAntipatternPatternParts.push('\\{\\{ *(?:' + cd.config.TEMPLATES_TO_EXCLUDE.map(function (template) {
				return cd.env.generateCaseInsensitiveFirstCharPattern(template);
			}).join('|') + ') *(?:\\||\\}\\})');
		}
		msgAntipatternPatternParts.push('-- ?\\[\\[Участник:DimaBot\\|DimaBot\\]\\]');
		cd.env.MSG_ANTIPATTERN_REGEXP = new RegExp('(?:' + msgAntipatternPatternParts.join('|') + ').*\\n$');
	}
	
	
	/* Save the viewport position */
	
	var firstVisibleElement, firstVisibleElementTopOffset;
	if (cd.env.firstRun) {
		if (window.pageYOffset !== 0 && cd.env.contentElement.getBoundingClientRect().top <= 0) {
			var currentElement = cd.env.contentElement.firstElementChild;
			var rect, child;
			while (currentElement) {
				if (POPULAR_NOT_INLINE_ELEMENTS.includes(currentElement.tagName)) {
					rect = currentElement.getBoundingClientRect();
					if (rect.bottom >= 0 &&
						rect.height !== 0
					) {
						firstVisibleElement = currentElement;
						firstVisibleElementTopOffset = rect.top;
						
						child = currentElement.firstElementChild;
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
	
	function processFragment(fragment) {
		function dotToPercent(code) {
			return code.replace(/\.([0-9A-F][0-9A-F])/g, '%$1');
		}
		
		// Some ancient links with dots, you never know
		fragment = fragment
			.replace(/(^|[^0-9A-F\.])(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)/g, '$1$2,$3,$4,$5')  // Hide IP
			.replace(/\.F[0-4]\.[89AB][\dA-F]\.[89AB][\dA-F]\.[89AB][\dA-F]/g, dotToPercent)
			.replace(/\.E[\dA-F]\.[89AB][\dA-F]\.[89AB][\dA-F]/g, dotToPercent)
			.replace(/\.[CD][\dA-F]\.[89AB][\dA-F]/g, dotToPercent)
			.replace(/\.[2-7][0-9A-F]/g, function (code) {
				var ch = decodeURIComponent(dotToPercent(code));
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
	}
	
	function proceedToArchiveDialog() {
		var messageDialog = new OO.ui.MessageDialog();
		$('body').append(cd.env.windowManager.$element);
		cd.env.windowManager.addWindows([messageDialog]);
		
		var proceedToArchiveWindow = cd.env.windowManager.openWindow(messageDialog, {
			message: $('<div style="text-align:center;"><p style="margin-top:0;"><span style="color:#c61313;">' +
				'Тема не найдена.</span>  Она могла быть переименована или уйти в архив.</p>' +
				'<p style="font-size:125%;">Поискать в архиве?</p></div>'
			),
			actions: [
				{ label: 'Да', action: 'yes' },
				{ label: 'Нет', action: 'no' },
			],
		});
		proceedToArchiveWindow.closed.then(function (data) {
			if (data && data.action === 'yes') {
				var heading = processFragment(fragment).replace(/"/g, '');
				var archivePrefix;
				var PAGE_TITLE = mw.config.get('wgTitle');
				if (PAGE_TITLE.indexOf('Форум/') === 0) {
					if (PAGE_TITLE.indexOf('Форум/Географический') === 0) {
						archivePrefix = 'Форум/Географический/Архивы';
					} else {
						archivePrefix = 'Форум/Архив/' + PAGE_TITLE.slice(6);
					}
				} else {
					archivePrefix = PAGE_TITLE;
				}
				var searchQuery = '"' + heading + '" prefix:' +
					mw.config.get('wgFormattedNamespaces')[cd.env.NAMESPACE_NUMBER] + ':' + archivePrefix;
				var url = mw.util.getUrl('Служебная:Поиск', {
					profile: 'default',
					fulltext: 'Search',
					search: searchQuery,
				});
				location.assign(mw.config.get('wgServer') + url);
			}
		});
	}
	
	var fragment = location.hash.slice(1);
	var decodedFragment;
	try {
		decodedFragment = decodeURIComponent(fragment);
	} catch (e) {
		console.error(e.stack);
	}
	var escapedFragment = $.escapeSelector(fragment);
	var escapedDecodedFragment = decodedFragment && $.escapeSelector(decodedFragment);
	var isMsgFragment = /^\d{12}_.+$/.test(fragment);

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
		!$('a[name="' + escapedDecodedFragment + '"]').length &&
		!$('*[id="' + escapedDecodedFragment + '"]').length &&
		!$('a[name="' + escapedFragment + '"]').length &&
		!$('*[id="' + escapedFragment + '"]').length
	) {
		window.proceedToArchiveHasRun = true;
		proceedToArchiveDialog();
	}
	
	
	/* Functions */
	
	// Methods of the main object
	
	cd.getMsgByAnchor = function (anchor) {
		if (!cd.msgs || !anchor) {
			return;
		}
		
		for (var i = 0; i < cd.msgs.length; i++) {
			if (cd.msgs[i].anchor === anchor) {
				return cd.msgs[i];
			}
		}
	};
	
	cd.getLastActiveMsgForm = function () {
		if (cd.env.lastActiveMsgForm && cd.env.lastActiveMsgForm.isActive()) {
			return cd.env.lastActiveMsgForm;
		} else {
			for (var i = cd.msgForms.length - 1; i >= 0; i--) {
				if (cd.msgForms[i].isActive()) {
					return cd.msgForms[i];
				}
			}
		}
	};
	
	cd.getLastActiveAlteredMsgForm = function () {
		if (cd.env.lastActiveMsgForm && cd.env.lastActiveMsgForm.isActiveAndAltered()) {
			return cd.env.lastActiveMsgForm;
		} else {
			for (var i = cd.msgForms.length - 1; i >= 0; i--) {
				if (cd.msgForms[i].isActiveAndAltered()) {
					return cd.msgForms[i];
				}
			}
		}
	};
	
	// Functions

	$.extend(cd.env, {
		getLastGlobalCapture: function (s, regexp) {
			var matches, lastCapture;
			while (matches = regexp.exec(s)) {
				lastCapture = matches[1];
			}
			return lastCapture;
		},
		
		findPrevMsg: function (code) {
			var regexp = new RegExp('^[^]*(?:^|\\n)((.*)' + cd.config.SIG_PATTERN + '.*\\n)');
			var match = code.match(regexp);
			while (match && cd.env.MSG_ANTIPATTERN_REGEXP && cd.env.MSG_ANTIPATTERN_REGEXP.test(match[0])) {
				code = code.replace(/(?:^|\n).*$/, '');
				match = code.match(regexp);
			}
			return match;
		},
		
		findFirstMsg: function (code) {
			code = code + '\n';
			var regexp = new RegExp('^[^]*?(?:^|\\n)((.*)' + cd.config.SIG_PATTERN + '.*\\n)');
			var match = code.match(regexp);
			var initialPos = 0;
			var increase;
			if (cd.env.MSG_ANTIPATTERN_REGEXP) {
				var antipatternMatch;
				while (antipatternMatch = match && match[0].match(cd.env.MSG_ANTIPATTERN_REGEXP)) {
					increase = antipatternMatch.index + antipatternMatch[0].length;
					code = code.substr(increase);
					initialPos += increase;
					match = code.match(regexp);
				}
			}
			return [match, initialPos];
		},
		
		collectAuthorAndDate: function (match, mode) {
			var text = match[1];
			var date, author;
			if (match[3]) {
				date = match[3];
				
				for (var i = 0; i < cd.config.USER_NAME_REGEXPS.length; i++) {
					author = cd.env.getLastGlobalCapture(text, cd.config.USER_NAME_REGEXPS[i]);
					if (author) break;
				}
				if (author) {
					author = (author[0].toUpperCase() + author.slice(1)).replace(/[ _]+/g, ' ');
				}
			} else if (match[4]) {
				author = match[4];
				date = match[5] || null;
				if (date && !date.includes('(UTC)')) {
					date += ' (UTC)';
				}
			} else if (match[6]) {
				author = match[7];
				date = match[6];
				if (!date && date.includes('(UTC)')) {
					date += ' (UTC)';
				}
			}
			
			return {
				author: author,
				date: date,
			};
		},
		
		findFirstDate: function (code) {
			var temp = cd.env.findFirstMsg(code);
			var firstMsgMatch = temp[0];
			
			if (firstMsgMatch) {
				if (firstMsgMatch[3]) {
					return firstMsgMatch[3];
				} else if (firstMsgMatch[4]) {
					return firstMsgMatch[5] || firstMsgMatch[4];
				} else if (firstMsgMatch[6]) {
					return firstMsgMatch[6];
				}
			}
		},
		
		isInline: function (el) {
			if (POPULAR_INLINE_ELEMENTS.includes(el.tagName)) {
				return true;
			} else if (POPULAR_NOT_INLINE_ELEMENTS.includes(el.tagName)) {
				return false;
			} else {
				// This is VERY resource-greedy. Avoid by any means.
				return window.getComputedStyle(el).display === 'inline';
			}
		},
		
		getLastMatch: function (s, regexp) {
			if (!regexp.global) {
				console.error('Функция работает только с регулярными выражениями с флагом global.');
				return;
			}
			var matches, lastMatch;
			while (matches = regexp.exec(s)) {
				lastMatch = matches;
			}
			return lastMatch;
		},
		
		encodeWikiMarkup: function (text) {
			var map = {
				'<': '&lt;',
				'>': '&gt;',
				'[': '&#91;',
				']': '&#93;',
				'{': '&#123;',
				'|': '&#124;',
				'}': '&#125;',
				' ': ' ',
			};
			
			return text.replace(/[<>[\]{|} ]/g, function(ch) {
				return map[ch];
			});
		},
		
		cleanSectionHeading: function (heading) {
			return heading
				.replace(/\[\[:?(?:[^|]*\|)?([^\]]*)\]\]/g, '$1')  // Extract displayed text from wikilinks
				.replace(/'''(.+?)'''/g, '$1')                     // Remove bold
				.replace(/''(.+?)''/g, '$1')                       // Remove italics
				.replace(/<\w+(?: [\w ]+?=[^<>]+?| ?\/?)>/g, '')   // Remove opening tags (won't work with
				                                                   // <smth param=">">, but wikiparser fails too)
				.replace(/<\/\w+ ?>/g, '')                         // Remove closing tags
				.replace(/ {2,}/g, ' ')                            // Remove multiple spaces
				.trim();
		},
		
		formSummary: function (text) {
			return text + cd.env.SUMMARY_POSTFIX;
		},
		
		createTextWithIcon: function (html, iconName) {
			var icon = new OO.ui.IconWidget({
				icon: iconName,
			});
			var iconLabel = new OO.ui.LabelWidget({
				label: html instanceof jQuery ? html : new OO.ui.HtmlSnippet(html),
			});
			
			return $('<div>').append(icon.$element, iconLabel.$element);
		},
		
		calculateWordsOverlap: function (s1, s2) {
			// Compare Latin & Cyrillic words starting with 3 characters.
			var words1 = cd.env.removeDuplicates(s1.match(/[A-Za-zА-Яа-яЁё]{3,}/g));
			var words2 = cd.env.removeDuplicates(s2.match(/[A-Za-zА-Яа-яЁё]{3,}/g));
			if (!words1 || !words2) return;
			
			var total = words2.length;
			var overlap = 0;
			var isOverlap;
			words1.forEach(function (word1) {
				isOverlap = false;
				words2.forEach(function (word2) {
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
		
		generateAuthorAndDateRegExp: function (author, date) {
			// These HTML entities are collected via a query like
			// "insource:/\[\[[УуUu](ser|частни)?:[^|\]]*\&/ prefix:ВП:" on Russian and English Wikipedias (cases are
			// collected from the results by ".*&.{10}", junk is removed by "^[^;]*$" (lines without ;) and
			// ";.+$" (text after ;), unique lines are kept.
			var popularHTMLEntities = {
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
			
			var authorPattern = cd.env.generateCaseInsensitiveFirstCharPattern(author).replace(/ /g, '[ _]');
			var entitiesPattern;
			for (var key in popularHTMLEntities) {
				if (author.includes(key)) {
					if (typeof popularHTMLEntities[key] === 'string') {
						entitiesPattern = popularHTMLEntities[key];
					} else {
						entitiesPattern = popularHTMLEntities[key].join('|');
					}
					authorPattern = authorPattern.replace(
						mw.RegExp.escape(key),
						'(?:' + mw.RegExp.escape(key) + '|' + entitiesPattern + ')'
					);
				}
			}
			
			if (date !== null) {
				var dateInUnsignedTemplatesPattern = mw.RegExp.escape(date)
					.replace(/ \\\(UTC\\\)$/, '(?: \\(UTC\\))?');
				return new RegExp(
					// Caution: invisible character in [ ‎].
					cd.config.USER_NAME_PATTERN + authorPattern + '[|\\]#].*' + mw.RegExp.escape(date) + '[  \t]*(?:\}\}|</small>)?[  \t]*|' +
					'\\{\\{ *(?:[uU]nsigned(?:IP)?2|[нН]еподписано|[нН]пп) *\\| *' + dateInUnsignedTemplatesPattern +
						'[ ‎]*\\|[ ‎]*' + authorPattern + ' *\\}\\}[  \t]*|' +
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
		
		generateAuthorSelector: function (author) {
			var authorEncoded = $.escapeSelector(encodeURIComponent(author.replace(/ /g, '_')));
			return (
				'a[href^="/wiki/%D0%A3%D1%87%D0%B0%D1%81%D1%82%D0%BD%D0%B8%D0%BA:' + authorEncoded + '"]:not(a[href^="/wiki/%D0%A3%D1%87%D0%B0%D1%81%D1%82%D0%BD%D0%B8%D0%BA:' + authorEncoded + '/"]), ' +
				'a[href^="/wiki/%D0%A3%D1%87%D0%B0%D1%81%D1%82%D0%BD%D0%B8%D1%86%D0%B0:' + authorEncoded + '"]:not(a[href^="/wiki/%D0%A3%D1%87%D0%B0%D1%81%D1%82%D0%BD%D0%B8%D1%86%D0%B0:' + authorEncoded + '/"]), ' +
				'a[href^="/wiki/%D0%9E%D0%B1%D1%81%D1%83%D0%B6%D0%B4%D0%B5%D0%BD%D0%B8%D0%B5_%D1%83%D1%87%D0%B0%D1%81%D1%82%D0%BD%D0%B8%D0%BA%D0%B0:' + authorEncoded +'"]:not(a[href^="/wiki/%D0%9E%D0%B1%D1%81%D1%83%D0%B6%D0%B4%D0%B5%D0%BD%D0%B8%D0%B5_%D1%83%D1%87%D0%B0%D1%81%D1%82%D0%BD%D0%B8%D0%BA%D0%B0:' + authorEncoded +'/"]), ' +
				'a[href^="/wiki/%D0%9E%D0%B1%D1%81%D1%83%D0%B6%D0%B4%D0%B5%D0%BD%D0%B8%D0%B5_%D1%83%D1%87%D0%B0%D1%81%D1%82%D0%BD%D0%B8%D1%86%D1%8B:' + authorEncoded +'"]:not(a[href^="/wiki/%D0%9E%D0%B1%D1%81%D1%83%D0%B6%D0%B4%D0%B5%D0%BD%D0%B8%D0%B5_%D1%83%D1%87%D0%B0%D1%81%D1%82%D0%BD%D0%B8%D1%86%D1%8B:' + authorEncoded +'/"]), ' +
				'a[href^="/wiki/%D0%A1%D0%BB%D1%83%D0%B6%D0%B5%D0%B1%D0%BD%D0%B0%D1%8F:%D0%92%D0%BA%D0%BB%D0%B0%D0%B4/' + authorEncoded + '"]:not(a[href^="/wiki/%D0%A1%D0%BB%D1%83%D0%B6%D0%B5%D0%B1%D0%BD%D0%B0%D1%8F:%D0%92%D0%BA%D0%BB%D0%B0%D0%B4/' + authorEncoded + '/"]), ' +
				'a[href^="/w/index.php?title=%D0%A3%D1%87%D0%B0%D1%81%D1%82%D0%BD%D0%B8%D0%BA:' + authorEncoded + '"]:not(a[href^="/w/index.php?title=%D0%A3%D1%87%D0%B0%D1%81%D1%82%D0%BD%D0%B8%D0%BA:' + authorEncoded + '/"]), ' +
				'a[href^="/w/index.php?title=%D0%A3%D1%87%D0%B0%D1%81%D1%82%D0%BD%D0%B8%D1%86%D0%B0:' + authorEncoded + '"]:not(a[href^="/w/index.php?title=%D0%A3%D1%87%D0%B0%D1%81%D1%82%D0%BD%D0%B8%D1%86%D0%B0:' + authorEncoded + '/"]), ' +
				'a[href*="/wiki/User:' + authorEncoded + '"]:not(a[href*="/wiki/User:' + authorEncoded + '/"])'
			);
		},
		
		elementsToText: function (elements, classesToFilter) {
			classesToFilter = classesToFilter || [];
			
			return elements
				.map(function (el, index) {
					if (el.nodeType === Node.ELEMENT_NODE) {
						for (var i = 0; i < el.classList.length; i++) {
							if (classesToFilter.includes(el.classList[i])) return '';
						}
					}
					
					var value = el.textContent;
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
		
		updatePageContent: function (html, anchor) {
			cd.env.underlayersContainer.innerHTML = '';
			cd.env.linksUnderlayersContainer.innerHTML = '';
			cd.env.underlayers = [];
			
			debug.endTimer('получение HTML');
			
			debug.startTimer('заливка HTML');
			
			cd.env.$content.html(html);
			mw.hook('wikipage.content').fire(cd.env.$content);
			parse(typeof anchor === 'string' && anchor);
		},
		
		reloadPage: function (anchor) {
			debug.initTimers();
			
			debug.startTimer('общее время');
			
			debug.startTimer('получение HTML');
			
			requestOptions();
			
			if (cd.settings.showLoadingOverlay !== false) {
				cd.env.setLoadingOverlay();
			}
			
			return cd.env.parseCurrentPage()
				.done(function (html) {
					cd.env.updatePageContent(html, anchor);
				});
		},
		
		parseCurrentPage: function () {
			var request = new mw.Api().get({
				action: 'parse',
				page: cd.env.CURRENT_PAGE,
				prop: 'text',
				formatversion: 2,
			})
				.then(
					function (data) {
						var error = data.error &&
							data.error.code &&
							data.error.info &&
							data.error.code + ': ' + data.error.info;
						if (error) {
							return $.Deferred().reject(['api', error]).promise();
						}
						
						var text = data &&
							data.parse &&
							data.parse.text;
						if (!text) {
							return $.Deferred().reject(['api', 'no data']).promise();
						}
						
						return text;
					},
					function (jqXHR, textStatus, errorThrown) {
						return $.Deferred().reject(['network', [jqXHR, textStatus, errorThrown]]).promise();
					}
				);
			
			// To make the page marked as read in the watchlist.
			$.get(mw.util.getUrl(cd.env.CURRENT_PAGE));
			
			return request;
		},
		
		loadPageCode: function (title) {
			if (title instanceof mw.Title) {
				title = title.toString();
			}
			var queryTimestamp = $.now();
			
			return new mw.Api().get({
				action: 'query',
				titles: title,
				prop: 'revisions',
				rvprop: 'content|timestamp',
				redirects: true,
				formatversion: 2,
			})
				.then(
					function (data) {
						var error = data.error &&
							data.error.code &&
							data.error.info &&
							data.error.code + ': ' + data.error.info;
						if (error) {
							return $.Deferred().reject(['api', error]).promise();
						}
						
						var query = data.query;
						if (!query) {
							return $.Deferred().reject(['api', 'no data']).promise();
						}
						
						var page = query &&
							query.pages &&
							query.pages[0];
						var revision = page &&
							page.revisions &&
							page.revisions[0];
						
						if (page.missing) {
							return $.Deferred().reject(['api', 'missing']).promise();
						}
						
						if (page.invalid) {
							return $.Deferred().reject(['api', 'invalid']).promise();
						}
						
						var code = revision && revision.content;
						var timestamp = revision && revision.timestamp;
						var redirectTarget = query &&
							query.redirects &&
							query.redirects[0] &&
							query.redirects[0].to;
						
						return {
							code: code,
							timestamp: timestamp,
							redirectTarget: redirectTarget,
							queryTimestamp: queryTimestamp,
						};
					},
					function (jqXHR, textStatus, errorThrown) {
						return $.Deferred().reject(['network', [jqXHR, textStatus, errorThrown]]).promise();
					}
				);
		},
		
		registerSeenMsgs: function () {
			// Don't run the handler of an event more than once in 100ms, otherwise the scrolling may be slowed down.
			if (!cd.env.newestCount || cd.env.scrollHandleTimeout) return;
			
			cd.env.scrollHandleTimeout = true;
			// 100 seems to a reasonable value.
			setTimeout(function () {
				cd.env.scrollHandleTimeout = false;
				
				var foundMsg = cd.env.findMsgInViewport();
				if (!foundMsg) return;
				var foundMsgId = foundMsg.id;
				
				var msg;
				// Back
				for (var i = foundMsgId - 1; i >= 0; i--) {
					msg = cd.msgs[i];
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
				for (i = foundMsgId; i < cd.msgs.length; i++) {
					msg = cd.msgs[i];
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

		genericErrorHandler: function (errorType, data) {
			switch (errorType) {
				case 'parse':
					this.abort(data, null, null, retryLoad);
					break;
				case 'api':
					var text;
					switch (data) {
						case 'missing':
							text = 'Текущая страница была удалена.';
							break;
						default:
							text = 'Неизвестная ошибка API: ' + data + '.';
							break;
					}
					this.abort('Не удалось загрузить сообщение. ' + text, data, null, retryLoad);
					break;
				case 'network':
					this.abort('Не удалось загрузить сообщение (сетевая ошибка).', data, null, retryLoad);
					break;
				default:
					this.abort('Не удалось загрузить сообщение (неизвестная ошибка).', data, null, retryLoad);
					break;
			}
		},

		Exception: function (message) {
			this.name = 'Exception';
			this.message = message;
			this.stack = (new Error()).stack;
		},
	});
	
	
	// jQuery extensions
	
	$.fn.cdRemoveNonTagNodes = function () {
		return $(this).filter(function () {
			return this.nodeType === Node.ELEMENT_NODE;
		});
	};
	
	$.fn.cdScrollTo = function (positionOnScreen, callback, nonSmooth, yCorrection) {
		cd.env.scrollHandleTimeout = true;
		yCorrection = yCorrection || 0;
		
		var $el = $(this).cdRemoveNonTagNodes();
		if (!$el.is(':visible')) {
			// If the message that we need to scroll to is being edited.
			if ($el.prev().hasClass('cd-msgForm')) {
				$el = $el.prev();
			}
		}
		positionOnScreen = positionOnScreen || 'top';
		
		var offset;
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
		
		if (!nonSmooth) {
			$('body, html').animate({
				scrollTop: offset
			}, {
				complete: function () {
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
	};
	
	$.fn.cdIsInViewport = function (partly) {
		var $elements = $(this).cdRemoveNonTagNodes();
		
		// Workaround
		var wasHidden = false;
		if ($elements.length === 1 && $elements.css('display') === 'none') {
			wasHidden = true;
			$elements.show();
		}
		
		var elementTop = $elements.first().offset().top;
		var elementBottom = $elements.last().offset().top + $elements.last().height();
		
		if (wasHidden) {
			$elements.hide();
		}
		
		var viewportTop = $(window).scrollTop();
		var viewportBottom = viewportTop + $(window).height();
		
		if (!partly) {
			return elementBottom < viewportBottom && elementTop > viewportTop;
		} else {
			return elementTop < viewportBottom && elementBottom > viewportTop;
		}
	};
	
	$.fn.cdAddCloseButton = function (blockName, msg) {
		var $obj = $(this);
		
		var $closeButton = $('<a>')
			.attr('title', 'Закрыть ' + blockName)
			.addClass('cd-closeButton')
			.css('display', 'none')
			.click(function () {
				$obj.children('.mw-parser-output, table.diff').cdFadeOut('fast', function () {
					$obj.empty();
				}, msg);
			});
		$obj
			.prepend($closeButton)
			.mouseenter(function () {
				$closeButton.fadeIn('fast');
			})
			.mouseleave(function () {
				$closeButton.fadeOut('fast');
			});
		
		return $(this);
	};
	
	// Our own animation functions, taking the redrawal of underlayers into account.
	$.fn.cdHide = function (msg) {
		if (!msg) {
			msg = cd.env.findMsgInViewport();
		}
		
		$(this).hide();
		
		if (msg) {
			msg.prepareUnderlayersInViewport(false);
			msg.updateUnderlayersInViewport(false);
		}
		
		return $(this);
	};
	
	$.fn.cdShow = function (msg) {
		if (!msg) {
			msg = cd.env.findMsgInViewport();
		}
		
		if (msg) {
			msg.prepareUnderlayersInViewport(false);
		}
		
		$(this).show();
		
		if (msg) {
			msg.updateUnderlayersInViewport(false);
		}
		
		return $(this);
	};
	
	$.fn.cdSlideDown = function (duration, msg) {
		if (!msg) {
			msg = cd.env.findMsgInViewport();
		}
		if (msg) {
			msg.prepareUnderlayersInViewport(true);
		}
		
		$(this).slideDown(duration, function () {
			if (msg) {
				msg.updateUnderlayersInViewport(true);
			}
		});
		
		return $(this);
	};
	
	$.fn.cdSlideUp = function (duration, callback, msg) {
		if (!msg) {
			msg = cd.env.findMsgInViewport();
		}
		if (msg) {
			msg.prepareUnderlayersInViewport(true, 0);
		}
		
		$(this).slideUp(duration, function () {
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
	};
	
	$.fn.cdFadeIn = function (duration, msg) {
		if (!msg) {
			msg = cd.env.findMsgInViewport();
		}
		
		if (msg) {
			msg.prepareUnderlayersInViewport(false);
		}
		
		$(this).fadeIn(duration);
		
		if (msg) {
			msg.updateUnderlayersInViewport(false);
		}
		
		return $(this);
	};
	
	$.fn.cdFadeOut = function (duration, callback, msg) {
		if (!msg) {
			msg = cd.env.findMsgInViewport();
		}
		
		$(this).fadeOut(duration, function () {
			if (callback) {
				callback();
			}
			if (msg) {
				msg.prepareUnderlayersInViewport(false);
				msg.updateUnderlayersInViewport(false);
			}
		});
		
		return $(this);
	};
	
	$.fn.cdHtml = function (html, msg) {
		if (!msg) {
			msg = cd.env.findMsgInViewport();
		}
		
		if (msg) {
			msg.prepareUnderlayersInViewport(false);
		}
		
		$(this).html(html);
		
		if (msg) {
			msg.updateUnderlayersInViewport(false);
		}
		
		return $(this);
	};
	
	$.fn.cdAppend = function (content, msg) {
		if (!msg) {
			msg = cd.env.findMsgInViewport();
		}
		
		if (msg) {
			msg.prepareUnderlayersInViewport(false);
		}
		
		$(this).append(content);
		
		if (msg) {
			msg.updateUnderlayersInViewport(false);
		}
		
		return $(this);
	};
	
	$.fn.cdAppendTo = function (content, msg) {
		if (!msg) {
			msg = cd.env.findMsgInViewport();
		}
		
		if (msg) {
			msg.prepareUnderlayersInViewport(false);
		}
		
		$(this).appendTo(content);
		
		if (msg) {
			msg.updateUnderlayersInViewport(false);
		}
		
		return $(this);
	};
	
	$.fn.cdRemove = function (msg) {
		if (!msg) {
			msg = cd.env.findMsgInViewport();
		}
		
		$(this).remove();
		
		if (msg) {
			msg.prepareUnderlayersInViewport(false);
			msg.updateUnderlayersInViewport(false);
		}
		
		return $(this);
	};
	
	$.fn.cdEmpty = function (msg) {
		if (!msg) {
			msg = cd.env.findMsgInViewport();
		}
		if (!msg) return;
		
		$(this).empty();
		
		if (msg) {
			msg.prepareUnderlayersInViewport(false);
			msg.updateUnderlayersInViewport(false);
		}
		
		return $(this);
	};

	cd.env.Exception.prototype = new Error();
	
	debug.endTimer('приготовления');
	
	
	/* Main code */
	
	// Here and below vanilla JavaScript is used for recurring operations that together take up a lot of time.
	
	debug.startTimer('основной код');

	cd.parse = {};
	
	cd.parse.closedDiscussions = cd.env.$content.find('.ruwiki-closedDiscussion').get();
	cd.parse.pageHasOutdents = !!cd.env.$content.find('.outdent-template').length;
	
	var blocksToExcludeSelector = 'blockquote, ' + cd.config.BLOCKS_TO_EXCLUDE_CLASSES.map(function (s) {
		return '.' + s;
	}).join(', ');
	var blocksToExclude = cd.env.$content.find(blocksToExcludeSelector).get();
	
	var potentialDateContainers = cd.env.contentElement.querySelectorAll('li, dd, p, div');
	var dateContainers = [];
	var potentialDateContainer, pmChildNodes, pmChildNode, pmChildNodeText, broken;
	for (var i = 0; i < potentialDateContainers.length; i++) {
		potentialDateContainer = potentialDateContainers[i];
		pmChildNodes = potentialDateContainer.childNodes;
		
		for (var j = pmChildNodes.length - 1; j >= 0; j--) {
			pmChildNode = pmChildNodes[j];
			pmChildNodeText = pmChildNode.textContent;
			if ((pmChildNode.nodeType === Node.TEXT_NODE || cd.env.isInline(pmChildNode)) &&
				(pmChildNodeText.includes('(UTC)') ||
					pmChildNodeText.includes('Эта реплика добавлена') ||
					pmChildNodeText === 'обс.'
				)
			) {
				broken = false;
				for (var k = 0; k < blocksToExclude.length; k++) {
					if (blocksToExclude[k].contains(potentialDateContainer) ||
						(cd.env.EVERYTHING_MUST_BE_FROZEN && potentialDateContainer.className.includes('boilerplate'))
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
		var $underlayersContainer = $('<div>').attr('id', 'cd-underlayersContainer');
		$('.mw-body').prepend($underlayersContainer);
		cd.env.underlayersContainer = $underlayersContainer[0];
		
		cd.env.updateUnderlayersCorrection();
		
		// "#cd-linksUnderlayersContainer" element must be placed outside of all elements with z-index set.
		// In Vector, a common container for "underlayers" and "links underlayers" can be used, but in Monobook,
		// a separate container on the topmost level is needed.
		var $linksUnderlayersContainer = $('<div>').attr('id', 'cd-linksUnderlayersContainer');
		$('body').prepend($linksUnderlayersContainer);
		cd.env.linksUnderlayersContainer = $linksUnderlayersContainer[0];
	}
	
	cd.parse.currentMsgId = 0;
	var msg;
	for (i = 0; i < dateContainers.length; i++) {
		try {
			msg = new Msg(dateContainers[i]);
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
	
	function collapseAdjacentMsgLevels(levels) {
		if (!levels || !levels[0]) return;
		debug.startTimer('collapse');
		
		function changeElementType(element, newType) {
			var newElement = document.createElement(newType);
			
			while (element.firstChild) {
				newElement.appendChild(element.firstChild);
			}
			
			var id;
			if (element.classList.contains('cd-msgPart')) {
				id = Number(element.getAttribute('data-id'));
				newElement.onmouseenter = element.onmouseenter;
				newElement.onmouseleave = element.onmouseleave;
			}
			for (var i = 0, a = element.attributes; i < a.length; i++) {
				newElement.setAttribute(a[i].name, a[i].value);
			}
			
			element.parentNode.replaceChild(newElement, element);
			
			if (id) {
				var msg = cd.msgs[id];
				for (i = msg.elements.length - 1; i >= 0; i--) {
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
		}
		
		var bottomElement, topElement, currentTopElement, currentBottomElement, topTag, bottomInnerTags, child,
			newChild, firstMoved;
		for (var i = 0; i < levels.length; i++) {
			bottomElement = levels[i];
			topElement = bottomElement.previousElementSibling;
			// If the previous element was removed in this cycle. (Or it could be absent for some other reason?
			// There was a case where the element was absent.)
			if (!topElement) continue;
			currentTopElement = topElement;
			currentBottomElement = bottomElement;
			
			do {
				topTag = currentTopElement.tagName;
				bottomInnerTags = {};
				switch (topTag) {
					case 'UL':
						bottomInnerTags.DD = 'LI';
						break;
					case 'DL':
						bottomInnerTags.LI = 'DD';
						break;
				}
				
				firstMoved = null;
				if ((currentTopElement.classList.contains('cd-msgLevel') && currentTopElement.tagName !== 'OL') ||
					currentTopElement.querySelector('.cd-msgLevel:not(ol)')
				) {
					while (currentBottomElement.childNodes.length) {
						child = currentBottomElement.firstChild;
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
								newChild = document.createElement('span');
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
	}

	collapseAdjacentMsgLevels(cd.env.contentElement.querySelectorAll('.cd-msgLevel:not(ol) + .cd-msgLevel:not(ol)'));
	collapseAdjacentMsgLevels(cd.env.contentElement.querySelectorAll('.cd-msgLevel:not(ol) + .cd-msgLevel:not(ol)'));
	if (cd.env.contentElement.querySelectorAll('.cd-msgLevel:not(ol) + .cd-msgLevel:not(ol)').length) {
		console.error('Остались соседства .cd-msgLevel.');
	}
	
	var elements = document.getElementsByClassName('ruwiki-msgIndentation-minus1level');
	var element, currentElement, bgcolor;
	for (i = 0; i < elements.length; i++) {
		element = elements[i];
		currentElement = element;
		while (currentElement && currentElement !== cd.env.contentElement && (!bgcolor || !bgcolor.includes('rgb('))) {
			currentElement = currentElement.parentElement;
			bgcolor = currentElement.style.backgroundColor;
		}
		element.style.backgroundColor = bgcolor || '#fff';
		if (element.classList.contains('cd-msgPart')) {
			element.style.margin = '0';
		}

	}
	
	mw.hook('cd.msgsReady').fire(cd.msgs);
	
	var ARTICLE_ID = mw.config.get('wgArticleId');
	cd.env.watchedTopicsPromise = cd.env.getWatchedTopics()
		.done(function (gotWatchedTopics) {
			cd.env.watchedTopics = gotWatchedTopics;
			cd.env.thisPageWatchedTopics = cd.env.watchedTopics && cd.env.watchedTopics[ARTICLE_ID] || [];
			if (!cd.env.thisPageWatchedTopics.length) {
				cd.env.watchedTopics[ARTICLE_ID] = cd.env.thisPageWatchedTopics;
			}
		})
		.fail(function () {
			console.error('Не удалось загрузить настройки с сервера');
		});
	
	cd.parse.currentSectionId = 0;
	var preHeadings = cd.env.contentElement.querySelectorAll('h2, h3, h4, h5, h6');
	var headings = [];
	var preHeading;
	for (i = 0; i < preHeadings.length; i++) {
		preHeading = preHeadings[i];
		if (preHeading.querySelector('.mw-headline')) {
			headings.push(preHeading);
		}
	}
	
	var section;
	for (i = 0; i < headings.length; i++) {
		try {
			section = new Section(headings[i], i === headings.length - 1);
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
	
	for (var i = 0; i < cd.msgs.length; i++) {
		if (!cd.msgs[i].isOpeningSection) {
			cd.msgs[i].isOpeningSection = false;
		}
	}
	
	var subsections;
	var replyButtonA, sectionWithLastReplyButton;
	for (i = 0; i < cd.sections.length; i++) {
		subsections = [];
		section = cd.sections[i];
		for (var j = i + 1; j < cd.sections.length; j++) {
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
			if (subsections.length && !subsections[subsections.length - 1].frozen) {
				sectionWithLastReplyButton = subsections[subsections.length - 1];
			} else {
				sectionWithLastReplyButton = section;
			}
			replyButtonA = sectionWithLastReplyButton.$replyButtonContainer &&
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
	
	// Describe all floating elements on page in order to calculate right border (temporarily setting
	// overflow: hidden) for all messages that they intersect with.
	var floatingElementsNodeList = cd.env.contentElement.querySelectorAll(
		'.tright, .floatright, .infobox, *[style*="float:right"], *[style*="float: right"]'
	);
	var floatingElement;
	cd.env.floatingElements = [];
	for (i = 0; i < floatingElementsNodeList.length; i++) {
		floatingElement = floatingElementsNodeList[i];
		// Hardcodely delete all known elements. They should probably be assigned a class, like "cd-ignoreFloating".
		if (!(floatingElement.tagName === 'SPAN' ||
			floatingElement.classList.contains('mw-collapsible-toggle') ||
			floatingElement.style.padding === '1em 21px 0.5em' ||
			floatingElement.style.margin === '-4px 0px 0px 0.5em'
		)) {
			cd.env.floatingElements.push(floatingElement);
		}
	}
	
	var msgAnchor = cd.env.firstRun ? isMsgFragment && decodedFragment : msgAnchorToScrollTo;
	if (msgAnchor) {
		var $targetMsg = $('[id="' + $.escapeSelector(msgAnchor) + '"]');
		if (cd.env.firstRun && !$targetMsg.length) {  // By a link from the watchlist
			var msgDataMatches = msgAnchor.match(/^(\d\d\d\d)(\d\d)(\d\d)(\d\d)(\d\d)_(.+)$/);
			var year = Number(msgDataMatches[1]);
			var month = Number(msgDataMatches[2]) - 1;
			var day = Number(msgDataMatches[3]);
			var hours = Number(msgDataMatches[4]);
			var minutes = Number(msgDataMatches[5]);
			var author = msgDataMatches[6];
			
			var date = new Date(year, month, day, hours, minutes);
			
			var dateToFind;
			for (var gap = 1; gap <= 5; gap++) {
				dateToFind = new Date(date.getTime() - cd.env.MILLISECONDS_IN_A_MINUTE * gap);
				msgAnchor = cd.env.generateMsgAnchor(
					dateToFind.getFullYear(),
					dateToFind.getMonth(),
					dateToFind.getDate(),
					dateToFind.getHours(),
					dateToFind.getMinutes(),
					author
				);
				$targetMsg = $('[id="' + $.escapeSelector(msgAnchor) + '"]');
				if ($targetMsg.length) {
					break;
				}
			}
		}
		
		if ($targetMsg.length) {
			msg = cd.getMsgByAnchor(msgAnchor);
			if (msg) {
				// setTimeout is for Firefox – otherwise, it positions the underlayer incorrectly.
				setTimeout(function (msg) {
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
				.mouseenter(function () {
					cd.env.mouseOverUpdatePanel = true;
				})
				.mouseleave(function () {
					cd.env.mouseOverUpdatePanel = false;
				});
			cd.env.$refreshButton = $('<div>')
				.attr('id', 'cd-updatePanel-refreshButton')
				.attr('title', 'Обновить страницу')
				.appendTo(cd.env.$updatePanel)
				.click(function () {
					if (!cd.getLastActiveAlteredMsgForm()) {
						reloadPage();
					} else {
						if (confirm('На странице имеются неотправленные формы. Перезагрузить страницу всё равно?')) {
							reloadPage();
						} else {
							var lastActiveAlteredMsgForm = cd.getLastActiveAlteredMsgForm();
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
			.done(function (visits) {
				cd.env.newestCount = 0;
				cd.env.newCount = 0;
				
				var thisPageVisits = visits && visits[ARTICLE_ID] || [];
				var firstVisit;
				
				var currentUnixTime = Math.floor($.now() / 1000);
				
				if (thisPageVisits.length) {
					firstVisit = false;
					// Cleanup
					for (i = thisPageVisits.length - 1; i >= 0; i--) {
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
					for (i = 0; i < cd.env.floatingElements.length; i++) {
						cd.env.floatingRects[i] = cd.env.floatingElements[i].getBoundingClientRect();
					}
					
					var msgUnixTime, underlayerData;
					var underlayersToAdd = [];
					for (i = 0; i < cd.msgs.length; i++) {
						msg = cd.msgs[i];
						
						// + 60 to avoid situation when a message is considered read but it was added the same
						// minute with the last visit. This behaviour has a side effect: if you posted a message, it
						// will be marked as "new" the next time you visit until cd.env.HIGHLIGHT_NEW_INTERVAL
						// minutes pass.
						msgUnixTime = Math.floor(msg.timestamp / 1000);
						
						if (thisPageVisits.length &&
							msgUnixTime > thisPageVisits[thisPageVisits.length - 1] &&
							msg.author !== cd.env.CURRENT_USER
						) {
							msg.newness = 'newest';
							msg.seen = false;
							underlayerData = msg.configureUnderlayer(true);
							if (underlayerData) {
								underlayersToAdd.push(underlayerData);
							}
							msg.$underlayer[0].className += ' cd-underlayer-newest';
							cd.env.newestCount++;
							cd.env.newCount++;
						} else if (msgUnixTime > thisPageVisits[0]) {
							msg.newness = 'new';
							msg.seen = false;
							underlayerData = msg.configureUnderlayer(true);
							if (underlayerData) {
								underlayersToAdd.push(underlayerData);
							}
							msg.$underlayer[0].className += ' cd-underlayer-new';
							cd.env.newCount++;
						}
					}
					
					cd.env.floatingRects = [];
					
					for (i = 0; i < underlayersToAdd.length; i++) {
						cd.env.underlayersContainer.appendChild(underlayersToAdd[i].underlayer);
						cd.env.linksUnderlayersContainer.appendChild(underlayersToAdd[i].linksUnderlayer);
					}
				}
				
				thisPageVisits.push(currentUnixTime);
				
				cd.env.setVisits(visits)
					.fail(function (errorType, data) {
						if (errorType === 'internal' && data === 'sizelimit') {
							// Cleanup: remove oldest 1/3 of visits.
							var timestamps = [];
							for (var key in visits) {
								for (var i = 0; i < visits[key].length; i++) {
									timestamps.push(visits[key][i]);
							    }
							}
							timestamps.sort(function (a, b) {
								if (a > b) {
									return 1;
								} else {
									return -1;
								}
							});
							var boundary = timestamps[Math.floor(timestamps.length / 3)];
							
							for (var key in visits) {
								for (var i = visits[key].length - 1; i >= 0; i--) {
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
			.fail(function () {
				console.error('Не удалось загрузить настройки с сервера');
			});
	}
	
	if (cd.env.firstRun) {
		// mouseover allows to capture when the cursor is not moving but ends up above the element (for example,
		// as a result of scrolling). The handlers are in outer scope so that they don't run twice after each
		// refresh.
		$(document)
			.on('mousemove mouseover', cd.env.highlightFocused)
			.keydown(cd.env.globalKeyDownHandler);
		$(window)
			.on('resize orientationchange', cd.env.windowResizeHandler)
			.on('beforeunload', cd.env.beforeUnloadHandler);
		
		if (!cd.env.EVERYTHING_MUST_BE_FROZEN) {
			$(document).on('scroll resize orientationchange', cd.env.registerSeenMsgs);
			
			setInterval(function () {
				cd.env.recalculateUnderlayers(true);
			}, 500);
		}
		
		var defaultAdjustSizePrototype = OO.ui.MultilineTextInputWidget.prototype.adjustSize;
		OO.ui.MultilineTextInputWidget.prototype.adjustSize = function () {
			var initialHeight;
			if (this.cdMsgForm) {
				initialHeight = this.$input.outerHeight();
			}
			defaultAdjustSizePrototype.call(this);
			if (this.cdMsgForm && initialHeight !== this.$input.outerHeight()) {
				var msg = this.cdMsgForm.getTargetMsg(true, true);
				if (msg) {
					msg.prepareUnderlayersInViewport(false);
					msg.updateUnderlayersInViewport(false);
				}
			}
		};
	}
	
	function generateEditCommonJsLink() {
		return mw.util.getUrl('User:' + cd.env.CURRENT_USER + '/common.js', { action: 'edit' });
	}

	if (highlightLastMessagesEnabled && !mw.cookie.get('cd-hlmConflict')) {
		// Remove the results of work of [[Участник:Кикан/highlightLastMessages.js]]
		if (typeof messagesHighlightColor !== 'undefined') {
			var dummyElement = document.createElement('span');
			dummyElement.style.color = messagesHighlightColor;
			var hlmStyledElements = cd.env.contentElement.querySelectorAll(
				'.cd-msgPart[style="background-color: ' + dummyElement.style.color + ';"],' +
				'.cd-msgPart[style="background-color: ' + messagesHighlightColor + '"]'
			);
			for (i = 0; i < hlmStyledElements.length; i++) {
				hlmStyledElements[i].style.backgroundColor = null;
			}
		}
		
		mw.notify(
			cd.env.toJquerySpan('У вас подключён скрипт <a href="//ru.wikipedia.org/wiki/Участник:Кикан/highlightLastMessages.js">highlightLastMessages.js</a>, конфликтующий с функциональностью подсветки скрипта «Удобные дискуссии». Рекомендуется отключить его в <a href="' + generateEditCommonJsLink() + '">вашем common.js</a> (или другом файле настроек).'),
			{ autoHide: false }
		);
		mw.cookie.set('cd-hlmConflict', '1', { path: '/', expires: cd.env.SECONDS_IN_A_DAY * 30 });
	}
	
	if (typeof proceedToArchiveRunned !== 'undefined' &&
		!mw.cookie.get('cd-ptaConflict')
	) {
		mw.notify(
			cd.env.toJquerySpan('У вас подключён скрипт <a href="//ru.wikipedia.org/wiki/Участник:Jack_who_built_the_house/proceedToArchive.js">proceedToArchive.js</a>, функциональность которого включена в скрипт «Удобные дискуссии». Рекомендуется отключить его в <a href="' + generateEditCommonJsLink() + '">вашем common.js</a> (или другом файле настроек).'),
			{ autoHide: false }
		);
		mw.cookie.set('cd-ptaConflict', '1', { path: '/', expires: cd.env.SECONDS_IN_A_DAY * 30 });
	}
	
	if (document.querySelector('.localcomments[style="font-size: 95%; white-space: nowrap;"]')) {
		mw.notify(
			cd.env.toJquerySpan('Скрипт <a href="//ru.wikipedia.org/wiki/Участник:Александр_Дмитриев/comments_in_local_time_ru.js">comments in local time ru.js</a> выполняется раньше скрипта «Удобные дискуссии», что мешает работе последнего. Проследуйте инструкциям <a href="' + mw.util.getUrl(cd.env.HELP_LINK) + '#Совместимость">здесь</a>, чтобы обеспечить их совместимость.'),
			{ autoHide: false }
		);
	}
	
	cd.env.alwaysConfirmLeavingPage = false;
	if (mw.user.options.get('editondblclick')) {
		mw.loader.using('mediawiki.action.view.dblClickEdit').done(function () {
			$('#ca-edit').off('click');
			cd.env.alwaysConfirmLeavingPage = true;
		});
	}
	
	if (mw.user.options.get('editsectiononrightclick')) {
		mw.loader.using('mediawiki.action.view.rightClickEdit').done(function () {
			$('.mw-editsection a').off('click');
			cd.env.alwaysConfirmLeavingPage = true;
		});
	}
	
	mw.hook('cd.pageReady').fire(cd);
	
	if (cd.settings.showLoadingOverlay !== false) {
		cd.env.removeLoadingOverlay();
	}
	
	cd.env.firstRun = false;
	
	// The next line is useful for calculating the time for rendering: it won't run until everything gets rendered.
	// (getBoundingClientRect(), hovewer, could run a little earlier.)
	cd.env.contentElement.getBoundingClientRect();
	
	debug.endTimer('заключительный код и рендеринг');
	
	debug.endTimer('общее время');
	
	var baseTime = debug.timers['основной код'] + debug.timers['заключительный код и рендеринг'];
	var timePerMsg = baseTime / cd.msgs.length;
	
	var totalTime = debug.timers['общее время'];
	
	debug.logAndResetTimer('общее время');
	console.log('число сообщений: ' + cd.msgs.length);
	console.log('на одно сообщение: ' + timePerMsg.toFixed(1));
	debug.logAndResetTimers();
	
	for (i = 0; i < debug.abstractCounters.length; i++) {
		if (debug.abstractCounters[i] !== null) {
			console.log('счётчик ' + i + ': ' + debug.abstractCounters[i]);
		}
	}
	
	for (i = 0; i < debug.abstractGlobalVars.length; i++) {
		console.log('глобальная переменная ' + i + ': ' + debug.abstractGlobalVars[i]);
	}
	
	var comparativeValue = 4 / 1;  // ms / message
	var currentValue = totalTime / cd.msgs.length;
	console.log(Math.round((currentValue / comparativeValue) * 100) + '% от ориентировочного значения');
}