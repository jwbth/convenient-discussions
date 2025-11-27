import ForeignStructuredUploadBookletLayout from './ForeignStructuredUploadBookletLayout'
import ProcessDialogMixin from './ProcessDialogMixin'
import cd from './loader/cd'
import CdError from './shared/CdError'
import { es6ClassToOoJsClass, mixInClass } from './utils-oojs'

/**
 * @class Upload
 * @memberof mw
 * @see https://doc.wikimedia.org/mediawiki-core/master/js/mw.Upload.html
 */

/**
 * @class Dialog
 * @memberof mw.Upload
 * @see https://doc.wikimedia.org/mediawiki-core/master/js/mw.Upload.Dialog.html
 */

/**
 * Class that extends {@link mw.Upload.Dialog} and adds some logic we need. Uses
 * {@link ForeignStructuredUploadBookletLayout}, which in turn uses {@link ForeignStructuredUpload}.
 */
class UploadDialog extends mixInClass(
	/** @type {typeof mw.Upload.Dialog<typeof ForeignStructuredUploadBookletLayout>} */ (
		mw.Upload.Dialog
	),
	ProcessDialogMixin
) {
	/**
	 * Create an upload dialog.
	 *
	 * @param {object} [config]
	 */
	constructor(config = {}) {
		super(
			/** @type {mw.Upload.Dialog.Config<typeof ForeignStructuredUploadBookletLayout>} */ ({
				bookletClass: ForeignStructuredUploadBookletLayout,
				booklet: {
					target: mw.config.get('wgServerName') === 'commons.wikimedia.org' ? 'local' : 'shared',
				},
				classes: ['cd-uploadDialog'],
				...config,
			})
		)
	}

	/**
	 * OOUI native method that returns a "setup" process which is used to set up a window for use in a
	 * particular context, based on the `data` argument.
	 *
	 * We load some stuff in here and modify the booklet's behavior (we can't do that in
	 * {@link ForeignStructuredUploadBookletLayout#initialize} because we need some data loaded
	 * first).
	 *
	 * @override
	 * @param {object} data Dialog opening data
	 * @param {import('./CommentForm').default} data.commentForm
	 * @param {File} [data.file]
	 * @returns {OO.ui.Process}
	 * @see https://doc.wikimedia.org/oojs-ui/master/js/OO.ui.ProcessDialog.html#getSetupProcess
	 * @see https://www.mediawiki.org/wiki/OOUI/Windows#Window_lifecycle
	 * @ignore
	 */
	getSetupProcess(data) {
		// This script is optional and used to improve description field values by using correct project
		// names and prefixes. With it, `wikt:fr:` will translate into `French Wiktionary` and
		// `fr.wiktionary.org` will translate into `wikt:fr:`.
		mw.loader.load(
			'https://en.wikipedia.org/w/index.php?title=User:Jack_who_built_the_house/getUrlFromInterwikiLink.js&action=raw&ctype=text/javascript'
		)

		const projectNameMsgName = 'project-localized-name-' + mw.config.get('wgDBname')
		const messagesPromise = cd.getApi().loadMessagesIfMissing([
			projectNameMsgName,

			// "I agree to irrevocably release this file under CC BY-SA 4.0"
			'upload-form-label-own-work-message-commons',

			// "Must contain a valid copyright tag"
			'mwe-upwiz-license-custom-explain',
			'mwe-upwiz-license-custom-url',
		])
		const enProjectNamePromise =
			cd.g.userLanguage === 'en'
				? undefined
				: cd.getApi().getMessages(projectNameMsgName, { amlang: 'en' })

		return super.getSetupProcess(data).next(async () => {
			let enProjectName
			try {
				await messagesPromise
				enProjectName =
					(await enProjectNamePromise)?.[projectNameMsgName] || cd.mws(projectNameMsgName)
			} catch {
				// Empty
			}

			data.commentForm.popPending()

			// For some reason there is no handling of network errors; the dialog just outputs "http".
			if (
				messagesPromise.state() === 'rejected' ||
				this.uploadBooklet.upload.getApi().state() === 'rejected'
			) {
				this.handleError(new CdError(), 'cf-error-uploadimage', false)

				return
			}

			this.uploadBooklet
				.on('changeSteps', this.updateActionLabels)
				.on('submitUpload', () => this.executeAction('upload'))
			this.uploadBooklet.setup(data.file, enProjectName)
		})
	}

	/**
	 * OOUI native method that returns a "ready" process which is used to ready a window for use in a
	 * particular context.
	 *
	 * We focus the title input here.
	 *
	 * @override
	 * @returns {OO.ui.Process}
	 * @see https://doc.wikimedia.org/oojs-ui/master/js/OO.ui.ProcessDialog.html#getReadyProcess
	 * @see https://www.mediawiki.org/wiki/OOUI/Windows#Window_lifecycle
	 * @ignore
	 */
	getReadyProcess() {
		return super.getReadyProcess().next(() => {
			this.uploadBooklet.controls.title.input.focus()
		})
	}

	/**
	 * OOUI native method that returns a process for taking action.
	 *
	 * We alter the handling of the `'upload'` and `'cancelupload'` actions.
	 *
	 * @override
	 * @param {string} action Symbolic name of the action.
	 * @returns {OO.ui.Process}
	 * @see https://doc.wikimedia.org/oojs-ui/master/js/OO.ui.ProcessDialog.html#getActionProcess
	 * @ignore
	 */
	getActionProcess(action) {
		if (action === 'upload') {
			// @ts-expect-error: We need this protected method here
			let process = new OO.ui.Process(this.uploadBooklet.uploadFile())
			if (this.autosave) {
				process = process.next(() => {
					// eslint-disable-next-line no-one-time-vars/no-one-time-vars
					const promise = this.executeAction('save').fail(() => {
						// Reset the ability
						// @ts-expect-error: We need this protected method here
						this.uploadBooklet.onInfoFormChange()
					})
					this.actions.setAbilities({ save: false })

					return promise
				})
			}

			return process
		} else if (action === 'cancelupload') {
			// The upstream dialog calls .initialize() here which clears all inputs including the file.
			// We don't want that.
			this.uploadBooklet.cancelUpload()

			return new OO.ui.Process(() => {})
		}

		return super.getActionProcess(action)
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
		return 620
	}

	/**
	 * Update the labels of actions.
	 *
	 * @param {boolean} autosave Whether to save the upload when clicking the main button.
	 * @protected
	 */
	updateActionLabels = (autosave) => {
		this.autosave = autosave
		if (this.autosave) {
			this.actions.get({ actions: ['upload', 'save'] }).forEach((action) => {
				action.setLabel(cd.s('ud-uploadandsave'))
			})
		} else {
			this.actions.get({ actions: ['upload', 'save'] }).forEach((action) => {
				action.setLabel(cd.mws(`upload-dialog-button-${action.getAction()}`))
			})
		}
	}

	/**
	 * @class Error
	 * @memberof OO.ui
	 * @see https://doc.wikimedia.org/oojs-ui/master/js/OO.ui.Error.html
	 */

	/**
	 * OOUI native method.
	 *
	 * Here we use a hack to hide the second identical error message that can appear since we execute
	 * two actions, not one ("Upload and save").
	 *
	 * @override
	 * @param {OO.ui.Error} errors
	 */
	showErrors(errors) {
		this.hideErrors()

		super.showErrors(errors)
	}
}

es6ClassToOoJsClass(UploadDialog)

export default UploadDialog
