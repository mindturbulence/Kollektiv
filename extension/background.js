/**
 * Kollektiv Assistant side panel extension — service worker.
 *
 * Opens the side panel when the toolbar icon is clicked (MV3 requires an
 * explicit user gesture for sidePanel.open()).
 */

chrome.runtime.onInstalled.addListener(() => {
    // Side panel is declared statically in the manifest; nothing to wire up.
});

chrome.action.onClicked.addListener((tab) => {
    if (!tab.windowId) return;
    chrome.sidePanel.open({ windowId: tab.windowId });
});
