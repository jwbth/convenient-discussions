import AutocompleteManager from './AutocompleteManager'
import Comment from './Comment'
import CommentFormBuilder from './CommentFormBuilder'
import CommentFormInputTransformer from './CommentFormInputTransformer'
import CommentFormOperationRegistry from './CommentFormOperationRegistry'
import EventEmitter from './EventEmitter'
import MentionsAutocomplete from './MentionsAutocomplete'
import OoUiInputCodeMirror from './OoUiInputCodeMirror'
import getUploadDialogClass from './UploadDialog'
import commentManager from './commentManager'
import controller from './controller'
import cd from './loader/cd'
import notifications from './notifications'
import pageRegistry from './pageRegistry'
import sectionManager from './sectionManager'
import CdError from './shared/CdError'
import Parser from './shared/Parser'
import { defined, getDayTimestamp, removeDoubleSpaces, sleep, unique } from './shared/utils-general'
import {
	escapePipesOutsideLinks,
	generateTagsRegexp,
	removeWikiMarkup,
} from './shared/utils-wikitext'
import userRegistry from './userRegistry'
import { handleApiReject, parseCode } from './utils-api'
import { isCmdModifierPressed, keyCombination } from './utils-keyboard'
import {
	buildEditSummary,
	isExistentAnchor,
	isHtmlConvertibleToWikitext,
	isInputFocused,
	mergeJquery,
	wrapDiffBody,
	wrapHtml,
} from './utils-window'

/**
 * @typedef {'reply'|'replyInSection'|'edit'|'addSubsection'|'addSection'} CommentFormMode
 */

/**
 * @typedef {'submit'|'viewChanges'|'preview'} CommentFormAction
 */

/**
 * @typedef {import('./Comment').default | import('./Section').default | import('./CurrentPage').default} CommentFormTarget
 */

/**
 * @typedef {import('./CommentSource').default|import('./SectionSource').default|import('./PageSource').default} Source
 */

/**
 * @typedef {object} CommentFormTargetMap
 * @property {Comment} reply
 * @property {Comment} edit
 * @property {import('./Section').default} replyInSection
 * @property {import('./Section').default} addSubsection
 * @property {import('./CurrentPage').default} addSection
 */

/**
 * @typedef {object} CommentFormTargetMethodMap
 * @property {'reply'} reply
 * @property {'edit'} edit
 * @property {'reply'} replyInSection
 * @property {'addSubsection'} addSubsection
 * @property {'addSection'} addSection
 */

/**
 * @typedef {object} EventMap
 * @property {[]} change
 * @property {[]} teardown
 * @property {[]} unregister
 */

/**
 * @typedef {object} CommentFormData
 * @property {CommentFormMode} mode
 * @property {AnyByKey | undefined} targetData
 * @property {AnyByKey|undefined} targetWithOutdentedRepliesData
 * @property {PreloadConfig} preloadConfig
 * @property {boolean|undefined} newTopicOnTop
 * @property {string|undefined} headline
 * @property {string} comment
 * @property {string} summary
 * @property {boolean|undefined} minor
 * @property {boolean|undefined} watch
 * @property {boolean|undefined} subscribe
 * @property {boolean|undefined} omitSignature
 * @property {boolean|undefined} delete
 * @property {string|undefined} originalHeadline
 * @property {string|undefined} originalComment
 * @property {boolean} summaryAltered
 * @property {boolean} omitSignatureCheckboxAltered
 * @property {Date|undefined} lastFocused
 */

/**
 * @typedef {object} CommentFormInitialStateExtension
 * @property {boolean} [focus]
 * @property {string} [focusHeadline]
 * @property {Comment} [targetWithOutdentedReplies]
 */

/**
 * @typedef {Partial<CommentFormData> & CommentFormInitialStateExtension} CommentFormInitialState
 */

/**
 * @typedef {(
 *     import('./Comment').default['reply']
 *   | import('./Comment').default['edit']
 *   | import('./Section').default['reply']
 *   | import('./Section').default['addSubsection']
 *   | import('./CurrentPage').default['addSection']
 * )} CommentFormAddingMethod
 */

/**
 * @template {CommentFormMode} Mode
 * @typedef {CommentFormTargetMap[Mode]} TypedTarget
 */

/**
 * @template {CommentFormMode} Mode
 * @typedef {object} CommentFormConfig
 * @property {Mode} mode
 * @property {TypedTarget<Mode>} target Comment, section, or page that the form is associated in the
 *   UI.
 * @property {typeof import('./commentFormManager').default} commentFormManager
 * @property {CommentFormInitialState} [initialState = {}] Initial state of the form (data saved in
 *   the previous session, quoted text, data transferred from DT's new topic form, etc.).
 * @property {PreloadConfig} [preloadConfig = {}] Configuration to preload content into the form.
 * @property {boolean} [newTopicOnTop=false] When adding a topic, whether it should be on top.
 */

/**
 * A comment form.
 *
 * @template {CommentFormMode} [Mode=CommentFormMode]
 * @augments EventEmitter<EventMap>
 */
class CommentForm extends EventEmitter {
	/**
	 * @type {typeof import('./commentFormManager').default}
	 * @private
	 */
	commentFormManager

	/**
	 * Comment, section, or page with which the form is associated in the UI.
	 *
	 * @type {TypedTarget<Mode>}
	 */
	target

	// Making this private harms type checking.
	/**
	 * Target section.
	 *
	 * @type {CommentFormTargetSection}
	 */
	targetSection

	/**
	 * Wiki page that has the source code of the target object (may be different from the current
	 * page if the section is transcluded from another page).
	 *
	 * @type {import('./Page').default}
	 * @private
	 */
	targetPage

	/**
	 * Parent comment. This is the comment the user replies to, if any, or the comment opening the
	 * section.
	 *
	 * @type {Comment | undefined}
	 * @private
	 */
	parentComment

	/**
	 * The main form element.
	 *
	 * @type {JQuery}
	 */
	$element

	/**
	 * Text insert buttons.
	 *
	 * @type {JQuery|undefined}
	 */
	$insertButtons

	/**
	 * Headline input placeholder text.
	 *
	 * @type {string|undefined}
	 */
	headlineInputPlaceholder

	/**
	 * Headline input.
	 *
	 * @type {import('./TextInputWidget').default|undefined}
	 */
	headlineInput

	/**
	 * Comment input.
	 *
	 * @type {import('./MultilineTextInputWidget').default}
	 */
	commentInput

	/**
	 * Edit summary input.
	 *
	 * @type {import('./TextInputWidget').default}
	 */
	summaryInput

	/**
	 * Minor change checkbox field.
	 *
	 * @type {OO.ui.FieldLayout|undefined}
	 * @memberof CommentForm
	 * @instance
	 */
	minorField

	/**
	 * Minor change checkbox.
	 *
	 * @type {import('./CheckboxInputWidget').default|undefined}
	 * @memberof CommentForm
	 * @instance
	 */
	minorCheckbox

	/**
	 * Watch page checkbox field.
	 *
	 * @type {OO.ui.FieldLayout}
	 * @memberof CommentForm
	 * @instance
	 */
	watchField

	/**
	 * Watch page checkbox.
	 *
	 * @type {import('./CheckboxInputWidget').default | undefined}
	 * @memberof CommentForm
	 * @instance
	 */
	watchCheckbox

	/**
	 * Topic subscribe checkbox field.
	 *
	 * @type {OO.ui.FieldLayout|undefined}
	 * @memberof CommentForm
	 * @instance
	 */
	subscribeField

	/**
	 * Topic subscribe checkbox.
	 *
	 * @type {import('./CheckboxInputWidget').default|undefined}
	 * @memberof CommentForm
	 * @instance
	 */
	subscribeCheckbox

	/**
	 * Omit signature checkbox field.
	 *
	 * @type {OO.ui.FieldLayout|undefined}
	 * @memberof CommentForm
	 * @instance
	 */
	omitSignatureField

	/**
	 * Omit signature checkbox.
	 *
	 * @type {import('./CheckboxInputWidget').default|undefined}
	 * @memberof CommentForm
	 * @instance
	 */
	omitSignatureCheckbox

	/**
	 * Delete checkbox field.
	 *
	 * @type {OO.ui.FieldLayout|undefined}
	 * @memberof CommentForm
	 * @instance
	 */
	deleteField

	/**
	 * Delete checkbox.
	 *
	 * @type {import('./CheckboxInputWidget').default|undefined}
	 * @memberof CommentForm
	 * @instance
	 */
	deleteCheckbox

	/**
	 * Checkboxes area.
	 *
	 * @type {OO.ui.HorizontalLayout}
	 */
	checkboxesLayout

	/**
	 * @type {string}
	 */
	submitButtonLabelStandard

	/**
	 * @type {string}
	 */
	submitButtonLabelShort

	/**
	 * Toggle advanced section button.
	 *
	 * @type {OO.ui.ButtonWidget}
	 */
	advancedButton

	/**
	 * Help button.
	 *
	 * @type {OO.ui.PopupButtonWidget}
	 */
	helpPopupButton

	/**
	 * Script settings button.
	 *
	 * @type {OO.ui.ButtonWidget | undefined}
	 */
	settingsButton

	/**
	 * Cancel button.
	 *
	 * @type {OO.ui.ButtonWidget}
	 */
	cancelButton

	/**
	 * View changes button.
	 *
	 * @type {OO.ui.ButtonWidget}
	 */
	viewChangesButton

	/**
	 * Preview button.
	 *
	 * @type {OO.ui.ButtonWidget}
	 */
	previewButton

	/**
	 * Submit button.
	 *
	 * @type {OO.ui.ButtonWidget}
	 */
	submitButton

	/**
	 * Standard total width of button labels.
	 *
	 * @type {number}
	 * @private
	 */
	buttonsTotalWidthStandard

	/**
	 * The area where service messages are displayed.
	 *
	 * @type {JQuery}
	 */
	$messageArea

	/**
	 * The area where edit summary preview is displayed.
	 *
	 * @type {JQuery}
	 */
	$summaryPreview

	/**
	 * Advanced section container.
	 *
	 * @type {JQuery}
	 */
	$advanced

	/**
	 * Start (left on LTR wikis, right on RTL wikis) form buttons container.
	 *
	 * @type {JQuery}
	 */
	$buttonsStart

	/**
	 * End (right on LTR wikis, left on RTL wikis) form buttons container.
	 *
	 * @type {JQuery}
	 */
	$buttonsEnd

	/**
	 * Form buttons container.
	 *
	 * @type {JQuery}
	 */
	$buttons

	/**
	 * The area where comment previews and changes are displayed.
	 *
	 * @type {JQuery}
	 */
	$previewArea

	/**
	 * Name of the tag of the list that this comment form is an item of.
	 *
	 * @type {ListType | undefined}
	 */
	containerListType

	/**
	 * @typedef {Promise<Source|null|void>} CheckCodeRequest
	 */

	/**
	 * Request to test if a comment or section exists in the code made by
	 * {@link CommentForm#checkCode}.
	 *
	 * @type {CheckCodeRequest|undefined}
	 * @private
	 */
	checkCodeRequest

	/**
	 * @type {string | undefined}
	 */
	originalComment

	/**
	 * @type {string | undefined}
	 */
	originalHeadline

	/**
	 * Autocomplete object for the comment input.
	 *
	 * @type {AutocompleteManager}
	 */
	autocomplete

	/**
	 * Autocomplete object for the headline input.
	 *
	 * @type {AutocompleteManager|undefined}
	 */
	headlineAutocomplete

	/**
	 * Autocomplete object for the summary input.
	 *
	 * @type {AutocompleteManager}
	 */
	summaryAutocomplete

	/**
	 * Automatically generated summary.
	 *
	 * @type {string | undefined}
	 */
	autoSummary

	/**
	 * @typedef {Mode extends 'addSection' ? undefined : import('./Section').default | undefined} CommentFormTargetSection
	 */

	/**
	 * Object specifying configuration to preload data into the comment form. It is extracted from the
	 * "Add section" link/button target.
	 *
	 * @typedef {object} PreloadConfig
	 * @property {string} [editIntro] Edit intro page name.
	 * @property {string} [commentTemplate] Comment template's page name.
	 * @property {string} [headline] Subject/headline.
	 * @property {string[]} [params] Preload parameters to take place of `$1`, `$2`, etc. in the
	 *   comment template.
	 * @property {string} [summary] Edit summary.
	 * @property {string} [noHeadline] Whether to include a headline.
	 * @property {string} [omitSignature] Whether to add the user's signature.
	 * @memberof CommentForm
	 * @inner
	 */

	/**
	 * Create a comment form.
	 *
	 * @param {CommentFormConfig<Mode>} config
	 * @fires commentFormCustomModulesReady
	 */
	constructor({
		mode,
		target,
		commentFormManager,
		initialState = {},
		preloadConfig = {},
		newTopicOnTop = false,
	}) {
		super()

		this.commentFormManager = commentFormManager

		// Unlike when changing other settings on the fly, changing this one won't alter the behavior
		// *for the current form*, because truth be told, we don't value it very much.
		this.useTopicSubscription = cd.settings.get('useTopicSubscription')

		/**
		 * Whether the toolbar is loaded (it could be loaded at the beginning or later, if the user
		 * enables the respective setting).
		 *
		 * @type {boolean}
		 */
		this.toolbarLoaded = cd.settings.get('showToolbar')

		this.uploadToCommons = cd.g.isProbablyWmfSulWiki

		/**
		 * Form mode.
		 *
		 * @type {Mode}
		 */
		this.mode = mode

		this.setTargets(target)

		/**
		 * Configuration to preload data into the form.
		 *
		 * @type {PreloadConfig}
		 */
		this.preloadConfig = preloadConfig

		/**
		 * When adding a topic, whether it should be on top.
		 *
		 * @type {boolean|undefined}
		 * @private
		 */
		this.newTopicOnTop = newTopicOnTop

		/**
		 * Form index.
		 *
		 * @type {number}
		 * @private
		 */
		this.index = CommentForm.counter++

		/**
		 * Is the comment form registered ({@link CommentForm#unregister .unregister()} hasn't been run
		 * on it).
		 *
		 * @type {boolean}
		 */
		this.registered = true

		/**
		 * Has the comment form been {@link CommentForm#teardown torndown}.
		 *
		 * @type {boolean}
		 */
		this.torndown = false

		/**
		 * Was the summary altered manually.
		 *
		 * @type {boolean}
		 * @private
		 */
		this.summaryAltered = initialState.summaryAltered ?? false

		/**
		 * Was the omit signature checkbox altered manually.
		 *
		 * @type {boolean}
		 * @private
		 */
		this.omitSignatureCheckboxAltered = initialState.omitSignatureCheckboxAltered ?? false

		/**
		 * If the user replies to a comment with outdented replies (in which case the form is created
		 * like a regular section reply), this is that target comment.
		 *
		 * @type {Comment | undefined}
		 */
		this.targetWithOutdentedReplies = initialState.targetWithOutdentedReplies

		/**
		 * Whether a new section will be added on submit using a dedicated API request. (Filled upon
		 * submitting or viewing changes.)
		 *
		 * @type {boolean | undefined}
		 * @private
		 */
		this.newSectionApi = undefined

		// Making this private harms type checking.
		/**
		 * Whether the wikitext of a section will be submitted to the server instead of a page. (Filled
		 * upon submitting or viewing changes.)
		 *
		 * @type {boolean | undefined}
		 */
		this.sectionSubmitted = undefined

		/**
		 * Operation registry.
		 *
		 * @type {CommentFormOperationRegistry}
		 * @private
		 */
		this.operations = new CommentFormOperationRegistry(this)

		/**
		 * List of timestamps of last keypresses.
		 *
		 * @type {number[]}
		 * @private
		 */
		this.lastKeyPresses = []

		if (this.isMode('addSection')) {
			// This is above the builder as building is time-costly and would delay the
			// requests made in this.addEditNotices().
			this.addEditNotices()
		}

		this.builder = new CommentFormBuilder(this)
		this.buildPromise = this.builder.build(initialState, this.loadCustomModules()).then(() => {
			this.addEventListeners()
		})

		cd.settings.on('set', this.onSettingsUpdate)
	}

	/**
	 * Get the initial number of rows for the comment input.
	 *
	 * @returns {number}
	 */
	getInitialRowCount() {
		// Keep this synced with CommentForm.less: @num-rows-comment and @num-rows-section
		const NUM_ROWS_COMMENT = 4
		const NUM_ROWS_SECTION = 6

		return this.headlineInput ? NUM_ROWS_SECTION : NUM_ROWS_COMMENT
	}

	/**
	 * Load the names of the custom modules to load (e.g. for the toolbar).
	 *
	 * @returns {Promise<void>}
	 */
	async loadCustomModules() {
		await mw.loader.using(
			cd.config.customCommentFormModules
				.filter((module) => !module.checkFunc || module.checkFunc())
				.map((module) => module.name),
		)

		/**
		 * All the requested
		 * {@link module:defaultConfig.customCommentFormModules custom comment form modules} have been
		 * loaded and executed. (The toolbar may not be ready yet if it's enabled; use
		 * {@link event:commentFormToolbarReady} for that.)
		 *
		 * @event commentFormCustomModulesReady
		 * @param {CommentForm} commentForm
		 * @param {object} cd {@link convenientDiscussions} object.
		 */
		mw.hook('convenientDiscussions.commentFormCustomModulesReady').fire(this, cd)
	}

	/**
	 * Setup the form after it is added to the page for the first time (not after a page reload).
	 *
	 * @param {CommentFormInitialState} [initialState]
	 */
	setup(initialState = {}) {
		this.adjustLabels()

		if (!cd.user.isRegistered() && !cd.user.isTemporary()) {
			this.showMessage(cd.sParse('error-anoneditwatning'), {
				type: 'warning',
				name: 'anonEditWarning',
			})
		}

		if (initialState.originalComment === undefined) {
			if (this.isMode('edit')) {
				this.loadComment(initialState)
			} else {
				if (this.preloadConfig.commentTemplate) {
					this.preloadTemplate()
				} else {
					this.originalComment = ''
				}

				if (this.headlineInput) {
					if (this.preloadConfig.headline) {
						this.headlineInput.setValue(this.preloadConfig.headline)
					}

					// The headline may be set from initialState.headline at this point
					this.originalHeadline = this.headlineInput.getValue()
				}
			}
		} else {
			this.originalComment = initialState.originalComment || ''
			this.originalHeadline = initialState.originalHeadline || ''
		}

		if (initialState.lastFocused) {
			/**
			 * The date when the comment form was focused last time.
			 *
			 * @type {Date|undefined}
			 * @private
			 */
			this.lastFocused = new Date(initialState.lastFocused)
		}

		if (initialState.targetWithOutdentedReplies) {
			this.showMessage(
				wrapHtml(
					cd.sParse(
						'cf-notice-outdent',
						new mw.Title(cd.config.outdentTemplates[0], 10).toString(),
					),
					{ targetBlank: true },
				),
				{
					type: 'notice',
					name: 'outdent',
				},
			)
		}

		if (!this.isMode('addSection') && !this.isMode('edit')) {
			this.checkCode()
		}

		if (!initialState.originalComment && initialState.focus !== false) {
			this.$element.cdScrollIntoView('center', true, () => {
				if (!this.isMode('edit')) {
					;(this.headlineInput || this.commentInput).focus()
				}
			})
		}

		this.onboardOntoMultipleForms()
		this.onboardOntoUpload()

		this.initAutocomplete()
	}

	/**
	 * Set the `target`, `targetSection`, `parentComment`, and `targetPage` properties.
	 *
	 * @param {TypedTarget<Mode>} target
	 */
	setTargets(target) {
		this.target = target
		this.targetSection = /** @type {CommentFormTargetSection} */ (this.target.getRelevantSection())
		this.targetPage = this.targetSection?.getSourcePage() || cd.page
		this.parentComment =
			this.isMode('reply') || this.isMode('replyInSection')
				? this.target.getRelevantComment()
				: undefined
	}

	/**
	 * Compose a tab index for an element from the form's index and the supplied element index.
	 *
	 * @param {number} elementIndex
	 * @returns {number}
	 */
	getTabIndex(elementIndex) {
		return Number(String(this.index) + String(elementIndex))
	}

	/**
	 * Update the comment input placeholder.
	 *
	 * @param {string} text
	 */
	updateCommentInputPlaceholder(text) {
		this.commentInput.$input.attr('placeholder', text)
		this.codeMirror?.updatePlaceholder(text)
	}

	/**
	 * Removing the toolbar altogether is likely tedious and buggy. Just hide.
	 *
	 * @private
	 */
	hideToolbar() {
		this.commentInput.$element.find('.wikiEditor-ui-top').hide()
	}

	/**
	 * Tweak the WikiEditor toolbar.
	 */
	tweakToolbar() {
		this.setupToolbar()
		this.removeToolbarElements()
		this.addToolbarButtons()
		this.addCodeMirror()
	}

	/**
	 * @private
	 */
	addToolbarButtons() {
		const $input = this.commentInput.$input
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
							this.quote(true, commentManager.getSelectedComment())
						},
					},
				},
				smaller: {
					label: cd.mws('wikieditor-toolbar-tool-small'),
					type: 'button',
					icon: `${scriptPath}/load.php?modules=oojs-ui.styles.icons-editing-styling&image=smaller&lang=${lang}&skin=vector`,
					action: {
						type: 'encapsulate',
						options: {
							pre: '<small>',
							peri: cd.mws('wikieditor-toolbar-tool-small-example'),
							post: '</small>',
						},
					},
				},
				mention: {
					label: cd.s('cf-mention-tooltip', cd.g.cmdModifier),
					type: 'button',
					icon: `${scriptPath}/load.php?modules=oojs-ui.styles.icons-user&image=userAvatar&lang=${lang}&skin=vector`,
					action: {
						type: 'callback',
						execute: () => {
							// @ts-expect-error: Use deprecated window.event to avoid removing and adding a listener
							// eslint-disable-next-line @typescript-eslint/no-deprecated
							this.mention(isCmdModifierPressed(window.event))
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
							this.insertCommentLink()
						},
					},
				},
			},
		})

		$input.wikiEditor('addToToolbar', {
			section: 'advanced',
			group: 'format',
			tools: {
				code: {
					label: `${cd.s('cf-code-tooltip')} ${cd.mws(
						'parentheses',
						`${cd.g.cmdModifier}+Shift+6`,
					)}`,
					type: 'button',
					icon: `${scriptPath}/load.php?modules=oojs-ui.styles.icons-editing-advanced&image=code&lang=${lang}&skin=vector`,
					action: {
						type: 'encapsulate',
						options: CommentForm.encapsulateOptions.code,
					},
				},
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
						options: CommentForm.encapsulateOptions.underline,
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
						options: CommentForm.encapsulateOptions.strikethrough,
					},
				},
			},
		})

		this.$element
			.find('.tool[rel="bold"] a')
			.attr(
				'title',
				`${mw.msg('wikieditor-toolbar-tool-bold')} ${cd.mws(
					'parentheses',
					`${cd.g.cmdModifier}+B`,
				)}`,
			)

		this.$element
			.find('.tool[rel="italic"] a')
			.attr(
				'title',
				`${mw.msg('wikieditor-toolbar-tool-italic')} ${cd.mws(
					'parentheses',
					`${cd.g.cmdModifier}+I`,
				)}`,
			)

		this.$element
			.find('.tool[rel="link"] a')
			.attr(
				'title',
				`${mw.msg('wikieditor-toolbar-tool-link')} ${cd.mws(
					'parentheses',
					`${cd.g.cmdModifier}+K`,
				)}`,
			)

		this.$element
			.find('.tool[rel="ulist"] a')
			.attr(
				'title',
				`${mw.msg('wikieditor-toolbar-tool-ulist')} ${cd.mws(
					'parentheses',
					`${cd.g.cmdModifier}+Shift+8`,
				)}`,
			)

		this.$element.find('.tool[rel="link"] a, .tool[rel="file"] a').on('click', (event) => {
			// Fix text being inserted in a wrong textarea.
			const rel = event.currentTarget.parentElement?.getAttribute('rel')
			if (!rel) return

			const $dialog = $(`#wikieditor-toolbar-${rel}-dialog`)
			if ($dialog.length) {
				const context = $dialog.data('context')
				if (context) {
					context.$textarea = context.$focusedElem = this.commentInput.$input
				}

				// Fix the error when trying to submit the dialog by pressing Enter after doing so by
				// pressing a button.
				$dialog.parent().data('dialogaction', false)
			}
		})

		// Reuse .tool-button for correct background on hover. In case of problems replace with styles for .cd-tool-button-wrapper
		this.$element
			.find('.tool[rel="quote"]')
			.wrap($('<span>').addClass('tool-button cd-tool-button-wrapper'))
	}

	/**
	 * @private
	 */
	setupToolbar() {
		const $input = this.commentInput.$input

		const wikiEditorModule = mw.loader.moduleRegistry['ext.wikiEditor']
		// eslint-disable-next-line no-one-time-vars/no-one-time-vars
		const toolbarConfig = wikiEditorModule.packageExports['jquery.wikiEditor.toolbar.config.js']
		$input.wikiEditor('addModule', toolbarConfig)
		const dialogsConfig = wikiEditorModule.packageExports['jquery.wikiEditor.dialogs.config.js']
		dialogsConfig.replaceIcons($input)
		const dialogsDefaultConfig = dialogsConfig.getDefaultConfig()
		if (this.uploadToCommons) {
			const commentForm = this
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
		this.commentInput.$element.find('.ext-WikiEditor-ResizingDragBar').remove()
		const $uiText = this.commentInput.$element.find('.wikiEditor-ui-text')
		$uiText.css('height', '')
		this.commentInput.$input.attr('rows', this.getInitialRowCount())
		this.commentInput.$input.removeClass('ext-WikiEditor-resizable-textbox')
		$uiText.closest('.wikiEditor-ui-view').removeClass('wikiEditor-ui-view-resizable')

		this.commentInput.$element
			.find(
				'.tool[rel="redirect"], .tool[rel="signature"], .tool[rel="newline"], .tool[rel="reference"], .option[rel="heading-2"]',
			)
			.remove()
		if (!this.isMode('addSection') && !this.isMode('addSubsection')) {
			this.commentInput.$element.find('.group-heading').remove()
		}
	}

	/**
	 * Add CodeMirror's button to the toolbar and initialize CodeMirror.
	 *
	 * @private
	 */
	addCodeMirror() {
		if (!cd.g.isCodeMirror6Installed) return

		this.commentInput.$element
			.children('.wikiEditor-ui')
			.first()
			.addClass('ext-codemirror-mediawiki')

		if (cd.settings.get('useCodeMirror')) {
			this.initCodeMirror()
		} else {
			this.commentInput.$input.wikiEditor('addToToolbar', {
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
	 * Initialize a {@link https://www.mediawiki.org/wiki/Extension:CodeMirror CodeMirror} instance.
	 */
	initCodeMirror = () => {
		this.codeMirror = new OoUiInputCodeMirror(this.commentInput)
		this.codeMirror.initialize(
			undefined,
			/** @type {string} */ (this.commentInput.$input.attr('placeholder')),
		)
	}

	/**
	 * Load the edited comment to the comment form.
	 *
	 * @this {CommentForm<'edit'>}
	 * @param {CommentFormInitialState} initialState
	 * @private
	 */
	async loadComment(initialState) {
		const operation = this.operations.add('load')
		try {
			const source = await this.target.loadCode(this)
			let commentInputValue = source.toInput()
			if (source.inSmallFont) {
				commentInputValue = `<small>${commentInputValue}</small>`
			}

			this.commentInput.setValue(commentInputValue)
			this.originalComment = commentInputValue

			// I think a situation where the headline input is present and but not in the source or vice
			// versa is impossible, but got to recheck.
			if (this.headlineInput && source.headlineCode !== undefined) {
				this.headlineInput.setValue(source.headlineCode)
				this.originalHeadline = source.headlineCode
			} else {
				this.originalHeadline = ''
			}

			operation.close()

			if (initialState.focusHeadline && this.headlineInput) {
				this.headlineInput.selectRange(this.originalHeadline.length)
			} else {
				this.commentInput.selectRange(this.originalComment.length)
			}
			this.preview()
		} catch (error) {
			this.handleError({
				error,
				cancel: true,
				operation,
			})
		}
	}

	/**
	 * Test if a target comment or section exists in the wikitext.
	 *
	 * @returns {CheckCodeRequest}
	 * @private
	 */
	checkCode() {
		if (!this.checkCodeRequest) {
			this.checkCodeRequest = this.target.loadCode(this).catch((/** @type {unknown} */ error) => {
				this.$messageArea.empty()
				delete this.checkCodeRequest
				this.handleError({ error })
			})
		}

		return /** @type {NonNullable<typeof this.checkCodeRequest>} */ (this.checkCodeRequest)
	}

	/**
	 * Make a parse request with the transclusion code of edit notices and edit intro and add the
	 * result to the message area.
	 *
	 * @private
	 */
	async addEditNotices() {
		let result
		try {
			const title = cd.page.title.replace(/\//g, '-')

			// Just making a parse request with both edit intro and edit notices is simpler than making
			// two requests for each of them.
			result = await parseCode(
				(this.preloadConfig.editIntro
					? `<div class="cd-editintro">{{${this.preloadConfig.editIntro}}}</div>\n`
					: '') +
					`<div class="cd-editnotice">{{MediaWiki:Editnotice-${cd.g.namespaceNumber}}}</div>` +
					`<div class="cd-editnotice">{{MediaWiki:Editnotice-${cd.g.namespaceNumber}-${title}}}</div>`,
				{ title: cd.page.name },
			)
		} catch {
			// TODO: Some error message? (But in most cases there are no edit notices anyway, and if the
			// user is knowingly offline they would be annoying.)
			return
		}

		const $editNotices = $(result.html.replace(/<div class="cd-editnotice"><\/div>/g, ''))
		if (!$editNotices.children().length && !$editNotices.text()) return

		this.$messageArea
			.append($editNotices)
			.cdAddCloseButton()
			.find(`:is(.cd-editnotice, .cd-editintro) > a.new:first-child:last-child`)
			.parent()
			.remove()

		// We mirror the functionality of the ext.charinsert module to keep the undo/redo
		// functionality.
		this.$messageArea.find('.mw-charinsert-item').each((_, el) => {
			const $el = $(el)
			$el
				.on('click', () => {
					this.encapsulateSelection({
						pre: $el.data('mw-charinsert-start'),
						post: $el.data('mw-charinsert-end'),
					})
				})
				.data('mw-charinsert-done', true)
		})

		mw.hook('wikipage.content').fire(this.$messageArea)
	}

	/**
	 * Load the content of a preload template (`preload` parameter of the URL or a POST request) to
	 * the comment input.
	 *
	 * @private
	 */
	async preloadTemplate() {
		const operation = this.operations.add('load', { affectsHeadline: false })
		const preloadPage = pageRegistry.get(
			/** @type {string} */ (this.preloadConfig.commentTemplate),
			true,
		)
		if (!preloadPage) return

		try {
			const source = await preloadPage.loadCode()
			let code = source?.code
			if (!code) return

			// eslint-disable-next-line no-one-time-vars/no-one-time-vars
			const regexp = generateTagsRegexp(['onlyinclude'])
			let match
			let onlyInclude
			while ((match = regexp.exec(code))) {
				onlyInclude ??= ''
				onlyInclude += match[3]
			}
			if (onlyInclude !== undefined) {
				code = onlyInclude
			}

			code = code
				.replace(generateTagsRegexp(['includeonly']), '$3')
				.replace(generateTagsRegexp(['noinclude']), '')
				.replace(/\$(\d+)/g, (m, s) =>
					this.preloadConfig.params === undefined ? m : (this.preloadConfig.params[s - 1] ?? m),
				)
			code = code.trim()

			if (code.includes(cd.g.signCode) || this.preloadConfig.omitSignature) {
				const omitSignatureCheckboxTyped = /** @type {import('./CheckboxInputWidget').default} */ (
					this.omitSignatureCheckbox
				)
				omitSignatureCheckboxTyped.setSelected(true)
				this.omitSignatureCheckboxAltered = true
			}

			this.commentInput.setValue(code)
			this.originalComment = code

			operation.close()

			// Dummy comment to prevent Prettier from killing the empty line
			;(this.headlineInput || this.commentInput).focus()
			this.preview()
		} catch (error) {
			this.handleError({
				error,
				cancel: true,
				operation,
			})
		}
	}

	/**
	 * Get a dummy "floatable container" to attach a popup to so that the popup is at the caret
	 * position.
	 *
	 * @returns {JQuery}
	 * @private
	 */
	getCommentInputDummyFloatableContainer() {
		const computedStyle = window.getComputedStyle(this.commentInput.getEditableElement()[0])
		const $span = $('<span>')
		// eslint-disable-next-line no-one-time-vars/no-one-time-vars
		const $div = $('<div>')
			.text(this.commentInput.getValue().slice(0, Math.max(0, this.commentInput.getRange().to)))
			.css({
				whiteSpace: 'pre-wrap',
				wordWrap: 'break-word',

				// Position off-screen
				position: 'absolute',
				visibility: 'hidden',

				width: `${Number.parseFloat(computedStyle.width)}px`,

				// Transfer the element's properties to the div.
				...cd.g.inputPropsAffectingCoords.reduce((props, propName) => {
					props[propName] = computedStyle[propName]

					return props
				}, /** @type {{ [key: string | symbol]: any }} */ ({})),
			})
			.append($span)
			.appendTo(document.body)
		$span
			.css({
				top: $span[0].offsetTop,
				left: $span[0].offsetLeft,
				width: 0,
				height: Number.parseFloat($span.css('line-height')) - 3,
			})
			.addClass('cd-dummyFloatableContainer')
		$div.remove()

		return $span
	}

	/**
	 * Tear down all popups that could be attached to the caret position or input.
	 *
	 * @private
	 */
	teardownInputPopups() {
		this.richFormattingPopup?.toggle(false).$element.remove()
		this.$commentInputPopupFloatableContainer?.remove()

		// Don't toggle off, just remove, so that it is not considered closed and may reappear
		this.manyFormsPopup?.$element.remove()
		this.uploadPopup?.$element.remove()
	}

	/**
	 * When the user inserted text that was copied with rich formatting, suggest to convert it to
	 * wikitext.
	 *
	 * @param {string} html
	 * @param {string} insertedText
	 * @private
	 */
	async suggestConvertToWikitext(html, insertedText) {
		await sleep()

		const button = new OO.ui.ButtonWidget({
			label: cd.s('cf-popup-richformatting-convert'),
			flags: ['progressive'],
		})
		const position = this.commentInput.getRange().to
		button.on('click', async () => {
			// The input is made disabled, so the content can't be changed by the user during the
			// loading stage.
			const text = await this.commentInput.getWikitextFromPaste(html)

			this.commentInput.selectRange(position - insertedText.length, position).insertContent(text)
			this.teardownInputPopups()
		})
		this.teardownInputPopups()

		const $textareaWrapper = this.toolbarLoaded
			? this.$element.find('.wikiEditor-ui-text')
			: this.commentInput.$element
		this.$commentInputPopupFloatableContainer = this.getCommentInputDummyFloatableContainer()
		$textareaWrapper.append(this.$commentInputPopupFloatableContainer)

		/**
		 * Popup that appears when pasting text that has rich formatting available.
		 *
		 * @type {OO.ui.PopupWidget|undefined}
		 */
		this.richFormattingPopup = new OO.ui.PopupWidget({
			icon: 'wikiText',
			label: wrapHtml(cd.sParse('cf-popup-richformatting')),
			$content: button.$element,
			head: true,
			autoClose: true,
			$autoCloseIgnore: this.commentInput.$input,
			$floatableContainer: this.$commentInputPopupFloatableContainer,
			$container: $textareaWrapper,
			containerPadding: -10,
			padded: true,
			classes: ['cd-popup-richFormatting'],
		})
		$textareaWrapper.append(this.richFormattingPopup.$element)
		this.richFormattingPopup.toggle(true)
	}

	/**
	 * Upload an image and insert its markup to the comment form.
	 *
	 * @param {File} [file] File to upload.
	 * @param {boolean} [openInsertFileDialogAfterwards] Whether to open the WikiEditor's
	 *   "Insert file" dialog after the "Upload file" dialog is closed with success.
	 */
	async uploadImage(file, openInsertFileDialogAfterwards = false) {
		if (this.uploadDialog || this.commentInput.isPending() || !this.uploadToCommons) return

		this.pushPending()

		try {
			await mw.loader.using([
				'mediawiki.Upload.Dialog',
				'mediawiki.ForeignStructuredUpload.BookletLayout',
				'mediawiki.widgets',
			])
		} catch {
			mw.notify(cd.s('cf-error-uploadimage'), { type: 'error' })
			this.popPending()

			return
		}

		this.uploadDialog = new (getUploadDialogClass())()
		const windowManager = cd.getWindowManager()
		windowManager.addWindows([this.uploadDialog])
		const win = windowManager.openWindow(this.uploadDialog, {
			file,
			commentForm: this,
		})
		win.closed.then(() => {
			delete this.uploadDialog
		})

		/**
		 * @typedef {object} ImageInfo
		 * @property {string} canonicaltitle
		 * @property {string} url
		 */

		this.uploadDialog.uploadBooklet.on('fileSaved', (/** @type {ImageInfo} */ imageInfo) => {
			const uploadDialogTyped =
				/** @type {InstanceType<ReturnType<import('./UploadDialog').default>>} */ (
					this.uploadDialog
				)
			uploadDialogTyped.close()
			win.closed.then(() => {
				if (openInsertFileDialogAfterwards) {
					$.wikiEditor.modules.dialogs.api.openDialog(this, 'insert-file')
					$('#wikieditor-toolbar-file-target').val(imageInfo.canonicaltitle)

					// If some text was selected, insert a link. Otherwise, insert an image.
				} else if (this.commentInput.getRange().from === this.commentInput.getRange().to) {
					// Localise the "File:" prefix
					const filename = new mw.Title(imageInfo.canonicaltitle).getPrefixedText()

					// Sometimes the file is not yet available on Commons. The preview gives a red link in
					// that case. Use a hack to run the preview now so that the next preview runs a second
					// later.
					this.preview(true)

					this.encapsulateSelection({
						pre: `[[${filename}|frameless|none]]`,
					})
				} else {
					this.encapsulateSelection({
						pre: `[${imageInfo.url} `,
						post: `]`,
					})
				}
			})
		})
	}

	/**
	 * Handle `paste` and `drop` events.
	 *
	 * @param {JQuery.TriggeredEvent} event
	 */
	handlePasteDrop = (event) => {
		const originalEvent = /** @type {ClipboardEvent | DragEvent} */ (event.originalEvent)
		const data =
			'clipboardData' in originalEvent ? originalEvent.clipboardData : originalEvent.dataTransfer
		if (!data) return

		const image = [...data.items].find((item) => CommentForm.allowedFileTypes.includes(item.type))
		if (image) {
			event.preventDefault()
			this.uploadImage(image.getAsFile() || undefined)
		} else if (data.types.includes('text/html')) {
			const html = data.getData('text/html')
			if (!isHtmlConvertibleToWikitext(html, this.commentInput.$element[0])) return

			this.suggestConvertToWikitext(html, data.getData('text/plain').replace(/\r/g, ''))
		}
	}

	/**
	 * Add event listeners to form elements.
	 *
	 * @private
	 */
	addEventListeners() {
		const emitChange = () => {
			this.emit('change')
		}
		const preview = () => {
			this.preview()
		}

		// Hotkeys

		// Use capture to get ahead of CodeMirror's keydown handler. Note that there may be a duplicate
		// event dispatched by the textarea in CodeMirror#domEventHandlersExtension.
		this.$element[0].addEventListener(
			'keydown',
			(event) => {
				// We have some ugly inquisitive code here because we need to coordinate 3 components that
				// all may take precedence depending on the case: CodeMirror, Tribute (autocomplete),
				// CommentForm. E.g., Esc is handled by all three (Esc to close different panels and menus);
				// Ctrl+Enter was handled by all three, but I removed it from Tribute. Tribute uses capture;
				// CodeMirror doesn't; we use capture for part of the keys. We control CommentForm and
				// Tribute and don't control CodeMirror. We process keys on the comment form element;
				// Tribute and CodeMirror process keys on the inputs. So it's tricky.

				if (this.commentInput.isAutocompleteMenuActive()) return

				// Ctrl+Enter
				if (keyCombination(event, 13, ['cmd'])) {
					this.submit()
					event.preventDefault()
				}

				// Esc
				if (
					keyCombination(event, 27) &&
					// When there is a search panel, CodeMirror closes it on Esc even when the caret is in the
					// main text box. With the preferences panel, it is so only when the panel itself is
					// focused.
					(!this.codeMirror?.isActive ||
						!this.$element.find('.cm-panels :focus, .cm-mw-panel--search-panel').length)
				) {
					this.cancel()
					event.preventDefault()
				}
			},
			{ capture: true },
		)

		this.$element[0].addEventListener('keydown', (event) => {
			if (this.codeMirror?.isActive && /** @type {Element} */ (event.target).tagName === 'TEXTAREA')
				return

			// WikiEditor started supporting these in October 2024
			// https://phabricator.wikimedia.org/T62928
			if (!this.toolbarLoaded) {
				// Ctrl+B
				if (keyCombination(event, 66, ['cmd'])) {
					this.encapsulateSelection({
						pre: `'''`,
						peri: mw.msg('wikieditor-toolbar-tool-bold-example'),
						post: `'''`,
					})
					event.preventDefault()
				}

				// Ctrl+I
				if (keyCombination(event, 73, ['cmd'])) {
					this.encapsulateSelection({
						pre: `''`,
						peri: mw.msg('wikieditor-toolbar-tool-italic-example'),
						post: `''`,
					})
					event.preventDefault()
				}

				// Ctrl+U
				if (keyCombination(event, 85, ['cmd'])) {
					this.encapsulateSelection(CommentForm.encapsulateOptions.underline)
					event.preventDefault()
				}
			}

			// Ctrk+Shift+5
			if (keyCombination(event, 53, ['cmd', 'shift'])) {
				this.encapsulateSelection(CommentForm.encapsulateOptions.strikethrough)
				event.preventDefault()
			}

			// Ctrk+Shift+6
			if (keyCombination(event, 54, ['cmd', 'shift'])) {
				this.encapsulateSelection(CommentForm.encapsulateOptions.code)
				event.preventDefault()
			}

			// Ctrk+Shift+8
			if (keyCombination(event, 56, ['cmd', 'shift'])) {
				this.commentInput.$element.find('.tool[rel="ulist"] a').get(0)?.click()
				event.preventDefault()
			}
		})

		// "focusin" is "focus" that bubbles, i.e. propagates up the node tree.
		this.$element.on('focusin', () => {
			this.lastFocused = new Date()
			controller.updatePageTitle()
		})

		this.addEventListenersToTextInputs(emitChange, preview)
		this.addEventListenersToCheckboxes(emitChange, preview)
		this.addEventListenersToButtons()
	}

	/**
	 * Handle the settings update event.
	 */
	onSettingsUpdate = () => {
		this.terminateAutocomplete()
		this.initAutocomplete()

		this.previewButton.toggle(!cd.settings.get('autopreview'))
		this.viewChangesButton.toggle(cd.settings.get('autopreview'))

		if (cd.settings.get('showToolbar') && !this.toolbarLoaded) {
			this.builder.buildToolbar(this.loadCustomModules())
		} else if (!cd.settings.get('showToolbar') && this.toolbarLoaded) {
			this.hideToolbar()
		}

		this.$insertButtons?.empty()
		this.builder.buildInsertButtons()

		this.codeMirror?.updateAutocompletePreference(cd.settings.get('useNativeAutocomplete'))
	}

	/**
	 * Add event listeners to the text inputs.
	 *
	 * @param {() => void} emitChange
	 * @param {() => void} preview
	 * @private
	 */
	addEventListenersToTextInputs(emitChange, preview) {
		const substAliasesString = ['subst:'].concat(cd.config.substAliases).join('|')
		const textReactions = /** @type {import('../config/default').Reaction[]} */ ([
			{
				regexp: new RegExp(cd.g.signCode + String.raw`\s*$`),
				message: cd.sParse('cf-reaction-signature', cd.g.signCode),
				name: 'signatureNotNeeded',
				type: 'notice',
				checkFunc: () => !this.omitSignatureCheckbox?.isSelected(),
			},
			{
				regexp: /<pre[ >]/,
				message: cd.sParse(
					'cf-reaction-pre',
					'<code><nowiki><pre></'.concat('nowiki></code>'),
					'<code><nowiki><syntaxhighlight lang="wikitext"></'.concat('nowiki></code>'),
				),
				name: 'dontUsePre',
				type: 'warning',
			},
			{
				regexp: new RegExp(`\\{\\{(?! *(${substAliasesString}))`, 'i'),
				message: cd.sParse('cf-reaction-templateinheadline'),
				type: 'warning',
				name: 'templateInHeadline',
				target: 'headline',
				checkFunc: () => !this.preloadConfig.headline,
			},
			...cd.config.textReactions,
		])

		if (this.headlineInput) {
			this.headlineInput
				.on('change', (headline) => {
					this.updateAutoSummary(true, true)

					textReactions
						.filter(({ target }) => target === 'headline' || target === 'all')
						.forEach((reaction) => {
							this.reactToText(headline, reaction)
						})
				})
				.on('change', preview)
				.on('change', emitChange)

			this.headlineInput.on('enter', this.submit)
		}

		this.commentInput
			.on('change', (text) => {
				if (this.richFormattingPopup) {
					this.teardownInputPopups()
				}

				this.updateAutoSummary(true, true)

				textReactions
					.filter(({ target }) => !target || target === 'comment' || target === 'all')
					.forEach((reaction) => {
						this.reactToText(text, reaction)
					})
			})
			.on('change', preview)
			.on('change', emitChange)

		this.addEventListenersToCommentInput()

		// "Performance issues?" hint
		if (
			controller.isLongPage() &&
			$.client.profile().layout === 'webkit' &&
			!cd.settings.get('improvePerformance') &&
			!this.haveSuggestedToImprovePerformanceRecently()
		) {
			const keypressCount = 10
			const rateLimit = 50
			const checkForPerformanceIssues = (/** @type {JQuery.Event} */ e) => {
				this.checkForPerformanceIssues(e, keypressCount, rateLimit)
			}
			this.commentInput.$input.on('input', checkForPerformanceIssues)
			this.headlineInput?.$input.on('input', checkForPerformanceIssues)
		}

		this.summaryInput
			.on('manualChange', () => {
				this.summaryAltered = true
				this.summaryAutopreviewBlocked = false
			})
			.on('change', () => {
				if (!this.summaryAutopreviewBlocked) {
					preview()
				}
			})
			.on('change', emitChange)

		this.summaryInput.on('enter', this.submit)
	}

	/**
	 * Add event listeners to the comment input, be it a textarea or CodeMirror's contenteditable.
	 *
	 * @private
	 */
	addEventListenersToCommentInput() {
		/**
		 * @typedef {object} TributeReplacedEvent
		 * @property {object} instance
		 * @property {string} instance.trigger
		 */

		this.commentInput
			.getEditableElement()
			.on('dragover.cd', (event) => {
				const data = /** @type {DragEvent} */ (event.originalEvent).dataTransfer
				if (
					!data ||
					![...data.items].some((item) => CommentForm.allowedFileTypes.includes(item.type))
				) {
					return
				}

				this.commentInput.$element.addClass('cd-input-acceptFile')
				event.preventDefault()
			})
			.on('dragleave.cd drop.cd blur.cd', () => {
				this.commentInput.$element.removeClass('cd-input-acceptFile')
			})
			.on('paste.cd drop.cd', this.handlePasteDrop)
			.on('tribute-replaced.cd', (event) => {
				if (
					/** @type {CustomEvent<TributeReplacedEvent>} */ (event.originalEvent).detail.instance
						.trigger === cd.config.mentionCharacter
				) {
					if (this.isMode('edit')) {
						this.showMessage(
							wrapHtml(cd.sParse('cf-reaction-mention-edit'), { targetBlank: true }),
							{
								type: 'notice',
								name: 'mentionEdit',
							},
						)
					}
					if (
						this.omitSignatureCheckbox?.isSelected() &&
						!this.commentInput.getValue().includes(cd.g.signCode)
					) {
						this.showMessage(
							wrapHtml(cd.sParse('cf-reaction-mention-nosignature'), {
								targetBlank: true,
							}),
							{
								type: 'notice',
								name: 'mentionNoSignature',
							},
						)
					}
				}
			})
	}

	/**
	 * Remove event listeners from the comment input, be it a textarea or CodeMirror's
	 * contenteditable.
	 *
	 * @private
	 */
	removeEventListenersFromCommentInput() {
		this.commentInput.getEditableElement().off('.cd')
	}

	/**
	 * Check whether we recently suggested the user to enable the "Improve performance" setting via a
	 * warn notification.
	 *
	 * @returns {boolean}
	 */
	haveSuggestedToImprovePerformanceRecently() {
		const lastSuggested = cd.settings.get('improvePerformance-lastSuggested')

		return Boolean(lastSuggested && getDayTimestamp() - lastSuggested < 14)
	}

	/**
	 * Used as a callback for `keydown` events - check whether there are performance issues based on
	 * the rate of the last `keypressCount` keypresses. If there are such, show a notification.
	 *
	 * @param {JQuery.Event} event
	 * @param {number} keypressCount
	 * @param {number} rateLimit
	 * @private
	 */
	checkForPerformanceIssues(event, keypressCount, rateLimit) {
		if (this.haveSuggestedToImprovePerformanceRecently()) return

		this.lastKeyPresses.push(event.timeStamp)
		this.lastKeyPresses.splice(0, this.lastKeyPresses.length - keypressCount)
		if (
			this.lastKeyPresses[keypressCount - 1] - this.lastKeyPresses[0] <
			keypressCount * rateLimit
		) {
			mw.notify(
				wrapHtml(cd.sParse('warning-performance'), {
					callbacks: {
						'cd-notification-talkPageSettings': (_event, button) => {
							cd.settings.showDialogOnButtonClick(button, 'talkPage')
						},
					},
				}),
				{
					title: cd.s('warning-performance-title'),
					type: 'warn',
					autoHideSeconds: 'long',
				},
			)
			cd.settings.saveSettingOnTheFly('improvePerformance-lastSuggested', getDayTimestamp())
		}
	}

	/**
	 * Add event listeners to the checkboxes.
	 *
	 * @param {() => void} emitChange
	 * @param {() => void} preview
	 * @private
	 */
	addEventListenersToCheckboxes(emitChange, preview) {
		this.minorCheckbox?.on('change', emitChange)
		this.watchCheckbox?.on('change', emitChange)
		this.subscribeCheckbox?.on('change', emitChange)
		this.omitSignatureCheckbox
			?.on('change', preview)
			.on('manualChange', () => {
				this.omitSignatureCheckboxAltered = true
			})
			.on('change', emitChange)
		this.deleteCheckbox
			?.on('change', (/** @type {boolean} */ selected) => {
				this.updateAutoSummary(true, true)
				this.updateFormOnDeleteCheckboxChange(selected)
			})
			.on('change', preview)
			.on('change', emitChange)
	}

	/**
	 * Add event listeners to the buttons.
	 *
	 * @private
	 */
	addEventListenersToButtons() {
		this.advancedButton.on('click', () => {
			this.toggleAdvanced()
		})
		this.settingsButton?.on('click', () => {
			cd.settings.showDialog()
		})
		this.cancelButton.on('click', () => {
			this.cancel()
		})
		this.viewChangesButton.on('click', () => {
			this.viewChanges()
		})
		this.previewButton.on('click', () => {
			this.preview(false)
		})
		this.submitButton.on('click', () => {
			this.submit()
		})
	}

	/**
	 * Initialize autocomplete using {@link https://github.com/zurb/tribute Tribute}.
	 *
	 * @private
	 */
	initAutocomplete() {
		/** @type {Comment[]} */
		let commentsInSection = []
		if (this.targetSection) {
			commentsInSection = this.targetSection.getBase().comments
		} else if (!this.isMode('addSection')) {
			// Comments in the lead section
			commentsInSection = commentManager.query((comment) => !comment.section)
		}
		if (this.isMode('edit')) {
			commentsInSection = commentsInSection.filter((comment) => comment !== this.target)
		}

		const sections = sectionManager.getAll()

		let pageOwner
		if (cd.g.namespaceNumber === 3) {
			const userName = (cd.page.title.match(/^([^/]+)/) || [])[0]
			if (userName) {
				pageOwner = userRegistry.get(userName)
			}
		}
		let defaultUserNames = commentsInSection
			.map((comment) => comment.author)
			.concat(
				// User links in the section
				commentsInSection.flatMap((comment) =>
					comment.$elements
						.find('a')
						.filter(
							(_, /** @type {HTMLAnchorElement} */ el) =>
								cd.g.userLinkRegexp.test(el.title) &&
								!el.closest(
									cd.settings.get('commentDisplay') === 'compact'
										? '.cd-signature'
										: '.cd-comment-author',
								),
						)
						.get()
						.map((/** @type {HTMLAnchorElement} */ el) => Parser.processLink(el)?.userName)
						.filter(defined)
						.map((/** @type {string} */ userName) => userRegistry.get(userName)),
				),
			)
			.concat(pageOwner || [])
			.filter(defined)
			.sort(
				(u1, u2) =>
					Number(u2.isRegistered()) - Number(u1.isRegistered()) || (u2.name > u1.name ? -1 : 1),
			)
			.filter((u) => u !== cd.user)
			.map((u) => u.name)

		// Move the addressee to the beginning of the user list
		for (let с = this.parentComment; с; с = с.getParent()) {
			if (с.author !== cd.user) {
				if (!с.author.isRegistered()) break
				defaultUserNames.unshift(с.author.getName())
				break
			}
		}

		defaultUserNames = defaultUserNames.filter(unique)

		this.autocomplete = new AutocompleteManager({
			types: cd.settings.get('autocompleteTypes'),
			inputs: [this.commentInput],
			typeConfigs: {
				mentions: { defaultEntries: defaultUserNames },
				commentLinks: { data: { comments: commentsInSection, sections } },
			},
		})
		this.autocomplete.init()

		if (this.headlineInput) {
			this.headlineAutocomplete = new AutocompleteManager({
				types: ['mentions', 'wikilinks', 'tags'],
				inputs: [this.headlineInput],
				typeConfigs: {
					mentions: { defaultEntries: defaultUserNames },
				},
			})
			this.headlineAutocomplete.init()
		}

		this.summaryAutocomplete = new AutocompleteManager({
			types: ['mentions', 'wikilinks'],
			inputs: [this.summaryInput],
			typeConfigs: {
				mentions: { defaultEntries: defaultUserNames },
			},
		})
		this.summaryAutocomplete.init()
	}

	/**
	 * Terminate autocomplete on the form.
	 *
	 * @private
	 */
	terminateAutocomplete() {
		this.autocomplete.terminate()
		this.headlineAutocomplete?.terminate()
		this.summaryAutocomplete.terminate()
	}

	/**
	 * Show or hide the advanced section.
	 *
	 * @private
	 */
	toggleAdvanced() {
		if (this.$advanced.is(':hidden')) {
			this.$advanced.show()
			const value = this.summaryInput.getValue()
			const match = value.match(/^.+?\*\/ */)
			this.summaryInput.focus().selectRange(match ? match[0].length : 0, value.length)
		} else {
			this.$advanced.hide()
			this.commentInput.focus()
		}
	}

	/**
	 * Adjust the button labels according to the form width: if the form is to narrow, the labels will
	 * shrink.
	 */
	adjustLabels = () => {
		const formWidth = /** @type {number} */ (this.$element.width())
		const additive = 7

		if (this.$element.hasClass('cd-commentForm-short')) {
			if (formWidth >= this.buttonsTotalWidthStandard + additive) {
				this.$element.removeClass('cd-commentForm-short')
				this.submitButton.setLabel(this.submitButtonLabelStandard)
				this.previewButton.setLabel(cd.s('cf-preview'))
				this.viewChangesButton.setLabel(cd.s('cf-viewchanges'))
				this.cancelButton.setLabel(cd.s('cf-cancel'))
			}
		} else {
			this.buttonsTotalWidthStandard = /** @type {(keyof CommentForm)[]} */ ([
				'submitButton',
				'previewButton',
				'viewChangesButton',
				'cancelButton',
				'advancedButton',
				'helpPopupButton',
				'settingsButton',
			])
				.map((name) => /** @type {JQuery<HTMLElement> | undefined} */ (this[name]?.$element))
				.filter(defined)
				.filter(($el) => $el.is(':visible'))
				.reduce((width, $el) => width + ($el.outerWidth(true) || 0), 0)
			if (formWidth < this.buttonsTotalWidthStandard + additive) {
				this.$element.addClass('cd-commentForm-short')
				this.submitButton.setLabel(this.submitButtonLabelShort)
				this.previewButton.setLabel(cd.s('cf-preview-short'))
				this.viewChangesButton.setLabel(cd.s('cf-viewchanges-short'))
				this.cancelButton.setLabel(cd.s('cf-cancel-short'))
			}
		}
	}

	/**
	 * Push the pending status of the form inputs.
	 *
	 * @param {boolean} setDisabled Whether to set the buttons and inputs disabled.
	 * @param {boolean} affectsHeadline Should the `pushPending` method be applied to the headline
	 *   input.
	 * @see https://doc.wikimedia.org/oojs-ui/master/js/OO.ui.mixin.PendingElement.html#pushPending
	 */
	pushPending(setDisabled = false, affectsHeadline = true) {
		this.commentInput.pushPending()
		this.summaryInput.pushPending()
		if (affectsHeadline) {
			this.headlineInput?.pushPending()
		}

		if (setDisabled) {
			this.commentInput.setDisabled(true)
			this.summaryInput.setDisabled(true)
			if (affectsHeadline) {
				this.headlineInput?.setDisabled(true)
			}

			this.submitButton.setDisabled(true)
			this.previewButton.setDisabled(true)
			this.viewChangesButton.setDisabled(true)
			this.cancelButton.setDisabled(true)

			this.minorCheckbox?.setDisabled(true)
			this.watchCheckbox?.setDisabled(true)
			this.subscribeCheckbox?.setDisabled(true)
			this.omitSignatureCheckbox?.setDisabled(true)
			this.deleteCheckbox?.setDisabled(true)
		}

		if (this.commentInput.isPending()) {
			this.$element.addClass('cd-commentForm-pending')
		}
	}

	/**
	 * Pop the pending status of the form inputs.
	 *
	 * @param {boolean} [setEnabled] Whether to set buttons and inputs enabled.
	 * @param {boolean} [affectsHeadline] Should the `popPending` method be applied to the
	 *   headline input.
	 * @see https://doc.wikimedia.org/oojs-ui/master/js/OO.ui.mixin.PendingElement.html#popPending
	 */
	popPending(setEnabled = false, affectsHeadline = true) {
		this.commentInput.popPending()
		this.summaryInput.popPending()
		if (affectsHeadline) {
			this.headlineInput?.popPending()
		}

		if (setEnabled) {
			this.commentInput.setDisabled(false)
			this.summaryInput.setDisabled(false)
			if (affectsHeadline) {
				this.headlineInput?.setDisabled(false)
			}

			this.submitButton.setDisabled(false)
			this.previewButton.setDisabled(false)
			this.viewChangesButton.setDisabled(false)
			this.cancelButton.setDisabled(false)

			this.minorCheckbox?.setDisabled(false)
			this.watchCheckbox?.setDisabled(false)
			this.subscribeCheckbox?.setDisabled(false)
			this.omitSignatureCheckbox?.setDisabled(false)
			this.deleteCheckbox?.setDisabled(false)

			// Restore disabled states caused by the delete checkbox being checked
			if (this.deleteCheckbox?.isSelected()) {
				this.updateFormOnDeleteCheckboxChange(true)
			}
		}

		if (!this.commentInput.isPending()) {
			this.$element.removeClass('cd-commentForm-pending')
		}
	}

	/**
	 * Show a service message above the form.
	 *
	 * @param {string|JQuery} htmlOrJquery
	 * @param {object} [options]
	 * @param {'notice'|'error'|'warning'|'success'} [options.type] See the
	 *   {@link https://doc.wikimedia.org/oojs-ui/master/demos/?page=widgets&theme=wikimediaui&direction=ltr&platform=desktop#MessageWidget-type-notice-inline-true OOUI Demos}.
	 * @param {string} [options.name] Name added to the class name of the message element.
	 * @param {boolean} [options.framed] Whether the message should be framed in an OOUI widget, or
	 *   its HTML contains the whole message code.
	 */
	showMessage(htmlOrJquery, { type = 'notice', name, framed = true } = {}) {
		// Don't show two messages with the same name (we assume they should have the same text).
		if (this.torndown || (name && this.$messageArea.children(`.cd-message-${name}`).length)) {
			return
		}

		this.$messageArea
			.append(
				framed
					? new OO.ui.MessageWidget({
							type,
							inline: true,
							label: typeof htmlOrJquery === 'string' ? wrapHtml(htmlOrJquery) : htmlOrJquery,
							classes: ['cd-message', name ? `cd-message-${name}` : undefined].filter(defined),
						}).$element
					: htmlOrJquery,
			)
			.cdAddCloseButton()
			.cdScrollIntoView('top')
	}

	/**
	 * Hide the service message above the form with the provided class.
	 *
	 * @param {string} name
	 */
	hideMessage(name) {
		const $info = this.$messageArea.children(`.cd-message-${name}`)
		if ($info.length) {
			$info.remove()
		}
		if (this.$messageArea.children().length === 1) {
			this.$messageArea.cdRemoveCloseButton()
		}
	}

	/**
	 * Abort the operation the form is undergoing and show an error message.
	 *
	 * @param {object} options
	 * @param {JQuery} options.$message Message visible to the user.
	 * @param {'error'|'notice'|'warning'} [options.messageType] Message type if not `'error'`.
	 * @param {boolean} [options.framed] Whether to show the OOUI message framing for the error
	 *   message.
	 * @param {Error | undefined} [options.errorToLog] Error to log in the browser console.
	 * @param {boolean} [options.cancel] Cancel the form and show the message as a notification.
	 * @param {import('./CommentFormOperation').default} [options.operation] Operation the form is
	 *   undergoing.
	 * @private
	 */
	abort({ $message, messageType = 'error', framed = true, errorToLog, cancel = false, operation }) {
		operation?.close()

		if (this.torndown) return

		if (errorToLog) {
			cd.debug.logWarn(errorToLog)
		}

		if (cancel) {
			notifications.add($message, {
				type: 'error',
				autoHideSeconds: 'long',
			})
			this.cancel(false)
		} else {
			if (!this.registered) return

			if (!(operation && operation.getType() === 'preview' && operation.getOptionValue('isAuto'))) {
				this.showMessage($message, {
					type: messageType,
					framed,
				})
			}
			this.$messageArea.cdScrollIntoView('top')
			this.captchaInput?.focus()
		}
	}

	/**
	 * @typedef {object} HandleErrorOptions
	 * @property {unknown} error
	 * @property {string} [message] Text of the error. (Either `code`, `apiResponse`, `message`, or
	 *   `$message` should be specified.)
	 * @property {JQuery} [$message] JQuery element with the error (supposed not need the OOUI message
	 *   framing).
	 * @property {'error' | 'notice' | 'warning'} [messageType='error'] Message type if not `'error'`.
	 * @property {boolean} [cancel=false] Cancel the form and show the message as a notification.
	 * @property {import('./CommentFormOperation').default} [operation] Operation the form is
	 *   undergoing.
	 */

	/**
	 * Abort an operation the form is undergoing and show an appropriate error message. This method is
	 * a wrapper around `CommentForm#abort`.
	 *
	 * @param {HandleErrorOptions} options
	 */
	handleError({ error, message, $message, messageType = 'error', cancel = false, operation }) {
		const cdError =
			error instanceof CdError
				? // Without the type casting, in VS Code `error` becomes CdError<any> instead of
					// CdError<ErrorType>
					/** @type {CdError} */ (error)
				: CdError.generateCdErrorFromJsErrorOrMessage(error || message)

		message = cdError.getMessage() || ''
		/** @type {CdError | undefined} */
		let errorToLog
		const type = cdError.getType()
		switch (type) {
			case 'parse': {
				const editUrl = cd.g.server + cd.page.getUrl({ action: 'edit' })
				switch (cdError.getCode()) {
					case 'locateComment':
						message = cd.sParse('error-locatecomment', editUrl, cd.page.name)
						break
					case 'locateSection':
						message = cd.sParse('error-locatesection', editUrl, cd.page.name)
						break
					case 'numberedList':
						message = cd.sParse('cf-error-numberedlist')
						break
					case 'numberedList-table':
						message =
							cd.sParse('cf-error-numberedlist') + ' ' + cd.sParse('cf-error-numberedlist-table')
						break
					case 'closed':
						message = cd.sParse('cf-error-closed')
						break
					case 'findPlace':
						message = cd.sParse('cf-error-findplace', editUrl)
						break
					case 'delete-repliesToComment':
						message = cd.sParse('cf-error-delete-repliestocomment')
						break
					case 'delete-repliesInSection':
						message = cd.sParse('cf-error-delete-repliesinsection')
						break
					case 'commentLinks-commentNotFound':
						message = cd.sParse(
							'cf-error-commentlinks-commentnotfound',
							/** @type {{ id: string }} */ (cdError.getDetails()).id,
						)
						break
				}
				break
			}

			case 'api': {
				// Error messages from the API should override our generic messages, except for `missing` and `missingtitle` (the last comes from CommentForm#editPage).
				switch (cdError.getCode()) {
					case 'missing':
						message = cd.sParse('cf-error-pagedoesntexist')
						break

					case 'missingtitle':
						message ??= cdError.getHtml()
						break

					default:
						message = cdError.getHtml()
				}

				errorToLog ??= cdError
				break
			}

			case 'response': {
				switch (cdError.getCode()) {
					case 'missingtitle':
						message = cd.sParse('cf-error-pagedoesntexist')
						break
				}

				errorToLog ??= cdError
				break
			}

			case 'network':
			case 'javascript': {
				message = typeof message === 'string' ? message + ' ' + cd.sParse(`error-${type}`) : message
				errorToLog ??= cdError
				break
			}
		}
		if (!message) return

		// If the message in the jQuery format was pre-provided, then by convention it's one that is not
		// supposed to be framed.
		const framed = !$message
		$message ??=
			typeof message === 'string'
				? wrapHtml(message, {
						callbacks: {
							'cd-message-reloadPage': () => {
								if (this.confirmClose()) {
									this.reloadPage()
								}
							},
						},
					})
				: message
		$message.find('.mw-parser-output').css('display', 'inline')

		this.abort({
			$message,
			messageType,
			framed,
			errorToLog,
			cancel,
			operation,
		})
	}

	/**
	 * Convert the comment form input to wikitext.
	 *
	 * @param {CommentFormAction} action
	 * @returns {string}
	 * @throws {CdError}
	 */
	inputToCode(action) {
		// Are we at a stage where we better introduce a lexical analyzer (or use MediaWiki's / some
		// part of it)?..

		let code = this.commentInput.getValue()
		code = cd.config.preTransformCode?.(code, this) || code

		const transformer = new CommentFormInputTransformer(code, this, action)

		/**
		 * Will the comment be indented (is a reply or an edited reply).
		 *
		 * This is mostly to tell if unconverted newlines will cause problems in the comment layout and
		 * prevent it. Theoretically, this value can change.
		 *
		 * @type {boolean|undefined}
		 */
		this.willCommentBeIndented = transformer.isIndented()

		code = transformer.transform()
		code = cd.config.postTransformCode?.(code, this) || code

		return code
	}

	/**
	 * Add anchor code to comments linked from the comment.
	 *
	 * @param {string} originalContextCode Code of the section or page.
	 * @param {string[]} commentIds
	 * @returns {string} New code of the section or page.
	 * @throws {CdError}
	 * @private
	 */
	addAnchorsToComments(originalContextCode, commentIds) {
		let contextCode = originalContextCode
		commentIds.forEach((id) => {
			const comment = commentManager.getById(id)
			if (comment) {
				const commentSource = comment.locateInCode(undefined, contextCode)
				const anchorCode = cd.config.getAnchorCode(id)
				if (commentSource.code.includes(anchorCode)) return

				const commentCodePart = CommentFormInputTransformer.prependIndentationToLine(
					commentSource.indentation,
					commentSource.code,
				)
				const commentTextIndex = /** @type {RegExpMatchArray} */ (
					commentCodePart.match(/^[:*#]* */)
				)[0].length
				;({ contextCode } = commentSource.modifyContext({
					action: 'edit',
					commentCode:
						(commentSource.headingCode || '') +
						commentCodePart.slice(0, commentTextIndex) +
						anchorCode +
						commentCodePart.slice(commentTextIndex) +
						commentSource.signatureDirtyCode,
					contextCode,
				}))
			} else if (!$('#' + id).length) {
				throw new CdError({
					type: 'parse',
					code: 'commentLinks-commentNotFound',
					details: { id },
				})
			}
		})

		return contextCode
	}

	/**
	 * Prepare the new wikitext of the section or page based on the comment form input and handle
	 * errors.
	 *
	 * @param {'submit'|'viewChanges'} action
	 * @param {import('./CommentFormOperation').default} operation Operation the form is undergoing.
	 * @returns {Promise<
	 *     {
	 *       contextCode: string;
	 *       commentCode?: string;
	 *     }
	 *   | void
	 * >}
	 * @private
	 */
	async buildSource(action, operation) {
		const commentIds = CommentForm.extractCommentIds(this.commentInput.getValue())

		this.setNewSectionApi(
			Boolean(
				this.isMode('addSection') &&
					!this.newTopicOnTop &&
					this.headlineInput?.getValue().trim() &&
					!commentIds.length,
			),
		)

		if (!this.isNewSectionApi()) {
			try {
				await this.target.loadCode(this, !cd.page.exists())
			} catch (error) {
				this.handleError({
					error,
					message: error instanceof CdError ? cd.sParse('cf-error-getpagecode') : undefined,
					operation,
				})

				return
			}
		}

		/** @type {string} */
		let contextCode
		let commentCode
		try {
			;({ contextCode, commentCode } = /** @type {Source} */ (this.target.source).modifyContext({
				// Ugly solution to avoid overcomplication of code: for replies, we need to get
				// CommentSource#isReplyOutdented set for `action === 'reply'` which we don't have so far.
				// So let CommentSource#modifyContext() compute it. In the rest of cases just get the
				// comment code.
				commentCode: this.isMode('reply') ? undefined : this.inputToCode(action),

				action: this.mode,
				doDelete: this.deleteCheckbox?.isSelected(),
				commentForm: this,
				commentFormAction: action,
			}))
			contextCode = this.addAnchorsToComments(contextCode, commentIds)
		} catch (error) {
			this.handleError({ error, operation })

			return
		}

		return { contextCode, commentCode }
	}

	/**
	 * Check if the form is being submitted right now.
	 *
	 * @returns {boolean}
	 */
	isBeingSubmitted() {
		return Boolean(this.operations.filterByType('submit').length)
	}

	/**
	 * Check if the content of the form is being loaded right now.
	 *
	 * @returns {boolean}
	 */
	isContentBeingLoaded() {
		return Boolean(this.operations.filterByType('load').length)
	}

	/**
	 * Update the preview area with the content of the preview.
	 *
	 * @param {string} html
	 * @private
	 */
	updatePreview(html) {
		this.$previewArea
			.html(html)
			.prepend(
				$('<div>').addClass('cd-commentForm-previewArea-label').text(cd.s('cf-block-preview')),
			)
			.cdAddCloseButton()
			.toggleClass('cd-commentForm-previewArea-indentedComment', this.willCommentBeIndented)

		/**
		 * A comment preview has been rendered.
		 *
		 * @event previewReady
		 * @param {JQuery} $previewArea {@link CommentForm#$previewArea} object.
		 * @param {object} cd {@link convenientDiscussions} object.
		 */
		mw.hook('convenientDiscussions.previewReady').fire(this.$previewArea, cd)

		mw.hook('wikipage.content').fire(this.$previewArea)
	}

	/**
	 * Preview the comment.
	 *
	 * @param {boolean} [isAuto] Preview is initiated automatically (if the user has the
	 *   `autopreview` setting set to `true`).
	 * @param {import('./CommentFormOperation').default} [operation] Operation object when the
	 *   function is called from within itself, being delayed.
	 * @fires previewReady
	 */
	async preview(isAuto = true, operation = undefined) {
		if (
			this.isContentBeingLoaded() ||
			(!cd.settings.get('autopreview') && (isAuto || this.isBeingSubmitted()))
		) {
			operation?.close()

			return
		}

		operation ??= this.operations.add('preview', { isAuto })

		if (isAuto) {
			const lastPreviewTimestamp = this.lastPreviewTimestamp
			if (lastPreviewTimestamp) {
				const isTooEarly = Date.now() - lastPreviewTimestamp < 1000
				if (isTooEarly || this.operations.filterByType('preview').some((op) => op !== operation)) {
					if (this.previewTimeout) {
						operation.close()
					} else {
						operation.delay()
						this.previewTimeout = setTimeout(
							() => {
								this.previewTimeout = undefined
								this.preview(true, operation)
							},
							isTooEarly ? 1000 - (Date.now() - lastPreviewTimestamp) : 100,
						)
					}

					return
				}
			}

			operation.undelay()
			this.lastPreviewTimestamp = Date.now()
		}

		if (operation.maybeClose()) return

		/*
		 * This condition can be met:
		 * - when restoring the form from a session backup;
		 * - when the target comment has not been loaded yet, possibly because of an error when tried to
		 *   (if the mode is 'edit' and the comment has not been loaded, this method would halt after
		 *   looking for an unclosed 'load' operation above).
		 */
		if (!this.isMode('addSection') && !this.target.source) {
			await this.checkCode()
			operation.close()
			if (operation.isClosed()) return
		}

		const commentInputValue = this.commentInput.getValue()

		let html
		let parsedSummary
		try {
			;({ html, parsedSummary } = await parseCode(this.inputToCode('preview'), {
				title: this.targetPage.name,
				summary: buildEditSummary({ text: this.summaryInput.getValue() }),
			}))
		} catch (error) {
			this.handleError({
				error,
				message: error instanceof CdError ? cd.sParse('cf-error-preview') : undefined,
				operation,
			})

			return
		}

		if (operation.maybeClose()) return

		if (html) {
			if (
				(isAuto &&
					// In case of an empty comment input, we in fact make this request for the sake of parsing
					// the summary if there is a need. Alternatively, the user could click the "Preview"
					// button.
					!commentInputValue.trim() &&
					!this.headlineInput?.getValue().trim()) ||
				this.deleteCheckbox?.isSelected()
			) {
				this.$previewArea.empty()
			} else {
				this.updatePreview(html)
			}

			// Workaround to omit the signature when templates containing a signature, like
			// https://en.wikipedia.org/wiki/Template:Requested_move, are substituted.
			if (this.omitSignatureCheckbox && !this.omitSignatureCheckboxAltered) {
				const substAliasesString = ['subst:'].concat(cd.config.substAliases).join('|')
				if (new RegExp(`{{ *(${substAliasesString})`, 'i').test(commentInputValue)) {
					const signatureText = this.$previewArea.find('.cd-commentForm-signature').text()
					const previewText = this.$previewArea.text()
					if (
						signatureText &&
						previewText.indexOf(signatureText) !== previewText.lastIndexOf(signatureText)
					) {
						this.omitSignatureCheckbox.setSelected(true)
					}
				} else {
					this.omitSignatureCheckbox.setSelected(false)
				}
			}

			this.$summaryPreview.empty()
			if (parsedSummary) {
				this.$summaryPreview.append(
					document.createTextNode(cd.sParse('cf-summary-preview')),
					document.createTextNode(cd.mws('colon-separator')),
					$('<span>').addClass('comment').html(parsedSummary),
				)
			}
		}

		if (cd.settings.get('autopreview') && this.previewButton.$element.is(':visible')) {
			this.previewButton.toggle(false)
			this.viewChangesButton.toggle(true)
		}

		operation.close()

		if (!isAuto) {
			this.$previewArea.cdScrollIntoView('bottom')
			this.commentInput.focus()
		}
	}

	/**
	 * View changes in the page code after submitting the form.
	 */
	async viewChanges() {
		if (this.isBeingSubmitted()) return

		const operation = this.operations.add('viewChanges')

		const { contextCode } = (await this.buildSource('viewChanges', operation)) || {}
		if (contextCode === undefined) return

		mw.loader.load('mediawiki.diff.styles')

		let response
		try {
			const options = /** @type {import('types-mediawiki/api_params').ApiComparePagesParams} */ ({
				'action': 'compare',
				'totitle': this.targetPage.name,
				'toslots': 'main',
				'totext-main': contextCode,
				'topst': true,
				'prop': 'diff',
				...cd.g.apiErrorFormatHtml,
			})

			if (this.sectionSubmitted || this.newSectionApi || !this.targetPage.revisionId) {
				options.fromslots = 'main'
				options['fromtext-main'] = this.isSectionSubmitted() ? this.targetSection.presumedCode : ''
			} else {
				options.fromrev = this.targetPage.revisionId
			}

			response = /** @type {import('./utils-api').APIResponseCompare} */ (
				await cd
					.getApi()
					.post(/** @type {import('types-mediawiki/api_params').UnknownApiParams} */ (options), {
						// Beneficial when sending long unicode texts, which is what we do here.
						contentType: 'multipart/form-data',
					})
					.catch(handleApiReject)
			)
		} catch (error) {
			this.handleError({
				error,
				message: error instanceof CdError ? cd.sParse('cf-error-viewchanges') : undefined,
				operation,
			})

			return
		}

		if (operation.maybeClose()) return

		const html = response.compare.body
		if (html) {
			this.$previewArea
				.html(wrapDiffBody(html))
				.prepend(
					$('<div>')
						.addClass('cd-commentForm-previewArea-label')
						.text(cd.s('cf-block-viewchanges')),
				)
				.cdAddCloseButton()
		} else {
			this.$previewArea.empty()
			this.showMessage(cd.sParse('cf-notice-nochanges'))
		}

		if (cd.settings.get('autopreview')) {
			this.viewChangesButton.toggle(false)
			this.previewButton.toggle(true)
		}

		operation.close()

		this.$previewArea.cdScrollIntoView('bottom')
		this.commentInput.focus()
	}

	/**
	 * Remove references to the form and reload the page.
	 *
	 * @param {import('./BootProcess').PassedData} [bootData] Data to pass to the boot process.
	 * @param {import('./CommentFormOperation').default} [operation] Submit operation.
	 */
	async reloadPage(bootData, operation) {
		this.unregister()

		if (!cd.page.exists()) {
			const url = new URL(location.href)
			url.searchParams.delete('cdaddtopic')
			url.searchParams.delete('section')
			url.searchParams.delete('action')
			if (bootData?.commentIds?.[0]) {
				url.hash = bootData.commentIds[0]
			}
			location.href = url.toString()
			if (location.pathname + location.search === url.pathname + url.search) {
				location.reload()
			}

			return
		}

		try {
			await controller.rebootPage(bootData)
		} catch (error) {
			this.handleError({
				error,
				message: error instanceof CdError ? cd.sParse('error-reloadpage-saved') : undefined,
				cancel: true,
				operation,
			})

			cd.loader.hideBootingOverlay()

			return
		}
	}

	/**
	 * Check the form content for several conditions before submitting the form. Ask the user to
	 * confirm submitting if one of the conditions is met.
	 *
	 * @param {object} options
	 * @param {boolean} options.doDelete
	 * @returns {boolean}
	 * @private
	 */
	runChecks({ doDelete }) {
		const checks = [
			{
				condition: !doDelete && this.headlineInput?.getValue() === '',
				confirmation: () => {
					const ending =
						this.headlineInputPlaceholder === cd.s('cf-headline-topic') ? 'topic' : 'subsection'

					return confirm(
						cd.s(`cf-confirm-noheadline-${ending}`) + ' ' + cd.s('cf-confirm-noheadline-question'),
					)
				},
			},
			{
				condition:
					!doDelete &&
					!this.commentInput.getValue().trim() &&
					!cd.config.dontConfirmEmptyCommentPages.some((regexp) => cd.page.name.match(regexp)),
				confirmation: () => confirm(cd.s('cf-confirm-empty')),
			},
			{
				condition:
					!doDelete && this.commentInput.getValue().trim().length > cd.config.longCommentThreshold,
				confirmation: () =>
					confirm(cd.s('cf-confirm-long', String(cd.config.longCommentThreshold))),
			},
			{
				condition:
					!doDelete &&
					/^==[^=]/m.test(this.commentInput.getValue()) &&
					!this.isMode('edit') &&
					!this.preloadConfig.commentTemplate,
				confirmation: () => confirm(cd.s('cf-confirm-secondlevelheading')),
			},
			{
				condition: doDelete,
				confirmation: () => confirm(cd.s('cf-confirm-delete')),
			},
		]

		for (const check of checks) {
			if (check.condition && !check.confirmation()) {
				this.commentInput.focus()

				return false
			}
		}

		return true
	}

	/**
	 * Send a post request to edit the page and handle errors.
	 *
	 * @param {string} code Code to save.
	 * @param {import('./CommentFormOperation').default} operation Operation the form is undergoing.
	 * @param {boolean} [suppressTag]
	 * @returns {Promise<string | undefined>}
	 * @private
	 */
	async editPage(code, operation, suppressTag = false) {
		let result
		try {
			const options = /** @type {import('types-mediawiki/api_params').ApiEditPageParams} */ ({
				text: code,
				summary: buildEditSummary({ text: this.summaryInput.getValue() }),
				minor: this.minorCheckbox?.isSelected(),
				watchlist: this.watchCheckbox?.isSelected() ? 'watch' : 'unwatch',
				captchaid: this.captchaInput?.getCaptchaId(),
				captchaword: this.captchaInput?.getCaptchaWord(),
			})
			let sectionOrPage
			if (this.isNewSectionApi()) {
				options.sectiontitle = this.headlineInput.getValue().trim()
				options.section = 'new'
			} else if (this.isSectionSubmitted()) {
				options.section =
					typeof this.targetSection.liveSectionNumber === 'number'
						? String(this.targetSection.liveSectionNumber)
						: undefined
				sectionOrPage = this.targetSection
			} else {
				sectionOrPage = this.targetPage
			}
			options.baserevid = sectionOrPage?.revisionId
			options.starttimestamp = sectionOrPage?.queryTimestamp
			if (suppressTag) {
				options.tags = undefined
			}
			result = await this.targetPage.edit(options)
		} catch (error) {
			delete this.captchaInput

			if (error instanceof CdError) {
				/** @type {'notice' | undefined} */
				let messageType
				const errorCode = error.getCode()
				/** @type {string | undefined} */
				const message = error.getMessage()
				/** @type {JQuery | undefined} */
				let $message
				if (errorCode === 'editconflict') {
					error.setMessage(
						// eslint-disable-next-line @typescript-eslint/restrict-plus-operands
						/** @type {string} */ (message) + ' ' + cd.sParse('cf-notice-editconflict-retrying'),
					)
					messageType = 'notice'
				} else if (errorCode === 'captcha' && 'confirmEdit' in mw.libs) {
					this.captchaInput = new mw.libs.confirmEdit.CaptchaInputWidget(
						/** @type {{ edit: mw.libs.confirmEdit.CaptchaData }} */ (
							error.getApiResponse()
						).edit.captcha,
					)
					this.captchaInput.on('enter', () => {
						this.submit()
					})
					$message = new OO.ui.MessageWidget({
						type: 'notice',
						label: this.captchaInput.$element,
					}).$element
				}

				this.handleError({
					error,
					message: error.getType() === 'network' ? cd.sParse('cf-error-couldntedit') : message,
					$message,
					messageType,
					operation,
				})

				if (errorCode === 'editconflict') {
					this.submit(false)
				}
				if (errorCode === 'tags-apply-blocked') {
					this.submit(false, true)
				}
			} else {
				this.handleError({ error, operation })
			}

			return
		}

		return result
	}

	/**
	 * Subscribe and unsubscribe from topics.
	 *
	 * @param {string} editTimestamp
	 * @param {string|undefined} commentCode
	 * @private
	 */
	updateSubscriptionStatus(editTimestamp, commentCode) {
		if (!this.subscribeCheckbox) return

		if (this.subscribeCheckbox.isSelected()) {
			// Add the created section to the subscription list or change the headline for legacy
			// subscriptions.
			if (
				// FIXME: fix behavior for sections added with no headline (that are, in fact, comments
				// added to the preceding section)
				this.isMode('addSection') ||
				(!this.useTopicSubscription &&
					(this.isMode('addSubsection') || this.isSectionOpeningCommentEdited()))
			) {
				let rawHeadline = this.headlineInput?.getValue().trim()
				if (!rawHeadline && !this.isSectionOpeningCommentEdited()) {
					;[, rawHeadline] = /** @type {string} */ (commentCode).match(/^==(.*?)==[ \t]*$/m) || []
				}
				const headline = rawHeadline && removeWikiMarkup(rawHeadline)

				let subscribeId
				let originalHeadline
				if (this.useTopicSubscription) {
					subscribeId = sectionManager.generateDtSubscriptionId(cd.user.getName(), editTimestamp)
				} else {
					subscribeId = headline
					if (this.isSectionOpeningCommentEdited()) {
						originalHeadline = removeWikiMarkup(this.originalHeadline || '')
					}
				}

				if (subscribeId !== undefined) {
					controller
						.getSubscriptionsInstance()
						.subscribe(subscribeId, headline, true, originalHeadline)
				}
			} else {
				const section = this.targetSection?.getSectionSubscribedTo()
				if (section && !section.subscriptionState) {
					section.ensureSubscribeIdPresent(editTimestamp)
					section.subscribe('silent')
				}
			}
		} else {
			const section = this.targetSection?.getSectionSubscribedTo()
			if (section?.subscriptionState) {
				section.ensureSubscribeIdPresent(editTimestamp)
				section.unsubscribe('silent')
			}
		}
	}

	/**
	 * Generate a comment ID to jump to after the page is reloaded, taking possible collisions into
	 * account.
	 *
	 * @param {string} editTimestamp
	 * @returns {string}
	 * @private
	 */
	generateFutureCommentId(editTimestamp) {
		const date = new Date(editTimestamp)

		// Timestamps on the page (and therefore anchors) have no seconds.
		date.setSeconds(0)

		const commentAboveCommentToBeAddedIndex =
			this.target.getCommentAboveCommentToBeAdded(this)?.index

		return /** @type {string} */ (
			Comment.generateId(
				date,
				cd.user.getName(),
				commentAboveCommentToBeAddedIndex
					? commentManager
							.getAll()
							.slice(0, commentAboveCommentToBeAddedIndex + 1)
							.filter(
								(comment) =>
									comment.author === cd.user && comment.date?.getTime() === date.getTime(),
							)
							.map((comment) => /** @type {string} */ (comment.id))
					: undefined,
			)
		)
	}

	/**
	 * Submit the form.
	 *
	 * @param {boolean} [clearMessages]
	 * @param {boolean} [suppressTag]
	 */
	submit = async (clearMessages = true, suppressTag = false) => {
		const doDelete = Boolean(this.deleteCheckbox?.isSelected())
		if (this.isBeingSubmitted() || this.isContentBeingLoaded() || !this.runChecks({ doDelete })) {
			return
		}

		if (this.commentFormManager.getAll().some((commentForm) => commentForm.isBeingSubmitted())) {
			this.handleError({
				error: new CdError({
					type: 'ui',
					message: cd.sParse('cf-error-othersubmitted'),
				}),
			})

			return
		}

		const operation = this.operations.add('submit', undefined, clearMessages)

		const { contextCode, commentCode } = (await this.buildSource('submit', operation)) || {}
		if (contextCode === undefined) return

		const editTimestamp = await this.editPage(contextCode, operation, suppressTag)

		// The operation is closed inside CommentForm#editPage().
		if (!editTimestamp) return

		// Here we use a trick where we pass, in bootData, the name of the section that was set to be
		// be watched/unwatched using a checkbox in a form just sent. The server doesn't manage to
		// update the value quickly enough, so it returns the old value, but we must display the new
		// one.
		const bootData = /** @type {import('./BootProcess').PassedData} */ ({
			submittedCommentForm: this,
		})

		this.updateSubscriptionStatus(editTimestamp, commentCode)

		if (this.watchCheckbox?.isSelected() && $('#ca-watch').length) {
			$('#ca-watch')
				.attr('id', 'ca-unwatch')
				.find('a')
				.attr('href', cd.page.getUrl({ action: 'unwatch' }))
		}
		if (!this.watchCheckbox?.isSelected() && $('#ca-unwatch').length) {
			$('#ca-unwatch')
				.attr('id', 'ca-watch')
				.find('a')
				.attr('href', cd.page.getUrl({ action: 'watch' }))
		}

		if (!doDelete) {
			// Generate an ID for the comment to jump to.
			bootData.commentIds = [
				this.isMode('edit') ? this.target.id : this.generateFutureCommentId(editTimestamp),
			]
		}

		// When the edit takes place on another page that is transcluded in the current one, we must
		// purge the current page, otherwise we may get an old version without the submitted comment.
		if (this.targetPage !== cd.page) {
			await cd.page.purge()
		}

		this.reloadPage(bootData, operation)
	}

	/**
	 * Ask for a confirmation to close the form if necessary.
	 *
	 * @returns {boolean}
	 */
	confirmClose() {
		return !this.isAltered() || confirm(cd.s('cf-confirm-close'))
	}

	/**
	 * Close the form, asking for confirmation if necessary, and scroll to the target comment if
	 * available.
	 *
	 * @param {boolean} [confirmClose] Whether to confirm form close.
	 */
	cancel(confirmClose = true) {
		// Why check for this.torndown: CodeMirror may emit an event of an Esc button press late
		if (cd.loader.isPageOverlayOn() || this.isBeingSubmitted() || this.torndown) return

		if (confirmClose && !this.confirmClose()) {
			this.commentInput.focus()

			return
		}

		this.teardown()
	}

	/**
	 * Remove the comment form elements and restore the page elements that were hidden. Remove
	 * properties of other objects related to the form. Close all form operations and remove all
	 * references to the form.
	 */
	teardown() {
		if (this.torndown) return

		this.unregister()
		this.operations.closeAll()
		if (this.$element[0].isConnected) {
			this.target.cleanUpCommentFormTraces(this.mode, this)
			this.$element.remove()
		}
		this.emit('teardown')
		this.torndown = true
	}

	/**
	 * Remove all outside references to the form and unload it from the session data thus making it
	 * not appear after a page reload. A form may be unregistered without being torn down (but not
	 * vice versa) - when it is submitted.
	 *
	 * @private
	 */
	unregister() {
		if (!this.registered) return

		CommentForm.forgetOnTarget(this.target, this.mode)

		// Popups can be placed outside the form element, so they need to be torn down whenever the form
		// is unregistered (even if the form itself is not torn down).
		this.teardownInputPopups()

		this.terminateAutocomplete()
		this.codeMirror?.destroy()
		cd.settings.off('set', this.onSettingsUpdate)

		this.registered = false
		this.emit('unregister')
	}

	/**
	 * Detach the comment form from the page when reloading the page and reset some properties.
	 */
	detach() {
		this.$element.detach()
		this.terminateAutocomplete()
		delete this.checkCodeRequest
	}

	/**
	 * Check if the form was altered. This means the values of the text fields (but not the state of
	 * checkboxes) are different from initial.
	 *
	 * @returns {boolean}
	 */
	isAltered() {
		// In case of the comment being edited some properties would be undefined if its code was not
		// located in the source.
		return Boolean(
			(this.originalComment !== undefined &&
				this.originalComment !== this.commentInput.getValue()) ||
				this.autoSummary !== this.summaryInput.getValue() ||
				(this.headlineInput &&
					this.originalHeadline !== undefined &&
					this.originalHeadline !== this.headlineInput.getValue()),
		)
	}

	/**
	 * Show or hide messages as a result of comparing the text to the data in a reaction object.
	 *
	 * @param {string} text Text to check for reactions to.
	 * @param {import('../config/default').Reaction} reaction Reaction object.
	 * @private
	 */
	reactToText(text, { regexp, checkFunc, message, type, name }) {
		if (regexp.test(text) && (typeof checkFunc !== 'function' || checkFunc(this))) {
			this.showMessage(message, { type, name })
		} else {
			this.hideMessage(name)
		}
	}

	/**
	 * _For internal use._ Update the automatic text for the edit summary.
	 *
	 * @param {boolean} [set] Whether to actually set the input value, or just save the auto
	 *   summary to a property (e.g. to later tell if it was altered).
	 * @param {boolean} [blockAutopreview] Whether to prevent making autopreview request in
	 *   order not to make two identical requests (for example, if the update is initiated by a change
	 *   in the comment – that change would initiate its own request).
	 */
	updateAutoSummary = (set = true, blockAutopreview = false) => {
		if (this.summaryAltered) return

		this.summaryAutopreviewBlocked = blockAutopreview

		let optionalText
		if (this.isMode('reply') || this.isMode('replyInSection')) {
			const commentText = this.commentInput
				.getValue()
				.trim()
				.replace(/\s+/g, ' ')

				// Pipe trick
				.replace(cd.g.pipeTrickRegexp, '$1$2$3')

				// Remove user links to prevent sending a double notification.
				.replace(/\[\[:?(?:([^|[\]<>\n]+)\|)?(.+?)\]\]/g, (s, wikilink, text) =>
					cd.g.userLinkRegexp.test(wikilink) ? text : s,
				)
			if (commentText && commentText.length <= cd.config.commentToSummaryLengthLimit) {
				optionalText = `: ${commentText} (-)`
			}
		} else if (this.isMode('addSubsection') && this.headlineInput) {
			const subsection = removeWikiMarkup(this.headlineInput.getValue())
			if (subsection) {
				optionalText = `: /* ${subsection} */`
			}
		}

		this.autoSummary = buildEditSummary({
			text: this.generateStaticSummaryText(this.targetWithOutdentedReplies),
			section:
				this.headlineInput && !this.isMode('addSubsection')
					? removeWikiMarkup(this.headlineInput.getValue())
					: this.target.getRelevantSection()?.headline,
			optionalText,
			addPostfix: false,
		})
		if (set) {
			this.summaryInput.setValue(this.autoSummary)
		}
	}

	/**
	 * _For internal use._ Generate the _static_ part of the automatic text for the edit summary,
	 * excluding the section headline.
	 *
	 * @param {Comment} [substituteTarget]
	 * @returns {string}
	 * @private
	 */
	generateStaticSummaryText(substituteTarget) {
		// FIXME: distribute this code across the classes of targets? Not sure this belongs here.
		if (this.isMode('reply') || substituteTarget) {
			const target = substituteTarget || /** @type {Comment} */ (this.target)
			if (target.isOpeningSection()) {
				return cd.s('es-reply')
			}

			target.maybeRequestAuthorGender(this.updateAutoSummary)

			return target.isOwn
				? cd.s('es-addition')
				: removeDoubleSpaces(cd.s('es-reply-to', target.author.getName(), target.author))
		} else if (this.isMode('edit')) {
			// The codes for generating "edit" and "delete" descriptions are equivalent, so we provide
			// an umbrella function.
			const editOrDeleteText = (/** @type {'edit'|'delete'} */ action) => {
				let subject
				/** @type {Comment} */
				let realTarget = this.target
				if (this.target.isOwn) {
					const targetParent = this.target.getParent()
					if (targetParent) {
						if (targetParent.level === 0) {
							subject = 'reply'
						} else {
							targetParent.maybeRequestAuthorGender(this.updateAutoSummary)
							subject = targetParent.isOwn ? 'addition' : 'reply-to'
							realTarget = targetParent
						}
					} else if (this.isTargetOpeningSection()) {
						subject = this.targetSection.getParent() ? 'subsection' : 'topic'
					} else {
						subject = 'comment'
					}
				} else if (this.isTargetOpeningSection()) {
					subject = this.targetSection.getParent() ? 'subsection' : 'topic'
				} else {
					this.target.maybeRequestAuthorGender(this.updateAutoSummary)
					subject = 'comment-by'
				}
				const authorName = realTarget.author.getName()

				return removeDoubleSpaces(
					cd.s(
						`es-${action}-${subject}`,
						subject === 'comment-by' && realTarget.author.isRegistered()
							? `[[${realTarget.author.getNamespaceAlias()}:${authorName}|${authorName}]]`
							: authorName,
						realTarget.author,
					),
				)
			}

			return editOrDeleteText(this.deleteCheckbox?.isSelected() ? 'delete' : 'edit')
		} else if (this.isMode('replyInSection')) {
			return cd.s('es-reply')
		} else if (this.isMode('addSection')) {
			return this.preloadConfig.summary || cd.s('es-new-topic')
		}

		// if (this.isMode('addSubsection'))
		return cd.s('es-new-subsection')
	}

	/**
	 * Handle the delete checkbox change, setting form elements as disabled or enabled.
	 *
	 * @param {boolean} selected
	 */
	updateFormOnDeleteCheckboxChange(selected) {
		if (selected) {
			this.initialMinorCheckboxSelected = this.minorCheckbox?.isSelected()
			this.minorCheckbox?.setSelected(false)

			this.commentInput.setDisabled(true)
			this.headlineInput?.setDisabled(true)
			this.minorCheckbox?.setDisabled(true)
			this.omitSignatureCheckbox?.setDisabled(true)

			this.submitButtonLabelStandard = cd.s('cf-delete-button')
			this.submitButtonLabelShort = cd.s('cf-delete-button-short')
			this.submitButton
				.clearFlags()
				.setFlags(['destructive', 'primary'])
				.setLabel(
					this.$element.hasClass('cd-commentForm-short')
						? this.submitButtonLabelStandard
						: this.submitButtonLabelShort,
				)
		} else {
			this.minorCheckbox?.setSelected(/** @type {boolean} */ (this.initialMinorCheckboxSelected))

			this.commentInput.setDisabled(false)
			this.headlineInput?.setDisabled(false)
			this.minorCheckbox?.setDisabled(false)
			this.omitSignatureCheckbox?.setDisabled(false)

			this.submitButtonLabelStandard = cd.s('cf-save')
			this.submitButtonLabelShort = cd.s('cf-save-short')
			this.submitButton
				.clearFlags()
				.setFlags(['progressive', 'primary'])
				.setLabel(
					this.$element.hasClass('cd-commentForm-short')
						? this.submitButtonLabelStandard
						: this.submitButtonLabelShort,
				)
		}
	}

	/**
	 * Insert the contents of `cd.config.mentionCharacter` (usually `@`) into the comment input,
	 * activating the mention autocomplete menu. If user autocomplete is disabled, insert a link with
	 * the user namespace prefix.
	 *
	 * @param {boolean} mentionAddressee Don't show the autocomplete menu, just insert a mention of
	 *   the addressee to the beginning of the comment input.
	 */
	mention(mentionAddressee) {
		const range = this.commentInput.getRange()

		if (mentionAddressee && this.parentComment) {
			const data = MentionsAutocomplete.prototype.getInsertionFromEntry(
				this.parentComment.author.getName(),
			)
			if (/** @type {NonNullable<typeof data.omitContentCheck>} */ (data.omitContentCheck)()) {
				data.content = ''
			}
			const altModifyTyped = /** @type {NonNullable<typeof data.altModify>} */ (data.altModify)
			altModifyTyped()
			const text = data.start + (data.content || '') + (data.end || '')
			this.commentInput
				.selectRange(0)
				.insertContent(text)

				// Restore the selection
				.selectRange(range.from + text.length, range.to + text.length)

			return
		}

		const selection = this.commentInput.getValue().substring(range.from, range.to)
		if (
			selection &&
			// Valid username
			mw.Title.newFromText(selection) &&
			!selection.includes('/') &&
			selection.length <= 85
		) {
			const data = MentionsAutocomplete.prototype.getInsertionFromEntry(selection)
			if (/** @type {NonNullable<typeof data.omitContentCheck>} */ (data.omitContentCheck)()) {
				data.content = ''
			}
			this.commentInput.insertContent(data.start + data.content + data.end)

			return
		}

		let content = ''
		if (cd.settings.get('autocompleteTypes').includes('mentions')) {
			content = cd.config.mentionCharacter
		} else {
			// TODO
		}

		this.insertContentAfter(content)
	}

	/**
	 * Quote the selected text.
	 *
	 * @param {boolean} allowEmptySelection Insert markup (with a placeholder text) even if the
	 *   selection is empty.
	 * @param {Comment} [comment] Quoted comment.
	 * @param {boolean} [mentionSource] Whether to mention the source of the quote (author, timestamp,
	 *   link), if available. This makes sense when quoting a comment other than the one you reply to.
	 */
	async quote(allowEmptySelection, comment, mentionSource) {
		let selection
		if (isInputFocused()) {
			const activeElement = /** @type {HTMLElement} */ (document.activeElement)
			if (
				activeElement instanceof HTMLInputElement ||
				activeElement instanceof HTMLTextAreaElement
			) {
				const selectionStart = activeElement.selectionStart
				if (selectionStart !== null) {
					selection = activeElement.value.substring(
						selectionStart,
						/** @type {number} */ (activeElement.selectionEnd),
					)
				}
			} else {
				// `contenteditable` element
				selection = window.getSelection().toString()
			}
		}

		comment?.fixSelection()
		if (!isInputFocused() || selection === undefined) {
			selection = await this.commentInput.getWikitextFromSelection()
		}
		selection = selection.trim()

		// With just "Q" pressed, empty selection doesn't count.
		if (selection || allowEmptySelection) {
			const range = this.commentInput.getRange()
			let rangeStart = Math.min(range.to, range.from)
			let rangeEnd = Math.max(range.to, range.from)

			// Reset the selection if the input is not focused to prevent losing text.
			if (!this.commentInput.isFocused() && rangeStart !== rangeEnd) {
				this.commentInput.selectRange(range.to)
				rangeStart = rangeEnd = range.to
			}

			const [pre, post] =
				typeof cd.config.quoteFormatting === 'function'
					? cd.config.quoteFormatting(
							comment && (mentionSource ?? comment !== this.parentComment)
								? {
										mentionSource: true,
										author: comment.author.getName(),
										timestamp: comment.timestamp,
										dtId: comment.dtId,
									}
								: {
										mentionSource: Boolean(
											selection.match(new RegExp(`<${cd.g.pniePattern}\\b|(^|\n)[:*#;]`, 'i')),
										),
									},
						)
					: cd.config.quoteFormatting

			if (pre.includes('{{')) {
				selection = escapePipesOutsideLinks(selection)
			}

			this.encapsulateSelection({
				pre,
				peri: cd.s('cf-quote-placeholder'),
				post,
				selection,
				ownline: true,
			})
		}
	}

	/**
	 * Insert markup for a comment or section link.
	 */
	insertCommentLink() {
		const range = this.commentInput.getRange()
		const selection = this.commentInput.getValue().substring(range.from, range.to)
		if (selection && (commentManager.getByAnyId(selection) || isExistentAnchor(selection, true))) {
			// Valid ID

			this.commentInput.insertContent(`[[#${selection}]]`)

			return
		}

		this.insertContentAfter('[[#')
	}

	/**
	 * Insert some content after the caret, making sure it's separated with a space and the selected
	 * text is not removed.
	 *
	 * @param {string} content
	 * @private
	 */
	insertContentAfter(content) {
		const range = this.commentInput.getRange()
		const rangeEnd = Math.max(range.to, range.from)

		// Prevent removal of text
		if (range.from !== range.to) {
			this.commentInput.selectRange(rangeEnd)
		}

		// Insert a space if the preceding text doesn't end with one
		if (rangeEnd && !/\s/.test(this.commentInput.getValue().slice(rangeEnd - 1, rangeEnd))) {
			this.commentInput.insertContent(' ')
		}

		this.encapsulateSelection({ pre: content })
	}

	/**
	 * Wrap the selected text in the comment input with other text, optionally falling back to the
	 * provided value if no text is selected.
	 *
	 * @param {object} options
	 * @param {string} [options.pre] Text to insert before the caret/selection.
	 * @param {string} [options.peri] Fallback value used instead of a selection and selected
	 *   afterwards.
	 * @param {string} [options.post] Text to insert after the caret/selection.
	 * @param {boolean} [options.replace] If there is a selection, replace it with `pre`,
	 *   `peri`, `post` instead of leaving it alone.
	 * @param {string} [options.selection] Selected text. Use if the selection is outside of the
	 *   input.
	 * @param {boolean} [options.ownline] Put the inserted text on a line of its own.
	 */
	encapsulateSelection({
		pre = '',
		peri = '',
		post = '',
		selection,
		replace = false,
		ownline = false,
	}) {
		const range = this.commentInput.getRange()
		const selectionStartIndex = Math.min(range.from, range.to)
		// eslint-disable-next-line no-one-time-vars/no-one-time-vars
		const selectionEndIndex = Math.max(range.from, range.to)
		const value = this.commentInput.getValue()
		const leadingNewline =
			ownline && !/(^|\n)$/.test(value.slice(0, selectionStartIndex)) && !peri.startsWith('\n')
				? '\n'
				: ''
		// eslint-disable-next-line no-one-time-vars/no-one-time-vars
		const trailingNewline =
			ownline && !value.slice(selectionEndIndex).startsWith('\n') && !post.endsWith('\n')
				? '\n'
				: ''
		let periStartIndex
		if (!selection && !replace) {
			periStartIndex = selectionStartIndex + leadingNewline.length + pre.length
			selection = value.substring(range.from, range.to)
		} else {
			selection ??= ''
		}

		// Wrap the text, moving the leading and trailing spaces to the sides of the resulting text.
		const [leadingSpace] = /** @type {RegExpMatchArray} */ (selection.match(/^ */))
		const [trailingSpace] = /** @type {RegExpMatchArray} */ (selection.match(/ *$/))
		const middleText = selection || peri

		this.commentInput.insertContent(
			leadingNewline +
				leadingSpace +
				pre +
				middleText.slice(leadingSpace.length, middleText.length - trailingSpace.length) +
				post +
				trailingSpace +
				trailingNewline,
		)
		if (periStartIndex !== undefined) {
			this.commentInput.selectRange(periStartIndex, periStartIndex + peri.length)
		}
	}

	/**
	 * Get the form mode.
	 *
	 * @returns {Mode}
	 */
	getMode() {
		return this.mode
	}

	/**
	 * Get the configuration to preload data into the form.
	 *
	 * @returns {PreloadConfig}
	 */
	getPreloadConfig() {
		return this.preloadConfig
	}

	/**
	 * Get whether the form will add a topic on top.
	 *
	 * @returns {boolean|undefined}
	 */
	isNewTopicOnTop() {
		return this.newTopicOnTop
	}

	/**
	 * Get the headline at the time of the form creation.
	 *
	 * @returns {string | undefined}
	 */
	getOriginalHeadline() {
		return this.originalHeadline
	}

	/**
	 * Get the comment text at the time of the form creation.
	 *
	 * @returns {string | undefined}
	 */
	getOriginalComment() {
		return this.originalComment
	}

	/**
	 * Check whether the summary was altered by the user.
	 *
	 * @returns {boolean}
	 */
	isSummaryAltered() {
		return this.summaryAltered
	}

	/**
	 * Check whether the omit signature checkbox was altered by the user.
	 *
	 * @returns {boolean}
	 */
	isOmitSignatureCheckboxAltered() {
		return this.omitSignatureCheckboxAltered
	}

	/**
	 * Get the date when the form was focused last time.
	 *
	 * @returns {Date|undefined}
	 */
	getLastFocused() {
		return this.lastFocused
	}

	/**
	 * Get the {@link CommentForm#target target} object of the form.
	 *
	 * @returns {TypedTarget<Mode>}
	 */
	getTarget() {
		return this.target
	}

	/**
	 * Check whether the form's {@link CommentForm#target target} is a comment.
	 *
	 * @returns {this is CommentForm<'reply' | 'edit'>}
	 */
	isCommentTarget() {
		return ['reply', 'edit'].includes(this.mode)
	}

	/**
	 * Check whether the form's {@link CommentForm#target target} is a section.
	 *
	 * @returns {this is CommentForm<'replyInSection' | 'addSubsection'>}
	 */
	isSectionTarget() {
		return ['replyInSection', 'addSubsection'].includes(this.mode)
	}

	/**
	 * Check whether the form's {@link CommentForm#target target} is a page.
	 *
	 * @returns {this is CommentForm<'addSection'>}
	 */
	isPageTarget() {
		return ['addSection'].includes(this.mode)
	}

	/**
	 * Get the target comment if it has outdented replies and the reply is therefore to the section.
	 *
	 * @returns {Comment | undefined}
	 */
	getTargetWithOutdentedReplies() {
		return this.targetWithOutdentedReplies
	}

	/**
	 * Get the {@link CommentForm#parentComment parent comment} object of the form. This is the
	 * comment the user replies to, if any. If the user replies to a section, this is the comment
	 * opening the section.
	 *
	 * @returns {Comment | undefined}
	 */
	getParentComment() {
		return this.parentComment
	}

	/**
	 * Set whether a new section will be added on submit using a dedicated API request.
	 *
	 * @param {boolean} value
	 */
	setNewSectionApi(value) {
		this.newSectionApi = value
	}

	/**
	 * Check whether a new section will be added on submit using a dedicated API request.
	 *
	 * @returns {this is { headlineInput: import('./TextInputWidget').default }}
	 */
	isNewSectionApi() {
		return Boolean(this.newSectionApi)
	}

	/**
	 * Set whether the section code will be sent on submit, not the whole page code.
	 *
	 * @param {boolean} value
	 */
	setSectionSubmitted(value) {
		this.sectionSubmitted = value
	}

	/**
	 * Check whether the section code will be sent on submit, not the whole page code.
	 *
	 * @returns {this is { sectionSubmitted: true; targetSection: import('./Section').default }}
	 */
	isSectionSubmitted() {
		return Boolean(this.sectionSubmitted)
	}

	/**
	 * Get the name of the tag of the list that this form is an item of.
	 *
	 * @returns {ListType | undefined}
	 */
	getContainerListType() {
		return this.containerListType
	}

	/**
	 * Restore the form from data.
	 *
	 * @returns {RescueData|undefined}
	 */
	restore() {
		const newSelf = this.target.findNewSelf()
		if (newSelf?.isActionable) {
			try {
				const addingMethod = /** @type {CommentFormAddingMethod} */ (
					newSelf[/** @type {keyof typeof newSelf} */ (newSelf.getCommentFormMethodName(this.mode))]
				).bind(newSelf)
				addingMethod(undefined, this)
			} catch (error) {
				cd.debug.logWarn(error)

				return this.rescue()
			}
		} else {
			return this.rescue()
		}
	}

	/**
	 * @typedef {object} RescueData
	 * @property {string} [headline]
	 * @property {string} comment
	 * @property {string} summary
	 */

	/**
	 * Return the key contents of the form, to be printed to the user in a popup so that they may have
	 * a chance to copy it and not lose.
	 *
	 * @returns {RescueData}
	 */
	rescue() {
		this.teardown()

		return {
			headline: this.headlineInput?.getValue(),
			comment: this.commentInput.getValue(),
			summary: this.summaryInput.getValue(),
		}
	}

	/**
	 * Scroll to the comment form and focus the comment input.
	 * {@link Comment#expandAllThreadsDownTo Expand all threads} that this form is inside.
	 */
	goTo() {
		this.target.getCommentFormTargetComment()?.expandAllThreadsDownTo()
		this.$element.cdScrollIntoView('center')
		this.commentInput.focus()
	}

	/**
	 * Show an onboarding popup that informs the user they can open multiple comment forms at once.
	 *
	 * @private
	 */
	onboardOntoMultipleForms() {
		if (
			cd.settings.get('manyForms-onboarded') ||
			!cd.user.isRegistered() ||
			// This form will be the second
			this.commentFormManager.getCount() !== 1 ||
			// Left column hidden in Timeless
			(cd.g.skin === 'timeless' && window.innerWidth < 1100) ||
			(cd.g.skin === 'vector-2022' && window.innerWidth < 1000)
		) {
			return
		}

		const button = new OO.ui.ButtonWidget({
			label: cd.s('educationpopup-dismiss'),
			flags: ['progressive', 'primary'],
		})
		button.on('click', () => {
			const manyFormsPopupTyped = /** @type {OO.ui.PopupWidget} */ (this.manyFormsPopup)
			manyFormsPopupTyped.toggle(false)
		})
		this.manyFormsPopup = new OO.ui.PopupWidget({
			icon: 'lightbulb',
			label: cd.s('popup-manyForms-title'),
			$content: mergeJquery(
				$('<p>').text(cd.s('popup-manyForms-text')),
				$('<p>').append(button.$element),
			),
			head: true,
			$floatableContainer: this.commentInput.$element,

			// Not $root - add section form is outside it. Not $content either - it's the same as $root on
			// 404 pages.
			$container: controller.$root.parent(),

			position: $('#vector-main-menu-pinned-container, #vector-toc-pinned-container').is(':visible')
				? 'before'
				: 'below',
			padded: true,
			classes: ['cd-popup-onboarding'],
		})
		$(document.body).append(this.manyFormsPopup.$element)
		this.manyFormsPopup.toggle(true)
		this.manyFormsPopup.on('closing', () => {
			cd.settings.saveSettingOnTheFly('manyForms-onboarded', true)
		})
	}

	/**
	 * Show an onboarding popup that informs the user they can upload images.
	 *
	 * @private
	 */
	onboardOntoUpload() {
		if (
			!this.uploadToCommons ||
			cd.settings.get('upload-onboarded') ||
			!cd.user.isRegistered() ||
			// Left column hidden in Timeless
			(cd.g.skin === 'timeless' && window.innerWidth < 1100) ||
			(cd.g.skin === 'vector-2022' && window.innerWidth < 1000)
		) {
			return
		}

		const button = new OO.ui.ButtonWidget({
			label: cd.s('educationpopup-dismiss'),
			flags: ['progressive', 'primary'],
		})
		button.on('click', () => {
			const uploadPopupTyped = /** @type {OO.ui.PopupWidget} */ (this.uploadPopup)
			uploadPopupTyped.toggle(false)
		})
		this.uploadPopup = new OO.ui.PopupWidget({
			icon: 'lightbulb',
			label: cd.s('popup-upload-title'),
			$content: mergeJquery(
				$('<p>').text(cd.s('popup-upload-text')),
				$('<p>').append(button.$element),
			),
			head: true,
			$floatableContainer: this.commentInput.$element,

			// Not $root - add section form is outside it. Not $content either - it's the same as $root on
			// 404 pages.
			$container: controller.$root.parent(),

			position: $('#vector-main-menu-pinned-container, #vector-toc-pinned-container').is(':visible')
				? 'before'
				: 'below',
			padded: true,
			classes: ['cd-popup-onboarding'],
		})
		$(document.body).append(this.uploadPopup.$element)
		this.uploadPopup.toggle(true)
		this.uploadPopup.on('closing', () => {
			cd.settings.saveSettingOnTheFly('upload-onboarded', true)
		})
	}

	/**
	 * Get the outermost element of the form (`$element` or its outer wrapper if present).
	 *
	 * @returns {HTMLElement}
	 */
	getOutermostElement() {
		const el = this.$element[0]

		return el.parentElement?.classList.contains('cd-commentForm-outerWrapper')
			? /** @type {HTMLElement} */ (el.parentNode)
			: el
	}

	/**
	 * Highlight or unhighlight the quote button.
	 *
	 * @param {boolean} highlight
	 */
	highlightQuoteButton(highlight) {
		if (!this.toolbarLoaded) return

		this.$element
			.find('.tool[rel="quote"]')
			.closest('.cd-tool-button-wrapper')
			.toggleClass('cd-highlight', highlight)
	}

	/**
	 * Check if the form is in the specified mode. (Used for type guards.)
	 *
	 * @template {CommentFormMode} M
	 * @param {M} mode
	 * @returns {this is CommentForm<M>}
	 */
	isMode(mode) {
		return this.mode === /** @type {CommentFormMode} */ (mode)
	}

	/**
	 * Check whether the target is a comment opening a section and it is is edited.
	 *
	 * @returns {this is CommentForm<'edit'>}
	 */
	isSectionOpeningCommentEdited() {
		return this.isMode('edit') && this.isTargetOpeningSection()
	}

	/**
	 * Get the data from the form to save it in the storage.
	 *
	 * @returns {CommentFormData}
	 */
	getData() {
		return {
			mode: this.getMode(),
			targetData: this.getTarget().getIdentifyingData(),
			targetWithOutdentedRepliesData: this.getTargetWithOutdentedReplies()?.getIdentifyingData(),
			preloadConfig: this.getPreloadConfig(),
			newTopicOnTop: this.isNewTopicOnTop(),
			headline: this.headlineInput?.getValue(),
			comment: this.commentInput.getValue(),
			summary: this.summaryInput.getValue(),
			minor: this.minorCheckbox?.isSelected(),
			watch: this.watchCheckbox?.isSelected(),
			subscribe: this.subscribeCheckbox?.isSelected(),
			omitSignature: this.omitSignatureCheckbox?.isSelected(),
			delete: this.deleteCheckbox?.isSelected(),
			originalHeadline: this.getOriginalHeadline(),
			originalComment: this.getOriginalComment(),
			summaryAltered: this.isSummaryAltered(),
			omitSignatureCheckboxAltered: this.isOmitSignatureCheckboxAltered(),
			lastFocused: this.getLastFocused(),
		}
	}

	/**
	 * Check whether the target is a comment opening a section.
	 *
	 * @returns {this is { targetSection: import('./Section').default }}
	 * @private
	 */
	isTargetOpeningSection() {
		return this.isCommentTarget() && this.target.isOpeningSection()
	}

	/**
	 * Set whether CodeMirror is active. Update the autocomplete preference along the way.
	 *
	 * @param {boolean} active
	 */
	setCodeMirrorActive(active) {
		if (Boolean(this.commentInput.codeMirror) === active) return

		this.removeEventListenersFromCommentInput()
		// Autocomplete is initialized indirectly by the settings' `set` event. Perhaps we should
		// initialize it directly here as well?
		this.commentInput.setCodeMirror(active ? this.codeMirror : undefined)
		this.addEventListenersToCommentInput()
	}

	static counter = 0

	static allowedFileTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/svg+xml']

	/**
	 * @type {{
	 *   [key: string]: {
	 *     pre: string;
	 *     peri: string;
	 *     post: string;
	 *   };
	 * }}
	 * @private
	 */
	static encapsulateOptions

	/**
	 * Initialize the class.
	 */
	static init() {
		this.encapsulateOptions = {
			code: {
				pre: '<code><nowiki>',
				peri: cd.s('cf-code-placeholder'),
				post: '</'.concat('nowiki></code>'),
			},
			underline: {
				pre: '<u>',
				peri: cd.s('cf-underline-placeholder'),
				post: '</u>',
			},
			strikethrough: {
				pre: '<s>',
				peri: cd.s('cf-strikethrough-placeholder'),
				post: '</s>',
			},
		}
	}

	/**
	 * Extract IDs from comment links in the code.
	 *
	 * @param {string} code
	 * @returns {string[]}
	 * @private
	 */
	static extractCommentIds(code) {
		// Russian Wikipedia's Wikificator may mangle these links, replacing `_` with ` `, so we search
		// for both characters.
		// eslint-disable-next-line no-one-time-vars/no-one-time-vars
		const idRegexp = /\[\[#(\d{12}[_ ][^|\]]+)/g

		const ids = []
		let match
		while ((match = idRegexp.exec(code))) {
			ids.push(match[1])
		}

		return ids
	}

	/**
	 * Get the default preload configuration for the `addSection` mode.
	 *
	 * @returns {object}
	 */
	static getDefaultPreloadConfig() {
		return {
			editIntro: undefined,
			commentTemplate: undefined,
			headline: undefined,
			params: [],
			summary: undefined,
			noHeadline: false,
			omitSignature: false,
		}
	}

	/**
	 * Get the name of the target's property that can contain a comment form with the specified mode.
	 *
	 * @template {CommentFormTarget} T
	 * @param {T} target
	 * @param {CommentFormMode} mode
	 * @returns {keyof T}
	 */
	static getPropertyNameOnTarget(target, mode) {
		return /** @type {keyof T} */ (target.getCommentFormMethodName(mode) + 'Form')
	}

	/**
	 * Remove references to a comment form on its target object (after it was unregistered).
	 *
	 * @param {CommentFormTarget} target
	 * @param {CommentFormMode} mode
	 */
	static forgetOnTarget(target, mode) {
		delete target[/** @type {keyof typeof target} */ (this.getPropertyNameOnTarget(target, mode))]
	}
}

export default CommentForm
