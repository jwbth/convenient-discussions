import AutocompleteManager from './AutocompleteManager'
import ProcessDialog from './ProcessDialog'
import Pseudolink from './Pseudolink'
import TextInputWidget from './TextInputWidget'
import controller from './controller'
import cd from './loader/cd'
import pageRegistry from './pageRegistry'
import CdError from './shared/CdError'
import { defined, definedAndNotNull, ensureArray, mergeMaps, sleep } from './shared/utils-general'
import { encodeWikilink, endWithTwoNewlines } from './shared/utils-wikitext'
import { createCheckboxControl, createTitleControl, es6ClassToOoJsClass } from './utils-oojs'
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

		/** @type {[Promise<any>, JQuery.Promise<any>, Promise<ArchiveConfig | void>]} */
		initRequests

		/**
		 * @typedef {{
		 *   title: 'title';
		 *   keepLink: 'checkbox';
		 *   chronologicalOrder: 'checkbox';
		 *   summaryEnding: 'text';
		 * }} MoveSectionDialogControlTypes
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
			const archivingConfigPages = []
			if (sourcePage.canHaveArchives()) {
				archivingConfigPages.push(
					sourcePage,
					...(cd.config.archivingConfig.subpages || [])
						.map((subpage) => pageRegistry.get(sourcePage.name + '/' + subpage))
						.filter(definedAndNotNull),
				)
			}
			const templatePages = (cd.config.archivingConfig.templates || [])
				.map((template) => pageRegistry.get(template.name))
				.filter(definedAndNotNull)
			this.initRequests = [
				sourcePage.loadCode(),
				mw.loader.using('mediawiki.widgets'),
				Promise.all(
					archivingConfigPages.map((page) => page.getFirstTemplateTransclusion(templatePages)),
				).then(
					(transclusions) => this.guessArchiveConfig(mergeMaps(transclusions)),
					() => {},
				),
			]

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
		 * @returns {OO.ui.Process}
		 * @see https://doc.wikimedia.org/oojs-ui/master/js/OO.ui.ProcessDialog.html#getSetupProcess
		 * @see https://www.mediawiki.org/wiki/OOUI/Windows#Window_lifecycle
		 * @ignore
		 */
		getSetupProcess(data) {
			return super.getSetupProcess(data).next(() => {
				this.stack.setItem(this.loadingPanel)
				this.actions.setMode('move')
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
				try {
					archiveConfig = (await Promise.all(this.initRequests))[2]
				} catch {
					this.abort({ message: cd.sParse('cf-error-getpagecode'), recoverable: false })

					return
				}

				try {
					this.section.locateInCode()
				} catch (error) {
					if (error instanceof CdError) {
						this.abort({
							message: cd.sParse(
								error.getCode() === 'locateSection' ? 'error-locatesection' : 'error-unknown',
							),
							recoverable: false,
						})
					} else {
						console.warn(error)
						this.abort({
							message: cd.sParse('error-javascript'),
							recoverable: false,
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

				const archivePath =
					archiveConfig?.path || (cd.page.isArchive() ? undefined : cd.page.getArchivePrefix(true))
				if (archivePath) {
					this.insertArchivePageButton = new Pseudolink({
						label: archivePath,
						input: this.controls.title.input,
					})
					$(this.insertArchivePageButton.buttonElement).on('click', () => {
						this.controls.keepLink.input.setSelected(false)
						this.controls.chronologicalOrder.input.setSelected(archiveConfig?.isSorted || false)
					})
				}

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
						this.insertArchivePageButton?.element,
						this.controls.keepLink.field.$element,
						this.controls.chronologicalOrder.field.$element,
						this.controls.summaryEnding.field.$element,
					].filter(defined),
				)

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

					// Should be ruled out by making the button disabled.
					if (targetPage === this.section.getSourcePage()) {
						this.abort({
							message: cd.sParse('msd-error-wrongpage'),
							recoverable: false,
						})

						return
					}

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
			} // if (action === 'close')

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
		 * @throws {Array.<string|boolean>}
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
					console.warn(error)
					throw new CdError({
						message: cd.sParse('error-javascript'),
						details: { recoverable: false },
					})
				}
			}

			let sectionSource
			try {
				sectionSource = this.section.locateInCode()
			} catch (error) {
				if (error instanceof CdError) {
					throw new CdError({
						details: [
							cd.sParse(
								error.getCode() === 'locateSection' ? 'error-locatesection' : 'error-unknown',
							),
							true,
						],
					})
				} else {
					console.warn(error)
					throw new CdError({ details: [cd.sParse('error-javascript'), false] })
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
		 * @throws {Array.<string|boolean>}
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
								new CdError({ details: [cd.sParse('msd-error-invalidpagename'), false] })
							: new CdError({ details: [cd.sParse('error-api', error.getCode()), true] })
					} else if (error.getType() === 'network') {
						throw new CdError({ details: [cd.sParse('error-network'), true] })
					}
				} else {
					console.warn(error)
					throw new CdError({ details: [cd.sParse('error-javascript'), false] })
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
		 * @throws {Array.<string|boolean>}
		 * @protected
		 */
		async editTargetPage(source, target) {
			let codeBeginning
			let codeEnding
			if (this.controls.keepLink.input.isSelected()) {
				const code = cd.config.getMoveTargetPageCode(
					source.sectionWikilink.replace(/=/g, '{{=}}'),
					cd.g.userSignature.replace(/=/g, '{{=}}'),
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
						text: cd.s('es-move-from', source.sectionWikilink) + summaryEnding,
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
							details: [genericMessage + ' ' + cd.sParse('error-network'), true],
						})
					} else {
						let message = /** @type {string} */ (error.getMessage())
						if (error.getCode() === 'editconflict') {
							// eslint-disable-next-line @typescript-eslint/restrict-plus-operands
							message += ' ' + cd.sParse('msd-error-editconflict-retry')
						}
						throw new CdError({ details: [genericMessage + ' ' + message, true] })
					}
				} else {
					console.warn(error)
					throw new CdError({
						details: [genericMessage + ' ' + cd.sParse('error-javascript'), false],
					})
				}
			}
		}

		/**
		 * Edit the source page.
		 *
		 * @param {Source} source
		 * @param {Target} target
		 * @throws {Array.<string|boolean>}
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
									target.sectionWikilink,
									cd.g.userSignature,
									findFirstTimestamp(sectionCode) || cd.g.signCode + '~',
								) +
								'\n'
							: '') +
						code.slice(source.sectionSource.endIndex),
					summary: buildEditSummary({
						text: cd.s('es-move-to', target.sectionWikilink) + summaryEnding,
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
						details: [
							genericMessage +
								' ' +
								(error.getType() === 'network'
									? cd.sParse('error-network')
									: /** @type {string} */ (error.getMessage())),
							false,
							true,
						],
					})
				} else {
					console.warn(error)
					throw new CdError({
						details: [genericMessage + ' ' + cd.sParse('error-javascript'), false, true],
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
		 * Provided parameters of archiving templates present on the page, guess the archive path and
		 * other configuration for the section.
		 *
		 * @param {Map<import('./Page').default, StringsByKey>} templateToParameters
		 * @returns {ArchiveConfig | undefined}
		 */
		guessArchiveConfig(templateToParameters) {
			return Array.from(templateToParameters).reduce((config, [page, parameters]) => {
				if (config) {
					return config
				}

				const templateConfig = /** @type {import('../config/default').ArchivingTemplateEntry} */ (
					(cd.config.archivingConfig.templates || []).find(
						(template) => pageRegistry.get(template.name) === page,
					)
				)

				/**
				 * Find a parameter mentioned in the template config in the list of actual template
				 * parameters, do the regexp transformations, and return the result.
				 *
				 * @param {keyof typeof templateConfig} prop
				 * @returns {string | undefined}
				 */
				const findPresentParamAndReplaceAll = (prop) => {
					const replaceAll = (/** @type {string} */ value) =>
						Array.from(templateConfig.replacements || []).reduce(
							(v, [regexp, replacer]) =>
								v.replace(regexp, (...match) =>
									replacer(
										{
											counter: parameters[templateConfig.counterParam] || null,
											date: this.section.oldestComment?.date || null,
										},

										// Basically get all string matches. Use a complex expression in case JavaScript
										// evolves in the future to add more arguments.
										match.slice(
											0,
											match.findIndex((el) => typeof el !== 'string'),
										),
									),
								),
							value,
						)

					const presentPathParam = ensureArray(templateConfig[prop]).find(
						(pathParam) => parameters[pathParam],
					)

					return presentPathParam ? replaceAll(parameters[presentPathParam]) : undefined
				}

				let path = findPresentParamAndReplaceAll('pathParam')
				if (!path) {
					path = findPresentParamAndReplaceAll('relativePathParam')
					if (path) {
						const [absolutePairKey, absolutePairValue] = templateConfig.absolutePathPair || []
						if (!(absolutePairKey && parameters[absolutePairKey]?.match(absolutePairValue))) {
							path = cd.page.name + '/' + path
						}
					}
				}

				return {
					path,
					isSorted: cd.config.archivingConfig.areArchivesSorted || false,
				}
			}, /** @type {ArchiveConfig | undefined} */ (undefined))
		}
	}

	es6ClassToOoJsClass(MoveSectionDialog)

	return MoveSectionDialog
}
