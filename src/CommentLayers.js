import PrototypeRegistry from './PrototypeRegistry';
import bootManager from './bootManager';
import commentManager from './commentManager';
import TreeWalker from './shared/TreeWalker';
import { addToArrayIfAbsent, sleep } from './shared/utils-general.js';
import { isVisible } from './utils-window';

/**
 * Base class for managing comment visual layers (underlay and overlay).
 * Handles layer creation, destruction, positioning, and styling.
 */
class CommentLayers {
  /**
   * Registry for element prototypes to reuse instead of creating new elements from scratch.
   *
   * @type {PrototypeRegistry<{
   *   underlay: HTMLElement
   *   overlay: HTMLElement
   * }>}
   */
  static prototypes = new PrototypeRegistry();

  /**
   * Comment's underlay as a native (non-jQuery) element.
   *
   * @type {HTMLElement}
   */
  underlay;

  /**
   * Comment's overlay.
   *
   * @type {HTMLElement}
   */
  overlay;

  /**
   * Line element in comment's overlay.
   *
   * @type {HTMLElement}
   */
  line;

  /**
   * Comment's side marker.
   *
   * @type {HTMLElement}
   */
  marker;

  /**
   * Comment's underlay as jQuery object.
   *
   * @type {JQuery}
   */
  $underlay;

  /**
   * Comment's overlay as jQuery object.
   *
   * @type {JQuery}
   */
  $overlay;

  /**
   * Comment's side marker as jQuery object.
   *
   * @type {JQuery}
   */
  $marker;

  /**
   * Reference to the parent comment.
   *
   * @type {import('./Comment').default}
   */
  comment;

  /**
   * The comment's layers offset.
   *
   * @type {{ top: number; left: number; width: number; height: number } | undefined}
   */
  offset;

  /**
   * Container for the comment's layers.
   *
   * @type {Element | undefined}
   */
  container;

  /**
   * Comment underlay and menu, whose colors are animated in some events.
   *
   * @type {JQuery | undefined}
   */
  $animatedBackground;

  /**
   * Deferred object for unhighlighting animations.
   *
   * @type {JQuery.Deferred<void> | undefined}
   */
  unhighlightDeferred;

  /**
   * Create a CommentLayers instance.
   *
   * @param {import('./Comment').default} comment The parent comment.
   */
  constructor(comment) {
    this.comment = comment;
  }

  /**
   * Create the layer elements (underlay, overlay, line, marker).
   * Uses template method pattern - subclasses can override getOverlayPrototype() for customization.
   */
  create() {
    // Create underlay (same for all comment types)
    this.underlay = CommentLayers.prototypes.get('underlay');
    commentManager.underlays.push(this.underlay);

    // Create overlay (may be customized by subclasses)
    this.overlay = this.getOverlayPrototype();
    this.line = /** @type {HTMLElement} */ (this.overlay.firstChild);
    this.marker = /** @type {HTMLElement} */ (
      /** @type {HTMLElement} */ (this.overlay.firstChild).nextSibling
    );

    this.updateStyles(true);

    // Create jQuery wrappers
    this.$underlay = $(this.underlay);
    this.$overlay = $(this.overlay);
    this.$marker = $(this.marker);

    // Allow subclasses to set up additional elements
    this.setupAdditionalElements();
  }

  /**
   * Get the overlay prototype for this comment type.
   * Subclasses can override this to provide custom overlay elements.
   *
   * @returns {HTMLElement} The overlay prototype element.
   * @protected
   */
  getOverlayPrototype() {
    return CommentLayers.prototypes.get('overlay');
  }

  /**
   * Set up additional elements after basic layers are created.
   * Subclasses can override this to add custom elements and event listeners.
   *
   * @protected
   */
  setupAdditionalElements() {
    // Base implementation - no additional elements
  }

  /**
   * Destroy the layer elements and clean up references.
   */
  destroy() {
    this.underlay.remove();
    this.overlay.remove();

    // Note: Properties are set to undefined for cleanup, but TypeScript expects them to always exist
    // This is acceptable since destroy() should only be called when the comment is being removed
    /** @type {any} */ (this).underlay = undefined;
    /** @type {any} */ (this).overlay = undefined;
    /** @type {any} */ (this).line = undefined;
    /** @type {any} */ (this).marker = undefined;
    /** @type {any} */ (this).$underlay = undefined;
    /** @type {any} */ (this).$overlay = undefined;
    /** @type {any} */ (this).$marker = undefined;
  }

  /**
   * Update layer styles and positioning.
   * This method should be overridden by subclasses for specific styling needs.
   *
   * @param {boolean} wereJustCreated Whether the layers were just created.
   */
  updateStyles(wereJustCreated = false) {
    // Apply common layer styling
    this.updateClassesForFlag('new', Boolean(this.comment.isNew));
    this.updateClassesForFlag('own', this.comment.isOwn);
    this.updateClassesForFlag('deleted', this.comment.isDeleted);

    if (wereJustCreated && this.comment.isLineGapped) {
      this.line.classList.add('cd-comment-overlay-line-gapCloser');
    }
  }

  /**
   * Set classes to the underlay, overlay, and other elements according to a comment flag.
   * This replicates the logic from Comment.updateClassesForFlag.
   *
   * @param {'new' | 'own' | 'target' | 'hovered' | 'deleted' | 'changed'} flag
   * @param {boolean} add
   */
  updateClassesForFlag(flag, add) {
    if (this.underlay.classList.contains(`cd-comment-underlay-${flag}`) === add) return;

    this.underlay.classList.toggle(`cd-comment-underlay-${flag}`, add);
    this.overlay.classList.toggle(`cd-comment-overlay-${flag}`, add);

    if (flag === 'deleted') {
      this.comment.actions?.replyButton?.setDisabled(add);
      this.comment.actions?.editButton?.setDisabled(add);
    }

    if (flag === 'hovered' && !add && /** @type {any} */ (this).overlayInnerWrapper) {
      /** @type {any} */ (this).overlayInnerWrapper.style.display = '';
    }
  }

  /**
   * Hide the comment menu. Base implementation does nothing.
   * Override in subclasses that have menu functionality.
   *
   * @param {Event} [_event] The event that triggered the hide action.
   */
  hideMenu(_event) {
    // Base implementation - no menu to hide
  }

  /**
   * Defer hiding the menu. Base implementation does nothing.
   * Override in subclasses that have menu functionality.
   *
   * @param {MouseEvent} _event The mousedown event.
   */
  deferHideMenu(_event) {
    // Base implementation - no menu to defer hiding
  }

  /**
   * Cancel the deferred menu hiding. Base implementation does nothing.
   * Override in subclasses that have menu functionality.
   */
  dontHideMenu() {
    // Base implementation - no timeout to clear
  }

  /**
   * Add the (already existent) comment's layers to the DOM.
   */
  add() {
    this.updateOffset();
    this.getContainer().append(this.underlay, this.overlay);
  }

  /**
   * _For internal use._ Transfer the `layers(Top|Left|Width|Height)` values to the style of the
   * layers.
   */
  updateOffset() {
    // The underlay can be absent if called from commentManager.maybeRedrawLayers() with redrawAll
    // set to `true`. layersOffset can be absent in some rare cases when the comment became
    // invisible.
    if (!this.offset) return;

    this.underlay.style.top = this.overlay.style.top = String(this.offset.top) + 'px';
    this.underlay.style.left = this.overlay.style.left = String(this.offset.left) + 'px';
    this.underlay.style.width = this.overlay.style.width = String(this.offset.width) + 'px';
    this.underlay.style.height = this.overlay.style.height = String(this.offset.height) + 'px';

    this.comment.toggleChildThreadsPopup?.position();
  }

  /**
   * Calculate the underlay and overlay offset and set it to the `layersOffset` property.
   *
   * @param {object} [options]
   * @returns {boolean | undefined} Was the comment moved. `undefined` if it is invisible.
   */
  computeOffset(options = {}) {
    const containerOffset = this.getContainerOffset();
    if (!containerOffset) return;

    // eslint-disable-next-line no-one-time-vars/no-one-time-vars
    const wasMoved = this.comment.getOffset({
      ...options,
      considerFloating: true,
      set: true,
    });

    if (this.comment.offset) {
      const margins = this.comment.getMargins();
      this.offset = {
        top: this.comment.offset.top - containerOffset.top,
        left: this.comment.offset.left - margins.left - containerOffset.left,
        width: this.comment.offset.right + margins.right - (this.comment.offset.left - margins.left),
        height: this.comment.offset.bottom - this.comment.offset.top,
      };
    } else {
      this.offset = undefined;
    }

    return wasMoved;
  }

  /**
   * Animate the comment's background and marker color to the provided colors. (Called from
   * {@link CommentLayers#animateBack}.)
   *
   * @param {string} markerColor
   * @param {string} backgroundColor
   * @param {() => void} [callback] Function to run when the animation is concluded.
   */
  animateToColors(markerColor, backgroundColor, callback) {
    const generateProperties = (/** @type {string} */ color) => {
      const properties = /** @type {CSSStyleDeclaration} */ ({ backgroundColor: color });

      // jquery.color module can't animate to the transparent color.
      if (properties.backgroundColor === 'rgba(0, 0, 0, 0)') {
        properties.opacity = '0';
      }

      return properties;
    };
    const propertyDefaults = {
      backgroundColor: '',
      backgroundImage: '',
      opacity: '',
    };

    this.$marker.animate(generateProperties(markerColor), 400, 'swing', () => {
      this.$marker.css(propertyDefaults);
    });

    const $background = /** @type {JQuery} */ (this.$animatedBackground);
    const layers = this;
    $background.animate(generateProperties(backgroundColor), 400, 'swing', function complete() {
      if (this !== $background.get(-1)) return;

      callback?.();
      // Check if this is a CompactCommentLayers instance by checking for $overlayGradient property
      $background.add(
        /** @type {any} */ (layers).$overlayGradient || $()
      ).css(propertyDefaults);
    });
  }

  /**
   * Animate the comment's background and marker color back from the colors of a given comment flag.
   *
   * @param {'new' | 'own' | 'target' | 'hovered' | 'deleted' | 'changed'} flag
   * @param {() => void} [callback]
   */
  animateBack(flag, callback) {
    if (!this.$underlay.parent().length) {
      callback?.();

      return;
    }

    // Get the current colors
    // eslint-disable-next-line no-one-time-vars/no-one-time-vars
    const initialMarkerColor = this.$marker.css('background-color');
    const initialBackgroundColor = this.$underlay.css('background-color');

    // Reset the classes that produce these colors
    this.updateClassesForFlag(flag, false);

    // Get the final (destination) colors
    // eslint-disable-next-line no-one-time-vars/no-one-time-vars
    const finalMarkerColor = this.$marker.css('background-color');
    let finalBackgroundColor = this.$underlay.css('background-color');

    // That's basically if the flash color is green (when a comment is changed after an edit) and
    // the comment itself is green. We animate to transparent, then set green back, so that there is
    // any animation at all.
    if (finalBackgroundColor === initialBackgroundColor) {
      finalBackgroundColor = 'rgba(0, 0, 0, 0)';
    }

    // Set back the colors previously produced by classes
    this.$marker.css({
      backgroundColor: initialMarkerColor,
      opacity: 1,
    });
    /** @type {JQuery} */ (this.$animatedBackground).css({
      backgroundColor: initialBackgroundColor,
    });
    // Check if this is a CompactCommentLayers instance by checking for $overlayGradient property
    if (/** @type {any} */ (this).$overlayGradient) {
      /** @type {any} */ (this).$overlayGradient.css({ backgroundImage: 'none' });
    }

    this.animateToColors(finalMarkerColor, finalBackgroundColor, callback);
  }

  /**
   * Change the comment's background and marker color to a color of the provided comment flag for
   * the given number of milliseconds, then smoothly change it back.
   *
   * @param {'new' | 'own' | 'target' | 'hovered' | 'deleted' | 'changed'} flag
   * @param {number} delay
   * @param {() => void} [callback]
   */
  flash(flag, delay, callback) {
    this.comment.configureLayers();
    if (!this.comment.layers) {
      callback?.();

      return;
    }

    /**
     * Comment underlay and menu, whose colors are animated in some events.
     *
     * @type {JQuery|undefined}
     */
    // Check if this is a CompactCommentLayers instance by checking for $overlayMenu property
    this.$animatedBackground = this.$underlay.add(
      /** @type {any} */ (this).$overlayMenu || $()
    );

    // Reset animations and colors
    this.$animatedBackground.add(this.$marker).stop(true, true);

    this.updateClassesForFlag(flag, true);

    // If there was an animation scheduled, cancel it
    this.unhighlightDeferred?.reject();

    this.unhighlightDeferred = $.Deferred();
    this.unhighlightDeferred.then(() => {
      this.animateBack(flag, callback);
    });

    sleep(delay).then(() => this.unhighlightDeferred?.resolve());
  }

  /**
   * @typedef {object} ContainerOffset
   * @property {number} top Top offset.
   * @property {number} left Left offset.
   * @memberof CommentLayers
   * @inner
   */

  /**
   * _For internal use._ Get the top and left offset of the layers container.
   *
   * @returns {ContainerOffset | undefined}
   */
  getContainerOffset() {
    const container = this.getContainer();
    if (!container.cdCachedLayersContainerOffset || container.cdCouldHaveMoved) {
      const rect = container.getBoundingClientRect();
      if (!isVisible(container)) return;

      container.cdCouldHaveMoved = false;
      container.cdCachedLayersContainerOffset = {
        top: rect.top + window.scrollY,
        left: rect.left + window.scrollX,
      };
    }

    return container.cdCachedLayersContainerOffset;
  }

  /**
   * _For internal use._ Get and sometimes create the container for the comment's underlay and
   * overlay.
   *
   * @returns {Element}
   */
  getContainer() {
    if (this.container === undefined) {
      let offsetParent;

      const treeWalker = new TreeWalker(
        document.body,
        undefined,
        true,

        // Start with the first or last element dependent on which is higher in the DOM hierarchy in
        // terms of nesting level. There were issues with RTL in LTR (and vice versa) when we
        // started with the first element, see
        // https://github.com/jwbth/convenient-discussions/commit/9fcad9226a7019d6a643d7b17f1e824657302ebd.
        // On the other hand, if we start with the first/last element, we get can in trouble when
        // the start/end of the comment is inside a container while the end/start is not. A good
        // example that combines both cases (press "up" on the "comments" "These images are too
        // monochrome" and "So my suggestion is just, to..."):
        // https://en.wikipedia.org/w/index.php?title=Wikipedia:Village_pump_(technical)&oldid=1217857130#c-Example-20240401111100-Indented_tables.
        // This is a error, of course, that quoted comments are treated as real, but we can't do
        // anything here.
        this.comment.elements.length === 1 ||
        this.comment.parser.getNestingLevel(this.comment.elements[0]) <=
        this.comment.parser.getNestingLevel(this.comment.elements[this.comment.elements.length - 1])
          ? this.comment.elements[0]
          : this.comment.elements[this.comment.elements.length - 1]
      );

      while (treeWalker.parentNode()) {
        const node = treeWalker.currentNode;

        // These elements have `position: relative` for the purpose we know.
        if (node.classList.contains('cd-connectToPreviousItem')) continue;

        let style = node.cdStyle;
        if (!style) {
          // window.getComputedStyle is expensive, so we save the result to the node's property.
          style = window.getComputedStyle(node);
          node.cdStyle = style;
        }
        const classList = new Set(Array.from(node.classList));
        if (
          ['absolute', 'relative'].includes(style.position) ||
          (
            node !== bootManager.$content[0] &&
            (classList.has('mw-content-ltr') || classList.has('mw-content-rtl'))
          )
        ) {
          offsetParent = node;
        }
        if (
          style.backgroundColor.includes('rgb(') ||
          (style.backgroundImage !== 'none' && !offsetParent)
        ) {
          offsetParent = node;
          offsetParent.classList.add('cd-commentLayersContainer-parent-relative');
        }
        if (offsetParent) break;
      }
      offsetParent ??= document.body;
      offsetParent.classList.add('cd-commentLayersContainer-parent');
      let container = /** @type {HTMLElement} */ (offsetParent.firstElementChild);
      if (!container.classList.contains('cd-commentLayersContainer')) {
        container = document.createElement('div');
        container.classList.add('cd-commentLayersContainer');
        offsetParent.insertBefore(container, offsetParent.firstChild);

        container.cdIsTopLayersContainer = !container.parentElement?.parentElement?.closest(
          '.cd-commentLayersContainer-parent'
        );
      }
      this.container = container;

      addToArrayIfAbsent(commentManager.layersContainers, container);
    }

    return this.container;
  }

  /**
   * _For internal use._ Create element prototypes to reuse them instead of creating new elements
   * from scratch (which is more expensive).
   * Creates shared prototypes (underlay, overlay) that are common to all comment types.
   */
  static initPrototypes() {
    this.prototypes = new PrototypeRegistry();

    // Create shared layer elements (underlay, overlay)
    const commentUnderlay = document.createElement('div');
    commentUnderlay.className = 'cd-comment-underlay';

    const commentOverlay = document.createElement('div');
    commentOverlay.className = 'cd-comment-overlay';

    const overlayLine = document.createElement('div');
    overlayLine.className = 'cd-comment-overlay-line';
    commentOverlay.append(overlayLine);

    const overlayMarker = document.createElement('div');
    overlayMarker.className = 'cd-comment-overlay-marker';
    commentOverlay.append(overlayMarker);

    this.prototypes.add('underlay', commentUnderlay);
    this.prototypes.add('overlay', commentOverlay);
  }
}

export default CommentLayers;
