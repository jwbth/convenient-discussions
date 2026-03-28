import CommentLayers from './CommentLayers.js'

/**
 * Specialized layer management for spacious comments.
 * Handles spacious-specific layer positioning and styling without overlay menu.
 */
class SpaciousCommentLayers extends CommentLayers {
	// Spacious comments use the base overlay prototype and don't need additional elements
	// No overrides needed - the base implementation handles everything

	/**
	 * Update layer styles for spacious comments.
	 *
	 * @param {boolean} [wereJustCreated] Whether the layers were just created.
	 * @override
	 */
	updateStyles(wereJustCreated = false) {
		super.updateStyles(wereJustCreated)
	}
}

export default SpaciousCommentLayers
