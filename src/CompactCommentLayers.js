import CommentLayers from './CommentLayers.js';

/**
 * Specialized layer management for compact comments.
 * Handles compact-specific layer positioning and overlay menu management.
 */
class CompactCommentLayers extends CommentLayers {
  /**
   * Is the comment currently being hovered over.
   *
   * @type {boolean}
   */
  isHovered = false;

  /**
   * Was the overlay menu manually hidden by the user.
   *
   * @type {boolean}
   */
  wasMenuHidden = false;

  /**
   * Create a CompactCommentLayers instance.
   *
   * @param {import('./CompactComment').default} comment The parent comment.
   */

  /**
   * Inner wrapper in comment's overlay.
   *
   * @type {HTMLElement | undefined}
   */
  overlayInnerWrapper;

  /**
   * Gradient element in comment's overlay.
   *
   * @type {HTMLElement | undefined}
   */
  overlayGradient;

  /**
   * Menu element in comment's overlay.
   *
   * @type {HTMLElement | undefined}
   */
  overlayMenu;

  /**
   * Menu element in the comment's overlay as jQuery object.
   *
   * @type {JQuery | undefined}
   */
  $overlayMenu;

  /**
   * Gradient element in the comment's overlay as jQuery object.
   *
   * @type {JQuery | undefined}
   */
  $overlayGradient;

  /**
   * Timeout ID for hiding the menu.
   *
   * @type {number | undefined}
   */
  hideMenuTimeout;

  /**
   * Get the compact-specific overlay prototype.
   *
   * @returns {HTMLElement} The compact overlay prototype element.
   * @protected
   * @override
   */
  getOverlayPrototype() {
    return CompactCommentLayers.prototypes.get('overlay');
  }

  /**
   * Set up compact-specific overlay menu elements after basic layers are created.
   *
   * @protected
   * @override
   */
  setupAdditionalElements() {
    // Set up compact-specific overlay menu elements
    this.overlayInnerWrapper = /** @type {HTMLElement} */ (this.overlay.lastChild);
    this.overlayGradient = /** @type {HTMLElement} */ (this.overlayInnerWrapper.firstChild);
    this.overlayMenu = /** @type {HTMLElement} */ (this.overlayInnerWrapper.lastChild);

    // Create jQuery wrappers for overlay menu elements
    this.$overlayMenu = /** @type {JQuery} */ ($(this.overlayMenu));
    this.$overlayGradient = /** @type {JQuery} */ ($(this.overlayGradient));

    // Set up event listeners for menu management
    this.overlayInnerWrapper.addEventListener('contextmenu', this.hideMenu);
    this.overlayInnerWrapper.addEventListener('mousedown', this.deferHideMenu);
    this.overlayInnerWrapper.addEventListener('mouseup', this.dontHideMenu);
  }

  /**
   * Update layer styles for compact comments.
   * Compact comments have specific positioning and styling requirements.
   *
   * @param {boolean} wereJustCreated Whether the layers were just created.
   * @override
   */
  updateStyles(wereJustCreated = false) {
    // Call parent updateStyles for common styling
    super.updateStyles(wereJustCreated);

    // Compact-specific styling would go here
    // For now, the base implementation handles the common styling needs
  }

  /**
   * Show the overlay menu.
   */
  showMenu() {
    if (this.overlayInnerWrapper) {
      this.overlayInnerWrapper.style.display = '';
    }
  }

  /**
   * Hide the overlay menu.
   *
   * @param {Event} [event] The event that triggered the hide action.
   * @override
   */
  hideMenu = (event) => {
    if (!this.overlayInnerWrapper) return;

    event?.preventDefault();
    this.overlayInnerWrapper.style.display = 'none';
    this.comment.wasMenuHidden = true;
  };

  /**
   * Defer hiding the menu after a timeout.
   *
   * @param {MouseEvent} event The mousedown event.
   * @override
   */
  deferHideMenu = (event) => {
    // Ignore everything other than left button clicks.
    if (event.button !== 0) return;

    this.hideMenuTimeout = setTimeout(this.hideMenu, 1200);
  };

  /**
   * Cancel the deferred menu hiding.
   *
   * @override
   */
  dontHideMenu = () => {
    clearTimeout(this.hideMenuTimeout);
  };

  /**
   * Destroy the layer elements and clean up references.
   *
   * @override
   */
  destroy() {
    // Clear any pending timeouts
    this.dontHideMenu();

    // Clean up compact-specific elements
    this.overlayInnerWrapper = undefined;
    this.overlayGradient = undefined;
    this.overlayMenu = undefined;
    this.$overlayMenu = undefined;
    this.$overlayGradient = undefined;

    // Call parent destroy method
    super.destroy();
  }

  /**
   * Initialize prototypes for compact comment layers.
   * Creates compact-specific overlay with menu elements.
   *
   * @override
   */
  static initPrototypes() {
    // Get the base overlay prototype and enhance it with compact-specific elements
    const baseOverlay = CommentLayers.prototypes.get('overlay');

    // Create compact-specific overlay menu elements
    const overlayInnerWrapper = document.createElement('div');
    overlayInnerWrapper.className = 'cd-comment-overlay-innerWrapper';
    baseOverlay.append(overlayInnerWrapper);

    const overlayGradient = document.createElement('div');
    overlayGradient.textContent = '\u00A0';
    overlayGradient.className = 'cd-comment-overlay-gradient';
    overlayInnerWrapper.append(overlayGradient);

    const overlayMenu = document.createElement('div');
    overlayMenu.className = 'cd-comment-overlay-menu';
    overlayInnerWrapper.append(overlayMenu);

    // Store the enhanced overlay prototype
    this.prototypes.add('overlay', baseOverlay);
  }
}

export default CompactCommentLayers;
