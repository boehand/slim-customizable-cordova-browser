/*
 * Fallback page logic. Only runs when no remote URL is configured —
 * the native MainActivity loads the configured URL directly otherwise.
 */
(function () {
    'use strict';
    const cfg = window.SLIM_BROWSER_CONFIG || {};
    const ui = cfg.ui || {};

    document.body.style.setProperty('--bg', ui.splashColor || '#0f172a');
    document.body.style.setProperty('--fg', ui.splashTextColor || '#e5e7eb');

    const title = document.getElementById('title');
    if (title && cfg.appName) title.textContent = cfg.appName;

    const url = document.getElementById('cfg-url');
    if (url && cfg.url) url.textContent = 'Configured URL: ' + cfg.url;
})();
