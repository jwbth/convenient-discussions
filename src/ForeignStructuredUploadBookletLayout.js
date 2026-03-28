import { getForeignStructuredUploadClass } from './ForeignStructuredUpload'
import Pseudolink from './Pseudolink'
import cd from './loader/cd'
import {
	canonicalUrlToPageName,
	defined,
	generateFixedPosTimestamp,
	getDbnameForHostname,
} from './shared/utils-general'
import {
	createCheckboxControl,
	createRadioControl,
	createTextControl,
	createTitleControl,
} from './utils-oojs'
import { es6ClassToOoJsClass } from './utils-oojs-class'
import { mergeJquery, wrapHtml } from './utils-window'

// TODO: Make it work on third-party wikis (where the target host is not Wikimedia Commons)

/**
 * @typedef {ReturnType<getForeignStructuredUploadClass>} ForeignStructuredUploadClass
 */

// eslint-disable-next-line jsdoc/require-jsdoc
export function getForeignStructuredUploadBookletLayoutClass() {
	const ForeignStructuredUploadClass = getForeignStructuredUploadClass()

	/**
	 * Class extending
	 * {@link mw.ForeignStructuredUpload.BookletLayout mw.ForeignStructuredUpload.BookletLayout} and
	 * adding more details to the process of uploading a file using the
	 * {@link ForeignStructuredUploadClass} model. See {@link UploadDialog} for the dialog itself.
	 *
	 * @augments mw.ForeignStructuredUpload.BookletLayout
	 */
	class ForeignStructuredUploadBookletLayout extends mw.ForeignStructuredUpload.BookletLayout {
		/**
		 * @typedef {object} UploadDialogControlTypes
		 * @property {'radio'} preset
		 * @property {'title'} title
		 * @property {'checkbox'} configure
		 * @property {'text'} source
		 * @property {'text'} author
		 * @property {'text'} license
		 */

		/** @type {ControlTypesByName<UploadDialogControlTypes>} */
		controls

		/**
		 * @override
		 * @type {InstanceType<ForeignStructuredUploadClass>}
		 */
		// @ts-expect-error: Initialized in createUpload(); narrowing parent type
		upload

		/** @type {string | undefined} */
		preset

		/** @type {string | undefined} */
		defaultDescription

		/**
		 * Create a booklet layout for foreign structured upload.
		 *
		 * @param {...any} args
		 */
		constructor(...args) {
			super(...args)

			// Workaround to make this.constructor in methods to be type-checked correctly
			/** @type {typeof ForeignStructuredUploadBookletLayout} */
			// eslint-disable-next-line no-self-assign
			this.constructor = this.constructor
		}

		/**
		 * Setup the booklet with some data. (This method is not in the parent class - it's our own.)
		 *
		 * @param {File} [file]
		 * @param {string} [enProjectName]
		 */
		setup(file, enProjectName) {
			this.modifyUploadForm()
			this.modifyInfoForm()

			if (file) {
				this.setFile(file)
			}
			this.enProjectName = enProjectName
			this.on('fileSaved', () => {
				// Pretend that the page hasn't changed to 'insert'
				this.setPage('info')
			})
			this.onPresetChange()
		}

		/**
		 * Add content and logic to the upload form.
		 *
		 * @protected
		 */
		modifyUploadForm() {
			// We hide that checkbox, replacing it with a radio select
			this.ownWorkCheckbox.setSelected(true)

			const fieldset = /** @type {OO.ui.FieldsetLayout} */ (this.uploadForm.getItems()[0])

			// Hide everything related to the "own work" checkbox
			const fieldsetItemsTyped = /** @type {OO.ui.FieldLayout[]} */ (fieldset.getItems())
			fieldsetItemsTyped.slice(1).forEach((layout) => {
				layout.toggle(false)
			})

			this.controls = /** @type {ControlTypesByName<UploadDialogControlTypes>} */ ({})
			this.controls.preset = createRadioControl({
				label: cd.s('ud-preset'),
				options: [
					{
						data: 'projectScreenshot',
						label: cd.s(
							'ud-preset-projectscreenshot',
							cd.mws('project-localized-name-' + mw.config.get('wgDBname')),
						),
						help: cd.s('ud-preset-projectscreenshot-help'),
						selected: true,
					},
					{
						data: 'mediawikiScreenshot',
						label: cd.s('ud-preset-mediawikiscreenshot'),
					},
					{
						data: 'ownWork',
						label: cd.s('ud-preset-ownwork'),
						help: wrapHtml(cd.mws('upload-form-label-own-work-message-commons')),
					},
					{
						data: 'no',
						label: cd.s('ud-preset-no'),
					},
				],
			})

			const subjectPage = cd.page.mwTitle.getSubjectPage()
			if (subjectPage) {
				this.insertSubjectPageButton = new Pseudolink({
					label: subjectPage.getPrefixedText(),
				})
			}
			if (cd.page.mwTitle.isTalkPage()) {
				this.insertTalkPageButton = new Pseudolink({
					label: cd.page.name,
				})
			}
			this.controls.title = createTitleControl({
				$overlay: this.$overlay,
				showMissing: false,
				showSuggestionsOnFocus: false,
				value: '',
				label: cd.s('ud-preset-projectscreenshot-title'),
				help: mergeJquery(
					this.insertSubjectPageButton
						? $('<div>').append(this.insertSubjectPageButton.element)
						: undefined,
					this.insertTalkPageButton
						? $('<div>').append(this.insertTalkPageButton.element)
						: undefined,
					$('<div>').html(cd.sParse('ud-preset-projectscreenshot-title-help')),
				),
				classes: ['cd-uploadDialog-fieldLayout-internal'],
			})
			this.insertSubjectPageButton?.setInput(this.controls.title.input)
			this.insertTalkPageButton?.setInput(this.controls.title.input)

			const projectScreenshotItem = /** @type {import('./RadioOptionWidget').default} */ (
				this.controls.preset.input.findItemFromData('projectScreenshot')
			)
			projectScreenshotItem.$label.append(this.controls.title.field.$element)

			this.controls.configure = createCheckboxControl({
				value: 'configure',
				label: cd.s('ud-configure'),
			})
			fieldset.addItems([this.controls.preset.field, this.controls.configure.field])

			this.controls.preset.input.on('select', (item) => {
				this.onPresetChange(/** @type {OO.ui.RadioOptionWidget} */ (item))
			})
			projectScreenshotItem.radio.$input.on('focus', () => {
				this.controls.title.input.focus()
			})
			this.configureManuallySelected = false
			this.controls.configure.input
				.on('change', this.onPresetChange)
				.on('manualChange', (selected) => {
					this.configureManuallySelected = selected
				})
			this.controls.title.input
				.on('change', this.onUploadFormChange)
				.on('enter', () => this.emit('submitUpload'))
		}

		/**
		 * Handle change events to the upload form.
		 *
		 * @see https://doc.wikimedia.org/mediawiki-core/master/js/mw.ForeignStructuredUpload.BookletLayout.html#onUploadFormChange
		 * @protected
		 * @override
		 */
		onUploadFormChange = async () => {
			let valid = true
			// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
			await this.controls?.title.input.getValidity().catch(() => {
				valid = false
			})
			this.emit('uploadValid', this.selectFileWidget.getValue() && valid)
		}

		/**
		 * Handle events changing the preset.
		 *
		 * @param {OO.ui.RadioOptionWidget|boolean} [itemOrSelected]
		 * @protected
		 */
		onPresetChange = (itemOrSelected) => {
			const preset = /** @type {import('./RadioOptionWidget').default} */ (
				this.controls.preset.input.findSelectedItem()
			)?.getData()
			const titleInputDisabled = preset !== 'projectScreenshot'
			this.controls.title.input.setDisabled(titleInputDisabled)
			this.insertSubjectPageButton?.setDisabled(titleInputDisabled)
			this.insertTalkPageButton?.setDisabled(titleInputDisabled)

			if (typeof itemOrSelected !== 'boolean') {
				// A radio option was selected, not the checkbox.
				if (preset === 'no') {
					this.configureManuallySelected = this.controls.configure.input.isSelected()
					this.controls.configure.input.setDisabled(true).setSelected(true)
				} else {
					this.controls.configure.input
						.setDisabled(false)
						.setSelected(this.configureManuallySelected)
				}
			}

			this.emit('changeSteps', this.isInfoFormOmitted())
		}

		/**
		 * Find out whether the information form should be omitted given the current state of controls.
		 *
		 * @returns {boolean}
		 * @protected
		 */
		isInfoFormOmitted() {
			const preset = /** @type {import('./RadioOptionWidget').default} */ (
				this.controls.preset.input.findSelectedItem()
			)?.getData()

			return (
				(preset === 'projectScreenshot' || preset === 'mediawikiScreenshot') &&
				!this.controls.configure.input.isSelected()
			)
		}

		/**
		 * Find out whether the inputs we added to the information form should be disabled.
		 *
		 * @returns {boolean}
		 * @protected
		 */
		areAddedInputsDisabled() {
			return (
				/** @type {import('./RadioOptionWidget').default} */ (
					this.controls.preset.input.findSelectedItem()
				)?.getData() === 'ownWork' && !this.controls.configure.input.isSelected()
			)
		}

		/**
		 * Add content and logic to the information form.
		 *
		 * @protected
		 */
		modifyInfoForm() {
			this.controls.source = createTextControl({
				label: cd.s('ud-source'),
				required: true,
			})
			this.controls.author = createTextControl({
				label: cd.s('ud-author'),
				required: true,
			})
			this.controls.license = createTextControl({
				label: cd.s('ud-license'),
				required: true,
				classes: ['cd-input-monospace'],
				help: wrapHtml(
					cd.mws('mwe-upwiz-license-custom-explain', null, cd.mws('mwe-upwiz-license-custom-url')),
					{ targetBlank: true },
				),
			})

			this.controls.source.input.on('change', this.onInfoFormChange)
			this.controls.author.input.on('change', this.onInfoFormChange)
			this.controls.license.input.on('change', this.onInfoFormChange)

			// Add items to the fieldset
			const infoFormFieldsetTyped = /** @type {OO.ui.FieldsetLayout} */ (
				this.infoForm.getItems()[1]
			)
			infoFormFieldsetTyped.addItems(
				[this.controls.source.field, this.controls.author.field, this.controls.license.field],
				2,
			)
		}

		/**
		 * Handle change events to the information form.
		 *
		 * @see https://doc.wikimedia.org/mediawiki-core/master/js/mw.ForeignStructuredUpload.BookletLayout.html#onInfoFormChange
		 * @protected
		 * @override
		 */
		onInfoFormChange = async () => {
			let valid = true
			await Promise.all(
				[
					this.uploadPromise,
					this.filenameWidget.getValidity(),
					this.descriptionWidget.getValidity(),
					// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
					this.controls?.source.input.getValidity(),
					// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
					this.controls?.author.input.getValidity(),
					// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
					this.controls?.license.input.getValidity(),
				].filter(defined),
			).catch(() => {
				valid = false
			})
			this.emit('infoValid', valid)
		}

		/**
		 * Returns a {@link mw.ForeignStructuredUpload mw.ForeignStructuredUpload} with the target
		 * specified in config.
		 *
		 * @returns {InstanceType<ForeignStructuredUploadClass>}
		 * @protected
		 * @override
		 */
		createUpload() {
			return new ForeignStructuredUploadClass(this.target)
		}

		/**
		 * Native methods that uploads the file that was added in the upload form. Uses
		 * {@link mw.Upload.BookletLayout#getFile getFile} to get the HTML5 file object.
		 *
		 * We add logic that changes the information form according to the user input in the upload form.
		 *
		 * @returns {JQuery.Promise<void>}
		 * @see
		 *   https://doc.wikimedia.org/mediawiki-core/master/js/mw.ForeignStructuredUpload.BookletLayout.html#uploadFile
		 * @protected
		 * @override
		 */
		uploadFile() {
			const preset = /** @type {string | undefined} */ (
				/** @type {import('./RadioOptionWidget').default} */ (
					this.controls.preset.input.findSelectedItem()
				)?.getData()
			)

			// Keep the inputs if the user pressed "Back" and didn't choose another preset.
			if (this.preset && preset !== this.preset) {
				this.clear()
			}
			this.preset = preset

			let deferred = super.uploadFile()

			// Use UTC date to make it precise and avoid leaking the user's timezone
			const date = moment().utc().locale('en')

			// Use +2 days as the max date to avoid getting the user confused if they want to set the local
			// date nevertheless
			this.dateWidget.mustBeBefore = moment(date.clone().add(2, 'day').format('YYYY-MM-DD'))

			let pageName = ''
			let historyText = ''
			let hasIwPrefix = false
			switch (this.preset) {
				case 'projectScreenshot':
				case 'mediawikiScreenshot': {
					/** @type {string} */
					const filenameDate =
						this.getExactDateFromLastModified(/** @type {File} */ (this.getFile())) ||
						date.format('YYYY-MM-DD HH-mm-ss')

					const title = this.controls.title.input.getMWTitle()
					if (title) {
						pageName = title.getPrefixedText()

						// Rough check, because we don't need to know for sure (that's just to make the description
						// more human-readable, with a project name instead of a domain).
						hasIwPrefix = /:[^ ]/.test(title.getMainText())

						if (hasIwPrefix) {
							// Avoid uppercasing the first character; that would make interwiki prefixes look weird.
							pageName = this.controls.title.input.getValue()
						}

						historyText = this.constructor.generateHistoryText(cd.g.serverName, pageName)
					}

					if (this.preset === 'projectScreenshot') {
						// - If the page name has an interwiki prefix, we don't know the project name.
						// - If the page name does not have an interwiki prefix, we don't know the interwiki prefix
						//   (but should since the image will be posted to Commons).
						//
						// So, we use what is availble to us while trying to get/load missing parts if we can.

						// For page names with an interwiki prefix, the project name will be obtained with a
						// network request (see below)
						const projectName = hasIwPrefix || !this.enProjectName ? '' : this.enProjectName

						const filenameMainPart = `${projectName} ${pageName}`
							.trim()
							.replace(new RegExp('[' + mw.config.get('wgIllegalFileChars', '') + ']', 'g'), '-')
						const projectNameOrPageLink =
							projectName ||
							(hasIwPrefix && !pageName.startsWith(':') ? `[[:${pageName}]]` : `[[${pageName}]]`)
						let pageNameOrProjectName
						if (!hasIwPrefix && pageName && window.getInterwikiPrefixForHostnameSync) {
							const prefix = window.getInterwikiPrefixForHostnameSync(
								cd.g.serverName,
								'commons.wikimedia.org',
							)
							pageNameOrProjectName = `[[:${prefix}${pageName}]]`
						} else {
							pageNameOrProjectName = projectNameOrPageLink
						}

						this.filenameWidget.setValue(`${filenameMainPart} ${filenameDate}`)
						const description = `Screenshot of ${pageNameOrProjectName}`
						this.descriptionWidget.setValue(description)
						this.defaultDescription = description
						this.controls.source.input.setValue('Screenshot')
						this.controls.author.input.setValue(`${projectNameOrPageLink} authors${historyText}`)
						this.controls.license.input.setValue(
							hasIwPrefix
								? '{{Wikimedia-screenshot}}'
								: this.constructor.getTemplateForHostname(cd.g.serverName),
						)

						// Load the English project name for the file name if we can
						if (hasIwPrefix) {
							/** @type {string} */
							let unprefixedPageName
							/** @type {string} */
							let hostname
							/** @type {string} */
							let messageName
							deferred = deferred
								.then(
									() => window.getUrlFromInterwikiLink?.(pageName),
									(/** @type {unknown} */ error) => {
										throw new Error('badUpload', { cause: error })
									},
								)
								.then((url) => {
									if (!url) {
										throw new Error('noUrl')
									}

									hostname = new URL(url, cd.g.server).hostname
									this.controls.license.input.setValue(
										this.constructor.getTemplateForHostname(hostname),
									)
									const dbname = getDbnameForHostname(hostname)
									unprefixedPageName = canonicalUrlToPageName(url)
									messageName = `project-localized-name-${dbname}`

									return cd.getApi().getMessages(messageName, { amlang: 'en' })
								})
								.then(
									(messages) => {
										const newProjectName = messages[messageName]
										if (!newProjectName) return

										const newHistoryText = this.constructor.generateHistoryText(
											hostname,
											unprefixedPageName,
										)
										this.filenameWidget.setValue(
											`${newProjectName} ${unprefixedPageName} ${filenameDate}`,
										)
										this.controls.author.input.setValue(
											`${newProjectName} authors${newHistoryText}`,
										)
									},
									(/** @type {unknown} */ error) => {
										// Unless there is something wrong with uploading, always resolve - this
										// functionality is non-essential.
										if (error instanceof Error && error.message === 'badUpload') {
											throw error.cause
										}
									},
								)
						}
					} else {
						// this.preset === 'mediawikiScreenshot'
						this.filenameWidget.setValue(`MediaWiki ${filenameDate}`)
						const description = 'Screenshot of MediaWiki'
						this.descriptionWidget.setValue(description)
						this.defaultDescription = description
						this.controls.source.input.setValue('Screenshot')
						this.controls.author.input.setValue(`[[Special:Version|MediaWiki contributors]]`)
						this.controls.license.input.setValue('{{MediaWiki-screenshot}}')
						this.categoriesWidget.addTag('MediaWiki screenshots')
					}
					break
				}

				case 'ownWork': {
					this.controls.source.input.setValue(this.upload.config.format.ownwork)
					this.controls.author.input.setValue(this.upload.getDefaultUser())
					this.controls.license.input.setValue(this.upload.config.format.license)
					break
				}
			}

			const omitted = this.isInfoFormOmitted()
			const addedInputsDisabled = this.areAddedInputsDisabled()
			this.filenameWidget.setDisabled(omitted)
			this.descriptionWidget.setDisabled(omitted)
			this.categoriesWidget.setDisabled(omitted)
			this.dateWidget.setDisabled(omitted)
			this.controls.source.input.setDisabled(omitted || addedInputsDisabled)
			this.controls.author.input.setDisabled(omitted || addedInputsDisabled)
			this.controls.license.input.setDisabled(omitted || addedInputsDisabled)

			deferred.catch(() => {
				// Hack to reenable the upload action after an error
				this.onUploadFormChange()
			})

			// If the promise failed, return the failed promise, not catched
			return deferred
		}

		/**
		 * Native method that gets last modified date from file.
		 *
		 * We make the last modified date to use UTC to make it precise and avoid leaking the user's
		 * timezone. This is for screenshots and files on the computer; we keep the original behavior for
		 * EXIF.
		 *
		 * See also
		 * {@link ForeignStructuredUploadBookletLayout#getExactDateFromLastModified getExactDateFromLastModified}.
		 *
		 * @param {File} [file]
		 * @returns {string|undefined} Last modified date from file
		 * @see
		 *   https://doc.wikimedia.org/mediawiki-core/master/js/mw.ForeignStructuredUpload.BookletLayout.html#getDateFromLastModified
		 * @protected
		 * @override
		 */
		getDateFromLastModified(file) {
			if (file?.lastModified) {
				return moment(file.lastModified).utc().format('YYYY-MM-DD')
			}
		}

		/**
		 * Get the last modified date from file in UTC, including hours, minutes, and seconds.
		 *
		 * See also
		 * {@link ForeignStructuredUploadBookletLayout#getDateFromLastModified getDateFromLastModified}.
		 *
		 * @param {File} file
		 * @returns {string|undefined} Last modified date from file
		 * @protected
		 */
		getExactDateFromLastModified(file) {
			if (file.lastModified) {
				return moment(file.lastModified).utc().format('YYYY-MM-DD HH-mm-ss')
			}
		}

		/**
		 * Native method that gets the page text from the
		 * {@link mw.ForeignStructuredUpload.BookletLayout#infoForm information form}.
		 *
		 * @returns {string}
		 * @see
		 *   https://doc.wikimedia.org/mediawiki-core/master/js/mw.ForeignStructuredUpload.BookletLayout.html#getText
		 * @protected
		 * @override
		 */
		getText() {
			this.upload.setSource(this.controls.source.input.getValue())
			this.upload.setUser(this.controls.author.input.getValue())
			this.upload.setLicense(this.controls.license.input.getValue())

			// Here goes overriden
			// mediawiki/resources/src/mediawiki.ForeignStructuredUpload.BookletLayout/BookletLayout.js
			const currentDescription = this.descriptionWidget.getValue()
			const language =
				this.defaultDescription !== undefined && currentDescription === this.defaultDescription
					? 'en'
					: mw.config.get('wgContentLanguage')
			const categories = this.categoriesWidget.getItems().map((item) => item.data)
			this.upload.clearDescriptions()
			this.upload.addDescription(language, currentDescription)
			this.upload.setDate(this.dateWidget.getValue())
			this.upload.clearCategories()
			this.upload.addCategories(categories)

			return this.upload.getText()
		}

		/**
		 * Native method that saves the stash finalizes upload. Uses
		 * {@link mw.Upload.ForeignStructuredUpload#getFilename getFilename}, and
		 * {@link ForeignStructuredUploadClass#getText getText} to get details from the form.
		 *
		 * @returns {JQuery.Promise<void>}
		 * @see
		 *   https://doc.wikimedia.org/mediawiki-core/master/js/mw.ForeignStructuredUpload.BookletLayout.html#saveFile
		 * @protected
		 * @override
		 */
		saveFile() {
			this.categoriesWidget.addTag('Uploaded with Convenient Discussions')

			const promise = super.saveFile()
			promise.catch(() => {
				if (this.isInfoFormOmitted()) {
					this.cancelUpload()
				}
			})

			// If the promise failed, return the failed promise, not catched
			return promise
		}

		/**
		 * Cancel the upload. (It's our own method - it's not in the parent class.)
		 */
		cancelUpload() {
			this.onUploadFormChange()
			this.setPage('upload')
		}

		/**
		 * Clear the values of the information form fields. Unlike the original dialog, we don't clear the
		 * upload form, including the file input, when the user presses "Back". We don't clear the date
		 * too. In the original dialog, there is not much to select on the first page apart from the file,
		 * so clearing the file input would make sense there.
		 *
		 * @see
		 *   https://doc.wikimedia.org/mediawiki-core/master/js/mw.ForeignStructuredUpload.BookletLayout.html#clear
		 * @protected
		 * @override
		 */
		clear() {
			// No idea how .setValidityFlag(true) is helpful; borrowed it from
			// mw.Upload.BookletLayout.prototype.clear. When we clear the fields that were filled in (e.g.
			// by choosing the "Own work" preset, pressing "Upload", then pressing "Back", then choosing "No
			// preset", then pressing "Upload" again), they end up invalid anyway.
			this.progressBarWidget.setProgress(0)
			this.filenameWidget.setValue('').setValidityFlag(true)
			this.descriptionWidget.setValue('').setValidityFlag(true)
			this.defaultDescription = undefined
			this.categoriesWidget.setValue([])
			if (!this.dateWidget.getValue()) {
				this.dateWidget.setValidityFlag(true)
			}

			const controlsTyped =
				/** @type {ControlTypesByName<UploadDialogControlTypes> | undefined} */ (this.controls)
			if (!controlsTyped) return

			// Clear the fields we added as well. We add them on the "setup" step, so they aren't there
			// when .clear() initially runs.
			controlsTyped.source.input.setValue('').setValidityFlag(true)
			controlsTyped.author.input.setValue('').setValidityFlag(true)
			controlsTyped.license.input.setValue('').setValidityFlag(true)
		}

		/**
		 * Generate the end part of text for the author input, linking page history.
		 *
		 * @param {string} hostname
		 * @param {string} pageName
		 * @returns {string}
		 * @protected
		 */
		static generateHistoryText(hostname, pageName) {
			if (
				!pageName ||
				// Don't link the history page for Special pages
				(hostname === location.hostname && mw.Title.newFromText(pageName)?.getNamespaceId() === -1)
			) {
				return ''
			}
			const path = mw.util.getUrl(pageName, {
				action: 'history',
				offset: generateFixedPosTimestamp(
					new Date(),
					String(new Date().getUTCSeconds()).padStart(2, '0'),
				),
			})
			const link = `https://${hostname}${path}`

			return `, see the [${link} page history]`
		}

		/**
		 * Get the template markup for the hostname of a screenshot.
		 *
		 * @param {string} hostname
		 * @returns {string}
		 */
		static getTemplateForHostname(hostname) {
			return (
				/** @type {[RegExp, string][]} */ ([
					[/^(.+)\.wikipedia.org$/, `{{Wikipedia-screenshot%s}}`],

					// Language codes aren't supported on most templates, but they may become supported at some
					// point
					[/^(.+)\.wiktionary.org$/, `{{Wiktionary-screenshot%s}}`],
					[/^(.+)\.wikiquote.org$/, `{{Wikiquote-screenshot%s}}`],
					[/^(.+)\.wikiversity.org$/, `{{Wikiversity-screenshot%s}}`],

					// https://wikisource.org/ exists, so the subdomain is not necessary
					[/^(?:(.+)\.)?wikisource.org$/, `{{Wikisource-screenshot%s}}`],

					[/^(.+)\.wikivoyage.org$/, `{{Wikivoyage-screenshot%s}}`],
				]).reduce((result, [regexp, format]) => {
					if (result) return result

					const match = hostname.match(regexp)

					return match ? format.replace('%s', match[1] ? '|' + match[1] : '') : undefined
				}, /** @type {string  | undefined} */ (undefined)) || '{{Wikimedia-screenshot}}'
			)
		}
	}

	es6ClassToOoJsClass(ForeignStructuredUploadBookletLayout)

	return ForeignStructuredUploadBookletLayout
}
