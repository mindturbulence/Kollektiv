/**
 * Kollektiv Assistant side panel logic.
 *
 * The Kollektiv URL is configurable (chrome.storage.sync — roams across the
 * user's devices) instead of hardcoded: set it via the ⚙ settings form, and
 * the iframe retargets immediately. The URL is stored as origin + path
 * (no trailing slash, no hash) — the panel appends '#avatar-panel' itself,
 * so subpath deployments (e.g. GitHub Pages /Kollektiv/) work too.
 *
 * MV3 CSP forbids inline event handlers, so all wiring lives here.
 */
(function () {
    'use strict';

    var DEFAULT_URL = 'http://127.0.0.1:7500';

    var iframe = document.getElementById('kollektiv-frame');
    var settingsBtn = document.getElementById('settings-btn');
    var settingsForm = document.getElementById('settings-form');
    var urlInput = document.getElementById('url-input');
    var saveBtn = document.getElementById('save-btn');
    var urlError = document.getElementById('url-error');
    var currentUrlLabel = document.getElementById('current-url');

    /** Normalize user input to origin + path. Returns null when invalid.
     *  Accepts with/without scheme; only http(s) allowed. The URL constructor
     *  silently accepts garbage hosts (percent-encodes spaces), so the
     *  hostname is validated against sane host characters too. */
    function normalizeUrl(raw) {
        var u = (raw || '').trim();
        if (!u) return null;
        if (!/^https?:\/\//i.test(u)) u = 'http://' + u;
        try {
            var parsed = new URL(u);
            if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
            var host = parsed.hostname;
            var hostOk = /^[a-zA-Z0-9.-]+$/.test(host)
                || host === 'localhost'
                || /^\[[0-9a-f:]+\]$/i.test(host); // IPv6 literal
            if (!host || !hostOk) return null;
            var path = parsed.pathname.replace(/\/+$/, '');
            return parsed.origin + (path === '/' ? '' : path);
        } catch (e) {
            return null;
        }
    }

    function applyUrl(url) {
        iframe.src = url + '/#avatar-panel';
        currentUrlLabel.textContent = url;
    }

    function loadAndApply() {
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
            chrome.storage.sync.get({ kolektivUrl: DEFAULT_URL }, function (items) {
                applyUrl(items.kolektivUrl || DEFAULT_URL);
            });
        } else {
            // Degraded context (file:// dev preview) — default only.
            applyUrl(DEFAULT_URL);
        }
    }

    function toggleSettings() {
        var willShow = settingsForm.hidden;
        settingsForm.hidden = !willShow;
        if (willShow) {
            urlInput.value = currentUrlLabel.textContent || DEFAULT_URL;
            urlError.hidden = true;
            urlInput.focus();
        }
    }

    function saveUrl() {
        var normalized = normalizeUrl(urlInput.value);
        if (!normalized) {
            urlError.hidden = false;
            return;
        }
        urlError.hidden = true;
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
            chrome.storage.sync.set({ kolektivUrl: normalized }, function () {
                applyUrl(normalized);
                settingsForm.hidden = true;
            });
        } else {
            applyUrl(normalized);
            settingsForm.hidden = true;
        }
    }

    settingsBtn.addEventListener('click', toggleSettings);
    // type="button" + preventDefault belt-and-braces: a native form submit
    // would reload the panel page and lose the form state mid-save.
    saveBtn.addEventListener('click', function (e) { e.preventDefault(); saveUrl(); });
    settingsForm.addEventListener('submit', function (e) { e.preventDefault(); saveUrl(); });
    urlInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') saveUrl();
        if (e.key === 'Escape') settingsForm.hidden = true;
    });

    loadAndApply();
})();
