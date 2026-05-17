/*
 * Fallback page logic. Only runs when no remote URL is loaded.
 * Shows the configured URL (if any) and applies splash colors.
 */
(function () {
    'use strict';
    const cfg = window.SLIM_BROWSER_CONFIG || {};
    const ui = cfg.ui || {};

    document.body.style.setProperty('--splash-bg', ui.splashColor || '#1a1a1a');
    document.body.style.setProperty('--splash-fg', ui.splashTextColor || '#fff');

    const title = document.getElementById('title');
    if (title && cfg.appName) title.textContent = cfg.appName;

    const url = document.getElementById('cfg-url');
    if (url && cfg.url) url.textContent = 'Configured URL: ' + cfg.url;
})();
