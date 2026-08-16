/* Single source of truth for the build identifier.
 *
 * Loaded by index.html for the title-screen tag, and by sw.js via importScripts
 * so the cache name tracks the version — bumping VERSION here retires every old
 * cache on the next service worker activation.
 *
 * Bump VERSION and BUILD together whenever you deploy, otherwise the number on
 * screen stops meaning anything.
 */
(function (root) {
  /* Major version tracks editions: 4.x ships Earth + Animals + Space +
   * Prehistoric. Each new edition bumps the major number. */
  root.WOW_VERSION = '4.1.0';
  root.WOW_BUILD = '2026-08-16';
})(typeof self !== 'undefined' ? self : this);
