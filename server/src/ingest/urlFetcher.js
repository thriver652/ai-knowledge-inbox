import dns from 'node:dns/promises';
import net from 'node:net';
import * as cheerio from 'cheerio';
import { Errors } from '../errors.js';

const MAX_REDIRECTS = 3;
const NOISE_SELECTORS =
  'script, style, noscript, iframe, svg, nav, header, footer, aside, form, button, [role="navigation"], [aria-hidden="true"]';

// --- SSRF guard -----------------------------------------------------------------------
// The server fetches arbitrary user-supplied URLs, so refuse anything that resolves to
// loopback / private / link-local space (cloud metadata at 169.254.169.254, etc.).
// Every redirect hop is re-checked. Known gap: DNS rebinding between check and connect —
// production should pin the resolved IP or go through an egress proxy.

function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return (
      a === 10 || a === 127 || a === 0 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127)
    );
  }
  const v6 = ip.toLowerCase();
  if (v6.startsWith('::ffff:')) return isPrivateIp(v6.slice(7));
  return v6 === '::1' || v6 === '::' || v6.startsWith('fc') || v6.startsWith('fd') || v6.startsWith('fe80');
}

async function assertPublicHost(url, allowPrivate) {
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw Errors.urlNotAllowed('Only http and https URLs are supported.');
  }
  if (allowPrivate) return;
  const host = url.hostname.replace(/^\[|\]$/g, '');
  let addresses;
  try {
    addresses = net.isIP(host) ? [{ address: host }] : await dns.lookup(host, { all: true });
  } catch {
    throw Errors.urlFetchFailed(`Could not resolve host "${url.hostname}".`);
  }
  if (addresses.some((a) => isPrivateIp(a.address))) {
    throw Errors.urlNotAllowed('URLs pointing to private or local network addresses are not allowed.');
  }
}

// --- Fetching -----------------------------------------------------------------------

async function readBodyCapped(res, maxBytes) {
  const reader = res.body.getReader();
  const parts = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw Errors.urlFetchFailed(`Page is larger than the ${Math.round(maxBytes / 1e6)} MB limit.`);
    }
    parts.push(value);
  }
  return Buffer.concat(parts).toString('utf8');
}

async function fetchWithGuards(startUrl, { timeoutMs, maxBytes, allowPrivate }) {
  let url = new URL(startUrl);
  const signal = AbortSignal.timeout(timeoutMs);

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublicHost(url, allowPrivate);
    let res;
    try {
      res = await fetch(url, {
        redirect: 'manual',
        signal,
        headers: { 'user-agent': 'KnowledgeInboxBot/1.0 (+single-user demo)', accept: 'text/html,text/plain;q=0.9,*/*;q=0.1' },
      });
    } catch (err) {
      const reason = err.name === 'TimeoutError' ? `timed out after ${timeoutMs} ms` : err.cause?.code || err.message;
      throw Errors.urlFetchFailed(`Could not fetch the URL: ${reason}.`);
    }

    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      url = new URL(res.headers.get('location'), url);
      continue;
    }
    if (!res.ok) {
      throw Errors.urlFetchFailed(`The site responded with HTTP ${res.status}.`);
    }
    const contentType = (res.headers.get('content-type') || '').toLowerCase();
    if (!contentType.includes('text/html') && !contentType.includes('text/plain')) {
      throw Errors.urlFetchFailed(`Unsupported content type "${contentType || 'unknown'}". Only HTML and plain-text pages can be saved.`);
    }
    return { finalUrl: url.toString(), contentType, body: await readBodyCapped(res, maxBytes) };
  }
  throw Errors.urlFetchFailed(`Too many redirects (more than ${MAX_REDIRECTS}).`);
}

// --- Extraction ---------------------------------------------------------------------

export function extractReadableText(html) {
  const $ = cheerio.load(html);
  const title = ($('meta[property="og:title"]').attr('content') || $('title').first().text() || '').trim();
  $(NOISE_SELECTORS).remove();

  // Prefer the main content region when the page marks one up.
  const root = ['article', 'main', '[role="main"]'].map((s) => $(s).first()).find((el) => el.length) || $('body');

  // Turn block elements into paragraph breaks so the chunker can see structure.
  root.find('p, div, section, li, h1, h2, h3, h4, h5, h6, pre, blockquote, tr, br').each((_, el) => {
    $(el).append('\n\n');
  });
  const text = root.text().replace(/[ \t]+/g, ' ').replace(/\n\s*\n\s*/g, '\n\n').trim();
  return { title: title.slice(0, 300) || null, text };
}

export async function fetchUrlContent(url, { timeoutMs, maxBytes, maxChars, allowPrivate }) {
  const { finalUrl, contentType, body } = await fetchWithGuards(url, { timeoutMs, maxBytes, allowPrivate });
  const { title, text } = contentType.includes('text/html')
    ? extractReadableText(body)
    : { title: null, text: body.trim() };

  if (text.length < 20) {
    throw Errors.emptyContent('No readable text was found on that page (it may require JavaScript or a login).');
  }
  return { finalUrl, title, text: text.slice(0, maxChars), truncated: text.length > maxChars };
}
