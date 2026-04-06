import Button from './Button'
import MultilineTextInputWidget from './MultilineTextInputWidget'
import OoUiInputCodeMirror from './OoUiInputCodeMirror'
import TextInputWidget from './TextInputWidget'
import TextMasker from './TextMasker'
import commentManager from './commentManager'
import controller from './controller'
import cd from './loader/cd'
import { defined, removeDoubleSpaces } from './shared/utils-general'
import { isCmdModifierPressed } from './utils-keyboard'
import { createCheckboxControl } from './utils-oojs'
import { wrapHtml } from './utils-window'

/**
 * Builder class responsible for constructing the UI elements of a CommentForm. Separates the
 * construction logic from the behavioral logic of CommentForm.
 */
class CommentFormBuilder {
	/**
	 * @param {import('./CommentForm').default} form The form instance being built.
	 */
	constructor(form) {
		this.form = form
	}

	/**
	 * Create the text inputs based on OOUI widgets.
	 *
	 * @param {import('./CommentForm').CommentFormInitialState} initialState
	 */
	buildTextInputs(initialState) {
		if (
			((this.form.isMode('addSection') || this.form.isMode('addSubsection')) &&
				!this.form.preloadConfig.noHeadline) ||
			this.form.isSectionOpeningCommentEdited()
		) {
			this.form.headlineInputPlaceholder = this.form.target.getCommentFormHeadlineInputPlaceholder(
				this.form.mode,
			)
			const sectionType =
				this.form.mode === 'addSection' ||
				(this.form.isSectionOpeningCommentEdited() &&
					/** @type {import('./Section').default} */ (this.form.targetSection).level === 2)
					? 'section'
					: 'subsection'
			this.form.headlineInput = new TextInputWidget({
				value: initialState.headline ?? '',
				placeholder: this.form.headlineInputPlaceholder,
				classes: ['cd-commentForm-headlineInput', `cd-commentForm-headlineInput-${sectionType}`],
				tabIndex: this.form.getTabIndex(11),
			})
		}

		this.form.commentInput = new MultilineTextInputWidget({
			value: initialState.comment ?? '',
			placeholder: this.form.target.getCommentFormCommentInputPlaceholder(this.form.mode, () => {
				const target = /** @type {import('./Comment').default} */ (this.form.target)
				this.form.updateCommentInputPlaceholder(
					removeDoubleSpaces(
						cd.s('cf-comment-placeholder-replytocomment', target.author.getName(), target.author),
					),
				)
			}),
			rows: this.form.getInitialRowCount(),
			autosize: true,
			maxRows: 9999,
			classes: ['cd-commentForm-commentInput'],
			tabIndex: this.form.getTabIndex(12),
		})
		this.form.commentInput.$input.addClass('ime-position-inside')

		this.form.summaryInput = new TextInputWidget({
			value: initialState.summary ?? '',
			maxLength: cd.g.summaryLengthLimit,
			placeholder: cd.s('cf-summary-placeholder'),
			classes: ['cd-commentForm-summaryInput'],
			tabIndex: this.form.getTabIndex(13),

			// As on the regular edit page
			accessKey: 'b',
		})
		this.form.updateAutoSummary(!initialState.summary)

		mw.loader.using('mediawiki.widgets.visibleLengthLimit').then(() => {
			this.form.summaryInput.$input.codePointLimit(cd.g.summaryLengthLimit)
			mw.widgets.visibleCodePointLimit(this.form.summaryInput, cd.g.summaryLengthLimit)
		})
	}

	/**
	 * Create the checkboxes and the horizontal layout containing them based on OOUI widgets.
	 *
	 * @param {import('./CommentForm').CommentFormInitialState} initialState
	 */
	buildCheckboxes(initialState) {
		if (cd.user.isRegistered()) {
			if (this.form.isMode('edit')) {
				;({ field: this.form.minorField, input: this.form.minorCheckbox } = createCheckboxControl({
					value: 'minor',
					selected: initialState.minor ?? true,
					label: cd.s('cf-minor'),
					tabIndex: this.form.getTabIndex(20),

					// As on the regular edit page
					accessKey: 'i',
				}))
			}

			;({ field: this.form.watchField, input: this.form.watchCheckbox } = createCheckboxControl({
				value: 'watch',
				selected:
					initialState.watch ??
					((cd.settings.get('watchOnReply') && !this.form.isMode('edit')) ||
						$('.mw-watchlink a[href*="action=unwatch"]').length ||
						mw.user.options.get(cd.page.exists() ? 'watchdefault' : 'watchcreations')),
				label: cd.s('cf-watch'),
				tabIndex: this.form.getTabIndex(21),

				// As on the regular edit page
				accessKey: 'w',
			}))

			const subscribableSection = this.form.useTopicSubscription
				? this.form.targetSection?.getBase(true)
				: this.form.targetSection
			if (
				(subscribableSection?.subscribeId || this.form.isMode('addSection')) &&
				(!controller.isSubscribingDisabled() || subscribableSection?.subscriptionState)
			) {
				;({ field: this.form.subscribeField, input: this.form.subscribeCheckbox } =
					createCheckboxControl({
						value: 'subscribe',
						selected: Boolean(
							initialState.subscribe ??
							((cd.settings.get('subscribeOnReply') && !this.form.isMode('edit')) ||
								subscribableSection?.subscriptionState),
						),
						label: cd.s(
							this.form.useTopicSubscription ||
								this.form.isMode('addSection') ||
								(!this.form.isMode('addSubsection') &&
									this.form.targetSection &&
									this.form.targetSection.level <= 2)
								? 'cf-watchsection-topic'
								: 'cf-watchsection-subsection',
						),
						tabIndex: this.form.getTabIndex(22),
						title: cd.s('cf-watchsection-tooltip'),
					}))
			}
		}

		;({ field: this.form.omitSignatureField, input: this.form.omitSignatureCheckbox } =
			createCheckboxControl({
				value: 'omitSignature',
				selected: initialState.omitSignature ?? false,
				label: cd.s('cf-omitsignature'),
				title: cd.s('cf-omitsignature-tooltip'),
				tabIndex: this.form.getTabIndex(25),
			}))
		if (!this.form.isMode('addSection') && !this.form.isMode('addSubsection')) {
			// The checkbox works (for cases like https://en.wikipedia.org/wiki/Template:3ORshort) but is
			// hidden.
			this.form.omitSignatureField.toggle(false)
		}

		if (this.form.isMode('edit') && this.form.target.isDeletable()) {
			;({ field: this.form.deleteField, input: this.form.deleteCheckbox } = createCheckboxControl({
				value: 'delete',
				selected: initialState.delete ?? false,
				label: cd.s('cf-delete'),
				tabIndex: this.form.getTabIndex(26),
			}))
		}

		this.form.checkboxesLayout = new OO.ui.HorizontalLayout({
			classes: ['cd-commentForm-checkboxes'],
			items: [
				this.form.minorField,
				this.form.watchField,
				this.form.subscribeField,
				this.form.omitSignatureField,
				this.form.deleteField,
			].filter(defined),
		})
	}

	/**
	 * Create the buttons based on OOUI widgets.
	 */
	buildButtons() {
		const modeToSubmitButtonMessageName = /** @type {StringsByKey} */ ({
			edit: 'save',
			addSection: 'addtopic',
			addSubsection: 'addsubsection',
		})
		const submitButtonMessageName = modeToSubmitButtonMessageName[this.form.mode] || 'reply'
		this.form.submitButtonLabelStandard = cd.s(`cf-${submitButtonMessageName}`)
		this.form.submitButtonLabelShort = cd.s(`cf-${submitButtonMessageName}-short`)

		this.form.advancedButton = new OO.ui.ButtonWidget({
			label: cd.s('cf-advanced'),
			framed: false,
			classes: ['cd-button-ooui', 'cd-commentForm-advancedButton'],
			tabIndex: this.form.getTabIndex(30),
		})

		this.form.helpPopupButton = new OO.ui.PopupButtonWidget({
			label: cd.s('cf-help'),
			framed: false,
			classes: ['cd-button-ooui'],
			popup: {
				head: false,
				$content: /** @type {JQuery} */ (
					wrapHtml(
						cd.sParse(
							'cf-help-content',
							cd.config.mentionCharacter,
							cd.g.cmdModifier,
							cd.s('dot-separator'),
						),
						{
							tagName: 'div',
							targetBlank: true,
						},
					).contents()
				),
				padded: true,
				align: 'center',
				width: 400,
				classes: ['cd-helpPopup'],
			},
			$overlay: controller.getPopupOverlay(),
			tabIndex: this.form.getTabIndex(31),
		})

		if (cd.user.isRegistered()) {
			this.form.settingsButton = new OO.ui.ButtonWidget({
				framed: false,
				icon: 'settings',
				label: cd.s('cf-settings-tooltip'),
				invisibleLabel: true,
				title: cd.s('cf-settings-tooltip'),
				classes: ['cd-button-ooui', 'cd-commentForm-settingsButton'],
				tabIndex: this.form.getTabIndex(32),
			})
		}

		this.form.cancelButton = new OO.ui.ButtonWidget({
			label: cd.s('cf-cancel'),
			flags: 'destructive',
			framed: false,
			classes: ['cd-button-ooui', 'cd-commentForm-cancelButton'],
			tabIndex: this.form.getTabIndex(33),
		})

		this.form.viewChangesButton = new OO.ui.ButtonWidget({
			label: cd.s('cf-viewchanges'),
			classes: ['cd-commentForm-viewChangesButton'],
			tabIndex: this.form.getTabIndex(34),

			// As on the regular edit page
			accessKey: 'v',
		})
		this.form.viewChangesButton.on('toggle', this.form.adjustLabels)

		this.form.previewButton = new OO.ui.ButtonWidget({
			label: cd.s('cf-preview'),
			classes: ['cd-commentForm-previewButton'],
			tabIndex: this.form.getTabIndex(35),

			// As on the regular edit page
			accessKey: 'p',
		})
		if (cd.settings.get('autopreview')) {
			this.form.previewButton.toggle(!cd.settings.get('autopreview'))
		}
		this.form.previewButton.on('toggle', this.form.adjustLabels)

		this.form.submitButton = new OO.ui.ButtonWidget({
			label: this.form.submitButtonLabelStandard,
			flags: ['progressive', 'primary'],
			classes: ['cd-commentForm-submitButton'],
			tabIndex: this.form.getTabIndex(36),

			// As on the regular edit page
			accessKey: 's',
		})
	}

	/**
	 * Create the main element, the wrappers for the controls (inputs, checkboxes, buttons), and
	 * other elements.
	 */
	buildElements() {
		if (this.form.isMode('reply')) {
			this.form.containerListType = 'dl'
		} else if (this.form.isMode('edit')) {
			this.form.containerListType = this.form.target.containerListType
		} else if (this.form.isMode('replyInSection')) {
			this.form.containerListType = /** @type {ListType} */ (
				/** @type {JQuery} */ (this.form.target.$replyButtonContainer)[0].tagName.toLowerCase()
			)
		}

		this.form.$element = $('<div>').addClass(
			[
				`cd-commentForm cd-commentForm-${this.form.mode}`,
				this.form.containerListType === 'ol' ? 'cd-commentForm-inNumberedList' : undefined,
				this.form.isSectionOpeningCommentEdited()
					? 'cd-commentForm-sectionOpeningComment'
					: undefined,
				this.form.isSectionTarget() && this.form.isMode('addSubsection')
					? `cd-commentForm-addSubsection-${this.form.target.level}`
					: undefined,
			].filter(defined),
		)

		this.form.$messageArea = $('<div>').addClass('cd-commentForm-messageArea')

		this.form.$summaryPreview = $('<div>').addClass('cd-summaryPreview')

		this.form.$advanced = $('<div>')
			.addClass('cd-commentForm-advanced')
			.append(
				this.form.summaryInput.$element,
				this.form.$summaryPreview,
				this.form.checkboxesLayout.$element,
			)

		this.form.$buttonsStart = $('<div>')
			.addClass('cd-commentForm-buttons-start')
			.append(
				[
					this.form.advancedButton.$element,
					this.form.helpPopupButton.$element,
					this.form.settingsButton?.$element,
				].filter(defined),
			)

		this.form.$buttonsEnd = $('<div>')
			.addClass('cd-commentForm-buttons-end')
			.append(
				this.form.cancelButton.$element,
				this.form.viewChangesButton.$element,
				this.form.previewButton.$element,
				this.form.submitButton.$element,
			)

		this.form.$buttons = $('<div>')
			.addClass('cd-commentForm-buttons')
			.append(this.form.$buttonsStart, this.form.$buttonsEnd)

		this.form.$element.append(
			[
				this.form.$messageArea,
				this.form.headlineInput?.$element,
				this.form.commentInput.$element,
				this.form.$advanced,
				this.form.$buttons,
			].filter(defined),
		)

		if (!this.form.isMode('edit') && !cd.settings.get('alwaysExpandAdvanced')) {
			this.form.$advanced.hide()
		}

		// .mw-body-content is for 404 pages
		this.form.$previewArea = $('<div>')
			.addClass('cd-commentForm-previewArea mw-body-content')
			.addClass('cd-commentForm-previewArea-below')
			.appendTo(this.form.$element)

		if (this.form.containerListType === 'ol' && $.client.profile().layout !== 'webkit') {
			// Dummy element for forms inside a numbered list so that the number is placed in front of
			// that area, not in some silly place. Note that in Chrome, the number is placed in front of
			// the textarea, so we don't need this in that browser.
			$('<div>')
				.html('&nbsp;')
				.addClass('cd-commentForm-dummyElement')
				.prependTo(this.form.$element)
		}
	}

	/**
	 * Add a WikiEditor toolbar to the comment input if the relevant setting is enabled.
	 *
	 * @param {Promise<void>} customModulesPromise List of custom comment form modules to await
	 *   loading of before adding the toolbar.
	 * @returns {Promise<void>}
	 * @fires commentFormToolbarReady
	 */
	async buildToolbar(customModulesPromise) {
		if (!cd.settings.get('showToolbar') || !mw.loader.getState('ext.wikiEditor')) {
			if (cd.settings.get('useCodeMirror')) {
				this.initCodeMirror()
			}

			return
		}

		const $toolbarPlaceholder = $('<div>')
			.addClass('cd-toolbarPlaceholder')
			.insertBefore(this.form.commentInput.$element)

		await Promise.all([
			mw.loader.using([
				'ext.wikiEditor',
				...(cd.g.isCodeMirror6Installed
					? ['ext.CodeMirror.v6.WikiEditor', 'ext.CodeMirror.v6.mode.mediawiki']
					: []),
			]),
			customModulesPromise,
		])

		$toolbarPlaceholder.remove()

		this.tweakToolbar()

		// A hack to make the WikiEditor cookies related to active sections and pages saved correctly.
		this.form.commentInput.$input.data('wikiEditor-context').instance = 5
		$.wikiEditor.instances = Array.from({ length: 5 })

		/**
		 * The comment form toolbar is ready; all the requested custom comment form modules have been
		 * loaded and executed.
		 *
		 * @event commentFormToolbarReady
		 * @param {import('./CommentForm').default} commentForm
		 * @param {object} cd {@link convenientDiscussions} object.
		 */
		mw.hook('convenientDiscussions.commentFormToolbarReady').fire(this.form, cd)
	}

	/**
	 * Tweak the WikiEditor toolbar.
	 */
	tweakToolbar() {
		this.setupToolbar()
		this.removeToolbarElements()
		this.addToolbarButtons()
		this.addCodeMirror()
		this.tweakTabs()
	}

	/**
	 * @private
	 */
	addToolbarButtons() {
		const $input = this.form.commentInput.$input
		const scriptPath = mw.config.get('wgScriptPath')
		const lang = cd.g.userLanguage

		$input.wikiEditor('addToToolbar', {
			section: 'main',
			groups: {
				'convenient-discussions': {},
			},
		})
		$input.wikiEditor('addToToolbar', {
			section: 'main',
			group: 'convenient-discussions',
			tools: {
				quote: {
					label: `${cd.s('cf-quote-tooltip')} ${cd.mws(
						'parentheses',
						`Q${cd.mws('comma-separator')}${cd.g.cmdModifier}+Alt+Q`,
					)}`,
					type: 'button',
					// icon: `${scriptPath}/load.php?modules=oojs-ui.styles.icons-editing-advanced&image=quotes&lang=${lang}&skin=vector`,
					action: {
						type: 'callback',
						execute: () => {
							this.form.quote(true, commentManager.getSelectedComment())
						},
					},
				},
				commentLink: {
					label: cd.s('cf-commentlink-tooltip'),
					type: 'button',
					icon:
						cd.g.userDirection === 'ltr'
							? `'data:image/svg+xml,%3Csvg width="20" height="20" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"%3E%3Cpath d="M3 2C2.46957 2 1.96086 2.21071 1.58579 2.58579C1.21071 2.96086 1 3.46957 1 4V20L5 16H17C17.5304 16 18.0391 15.7893 18.4142 15.4142C18.7893 15.0391 19 14.5304 19 14V4C19 3.46957 18.7893 2.96086 18.4142 2.58579C18.0391 2.21071 17.5304 2 17 2H3Z" /%3E%3C/svg%3E'`
							: `'data:image/svg+xml,%3Csvg width="20" height="20" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"%3E%3Cpath d="M17 2C17.5304 2 18.0391 2.21071 18.4142 2.58579C18.7893 2.96086 19 3.46957 19 4V20L15 16H3C2.46957 16 1.96086 15.7893 1.58579 15.4142C1.21071 15.0391 1 14.5304 1 14V4C1 3.46957 1.21071 2.96086 1.58579 2.58579C1.96086 2.21071 2.46957 2 3 2H17Z" /%3E%3C/svg%3E'`,
					action: {
						type: 'callback',
						execute: () => {
							this.form.insertCommentLink()
						},
					},
				},
				mention: {
					label: cd.s('cf-mention-tooltip', 'Alt'),
					type: 'button',
					icon: `${scriptPath}/load.php?modules=oojs-ui.styles.icons-user&image=userAvatar&lang=${lang}&skin=vector`,
					action: {
						type: 'callback',
						execute: () => {
							// @ts-expect-error: Use deprecated window.event to avoid removing and adding a
							// listener
							// eslint-disable-next-line @typescript-eslint/no-deprecated
							this.form.mention(isCmdModifierPressed(window.event) || window.event.altKey)
						},
					},
				},
			},
		})

		$input.wikiEditor('addToToolbar', {
			section: 'advanced',
			group: 'format',
			tools: {
				codeBlock: {
					label: cd.s('cf-codeblock-tooltip'),
					type: 'button',
					icon: `${scriptPath}/load.php?modules=oojs-ui.styles.icons-editing-advanced&image=markup&lang=${lang}&skin=vector`,
					action: {
						type: 'encapsulate',
						options: {
							pre: '<syntaxhighlight lang="">\n',
							peri: cd.s('cf-codeblock-placeholder'),
							post: '\n</syntaxhighlight>',
						},
					},
				},
				underline: {
					label: `${cd.s('cf-underline-tooltip')} ${cd.mws(
						'parentheses',
						`${cd.g.cmdModifier}+U`,
					)}`,
					type: 'button',
					icon: `${scriptPath}/load.php?modules=oojs-ui.styles.icons-editing-styling&image=underline&lang=${lang}&skin=vector`,
					action: {
						type: 'encapsulate',
						options: this.form.constructor.getEncapsulateOptions('underline'),
					},
				},
				strikethrough: {
					label: `${cd.s('cf-strikethrough-tooltip')} ${cd.mws(
						'parentheses',
						`${cd.g.cmdModifier}+Shift+5`,
					)}`,
					type: 'button',
					icon: `${scriptPath}/load.php?modules=oojs-ui.styles.icons-editing-styling&image=strikethrough&lang=${lang}&skin=vector`,
					action: {
						type: 'encapsulate',
						options: this.form.constructor.getEncapsulateOptions('strikethrough'),
					},
				},
			},
		})

		this.form.$element
			.find('.tool[rel="bold"] a')
			.attr(
				'title',
				`${mw.msg('wikieditor-toolbar-tool-bold')} ${cd.mws(
					'parentheses',
					`${cd.g.cmdModifier}+B`,
				)}`,
			)

		this.form.$element
			.find('.tool[rel="italic"] a')
			.attr(
				'title',
				`${mw.msg('wikieditor-toolbar-tool-italic')} ${cd.mws(
					'parentheses',
					`${cd.g.cmdModifier}+I`,
				)}`,
			)

		this.form.$element
			.find('.tool[rel="link"] a')
			.attr(
				'title',
				`${mw.msg('wikieditor-toolbar-tool-link')} ${cd.mws(
					'parentheses',
					`${cd.g.cmdModifier}+K`,
				)}`,
			)

		this.form.$element
			.find('.tool[rel="ulist"] a')
			.attr(
				'title',
				`${mw.msg('wikieditor-toolbar-tool-ulist')} ${cd.mws(
					'parentheses',
					`${cd.g.cmdModifier}+Shift+8`,
				)}`,
			)

		this.form.$element.find('.tool[rel="link"] a, .tool[rel="file"] a').on('click', (event) => {
			// Fix text being inserted in a wrong textarea.
			const rel = event.currentTarget.parentElement?.getAttribute('rel')
			if (!rel) return

			const $dialog = $(`#wikieditor-toolbar-${rel}-dialog`)
			if ($dialog.length) {
				const context = $dialog.data('context')
				if (context) {
					context.$textarea = context.$focusedElem = this.form.commentInput.$input
				}

				// Fix the error when trying to submit the dialog by pressing Enter after doing so by
				// pressing a button.
				$dialog.parent().data('dialogaction', false)
			}
		})

		// Reuse .tool-button for correct background on hover. In case of problems replace with styles for .cd-tool-button-wrapper
		this.form.$element
			.find('.tool[rel="quote"]')
			.wrap($('<span>').addClass('tool-button cd-tool-button-wrapper'))
	}

	/**
	 * @private
	 */
	setupToolbar() {
		const $input = this.form.commentInput.$input

		const wikiEditorModule = mw.loader.moduleRegistry['ext.wikiEditor']
		// eslint-disable-next-line no-one-time-vars/no-one-time-vars
		const toolbarConfig = wikiEditorModule.packageExports['jquery.wikiEditor.toolbar.config.js']
		$input.wikiEditor('addModule', toolbarConfig)
		const dialogsConfig = wikiEditorModule.packageExports['jquery.wikiEditor.dialogs.config.js']
		dialogsConfig.replaceIcons($input)
		const dialogsDefaultConfig = dialogsConfig.getDefaultConfig()
		if (this.form.uploadToCommons) {
			const commentForm = this.form
			dialogsDefaultConfig.dialogs['insert-file'].dialog.buttons[
				'wikieditor-toolbar-tool-file-upload'
			] = function openUploadDialog() {
				$(this).dialog('close')
				commentForm.uploadImage(undefined, true)
			}
		}
		$input.wikiEditor('addModule', dialogsDefaultConfig)
	}

	/**
	 * From the toolbar, remove buttons that are irrelevant in comments.
	 *
	 * @private
	 */
	removeToolbarElements() {
		// Monkey patch to remove WikiEditor's resizing dragbar and its traces
		this.form.commentInput.$element.find('.ext-WikiEditor-ResizingDragBar').remove()
		const $uiText = this.form.commentInput.$element.find('.wikiEditor-ui-text')
		$uiText.css('height', '')
		this.form.commentInput.$input.attr('rows', this.form.getInitialRowCount())
		this.form.commentInput.$input.removeClass('ext-WikiEditor-resizable-textbox')
		$uiText.closest('.wikiEditor-ui-view').removeClass('wikiEditor-ui-view-resizable')

		// Elements irrelevant for a comment editor
		this.form.commentInput.$element
			.find(
				'.tool[rel="redirect"], .tool[rel="signature"], .tool[rel="newline"], .tool[rel="reference"], .option[rel="heading-2"], .tab[rel="help"]',
			)
			.remove()
		if (!this.form.isMode('addSection') && !this.form.isMode('addSubsection')) {
			this.form.commentInput.$element.find('.group-heading').remove()
		}
	}

	/**
	 * Add CodeMirror's button to the toolbar and initialize CodeMirror.
	 *
	 * @private
	 */
	addCodeMirror() {
		if (!cd.g.isCodeMirror6Installed) return

		this.form.commentInput.$element
			.children('.wikiEditor-ui')
			.first()
			.addClass('ext-codemirror-mediawiki')

		if (cd.settings.get('useCodeMirror')) {
			this.initCodeMirror()
		} else {
			this.form.commentInput.$input.wikiEditor('addToToolbar', {
				section: 'main',
				groups: {
					codemirror: {
						tools: {
							CodeMirror: {
								type: 'element',
								element: () => {
									const button = new OO.ui.ToggleButtonWidget({
										label: mw.msg('codemirror-toggle-label-short'),
										title: mw.msg('codemirror-toggle-label'),
										icon: 'syntax-highlight',
										value: false,
										framed: false,
										invisibleLabel: true,
										classes: ['tool', 'cm-mw-toggle-wikieditor'],
									})

									// After the button is clicked for the first time, it is replaced by the
									// CodeMirror extension with its own, so initCodeMirror() runs only once.
									button.on('click', this.initCodeMirror)

									return button.$element
								},
							},
						},
					},
				},
			})
		}
	}

	/**
	 * Add special characters toggle button and hide the special characters tab.
	 *
	 * @private
	 */
	tweakTabs() {
		const $specialCharactersTab = this.form.$element.find('.tab-characters a')
		if (!$specialCharactersTab.length) return

		const $advancedTab = this.form.$element.find('.tab-advanced a')
		if (!$advancedTab.length) return

		$specialCharactersTab.hide()
		$advancedTab.hide()

		this.form.commentInput.$input.wikiEditor('addToToolbar', {
			section: 'main',
			groups: {
				sections: {
					tools: {
						specialCharacters: {
							type: 'element',
							element: () => {
								const button = new OO.ui.ToggleButtonWidget({
									label: mw.msg('wikieditor-toolbar-section-characters'),
									title: mw.msg('wikieditor-toolbar-section-characters'),
									icon: 'specialCharacter',
									value: $specialCharactersTab.attr('aria-expanded') === 'true',
									flags:
										$specialCharactersTab.attr('aria-expanded') === 'true'
											? 'progressive'
											: undefined,
									framed: false,
									invisibleLabel: true,
									classes: ['tool', 'cd-specialCharacters-toggle'],
								})

								this.form.sectionButtons.push(button)
								button.on('click', () => {
									$specialCharactersTab.trigger('click')
									this.updateSectionButtons(button)
								})

								return button.$element
							},
						},
						advanced: {
							type: 'element',
							element: () => {
								const button = new OO.ui.ToggleButtonWidget({
									label: mw.msg('wikieditor-toolbar-section-advanced'),
									title: mw.msg('wikieditor-toolbar-section-advanced'),
									icon: 'ellipsis',
									value: $advancedTab.attr('aria-expanded') === 'true',
									flags: $advancedTab.attr('aria-expanded') === 'true' ? 'progressive' : undefined,
									framed: false,
									invisibleLabel: true,
									classes: ['tool', 'cd-advanced-toggle'],
								})

								button.on('click', () => {
									$advancedTab.trigger('click')
									this.updateSectionButtons(button)
								})

								this.form.sectionButtons.push(button)

								return button.$element
							},
						},
					},
				},
			},
		})
	}

	/**
	 * Initialize a {@link https://www.mediawiki.org/wiki/Extension:CodeMirror CodeMirror} instance.
	 */
	initCodeMirror = () => {
		this.form.codeMirror = new OoUiInputCodeMirror(this.form.commentInput)
		this.form.codeMirror.initialize(
			undefined,
			/** @type {string} */ (this.form.commentInput.$input.attr('placeholder')),
		)

		// Hide the label
		this.form.commentInput.$element
			.find('.cm-mw-toggle-wikieditor')
			.removeClass('oo-ui-labelElement')
			.find('.oo-ui-labelElement-label')
			.addClass('oo-ui-labelElement-invisible')

		// Move the CodeMirror element after the sections container
		this.form.$element
			.find('.group-codemirror')
			.first()
			.insertBefore(this.form.$element.find('.group-sections'))
	}

	/**
	 * Update the flags of all section buttons after one is toggled.
	 *
	 * @param {OO.ui.ToggleButtonWidget} button
	 */
	updateSectionButtons(button) {
		this.form.sectionButtons.forEach((btn) => {
			if (btn !== button) {
				btn.setValue(false)
			}
			btn.setFlags({ progressive: btn.isActive() })
		})
	}

	/**
	 * Add the insert buttons block under the comment input.
	 */
	buildInsertButtons() {
		this.form.$insertButtons?.empty()

		const insertButtons = cd.settings.get('insertButtons')
		if (!insertButtons.length) return

		this.form.$insertButtons ??= $('<div>')
			.addClass('cd-insertButtons')
			.insertAfter(this.form.commentInput.$element)

		insertButtons.forEach((button) => {
			let snippet
			let label
			if (Array.isArray(button)) {
				snippet = button[0]
				label = button[1]
			} else {
				snippet = button
			}
			this.addInsertButton(snippet, label)
		})
	}

	/**
	 * Add an insert button to the block under the comment input.
	 *
	 * @param {string} snippet
	 * @param {string} [label]
	 * @private
	 */
	addInsertButton(snippet, label) {
		// Mask escaped characters
		const textMasker = new TextMasker(snippet).mask(/\\[+;\\]/g)

		let [, pre, post] = /** @type {[string, string, string | undefined]} */ (
			textMasker.getText().match(/^(.*?)(?:\+(.*))?$/) || []
		)
		if (!pre) return

		pre = pre.replace(/\\n/g, '\n')
		post ??= ''
		post = post.replace(/\\n/g, '\n')

		// Unmask escaped characters
		const unescape = (/** @type {string} */ s) => s.replace(/\\([+;\\])/g, '$1')
		pre = unescape(textMasker.unmaskText(pre))
		post = unescape(textMasker.unmaskText(post))
		label = label ? unescape(label) : pre + post

		const insertButtonsTyped = /** @type {JQuery} */ (this.form.$insertButtons)
		insertButtonsTyped.append(
			new Button({
				label,
				classes: ['cd-insertButtons-button'],
				action: () => {
					this.form.encapsulateSelection({ pre, post })
				},
			}).element,
			' ',
		)
	}

	/**
	 * Build all UI components of the form.
	 *
	 * @param {import('./CommentForm').CommentFormInitialState} initialState
	 * @param {Promise<void>} customModulesPromise
	 * @returns {Promise<void>}
	 */
	build(initialState, customModulesPromise) {
		this.buildTextInputs(initialState)
		this.buildCheckboxes(initialState)
		this.buildButtons()
		this.buildElements()
		const buildToolbarPromise = this.buildToolbar(customModulesPromise)
		this.buildInsertButtons()

		if (this.form.deleteCheckbox?.isSelected()) {
			this.form.updateFormOnDeleteCheckboxChange(true)
		}

		return buildToolbarPromise
	}
}

export default CommentFormBuilder
