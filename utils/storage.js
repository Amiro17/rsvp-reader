/**
 * Chrome Storage Utilities
 * Handles saving and loading user preferences
 */

const DEFAULT_SETTINGS = {
    // Speed settings
    baseWPM: 180,
    rampWords: 8,
    startSpeedRatio: 0.4,

    // Punctuation delays
    commaPause: 1.7,
    periodPause: 2.0,
    paragraphPause: 2.0,

    // Display settings
    theme: 'light',
    fontFamily: 'Georgia, serif',
    fontSize: 80,
    orpColor: '#2175b0ff',
    textColor: '#e0e0e0',
    backgroundColor: '#080808',

    // Trail settings
    showTrail: true,
    trailLength: 2,
    trailOpacity: 0.8,
    trailDirection: 'left',

    // Preview settings
    showPreview: true,

    // Behavior settings
    autoClose: false,
    showProgress: true,
    soundEnabled: false,

    // Position (remembered)
    overlayX: null,
    overlayY: null
};

/**
 * Get all settings
 */
export async function getSettings() {
    return new Promise((resolve) => {
        if (typeof chrome !== 'undefined' && chrome.storage) {
            chrome.storage.sync.get(DEFAULT_SETTINGS, (result) => {
                resolve({ ...DEFAULT_SETTINGS, ...result });
            });
        } else {
            // Fallback for non-extension context
            const stored = localStorage.getItem('rsvp-settings');
            if (stored) {
                resolve({ ...DEFAULT_SETTINGS, ...JSON.parse(stored) });
            } else {
                resolve(DEFAULT_SETTINGS);
            }
        }
    });
}

/**
 * Save settings
 */
export async function saveSettings(settings) {
    return new Promise((resolve) => {
        if (typeof chrome !== 'undefined' && chrome.storage) {
            chrome.storage.sync.set(settings, resolve);
        } else {
            const current = JSON.parse(localStorage.getItem('rsvp-settings') || '{}');
            localStorage.setItem('rsvp-settings', JSON.stringify({ ...current, ...settings }));
            resolve();
        }
    });
}

/**
 * Get a single setting
 */
export async function getSetting(key) {
    const settings = await getSettings();
    return settings[key];
}

/**
 * Save a single setting
 */
export async function saveSetting(key, value) {
    return saveSettings({ [key]: value });
}

/**
 * Reset to defaults
 */
export async function resetSettings() {
    return new Promise((resolve) => {
        if (typeof chrome !== 'undefined' && chrome.storage) {
            chrome.storage.sync.clear(() => {
                chrome.storage.sync.set(DEFAULT_SETTINGS, resolve);
            });
        } else {
            localStorage.setItem('rsvp-settings', JSON.stringify(DEFAULT_SETTINGS));
            resolve();
        }
    });
}

export { DEFAULT_SETTINGS };
