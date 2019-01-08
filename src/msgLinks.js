export default function msgLinks() {
	function addMsgLinks($content) {
		// Occurs in the watchlist when mediawiki.rcfilters.filters.ui module for some reason fires
		// wikipage.content for the second time with an element that is not in the DOM,
		// fieldset#mw-watchlist-options (in  mw.rcfilters.ui.FormWrapperWidget.prototype.onChangesModelUpdate
		// function).
		if (!$content.parent().length) return;
		
		if (mw.config.get('wgCanonicalSpecialPageName') === 'Watchlist') {
			var lines = $content[0].querySelectorAll('.mw-changeslist-line:not(.mw-collapsible)');
			var blueIconsPresent = false;
			for (var i = 0; i < lines.length; i++) {
				var line = lines[i];
				
				var nsMatches = line.className.match(/mw-changeslist-ns(\d+)/);
				var nsNumber = nsMatches && Number(nsMatches[1]);
				if (nsNumber === undefined || !cd.env.isDiscussionNamespace(nsNumber)) {
					continue;
				}
				
				var minorMark = line.querySelector('.minoredit');
				if (minorMark) continue;
				
				var botMark = line.querySelector('.botedit');
				var comment = line.querySelector('.comment');
				var commentText = comment && comment.textContent;
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
				
				var isNested = line.tagName === 'TR';
				
				var bytesAddedElement = line.querySelector('.mw-plusminus-pos');
				if (!bytesAddedElement) {
					continue;
				}
				if (bytesAddedElement.tagName !== 'STRONG') {
					var bytesAddedMatches = bytesAddedElement.textContent.match(/\d+/);
					var bytesAdded = bytesAddedMatches && Number(bytesAddedMatches[0]);
					if (!bytesAdded || bytesAdded < 50) {
						continue;
					}
				}
				
				var date = line.getAttribute('data-mw-ts');
				date = date && date.slice(0, 12);
				if (!date) {
					continue;
				}
				
				var author = line.querySelector('.mw-userlink');
				author = author && author.textContent;
				if (!author || author === 'MediaWiki message delivery') {
					continue;
				}
				
				var anchor = date + '_' + author.replace(/ /g, '_');
				
				var linkElement = (!isNested ? line : line.parentElement).querySelector('.mw-changeslist-title');
				var pageName = linkElement.textContent;
				if ((nsNumber === 4 || nsNumber === 104) && !cd.config.DISCUSSION_PAGE_REGEXP.test(pageName)) {
					continue;
				}
				var link = linkElement && linkElement.href;
				if (!link) {
					continue;
				}
				
				var wrapper;
				if (commentText && CURRENT_USER_REGEXP.test(' ' + commentText + ' ')) {
					wrapper = $wrapperBluePrototype[0].cloneNode(true);
					wrapper.lastChild.title = 'Ссылка на сообщение (сообщение адресовано вам)';
					blueIconsPresent = true;
				} else {
					var isWatched = false;
					if (commentText) {
						var curLink = line.querySelector('.mw-changeslist-diff-cur');
						var curIdMatches = curLink &&
							curLink.href &&
							curLink.href.match(/[&?]curid=(\d+)/);
						var curId = curIdMatches && Number(curIdMatches[1]);
						if (curId) {
							thisPageWatchedTopics = watchedTopics && watchedTopics[curId] || [];
							if (thisPageWatchedTopics.length) {
								for (var j = 0; j < thisPageWatchedTopics.length; j++) {
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
				
				var destination = line.querySelector('.mw-usertoollinks');
				if (!destination) {
					continue;
				}
				destination.parentElement.insertBefore(wrapper, destination.nextSibling);
			}
			
			if (blueIconsPresent) {
				var isEnhanced = !$('.mw-changeslist').find('ul.special').length;
				var interestingOnly = false;
				if (!$content.find('.mw-rcfilters-ui-changesLimitAndDateButtonWidget .cd-switchInterestingLink')
					.length
				) {
					var $wlinfo = $content.find('.wlinfo');
					var $switchInteresting = $('<a>').addClass('cd-switchInterestingLink');
					$switchInteresting
						.attr('title', 'Показать только сообщения в темах, за которыми я слежу, и адресованные мне')
						.click(function () {
							// This is for many watchlist types at once.
							var $collapsibles = $content
								.find('.mw-changeslist .mw-collapsible:not(.mw-changeslist-legend)');
							var $lines = $content.find('.mw-changeslist-line:not(.mw-collapsible)');
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
			var timezone = mw.user.options.get('timecorrection');
			var timezoneParts = timezone && timezone.split('|');
			var timezoneOffset = timezoneParts && Number(timezoneParts[1]);
			if (timezoneOffset == null || isNaN(timezoneOffset)) return;
			
			var list = $content[0].querySelector('.mw-contributions-list');
			var lines = list.children;
			
			for (var i = 0; i < lines.length; i++) {
				var line = lines[i];
				
				var linkElement = line.querySelector('.mw-contributions-title');
				var pageName = linkElement.textContent;
				if (!(pageName.startsWith('Обсуждение ') && pageName.includes(':') ||
					(pageName.startsWith('Википедия:') || pageName.startsWith('Проект:')) &&
					cd.config.DISCUSSION_PAGE_REGEXP.test(pageName)
				)) {
					continue;
				}
				var link = linkElement && linkElement.href;
				if (!link) continue;
				
				var minorMark = line.querySelector('.minoredit');
				if (minorMark) continue;
				
				var comment = line.querySelector('.comment');
				var commentText = comment && comment.textContent;
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
				
				var bytesAddedElement = line.querySelector('.mw-plusminus-pos');
				if (!bytesAddedElement) continue;
				if (bytesAddedElement.tagName !== 'STRONG') {
					var bytesAddedMatches = bytesAddedElement.textContent.match(/\d+/);
					var bytesAdded = bytesAddedMatches && Number(bytesAddedMatches[0]);
					if (!bytesAdded || bytesAdded < 50) continue;
				}
				
				var dateElement = line.querySelector('.mw-changeslist-date');
				if (!dateElement) continue;
				var timestamp = cd.env.getTimestampFromDate(dateElement.textContent, timezoneOffset);
				if (!timestamp) continue;
				
				var dateObj = new Date(timestamp);
				var year = dateObj.getUTCFullYear();
				var month = dateObj.getUTCMonth();
				var day = dateObj.getUTCDate();
				var hour = dateObj.getUTCHours();
				var minute = dateObj.getUTCMinutes();
				
				var anchor = cd.env.generateMsgAnchor(year, month, day, hour, minute,
					mw.config.get('wgRelevantUserName'));
				
				var wrapper;
				if (commentText && CURRENT_USER_REGEXP.test(' ' + commentText + ' ')) {
					wrapper = $wrapperBluePrototype[0].cloneNode(true);
					wrapper.lastChild.title = 'Ссылка на сообщение (сообщение адресовано вам)';
				} else {
					var isWatched = false;
					if (commentText) {
						var curLink = line.querySelector('.mw-changeslist-diff-cur');
						var curIdMatches = curLink &&
							curLink.href &&
							curLink.href.match(/[&?]curid=(\d+)/);
						var curId = curIdMatches && Number(curIdMatches[1]);
						if (curId) {
							var thisPageWatchedTopics = watchedTopics && watchedTopics[curId] || [];
							if (thisPageWatchedTopics.length) {
								for (var j = 0; j < thisPageWatchedTopics.length; j++) {
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
			var timezone = mw.user.options.get('timecorrection');
			var timezoneParts = timezone && timezone.split('|');
			var timezoneOffset = timezoneParts && Number(timezoneParts[1]);
			if (timezoneOffset == null || isNaN(timezoneOffset)) return;
			
			var list = $content[0].querySelector('#pagehistory');
			var lines = list.children;
			var link = mw.util.getUrl(cd.env.CURRENT_PAGE);
			
			var ARTICLE_ID = mw.config.get('wgArticleId');
			
			for (var i = 0; i < lines.length; i++) {
				var line = lines[i];
				
				var minorMark = line.querySelector('.minoredit');
				if (minorMark) continue;
				
				var comment = line.querySelector('.comment');
				var commentText = comment && comment.textContent;
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
				
				var bytesAddedElement = line.querySelector('.mw-plusminus-pos');
				if (!bytesAddedElement) continue;
				if (bytesAddedElement.tagName !== 'STRONG') {
					var bytesAddedMatches = bytesAddedElement.textContent.match(/\d+/);
					var bytesAdded = bytesAddedMatches && Number(bytesAddedMatches[0]);
					if (!bytesAdded || bytesAdded < 50) continue;
				}
				
				var dateElement = line.querySelector('.mw-changeslist-date');
				if (!dateElement) continue;
				var timestamp = cd.env.getTimestampFromDate(dateElement.textContent, timezoneOffset);
				if (!timestamp) continue;
				
				var dateObj = new Date(timestamp);
				var year = dateObj.getUTCFullYear();
				var month = dateObj.getUTCMonth();
				var day = dateObj.getUTCDate();
				var hour = dateObj.getUTCHours();
				var minute = dateObj.getUTCMinutes();
				
				var author = line.querySelector('.mw-userlink');
				author = author && author.textContent;
				if (!author || author === 'MediaWiki message delivery') continue;
				
				var anchor = cd.env.generateMsgAnchor(year, month, day, hour, minute, author);
				
				var wrapper;
				if (commentText && CURRENT_USER_REGEXP.test(' ' + commentText + ' ')) {
					wrapper = $wrapperBluePrototype[0].cloneNode(true);
					wrapper.lastChild.title = 'Ссылка на сообщение (сообщение адресовано вам)';
				} else {
					var isWatched = false;
					if (commentText) {
						var thisPageWatchedTopics = watchedTopics && watchedTopics[ARTICLE_ID] || [];
						if (thisPageWatchedTopics.length) {
							for (var j = 0; j < thisPageWatchedTopics.length; j++) {
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
				
				var separators = line.querySelectorAll('.mw-changeslist-separator');
				var destination = separators && separators[separators.length - 1];
				if (!destination) continue;
				destination.parentElement.insertBefore(wrapper, destination.nextSibling);
			}
		}
		
		mw.hook('cd.msgLinksCreated').fire(cd);
	}
	
	var $aBlackPrototype = $('<a>').addClass('cd-rcMsgLink cd-rcMsgLink-regular');
	var $aBluePrototype = $('<a>').addClass('cd-rcMsgLink cd-rcMsgLink-interesting');
	
	var $wrapperBlackPrototype = $('<span>')
		.addClass('cd-rcMsgLink-wrapper')
		.append($aBlackPrototype)
		[cd.env.IS_DIFF_PAGE ? 'append' : 'prepend'](document.createTextNode(' '));
	var $wrapperBluePrototype = $('<span>')
		.addClass('cd-rcMsgLink-wrapper')
		.append($aBluePrototype)
		[cd.env.IS_DIFF_PAGE ? 'append' : 'prepend'](document.createTextNode(' '));
	
	var CURRENT_USER_REGEXP = new RegExp(
		'[^A-ZА-ЯЁa-zа-яё]' +
		cd.env.generateCaseInsensitiveFirstCharPattern(cd.env.CURRENT_USER).replace(/ /g, '[ _]') +
		'[^A-ZА-ЯЁa-zа-яё]'
	);
	
	var watchedTopics;
	
	cd.env.getWatchedTopics().always(function (gotWatchedTopics) {
		watchedTopics = gotWatchedTopics;
		
		// Hook on wikipage.content to make the code work with the watchlist auto-update feature.
		mw.hook('wikipage.content').add(addMsgLinks);
		
		if (mw.config.get('wgIsArticle') && /[?&]diff=[^&]/.test(location.search)) {
			mw.hook('cd.pageReady').add(function () {
				var timezone = mw.user.options.get('timecorrection');
				var timezoneParts = timezone && timezone.split('|');
				var timezoneOffset = timezoneParts && Number(timezoneParts[1]);
				if (timezoneOffset == null || isNaN(timezoneOffset)) return;
				
				var area = document.querySelector('.diff-ntitle');
				if (!area) return;
				
				var minorMark = area.querySelector('.minoredit');
				if (minorMark) return;
				
				var comment = area.querySelector('.comment');
				var commentText = comment && comment.textContent;
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
				
				var dateElement = area.querySelector('#mw-diff-ntitle1 a');
				if (!dateElement) return;
				var timestamp = cd.env.getTimestampFromDate(dateElement.textContent, timezoneOffset);
				if (!timestamp) return;
				
				var dateObj = new Date(timestamp);
				var year = dateObj.getUTCFullYear();
				var month = dateObj.getUTCMonth();
				var day = dateObj.getUTCDate();
				var hour = dateObj.getUTCHours();
				var minute = dateObj.getUTCMinutes();
				
				var author = area.querySelector('.mw-userlink');
				author = author && author.textContent;
				if (!author || author === 'MediaWiki message delivery') return;
				
				var anchor = cd.env.generateMsgAnchor(year, month, day, hour, minute, author);
				
				var wrapper;
				if (commentText && CURRENT_USER_REGEXP.test(' ' + commentText + ' ')) {
					wrapper = $wrapperBluePrototype[0].cloneNode(true);
					wrapper.lastChild.title = 'Ссылка на сообщение (сообщение адресовано вам)';
				} else {
					var isWatched = false;
					if (commentText) {
						var curId = mw.config.get('wgArticleId');
						thisPageWatchedTopics = watchedTopics && watchedTopics[curId] || [];
						if (thisPageWatchedTopics.length) {
							for (var j = 0; j < thisPageWatchedTopics.length; j++) {
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
					var msg = cd.getMsgByAnchor(anchor);
					if (msg) {
						msg.scrollToAndHighlightTarget();
						history.replaceState({}, '', '#' + anchor);
					}
				};
				
				var destination = area.querySelector('#mw-diff-ntitle3');
				if (!destination) return;
				destination.insertBefore(wrapper, destination.firstChild);
				
				mw.hook('cd.msgLinksCreated').fire(cd);
			});
		}
	});
}