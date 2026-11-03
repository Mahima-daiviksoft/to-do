// Builds the interactive single-page book: chapters + metadata + flashcards injected into template2.html.
import fs from 'node:fs';
import path from 'node:path';
import { Marked } from 'marked';
import hljs from 'highlight.js';

const REPO = new URL('../../../', import.meta.url).pathname;  // repository root
const GH = 'https://github.com/mahima-daiviksoft/to-do/blob/claude/stoic-hypatia-yuhefx/';
const D = 'docs/websocket-stomp-guide/';

const chapters = [
  { id: 'intro', file: D + 'README.md', num: '', label: 'Start here', part: 'Welcome', blurb: 'How the book is organised, the whole story in one paragraph, and the picture to keep in your head.' },
  { id: 'ch01', file: D + '01-foundations.md', num: '1', label: 'Foundations', part: 'Basics', blurb: 'TCP, HTTP, polling, long polling and SSE, and why WebSocket had to be invented.' },
  { id: 'ch02', file: D + '02-websocket-protocol.md', num: '2', label: 'The WebSocket protocol', part: 'Basics', blurb: 'The handshake, every bit of a frame, masking, ping/pong and close codes (RFC 6455).' },
  { id: 'ch03', file: D + '03-websocket-browser-api.md', num: '3', label: 'The browser API', part: 'Basics', blurb: 'new WebSocket(), its five big limits, and reconnecting without hurting your servers.' },
  { id: 'ch04', file: D + '04-stomp-protocol.md', num: '4', label: 'The STOMP protocol', part: 'Basics', blurb: 'Frames, headers, heart-beats, acks, receipts and transactions, written out by hand.' },
  { id: 'ch05', file: D + '05-spring-stomp-server.md', num: '5', label: 'Spring server', part: 'Building', blurb: 'Channels, @MessageMapping, user destinations, events, interceptors and limits.' },
  { id: 'ch06', file: D + '06-clients.md', num: '6', label: 'Clients', part: 'Building', blurb: 'stompjs, React, React Native, Angular, Java and SockJS, with their traps.' },
  { id: 'ch07', file: D + '07-brokers-and-scaling.md', num: '7', label: 'Brokers & scaling', part: 'Production', blurb: 'Simple broker vs RabbitMQ relay, backplanes, load balancers, Kubernetes, deploys.' },
  { id: 'ch08', file: D + '08-security.md', num: '8', label: 'Security', part: 'Production', blurb: 'Hijacking, JWT on CONNECT, subscription authorisation, token expiry, DoS limits.' },
  { id: 'ch09', file: D + '09-reliability-performance.md', num: '9', label: 'Reliability & performance', part: 'Production', blurb: 'Delivery guarantees, resync, ordering, slow clients, thread pools, metrics, load tests.' },
  { id: 'ch10', file: D + '10-testing-debugging-troubleshooting.md', num: '10', label: 'Testing & bug encyclopedia', part: 'Production', blurb: 'How to test it, how to debug it, and 85+ real bugs looked up by symptom.' },
  { id: 'ch11', file: D + '11-architecture-best-practices.md', num: '11', label: 'Architecture & practices', part: 'Production', blurb: 'Reference architecture, naming, versioning, design patterns, SLOs and runbooks.' },
  { id: 'ch12', file: D + '12-interview-questions.md', num: '12', label: 'Interview Q&A · part 1', part: 'Interviews', blurb: 'Fundamentals, protocol, browser, STOMP and Spring questions with full answers.' },
  { id: 'ch12b', file: D + '12-interview-questions-part2.md', num: '12b', label: 'Interview Q&A · part 2', part: 'Interviews', blurb: 'Security, scaling, debugging scenarios, system design, coding and gotchas.' },
  { id: 'ch13', file: D + '13-cheatsheet-glossary.md', num: '13', label: 'Cheat sheet & glossary', part: 'Interviews', blurb: 'Everything on one page, every term defined, and a 10-day study plan.' },
  { id: 'appa', file: D + '14-appendix-other-stacks.md', num: 'A', label: 'Beyond Spring STOMP', part: 'Appendices', blurb: 'Jakarta WebSocket, WebFlux, RSocket, Kafka gateways, Socket.IO, SignalR, GraphQL, Yjs.' },
  { id: 'appb', file: 'examples/stomp-todo/README.md', num: 'B', label: 'Runnable sample project', part: 'Appendices', blurb: 'A tested Spring Boot 4 server and TypeScript / React Native client.' },
  { id: 'appc', file: D + '15-verification-notes.md', num: 'C', label: 'Verification & sources', part: 'Appendices', blurb: 'What was checked, against which source code and documents.' },
];
const byFile = new Map(chapters.map((c) => [path.normalize(c.file), c.id]));

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const slug = (s) => s.toLowerCase().replace(/<[^>]+>/g, '').replace(/&[a-z]+;/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
const numLabel = (n) => (!n ? 'Introduction' : /^[A-C]$/.test(n) ? 'Appendix ' + n : 'Chapter ' + n);

function codeBlock(code, lang) {
  const language = (lang || '').trim().split(/\s+/)[0];
  const map = { jsonc: 'json' };
  const l = map[language] || language;
  let html;
  try { html = l && hljs.getLanguage(l) ? hljs.highlight(code, { language: l }).value : esc(code); } catch { html = esc(code); }
  return `<div class="code" data-lang="${esc(language)}">${language ? `<span class="code-lang">${esc(language)}</span>` : ''}<pre><code>${html}</code></pre></div>\n`;
}

function makeMarked(ch, used, heads) {
  const dir = path.dirname(ch.file);
  const m = new Marked({ gfm: true });
  m.use({
    renderer: {
      heading(text, level, raw) {
        let id = `${ch.id}-${slug(raw) || 'h'}`;
        while (used.has(id)) id += '-x';
        used.add(id);
        if (level === 1) return `<header class="ch-head"><div class="ch-kicker"><span class="ch-num">${numLabel(ch.num)}</span><span class="ch-part">${esc(ch.part)}</span></div><h1 id="${id}" class="ch-title">${text.replace(/^(Chapter|Appendix)\s+[0-9A-Z]+b?:\s*/i, '')}</h1><p class="ch-meta" data-meta></p></header>\n`;
        if (level === 2) heads.push({ id, text: raw.replace(/`/g, '') });
        return `<h${level} id="${id}">${text}</h${level}>\n`;
      },
      code: codeBlock,
      table(header, body) { return `<div class="table-wrap"><table><thead>${header}</thead><tbody>${body}</tbody></table></div>\n`; },
      link(href, title, text) {
        let h = href || '';
        if (!/^(https?:|mailto:|#)/.test(h)) {
          const [p, hash] = h.split('#');
          const target = path.normalize(path.join(dir, p));
          h = byFile.has(target) ? '#' + byFile.get(target) : GH + target + (hash ? '#' + hash : '');
        }
        const ext = /^https?:/.test(h) ? ' target="_blank" rel="noopener"' : '';
        return `<a href="${esc(h)}"${ext}>${text}</a>`;
      },
      blockquote(quote) {
        const mm = quote.match(/^<p><strong>([^<]{2,40}?)[.:]?<\/strong>/);
        let kind = 'note';
        if (mm) {
          const k = mm[1].toLowerCase();
          if (/pitfall|caveat|trap|honesty/.test(k)) kind = 'pitfall';
          else if (k.includes('interview')) kind = 'interview';
          else if (k.includes('eli5')) kind = 'eli5';
          else if (/deep dive|important|note|key point/.test(k)) kind = 'note';
        }
        return `<blockquote class="call call-${kind}">${quote}</blockquote>\n`;
      },
    },
  });
  return m;
}

let totalWords = 0;
const meta = [];
const html = chapters.map((ch) => {
  const md = fs.readFileSync(path.join(REPO, ch.file), 'utf8');
  const words = md.split(/\s+/).filter(Boolean).length;
  totalWords += words;
  const heads = [];
  const body = makeMarked(ch, new Set(), heads).parse(md);
  meta.push({ id: ch.id, num: ch.num, label: ch.label, part: ch.part, blurb: ch.blurb, minutes: Math.max(3, Math.round(words / 200)), heads });
  return `<article class="chapter" id="${ch.id}" data-ch="${ch.id}">\n${body}</article>`;
}).join('\n');

// ---------- flashcards from the interview chapters ----------
const cardMarked = new Marked({ gfm: true });
cardMarked.use({ renderer: { code: codeBlock, table(h, b) { return `<div class="table-wrap"><table><thead>${h}</thead><tbody>${b}</tbody></table></div>`; },
  link(href, t, text) { return /^https?:/.test(href) ? `<a href="${esc(href)}" target="_blank" rel="noopener">${text}</a>` : text; } } });
const cards = [];
for (const f of ['12-interview-questions.md', '12-interview-questions-part2.md']) {
  const lines = fs.readFileSync(path.join(REPO, D, f), 'utf8').split('\n');
  let topic = '';
  let cur = null;
  const flush = () => { if (cur) { cur.a = cardMarked.parse(cur.a.join('\n').trim()); cards.push(cur); cur = null; } };
  for (const line of lines) {
    const h2 = line.match(/^## [A-Z]\. (.+)$/);
    const q = line.match(/^\*\*([A-P]\d+)\. \[(E\/M|E|M|S)\] (.+?)\*\*\s*$/);
    const g = line.match(/^(\d+)\. \*\*"(.+?)"\*\* (.+)$/);
    if (h2) { flush(); topic = h2[1].replace(/\s*\(.*\)$/, ''); continue; }
    if (q) { flush(); cur = { id: q[1], level: q[2] === 'E/M' ? 'E' : q[2], topic, q: q[3], a: [] }; continue; }
    if (g && /gotcha/i.test(topic)) { flush(); cards.push({ id: 'N' + g[1], level: 'M', topic: 'Gotchas', q: g[2], a: cardMarked.parse(g[3]) }); continue; }
    if (/^---\s*$/.test(line) || /^## /.test(line) || /^Continue to|^Back to the/.test(line)) { flush(); continue; }
    if (cur) cur.a.push(line);
  }
  flush();
}
for (const c of cards) c.q = cardMarked.parseInline(c.q);

const json = (x) => JSON.stringify(x).replace(/</g, '\\u003c');
const tpl = fs.readFileSync(new URL('./template2.html', import.meta.url), 'utf8');
const script = fs.readFileSync(new URL('./app.js', import.meta.url), 'utf8');
if (/<\/script/i.test(script)) throw new Error('app.js must not contain a closing script tag');
// Fill small placeholders first and the chapter HTML last, so book content is never scanned for placeholders.
const out = tpl
  .replace('{{SCRIPT}}', () => script)
  .replace('{{META}}', () => json(meta))
  .replace('{{CARDS}}', () => json(cards))
  .replaceAll('{{WORDS}}', Math.round(totalWords / 1000) + 'k')
  .replaceAll('{{NCARDS}}', String(cards.length))
  .replace('{{CHAPTERS}}', () => html);
fs.writeFileSync(process.argv[2], out);
console.log('wrote', process.argv[2], (out.length / 1024).toFixed(0) + ' KB', 'words', totalWords, 'cards', cards.length,
  'levels', JSON.stringify(cards.reduce((a, c) => ((a[c.level] = (a[c.level] || 0) + 1), a), {})),
  'topics', [...new Set(cards.map((c) => c.topic))].length);
