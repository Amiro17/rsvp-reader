/**
 * RSVP Overlay Component
 * Creates and manages the visual reading overlay
 */

// We'll use IIFE-style module pattern since this runs in content script context
(function () {
    // Check if already defined
    if (window.RSVPOverlay) return;

    const DEFAULT_SETTINGS = {
        theme: 'dark',
        fontFamily: 'Inter, system-ui, sans-serif',
        fontSize: 48,
        orpColor: '#ff4444',
        textColor: '#ffffff',
        backgroundColor: 'rgba(20, 20, 30, 0.95)',
        showTrail: true,
        trailLength: 3,
        trailOpacity: 0.4,
        showProgress: true
    };

    class RSVPOverlay {
        constructor(settings = {}) {
            this.settings = { ...DEFAULT_SETTINGS, ...settings };
            this.overlay = null;
            this.wordDisplay = null;
            this.trailDisplay = null;
            this.progressBar = null;
            this.controls = null;
            this.speedDisplay = null;
            this.isDragging = false;
            this.dragOffset = { x: 0, y: 0 };

            this.onPlay = null;
            this.onPause = null;
            this.onClose = null;
            this.onSpeedChange = null;
            this.onSeek = null;
        }

        create() {
            if (this.overlay) return;

            // Create main overlay container
            this.overlay = document.createElement('div');
            this.overlay.id = 'rsvp-overlay';
            this.overlay.className = `rsvp-theme-${this.settings.theme}`;

            this.overlay.innerHTML = `
        <div class="rsvp-header">
          <div class="rsvp-drag-handle">
            <span class="rsvp-title">RSVP Reader</span>
          </div>
          <div class="rsvp-header-controls">
            <button class="rsvp-btn rsvp-btn-settings" title="Settings">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="3"></circle>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
              </svg>
            </button>
            <button class="rsvp-btn rsvp-btn-close" title="Close (Esc)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
        </div>
        
        <div class="rsvp-content">
          <div class="rsvp-trail-container"></div>
          <div class="rsvp-word-container">
            <div class="rsvp-focus-line"></div>
            <div class="rsvp-word">
              <span class="rsvp-word-before"></span>
              <span class="rsvp-word-orp"></span>
              <span class="rsvp-word-after"></span>
            </div>
          </div>
        </div>
        
        <div class="rsvp-footer">
          <div class="rsvp-progress-container">
            <div class="rsvp-progress-bar">
              <div class="rsvp-progress-fill"></div>
            </div>
            <span class="rsvp-progress-text">0 / 0</span>
          </div>
          
          <div class="rsvp-controls">
            <button class="rsvp-btn rsvp-btn-restart" title="Restart">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M1 4v6h6"></path>
                <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path>
              </svg>
            </button>
            
            <button class="rsvp-btn rsvp-btn-slower" title="Slower (-)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
            </button>
            
            <button class="rsvp-btn rsvp-btn-play-pause rsvp-btn-primary" title="Play/Pause (Space)">
              <svg class="rsvp-icon-play" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="5 3 19 12 5 21 5 3"></polygon>
              </svg>
              <svg class="rsvp-icon-pause" viewBox="0 0 24 24" fill="currentColor" style="display:none">
                <rect x="6" y="4" width="4" height="16"></rect>
                <rect x="14" y="4" width="4" height="16"></rect>
              </svg>
            </button>
            
            <button class="rsvp-btn rsvp-btn-faster" title="Faster (+)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
            </button>
            
            <div class="rsvp-speed-display">
              <span class="rsvp-speed-value">300</span>
              <span class="rsvp-speed-unit">WPM</span>
            </div>
          </div>
        </div>
      `;

            document.body.appendChild(this.overlay);
            this.cacheElements();
            this.bindEvents();
            this.applySettings();
        }

        cacheElements() {
            this.wordDisplay = {
                before: this.overlay.querySelector('.rsvp-word-before'),
                orp: this.overlay.querySelector('.rsvp-word-orp'),
                after: this.overlay.querySelector('.rsvp-word-after')
            };
            this.trailDisplay = this.overlay.querySelector('.rsvp-trail-container');
            this.progressBar = this.overlay.querySelector('.rsvp-progress-fill');
            this.progressText = this.overlay.querySelector('.rsvp-progress-text');
            this.speedDisplay = this.overlay.querySelector('.rsvp-speed-value');
            this.playPauseBtn = this.overlay.querySelector('.rsvp-btn-play-pause');
            this.playIcon = this.overlay.querySelector('.rsvp-icon-play');
            this.pauseIcon = this.overlay.querySelector('.rsvp-icon-pause');
        }

        bindEvents() {
            // Close button
            this.overlay.querySelector('.rsvp-btn-close').addEventListener('click', () => {
                if (this.onClose) this.onClose();
            });

            // Play/Pause button
            this.playPauseBtn.addEventListener('click', () => {
                if (this.playIcon.style.display !== 'none') {
                    if (this.onPlay) this.onPlay();
                } else {
                    if (this.onPause) this.onPause();
                }
            });

            // Restart button
            this.overlay.querySelector('.rsvp-btn-restart').addEventListener('click', () => {
                if (this.onRestart) this.onRestart();
            });

            // Speed controls
            this.overlay.querySelector('.rsvp-btn-slower').addEventListener('click', () => {
                if (this.onSpeedChange) this.onSpeedChange(-25);
            });

            this.overlay.querySelector('.rsvp-btn-faster').addEventListener('click', () => {
                if (this.onSpeedChange) this.onSpeedChange(25);
            });

            // Settings button
            this.overlay.querySelector('.rsvp-btn-settings').addEventListener('click', () => {
                chrome.runtime.sendMessage({ action: 'openSettings' });
            });

            // Progress bar click for seeking
            this.overlay.querySelector('.rsvp-progress-bar').addEventListener('click', (e) => {
                const rect = e.target.getBoundingClientRect();
                const position = (e.clientX - rect.left) / rect.width;
                if (this.onSeek) this.onSeek(position);
            });

            // Drag functionality
            const dragHandle = this.overlay.querySelector('.rsvp-drag-handle');
            dragHandle.addEventListener('mousedown', (e) => {
                this.isDragging = true;
                this.dragOffset = {
                    x: e.clientX - this.overlay.offsetLeft,
                    y: e.clientY - this.overlay.offsetTop
                };
                this.overlay.classList.add('rsvp-dragging');
            });

            document.addEventListener('mousemove', (e) => {
                if (!this.isDragging) return;
                this.overlay.style.left = `${e.clientX - this.dragOffset.x}px`;
                this.overlay.style.top = `${e.clientY - this.dragOffset.y}px`;
                this.overlay.style.transform = 'none';
            });

            document.addEventListener('mouseup', () => {
                if (this.isDragging) {
                    this.isDragging = false;
                    this.overlay.classList.remove('rsvp-dragging');
                }
            });

            // Keyboard shortcuts
            document.addEventListener('keydown', (e) => {
                if (!this.overlay || this.overlay.style.display === 'none') return;

                if (e.key === 'Escape') {
                    if (this.onClose) this.onClose();
                } else if (e.key === ' ' && !e.target.matches('input, textarea')) {
                    e.preventDefault();
                    if (this.playIcon.style.display !== 'none') {
                        if (this.onPlay) this.onPlay();
                    } else {
                        if (this.onPause) this.onPause();
                    }
                } else if (e.key === 'ArrowUp' || e.key === '+' || e.key === '=') {
                    if (this.onSpeedChange) this.onSpeedChange(25);
                } else if (e.key === 'ArrowDown' || e.key === '-') {
                    if (this.onSpeedChange) this.onSpeedChange(-25);
                } else if (e.key === 'ArrowLeft') {
                    // Rewind 5%
                    if (this.onSeek) {
                        const current = parseFloat(this.progressBar.style.width) / 100 || 0;
                        this.onSeek(Math.max(0, current - 0.05));
                    }
                } else if (e.key === 'ArrowRight') {
                    // Forward 5%
                    if (this.onSeek) {
                        const current = parseFloat(this.progressBar.style.width) / 100 || 0;
                        this.onSeek(Math.min(1, current + 0.05));
                    }
                }
            });
        }

        applySettings() {
            if (!this.overlay) return;

            this.overlay.style.setProperty('--rsvp-font-family', this.settings.fontFamily);
            this.overlay.style.setProperty('--rsvp-font-size', `${this.settings.fontSize}px`);
            this.overlay.style.setProperty('--rsvp-orp-color', this.settings.orpColor);
            this.overlay.style.setProperty('--rsvp-text-color', this.settings.textColor);
            this.overlay.style.setProperty('--rsvp-bg-color', this.settings.backgroundColor);
            this.overlay.style.setProperty('--rsvp-trail-opacity', this.settings.trailOpacity);

            this.overlay.className = `rsvp-theme-${this.settings.theme}`;
        }

        updateSettings(newSettings) {
            this.settings = { ...this.settings, ...newSettings };
            this.applySettings();
        }

        show() {
            if (this.overlay) {
                this.overlay.style.display = 'flex';
            }
        }

        hide() {
            if (this.overlay) {
                this.overlay.style.display = 'none';
            }
        }

        destroy() {
            if (this.overlay) {
                this.overlay.remove();
                this.overlay = null;
            }
        }

        displayWord(wordData) {
            if (!this.wordDisplay) return;

            // Update main word display
            this.wordDisplay.before.textContent = wordData.current.before;
            this.wordDisplay.orp.textContent = wordData.current.orp;
            this.wordDisplay.after.textContent = wordData.current.after;

            // Update trail (fading previous words)
            if (this.settings.showTrail && wordData.history) {
                this.trailDisplay.innerHTML = wordData.history
                    .slice(0, this.settings.trailLength)
                    .map((word, i) => {
                        const opacity = this.settings.trailOpacity * (1 - (i / (this.settings.trailLength + 1)));
                        return `<div class="rsvp-trail-word" style="opacity: ${opacity}">${word}</div>`;
                    })
                    .join('');
            }
        }

        updateProgress(progress, current, total) {
            if (this.progressBar) {
                this.progressBar.style.width = `${progress * 100}%`;
            }
            if (this.progressText) {
                this.progressText.textContent = `${current} / ${total}`;
            }
        }

        updateSpeed(wpm) {
            if (this.speedDisplay) {
                this.speedDisplay.textContent = wpm;
            }
        }

        setPlayState(isPlaying) {
            if (this.playIcon && this.pauseIcon) {
                this.playIcon.style.display = isPlaying ? 'none' : 'block';
                this.pauseIcon.style.display = isPlaying ? 'block' : 'none';
            }
        }
    }

    window.RSVPOverlay = RSVPOverlay;
})();
