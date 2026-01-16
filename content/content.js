/**
 * RSVP Reader - Content Script
 * Handles text selection and RSVP overlay integration
 */

// Import overlay (it's loaded as a separate script)
// We use an inline version of the engine for content script context

(function () {
    'use strict';

    // ============================================
    // Inline RSVP Engine (for content script context)
    // ============================================

    const PUNCTUATION_DELAYS = {
        ',': 1.5, ';': 1.5, ':': 1.5,
        '.': 2.0, '!': 2.0, '?': 2.0,
        '—': 1.8, '–': 1.8, '…': 2.0
    };

    function calculateORP(word) {
        // Clean word - remove punctuation but keep umlauts and special chars
        const cleanWord = word.replace(/[^\p{L}]/gu, '');
        const len = cleanWord.length;

        // Improved ORP calculation for better reading flow
        // The ORP should be slightly left of center for natural reading
        if (len <= 1) return 0;
        if (len === 2) return 0;  // First letter for 2-char words
        if (len === 3) return 1;  // Middle for 3-char
        if (len === 4) return 1;  // Slightly left for 4-char
        if (len <= 6) return 1;   // Position 2 (index 1) for 5-6 char
        if (len <= 9) return 2;   // Position 3 (index 2) for 7-9 char
        if (len <= 13) return 3;  // Position 4 (index 3) for 10-13 char
        return Math.floor(len * 0.25); // ~25% in for very long words
    }

    function splitWordByORP(word) {
        if (!word || word.length === 0) {
            return { before: '', orp: '', after: '' };
        }
        const orpIndex = calculateORP(word);
        return {
            before: word.substring(0, orpIndex),
            orp: word.charAt(orpIndex),
            after: word.substring(orpIndex + 1)
        };
    }

    function processText(text) {
        if (!text || typeof text !== 'string') return [];
        const paragraphs = text.split(/\n\s*\n/);
        const words = [];

        paragraphs.forEach((paragraph, paragraphIndex) => {
            const paragraphWords = paragraph
                .replace(/\s+/g, ' ')
                .trim()
                .split(' ')
                .filter(w => w.length > 0);

            paragraphWords.forEach((word, wordIndex) => {
                const lastChar = word.charAt(word.length - 1);
                const delayMultiplier = PUNCTUATION_DELAYS[lastChar] || 1.0;
                words.push({
                    text: word,
                    delayMultiplier: word.includes('...') ? 2.0 : delayMultiplier,
                    isNewParagraph: wordIndex === 0 && paragraphIndex > 0,
                    isParagraphEnd: wordIndex === paragraphWords.length - 1
                });
            });
        });
        return words;
    }

    // ============================================
    // Settings
    // ============================================

    const DEFAULT_SETTINGS = {
        baseWPM: 100,
        rampWords: 8,
        startSpeedRatio: 0.4,
        paragraphPauseMultiplier: 2.0,
        theme: 'dark',
        fontFamily: 'Georgia, serif',
        fontSize: 80,
        orpColor: '#3a9a6a',
        textColor: '#e0e0e0',
        backgroundColor: '#080808',
        showTrail: true,
        trailLength: 1,
        trailOpacity: 0.8,
        trailDirection: 'left',
        showPreview: true,
        showProgress: true
    };

    let settings = { ...DEFAULT_SETTINGS };

    async function loadSettings() {
        return new Promise((resolve) => {
            if (chrome.storage) {
                chrome.storage.sync.get(DEFAULT_SETTINGS, (result) => {
                    settings = { ...DEFAULT_SETTINGS, ...result };
                    resolve(settings);
                });
            } else {
                resolve(settings);
            }
        });
    }

    // ============================================
    // RSVP Controller
    // ============================================

    class RSVPController {
        constructor() {
            this.overlay = null;
            this.words = [];
            this.currentIndex = 0;
            this.isPlaying = false;
            this.isPaused = false;
            this.timeoutId = null;
            this.history = [];
            this.historySize = 3;
            this.sourceElement = null;
            this.hasLoadedRestOfParagraph = false;
        }

        async init(text) {
            await loadSettings();
            this.words = processText(text);
            this.currentIndex = 0;
            this.history = [];

            if (this.words.length === 0) {
                console.warn('RSVP: No words to display');
                return false;
            }

            this.createOverlay();
            this.updateSpeed(settings.baseWPM);
            return true;
        }

        createOverlay() {
            // Remove existing overlay
            this.destroyOverlay();

            // Create overlay container
            this.overlay = {
                element: null,
                wordDisplay: null,
                trailDisplay: null,
                progressBar: null,
                progressText: null,
                speedDisplay: null,
                playIcon: null,
                pauseIcon: null
            };

            const overlayEl = document.createElement('div');
            overlayEl.id = 'rsvp-overlay';
            overlayEl.className = `rsvp-theme-${settings.theme}`;

            overlayEl.innerHTML = `
        <div class="rsvp-header">
          <div class="rsvp-drag-handle">
            <span class="rsvp-title">Fast Reader</span>
          </div>
          <div class="rsvp-header-controls">
            <select class="rsvp-theme-select" title="Select Theme">
              <option value="dark">Dark</option>
              <option value="light">Light</option>
              <option value="sepia">Sepia</option>
              <option value="night">Night</option>
              <option value="ocean">Ocean</option>
              <option value="forest">Forest</option>
            </select>
            <button class="rsvp-btn rsvp-btn-close" title="Close (Esc)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
        </div>
        
        <div class="rsvp-content">
          <!-- Trail from above (for trailDirection='up') -->
          <div class="rsvp-trail-container rsvp-trail-up"></div>
          
          <!-- Trail from left (for trailDirection='left') -->
          <div class="rsvp-trail-container rsvp-trail-left"></div>
          
          <div class="rsvp-orp-axis">
            <div class="rsvp-focus-line-vertical"></div>
            <div class="rsvp-tick-top"></div>
            <div class="rsvp-tick-bottom"></div>
            <div class="rsvp-axis-left"></div>
            <div class="rsvp-axis-right"></div>
            <div class="rsvp-arrow-left"></div>
            <div class="rsvp-arrow-right"></div>
            <div class="rsvp-word-container">
              <div class="rsvp-word">
                <span class="rsvp-word-before"></span>
                <span class="rsvp-word-orp"></span>
                <span class="rsvp-word-after"></span>
              </div>
            </div>
          </div>
          
          <!-- Preview of next words -->
          <div class="rsvp-preview-container"></div>
          
          <div class="rsvp-hint">Leertaste = Start/Pause • ↑/↓ = Geschwindigkeit</div>
        </div>


        
        <div class="rsvp-footer">
          <div class="rsvp-progress-container">
            <div class="rsvp-progress-bar">
              <div class="rsvp-progress-fill"></div>
            </div>
            <span class="rsvp-progress-text">0 / ${this.words.length}</span>
          </div>
          
          <div class="rsvp-controls">
            <button class="rsvp-btn rsvp-btn-restart" title="Restart">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M1 4v6h6"></path>
                <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path>
              </svg>
            </button>
            
            <button class="rsvp-btn rsvp-btn-slower" title="Slower (↓)">
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
            
            <button class="rsvp-btn rsvp-btn-faster" title="Faster (↑)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
            </button>
            
            <div class="rsvp-speed-display">
              <span class="rsvp-speed-value">${settings.baseWPM}</span>
              <span class="rsvp-speed-unit">WPM</span>
            </div>
            
            <button class="rsvp-btn rsvp-btn-settings" title="Settings">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="3"></circle>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
              </svg>
            </button>
            
            <div class="rsvp-divider"></div>
            
            <button class="rsvp-btn rsvp-btn-continue" title="Load Next Paragraph">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M5 12h14M12 5l7 7-7 7"></path>
              </svg>
            </button>
            
            <button class="rsvp-btn rsvp-btn-read-all" title="Read All Remaining Text">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
                <line x1="16" y1="13" x2="8" y2="13"></line>
                <line x1="16" y1="17" x2="8" y2="17"></line>
              </svg>
            </button>
            
            <button class="rsvp-btn rsvp-btn-edit-text" title="View/Edit Text">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
              </svg>
            </button>
          </div>
        </div>
      `;

            document.body.appendChild(overlayEl);
            this.overlay.element = overlayEl;

            // Cache element references
            this.overlay.wordDisplay = {
                before: overlayEl.querySelector('.rsvp-word-before'),
                orp: overlayEl.querySelector('.rsvp-word-orp'),
                after: overlayEl.querySelector('.rsvp-word-after')
            };
            this.overlay.trailUp = overlayEl.querySelector('.rsvp-trail-up');
            this.overlay.trailLeft = overlayEl.querySelector('.rsvp-trail-left');
            this.overlay.previewContainer = overlayEl.querySelector('.rsvp-preview-container');
            this.overlay.progressBar = overlayEl.querySelector('.rsvp-progress-fill');
            this.overlay.progressText = overlayEl.querySelector('.rsvp-progress-text');
            this.overlay.speedDisplay = overlayEl.querySelector('.rsvp-speed-value');
            this.overlay.playIcon = overlayEl.querySelector('.rsvp-icon-play');
            this.overlay.pauseIcon = overlayEl.querySelector('.rsvp-icon-pause');
            this.overlay.hint = overlayEl.querySelector('.rsvp-hint');

            // Apply settings
            overlayEl.style.setProperty('--rsvp-font-family', settings.fontFamily);
            overlayEl.style.setProperty('--rsvp-font-size', `${settings.fontSize}px`);
            overlayEl.style.setProperty('--rsvp-orp-color', settings.orpColor);

            // Bind events
            this.bindOverlayEvents();

            // Show first word preview
            this.displayCurrentWord();
        }

        bindOverlayEvents() {
            const el = this.overlay.element;

            // Close button
            el.querySelector('.rsvp-btn-close').addEventListener('click', () => this.close());

            // Play/Pause
            el.querySelector('.rsvp-btn-play-pause').addEventListener('click', () => this.toggle());

            // Restart
            el.querySelector('.rsvp-btn-restart').addEventListener('click', () => this.restart());

            // Speed controls
            el.querySelector('.rsvp-btn-slower').addEventListener('click', () => this.adjustSpeed(-25));
            el.querySelector('.rsvp-btn-faster').addEventListener('click', () => this.adjustSpeed(25));

            // Theme selector
            const themeSelect = el.querySelector('.rsvp-theme-select');
            themeSelect.value = settings.theme;
            themeSelect.addEventListener('change', (e) => {
                settings.theme = e.target.value;
                el.className = `rsvp-theme-${settings.theme}`;
                chrome.storage.sync.set({ theme: settings.theme });
            });

            // Settings button - opens extension settings
            el.querySelector('.rsvp-btn-settings').addEventListener('click', () => {
                chrome.runtime.sendMessage({ action: 'openSettings' });
            });

            // Continue button - load next paragraph
            el.querySelector('.rsvp-btn-continue').addEventListener('click', () => {
                this.loadNextParagraph();
            });

            // Read All button - load all remaining text
            el.querySelector('.rsvp-btn-read-all').addEventListener('click', () => {
                this.loadAllRemainingText();
            });

            // Edit Text button - view/edit all text
            el.querySelector('.rsvp-btn-edit-text').addEventListener('click', () => {
                this.showTextEditor();
            });

            // Progress bar seeking with smooth drag support (like video player)
            const progressBar = el.querySelector('.rsvp-progress-bar');
            let isSeekDragging = false;

            const updateSeekPosition = (e) => {
                const rect = progressBar.getBoundingClientRect();
                const position = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                this.seekLive(position);
            };

            progressBar.addEventListener('mousedown', (e) => {
                isSeekDragging = true;
                this.wasPlayingBeforeSeek = this.isPlaying;
                if (this.isPlaying) this.pause();
                updateSeekPosition(e);
                e.preventDefault();
            });

            document.addEventListener('mousemove', (e) => {
                if (isSeekDragging) {
                    updateSeekPosition(e);
                }
            });

            document.addEventListener('mouseup', () => {
                if (isSeekDragging) {
                    isSeekDragging = false;
                    if (this.wasPlayingBeforeSeek) {
                        this.play();
                    }
                }
            });

            // Drag functionality
            let isDragging = false;
            let dragOffset = { x: 0, y: 0 };

            el.querySelector('.rsvp-drag-handle').addEventListener('mousedown', (e) => {
                isDragging = true;
                dragOffset = {
                    x: e.clientX - el.offsetLeft,
                    y: e.clientY - el.offsetTop
                };
                el.classList.add('rsvp-dragging');
            });

            document.addEventListener('mousemove', (e) => {
                if (!isDragging) return;
                el.style.left = `${e.clientX - dragOffset.x}px`;
                el.style.top = `${e.clientY - dragOffset.y}px`;
                el.style.transform = 'none';
            });

            document.addEventListener('mouseup', () => {
                if (isDragging) {
                    isDragging = false;
                    el.classList.remove('rsvp-dragging');
                }
            });

            // Keyboard shortcuts
            this.keyHandler = (e) => {
                if (!this.overlay?.element) return;

                if (e.key === 'Escape') {
                    e.preventDefault();
                    this.close();
                } else if (e.key === ' ' && !e.target.matches('input, textarea, [contenteditable]')) {
                    e.preventDefault();
                    this.toggle();
                } else if (e.key === 'ArrowUp' || e.key === '+' || e.key === '=') {
                    e.preventDefault();
                    this.adjustSpeed(25);
                } else if (e.key === 'ArrowDown' || e.key === '-') {
                    e.preventDefault();
                    this.adjustSpeed(-25);
                } else if (e.key === 'ArrowLeft') {
                    e.preventDefault();
                    this.seek(Math.max(0, (this.currentIndex / this.words.length) - 0.05));
                } else if (e.key === 'ArrowRight') {
                    e.preventDefault();
                    this.seek(Math.min(1, (this.currentIndex / this.words.length) + 0.05));
                } else if ((e.key === 'r' || e.key === 'R') && !e.target.matches('input, textarea, [contenteditable]')) {
                    e.preventDefault();
                    this.restart();
                }
            };

            document.addEventListener('keydown', this.keyHandler);
        }

        toggleTheme() {
            settings.theme = settings.theme === 'dark' ? 'light' : 'dark';
            this.overlay.element.className = `rsvp-theme-${settings.theme}`;
            chrome.storage.sync.set({ theme: settings.theme });
        }

        play() {
            if (this.words.length === 0) return;

            // Hide hint
            if (this.overlay.hint) {
                this.overlay.hint.style.display = 'none';
            }

            this.isPlaying = true;
            this.isPaused = false;
            this.updatePlayPauseButton();
            this.displayNextWord();
        }

        pause() {
            if (this.isPlaying) {
                this.isPlaying = false;
                this.isPaused = true;
                if (this.timeoutId) {
                    clearTimeout(this.timeoutId);
                    this.timeoutId = null;
                }
                this.updatePlayPauseButton();
            }
        }

        toggle() {
            if (this.isPlaying) {
                this.pause();
            } else {
                this.play();
            }
        }

        restart() {
            this.pause();
            this.currentIndex = 0;
            this.history = [];
            this.updateProgress();
            this.displayCurrentWord();
            if (this.overlay.hint) {
                this.overlay.hint.style.display = 'block';
            }
        }

        seek(position) {
            const newIndex = Math.floor(position * this.words.length);
            this.currentIndex = Math.max(0, Math.min(newIndex, this.words.length - 1));
            this.rebuildTrail();
            this.updateProgress();
            this.displayCurrentWord();
        }

        // Live seek for smooth dragging - updates display in real-time
        seekLive(position) {
            const newIndex = Math.floor(position * this.words.length);
            this.currentIndex = Math.max(0, Math.min(newIndex, this.words.length - 1));
            this.rebuildTrail();
            this.updateProgress();
            this.displayCurrentWord();
        }

        // Rebuild trail from words before current position
        rebuildTrail() {
            this.history = [];
            const trailLen = settings.trailLength || 3;
            const start = Math.max(0, this.currentIndex - trailLen);
            for (let i = start; i < this.currentIndex; i++) {
                this.history.push(this.words[i].text);
            }
        }

        // Load next paragraph from the page
        loadNextParagraph() {
            const nextText = this.getNextTextBlock();
            if (nextText && nextText.trim()) {
                this.appendText(nextText);
            }
        }

        // Load all remaining text from the page
        loadAllRemainingText() {
            let combinedText = '';
            let iterations = 0;
            const maxIterations = 100; // Safety limit

            // Keep getting next text blocks until none left
            while (iterations < maxIterations) {
                const nextText = this.getNextTextBlock();
                if (!nextText || !nextText.trim()) break;

                combinedText += nextText + ' ';
                iterations++;
            }

            if (combinedText.trim()) {
                this.appendText(combinedText.trim());
            } else {
                // Show feedback if no text found
                if (this.overlay.hint) {
                    this.overlay.hint.textContent = 'No more text found';
                    this.overlay.hint.style.display = 'block';
                    setTimeout(() => {
                        this.overlay.hint.style.display = 'none';
                    }, 1500);
                }
            }
        }

        // Show text editor modal
        showTextEditor() {
            this.pause();

            // Get current text from all words
            const currentText = this.words.map(w => w.text).join(' ');

            // Create modal
            const modal = document.createElement('div');
            modal.id = 'rsvp-text-editor-modal';
            modal.innerHTML = `
                <div class="rsvp-modal-backdrop"></div>
                <div class="rsvp-modal-content">
                    <div class="rsvp-modal-header">
                        <h3>View / Edit Text</h3>
                        <button class="rsvp-modal-close">&times;</button>
                    </div>
                    <div class="rsvp-modal-body">
                        <textarea class="rsvp-text-input" placeholder="Paste or type text here to read...">${currentText}</textarea>
                        <div class="rsvp-modal-info">
                            <span class="rsvp-word-count">${this.words.length} words</span>
                        </div>
                    </div>
                    <div class="rsvp-modal-footer">
                        <button class="rsvp-modal-btn rsvp-modal-btn-secondary rsvp-modal-cancel">Cancel</button>
                        <button class="rsvp-modal-btn rsvp-modal-btn-primary rsvp-modal-apply">Apply & Read</button>
                    </div>
                </div>
            `;

            document.body.appendChild(modal);

            const textarea = modal.querySelector('.rsvp-text-input');
            const wordCount = modal.querySelector('.rsvp-word-count');

            // Update word count on input
            textarea.addEventListener('input', () => {
                const words = textarea.value.trim().split(/\s+/).filter(w => w.length > 0);
                wordCount.textContent = `${words.length} words`;
            });

            // Close modal
            const closeModal = () => {
                modal.remove();
            };

            modal.querySelector('.rsvp-modal-close').addEventListener('click', closeModal);
            modal.querySelector('.rsvp-modal-cancel').addEventListener('click', closeModal);
            modal.querySelector('.rsvp-modal-backdrop').addEventListener('click', closeModal);

            // Apply text and start reading
            modal.querySelector('.rsvp-modal-apply').addEventListener('click', () => {
                const newText = textarea.value.trim();
                if (newText) {
                    this.words = processText(newText);
                    this.currentIndex = 0;
                    this.history = [];
                    this.sourceElement = null;
                    this.updateProgress();
                    this.displayCurrentWord();
                }
                closeModal();
            });

            // Focus textarea
            textarea.focus();
            textarea.select();
        }

        // Append new text to the word list
        appendText(text) {
            const newWords = processText(text);
            if (newWords.length === 0) return;

            const oldLength = this.words.length;
            this.words = this.words.concat(newWords);

            // Update progress display
            this.updateProgress();

            // Visual feedback
            if (this.overlay.hint) {
                this.overlay.hint.textContent = `+${newWords.length} words loaded`;
                this.overlay.hint.style.display = 'block';
                setTimeout(() => {
                    this.overlay.hint.style.display = 'none';
                }, 1500);
            }
        }

        // Get next text block from the page - starts from where user selected
        getNextTextBlock() {
            if (!this.sourceElement) {
                this.findSourceElement();
            }

            if (!this.sourceElement) {
                return '';
            }

            // First check: Get remaining text from the SAME paragraph
            // (in case user only selected part of a paragraph)
            if (!this.hasLoadedRestOfParagraph) {
                const paragraphText = this.sourceElement.textContent.trim();
                const alreadyReadText = this.words.map(w => w.text).join(' ');

                // Check if there's more text in this paragraph we haven't read
                if (paragraphText.length > alreadyReadText.length + 20) {
                    // Find text after what we've read
                    const lastWord = this.words[this.words.length - 1]?.text || '';
                    const lastIndex = paragraphText.lastIndexOf(lastWord);

                    if (lastIndex !== -1) {
                        const remainingText = paragraphText.substring(lastIndex + lastWord.length).trim();
                        if (remainingText.length > 20) {
                            this.hasLoadedRestOfParagraph = true;
                            return remainingText;
                        }
                    }
                }
                this.hasLoadedRestOfParagraph = true;
            }

            // Second: Get next paragraph(s)
            let current = this.sourceElement;
            let foundText = '';
            let count = 0;

            // Move to next sibling, or go up and find next
            while (count < 2) {
                current = this.getNextReadableElement(current);
                if (!current) break;

                const text = current.textContent.trim();
                if (text.length > 20) {
                    foundText += ' ' + text;
                    count++;
                    this.sourceElement = current; // Update source for next continue
                    this.hasLoadedRestOfParagraph = false; // Reset for new paragraph
                }
            }

            return foundText.trim();
        }

        // Find the next readable element in DOM order
        getNextReadableElement(el) {
            // Try next sibling first
            let next = el.nextElementSibling;
            while (next) {
                if (this.isReadableElement(next)) {
                    return next;
                }
                // Check children
                const readable = next.querySelector('p, li, h1, h2, h3, h4, h5, h6');
                if (readable && readable.textContent.trim().length > 20) {
                    return readable;
                }
                next = next.nextElementSibling;
            }

            // Go up and try parent's next sibling
            if (el.parentElement && el.parentElement !== document.body) {
                return this.getNextReadableElement(el.parentElement);
            }

            return null;
        }

        // Find the element where the user made their selection
        findSourceElement() {
            const selection = window.getSelection();
            if (!selection || selection.rangeCount === 0) return;

            let node = selection.anchorNode;
            if (!node) return;

            // Go up to find a paragraph or block element
            while (node && node.nodeType !== 1) {
                node = node.parentElement;
            }

            // Find the closest paragraph container
            while (node && !['P', 'DIV', 'ARTICLE', 'SECTION', 'LI'].includes(node.tagName)) {
                node = node.parentElement;
            }

            this.sourceElement = node;
        }

        // Get all remaining readable text from the page (from selection onwards)
        getAllRemainingText() {
            if (!this.sourceElement) {
                this.findSourceElement();
            }

            // If no source element found, get all visible paragraphs
            if (!this.sourceElement) {
                return this.getVisibleArticleText();
            }

            // Find the containing article/section
            let container = this.sourceElement;
            while (container && !['ARTICLE', 'SECTION', 'MAIN', 'BODY'].includes(container.tagName)) {
                container = container.parentElement;
            }
            if (!container) container = document.body;

            // Get all paragraphs in the container
            const allParagraphs = container.querySelectorAll('p, li, h1, h2, h3, h4, h5, h6');
            let text = '';
            let passedSource = false;

            allParagraphs.forEach(p => {
                // Check if this is or contains our source element
                const isSource = p === this.sourceElement ||
                    p.contains(this.sourceElement) ||
                    this.sourceElement?.contains(p);

                if (isSource) {
                    passedSource = true;
                    return; // Skip the source (already read)
                }

                // Only add paragraphs that come AFTER the source in DOM order
                if (passedSource || (this.sourceElement && p.compareDocumentPosition(this.sourceElement) & Node.DOCUMENT_POSITION_PRECEDING)) {
                    passedSource = true;
                    const content = p.textContent.trim();
                    if (content.length > 15) {
                        text += content + ' ';
                    }
                }
            });

            // If still no text found, try getting all visible text
            if (!text.trim()) {
                return this.getVisibleArticleText();
            }

            return text.trim();
        }

        // Extract readable text from an element
        extractReadableText(element) {
            const paragraphs = element.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li');
            let text = '';

            paragraphs.forEach(p => {
                const content = p.textContent.trim();
                if (content.length > 20) {
                    text += content + ' ';
                }
            });

            return text.trim();
        }

        // Get visible article text as fallback
        getVisibleArticleText() {
            const paragraphs = document.querySelectorAll('p');
            let text = '';

            paragraphs.forEach(p => {
                const content = p.textContent.trim();
                if (content.length > 30 && this.isVisible(p)) {
                    text += content + ' ';
                }
            });

            return text.trim();
        }

        // Check if element is readable content
        isReadableElement(el) {
            const tag = el.tagName.toLowerCase();
            return ['p', 'div', 'span', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'article', 'section'].includes(tag)
                && el.textContent.trim().length > 20;
        }

        // Check if element is visible
        isVisible(el) {
            const rect = el.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0;
        }

        adjustSpeed(delta) {
            settings.baseWPM = Math.max(50, Math.min(1500, settings.baseWPM + delta));
            this.overlay.speedDisplay.textContent = settings.baseWPM;
            chrome.storage.sync.set({ baseWPM: settings.baseWPM });
        }

        close() {
            this.pause();
            this.destroyOverlay();
        }

        destroyOverlay() {
            if (this.keyHandler) {
                document.removeEventListener('keydown', this.keyHandler);
                this.keyHandler = null;
            }

            const existing = document.getElementById('rsvp-overlay');
            if (existing) {
                existing.remove();
            }
            this.overlay = null;
        }

        displayCurrentWord() {
            if (this.currentIndex < 0 || this.currentIndex >= this.words.length) return;

            const word = this.words[this.currentIndex];
            const orpSplit = splitWordByORP(word.text);

            this.overlay.wordDisplay.before.textContent = orpSplit.before;
            this.overlay.wordDisplay.orp.textContent = orpSplit.orp;
            this.overlay.wordDisplay.after.textContent = orpSplit.after;

            // Center the ORP letter by calculating offset
            this.centerORP();

            // Update trail (previous words) from history
            if (settings.showTrail && this.history.length > 0) {
                const trailHtml = [...this.history].reverse()
                    .map((w, i) => {
                        const opacity = settings.trailOpacity * (1 - (i / (settings.trailLength + 1)));
                        return `<div class="rsvp-trail-word" style="opacity: ${opacity}">${w}</div>`;
                    })
                    .join('');

                if (settings.trailDirection === 'left') {
                    this.overlay.trailUp.innerHTML = '';
                    this.overlay.trailLeft.innerHTML = trailHtml;
                } else {
                    this.overlay.trailUp.innerHTML = trailHtml;
                    this.overlay.trailLeft.innerHTML = '';
                }
            } else {
                this.overlay.trailUp.innerHTML = '';
                this.overlay.trailLeft.innerHTML = '';
            }

            // Update preview (next words)
            if (settings.showPreview && this.overlay.previewContainer) {
                const nextWords = this.words.slice(this.currentIndex + 1, this.currentIndex + 3);
                const previewHtml = nextWords
                    .map((w, i) => {
                        const opacity = 0.5 - (i * 0.15);
                        return `<div class="rsvp-preview-word" style="opacity: ${opacity}">${w.text}</div>`;
                    })
                    .join('');
                this.overlay.previewContainer.innerHTML = previewHtml;
            }
        }

        centerORP() {
            // Disabled - CSS handles centering
            // The word is centered in the container via flex
        }

        displayNextWord() {
            if (!this.isPlaying || this.currentIndex >= this.words.length) {
                if (this.currentIndex >= this.words.length) {
                    this.isPlaying = false;
                    this.updatePlayPauseButton();
                }
                return;
            }

            const word = this.words[this.currentIndex];
            const orpSplit = splitWordByORP(word.text);

            // Update word display
            this.overlay.wordDisplay.before.textContent = orpSplit.before;
            this.overlay.wordDisplay.orp.textContent = orpSplit.orp;
            this.overlay.wordDisplay.after.textContent = orpSplit.after;

            // Center ORP at fixed position
            this.centerORP();

            // Update trail (previous words) - only previous words, not current
            if (settings.showTrail && this.currentIndex > 0) {
                // Only keep previous words, not current word
                // Add the previous word to history
                const prevWord = this.words[this.currentIndex - 1];
                if (prevWord) {
                    // Keep history at trailLength size
                    while (this.history.length >= settings.trailLength) {
                        this.history.shift();
                    }
                    // Only add if not already included (prevent duplicates)
                    if (this.history[this.history.length - 1] !== prevWord.text) {
                        this.history.push(prevWord.text);
                    }
                }

                const trailHtml = [...this.history].reverse()
                    .map((w, i) => {
                        const opacity = settings.trailOpacity * (1 - (i / (settings.trailLength + 1)));
                        return `<div class="rsvp-trail-word" style="opacity: ${opacity}">${w}</div>`;
                    })
                    .join('');

                // Show in correct direction
                if (settings.trailDirection === 'left') {
                    this.overlay.trailUp.innerHTML = '';
                    this.overlay.trailLeft.innerHTML = trailHtml;
                } else {
                    this.overlay.trailUp.innerHTML = trailHtml;
                    this.overlay.trailLeft.innerHTML = '';
                }
            }

            // Update preview (next words)
            if (settings.showPreview && this.overlay.previewContainer) {
                const nextWords = this.words.slice(this.currentIndex + 1, this.currentIndex + 3);
                const previewHtml = nextWords
                    .map((w, i) => {
                        const opacity = 0.3 - (i * 0.1);
                        return `<div class="rsvp-preview-word" style="opacity: ${opacity}">${w.text}</div>`;
                    })
                    .join('');
                this.overlay.previewContainer.innerHTML = previewHtml;
            }

            // Update progress
            this.updateProgress();

            // Dynamic font sizing for long words
            const wordLength = word.text.length;
            const wordEl = this.overlay.element.querySelector('.rsvp-word');
            if (wordEl) {
                if (wordLength > 14) {
                    // Very long words - scale down significantly
                    wordEl.style.fontSize = `${settings.fontSize * 0.65}px`;
                } else if (wordLength > 10) {
                    // Long words - scale down moderately
                    wordEl.style.fontSize = `${settings.fontSize * 0.8}px`;
                } else {
                    // Normal words - use default size
                    wordEl.style.fontSize = `${settings.fontSize}px`;
                }
            }

            // Calculate timing with word length consideration
            const speedRatio = this.calculateSpeedRatio();
            let delayMultiplier = word.delayMultiplier;

            // Add extra time for longer words (more than 6 characters)
            if (wordLength > 6) {
                const lengthBonus = 1 + (wordLength - 6) * 0.06;  // 6% more time per extra character
                delayMultiplier *= lengthBonus;
            }

            if (word.isParagraphEnd) {
                delayMultiplier = Math.max(delayMultiplier, settings.paragraphPauseMultiplier);
            }
            const duration = Math.round((60000 / settings.baseWPM) * delayMultiplier / speedRatio);

            // Move to next word
            this.currentIndex++;

            // Schedule next word
            this.timeoutId = setTimeout(() => this.displayNextWord(), duration);
        }

        calculateSpeedRatio() {
            if (this.currentIndex >= settings.rampWords) return 1.0;
            const progress = this.currentIndex / settings.rampWords;
            const easeOut = 1 - Math.pow(1 - progress, 2);
            return settings.startSpeedRatio + (1 - settings.startSpeedRatio) * easeOut;
        }

        updateProgress() {
            const progress = (this.currentIndex + 1) / this.words.length;
            this.overlay.progressBar.style.width = `${progress * 100}%`;
            this.overlay.progressText.textContent = `${this.currentIndex + 1} / ${this.words.length}`;
        }

        updatePlayPauseButton() {
            if (this.overlay?.playIcon && this.overlay?.pauseIcon) {
                this.overlay.playIcon.style.display = this.isPlaying ? 'none' : 'block';
                this.overlay.pauseIcon.style.display = this.isPlaying ? 'block' : 'none';
            }
        }

        updateSpeed(wpm) {
            if (this.overlay?.speedDisplay) {
                this.overlay.speedDisplay.textContent = wpm;
            }
        }
    }

    // ============================================
    // Global Instance
    // ============================================

    let controller = null;

    async function startRSVP(text) {
        if (!text || text.trim().length === 0) {
            console.warn('RSVP: No text provided');
            return;
        }

        // Close existing
        if (controller) {
            controller.close();
        }

        controller = new RSVPController();
        const success = await controller.init(text.trim());

        if (!success) {
            console.warn('RSVP: Failed to initialize');
        }
    }

    function getSelectedText() {
        return window.getSelection().toString();
    }

    // Start RSVP with the text editor open for custom text input
    async function startRSVPWithEditor() {
        // Close existing
        if (controller) {
            controller.close();
        }

        controller = new RSVPController();
        // Initialize with placeholder text
        await controller.init('Type or paste your text here...');

        // Immediately open the text editor
        setTimeout(() => {
            if (controller) {
                controller.showTextEditor();
            }
        }, 100);
    }

    // ============================================
    // Message Handling
    // ============================================

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.action === 'startRSVP') {
            startRSVP(message.text);
            sendResponse({ success: true });
        } else if (message.action === 'startRSVPFromSelection') {
            const text = getSelectedText();
            if (text) {
                startRSVP(text);
                sendResponse({ success: true });
            } else {
                sendResponse({ success: false, error: 'No text selected' });
            }
        } else if (message.action === 'startRSVPEmpty') {
            // Start with empty text and show text editor immediately
            startRSVPWithEditor();
            sendResponse({ success: true });
        } else if (message.action === 'togglePlayback') {
            if (controller) {
                controller.toggle();
                sendResponse({ success: true });
            } else {
                sendResponse({ success: false, error: 'No active reader' });
            }
        } else if (message.action === 'getSelection') {
            sendResponse({ text: getSelectedText() });
        }
        return true;
    });

    // ============================================
    // Initialize
    // ============================================

    console.log('RSVP Reader: Content script loaded');

})();
