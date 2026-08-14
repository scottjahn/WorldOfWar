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
  root.WOW_VERSION = '1.4.0';
  root.WOW_BUILD = '2026-08-14';
})(typeof self !== 'undefined' ? self : this);
