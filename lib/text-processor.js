/**
 * Text Processor
 * Tokenizes text into words with timing metadata
 */

// Punctuation delay multipliers
const PUNCTUATION_DELAYS = {
    ',': 1.5,
    ';': 1.5,
    ':': 1.5,
    '.': 2.0,
    '!': 2.0,
    '?': 2.0,
    '—': 1.8,
    '–': 1.8,
    '-': 1.0,
    '"': 1.2,
    "'": 1.0,
    ')': 1.2,
    ']': 1.2,
    '…': 2.0
};

/**
 * Processes raw text into an array of word objects
 * Each word object contains: text, delayMultiplier, isNewParagraph
 */
export function processText(text) {
    if (!text || typeof text !== 'string') {
        return [];
    }

    // Normalize whitespace and split into paragraphs
    const paragraphs = text.split(/\n\s*\n/);
    const words = [];

    paragraphs.forEach((paragraph, paragraphIndex) => {
        // Split paragraph into words
        const paragraphWords = paragraph
            .replace(/\s+/g, ' ')
            .trim()
            .split(' ')
            .filter(w => w.length > 0);

        paragraphWords.forEach((word, wordIndex) => {
            const lastChar = word.charAt(word.length - 1);
            const delayMultiplier = PUNCTUATION_DELAYS[lastChar] || 1.0;

            // Check for ellipsis
            const hasEllipsis = word.includes('...');

            words.push({
                text: word,
                delayMultiplier: hasEllipsis ? 2.0 : delayMultiplier,
                isNewParagraph: wordIndex === 0 && paragraphIndex > 0,
                isParagraphEnd: wordIndex === paragraphWords.length - 1
            });
        });
    });

    return words;
}

/**
 * Gets the display duration for a word in milliseconds
 * @param {number} baseWPM - Base words per minute
 * @param {number} delayMultiplier - Punctuation-based delay multiplier
 * @param {number} speedRatio - Current speed ratio (for ramping)
 */
export function getWordDuration(baseWPM, delayMultiplier = 1.0, speedRatio = 1.0) {
    const baseMs = 60000 / baseWPM;
    return Math.round((baseMs * delayMultiplier) / speedRatio);
}

/**
 * Calculate speed ratio for gradual ramping
 * @param {number} wordIndex - Current word index
 * @param {number} rampWords - Number of words to reach full speed
 * @param {number} startRatio - Starting speed ratio (e.g., 0.5 = 50% speed)
 */
export function calculateSpeedRatio(wordIndex, rampWords = 20, startRatio = 0.5) {
    if (wordIndex >= rampWords) {
        return 1.0;
    }

    // Ease-out curve for smooth acceleration
    const progress = wordIndex / rampWords;
    const easeOut = 1 - Math.pow(1 - progress, 2);

    return startRatio + (1 - startRatio) * easeOut;
}
