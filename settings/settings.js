/**
 * RSVP Reader - Settings Page Script
 * With Live Preview
 */

document.addEventListener('DOMContentLoaded', async () => {
    const DEFAULT_SETTINGS = {
        baseWPM: 100,
        rampWords: 8,
        startSpeedRatio: 0.4,
        commaPause: 1.7,
        periodPause: 2.0,
        paragraphPause: 2.0,
        theme: 'dark',
        fontFamily: 'Georgia, serif',
        fontSize: 80,
        orpColor: '#3a9a6a',
        showTrail: true,
        trailLength: 1,
        trailOpacity: 0.8,
        trailDirection: 'left',
        showPreview: true,
        autoClose: false,
        showProgress: true
    };

    // Load current settings
    const settings = await new Promise((resolve) => {
        chrome.storage.sync.get(DEFAULT_SETTINGS, resolve);
    });

    // Map of all setting controls
    const controls = {
        // Ranges
        baseWPM: { element: document.getElementById('baseWPM'), valueEl: document.getElementById('baseWPM-value'), format: v => v },
        rampWords: { element: document.getElementById('rampWords'), valueEl: document.getElementById('rampWords-value'), format: v => v },
        startSpeedRatio: { element: document.getElementById('startSpeedRatio'), valueEl: document.getElementById('startSpeedRatio-value'), format: v => Math.round(v * 100) },
        commaPause: { element: document.getElementById('commaPause'), valueEl: document.getElementById('commaPause-value'), format: v => v.toFixed(1) },
        periodPause: { element: document.getElementById('periodPause'), valueEl: document.getElementById('periodPause-value'), format: v => v.toFixed(1) },
        paragraphPause: { element: document.getElementById('paragraphPause'), valueEl: document.getElementById('paragraphPause-value'), format: v => v.toFixed(1) },
        fontSize: { element: document.getElementById('fontSize'), valueEl: document.getElementById('fontSize-value'), format: v => v },
        trailLength: { element: document.getElementById('trailLength'), valueEl: document.getElementById('trailLength-value'), format: v => v },
        trailOpacity: { element: document.getElementById('trailOpacity'), valueEl: document.getElementById('trailOpacity-value'), format: v => Math.round(v * 100) },

        // Selects
        theme: { element: document.getElementById('theme') },
        fontFamily: { element: document.getElementById('fontFamily') },
        trailDirection: { element: document.getElementById('trailDirection') },

        // Color
        orpColor: { element: document.getElementById('orpColor') },

        // Checkboxes
        showTrail: { element: document.getElementById('showTrail') },
        showPreview: { element: document.getElementById('showPreview') },
        autoClose: { element: document.getElementById('autoClose') },
        showProgress: { element: document.getElementById('showProgress') }
    };

    // Preview elements
    const previewSection = document.getElementById('preview-section');
    const previewBefore = document.getElementById('preview-before');
    const previewORP = document.getElementById('preview-orp');
    const previewAfter = document.getElementById('preview-after');

    // Update preview display
    function updatePreview() {
        if (!previewSection) return;

        const fontSize = settings.fontSize || 48;
        const fontFamily = settings.fontFamily || 'Georgia, serif';
        const orpColor = settings.orpColor || '#4aba7a';
        const textColor = settings.theme === 'light' ? '#1a1a1a' : '#e8e8e8';
        const bgColor = settings.theme === 'light' ? '#f8f8f8' : '#0a0a0a';

        previewSection.style.setProperty('--preview-font-size', `${fontSize}px`);
        previewSection.style.setProperty('--preview-font-family', fontFamily);
        previewSection.style.setProperty('--preview-orp-color', orpColor);
        previewSection.style.setProperty('--preview-text-color', textColor);
        previewSection.style.background = bgColor;

        if (previewBefore) previewBefore.style.color = textColor;
        if (previewAfter) previewAfter.style.color = textColor;
    }

    // Initialize all controls with current values
    function initializeControls() {
        for (const [key, control] of Object.entries(controls)) {
            if (!control.element) continue;

            const value = settings[key];
            const el = control.element;

            if (el.type === 'checkbox') {
                el.checked = value;
            } else {
                el.value = value;
            }

            // Update displayed value for ranges
            if (control.valueEl) {
                control.valueEl.textContent = control.format(parseFloat(value));
            }
        }

        updateTrailSettingsVisibility();
        updatePreview();
    }

    // Save a setting
    function saveSetting(key, value) {
        settings[key] = value;
        chrome.storage.sync.set({ [key]: value });
        updatePreview();
    }

    // Bind events to all controls
    function bindEvents() {
        for (const [key, control] of Object.entries(controls)) {
            if (!control.element) continue;
            const el = control.element;

            if (el.type === 'range') {
                el.addEventListener('input', () => {
                    const value = parseFloat(el.value);
                    if (control.valueEl) {
                        control.valueEl.textContent = control.format(value);
                    }
                    saveSetting(key, value);
                });
            } else if (el.type === 'checkbox') {
                el.addEventListener('change', () => {
                    saveSetting(key, el.checked);
                    if (key === 'showTrail') {
                        updateTrailSettingsVisibility();
                    }
                });
            } else if (el.type === 'color') {
                el.addEventListener('input', () => {
                    saveSetting(key, el.value);
                });
            } else if (el.tagName === 'SELECT') {
                el.addEventListener('change', () => {
                    saveSetting(key, el.value);
                });
            }
        }

        // Reset button
        document.getElementById('reset-settings').addEventListener('click', async () => {
            if (confirm('Reset all settings to defaults?')) {
                await chrome.storage.sync.clear();
                await chrome.storage.sync.set(DEFAULT_SETTINGS);
                Object.assign(settings, DEFAULT_SETTINGS);
                initializeControls();
            }
        });
    }

    // Show/hide trail settings based on toggle
    function updateTrailSettingsVisibility() {
        const show = controls.showTrail.element?.checked ?? true;
        const containers = ['trailDirection-container', 'trailLength-container', 'trailOpacity-container'];
        containers.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.style.opacity = show ? '1' : '0.4';
                el.style.pointerEvents = show ? 'auto' : 'none';
            }
        });
    }

    // Theme Presets
    const themePresets = {
        dark: {
            theme: 'dark',
            backgroundColor: '#0a0a0a',
            textColor: '#e0e0e0',
            orpColor: '#3a9a6a'
        },
        light: {
            theme: 'light',
            backgroundColor: '#f5f5f5',
            textColor: '#1a1a1a',
            orpColor: '#2a8a5a'
        },
        sepia: {
            theme: 'sepia',
            backgroundColor: '#f4ecd8',
            textColor: '#5c4a32',
            orpColor: '#8b6914'
        },
        night: {
            theme: 'night',
            backgroundColor: '#1a1a2e',
            textColor: '#e0e0e0',
            orpColor: '#e94560'
        },
        ocean: {
            theme: 'ocean',
            backgroundColor: '#0d1b2a',
            textColor: '#e0e6ed',
            orpColor: '#00b4d8'
        },
        forest: {
            theme: 'forest',
            backgroundColor: '#1a2f1a',
            textColor: '#d0e0d0',
            orpColor: '#90ee90'
        }
    };

    // Initialize theme presets
    function initThemePresets() {
        const presetButtons = document.querySelectorAll('.theme-preset');

        presetButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const presetName = btn.dataset.preset;
                const preset = themePresets[presetName];

                if (preset) {
                    // Apply preset settings
                    Object.entries(preset).forEach(([key, value]) => {
                        settings[key] = value;
                        chrome.storage.sync.set({ [key]: value });

                        // Update controls if they exist
                        if (controls[key]?.element) {
                            controls[key].element.value = value;
                        }
                    });

                    // Update active state
                    presetButtons.forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');

                    // Update preview
                    updatePreview();
                }
            });
        });

        // Mark current preset as active
        const currentPreset = Object.entries(themePresets).find(([name, preset]) =>
            preset.orpColor === settings.orpColor && preset.theme === settings.theme
        );
        if (currentPreset) {
            const activeBtn = document.querySelector(`[data-preset="${currentPreset[0]}"]`);
            if (activeBtn) activeBtn.classList.add('active');
        }
    }

    // Initialize
    initializeControls();
    bindEvents();
    initThemePresets();
});
