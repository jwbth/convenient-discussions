import AutocompleteManager from './AutocompleteManager'
import ProcessDialog from './ProcessDialog'
import Pseudolink from './Pseudolink'
import TextInputWidget from './TextInputWidget'
import controller from './controller'
import cd from './loader/cd'
import pageRegistry from './pageRegistry'
import CdError from './shared/CdError'
import { defined, sleep } from './shared/utils-general'
import { encodeWikilink, endWithTwoNewlines, escapeEqualsInTemplate } from './shared/utils-wikitext'
import { createCheckboxControl, createTitleControl } from './utils-oojs'
import { es6ClassToOoJsClass } from './utils-oojs-class'
import { buildEditSummary, findFirstTimestamp, wrapHtml } from './utils-window'

/**
 * @typedef {object} ArchiveConfig
 * @property {string | undefined} path
 * @property {boolean} isSorted
 */

// eslint-disable-next-line jsdoc/require-jsdoc
export default function getMoveSectionDialogClass() {
	/**
	 * Class used to create a move section dialog.
	 *
	 * @augments ProcessDialog
	 */
	class MoveSectionDialog extends ProcessDialog {
		// @ts-expect-error: https://phabricator.wikimedia.org/T358416
		static name = 'moveSectionDialog'

		static title = cd.s('msd-title')

		static actions = /** @type {const} */ ([
			{
				action: 'close',
				modes: ['move', 'success'],
				flags: ['safe', 'close'],
				disabled: true,
			},
			{
				action: 'move',
				modes: ['move'],
				label: cd.s('msd-move'),
				flags: ['primary', 'progressive'],
				disabled: true,
			},
		])

		/** @type {OO.ui.StackLayout} */
		stack

		/** @type {OO.ui.PanelLayout} */
		loadingPanel

		/** @type {OO.ui.PanelLayout} */
		movePanel

		/** @type {OO.ui.PanelLayout} */
		successPanel

		/** @type {Array<Promise<any> | JQuery.Promise<any>>} */
		initRequests = []

		/**
		 * @typedef {object} MoveSectionDialogControlTypes
		 * @property {'title'} title
		 * @property {'checkbox'} keepLink
		 * @property {'checkbox'} chronologicalOrder
		 * @property {'text'} summaryEnding
		 */
		controls = /** @type {ControlTypesByName<MoveSectionDialogControlTypes>} */ ({})

		/**
		 * Create a move section dialog.
		 *
		 * @param {import('./Section').default} section
		 */
		constructor(section) {
			super()
			this.section = section
		}

		/**
		 * OOUI native method to get the height of the window body.
		 *
		 * @override
		 * @returns {number}
		 * @see https://doc.wikimedia.org/oojs-ui/master/js/OO.ui.ProcessDialog.html#getBodyHeight
		 * @ignore
		 */
		getBodyHeight() {
			return this.$errorItems ? this.$errors[0].scrollHeight : this.$body[0].scrollHeight
		}

		/**
		 * OOUI native method that initializes window contents.
		 *
		 * @override
		 * @see https://doc.wikimedia.org/oojs-ui/master/js/OO.ui.ProcessDialog.html#initialize
		 * @see https://www.mediawiki.org/wiki/OOUI/Windows#Window_lifecycle
		 * @ignore
		 */
		initialize() {
			super.initialize()

			this.pushPending()

			const sourcePage = this.section.getSourcePage()
			this.initRequests.push(sourcePage.loadCode(), mw.loader.using('mediawiki.widgets'))

			this.loadingPanel = new OO.ui.PanelLayout({
				padded: true,
				expanded: false,
			})
			this.loadingPanel.$element.append($('<div>').text(cd.s('loading-ellipsis')))

			this.movePanel = new OO.ui.PanelLayout({
				padded: true,
				expanded: false,
			})

			this.successPanel = new OO.ui.PanelLayout({
				padded: true,
				expanded: false,
			})

			this.stack = new OO.ui.StackLayout({
				items: [this.loadingPanel, this.movePanel, this.successPanel],
			})
			this.$body.append(this.stack.$element)

			return this
		}

		/**
		 * OOUI native method that returns a "setup" process which is used to set up a window for use in a
		 * particular context, based on the `data` argument.
		 *
		 * @override
		 * @param {object} [data] Dialog opening data
		 * @param {'move' | 'archive'} [data.action] Action type
		 * @returns {OO.ui.Process}
		 * @see https://doc.wikimedia.org/oojs-ui/master/js/OO.ui.ProcessDialog.html#getSetupProcess
		 * @see https://www.mediawiki.org/wiki/OOUI/Windows#Window_lifecycle
		 * @ignore
		 */
		getSetupProcess(data) {
			return super.getSetupProcess(data).next(() => {
				this.action = data?.action || 'move'
				this.stack.setItem(this.loadingPanel)
				this.actions.setMode('move')

				const archivePrefix = cd.page.getArchivePrefix()

				this.initRequests.push(
					this.action === 'archive' && !cd.page.isArchive()
						? this.section.manager.loadArchiveConfig(this.section).catch(() => undefined)
						: Promise.resolve(undefined),
					this.action === 'archive' && archivePrefix
						? // Search for subpages
							Promise.resolve(
								cd.getApi().get({
									action: 'query',
									list: 'search',
									srsearch: `prefix:${archivePrefix}`,
									srsort: 'last_edit_desc',
									srlimit: 5,
								}),
							)
						: Promise.resolve(undefined),
				)
			})
		}

		/**
		 * OOUI native method that returns a "ready" process which is used to ready a window for use in a
		 * particular context, based on the `data` argument.
		 *
		 * @override
		 * @param {object} data Window opening data
		 * @returns {OO.ui.Process}
		 * @see https://doc.wikimedia.org/oojs-ui/master/js/OO.ui.ProcessDialog.html#getReadyProcess
		 * @see https://www.mediawiki.org/wiki/OOUI/Windows#Window_lifecycle
		 * @ignore
		 */
		getReadyProcess(data) {
			return super.getReadyProcess(data).next(async () => {
				let archiveConfig
				let subpagesResponse
				try {
					const results = await Promise.all(this.initRequests)
					archiveConfig = results[2]
					subpagesResponse = results[3]
				} catch (error) {
					console.log(error)
					this.abort({
						message: cd.sParse('cf-error-getpagecode'),
						recoverable: false,
						closeDialog: true,
					})

					return
				}

				try {
					this.section.locateInCode()
				} catch (error) {
					if (error instanceof CdError) {
						const editUrl = cd.g.server + cd.page.getUrl({ action: 'edit' })
						this.abort({
							message: cd.sParse(
								error.getCode() === 'locateSection' ? 'error-locatesection' : 'error-unknown',
								editUrl,
								cd.page.name,
							),
							recoverable: false,
							closeDialog: true,
						})
					} else {
						cd.debug.logWarn(error)
						this.abort({
							message: cd.sParse('error-javascript'),
							recoverable: false,
							closeDialog: true,
						})
					}

					return
				}

				this.controls.title = createTitleControl({
					label: cd.s('msd-targetpage'),
					$overlay: this.$overlay,
					excludeCurrentPage: true,
					showMissing: false,
					showSuggestionsOnFocus: false,
					validate: () => {
						const title = this.controls.title.input.getMWTitle()
						const page = title && pageRegistry.get(title)

						return Boolean(page && page !== this.section.getSourcePage())
					},
				})

				this.controls.title.input.on('change', this.onTitleInputChange).on('enter', () => {
					if (!this.actions.get({ actions: 'move' })[0].isDisabled()) {
						this.executeAction('move')
					}
				})

				this.controls.keepLink = createCheckboxControl({
					value: 'keepLink',
					selected: !cd.page.isArchive(),
					label: cd.s('msd-keeplink'),
				})
				this.controls.chronologicalOrder = createCheckboxControl({
					value: 'chronologicalOrder',
					selected: false,
					label: cd.s('msd-chronologicalorder'),
				})

				this.controls.summaryEnding = /** @type {TextControl} */ ({})
				this.controls.summaryEnding.input = new TextInputWidget({
					// TODO: Take into account the whole summary length, updating the maximum value dynamically.
					maxLength: 250,
				})
				this.summaryEndingAutocomplete = new AutocompleteManager({
					types: ['mentions', 'wikilinks'],
					inputs: [this.controls.summaryEnding.input],
				})
				this.summaryEndingAutocomplete.init()
				this.controls.summaryEnding.field = new OO.ui.FieldLayout(
					this.controls.summaryEnding.input,
					{
						label: cd.s('msd-summaryending'),
						align: 'top',
					},
				)

				this.movePanel.$element.append(
					[
						this.controls.title.field.$element,
						this.controls.keepLink.field.$element,
						this.controls.chronologicalOrder.field.$element,
						this.controls.summaryEnding.field.$element,
					].filter(defined),
				)

				// Handle archive action
				if (this.action === 'archive') {
					this.setupArchiveAction(archiveConfig || undefined, subpagesResponse)
				}

				this.stack.setItem(this.movePanel)
				this.controls.title.input.focus()
				this.onTitleInputChange()
				this.actions.setAbilities({ close: true })

				// A dirty workaround to avoid a scrollbar appearing when the window is loading. Couldn't
				// figure out a way to do this out of the box.
				this.$body.css('overflow', 'hidden')
				sleep(500).then(() => {
					this.$body.css('overflow', '')
				})

				this.updateSize()
				this.popPending()
			})
		}

		/**
		 * OOUI native method that returns a process for taking action.
		 *
		 * @override
		 * @param {(typeof MoveSectionDialog.actions)[number]['action']} action Symbolic name of the
		 *   action.
		 * @returns {OO.ui.Process}
		 * @see https://doc.wikimedia.org/oojs-ui/master/js/OO.ui.ProcessDialog.html#getActionProcess
		 * @ignore
		 */
		getActionProcess(action) {
			if (action === 'move') {
				return new OO.ui.Process(async () => {
					this.pushPending()
					this.controls.title.input.$input.trigger('blur')

					const targetPage = /** @type {import('./Page').default} */ (
						pageRegistry.get(/** @type {mw.Title} */ (this.controls.title.input.getMWTitle()))
					)

					let source
					let target
					try {
						;[source, target] = await Promise.all([
							this.loadSourcePage(),
							this.loadTargetPage(targetPage),
						])
						await this.editTargetPage(source, target)
						await this.editSourcePage(source, target)
					} catch (error) {
						if (error instanceof CdError) {
							this.abort({
								message: /** @type {string} */ (error.getMessage()),
								recoverable: error.getDetails().recoverable,
								closeDialog: error.getDetails().closeDialog,
							})
						} else {
							throw error
						}

						return
					}

					this.successPanel.$element.append(
						wrapHtml(cd.sParse('msd-moved', target.sectionWikilink), { tagName: 'div' }),
					)

					controller.rebootPage({
						sectionId: this.controls.keepLink.input.isSelected() ? this.section.id : undefined,
					})

					this.stack.setItem(this.successPanel)
					this.actions.setMode('success')
					this.popPending()
				})
			}

			// if (action === 'close')
			return new OO.ui.Process(() => {
				this.close()
			})
		}

		/**
		 * Handler of the event of change of the title input.
		 *
		 * @protected
		 */
		onTitleInputChange = async () => {
			let move = true
			await this.controls.title.input.getValidity().catch(() => {
				move = false
			})
			this.actions.setAbilities({ move })
		}

		/**
		 * @typedef {object} Source
		 * @property {import('./Page').default} page
		 * @property {import('./SectionSource').default} sectionSource
		 * @property {string} sectionWikilink
		 */

		/**
		 * Load the source page code.
		 *
		 * @returns {Promise<Source>}
		 * @throws {CdError}
		 * @protected
		 */
		async loadSourcePage() {
			try {
				await this.section.getSourcePage().loadCode(undefined, false)
			} catch (error) {
				if (error instanceof CdError) {
					if (error.getType() === 'api') {
						throw error.getCode() === 'missing'
							? new CdError({
									message: cd.sParse('msd-error-sourcepagedeleted'),
									details: { recoverable: true },
								})
							: new CdError({
									message: cd.sParse('error-api', error.getCode()),
									details: { recoverable: true },
								})
					} else if (error.getType() === 'network') {
						throw new CdError({
							message: cd.sParse('error-network'),
							details: { recoverable: true },
						})
					}
				} else {
					cd.debug.logWarn(error)
					throw new CdError({
						message: cd.sParse('error-javascript'),
						details: { recoverable: false, closeDialog: true },
					})
				}
			}

			let sectionSource
			try {
				sectionSource = this.section.locateInCode()
			} catch (error) {
				if (error instanceof CdError) {
					const editUrl = cd.g.server + cd.page.getUrl({ action: 'edit' })
					throw new CdError({
						message: cd.sParse(
							error.getCode() === 'locateSection' ? 'error-locatesection' : 'error-unknown',
							editUrl,
							cd.page.name,
						),
						details: { recoverable: true },
					})
				} else {
					cd.debug.logWarn(error)
					throw new CdError({
						message: cd.sParse('error-javascript'),
						details: { recoverable: false, closeDialog: true },
					})
				}
			}

			const pageName = this.section.getSourcePage().name
			const headlineEncoded = encodeWikilink(this.section.headline)

			return {
				page: this.section.getSourcePage(),
				sectionSource,
				sectionWikilink: this.controls.keepLink.input.isSelected()
					? `${pageName}#${headlineEncoded}`
					: pageName,
			}
		}

		/**
		 * @typedef {object} Target
		 * @property {import('./Page').default} page
		 * @property {number} [targetIndex]
		 * @property {string} sectionWikilink
		 */

		/**
		 * Load the target page code.
		 *
		 * @param {import('./Page').default} targetPage
		 * @returns {Promise<Target>}
		 * @throws {CdError}
		 * @protected
		 */
		async loadTargetPage(targetPage) {
			try {
				await targetPage.loadCode()
			} catch (error) {
				if (error instanceof CdError) {
					if (error.getType() === 'api') {
						throw error.getCode() === 'invalid'
							? // Should be filtered before submit anyway.
								new CdError({
									message: cd.sParse('msd-error-invalidpagename'),
									details: { recoverable: false },
								})
							: new CdError({
									message: cd.sParse('error-api', error.getCode()),
									details: { recoverable: true },
								})
					} else if (error.getType() === 'network') {
						throw new CdError({
							message: cd.sParse('error-network'),
							details: { recoverable: true },
						})
					}
				} else {
					cd.debug.logWarn(error)
					throw new CdError({
						message: cd.sParse('error-javascript'),
						details: { recoverable: false, closeDialog: true },
					})
				}
			}
			const realName = /** @type {NonNullable<typeof targetPage.realName>} */ (targetPage.realName)

			return {
				page: targetPage,
				targetIndex: targetPage.source.findProperPlaceForSection(
					this.controls.chronologicalOrder.input.isSelected()
						? this.section.oldestComment?.date
						: undefined,
				),
				sectionWikilink: `${realName}#${encodeWikilink(this.section.headline)}`,
			}
		}

		/**
		 * Edit the target page.
		 *
		 * @param {Source} source
		 * @param {Target} target
		 * @throws {CdError}
		 * @protected
		 */
		async editTargetPage(source, target) {
			let codeBeginning
			let codeEnding
			if (this.controls.keepLink.input.isSelected()) {
				const code = cd.config.getMoveTargetPageCode(
					escapeEqualsInTemplate(source.sectionWikilink),
					escapeEqualsInTemplate(cd.g.userSignature),
				)
				if (Array.isArray(code)) {
					codeBeginning = code[0] + '\n'
					codeEnding = '\n' + code[1]
				} else {
					codeBeginning = code
					codeEnding = ''
				}
			} else {
				codeBeginning = ''
				codeEnding = ''
			}

			const sectionCode = source.sectionSource.code
			const relativeContentStartIndex = source.sectionSource.relativeContentStartIndex

			let summaryEnding = this.controls.summaryEnding.input.getValue()
			summaryEnding &&= cd.mws('colon-separator', { language: 'content' }) + summaryEnding

			try {
				const code = target.page.source.getCode()
				await target.page.edit({
					text:
						endWithTwoNewlines(code.slice(0, target.targetIndex)) +
						// New section code
						endWithTwoNewlines(
							sectionCode.slice(0, relativeContentStartIndex) +
								codeBeginning +
								sectionCode.slice(relativeContentStartIndex) +
								codeEnding,
						) +
						code.slice(target.targetIndex),
					summary: buildEditSummary({
						text:
							this.action === 'archive'
								? cd.s('es-archive-from', source.sectionWikilink) + summaryEnding
								: cd.s('es-move-from', source.sectionWikilink) + summaryEnding,
						section: this.section.headline,
					}),
					baserevid: target.page.revisionId,
					starttimestamp: target.page.queryTimestamp,
				})
			} catch (error) {
				const genericMessage = cd.sParse('msd-error-editingtargetpage')
				if (error instanceof CdError) {
					if (error.getType() === 'network') {
						throw new CdError({
							message: genericMessage + ' ' + cd.sParse('error-network'),
							details: { recoverable: true },
						})
					} else {
						let message = /** @type {string} */ (error.getMessage())
						if (error.getCode() === 'editconflict') {
							// eslint-disable-next-line @typescript-eslint/restrict-plus-operands
							message += ' ' + cd.sParse('msd-error-editconflict-retry')
						}
						throw new CdError({
							message: genericMessage + ' ' + message,
							details: { recoverable: true },
						})
					}
				} else {
					cd.debug.logWarn(error)
					throw new CdError({
						message: genericMessage + ' ' + cd.sParse('error-javascript'),
						details: { recoverable: false, closeDialog: true },
					})
				}
			}
		}

		/**
		 * Edit the source page.
		 *
		 * @param {Source} source
		 * @param {Target} target
		 * @throws {CdError}
		 */
		async editSourcePage(source, target) {
			const sectionCode = source.sectionSource.code

			let summaryEnding = this.controls.summaryEnding.input.getValue()
			summaryEnding &&= cd.mws('colon-separator', { language: 'content' }) + summaryEnding

			try {
				const code = source.page.source.getCode()
				await source.page.edit({
					text:
						code.slice(0, source.sectionSource.startIndex) +
						(this.controls.keepLink.input.isSelected()
							? sectionCode.slice(0, source.sectionSource.relativeContentStartIndex) +
								cd.config.getMoveSourcePageCode(
									escapeEqualsInTemplate(target.sectionWikilink),
									escapeEqualsInTemplate(cd.g.userSignature),
									findFirstTimestamp(sectionCode) || cd.g.signCode + '~',
								) +
								'\n'
							: '') +
						code.slice(source.sectionSource.endIndex),
					summary: buildEditSummary({
						text:
							this.action === 'archive'
								? cd.s('es-archive-to', target.sectionWikilink) + summaryEnding
								: cd.s('es-move-to', target.sectionWikilink) + summaryEnding,
						section: this.section.headline,
					}),
					baserevid: source.page.revisionId,
					starttimestamp: source.page.queryTimestamp,
				})
			} catch (error) {
				// Errors when editing the target page are recoverable because we haven't performed any
				// actions yet. Errors when editing the source page are not recoverable because we have
				// already edited the source page.
				const genericMessage = cd.sParse('msd-error-editingsourcepage')
				if (error instanceof CdError) {
					throw new CdError({
						message:
							genericMessage +
							' ' +
							(error.getType() === 'network'
								? cd.sParse('error-network')
								: /** @type {string} */ (error.getMessage())),
						details: { recoverable: false, closeDialog: true },
					})
				} else {
					cd.debug.logWarn(error)
					throw new CdError({
						message: genericMessage + ' ' + cd.sParse('error-javascript'),
						details: { recoverable: false, closeDialog: true },
					})
				}
			}
		}

		/**
		 * @typedef {object} ErrorData
		 * @property {string} message Error message in HTML.
		 * @property {boolean} recoverable Is the error recoverable.
		 * @property {boolean} [closeDialog=false] Close the dialog after pressing "Close" under the error
		 *   message.
		 */

		/**
		 * Abort an operation and show an error.
		 *
		 * @param {ErrorData} config
		 * @protected
		 */
		abort({ message, recoverable, closeDialog = false }) {
			// TODO: Can we just reuse ProcessDialogMixin#handleError() here? Add parameter (or rather a
			// config option) for closing dialog if necessary.

			this.showErrors(
				new OO.ui.Error(
					wrapHtml(message, {
						callbacks: {
							'cd-message-reloadPage': () => {
								this.close()
								controller.rebootPage()
							},
						},
					}),
					{ recoverable },
				),
			)
			this.$errors.find('.oo-ui-buttonElement-button').on('click', () => {
				if (closeDialog) {
					this.close()
				} else {
					this.updateSize()
				}
			})

			this.actions.setAbilities({
				close: true,
				move: recoverable,
			})

			this.updateSize()
			this.popPending()
		}

		/**
		 * Set up the dialog for archive/unarchive action by pre-filling the target page and setting
		 * appropriate options.
		 *
		 * @param {ArchiveConfig | undefined} archiveConfig
		 * @param {any} [subpagesResponse]
		 * @protected
		 */
		setupArchiveAction(archiveConfig, subpagesResponse) {
			let titleText
			let targetPageName

			if (cd.page.isArchive()) {
				titleText = cd.s('msd-title-unarchive')

				// Unarchiving: move from archive to source page
				const sourcePage = cd.page.getArchivedPage()
				if (sourcePage !== cd.page) {
					targetPageName = sourcePage.name
				}

				// Archiving: move from source to archive page
			} else {
				titleText = cd.s('msd-title-archive')

				const archivePath =
					archiveConfig?.path || (cd.page.isArchive() ? undefined : cd.page.getArchivePrefix(true))
				if (archivePath) {
					targetPageName = archivePath
				}
			}

			// @ts-ignore: private prop
			this.title.setLabel(titleText)

			// Always set checkboxes and summary when archiving/unarchiving (even without target page)
			this.controls.keepLink.input.setSelected(false)
			this.controls.keepLink.field.toggle(false)
			this.controls.chronologicalOrder.input.setSelected(
				archiveConfig?.isSorted ?? cd.config.archivingConfig.areArchivesSorted ?? false,
			)
			if (archiveConfig?.isSorted !== undefined) {
				this.controls.chronologicalOrder.field.toggle()
			}

			if (targetPageName) {
				// Set the target page
				this.controls.title.input.setValue(targetPageName)

				// Trigger validation
				this.onTitleInputChange()
			} else if (!cd.page.isArchive() && subpagesResponse?.query?.search) {
				// No archive path found, show subpage pseudolinks from search results
				const searchResults = subpagesResponse.query.search
				if (searchResults.length > 0) {
					this.subpagePseudolinks = searchResults.map((/** @type {{ title: string }} */ result) => {
						const pseudolink = new Pseudolink({
							label: result.title,
							input: this.controls.title.input,
						})
						// No need for click handler - checkboxes and summary are already set when dialog opens

						return pseudolink
					})

					// Insert subpage pseudolinks after the title field
					const subpageElements = this.subpagePseudolinks.map(
						(/** @type {Pseudolink} */ pl) => pl.element,
					)
					this.controls.title.field.$element.after(...subpageElements)
				}
			}
		}
	}

	es6ClassToOoJsClass(MoveSectionDialog)

	return MoveSectionDialog
}
