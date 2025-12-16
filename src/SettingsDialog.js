import ProcessDialog from './ProcessDialog'
import StorageItem from './StorageItem'
import commentFormManager from './commentFormManager'
import controller from './controller'
import cd from './loader/cd'
import settings from './settings'
import { areObjectsEqual } from './shared/utils-general'
import { saveGlobalOption, saveLocalOption } from './utils-api'
import {
	createButtonControl,
	createCheckboxControl,
	createMulticheckboxControl,
	createMultitagControl,
	createNumberControl,
	createRadioControl,
	createTextControl,
	es6ClassToOoJsClass,
} from './utils-oojs'

// eslint-disable-next-line jsdoc/require-jsdoc
export default function getSettingsDialogClass() {
	/**
	 * Class used to create a settings dialog.
	 *
	 * @augments ProcessDialog
	 */
	class SettingsDialog extends ProcessDialog {
		// @ts-expect-error: https://phabricator.wikimedia.org/T358416
		static name = 'settingsDialog'
		static title = cd.s('sd-title')
		static actions = [
			{
				action: 'close',
				modes: ['settings', 'reboot', 'dataRemoved'],
				flags: ['safe', 'close'],
				disabled: true,
			},
			{
				action: 'save',
				modes: ['settings'],
				label: cd.s('sd-save'),
				flags: ['primary', 'progressive'],
				disabled: true,
			},
			{
				action: 'reset',
				modes: ['settings'],
				label: cd.s('sd-reset'),
				flags: ['destructive'],
				disabled: true,
			},
			{
				action: 'reboot',
				modes: ['reboot'],
				label: cd.s('sd-reload'),
				flags: ['primary', 'progressive'],
			},
		]
		static size = 'large'

		/**
		 * @override
		 */
		static cdKey = 'sd'

		/** @type {OO.ui.StackLayout} */
		stack

		/** @type {OO.ui.PanelLayout} */
		loadingPanel

		/** @type {OO.ui.PanelLayout} */
		settingsPanel

		/** @type {OO.ui.PanelLayout} */
		reloadPanel

		/** @type {OO.ui.PanelLayout} */
		dataDeletedPanel

		/** @type {OO.ui.BookletLayout} */
		bookletLayout

		controls =
			/** @type {Expand<ControlTypesByName<import('./settings').default['scheme']['controlTypes']>>} */ ({})

		/** @type {Partial<import('./settings').SettingsValues>} */
		loadedSettings

		/** @type {Partial<import('./settings').SettingsValues>} */
		collectedSettings

		/**
		 * Create a settings dialog.
		 *
		 * @param {string} [initialPageName]
		 * @param {string} [focusSelector]
		 */
		constructor(initialPageName, focusSelector) {
			super({ classes: ['cd-dialog-settings'] })
			this.initialPageName = initialPageName
			this.focusSelector = focusSelector
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
			return 600
		}

		/**
		 * OOUI native method that initializes window contents.
		 *
		 * @override
		 * @see https://doc.wikimedia .org/oojs-ui/master/js/OO.ui.ProcessDialog.html#initialize
		 * @see https://www.mediawiki.org/wiki/OOUI/Windows#Window_lifecycle
		 * @ignore
		 */
		initialize() {
			super.initialize()

			this.pushPending()

			this.loadingPanel = new OO.ui.PanelLayout({
				padded: true,
				expanded: false,
			})
			this.loadingPanel.$element.append($('<div>').text(cd.s('loading-ellipsis')))

			this.settingsPanel = new OO.ui.PanelLayout({
				padded: false,
				expanded: true,
			})

			this.reloadPanel = new OO.ui.PanelLayout({
				padded: true,
				expanded: false,
			})
			this.reloadPanel.$element.append(
				$('<p>').text(cd.s('sd-saved', commentFormManager.maybeGetFormDataWontBeLostString())),
			)

			this.dataDeletedPanel = new OO.ui.PanelLayout({
				padded: true,
				expanded: false,
			})
			this.dataDeletedPanel.$element.append($('<p>').text(cd.s('sd-dataremoved')))

			this.stack = new OO.ui.StackLayout({
				items: [this.loadingPanel, this.settingsPanel, this.reloadPanel, this.dataDeletedPanel],
			})

			this.$body.append(this.stack.$element)

			return this
		}

		/**
		 * OOUI native method that returns a "setup" process which is used to set up a window for use in a
		 * particular context, based on the `data` argument.
		 *
		 * @override
		 * @param {object} data Dialog opening data
		 * @param {Partial<import('./settings').SettingsValues>} data.loadedSettings Loaded settings
		 * @returns {OO.ui.Process}
		 * @see https://doc.wikimedia.org/oojs-ui/master/js/OO.ui.ProcessDialog.html#getSetupProcess
		 * @see https://www.mediawiki.org/wiki/OOUI/Windows#Window_lifecycle
		 * @ignore
		 */
		getSetupProcess({ loadedSettings }) {
			return super.getSetupProcess().next(() => {
				this.stack.setItem(this.loadingPanel)
				this.actions.setMode('settings')
				this.loadedSettings = loadedSettings
			})
		}

		/**
		 * OOUI native method that returns a "ready" process which is used to ready a window for use in a
		 * particular context, based on the `data` argument.
		 *
		 * @override
		 * @returns {OO.ui.Process}
		 * @see https://doc.wikimedia.org/oojs-ui/master/js/OO.ui.ProcessDialog.html#getReadyProcess
		 * @see https://www.mediawiki.org/wiki/OOUI/Windows#Window_lifecycle
		 * @ignore
		 */
		getReadyProcess() {
			return super.getReadyProcess().next(() => {
				// this.settings can be empty after removing the data using the relevant functionality in the
				// UI.
				if (!Object.keys(this.loadedSettings).length) {
					this.loadedSettings = settings.get()
				}

				this.renderControls(this.loadedSettings)

				this.stack.setItem(this.settingsPanel)
				this.bookletLayout.setPage(this.initialPageName || settings.scheme.ui[0].name)
				if (this.focusSelector) {
					this.$body.find(this.focusSelector).trigger('focus')
				}
				this.actions.setAbilities({ close: true })

				this.popPending()

				controller.addPreventUnloadCondition('dialog', () => this.isUnsaved())
			})
		}

		/**
		 * OOUI native method that returns a process for taking action.
		 *
		 * @override
		 * @param {string} action Symbolic name of the action.
		 * @returns {OO.ui.Process}
		 * @see https://doc.wikimedia.org/oojs-ui/master/js/OO.ui.ProcessDialog.html#getActionProcess
		 * @ignore
		 */
		getActionProcess(action) {
			switch (action) {
				case 'save': {
					return new OO.ui.Process(async () => {
						this.pushPending()

						try {
							await settings.save(this.collectSettings())
							settings.set(settings)
						} catch (error) {
							this.handleError(error, 'error-settings-save', true)

							return
						}

						controller.removePreventUnloadCondition('dialog')

						this.stack.setItem(this.reloadPanel)
						this.actions.setMode('reboot')

						this.popPending()
					})
				}
				case 'reboot': {
					return new OO.ui.Process(async () => {
						this.close()
						if (!(await controller.rebootPage())) {
							location.reload()
						}
					})
				}
				case 'close': {
					return new OO.ui.Process(() => {
						this.confirmClose()
					})
				}
				case 'reset': {
					return new OO.ui.Process(() => {
						if (confirm(cd.s('sd-reset-confirm'))) {
							this.renderControls(settings.scheme.default)
							this.bookletLayout.setPage(
								/** @type {string} */ (this.bookletLayout.getCurrentPageName()),
							)
						}
					})
				}
				// No default
			}

			return super.getActionProcess(action)
		}

		/**
		 * Create widget fields with states of controls set according to setting values.
		 *
		 * @param {Partial<import('./settings').SettingsValues>} settingValues Values of settings
		 *   according to which to set the states of controls.
		 * @returns {OO.ui.PageLayout[]}
		 * @protected
		 */
		createPages(settingValues) {
			// eslint-disable-next-line no-one-time-vars/no-one-time-vars
			const pages = settings.scheme.ui.map((pageData) => {
				const $fields = pageData.controls.map((data) => {
					const name = data.name

					switch (data.type) {
						case 'checkbox': {
							const nameTyped = /** @type {import('./settings').OnlySettingsOfType<'checkbox'>} */ (
								name
							)
							this.controls[nameTyped] = createCheckboxControl({
								.../** @type {import('./utils-oojs').CheckboxControlOptions} */ (data),
								selected: /** @type {boolean} */ (settingValues[nameTyped]),
							})
							this.controls[nameTyped].input.on('change', this.updateAbilities)
							break
						}

						case 'radio': {
							const nameTyped = /** @type {import('./settings').OnlySettingsOfType<'radio'>} */ (
								name
							)
							this.controls[nameTyped] = createRadioControl({
								.../** @type {import('./utils-oojs').RadioControlOptions} */ (data),
								selected: /** @type {string} */ (settingValues[nameTyped]),
							})
							this.controls[nameTyped].input.on('select', this.updateAbilities)
							break
						}

						case 'text': {
							const nameTyped = /** @type {import('./settings').OnlySettingsOfType<'text'>} */ (
								name
							)
							this.controls[nameTyped] = createTextControl({
								.../** @type {import('./utils-oojs').TextControlOptions} */ (data),
								value: /** @type {string} */ (settingValues[nameTyped]),
							})
							this.controls[nameTyped].input.on('change', this.updateAbilities)
							break
						}

						case 'number': {
							const nameTyped = /** @type {import('./settings').OnlySettingsOfType<'number'>} */ (
								name
							)
							this.controls[nameTyped] = createNumberControl({
								.../** @type {import('./utils-oojs').NumberControlOptions} */ (data),
								value: /** @type {string} */ (/** @type {unknown} */ (settingValues[nameTyped])),
							})
							this.controls[nameTyped].input.on('change', this.updateAbilities)
							break
						}

						case 'multicheckbox': {
							const nameTyped =
								/** @type {import('./settings').OnlySettingsOfType<'multicheckbox'>} */ (name)
							this.controls[nameTyped] = createMulticheckboxControl({
								.../** @type {import('./utils-oojs').MulticheckboxControlOptions} */ (data),
								selected: /** @type {string[]} */ (settingValues[nameTyped]),
							})
							this.controls[nameTyped].input.on('select', this.updateAbilities)
							break
						}

						case 'multitag': {
							const nameTyped = /** @type {import('./settings').OnlySettingsOfType<'multitag'>} */ (
								name
							)
							this.controls[nameTyped] = createMultitagControl({
								.../** @type {import('./utils-oojs').MultitagControlOptions} */ (data),
								selected: /** @type {string[]} */ (settingValues[nameTyped]),
							})
							this.controls[nameTyped].input.on('change', this.updateAbilities)
							break
						}

						case 'button': {
							const nameTyped = /** @type {import('./settings').OnlySettingsOfType<'button'>} */ (
								name
							)
							this.controls[nameTyped] = createButtonControl({
								.../** @type {import('./utils-oojs').ButtonControlOptions} */ (data),
							})
							break
						}
					}

					return this.controls[name].field.$element
				})

				// eslint-disable-next-line jsdoc/require-jsdoc
				return new (es6ClassToOoJsClass(
					/**
					 *
					 */
					class extends OO.ui.PageLayout {
						// eslint-disable-next-line jsdoc/require-jsdoc
						constructor() {
							super(pageData.name)
							this.$element.append($fields)
						}

						/**
						 * @override
						 */
						setupOutlineItem() {
							const outlineItem = /** @type {OO.ui.OutlineOptionWidget} */ (this.outlineItem)
							outlineItem.setLabel(pageData.label)
						}
					},
				))()
			})

			this.controls.removeData.input.connect(this, { click: this.removeData })
			this.controls.desktopNotifications.input.connect(this, {
				choose: this.onDesktopNotificationsSelectChange,
			})

			return pages
		}

		/**
		 * Render control widgets.
		 *
		 * @param {Partial<import('./settings').SettingsValues>} settingValues Values of settings
		 *   according to which to set the states of controls.
		 * @protected
		 */
		renderControls(settingValues) {
			settings.initUi()

			this.bookletLayout = new OO.ui.BookletLayout({
				outlined: true,
			})
			this.bookletLayout.addPages(this.createPages(settingValues), 0)
			this.settingsPanel.$element.empty().append(this.bookletLayout.$element)

			this.updateAbilities()
		}

		/**
		 * Get an object with settings related to states (see {@link module:settings.scheme}).
		 *
		 * @returns {Partial<import('./settings').SettingsValues>}
		 * @protected
		 */
		getStateSettings() {
			return settings.scheme.states.reduce((obj, state) => {
				obj[state] = /** @type {any} */ (this.loadedSettings[state])

				return obj
			}, /** @type {Partial<import('./settings').SettingsValues>} */ ({}))
		}

		/**
		 * Get setting values from controls.
		 *
		 * @returns {Partial<import('./settings').SettingsValues>}
		 * @protected
		 */
		collectSettings() {
			this.collectedSettings = Object.entries(this.controls).reduce(
				(settingsValues, [name, control]) => {
					const n = /** @type {keyof import('./settings').DocumentedSettingsValues} */ (name)
					/**
					 * @typedef {Partial<import('./settings').DocumentedSettingsValues>[n]} RelevantSettingType
					 */

					switch (control.type) {
						case 'checkbox': {
							const nTyped = /** @type {import('./settings').OnlySettingsOfType<'checkbox'>} */ (n)
							settingsValues[nTyped] = control.input.isSelected()
							break
						}

						case 'radio': {
							const nTyped = /** @type {import('./settings').OnlySettingsOfType<'radio'>} */ (n)
							settingsValues[nTyped] = /** @type {any} */ (
								control.input.findSelectedItem()?.getData() || settings.scheme.default[nTyped]
							)
							break
						}

						case 'text': {
							const nTyped = /** @type {import('./settings').OnlySettingsOfType<'text'>} */ (n)
							settingsValues[nTyped] = control.input.getValue()
							break
						}

						case 'number': {
							const nTyped = /** @type {import('./settings').OnlySettingsOfType<'number'>} */ (n)
							settingsValues[nTyped] = Number(control.input.getValue())
							break
						}

						case 'multicheckbox': {
							const nTyped =
								/** @type {import('./settings').OnlySettingsOfType<'multicheckbox'>} */ (n)
							settingsValues[nTyped] = /** @type {any} */ (control.input.findSelectedItemsData())
							break
						}

						case 'multitag': {
							const nTyped = /** @type {import('./settings').OnlySettingsOfType<'multitag'>} */ (n)
							settingsValues[nTyped] = (control.uiToData || ((val) => val)).call(
								null,
								/** @type {string[]} */ (control.input.getValue()),
							)
							break
						}
					}

					return settingsValues
				},
				/** @type {Partial<import('./settings').SettingsValues>} */ ({}),
			)

			return {
				...settings.scheme.default,
				...this.collectedSettings,
				...this.getStateSettings(),
				'insertButtons-altered':
					JSON.stringify(this.collectedSettings.insertButtons) !==
					JSON.stringify(settings.scheme.default.insertButtons),
			}
		}

		/**
		 * Update the control states.
		 *
		 * @protected
		 */
		updateAbilities = async () => {
			const threadsEnabled = this.controls.enableThreads.input.isSelected()
			this.controls.collapseThreads.input.setDisabled(!threadsEnabled)
			this.controls.collapseThreadsLevel.input.setDisabled(
				!threadsEnabled || !this.controls.collapseThreads.input.isSelected(),
			)
			this.controls.hideTimezone.input.setDisabled(
				this.controls.timestampFormat.input.findSelectedItem()?.getData() === 'relative',
			)
			this.controls.notifyCollapsedThreads.input.setDisabled(
				this.controls.desktopNotifications.input.findSelectedItem()?.getData() === 'none' &&
					this.controls.notifications.input.findSelectedItem()?.getData() === 'none',
			)
			this.controls.outdentLevel.input.setDisabled(!this.controls.outdent.input.isSelected())
			this.controls.showContribsLink.input.setDisabled(
				this.controls.commentDisplay.input.findSelectedItem()?.getData() !== 'spacious',
			)
			this.controls.useTemplateData.input.setDisabled(
				!(
					/** @type {import('./RadioOptionWidget').default} */ (
						this.controls.autocompleteTypes.input.findItemFromData('templates')
					).isSelected()
				),
			)

			let valid = true
			await Promise.all(
				Object.values(this.controls)
					.filter((control) => control.type === 'number')
					.map((control) => control.input.getValidity()),
			).catch(() => {
				valid = false
			})

			const collectedSettings = this.collectSettings()
			this.actions.setAbilities({
				save: !areObjectsEqual(collectedSettings, this.loadedSettings) && valid,
				reset: !areObjectsEqual(
					{ ...collectedSettings },
					{
						...settings.scheme.default,
						...settings.scheme.resetsTo,
						...this.getStateSettings(),
					},
				),
			})
		}

		/**
		 * Handler of the event of change of the desktop notifications radio select.
		 *
		 * @param {OO.ui.OptionWidget} option
		 * @protected
		 */
		onDesktopNotificationsSelectChange = (option) => {
			if (typeof Notification === 'undefined') return

			if (option.getData() !== 'none' && Notification.permission !== 'granted') {
				OO.ui.alert(cd.s('dn-grantpermission'))
				Notification.requestPermission((permission) => {
					if (permission !== 'granted') {
						this.controls.desktopNotifications.input.selectItemByData('none')
					}
				})
			}
		}

		/**
		 * Remove script data as requested by the user after confirmation.
		 *
		 * @protected
		 */
		removeData = async () => {
			if (confirm(cd.s('sd-removedata-confirm'))) {
				this.pushPending()

				try {
					await Promise.all([
						saveLocalOption(cd.g.localSettingsOptionName, null),
						saveLocalOption(cd.g.visitsOptionName, null),
						saveLocalOption(cd.g.subscriptionsOptionName, null),
						saveGlobalOption(cd.g.settingsOptionName, null),
					])
				} catch (error) {
					this.handleError(error, 'sd-error-removedata', false)

					return
				}

				new StorageItem('commentForms').removeItem()
				new StorageItem('thanks').removeItem()
				new StorageItem('seenRenderedChanges').removeItem()
				new StorageItem('collapsedThreads').removeItem()
				new StorageItem('mutedUsers').removeItem()

				this.stack.setItem(this.dataDeletedPanel)
				this.actions.setMode('dataRemoved')

				this.popPending()
			}
		}
	}

	es6ClassToOoJsClass(SettingsDialog)

	return SettingsDialog
}
