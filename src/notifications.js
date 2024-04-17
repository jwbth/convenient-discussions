/**
 * Singleton related to the notification
 * ({@link https://doc.wikimedia.org/mediawiki-core/master/js/mw.notification.html#.notify mw.notification})
 * functionality. Only those notifications that need to be controlled collectively go through this
 * object.
 *
 * @module notifications
 */

import controller from './controller';

/**
 * Notification object created by running
 * {@link https://doc.wikimedia.org/mediawiki-core/master/js/mw.notification.html#.notify mw.notification.notify(...)}.
 *
 * @typedef {object} Notification
 * @see https://doc.wikimedia.org/mediawiki-core/master/js/Notification.html
 */

export default {
  data: [],

  /**
   * Initialize the singleton.
   */
  init() {
    controller
      .on('beforeReload', (passedData) => {
        this.close(passedData.closeNotificationsSmoothly ?? true);
      });
  },

  /**
   * Show a notificaition and add it to the registry. This is used to be able to keep track of shown
   * notifications and close them all at once if needed. Most notifications are shown using simple
   * {@link https://doc.wikimedia.org/mediawiki-core/master/js/mw.html#.notify mw.notify()} or
   * {@link https://doc.wikimedia.org/mediawiki-core/master/js/mw.notification.html#.notify mw.notification.notify()}).
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
   * {@link Notification} object will be in the `notification` property.
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
