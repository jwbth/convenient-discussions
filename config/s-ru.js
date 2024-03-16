export default {
	messages: {
		'sun': 'вс',
		'mon': 'пн',
		'tue': 'вт',
		'wed': 'ср',
		'thu': 'чт',
		'fri': 'пт',
		'sat': 'сб',
		'sunday': 'воскресенье',
		'monday': 'понедельник',
		'tuesday': 'вторник',
		'wednesday': 'среда',
		'thursday': 'четверг',
		'friday': 'пятница',
		'saturday': 'суббота',
		'jan': 'янв',
		'feb': 'фев',
		'mar': 'мар',
		'apr': 'апр',
		'may': 'май',
		'jun': 'июн',
		'jul': 'июл',
		'aug': 'авг',
		'sep': 'сен',
		'oct': 'окт',
		'nov': 'ноя',
		'dec': 'дек',
		'january': 'январь',
		'february': 'февраль',
		'march': 'март',
		'april': 'апрель',
		'may_long': 'май',
		'june': 'июнь',
		'july': 'июль',
		'august': 'август',
		'september': 'сентябрь',
		'october': 'октябрь',
		'november': 'ноябрь',
		'december': 'декабрь',
		'january-gen': 'января',
		'february-gen': 'февраля',
		'march-gen': 'марта',
		'april-gen': 'апреля',
		'may-gen': 'мая',
		'june-gen': 'июня',
		'july-gen': 'июля',
		'august-gen': 'августа',
		'september-gen': 'сентября',
		'october-gen': 'октября',
		'november-gen': 'ноября',
		'december-gen': 'декабря',
		'parentheses': '($1)',
		'parentheses-start': '(',
		'parentheses-end': ')',
		'word-separator': ' ',
		'comma-separator': ', ',
		'colon-separator': ': ',
		'nextdiff': 'Следующая правка →',
		'timezone-utc': 'UTC',
		'pagetitle': '$1 — {{SITENAME}}',
		'discussiontools-topicsubscription-button-subscribe': 'подписаться',
		'discussiontools-topicsubscription-button-subscribe-tooltip': '{{GENDER:|Подпишитесь}}, чтобы получать уведомления о новых сообщениях.',
		'discussiontools-topicsubscription-button-unsubscribe': 'отписаться',
		'discussiontools-topicsubscription-button-unsubscribe-tooltip': '{{GENDER:|Отпишитесь}}, чтобы перестать получать уведомления.',
		'discussiontools-topicsubscription-notify-subscribed-title': '{{GENDER:|Вы}} подписались!',
		'discussiontools-topicsubscription-notify-subscribed-body': '{{GENDER:|Вы}} будете получать уведомления о новых сообщениях в этой теме.',
		'discussiontools-topicsubscription-notify-unsubscribed-title': '{{GENDER:|Вы}} отписались.',
		'discussiontools-topicsubscription-notify-unsubscribed-body': '{{GENDER:|Вы}} больше не будете получать уведомления о новых сообщениях в этой теме.',
		'discussiontools-newtopicssubscription-button-subscribe-label': 'Подписаться',
		'discussiontools-newtopicssubscription-button-subscribe-tooltip': 'Подпишитесь, чтобы получать уведомления о появлении новых тем на этой странице.',
		'discussiontools-newtopicssubscription-button-unsubscribe-label': 'Отписаться',
		'discussiontools-newtopicssubscription-button-unsubscribe-tooltip': 'Отмените подписку, чтобы больше не получать уведомления о создании новых тем на этой странице.',
		'discussiontools-newtopicssubscription-notify-subscribed-title': '{{GENDER:|Вы}} подписались!',
		'discussiontools-newtopicssubscription-notify-subscribed-body': '{{GENDER:|Вы}} будете получать уведомления о создании новых тем на этой странице.',
		'discussiontools-newtopicssubscription-notify-unsubscribed-title': '{{GENDER:|Вы}} отписались.',
		'discussiontools-newtopicssubscription-notify-unsubscribed-body': '{{GENDER:|Вы}} больше не будете получать уведомления о создании новых тем на этой странице.',
		'visualeditor-educationpopup-dismiss': 'Окей, понятно'
	},

	specialPageAliases: {
		'Contributions': 'Вклад',
		'Diff': 'Изменения',
		'PermanentLink': 'Постоянная_ссылка'
	},

	substAliases: [
		'подстановка:',
		'подст:'
	],

	timezone: 'UTC',

	useGlobalPreferences: true,

	unsignedTemplates: [
		'Нет подписи',
		'Unsigned',
		'UnsignedIP'
	],

	pairQuoteTemplates: [
		[
			'Начало цитаты'
		],
		[
			'Конец цитаты'
		]
	],

	paragraphTemplates: [
		'pb',
		'Абзац',
		'Paragraph break'
	],

	outdentTemplates: [
		'od',
		'Outdent'
	],

	clearTemplates: [
		'Clear'
	],

	noSignatureTemplates: [
		'Перенесено с',
		'Перенесено на'
	],

	closedDiscussionTemplates: [
		[
			'Закрыто',
			'Closed'
		],
		[]
	],
	signatureEndingRegexp: / \(обсуждение\)/,

	pageWhitelist: [
			/^Викитека:К удалению$/,
			/^Викитека:Форум/,
			/^Викитека:Администрирование$/,
			/^Викитека:Заявки на изменение прав$/,
			/^Викитека:Трибуна читателя/,
	],

	pageBlacklist: [
	],

	userNamespacesByGender: {
		female: 'Участница',
	},

	genderNeutralUserNamespaceAlias: 'У',

	archivePaths: [
		{
			source: 'Викитека:Форум',
			archive: 'Викитека:Форум/Архив-',
		},
		{
			source: 'Викитека:Авторское право',
			archive: 'Викитека:Форум/Авторское право/Архив-',
		},
		{
			source: 'Викитека:Администрирование',
			archive: 'Викитека:Форум/Администрирование/Архив-',
		},
		{
			source: 'Викитека:К удалению',
			archive: 'Викитека:К удалению/Архив',
		},
		{
			source: 'Викитека:Заявки на изменение прав',
			archive: 'Викитека:Заявки на изменение прав/Архив',
		},
		/\/Архив/,
		/\/Архив-/,
	],

	pagesWithoutArchives: [
		/^Викитека:К удалению\//,
	],

	idleFragments: [/^Преамбула$/],

	defaultIndentationChar: '*',

	indentationCharMode: 'unify',

	signaturePrefixRegexp: /(?:\s*С уважением,?)?(?:\s[-–−—―]+\xa0?[A-Z][A-Za-z-_]*)?(?:\s+>+)?(?:[·•\-‑–−—―─~⁓/→⇒\s\u200e\u200f]|&\w+;|&#\d+;)*(?:\s+\()?$/,

	tagName: 'convenient-discussions',

	hookToFireWithAuthorWrappers: 'global.userlinks',

	noSignatureClasses: [
		'ambox',
		'NavHead',
	],

	commentAntipatterns: [
		/--\xa0?\[\[Участник:DimaBot\|DimaBot\]\]/,
	],

	excludeFromHeadlineClasses: [
		'ch-helperText',
		'userflags-wrapper',
		'dclink-wrapper',
	],

	noHighlightClasses: [
		'infobox',
	],

	dontConfirmEmptyCommentPages: [
		/^Викитека:Заявки на статус /,
		/^Викитека:Голосования\//,
	],

	indentationCharsPattern: '(?:\\{\\{(?:-vote|[зЗ]ачёркнутый голос|-голос)\\|)?([:*#]+)( *)',

	undoTexts: [
		'отмена правки',
		'откат правок',
	],

	customCommentFormModules: [
		{
			name: 'ext.gadget.wikificator',
		},
		{
			name: 'ext.gadget.urldecoder',
			checkFunc: function () {
				return mw.user.options.get('gadget-urldecoder');
			},
		},
	],

	transformSummary: function (summary) {
		return summary
			.replace(cd.s('es-new-subsection') + ': /* Итог */', 'итог')
			.replace(cd.s('es-new-subsection') + ': /* Предварительный итог */', 'предварительный итог')
			.replace(cd.s('es-new-subsection') + ': /* Предытог */', 'предытог');
	},

	rejectNode: function (node) {
		return (
			node.classList.contains('ts-Закрыто-header') ||

			// {{clear}}
				(
					node.tagName === 'DIV' &&
					node.getAttribute('style') === 'clear:both;' &&
					!node.childNodes.length
				)
		);
	},

	beforeAuthorLinkParse: function (authorLink, authorLinkPrototype) {
		// https://ru.wikipedia.org/wiki/MediaWiki:Gadget-markadmins.js
		const nextElement = authorLink.nextElementSibling;
		if (nextElement && nextElement.classList.contains('userflags-wrapper')) {
			authorLinkPrototype.parentNode.insertBefore(nextElement, authorLinkPrototype.nextSibling);
		}
	},

	areNewTopicsOnTop: function (title, code) {
		if (/\{\{[нН]овые сверху/.test(code)) {
			return true;
		} else if (/^Викитека:(?:Форум[/ ]|Администрирование)/.test(title)) {
			return true;
		} else if (/^Викитека:(?:К удалению|Заявки на изменение прав)/.test(title)) {
			return false;
		}
		return null;
	},

	getMoveSourcePageCode: function (targetPageWikilink, signature, timestamp) {
		return '{{перенесено на|' + targetPageWikilink + '|' + signature + '}}\n<small>Для бота: ' + timestamp + '</small>\n';
	},

	getMoveTargetPageCode: function (targetPageWikilink, signature) {
		return '{{перенесено с|' + targetPageWikilink + '|' + signature + '}}\n';
	},
};

const cd = convenientDiscussions;

mw.hook('convenientDiscussions.pageReadyFirstTime').add(function () {
	const generateEditCommonJsLink = function () {
		return mw.util.getUrl('User:' + cd.user.getName() + '/common.js', { action: 'edit' });
	};

	const isHlmEnabled = window.highlightMessagesAfterLastVisit !== undefined;
	if (isHlmEnabled) {
		// Suppress the work of [[Участник:Кикан/highlightLastMessages.js]] in possible ways.
		window.highlightMessagesAfterLastVisit = false;
		window.highlightMessages = 0;

		if (!mw.cookie.get('cd-hlmConflict')) {
			// Remove the results of work of [[Участник:Кикан/highlightLastMessages.js]]
			if (window.messagesHighlightColor !== undefined) {
				const dummyElement = document.createElement('span');
				dummyElement.style.color = window.messagesHighlightColor;
				const hlmStyledElements = cd.api.getRootElement().querySelectorAll(
					'.cd-comment-part[style="background-color: ' + dummyElement.style.color + ';"],' +
					'.cd-comment-part[style="background-color: ' + window.messagesHighlightColor + '"]'
				);
				hlmStyledElements.forEach(function (el) {
					el.style.backgroundColor = null;
				});
			}

			const $text = cd.api.wrapHtml('У вас подключён скрипт <a href="//ru.wikipedia.org/wiki/Участник:Кикан/highlightLastMessages.js">highlightLastMessages.js</a>, конфликтующий с функциональностью подсветки скрипта «Удобные обсуждения». Рекомендуется отключить его в <a href="' + generateEditCommonJsLink() + '">вашем common.js</a> (или другом файле настроек).');
			mw.notify($text, {
				type: 'warn',
				autoHide: false,
			});
			mw.cookie.set('cd-hlmConflict', '1', {
				path: '/',
				expires: cd.g.msInDay * 30,
			});
		}
	}

	if (typeof proceedToArchiveRunned !== 'undefined' && !mw.cookie.get('cd-ptaConflict')) {
		const $text = cd.api.wrapHtml('У вас подключён скрипт <a href="//ru.wikipedia.org/wiki/Участник:Jack_who_built_the_house/proceedToArchive.js">proceedToArchive.js</a>, функциональность которого включена в скрипт «Удобные обсуждения». Рекомендуется отключить его в <a href="' + generateEditCommonJsLink() + '">вашем common.js</a> (или другом файле настроек).');
		mw.notify($text, {
			type: 'warn',
			autoHide: false,
		});
		mw.cookie.set('cd-ptaConflict', '1', {
			path: '/',
			expires: cd.g.msInDay * 30,
		});
	}

	if ($('.localcomments[style="font-size: 95%; white-space: nowrap;"]').length) {
		const $text = cd.api.wrapHtml('Скрипт <a href="//ru.wikipedia.org/wiki/Участник:Александр_Дмитриев/comments_in_local_time_ru.js">comments in local time ru.js</a> выполняется раньше скрипта «Удобные обсуждения», что мешает работе последнего. Проследуйте инструкциям <a href="' + mw.util.getUrl(cd.config.scriptPageWikilink) + '#Совместимость">здесь</a>, чтобы обеспечить их совместимость.');
		mw.notify($text, {
			type: 'warn',
			autoHide: false,
		});
	}
});

mw.hook('convenientDiscussions.commentFormCustomModulesReady').add(function (commentForm) {
	commentForm.$element.on('keydown', function (e) {
		// Ctrl+Alt+W
		const isCmdModifierPressed = cd.g.clientProfile.platform === 'mac' ? e.metaKey : e.ctrlKey;
		if (isCmdModifierPressed && !e.shiftKey && e.altKey && e.keyCode === 87) {
			window.Wikify(commentForm.commentInput.$input.get(0));
		}
	});
});

mw.hook('convenientDiscussions.commentFormToolbarReady').add(function (commentForm) {
	commentForm.commentInput.$input.wikiEditor('addToToolbar', {
		section: 'main',
		groups: {
			gadgets: {
				tools: {
					wikificator: {
						label: 'Викификатор — автоматический обработчик текста (Ctrl+Alt+W)',
						type: 'button',
						icon: 'https://upload.wikimedia.org/wikipedia/commons/0/06/Wikify-toolbutton.png',
						action: {
							type: 'callback',
							execute: function () {
								window.Wikify(commentForm.commentInput.$input.get(0));
							},
						},
					},
				},
			}
		},
	});
	commentForm.$element
		.find('.group-gadgets')
		.insertBefore(commentForm.$element.find('.section-main .group-format'));

	if (mw.user.options.get('gadget-urldecoder')) {
		commentForm.commentInput.$input.wikiEditor('addToToolbar', {
			section: 'main',
			group: 'gadgets',
			tools: {
				urlDecoder: {
					label: 'Раскодировать URL перед курсором или все URL в выделенном тексте',
					type: 'button',
					icon: 'https://upload.wikimedia.org/wikipedia/commons/0/01/Link_go_remake.png',
					action: {
						type: 'callback',
						execute: function () {
							window.urlDecoderRun(commentForm.commentInput.$input.get(0));
						},
					},
				},
			},
		});
	}
});
