/**
 * RSVP Reader - Popup Script
 */

document.addEventListener('DOMContentLoaded', async () => {
    // Load settings
    const defaults = {
        baseWPM: 300,
        theme: 'dark',
        showTrail: true
    };

    const settings = await new Promise((resolve) => {
        chrome.storage.sync.get(defaults, resolve);
    });

    // Update UI with current settings
    const speedValue = document.getElementById('speed-value');
    const themeDark = document.getElementById('theme-dark');
    const themeLight = document.getElementById('theme-light');
    const trailToggle = document.getElementById('trail-toggle');

    speedValue.textContent = settings.baseWPM;
    trailToggle.checked = settings.showTrail;

    if (settings.theme === 'light') {
        themeDark.classList.remove('active');
        themeLight.classList.add('active');
    }

    // Speed controls
    document.getElementById('speed-down').addEventListener('click', () => {
        let speed = parseInt(speedValue.textContent) - 25;
        speed = Math.max(50, speed);
        speedValue.textContent = speed;
        chrome.storage.sync.set({ baseWPM: speed });
    });

    document.getElementById('speed-up').addEventListener('click', () => {
        let speed = parseInt(speedValue.textContent) + 25;
        speed = Math.min(1500, speed);
        speedValue.textContent = speed;
        chrome.storage.sync.set({ baseWPM: speed });
    });

    // Theme toggle
    document.querySelectorAll('.theme-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            chrome.storage.sync.set({ theme: btn.dataset.theme });
        });
    });

    // Trail toggle
    trailToggle.addEventListener('change', () => {
        chrome.storage.sync.set({ showTrail: trailToggle.checked });
    });

    // Start button
    document.getElementById('btn-start').addEventListener('click', async () => {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        if (!tab) {
            showError('No active tab found');
            return;
        }

        try {
            await chrome.tabs.sendMessage(tab.id, { action: 'startRSVPFromSelection' });
            window.close();
        } catch (error) {
            showError('Select some text on the page first');
        }
    });

    // Write Your Own button - opens reader with empty text editor
    document.getElementById('btn-write').addEventListener('click', async () => {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        if (!tab) {
            showError('No active tab found');
            return;
        }

        try {
            await chrome.tabs.sendMessage(tab.id, { action: 'startRSVPEmpty' });
            window.close();
        } catch (error) {
            showError('Could not open reader');
        }
    });

    // Open settings
    document.getElementById('open-settings').addEventListener('click', (e) => {
        e.preventDefault();
        chrome.runtime.openOptionsPage();
    });

    function showError(message) {
        const main = document.querySelector('.popup-main');
        const existing = main.querySelector('.error-message');
        if (existing) existing.remove();

        const errorEl = document.createElement('div');
        errorEl.className = 'error-message';
        errorEl.textContent = message;
        main.appendChild(errorEl);

        setTimeout(() => errorEl.remove(), 3000);
    }
});
