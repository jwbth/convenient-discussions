/**
 * Singleton related to the notification (`mw.Notification`) functionality. Only those notifications
 * that need to be controlled collectively go through this object.
 *
 * @module notifications
 */

/**
 * Notification object created by running `mw.notification.notify(...)`.
 *
 * @typedef {object} Notification
 * @see https://doc.wikimedia.org/mediawiki-core/master/js/#!/api/mw.Notification_
 */

export default {
  data: [],

  /**
   * Show a notificaition and add it to the registry. This is used to be able to keep track of shown
   * notifications and close them all at once if needed. Most notifications are shown using simple
   * `mw.notify` or `mw.notification.notify`.
   *
   * @param {string|external:Query} message Message text.
   * @param {object} [options]
   * @param {object} [data={}] Additional data related to the notification.
   * @returns {Notification}
   */
  add(message, options, data = {}) {
    const notification = mw.notification.notify(message, options);
    this.data.push(Object.assign(data, { notification }));
    return notification;
  },

  /**
   * Get all notifications added to the registry (including already hidden). The
   * {@link https://doc.wikimedia.org/mediawiki-core/master/js/#!/api/mw.Notification_ mw.Notification}
   * object will be in the `notification` property.
   *
   * @returns {object[]}
   */
  get() {
    return this.data;
  },

  /**
   * Close all notifications added to the registry immediately.
   *
   * @param {boolean} [smooth] Don't use a smooth animation.
   */
  close(smooth = true) {
    this.data.forEach((data) => {
      if (!smooth) {
        data.notification.$notification.hide();
      }
      data.notification.close();
    });
    this.data = [];
  },
};
