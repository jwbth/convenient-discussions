import CommentForm from './CommentForm'
import Page from './Page'
import commentFormManager from './commentFormManager'
import commentManager from './commentManager'
import controller from './controller'
import cd from './loader/cd'
import sectionManager from './sectionManager'
import { areObjectsEqual } from './shared/utils-general'

/**
 * The page the user is visiting. Extends the base {@link Page} class with methods and properties
 * specific to the current page context.
 */
export default class CurrentPage extends Page {
	/**
	 * @type {JQuery | undefined}
	 * @private
	 */
	$archivingInfo

	/**
	 * @type {JQuery | undefined}
	 * @private
	 */
	$addSectionButtonContainer

	/**
	 * @type {CommentForm | undefined}
	 * @private
	 */
	addSectionForm

	/**
	 * Create a CurrentPage instance.
	 *
	 * @param {mw.Title} mwTitle
	 * @param {typeof import('./pageRegistry').default} pageRegistry
	 * @param {string} [genderedName]
	 */
	constructor(mwTitle, pageRegistry, genderedName) {
		super(mwTitle, pageRegistry, genderedName)
		this.isActionable = this.isCommentable()
	}

	/**
	 * Check if the page is an archive page, checking both regex rules from the parent class and page
	 * DOM elements.
	 *
	 * @override
	 * @returns {boolean}
	 */
	isArchive() {
		if (typeof cd.g.isArchive === 'boolean') {
			return cd.g.isArchive
		}

		const archivingInfoElement = this.findArchivingInfoElement()
		if (archivingInfoElement?.length) {
			return Boolean(Number(archivingInfoElement.attr('data-is-archive-page')))
		}

		return super.isArchive()
	}

	/**
	 * Check if this page can have archives. Checks both regex rules from the parent class and page
	 * DOM elements.
	 *
	 * @override
	 * @returns {boolean | undefined}
	 */
	canHaveArchives() {
		const $archivingInfo = this.findArchivingInfoElement()
		if ($archivingInfo?.length) {
			return !$archivingInfo.attr('data-is-archive-page')
		}

		return super.canHaveArchives()
	}

	/**
	 * Get the archive prefix for the page. Checks both regex rules from the parent class and page DOM
	 * elements.
	 *
	 * @override
	 * @param {boolean} [onlyExplicit]
	 * @returns {string | undefined}
	 */
	getArchivePrefix(onlyExplicit = false) {
		const $archivingInfo = this.findArchivingInfoElement()
		if ($archivingInfo?.length) {
			if ($archivingInfo.attr('data-is-archive-page')) {
				return
			}
			const archivePrefix = $archivingInfo.attr('data-archive-prefix')
			if (archivePrefix) {
				return archivePrefix
			}
		}

		return super.getArchivePrefix(onlyExplicit)
	}

	/**
	 * Get the source page for the page (i.e., the page from which archiving is happening). Checks
	 * both regex rules from the parent class and page DOM elements.
	 *
	 * @override
	 * @returns {Page}
	 */
	getArchivedPage() {
		const $archivingInfo = this.findArchivingInfoElement()
		if ($archivingInfo?.length) {
			const sourcePage = $archivingInfo.attr('data-source-page')
			if (sourcePage) {
				const page = this.registry.get(sourcePage)
				if (page) {
					return page
				}
			}
		}

		return super.getArchivedPage()
	}

	/**
	 * Check whether the current page is eligible for submitting comments to.
	 *
	 * @returns {boolean}
	 */
	isCommentable() {
		return cd.loader.isPageOfType('talk') && (this.isActive() || !this.exists())
	}

	/**
	 * Check whether the current page exists (is not 404).
	 *
	 * @returns {boolean}
	 */
	exists() {
		return Boolean(mw.config.get('wgArticleId'))
	}

	/**
	 * Check whether the current page is an active talk page: existing, the current revision, not an
	 * archive page.
	 *
	 * This value is constant in most cases, but there are exceptions:
	 *   1. The user may switch to another revision using
	 *      {@link https://www.mediawiki.org/wiki/Extension:RevisionSlider RevisionSlider}.
	 *   2. On a really rare occasion, an active page may become inactive if it becomes identified as
	 *      an archive page. This was switched off when I wrote this.
	 *
	 * @returns {boolean}
	 */
	isActive() {
		return (
			cd.loader.isPageOfType('talk') &&
			this.exists() &&
			cd.utils.isCurrentRevision() &&
			!this.isArchive()
		)
	}

	/**
	 * Check whether the current page is an archive and the displayed revision the current one.
	 *
	 * @returns {boolean}
	 */
	isCurrentArchive() {
		// TODO: This is unused currently (was used by Section#canBeMoved())
		return cd.utils.isCurrentRevision() && this.isArchive()
	}

	/**
	 * Find an archiving info element on the page.
	 *
	 * @returns {JQuery | undefined}
	 * @private
	 */
	findArchivingInfoElement() {
		// This is not reevaluated after page reloads. Since archive settings we need rarely change, the
		// reevaluation is unlikely to make any difference
		// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
		this.$archivingInfo ??= controller.$root?.find('.cd-archivingInfo')

		return this.$archivingInfo
	}

	/**
	 * _For internal use._ Add an "Add topic" button to the bottom of the page if there is an "Add
	 * topic" tab. (Otherwise, it may be added to a wrong place.)
	 */
	addAddTopicButton() {
		if (
			!$('#ca-addsection').length ||
			// There is a special welcome text in New Topic Tool for 404 pages.
			(cd.g.isDtNewTopicToolEnabled && !this.exists())
		) {
			return
		}

		this.$addSectionButtonContainer = $('<div>')
			.addClass('cd-section-button-container cd-addTopicButton-container')
			.append(
				new OO.ui.ButtonWidget({
					label: cd.s('addtopic'),
					framed: false,
					flags: ['progressive'],
					classes: ['cd-button-ooui', 'cd-section-button'],
				}).on('click', () => {
					this.addSection()
				}).$element,
			)
			// If appending to controller.rootElement, it can land on a wrong place, like on 404 pages
			// with New Topic Tool enabled.
			.insertAfter(controller.$root)
	}

	/**
	 * Add an "Add section" form or not on page load depending on the URL and presence of a
	 * DiscussionTools' "New topic" form.
	 *
	 * @param {import('./CommentForm').CommentFormInitialState} [dtFormData]
	 */
	autoAddSection(dtFormData) {
		const { searchParams } = new URL(location.href)

		// &action=edit&section=new when DT's New Topic Tool is enabled.
		if (
			searchParams.get('section') === 'new' ||
			Number(searchParams.get('cdaddtopic')) ||
			dtFormData
		) {
			this.addSection(dtFormData)
		}
	}

	/**
	 * Create an add section form if not existent.
	 *
	 * @param {import('./CommentForm').CommentFormInitialState} [initialState]
	 * @param {import('./CommentForm').default} [commentForm]
	 * @param {object} [preloadConfig] See
	 *   {@link CommentForm.getDefaultPreloadConfig}.
	 * @param {boolean} [newTopicOnTop]
	 * @returns {import('./CommentForm').default | undefined}
	 */
	addSection(
		initialState,
		commentForm,
		preloadConfig = CommentForm.getDefaultPreloadConfig(),
		newTopicOnTop = false,
	) {
		if (this.addSectionForm) {
			// Sometimes there is more than one "Add section" button on the page, and they lead to opening
			// forms with different content.
			if (!areObjectsEqual(preloadConfig, this.addSectionForm.getPreloadConfig())) {
				mw.notify(cd.s('cf-error-formconflict'), { type: 'error' })

				return
			}

			this.addSectionForm.$element.cdScrollIntoView('center')

			// Headline input may be missing if the `nosummary` preload parameter is truthy.
			;(this.addSectionForm.headlineInput || this.addSectionForm.commentInput).focus()
		} else {
			this.addSectionForm = commentFormManager.setupCommentForm(
				this,
				{
					mode: 'addSection',
					preloadConfig,
					newTopicOnTop,
				},
				initialState,
				commentForm,
			)

			this.$addSectionButtonContainer?.hide()
			if (!this.exists()) {
				cd.loader.$content.children('.noarticletext, .warningbox').hide()
			}
			$('#ca-addsection').addClass('selected')
			$('#ca-view').removeClass('selected')
			this.addSectionForm.on('teardown', () => {
				$('#ca-addsection').removeClass('selected')
				$('#ca-view').addClass('selected')
			})
		}

		return this.addSectionForm
	}

	/**
	 * Clean up traces of a comment form {@link CommentForm#getTarget targeted} at this page.
	 *
	 * @param {import('./CommentForm').CommentFormMode} _mode
	 * @param {import('./CommentForm').default} commentForm
	 */
	addCommentFormToPage(_mode, commentForm) {
		const firstSection = sectionManager.getByIndex(0)
		if (firstSection && commentForm.isNewTopicOnTop()) {
			firstSection.$heading.before(commentForm.$element)
		} else {
			controller.$root.after(commentForm.$element)
		}
	}

	/**
	 * Remove a comment form {@link CommentForm#getTarget targeted} at this page from the page.
	 */
	cleanUpCommentFormTraces() {
		if (!this.exists()) {
			cd.loader.$content
				// In case DT's new topic tool is enabled. This is responsible for correct styles being set.
				.removeClass('ext-discussiontools-init-replylink-open')

				.children('.noarticletext, .warningbox')
				.show()
		}

		this.$addSectionButtonContainer?.show()
	}

	/**
	 * Get the comment that will end up directly above the section the user is adding with a comment
	 * form.
	 *
	 * @override
	 * @param {import('./CommentForm').default} commentForm
	 * @returns {import('./Comment').default | undefined}
	 */
	getCommentAboveCommentToBeAdded(commentForm) {
		return commentForm.isNewTopicOnTop() ? undefined : commentManager.getByIndex(-1)
	}

	/**
	 * Check if the current page is watched by the user.
	 *
	 * @returns {boolean}
	 */
	isWatched() {
		return $('.mw-watchlink a[href*="action=unwatch"]').length > 0
	}

	/**
	 * Update the watch state in the UI (the watch/unwatch link in the page header).
	 *
	 * @param {boolean} watched Whether the page should be marked as watched.
	 */
	setWatchedState(watched) {
		if (watched && $('#ca-watch').length) {
			$('#ca-watch')
				.attr('id', 'ca-unwatch')
				.find('a')
				.attr('href', this.getUrl({ action: 'unwatch' }))
		}
		if (!watched && $('#ca-unwatch').length) {
			$('#ca-unwatch')
				.attr('id', 'ca-watch')
				.find('a')
				.attr('href', this.getUrl({ action: 'watch' }))
		}
	}
}
