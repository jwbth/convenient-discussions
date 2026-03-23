import Button from './Button'
import MultilineTextInputWidget from './MultilineTextInputWidget'
import TextInputWidget from './TextInputWidget'
import TextMasker from './TextMasker'
import controller from './controller'
import cd from './loader/cd'
import { defined, removeDoubleSpaces } from './shared/utils-general'
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
		})
		this.form.summaryInput.$input.codePointLimit(cd.g.summaryLengthLimit)
		mw.widgets.visibleCodePointLimit(this.form.summaryInput, cd.g.summaryLengthLimit)
		this.form.updateAutoSummary(!initialState.summary)
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
		})
		this.form.viewChangesButton.on('toggle', this.form.adjustLabels)

		this.form.previewButton = new OO.ui.ButtonWidget({
			label: cd.s('cf-preview'),
			classes: ['cd-commentForm-previewButton'],
			tabIndex: this.form.getTabIndex(35),
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
				this.form.initCodeMirror()
			}

			return
		}

		const $toolbarPlaceholder = $('<div>')
			.addClass('cd-toolbarPlaceholder')
			.insertBefore(this.form.commentInput.$element)

		await Promise.all([
			mw.loader.using([
				'ext.wikiEditor',
				...(cd.g.isCodeMirror6Installed ? ['ext.CodeMirror.v6.mode.mediawiki'] : []),
			]),
			customModulesPromise,
		])

		$toolbarPlaceholder.remove()

		this.form.tweakToolbar()

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
