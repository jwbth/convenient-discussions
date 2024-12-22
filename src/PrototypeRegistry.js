/**
 * Class for keeping prototypes - skeletons of elements to be cloned instead of creating a new one
 * from scratch (which is often expensive).
 */
class PrototypeRegistry {
  elements = {};
  widgets = {};

  /**
   * Register a prototype.
   *
   * @param {string} id
   * @param {*} prototype
   */
  add(id, prototype) {
    this.elements[id] = prototype;
  }

  /**
   * Add a widget intended for creation of an object with certain characteristics (e.g. OOUI).
   *
   * @param {string} id
   * @param {() => OO.ui.Widget} widget
   */
  addWidget(id, widget) {
    this.widgets[id] = widget;
  }

  /**
   * Get a prototype or an instance of a widget.
   *
   * @param {string} id
   * @returns {HTMLElement}
   */
  get(id) {
    return this.elements[id].cloneNode(true) || this.widgets[id]().$element[0];
  }

  /**
   * Get a widget.
   *
   * @param {string} id
   * @returns {() => OO.ui.Widget}
   */
  getWidget(id) {
    return this.widgets[id];
  }
}

export default PrototypeRegistry;
