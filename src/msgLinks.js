export default function msgLinks() {
	function addMsgLinks($content) {
		// Occurs in the watchlist when mediawiki.rcfilters.filters.ui module for some reason fires
		// wikipage.content for the second time with an element that is not in the DOM,
		// fieldset#mw-watchlist-options (in  mw.rcfilters.ui.FormWrapperWidget.prototype.onChangesModelUpdate
		// function).
		if (!$content.parent().length) return;
		
		if (mw.config.get('wgCanonicalSpecialPageName') === 'Watchlist') {
			var lines = $content[0].querySelectorAll('.mw-changeslist-line:not(.mw-collapsible)');
			var line, nsMatches, nsNumber, minorMark, botMark, comment, commentText, isNested,
				bytesAddedElement, bytesAddedMatches, bytesAdded, date, author, anchor, linkElement, link,
				pageName, wrapper, destination, thisPageWatchedTopics, isWatched, curLink, curIdMatches, curId;
			var blueIconsPresent = false;
			for (var i = 0; i < lines.length; i++) {
				line = lines[i];
				
				nsMatches = line.className.match(/mw-changeslist-ns(\d+)/);
				nsNumber = nsMatches && Number(nsMatches[1]);
				if (nsNumber === undefined || !cd.env.isDiscussionNamespace(nsNumber)) {
					continue;
				}
				
				minorMark = line.querySelector('.minoredit');
				if (minorMark) continue;
				
				botMark = line.querySelector('.botedit');
				comment = line.querySelector('.comment');
				commentText = comment && comment.textContent;
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
				
				isNested = line.tagName === 'TR';
				
				bytesAddedElement = line.querySelector('.mw-plusminus-pos');
				if (!bytesAddedElement) {
					continue;
				}
				if (bytesAddedElement.tagName !== 'STRONG') {
					bytesAddedMatches = bytesAddedElement.textContent.match(/\d+/);
					bytesAdded = bytesAddedMatches && Number(bytesAddedMatches[0]);
					if (!bytesAdded || bytesAdded < 50) {
						continue;
					}
				}
				
				date = line.getAttribute('data-mw-ts');
				date = date && date.slice(0, 12);
				if (!date) {
					continue;
				}
				
				author = line.querySelector('.mw-userlink');
				author = author && author.textContent;
				if (!author || author === 'MediaWiki message delivery') {
					continue;
				}
				
				anchor = date + '_' + author.replace(/ /g, '_');
				
				linkElement = (!isNested ? line : line.parentElement).querySelector('.mw-changeslist-title');
				pageName = linkElement.textContent;
				if ((nsNumber === 4 || nsNumber === 104) && !cd.config.DISCUSSION_PAGE_REGEXP.test(pageName)) {
					continue;
				}
				link = linkElement && linkElement.href;
				if (!link) {
					continue;
				}
				
				if (commentText && currentUserRegExp.test(' ' + commentText + ' ')) {
					wrapper = $wrapperBluePrototype[0].cloneNode(true);
					wrapper.lastChild.title = 'Ссылка на сообщение (сообщение адресовано вам)';
					blueIconsPresent = true;
				} else {
					isWatched = false;
					if (commentText) {
						curLink = line.querySelector('.mw-changeslist-diff-cur');
						curIdMatches = curLink &&
							curLink.href &&
							curLink.href.match(/[&?]curid=(\d+)/);
						curId = curIdMatches && Number(curIdMatches[1]);
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
				
				destination = line.querySelector('.mw-usertoollinks');
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
			
			var line, minorMark, comment, commentText, bytesAddedElement, bytesAddedMatches, bytesAdded,
				dateElement, timestamp, dateObj, year, month, day, hour, minute, date, author, anchor,
				linkElement, link, pageName, wrapper;
			for (var i = 0; i < lines.length; i++) {
				line = lines[i];
				
				linkElement = line.querySelector('.mw-contributions-title');
				pageName = linkElement.textContent;
				if (!(pageName.startsWith('Обсуждение ') && pageName.includes(':') ||
					(pageName.startsWith('Википедия:') || pageName.startsWith('Проект:')) &&
					cd.config.DISCUSSION_PAGE_REGEXP.test(pageName)
				)) {
					continue;
				}
				link = linkElement && linkElement.href;
				if (!link) continue;
				
				minorMark = line.querySelector('.minoredit');
				if (minorMark) continue;
				
				comment = line.querySelector('.comment');
				commentText = comment && comment.textContent;
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
				
				bytesAddedElement = line.querySelector('.mw-plusminus-pos');
				if (!bytesAddedElement) continue;
				if (bytesAddedElement.tagName !== 'STRONG') {
					bytesAddedMatches = bytesAddedElement.textContent.match(/\d+/);
					bytesAdded = bytesAddedMatches && Number(bytesAddedMatches[0]);
					if (!bytesAdded || bytesAdded < 50) continue;
				}
				
				dateElement = line.querySelector('.mw-changeslist-date');
				if (!dateElement) continue;
				timestamp = cd.env.getTimestampFromDate(dateElement.textContent, timezoneOffset);
				if (!timestamp) continue;
				
				dateObj = new Date(timestamp);
				year = dateObj.getUTCFullYear();
				month = dateObj.getUTCMonth();
				day = dateObj.getUTCDate();
				hour = dateObj.getUTCHours();
				minute = dateObj.getUTCMinutes();
				
				anchor = cd.env.generateMsgAnchor(year, month, day, hour, minute,
					mw.config.get('wgRelevantUserName'));
				
				if (commentText && currentUserRegExp.test(' ' + commentText + ' ')) {
					wrapper = $wrapperBluePrototype[0].cloneNode(true);
					wrapper.lastChild.title = 'Ссылка на сообщение (сообщение адресовано вам)';
				} else {
					isWatched = false;
					if (commentText) {
						curLink = line.querySelector('.mw-changeslist-diff-cur');
						curIdMatches = curLink &&
							curLink.href &&
							curLink.href.match(/[&?]curid=(\d+)/);
						curId = curIdMatches && Number(curIdMatches[1]);
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
			
			var line, minorMark, comment, commentText, bytesAddedElement, bytesAddedMatches, bytesAdded,
				dateElement, timestamp, dateObj, year, month, day, hour, minute, date, author, anchor,
				wrapper, separators, destination, isWatched, thisPageWatchedTopics;
			for (var i = 0; i < lines.length; i++) {
				line = lines[i];
				
				minorMark = line.querySelector('.minoredit');
				if (minorMark) continue;
				
				comment = line.querySelector('.comment');
				commentText = comment && comment.textContent;
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
				
				bytesAddedElement = line.querySelector('.mw-plusminus-pos');
				if (!bytesAddedElement) continue;
				if (bytesAddedElement.tagName !== 'STRONG') {
					bytesAddedMatches = bytesAddedElement.textContent.match(/\d+/);
					bytesAdded = bytesAddedMatches && Number(bytesAddedMatches[0]);
					if (!bytesAdded || bytesAdded < 50) continue;
				}
				
				dateElement = line.querySelector('.mw-changeslist-date');
				if (!dateElement) continue;
				timestamp = cd.env.getTimestampFromDate(dateElement.textContent, timezoneOffset);
				if (!timestamp) continue;
				
				dateObj = new Date(timestamp);
				year = dateObj.getUTCFullYear();
				month = dateObj.getUTCMonth();
				day = dateObj.getUTCDate();
				hour = dateObj.getUTCHours();
				minute = dateObj.getUTCMinutes();
				
				author = line.querySelector('.mw-userlink');
				author = author && author.textContent;
				if (!author || author === 'MediaWiki message delivery') continue;
				
				anchor = cd.env.generateMsgAnchor(year, month, day, hour, minute, author);
				
				if (commentText && currentUserRegExp.test(' ' + commentText + ' ')) {
					wrapper = $wrapperBluePrototype[0].cloneNode(true);
					wrapper.lastChild.title = 'Ссылка на сообщение (сообщение адресовано вам)';
				} else {
					isWatched = false;
					if (commentText) {
						thisPageWatchedTopics = watchedTopics && watchedTopics[ARTICLE_ID] || [];
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
				
				separators = line.querySelectorAll('.mw-changeslist-separator');
				destination = separators && separators[separators.length - 1];
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
	
	var currentUserRegExp = new RegExp(
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
				
				var area, minorMark, comment, commentText, dateElement, timestamp, dateObj, year, month, day, hour,
					minute, date, author, anchor, wrapper, destination;
				
				area = document.querySelector('.diff-ntitle');
				if (!area) return;
				
				minorMark = area.querySelector('.minoredit');
				if (minorMark) return;
				
				comment = area.querySelector('.comment');
				commentText = comment && comment.textContent;
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
				
				dateElement = area.querySelector('#mw-diff-ntitle1 a');
				if (!dateElement) return;
				timestamp = cd.env.getTimestampFromDate(dateElement.textContent, timezoneOffset);
				if (!timestamp) return;
				
				dateObj = new Date(timestamp);
				year = dateObj.getUTCFullYear();
				month = dateObj.getUTCMonth();
				day = dateObj.getUTCDate();
				hour = dateObj.getUTCHours();
				minute = dateObj.getUTCMinutes();
				
				author = area.querySelector('.mw-userlink');
				author = author && author.textContent;
				if (!author || author === 'MediaWiki message delivery') return;
				
				anchor = cd.env.generateMsgAnchor(year, month, day, hour, minute, author);
				
				if (commentText && currentUserRegExp.test(' ' + commentText + ' ')) {
					wrapper = $wrapperBluePrototype[0].cloneNode(true);
					wrapper.lastChild.title = 'Ссылка на сообщение (сообщение адресовано вам)';
				} else {
					isWatched = false;
					if (commentText) {
						curLink = line.querySelector('.mw-changeslist-diff-cur');
						curIdMatches = curLink &&
							curLink.href &&
							curLink.href.match(/[&?]curid=(\d+)/);
						curId = curIdMatches && Number(curIdMatches[1]);
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
								}
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
					msg = cd.getMsgByAnchor(anchor);
					if (msg) {
						msg.scrollToAndHighlightTarget();
						history.replaceState({}, '', '#' + anchor);
					}
				};
				
				destination = area.querySelector('#mw-diff-ntitle3');
				if (!destination) return;
				destination.insertBefore(wrapper, destination.firstChild);
				
				mw.hook('cd.msgLinksCreated').fire(cd);
			});
		}
	});
}