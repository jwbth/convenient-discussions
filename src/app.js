/**
 * Main application entry point. This file is loaded by the loader via loadPreferablyFromDiskCache()
 * and initializes the main app.
 *
 * @module app
 */

import Comment from './Comment'
import addCommentLinks from './addCommentLinks'
import commentFormManager from './commentFormManager'
import commentManager from './commentManager'
import controller from './controller'
import { initGlobals, initTimestampTools } from './init'
import cd from './loader/cd'
import pageRegistry from './pageRegistry'
import sectionManager from './sectionManager'
import settings from './settings'
import updateChecker from './updateChecker'
import { buildEditSummary, wrapDiffBody, wrapHtml } from './utils-window'
import visits from './visits'

// Assign to cd.loader so loader can call these functions
cd.loader.app = app
cd.loader.addCommentLinks = addCommentLinks

/**
 * Main app function for talk pages.
 * Called by loader after modules are loaded.
 */
async function app() {
	initGlobals()
	initTimestampTools()

	await controller.bootTalkPage(false)
}

// Re-export init functions for backward compatibility
export { initGlobals, initTimestampTools } from './init'

// Set up API after initialization
cd.settings = settings
cd.commentForms = commentFormManager.getAll()

cd.tests.controller = controller
cd.tests.processPageInBackground = updateChecker.processPage.bind(updateChecker)
cd.tests.showSettingsDialog = settings.showDialog.bind(settings)
cd.tests.visits = visits

/**
 * Script's publicly available API. Here there are some utilities that we believe should be
 * accessible for external use.
 *
 * If you need some internal method to be available publicly, contact the script's maintainer (or
 * just make a relevant pull request).
 */
cd.api = {
	pageRegistry,
	buildEditSummary,
	wrapHtml,
	// TODO: Remove after wiki configurations are updated.
	wrap: wrapHtml,
	wrapDiffBody,

	generateCommentId: Comment.generateId.bind(Comment),
	parseCommentId: Comment.parseId.bind(Comment),
	getCommentById: commentManager.getById.bind(commentManager),
	getCommentByDtId: commentManager.getByDtId.bind(commentManager),
	getSectionById: sectionManager.getById.bind(sectionManager),
	getSectionsByHeadline: sectionManager.getByHeadline.bind(sectionManager),
	getLastActiveCommentForm: commentFormManager.getLastActive.bind(commentFormManager),
	getLastActiveAlteredCommentForm: commentFormManager.getLastActiveAltered.bind(commentFormManager),
	reloadPage: controller.rebootPage.bind(controller), // Legacy alias for rebootPage
	rebootPage: controller.rebootPage.bind(controller),
	getRootElement: controller.getRootElement.bind(controller),
}
