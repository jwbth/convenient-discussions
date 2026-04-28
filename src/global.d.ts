/// <reference types="types-mediawiki" />

import type { ViewUpdate } from '@codemirror/view'
import type { ApiResponse } from 'types-mediawiki/mw/Api'

import type CheckboxInputWidget from './CheckboxInputWidget'
import type Comment from './Comment'
import type CommentForm from './CommentForm'
import type { CommentFormMode } from './CommentForm'
import type CommentSource from './CommentSource'
import type Section from './Section'
import type SectionSource from './SectionSource'
import type TextInputWidget from './TextInputWidget'
import type addCommentLinks from './addCommentLinks'
import type { app } from './app'
import type jqueryExtensions from './jqueryExtensions'
import type { ConvenientDiscussions } from './loader/cd'

declare global {
	const IS_STAGING: boolean
	const IS_DEV: boolean
	const IS_SINGLE: boolean
	const SINGLE_CONFIG_FILE_NAME: string | undefined
	const SINGLE_LANG_CODE: string | undefined
	const CACHE_BUSTER: string
	const moment: (...args: any) => any

	var convenientDiscussionsMain: {
		app: typeof app
		addCommentLinks: typeof addCommentLinks
	}

	type Direction = 'ltr' | 'rtl'
	type ListType = 'dl' | 'ul' | 'ol'

	// Helper type to check if a string is present in the array
	type HasProperty<T extends readonly string[], K extends string> = K extends T[number]
		? true
		: false

	type ApiAnyResponse = ApiResponse | ApiRejectResponse

	/** See {@link https://github.com/microsoft/TypeScript/blob/837e3a1df996b505e1d376fa46166740b7ed5450/src/lib/es2015.promise.d.ts#L13} */
	type PromiseExecutor<T> = (
		resolve: (value: T | PromiseLike<T>) => void,
		reject: (reason?: any) => void,
	) => void
	type AsyncPromiseExecutor<T> = (
		resolve: (value: T | PromiseLike<T>) => void,
		reject: (reason?: any) => void,
	) => Promise<void>

	/**
	 * Picks only keys from T whose value is V.
	 */
	type OnlyKeysWithValue<T, V extends string> = {
		[K in keyof T]: T[K] extends V ? K : never
	}[keyof T]

	interface ApiResponseQueryPage {
		title: string
		pageid: number | undefined
		known?: boolean
		missing?: boolean
		invalid?: boolean
		thumbnail?: {
			source: string
			width: number
			height: number
		}
		pageprops?: {
			disambiguation?: ''
		}
		description?: string
		ns: number
		normalizedTitle?: string
		index?: number
		contentmodel: string
		redirects?: { title: string }[]
		revisions?: Revision[]
	}

	interface BaseRevision {
		revid: number
		parentid: number
		slots?: {
			main: {
				contentmodel: string
				contentformat: string
				content: string
				nosuchsection: boolean
			}
		}
		comment: string
		minor: boolean
		timestamp: string
		user: string
	}

	export interface APIResponseTemplateData {
		pages: TemplateDataPages
	}

	export type TemplateDataPages = Record<string, TemplateData>

	interface TemplateData {
		title: string
		ns: number
		description?: StringsByKey
		params?: Record<string, TemplateDataParam>
		format?: string
		paramOrder?: string[]
		sets?: AnyByKey[]
		maps?: AnyByKey[]
	}

	interface TemplateDataParam {
		description: StringsByKey | null
		type: string
		label: StringsByKey | null
		required: boolean
		suggested: boolean
		deprecated: boolean
		aliases: any[]
		autovalue: null | string
		default: null
		suggestedvalues: string[]
		example: StringsByKey | null
	}

	// Generic Revision type that conditionally includes properties
	type Revision<T extends readonly string[] = ['ids', 'timestamp', 'flags', 'comment', 'user']> =
		Expand<BaseRevision & RevisionConditionalProperties<T>>

	// Conditional type that adds properties based on the presence of strings in the array
	type RevisionConditionalProperties<T extends readonly string[]> = (HasProperty<
		T,
		'ids'
	> extends true
		? { ids: string }
		: {}) &
		(HasProperty<T, 'timestamp'> extends true ? { timestamp: string } : {}) &
		(HasProperty<T, 'flags'> extends true ? { minor: boolean } : {}) &
		(HasProperty<T, 'comment'> extends true ? { comment: string } : {}) &
		(HasProperty<T, 'user'> extends true ? { user: string } : {}) &
		(HasProperty<T, 'parsedcomment'> extends true ? { parsedcomment: string } : {})

	interface FromTo {
		from: string
		to: string
		tofragment?: string
		index: number
	}

	interface ApiResponseQueryBase {
		query?: {
			redirects?: FromTo[]
			normalized?: FromTo[]
		}
		curtimestamp?: string
		batchcomplete?: boolean
		continue?: object
	}

	interface ApiResponseQueryContentPages {
		query?: {
			pages?: ApiResponseQueryPage[]
		}
	}

	type ApiResponseQuery<T extends object> = ApiResponseQueryBase & T

	interface ApiResponseQueryContentGlobalUserInfo {
		query?: {
			globaluserinfo: {
				home: string
				id: number
				registration: string
				name: string
			}
		}
	}

	interface ApiResponseQueryContentAllUsers {
		query?: {
			allusers: {
				userid: number
				name: string
			}[]
		}
	}

	type ControlType =
		| 'button'
		| 'checkbox'
		| 'copyText'
		| 'multicheckbox'
		| 'multilineText'
		| 'multitag'
		| 'number'
		| 'radio'
		| 'text'
		| 'title'

	interface ControlTypeToControl {
		button: ButtonControl
		checkbox: CheckboxControl
		copyText: CopyTextControl
		multicheckbox: MulticheckboxControl
		multilineText: MultilineTextInputControl
		multitag: MultitagControl
		number: NumberControl
		radio: RadioControl
		title: TitleControl
		text: TextControl
	}

	type ControlTypesByName<T> = Expand<{
		-readonly [K in keyof T]: T[K] extends undefined
			? undefined
			: T[K] extends ControlType
				? ControlTypeToControl[T[K]]
				: T[K] extends ControlType | undefined
					? ControlTypeToControl[Exclude<T[K], undefined>] | undefined
					: never
	}>

	interface GenericControl<T extends ControlType> {
		type: T
		field: OO.ui.FieldLayout<ControlTypeToWidget[T]>
		input: ControlTypeToWidget[T]
	}

	type ButtonControl = GenericControl<'button'>

	type CheckboxControl = GenericControl<'checkbox'>

	type CopyTextControl = Omit<GenericControl<'copyText'>, 'field'> & {
		field: OO.ui.CopyTextLayout | OO.ui.ActionFieldLayout
	}

	type MulticheckboxControl = GenericControl<'multicheckbox'>

	type MultilineTextInputControl = GenericControl<'multilineText'>

	type MultitagControl = GenericControl<'multitag'> & {
		uiToData?: (value: string[]) => (string | [string, string])[]
	}

	type NumberControl = GenericControl<'number'>

	type RadioControl = GenericControl<'radio'>

	type TitleControl = GenericControl<'title'>

	type TextControl = GenericControl<'text'>

	interface ControlTypeToWidget {
		radio: OO.ui.RadioSelectWidget
		text: TextInputWidget
		multilineText: OO.ui.MultilineTextInputWidget
		number: OO.ui.TextInputWidget
		checkbox: CheckboxInputWidget
		multitag: OO.ui.TagMultiselectWidget
		multicheckbox: OO.ui.CheckboxMultiselectWidget
		button: OO.ui.ButtonWidget
		copyText: OO.ui.TextInputWidget
		title: mw.widgets.TitleInputWidget
	}

	interface Window {
		convenientDiscussions: ConvenientDiscussions
		cd?: Window['convenientDiscussions']

		// Basically we don't have a situation where getSelection() can return `null`, judging by
		// https://developer.mozilla.org/en-US/docs/Web/API/Window/getSelection.
		getSelection(): Selection

		cdOnlyRunByFooterLink?: boolean
		cdShowLoadingOverlay?: boolean

		// https://en.wikipedia.org/wiki/User:Jack_who_built_the_house/getUrlFromInterwikiLink
		getInterwikiPrefixForHostname:
			| ((targetHostname: string, originHostname?: string) => Promise<string | null>)
			| undefined
		getInterwikiPrefixForHostnameSync:
			| ((targetHostname: string, originHostname?: string) => string | null)
			| undefined
		getUrlFromInterwikiLink:
			| ((interwikiLink: string, originHostname?: string) => Promise<string | null>)
			| undefined

		// w-ru.js
		highlightMessagesAfterLastVisit?: boolean
		highlightMessages?: number
		messagesHighlightColor?: string
		proceedToArchiveRunned?: boolean
		Wikify: ((input: HTMLElement) => void) | undefined
		urlDecoderRun: ((input: HTMLElement) => void) | undefined
	}

	var convenientDiscussions: Window['convenientDiscussions']

	// https://stackoverflow.com/a/71104272
	interface String {
		/**
		 * Gets a substring beginning at the specified location and having the specified length.
		 * (Deprecation removed.)
		 *
		 * @param from The starting position of the desired substring. The index of the first character
		 *   in the string is zero.
		 * @param length The number of characters to include in the returned substring.
		 */
		substr(from: number, length?: number): string
	}

	interface JQuery {
		cdRemoveNonElementNodes: typeof jqueryExtensions.cdRemoveNonElementNodes
		cdScrollTo: typeof jqueryExtensions.cdScrollTo
		cdIsInViewport: typeof jqueryExtensions.cdIsInViewport
		cdScrollIntoView: typeof jqueryExtensions.cdScrollIntoView
		cdGetText: typeof jqueryExtensions.cdGetText
		cdAddCloseButton: typeof jqueryExtensions.cdAddCloseButton
		cdRemoveCloseButton: typeof jqueryExtensions.cdRemoveCloseButton

		wikiEditor(
			funcName:
				| 'addModule'
				| 'addToToolbar'
				| 'removeFromToolbar'
				| 'addDialog'
				| 'openDialog'
				| 'closeDialog',
			data: any,
		): this
	}

	interface Element {
		cdStyle?: CSSStyleDeclaration
		cdIsTopLayersContainer?: boolean
		cdCachedLayersContainerOffset?: {
			top: number
			left: number
		}
		cdCouldHaveBeenDisplaced?: boolean
		cdMargin?: {
			top: number
			bottom: number
			left: number
			right: number
		}
		cdInput?: TextInputWidget
		cdCodeMirrorUpdate?: ViewUpdate
	}

	namespace mw {
		const thanks: {
			thanked: number[]
		}

		namespace libs {
			namespace confirmEdit {
				type CaptchaData = any

				class CaptchaInputWidget extends OO.ui.TextInputWidget {
					new(captchaData?: CaptchaData, config?: TextInputWidget.ConfigOptions)
					getCaptchaId(): string
					getCaptchaWord(): string
				}
			}
		}

		namespace widgets {
			function visibleCodePointLimit(
				textInputWidget: OO.ui.TextInputWidget,
				limit?: number,
				filterFunction?: (...args: any) => any,
			): void
		}
	}

	namespace OO.ui {
		namespace mixin {
			namespace PendingElement {
				interface Props {
					pending: number
				}
			}
		}

		namespace Window {
			interface Props {
				$body: JQuery
			}
		}

		namespace Dialog {
			interface Props {
				actions: ActionSet
			}
		}

		namespace ProcessDialog {
			interface Prototype {
				showErrors(errors: OO.ui.Error[] | OO.ui.Error): void
				hideErrors(): void
			}

			interface Props {
				$errors: JQuery
				$errorItems?: JQuery | null
			}
		}

		namespace MessageDialog {
			interface Props {
				text: PanelLayout
				title: OO.ui.LabelWidget
			}
		}

		interface Process {
			next<C = null>(step: Process.StepOverride<C>, context?: C): this
		}

		// Add native Promise since it seems to work and we use it
		namespace Process {
			type StepOverride<C> =
				| number
				| JQuery.Promise<void>
				| Promise<void>
				| ((
						this: C,
				  ) =>
						| boolean
						| number
						| JQuery.Promise<void>
						| Promise<void>
						| Error
						| [Error]
						| undefined)

			/**
			 * @param step Number of milliseconds to wait before proceeding,
			 *   promise that must be resolved before proceeding, or a function to execute.
			 *   See {@link Process.first first} for more information.
			 * @param context Execution context of the function. The context is ignored if the step
			 *   is a number or promise.
			 */
			interface Constructor {
				// eslint-disable-next-line @typescript-eslint/prefer-function-type
				new <C = null>(step?: StepOverride<C>, context?: C): Process
			}
		}

		namespace PageLayout {
			interface Props {
				outlineItem: OutlineOptionWidget | null
			}

			interface Prototype {
				setupOutlineItem(): void
			}
		}

		namespace RadioOptionWidget {
			interface Props {
				radio: OO.ui.RadioInputWidget
			}
		}

		namespace RadioSelectWidget {
			interface Prototype {
				findSelectedItem(): OptionWidget | null
			}
		}
	}

	interface JQueryStatic {
		_data(element: Element, key: string): any
		wikiEditor: any
	}

	/**
	 * Common interface for Comment, Section, and CurrentPage classes.
	 * These classes share methods related to comment form management and navigation.
	 *
	 * This interface represents objects that can be targets of comment forms - places where
	 * users can add or edit comments. The three implementations are:
	 * - Comment: for replying to or editing a specific comment
	 * - Section: for replying in a section or adding subsections
	 * - CurrentPage: for adding new top-level sections to a page
	 */
	interface CommentFormTarget {
		/**
		 * Whether the target is actionable (can be interacted with, replied to, etc.).
		 * False for closed discussions, old revisions, or transcluded content.
		 */
		isActionable(): boolean

		/**
		 * Get the relevant section for this target.
		 * - For Comment: returns the section containing the comment
		 * - For Section: returns itself
		 * - For CurrentPage: returns undefined
		 *
		 * @returns The relevant section, or undefined if not applicable
		 */
		getRelevantSection(): Section | undefined

		/**
		 * Get the relevant comment for this target.
		 * - For Comment: returns itself
		 * - For Section: returns the first comment if it opens the section
		 * - For CurrentPage: returns undefined
		 *
		 * @returns The relevant comment, or undefined if not applicable
		 */
		getRelevantComment(): Comment | undefined

		/**
		 * Add a comment form to the page DOM at the appropriate location for this target.
		 *
		 * @param mode The mode of the comment form (e.g., 'reply', 'edit', 'addSection')
		 * @param commentForm The comment form to add
		 */
		addCommentFormToPage(mode: CommentFormMode, commentForm: CommentForm): void

		/**
		 * Clean up any DOM modifications made when adding a comment form.
		 *
		 * @param mode The mode of the comment form being cleaned up
		 */
		cleanUpCommentFormTraces(mode: CommentFormMode): void

		/**
		 * Get the comment that will appear directly above a new comment being added.
		 * Used for proper indentation and threading.
		 *
		 * @param commentForm The comment form being used to add a comment
		 * @returns The comment above, or undefined if adding at the top
		 */
		getCommentAboveCommentToBeAdded(commentForm: CommentForm): Comment | undefined

		/**
		 * Get the method name to call on the target to add a comment form.
		 * Used to determine which method to invoke (e.g., 'reply', 'edit', 'addSection').
		 *
		 * @param mode The mode of the comment form
		 * @returns The method name to call
		 */
		getCommentFormMethodName(mode: CommentFormMode): string

		/**
		 * Get the placeholder text for the comment form's headline input.
		 *
		 * @param mode The mode of the comment form
		 * @returns The placeholder text
		 */
		getCommentFormHeadlineInputPlaceholder(mode?: CommentFormMode): string

		/**
		 * Get the placeholder text for the comment form's comment input.
		 *
		 * @param mode The mode of the comment form
		 * @param callback Optional callback for dynamic placeholder generation
		 * @returns The placeholder text, or undefined if no placeholder should be shown
		 */
		getCommentFormCommentInputPlaceholder(
			mode?: CommentFormMode,
			callback?: () => void,
		): string | undefined

		/**
		 * Get the comment that is visually the target of the comment form.
		 * Used for scrolling and visual feedback.
		 *
		 * @returns The target comment, or undefined if not applicable
		 */
		getCommentFormTargetComment(): Comment | undefined

		/**
		 * Get data that uniquely identifies this target for restoring comment forms.
		 * Used when saving and restoring draft comment forms.
		 *
		 * @returns Identifying data object, or undefined if not applicable
		 */
		getIdentifyingData(): AnyByKey | undefined
	}

	/**
	 * Common interface for CommentSource, SectionSource, and PageSource classes.
	 * These classes manage the source code (wikitext) for comments, sections, and pages.
	 *
	 * This interface represents objects that handle the wikitext source code and provide
	 * methods to modify it when adding, editing, or deleting content. The three implementations are:
	 * - CommentSource: for managing comment source code and locating comments in wikitext
	 * - SectionSource: for managing section source code and locating sections in wikitext
	 * - PageSource: for managing page source code
	 */
	interface Source {
		/**
		 * Modify the context code (section or page wikitext) in accordance with an action.
		 * This is the core method for transforming wikitext when adding or editing content.
		 *
		 * The method signature varies slightly by implementation:
		 * - CommentSource: supports 'reply' and 'edit' actions, with delete capability
		 * - SectionSource: supports 'replyInSection' and 'addSubsection' actions
		 * - PageSource: supports 'addSection' action (implicit)
		 *
		 * @returns Object containing the modified context code and optionally the comment code
		 */
		modifyContext(options: {
			action?: CommentFormMode
			commentCode?: string
			commentForm?: CommentForm
			doDelete?: boolean
			contextCode?: string
		}): {
			contextCode: string
			commentCode?: string
		}
	}

	/**
	 * Extended interface for source classes that support matching/locating in wikitext.
	 * CommentSource and SectionSource implement this, but PageSource does not.
	 */
	interface MatchableSource extends Source {
		/**
		 * Calculate and return a match score for this source candidate.
		 * Used when locating comments/sections in wikitext to find the best match among candidates.
		 *
		 * The method signature varies by implementation:
		 * - CommentSource: takes comment data, sources array, and signatures array
		 * - SectionSource: takes section index, headline, and headlines array
		 *
		 * @returns Object containing this source and its calculated match score
		 */
		calculateMatchScore(...args: unknown[]): {
			source: CommentSource | SectionSource
			score: number
		}
	}
}

export {}
