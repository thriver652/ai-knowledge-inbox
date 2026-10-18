// Structure-aware chunking: paragraphs -> sentences -> words, packed greedily up to a
// character budget, with a sentence-aligned overlap between neighbouring chunks.
//
// Why this shape (see README "Chunking"):
//  - Notes and articles are written in paragraphs; keeping them whole keeps an idea intact.
//  - ~800 chars (~200 tokens) is small enough that one chunk is about one thing (precise
//    retrieval) and large enough to carry its own context when shown to the LLM.
//  - Overlap is made of whole sentences so no chunk starts mid-sentence, and a fact that
//    straddles a boundary still appears whole in at least one chunk.

// A sentence ends at . ! or ? (plus closing quotes/brackets) followed by whitespace,
// so "99.9", "v2.1" and "e.g.x" don't split.
const SENTENCE_BOUNDARY = /(?<=[.!?]["')\]]*)\s+/;

export function splitSentences(text) {
  return text.split(SENTENCE_BOUNDARY).map((s) => s.trim()).filter(Boolean);
}

export function normalizeText(text) {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t\f\v ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function hardSplit(text, maxChars) {
  const words = text.split(' ');
  const out = [];
  let cur = '';
  for (const w of words) {
    if (cur && cur.length + 1 + w.length > maxChars) {
      out.push(cur);
      cur = '';
    }
    // A single "word" longer than the budget (e.g. a giant URL) is sliced as-is.
    if (w.length > maxChars) {
      for (let i = 0; i < w.length; i += maxChars) out.push(w.slice(i, i + maxChars));
      continue;
    }
    cur = cur ? `${cur} ${w}` : w;
  }
  if (cur) out.push(cur);
  return out;
}

// Break text into units no larger than maxChars, preferring the largest natural unit.
function toUnits(text, maxChars) {
  const units = [];
  for (const para of text.split(/\n{2,}/)) {
    const p = para.replace(/\n/g, ' ').trim();
    if (!p) continue;
    if (p.length <= maxChars) {
      units.push({ text: p, paragraphEnd: true });
      continue;
    }
    const sentences = splitSentences(p).flatMap((s) =>
      s.length <= maxChars ? [s] : hardSplit(s, maxChars),
    );
    sentences.forEach((s, i) => units.push({ text: s, paragraphEnd: i === sentences.length - 1 }));
  }
  return units;
}

const joinUnits = (units) =>
  units.reduce((acc, u, i) => {
    if (i === 0) return u.text;
    return acc + (units[i - 1].paragraphEnd ? '\n\n' : ' ') + u.text;
  }, '');

export function chunkText(rawText, { targetChars = 800, overlapChars = 150 } = {}) {
  if (overlapChars >= targetChars) throw new Error('overlapChars must be smaller than targetChars');
  const text = normalizeText(rawText);
  if (!text) return [];

  const units = toUnits(text, targetChars);
  const chunks = [];
  let current = [];
  let currentLen = 0;
  let carried = 0; // how many units at the start of `current` are overlap from the last chunk

  const flush = () => {
    chunks.push(joinUnits(current));
    // Seed the next chunk with trailing sentences that fit in the overlap budget.
    const carry = [];
    let carryLen = 0;
    for (let i = current.length - 1; i > 0; i--) {
      const len = current[i].text.length + 1;
      if (carryLen + len > overlapChars) break;
      carry.unshift(current[i]);
      carryLen += len;
    }
    current = carry;
    currentLen = carryLen;
    carried = carry.length;
  };

  for (const unit of units) {
    if (current.length && currentLen + unit.text.length > targetChars) {
      if (current.length > carried) {
        flush();
      }
      // Overlap alone + this unit doesn't fit: drop the overlap rather than emit a chunk
      // made only of text we've already emitted.
      if (current.length && currentLen + unit.text.length > targetChars) {
        current = [];
        currentLen = 0;
        carried = 0;
      }
    }
    current.push(unit);
    currentLen += unit.text.length + 2;
  }
  if (current.length > carried) chunks.push(joinUnits(current));
  return chunks;
}
