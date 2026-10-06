"""Review manuscript.tex one body paragraph at a time in the browser.

    python3 review.py [file.tex]    (default: manuscript.tex in the current folder)

Figures, tables, equations, headings and comments are skipped. Edits are
written straight back to the .tex file. Save (Ctrl+S) also rebuilds the PDF and
points the LaTeX Workshop viewer at the caret. The side panel chats with a local
OpenAI-compatible model (LM Studio) that is given the manuscript as context.
"""

import base64
import hashlib
import json
import os
import re
import socket
import subprocess
import sys
import time
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.request import Request, urlopen

HERE = Path(__file__).parent
TEX = Path(sys.argv[1] if len(sys.argv) > 1 else "manuscript.tex").resolve()
PAGE = HERE / "review.html"
EDITOR = "cursor"  # process name of the editor running LaTeX Workshop
PORT = 8765
# Defaults for the chat model; the gear in the chat panel overrides them per browser.
LLM = "http://127.0.0.1:1234/v1"  # any OpenAI-compatible base URL
MODEL = "google/gemma-4-e4b"

SYSTEM = """You are helping the author of a journal manuscript revise it one \
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
--- END MANUSCRIPT ---"""

TEXT_ENVS = {"abstract": "Abstract", "acknowledgments": "Acknowledgments"}
BEGIN = re.compile(r"\s*\\begin\{([^}]+)\}")
END = re.compile(r"\s*\\end\{([^}]+)\}")
HEADING = re.compile(r"\s*\\((?:sub)*)section\*?\{(.*)\}\s*$")
NOT_BODY = re.compile(
    r"\s*(%|\\(?:(?:sub)*section|label|input|maketitle|appendix|renewcommand"
    r"|makeatletter|makeatother|@addtoreset|clearpage)(?![a-zA-Z]))"
)


def parse(lines):
    """Return [(start, end, section)] line ranges of body paragraphs."""
    chunks, start, section, skip_env, started = [], None, "", None, False
    appendix = None  # letters A, B, ... once \\appendix is passed

    def close(i):
        nonlocal start
        if start is not None:
            chunks.append((start, i, section))
            start = None

    for i, line in enumerate(lines):
        if skip_env:
            if (m := END.match(line)) and m[1] == skip_env:
                skip_env = None
            continue
        if line.startswith("\\bibliography"):
            break
        if m := BEGIN.match(line):
            close(i)
            if m[1] in TEXT_ENVS:
                started, section = True, TEXT_ENVS[m[1]]
            elif m[1] != "document":
                skip_env = m[1]
            continue
        if not started:
            continue
        if m := HEADING.match(line):
            close(i)
            # "Section › Subsection": keep the parents, replace this level and below.
            depth = len(m[1]) // 3
            title = re.sub(r"\\label\{[^}]*\}", "", m[2]).strip()
            if appendix and depth == 0:
                title = f"Appendix {next(appendix)}: {title}"
            section = " › ".join(section.split(" › ")[:depth] + [title])
        elif line.startswith("\\appendix"):
            close(i)
            appendix = iter("ABCDEFGHIJKLMNOPQRSTUVWXYZ")
        elif not line.strip() or END.match(line) or NOT_BODY.match(line):
            close(i)
        elif start is None:
            start = i
    close(len(lines))
    return chunks


def load():
    lines = TEX.read_text().split("\n")
    return lines, parse(lines)


# Review marks live next to the .tex file as a list of paragraph-text hashes, so a mark
# belongs to the exact wording: change the text anywhere and that paragraph is unreviewed again.
MARKS = TEX.with_suffix(".reviewed.json")


def digest(text):
    return hashlib.sha1(text.encode()).hexdigest()[:12]


def marks():
    try:
        return set(json.loads(MARKS.read_text()))
    except (OSError, ValueError):
        return set()


# Track changes: for each paragraph edited here, the text it had before the first edit,
# keyed by the hash of its current text.
EDITS = TEX.with_suffix(".edits.json")


def originals():
    try:
        return json.loads(EDITS.read_text())
    except (OSError, ValueError):
        return {}


def payload(lines, chunks):
    done, before = marks(), originals()
    texts = ["\n".join(lines[a:b]) for a, b, _ in chunks]
    return [
        {"text": t, "section": c[2], "reviewed": digest(t) in done, "original": before.get(digest(t))}
        for t, c in zip(texts, chunks)
    ]


def context_tokens(url, model):
    """Loaded context window as LM Studio reports it; 8192 for servers that don't say."""
    try:
        models = json.load(urlopen(url.removesuffix("/v1") + "/api/v0/models", timeout=5))["data"]
        return next(m["loaded_context_length"] for m in models if m["id"] == model)
    except (OSError, ValueError, KeyError, TypeError, StopIteration):
        return 8192


def manuscript_context(i, ctx):
    """Body text for the model, trimmed around paragraph i to fit a ctx-token window."""
    parts = payload(*load())
    budget = (ctx - 2500) * 3  # leave room for the chat and reply; ~3 chars per LaTeX token
    i = min(i, len(parts) - 1)
    keep = set()
    # Abstract first, then paragraphs nearest the current one.
    for k in sorted(range(len(parts)), key=lambda k: (k != 0, abs(k - i))):
        budget -= len(parts[k]["text"])
        if budget < 0 and k not in (0, i):
            break
        keep.add(k)
    out, section = [], None
    for k in sorted(keep):
        if parts[k]["section"] != section:
            section = parts[k]["section"]
            out.append(f"## {section}")
        out.append(parts[k]["text"])
    if len(keep) == len(parts):
        note, scope = "sees full manuscript", "This is the full body text."
    else:
        note = f"sees {len(keep)}/{len(parts)} paragraphs"
        scope = (
            "Only the abstract and the paragraphs nearest the one on screen fit in "
            "your context. If a question depends on text you were not given, say so."
        )
    return SYSTEM.format(scope=scope, body="\n\n".join(out)), note


def workshop_port():
    """Port of the LaTeX Workshop viewer server running inside the editor, or None."""
    listening = subprocess.run(["ss", "-ltnpH"], capture_output=True, text=True).stdout
    for m in re.finditer(rf'127\.0\.0\.1:(\d+)\s.*\("{EDITOR}"', listening):
        try:
            if urlopen(f"http://127.0.0.1:{m[1]}/viewer.html", timeout=1).status == 200:
                return int(m[1])
        except OSError:
            pass


def ws_send(port, *messages):
    """Send JSON messages to a local WebSocket server, half a second apart."""
    with socket.create_connection(("127.0.0.1", port), timeout=3) as s:
        key = base64.b64encode(os.urandom(16)).decode()
        s.sendall(
            f"GET / HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nOrigin: http://127.0.0.1:{port}\r\n"
            f"Upgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: {key}\r\n"
            "Sec-WebSocket-Version: 13\r\n\r\n".encode()
        )
        s.recv(4096)
        for msg in messages:
            data, mask = json.dumps(msg).encode(), os.urandom(4)
            size = bytes([0x80 | len(data)]) if len(data) < 126 else b"\xfe" + len(data).to_bytes(2, "big")
            s.sendall(b"\x81" + size + mask + bytes(c ^ mask[k % 4] for k, c in enumerate(data)))
            time.sleep(0.5)


def point_viewer(line, before, after):
    """Show LaTeX Workshop's red SyncTeX marker at a source position. True if it was asked to.

    Workshop only marks where its own editor cursor is, and its viewer server takes no
    "mark here" message. It does take the viewer's two messages: a click in the PDF
    (which moves the editor cursor) and "page loaded" (which marks the cursor position).
    So we look up where the line sits in the PDF and send both. This stays inside the
    editor window, unlike `cursor -g`, which asks the desktop for focus.
    """
    pdf = TEX.with_suffix(".pdf")
    where = subprocess.run(
        ["synctex", "view", "-i", f"{line}:{len(before) + 1}:{TEX}", "-o", str(pdf)],
        capture_output=True, text=True,
    ).stdout
    m = re.search(r"Page:(\d+)\nx:([\d.]+)\ny:([\d.]+)", where)
    port = workshop_port()
    if not (m and port):
        return False
    ws_send(
        port,
        {
            "type": "reverse_synctex", "pdfFileUri": pdf.as_uri(),
            "page": int(m[1]), "pos": [float(m[2]), float(m[3])],
            "textBeforeSelection": before, "textAfterSelection": after,
        },
        {"type": "loaded", "pdfFileUri": pdf.as_uri()},
    )
    return True


class Handler(BaseHTTPRequestHandler):
    def send(self, body, ctype="application/json", status=200):
        data = body if isinstance(body, bytes) else json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path.startswith("/bleb/"):
            name = self.path.removeprefix("/bleb/").split("?", 1)[0]
            allowed = {"bleb.js", "content.js", "activities.js", "life.js", "inertia.js", "bleb.css", "demo.html"}
            if name not in allowed:
                return self.send(b"Not found", "text/plain", status=404)
            mime = "text/css" if name.endswith(".css") else "text/html" if name.endswith(".html") else "text/javascript"
            return self.send((HERE / "bleb" / name).read_bytes(), mime + "; charset=utf-8")
        if self.path == "/chunks":
            self.send(payload(*load()))
        else:
            # Read on every request, so edits to review.html show on refresh without a restart.
            page = PAGE.read_text().replace("__LLM__", LLM).replace("__MODEL__", MODEL)
            self.send(page.encode(), "text/html; charset=utf-8")

    def do_POST(self):
        req = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        if self.path == "/chat":
            return self.chat(req)
        if self.path == "/build":
            return self.build(req)
        if self.path == "/mark":
            done = marks() ^ ({digest(req["text"])} if (digest(req["text"]) in marks()) != req["on"] else set())
            lines, chunks = load()
            current = {digest("\n".join(lines[a:b])) for a, b, _ in chunks}
            MARKS.write_text(json.dumps(sorted(done & current)))  # drop marks for text that no longer exists
            return self.send(payload(lines, chunks))
        lines, chunks = load()
        i = req["i"]
        # Refuse if the file changed under us (editor, another session).
        if i >= len(chunks) or "\n".join(lines[chunks[i][0]:chunks[i][1]]) != req["old"]:
            return self.send(payload(lines, chunks), status=409)
        a, b, _ = chunks[i]
        new = req["new"].replace("\r\n", "\n").strip("\n")
        lines[a:b] = new.split("\n") if new else []
        TEX.write_text("\n".join(lines))
        lines, chunks = load()
        before = originals()
        base = before.pop(digest(req["old"]), req["old"])  # carry the original through repeated edits
        if new != base:
            before[digest(new)] = base
        current = {digest("\n".join(lines[a:b])) for a, b, _ in chunks}
        EDITS.write_text(json.dumps({k: v for k, v in before.items() if k in current}, indent=1))
        self.send(payload(lines, chunks))

    def build(self, req):
        """Rebuild the PDF, then have LaTeX Workshop highlight the caret position in its viewer."""
        lines, chunks = load()
        a, b, _ = chunks[min(req["i"], len(chunks) - 1)]
        before = "\n".join(lines[a:b])[: req.get("offset", 0)]
        row, col = a + before.count("\n"), len(before) - before.rfind("\n") - 1
        try:
            r = subprocess.run(["./build.sh"], cwd=TEX.parent, capture_output=True, text=True)
            pointed = r.returncode == 0 and point_viewer(row + 1, lines[row][:col], lines[row][col:])
        except OSError as e:
            return self.send({"ok": False, "log": str(e)})
        self.send({"ok": r.returncode == 0, "pointed": pointed, "log": (r.stdout + r.stderr)[-400:]})

    def chat(self, req):
        url = (req.get("url") or LLM).rstrip("/")
        model = req.get("model") or MODEL
        ctx = int(req.get("ctx") or 0) or context_tokens(url, model)
        system, note = manuscript_context(req["i"], ctx)
        headers = {"Content-Type": "application/json", "User-Agent": "manuscript-review"}
        if req.get("key"):
            headers["Authorization"] = "Bearer " + req["key"]
        body = {
            "model": model,
            "stream": True,
            "messages": [{"role": "system", "content": system}] + req["messages"],
        }
        try:
            up = urlopen(Request(url + "/chat/completions", json.dumps(body).encode(), headers))
        except (OSError, ValueError) as e:
            detail = e.read().decode(errors="replace") if hasattr(e, "read") else str(e)
            return self.send({"error": detail}, status=502)
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("X-Context", note)
        self.end_headers()
        try:
            for line in up:
                self.wfile.write(line)
                self.wfile.flush()
        except OSError:  # browser pressed Stop
            up.close()

    def log_message(self, *args):
        pass


if __name__ == "__main__":
    url = f"http://127.0.0.1:{PORT}"
    print(f"Reviewing {TEX} at {url}  (Ctrl+C to stop)")
    webbrowser.open(url)
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
