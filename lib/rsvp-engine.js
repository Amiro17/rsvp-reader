/**
 * RSVP Engine
 * Core engine for Rapid Serial Visual Presentation
 */

import { processText, getWordDuration, calculateSpeedRatio } from './text-processor.js';
import { splitWordByORP } from './orp-calculator.js';

export class RSVPEngine {
    constructor(options = {}) {
        this.options = {
            baseWPM: options.baseWPM || 300,
            rampWords: options.rampWords || 20,
            startSpeedRatio: options.startSpeedRatio || 0.5,
            paragraphPauseMultiplier: options.paragraphPauseMultiplier || 3.0,
            onWord: options.onWord || (() => { }),
            onProgress: options.onProgress || (() => { }),
            onComplete: options.onComplete || (() => { }),
            onStateChange: options.onStateChange || (() => { })
        };

        this.words = [];
        this.currentIndex = 0;
        this.isPlaying = false;
        this.isPaused = false;
        this.timeoutId = null;
        this.history = []; // For fading trail
        this.historySize = 3;
    }

    /**
     * Load text into the engine
     */
    load(text) {
        this.stop();
        this.words = processText(text);
        this.currentIndex = 0;
        this.history = [];
        return this.words.length;
    }

    /**
     * Start or resume playback
     */
    play() {
        if (this.words.length === 0) return;

        if (this.isPaused) {
            this.isPaused = false;
            this.isPlaying = true;
            this.options.onStateChange('playing');
            this.displayNextWord();
        } else if (!this.isPlaying) {
            this.isPlaying = true;
            this.isPaused = false;
            this.options.onStateChange('playing');
            this.displayNextWord();
        }
    }

    /**
     * Pause playback
     */
    pause() {
        if (this.isPlaying) {
            this.isPlaying = false;
            this.isPaused = true;
            if (this.timeoutId) {
                clearTimeout(this.timeoutId);
                this.timeoutId = null;
            }
            this.options.onStateChange('paused');
        }
    }

    /**
     * Toggle play/pause
     */
    toggle() {
        if (this.isPlaying) {
            this.pause();
        } else {
            this.play();
        }
    }

    /**
     * Stop and reset
     */
    stop() {
        this.isPlaying = false;
        this.isPaused = false;
        if (this.timeoutId) {
            clearTimeout(this.timeoutId);
            this.timeoutId = null;
        }
        this.currentIndex = 0;
        this.history = [];
        this.options.onStateChange('stopped');
    }

    /**
     * Restart from beginning
     */
    restart() {
        this.stop();
        this.play();
    }

    /**
     * Seek to a specific position (0-1)
     */
    seek(position) {
        const newIndex = Math.floor(position * this.words.length);
        this.currentIndex = Math.max(0, Math.min(newIndex, this.words.length - 1));
        this.history = [];

        // Update progress
        this.options.onProgress(this.currentIndex / this.words.length, this.currentIndex, this.words.length);

        // Display current word if paused
        if (this.isPaused && this.words[this.currentIndex]) {
            this.emitWord(this.words[this.currentIndex]);
        }
    }

    /**
     * Adjust speed (WPM)
     */
    setSpeed(wpm) {
        this.options.baseWPM = Math.max(50, Math.min(1500, wpm));
    }

    /**
     * Get current speed
     */
    getSpeed() {
        return this.options.baseWPM;
    }

    /**
     * Display the next word
     */
    displayNextWord() {
        if (!this.isPlaying || this.currentIndex >= this.words.length) {
            if (this.currentIndex >= this.words.length) {
                this.isPlaying = false;
                this.options.onStateChange('completed');
                this.options.onComplete();
            }
            return;
        }

        const word = this.words[this.currentIndex];

        // Calculate timing
        const speedRatio = calculateSpeedRatio(
            this.currentIndex,
            this.options.rampWords,
            this.options.startSpeedRatio
        );

        let delayMultiplier = word.delayMultiplier;
        if (word.isParagraphEnd) {
            delayMultiplier = Math.max(delayMultiplier, this.options.paragraphPauseMultiplier);
        }

        const duration = getWordDuration(this.options.baseWPM, delayMultiplier, speedRatio);

        // Emit the word
        this.emitWord(word);

        // Update progress
        this.options.onProgress(
            (this.currentIndex + 1) / this.words.length,
            this.currentIndex + 1,
            this.words.length
        );

        // Move to next word
        this.currentIndex++;

        // Schedule next word
        this.timeoutId = setTimeout(() => {
            this.displayNextWord();
        }, duration);
    }

    /**
     * Emit word event with ORP split and history
     */
    emitWord(word) {
        const orpSplit = splitWordByORP(word.text);

        // Add to history for fading trail
        if (this.history.length >= this.historySize) {
            this.history.shift();
        }
        this.history.push(word.text);

        this.options.onWord({
            current: orpSplit,
            text: word.text,
            history: [...this.history].reverse().slice(1), // Exclude current word
            index: this.currentIndex,
            total: this.words.length
        });
    }

    /**
     * Get current state
     */
    getState() {
        return {
            isPlaying: this.isPlaying,
            isPaused: this.isPaused,
            currentIndex: this.currentIndex,
            totalWords: this.words.length,
            progress: this.words.length > 0 ? this.currentIndex / this.words.length : 0,
            speed: this.options.baseWPM
        };
    }
}
