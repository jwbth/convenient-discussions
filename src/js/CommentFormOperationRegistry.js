/**
 * Class representing an operation registry (a storage of operations that a comment form currently
 * undergoes, such as `'load'` or `'submit'`).
 */
class CommentFormOperationRegistry {
  /**
   * Create an operation registry.
   *
   * @param {import('./CommentForm').default} commentForm
   */
  constructor(commentForm) {
    this.commentForm = commentForm;
    this.items = [];
  }

  /**
   * Add an operation to the registry.
   *
   * @param {'load'|'preview'|'viewChanges'|'submit'} type
   * @param {object} [options={}]
   * @param {boolean} [clearMessages=true] Whether to clear messages above the comment form.
   * @returns {CommentFormOperation}
   */
  add(type, options = {}, clearMessages = true) {
    const operation = new CommentFormOperation(this, type, options);
    this.items.push(operation);
    operation.open(clearMessages);
    return operation;
  }

  /**
   * Remove an operation from the registry.
   *
   * @param {CommentFormOperation} operation
   */
  remove(operation) {
    this.items.splice(this.items.indexOf(operation), 1);
  }

  /**
   * Close all registered operations.
   */
  closeAll() {
    // Use `.slice()` because `CommentFormOperation#close` also removes the operation from the
    // operation registry, this disrupting `.forEach()`.
    this.items.slice().forEach((op) => op.close());
  }

  /**
   * Find operations of the specified type in the registry.
   *
   * @param {'load'|'preview'|'viewChanges'|'submit'} type Operation type.
   * @returns {CommentFormOperation[]}
   */
  filterByType(type) {
    return this.items.filter((op) => op.getType() === type);
  }

  /**
   * Check if there are operations of the specified type in the registry.
   *
   * @param {'load'|'preview'|'viewChanges'|'submit'} type Operation type.
   * @returns {boolean}
   */
  areThere(type) {
    return Boolean(this.filterByType(type).length);
  }

  /**
   * Find operations for which the specified callback returns a truthy value.
   *
   * @param {Function} callback
   * @returns {CommentFormOperation[]}
   */
  filter(callback) {
    return this.items.filter(callback);
  }
}

/**
 * Class representing a single comment form operation.
 */
class CommentFormOperation {
  /**
   *
   * @param {CommentFormOperationRegistry} registry Operation registry.
   * @param {'load'|'preview'|'viewChanges'|'submit'} type Operation type.
   * @param {object} options
   */
  constructor(registry, type, options) {
    this.registry = registry;
    this.commentForm = registry.commentForm;
    this.type = type;
    this.options = options;
  }

  /**
   * Mark the operation as open (run after its creation).
   *
   * @param {boolean} clearMessages Whether to clear messages above the comment form.
   */
  open(clearMessages) {
    this.date = new Date();
    this.closed = false;
    this.delayed = false;

    if (this.type !== 'preview' || !this.options.isAuto) {
      if (clearMessages) {
        this.commentForm.$messageArea.empty();
      }
      this.commentForm.pushPending(
        ['load', 'submit'].includes(this.type),
        this.options.affectsHeadline
      );
    }
  }

  /**
   * Mark the operation as closed if it is not;
   * {@link CommentFormOperationRegistry#remove unregister} it. Should be done when an operation has
   * finished (either successfully or not).
   */
  close() {
    if (this.closed) return;

    this.closed = true;
    if (!(this.type === 'preview' && this.options.isAuto)) {
      this.commentForm.popPending(
        ['load', 'submit'].includes(this.type),
        this.options.affectsHeadline
      );
    }

    this.registry.remove(this);
  }

  /**
   * Mark the operation as delayed.
   */
  delay() {
    this.delayed = true;
  }

  /**
   * Unmark the operation as delayed.
   */
  undelay() {
    this.delayed = false;
  }

  /**
   * Check for conflicts of the operation with other pending operations, and if there are such,
   * {@link CommentFormOperation#close close} the operation and return `true` to abort it. The rules
   * are the following:
   * - `preview` and `viewChanges` operations may be overriden with other of one of these types
   *   (every new request replaces the old, although a new automatic preview request cannot be made
   *   while the old is pending).
   * - `submit` operations cannot be overriden (and are not checked by this function), but also
   *   don't override existing `preview` and `viewChanges` operations (so that the user gets the
   *   last autopreview even after they have sent the comment).
   *
   * For convenience, can also check for an arbitrary condition and close the operation if it is
   * `true`.
   *
   * @returns {boolean}
   */
  maybeClose() {
    if (this.closed) {
      return true;
    }
    const lastRelevantOperation = this.registry
      .filter((op) => (
        ['preview', 'viewChanges'].includes(op.getType()) &&

        // If we delete this line, then, with autopreview enabled, preview will be updated only when
        // the user stops typing.
        !op.isDelayed()
      ))
      .slice(-1)[0];
    if (lastRelevantOperation && lastRelevantOperation.getDate() > this.date) {
      this.close();
      return true;
    }

    return false;
  }

  /**
   * Get the type of the operation.
   *
   * @returns {'load'|'preview'|'viewChanges'|'submit'}
   */
  getType() {
    return this.type;
  }

  /**
   * Get the value of an option.
   *
   * @param {string} name Option name.
   * @returns {*}
   */
  getOption(name) {
    return this.options[name];
  }

  /**
   * Get the date of the operation.
   *
   * @returns {Date}
   */
  getDate() {
    return this.date;
  }

  /**
   * Check whether the operation is closed (settled).
   *
   * @returns {boolean}
   */
  isClosed() {
    return this.closed;
  }

  /**
   * Check whether the operation is delayed.
   *
   * @returns {boolean}
   */
  isDelayed() {
    return this.delayed;
  }
}

export default CommentFormOperationRegistry;
