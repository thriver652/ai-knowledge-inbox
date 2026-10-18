import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { chunkText, normalizeText } from '../src/rag/chunker.js';

const sentence = (i) => `Sentence number ${i} talks about topic ${i} in some detail.`;

describe('chunkText', () => {
  it('returns no chunks for empty or whitespace input', () => {
    assert.deepEqual(chunkText(''), []);
    assert.deepEqual(chunkText('   \n\n  '), []);
  });

  it('keeps a short note as a single chunk', () => {
    assert.deepEqual(chunkText('Buy milk.\n\nCall mum.'), ['Buy milk.\n\nCall mum.']);
  });

  it('never exceeds the target size and never splits mid-sentence', () => {
    const text = Array.from({ length: 60 }, (_, i) => sentence(i)).join(' ');
    const chunks = chunkText(text, { targetChars: 300, overlapChars: 80 });
    assert.ok(chunks.length > 5);
    for (const c of chunks) {
      assert.ok(c.length <= 300, `chunk too long: ${c.length}`);
      assert.match(c, /^Sentence number \d+/);
      assert.match(c, /detail\.$/);
    }
  });

  it('overlaps consecutive chunks by whole sentences', () => {
    const text = Array.from({ length: 20 }, (_, i) => sentence(i)).join(' ');
    const chunks = chunkText(text, { targetChars: 250, overlapChars: 80 });
    for (let i = 1; i < chunks.length; i++) {
      const firstSentence = chunks[i].match(/^[^.]+\./)[0];
      assert.ok(chunks[i - 1].includes(firstSentence), `chunk ${i} does not start with overlap`);
    }
  });

  it('covers every sentence of the source', () => {
    const sentences = Array.from({ length: 40 }, (_, i) => sentence(i));
    const joined = chunkText(sentences.join(' '), { targetChars: 300, overlapChars: 60 }).join(' ');
    for (const s of sentences) assert.ok(joined.includes(s), `missing: ${s}`);
  });

  it('hard-splits a single sentence longer than the budget', () => {
    const long = 'word '.repeat(400).trim();
    const chunks = chunkText(long, { targetChars: 200, overlapChars: 20 });
    assert.ok(chunks.length >= 10);
    for (const c of chunks) assert.ok(c.length <= 200);
  });

  it('does not treat decimals or version numbers as sentence ends', () => {
    const text = `The SLA is 99.9 percent and we run v2.1 in prod. ${'Filler sentence here. '.repeat(30)}`;
    const chunks = chunkText(text, { targetChars: 120, overlapChars: 30 });
    assert.ok(chunks[0].startsWith('The SLA is 99.9 percent and we run v2.1 in prod.'));
  });

  it('rejects overlap >= target', () => {
    assert.throws(() => chunkText('x', { targetChars: 100, overlapChars: 100 }));
  });
});

describe('normalizeText', () => {
  it('collapses spaces and excess blank lines but keeps paragraphs', () => {
    assert.equal(normalizeText('  a   b \r\n\r\n\r\n\r\n c\t d  '), 'a b\n\nc d');
  });
});
