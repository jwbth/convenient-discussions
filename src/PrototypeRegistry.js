/**
 * Class for storing prototypes - skeletons/drafts of elements to be cloned instead of creating a
 * new one from scratch (which is often expensive).
 *
 * @template {{ [id: string]: Element }} Ids List of prototype IDs.
 */
class PrototypeRegistry {
	elements = /** @type {Ids} */ ({});

	/**
	 * Register a prototype.
	 *
	 * @param {keyof Ids} id
	 * @param {Ids[keyof Ids]} prototype
	 */
	add(id, prototype) {
		this.elements[id] = prototype;
	}

	/**
	 * Get a prototype or an instance of a widget.
	 *
	 * @template {keyof Ids} T
	 * @param {T} id
	 * @returns {Ids[T]}
	 */
	get(id) {
		return /** @type {Ids[T]}} */ (this.elements[id].cloneNode(true));
	}
}

export default PrototypeRegistry;
