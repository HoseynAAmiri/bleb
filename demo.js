// review.py in the browser, for the static demo (GitHub Pages). It answers the page's
// requests (chunks, save, mark, build, chat) itself and keeps the mock paper, the reviewed
// marks and the tracked edits in localStorage. Nothing is sent anywhere, except a chat
// question to the model endpoint you enter under the gear.
// parse(), the save and mark rules and SYSTEM mirror review.py; change them together.

const PAPER = 'demo/paper.tex';
const KEY = { tex: 'blebDemo.tex', marks: 'blebDemo.reviewed', edits: 'blebDemo.edits' };

const SYSTEM = `You are helping the author of a journal manuscript revise it one \
paragraph at a time. The manuscript is written in LaTeX. Its body text is given \
below so you can check how any paragraph fits the argument, the terminology, and \
what has already been said elsewhere.

Each message from the author names the paragraph on screen, sometimes a \
highlighted part of it, and then a question or request. Requests are usually one \
of: explain what a passage says or why it is there, rephrase it, or point out \
weaknesses and suggest fixes. When a part is highlighted, work on that part and \
use the rest of the paragraph only as context.

Not every request is a rewrite. If the author asks for something new, such as an \
equation, a transition sentence, or a definition, write it, and use the paragraph \
to decide what it should say. If the request is too vague to act on, ask one \
short question instead of returning the paragraph unchanged.

When you rewrite text, give the rewritten LaTeX first, ready to paste, then at \
most two sentences on what you changed. Keep every \\cite, \\ref, label, math \
expression, number, and unit exactly as written, because the author cannot \
verify changes to them here. Do not add facts, numbers, claims, or citations \
that are not in the manuscript; if a rewrite would need one, say what is missing \
instead. Keep the paper's own terms for a concept rather than swapping in \
synonyms.

Write the way a careful scientist writes: plain words, direct statements, the \
claim before the qualification. Avoid promotional or inflated wording such as \
"crucial", "pivotal", "highlights", "underscores", "sheds light on". Keep \
answers short; the author is reading many paragraphs in a row.

{scope}

--- MANUSCRIPT ---
{body}
--- END MANUSCRIPT ---`;

const TEXT_ENVS = { abstract: 'Abstract', acknowledgments: 'Acknowledgments' };
const BEGIN = /^\s*\\begin\{([^}]+)\}/;
const END = /^\s*\\end\{([^}]+)\}/;
const HEADING = /^\s*\\((?:sub)*)section\*?\{(.*)\}\s*$/;
const NOT_BODY = /^\s*(%|\\(?:(?:sub)*section|label|input|maketitle|appendix|renewcommand|makeatletter|makeatother|@addtoreset|clearpage)(?![a-zA-Z]))/;

// [[start, end, section]] line ranges of body paragraphs.
function parse(lines) {
  const chunks = [];
  let start = null, section = '', skipEnv = null, started = false, appendix = null, m;
  const close = i => { if (start !== null) { chunks.push([start, i, section]); start = null; } };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (skipEnv) { if ((m = END.exec(line)) && m[1] === skipEnv) skipEnv = null; continue; }
    if (line.startsWith('\\bibliography')) break;
    if ((m = BEGIN.exec(line))) {
      close(i);
      if (m[1] in TEXT_ENVS) { started = true; section = TEXT_ENVS[m[1]]; }
      else if (m[1] !== 'document') skipEnv = m[1];
      continue;
    }
    m = HEADING.exec(line);
    if (!started && !m) continue;  // body starts at the abstract or the first heading
    if (m) {
      close(i); started = true;
      // "Section › Subsection": keep the parents, replace this level and below.
      const depth = m[1].length / 3;
      let title = m[2].replace(/\\label\{[^}]*\}/g, '').trim();
      if (appendix !== null && depth === 0) title = `Appendix ${String.fromCharCode(65 + appendix++)}: ${title}`;
      section = [...section.split(' › ').slice(0, depth), title].join(' › ');
    } else if (line.startsWith('\\appendix')) { close(i); appendix = 0; }
    else if (!line.trim() || END.test(line) || NOT_BODY.test(line)) close(i);
    else if (start === null) start = i;
  }
  close(lines.length);
  return chunks;
}

const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
const write = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} };

let tex = read(KEY.tex, null);
if (typeof tex !== 'string') tex = (await (await fetch(PAPER)).text()).replace(/\r\n/g, '\n');

// A mark belongs to the exact wording, so the text is its own key.
const digest = text => text;
const load = () => { const lines = tex.split('\n'); return [lines, parse(lines)]; };
const textOf = (lines, [a, b]) => lines.slice(a, b).join('\n');

function payload(lines, chunks) {
  const done = new Set(read(KEY.marks, [])), before = read(KEY.edits, {});
  return chunks.map(c => {
    const text = textOf(lines, c);
    return { text, section: c[2], reviewed: done.has(digest(text)), original: before[digest(text)] ?? null };
  });
}

function save(req) {
  let [lines, chunks] = load();
  const c = chunks[req.i];
  if (!c || textOf(lines, c) !== req.old) return [payload(lines, chunks), 409];
  const text = req.new.replace(/\r\n/g, '\n').replace(/^\n+|\n+$/g, '');
  lines.splice(c[0], c[1] - c[0], ...(text ? text.split('\n') : []));
  tex = lines.join('\n'); write(KEY.tex, tex);
  [lines, chunks] = load();
  const before = read(KEY.edits, {});
  const base = before[digest(req.old)] ?? req.old;  // carry the original through repeated edits
  delete before[digest(req.old)];
  if (text !== base) before[digest(text)] = base;
  const current = new Set(chunks.map(c => digest(textOf(lines, c))));
  write(KEY.edits, Object.fromEntries(Object.entries(before).filter(([k]) => current.has(k))));
  return [payload(lines, chunks), 200];
}

function mark(req) {
  const [lines, chunks] = load(), done = new Set(read(KEY.marks, []));
  if (req.on) done.add(digest(req.text)); else done.delete(digest(req.text));
  const current = new Set(chunks.map(c => digest(textOf(lines, c))));
  write(KEY.marks, [...done].filter(k => current.has(k)));  // drop marks for text that no longer exists
  return [payload(lines, chunks), 200];
}

// Body text for the model, trimmed around paragraph i to fit a ctx-token window.
function manuscriptContext(i, ctx) {
  const parts = payload(...load());
  let budget = (ctx - 2500) * 3;  // leave room for the chat and reply; ~3 chars per LaTeX token
  i = Math.min(i, parts.length - 1);
  const keep = new Set();
  const order = parts.map((_, k) => k).sort((a, b) => (a !== 0) - (b !== 0) || Math.abs(a - i) - Math.abs(b - i));
  for (const k of order) {  // abstract first, then paragraphs nearest the current one
    budget -= parts[k].text.length;
    if (budget < 0 && k !== 0 && k !== i) break;
    keep.add(k);
  }
  const out = [];
  let section = null;
  for (const k of [...keep].sort((a, b) => a - b)) {
    if (parts[k].section !== section) out.push('## ' + (section = parts[k].section));
    out.push(parts[k].text);
  }
  const full = keep.size === parts.length;
  const scope = full ? 'This is the full body text.'
    : 'Only the abstract and the paragraphs nearest the one on screen fit in your context. If a question depends on text you were not given, say so.';
  return [SYSTEM.replace('{scope}', scope).replace('{body}', () => out.join('\n\n')), full ? 'sees full manuscript' : `sees ${keep.size}/${parts.length} paragraphs`];
}

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

// The demo has no model of its own: the browser calls the endpoint from the settings directly.
async function chat(req, signal) {
  const url = (req.url || '').replace(/\/+$/, '');
  if (!url || !req.model) return json({ error: 'The online demo has no model of its own. Open the gear above and enter the base URL and model of an OpenAI-compatible server (and a key if it needs one).' }, 502);
  const [system, note] = manuscriptContext(req.i, +req.ctx || 8192);
  const headers = { 'Content-Type': 'application/json' };
  if (req.key) headers.Authorization = 'Bearer ' + req.key;
  let up;
  try {
    up = await fetch(url + '/chat/completions', { method: 'POST', headers, signal, body: JSON.stringify({ model: req.model, stream: true, messages: [{ role: 'system', content: system }, ...req.messages] }) });
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    return json({ error: `Could not reach ${url} from the browser. The server must be running and allow cross-origin (CORS) requests.` }, 502);
  }
  if (!up.ok) return json({ error: (await up.text()) || up.statusText }, 502);
  return new Response(up.body, { headers: { 'Content-Type': 'text/event-stream', 'X-Context': note } });
}

const real = window.fetch.bind(window);
window.fetch = async (input, init = {}) => {
  if (typeof input !== 'string' || !/^(chunks|save|mark|build|chat)$/.test(input)) return real(input, init);
  const req = init.body ? JSON.parse(init.body) : {};
  if (input === 'chunks') return json(payload(...load()));
  if (input === 'save') return json(...save(req));
  if (input === 'mark') return json(...mark(req));
  if (input === 'build') return json({ ok: true, note: 'kept in this browser (the demo builds no PDF)' });
  return chat(req, init.signal);
};

// What the page says about itself in the demo.
document.getElementById('set-url').placeholder = 'https://…/v1';
document.getElementById('set-model').placeholder = 'model name';
document.querySelector('#set-ctx').previousSibling.textContent = 'Context tokens (blank = 8192)';
const note = document.createElement('div');
note.className = 'hint';
note.innerHTML = 'Demo: a mock paper, edited and saved only in this browser. <a href="#" id="demo-download">Download paper.tex</a> · <a href="#" id="demo-reset">Start over</a> · <a href="https://github.com/HoseynAAmiri/bleb">Run it on your own manuscript</a>';
document.querySelector('main').append(note);
for (const a of note.querySelectorAll('a')) a.style.color = 'inherit';
document.getElementById('demo-download').onclick = e => {
  e.preventDefault();
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([tex], { type: 'text/x-tex' })), download: 'paper.tex' });
  a.click(); URL.revokeObjectURL(a.href);
};
document.getElementById('demo-reset').onclick = e => {
  e.preventDefault();
  try { for (const k of [...Object.values(KEY), 'reviewIndex']) localStorage.removeItem(k); } catch {}
  location.reload();
};
