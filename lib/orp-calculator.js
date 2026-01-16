/**
 * ORP (Optimal Recognition Point) Calculator
 * Calculates where the eye naturally focuses in a word
 */

export function calculateORP(word) {
  // Remove any non-letter characters for length calculation
  const cleanWord = word.replace(/[^a-zA-Z\u00C0-\u017F]/g, '');
  const len = cleanWord.length;
  
  if (len <= 1) return 0;
  if (len <= 4) return 1;
  if (len <= 8) return Math.floor(len * 0.3);
  if (len <= 13) return Math.floor(len * 0.25);
  return Math.floor(len * 0.2);
}

/**
 * Formats a word with ORP highlighting
 * Returns an object with before, orp, and after parts
 */
export function splitWordByORP(word) {
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
