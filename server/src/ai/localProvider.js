// Offline provider so the app runs end to end with no API key (demos, CI, tests).
//
// Embeddings: feature hashing of unigrams + bigrams into a fixed-size vector. This is
// LEXICAL similarity (shared words), not semantic — "car" won't match "automobile".
// Answers: extractive — the best-matching sentences from the retrieved chunks, cited.
// The API response reports provider "local" so nobody mistakes this for an LLM answer.

import { splitSentences } from '../rag/chunker.js';

const DIMS = 1024;
const STOPWORDS = new Set(
  ('a an and are as at be but by can did do does for from had has have how i if in into is it its ' +
    'me my of on or our so than that the their them then there these they this to was we were ' +
    'what when where which who why will with you your about after all also any been more most no not ' +
    'only other out over such some just up very would should could').split(' '),
);

export function tokenize(text) {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t))
    .map(stem);
}

// Tiny suffix stripper; enough to make "embeddings" match "embedding".
function stem(t) {
  if (t.length > 5 && t.endsWith('ing')) return t.slice(0, -3);
  if (t.length > 4 && t.endsWith('ies')) return `${t.slice(0, -3)}y`;
  if (t.length > 3 && t.endsWith('s') && !t.endsWith('ss')) return t.slice(0, -1);
  return t;
}

function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function hashEmbed(text) {
  const vec = new Float32Array(DIMS);
  const tokens = tokenize(text);
  const features = [...tokens, ...tokens.slice(1).map((t, i) => `${tokens[i]}_${t}`)];
  const tf = new Map();
  for (const f of features) tf.set(f, (tf.get(f) || 0) + 1);
  for (const [f, count] of tf) {
    const h = fnv1a(f);
    const sign = h & 1 ? 1 : -1; // signed hashing reduces collision bias
    vec[h % DIMS] += sign * (1 + Math.log(count));
  }
  return Array.from(vec);
}

function extractiveAnswer(question, sources) {
  const qTokens = new Set(tokenize(question));
  const candidates = [];
  const seen = new Set();
  for (const s of sources) {
    for (const sentence of s.text.split(/\n+/).flatMap(splitSentences)) {
      if (seen.has(sentence)) continue; // overlapping chunks repeat sentences
      seen.add(sentence);
      const toks = tokenize(sentence);
      if (toks.length < 3) continue; // headings and fragments aren't answers
      const overlap = new Set(toks.filter((t) => qTokens.has(t))).size;
      if (overlap > 0) candidates.push({ ref: s.ref, sentence, score: overlap / Math.sqrt(toks.length) });
    }
  }
  if (candidates.length === 0) return "I couldn't find anything in your saved content that answers this.";

  candidates.sort((a, b) => b.score - a.score);
  // Keep only sentences that are nearly as relevant as the best one.
  const picked = candidates.filter((c) => c.score >= candidates[0].score * 0.6).slice(0, 3);
  return picked.map((c) => `${c.sentence} [${c.ref}]`).join(' ');
}

export function createLocalProvider() {
  return {
    name: 'local',
    embeddingModel: `local-hash-${DIMS}-v1`,
    chatModel: 'local-extractive-v1',
    async embed(texts) {
      return texts.map(hashEmbed);
    },
    async answer({ question, sources }) {
      return { text: extractiveAnswer(question, sources), usage: null };
    },
  };
}
