/**
 * Background Service Worker
 * Handles context menu and keyboard shortcuts
 */

// Create context menu on install
chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
        id: 'rsvp-read-selection',
        title: 'Read with Fast Reader',
        contexts: ['selection']
    });
});

// Safe message sending - handles cases where content script isn't loaded
async function sendMessageToTab(tabId, message) {
    try {
        return await chrome.tabs.sendMessage(tabId, message);
    } catch (error) {
        // Content script not loaded - try to inject it first
        console.log('Content script not available, attempting to inject...');
        try {
            await chrome.scripting.executeScript({
                target: { tabId: tabId },
                files: ['content/content.js']
            });
            await chrome.scripting.insertCSS({
                target: { tabId: tabId },
                files: ['content/content.css']
            });
            // Now try sending the message again
            return await chrome.tabs.sendMessage(tabId, message);
        } catch (injectError) {
            console.warn('Could not inject content script:', injectError.message);
            return null;
        }
    }
}

// Handle context menu click
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId === 'rsvp-read-selection' && info.selectionText) {
        await sendMessageToTab(tab.id, {
            action: 'startRSVP',
            text: info.selectionText
        });
    }
});

// Handle keyboard commands
chrome.commands.onCommand.addListener(async (command, tab) => {
    if (!tab || !tab.id) return;

    if (command === 'start-rsvp') {
        await sendMessageToTab(tab.id, {
            action: 'startRSVPFromSelection'
        });
    } else if (command === 'toggle-playback') {
        await sendMessageToTab(tab.id, {
            action: 'togglePlayback'
        });
    }
});

// Handle messages from content script or popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'openSettings') {
        chrome.runtime.openOptionsPage();
        return;
    }

    if (message.action === 'getSelectedText') {
        chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
            if (tabs[0]) {
                const result = await sendMessageToTab(tabs[0].id, { action: 'getSelection' });
                sendResponse(result);
            } else {
                sendResponse({ text: '' });
            }
        });
        return true; // Keep channel open for async response
    }
});
