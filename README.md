# Bleb

Read and revise a LaTeX manuscript one paragraph at a time in the browser. Bleb, a small jelly mascot, keeps you company while you work.

The tool shows each body paragraph typeset, lets you edit it in place, and writes the change straight back to the `.tex` file. It starts at the abstract or the first section heading, and skips figures, tables, equations, headings and comments.

## Run

```bash
python3 review.py path/to/manuscript.tex
```

The page opens at `http://127.0.0.1:8765`. With no argument, the tool looks for `manuscript.tex` in the current folder.

Python 3 with the standard library is enough. Nothing is installed and nothing leaves your machine, apart from KaTeX, which the page loads from a CDN to typeset math, and any chat model you point it at.

## Use

| Action | Result |
| --- | --- |
| Click | Puts a reading caret in the text. Type to edit the typeset text. |
| Double-click | Switches the paragraph to raw LaTeX, for math, citations and commands. |
| `Ctrl+S` | Saves and rebuilds the PDF. |
| `Ctrl+Enter` | Saves, marks the paragraph reviewed and moves to the next one. |
| `Alt+←` / `Alt+→` | Moves between paragraphs without marking. |
| **Edits** switch | Shows what you changed in each paragraph as tracked insertions and deletions. |
| **Reviewed** switch | Marks or unmarks the current paragraph. |

A reviewed mark belongs to the exact wording. If the text of a paragraph changes, in this tool or in your editor, that paragraph is unreviewed again.

## Files it writes

The tool edits your `.tex` file and keeps two progress files next to it:

- `<name>.reviewed.json`: which paragraphs you marked reviewed.
- `<name>.edits.json`: the original text of each paragraph you edited, for the tracked-changes view.

Both are safe to delete, and you may want them in your `.gitignore`.

## Optional parts

**PDF rebuild.** On save, the tool runs `./build.sh` from the manuscript's folder if that file exists, and `latexmk -pdf` otherwise.

**PDF viewer sync.** After a rebuild, the tool asks the LaTeX Workshop viewer to jump to the caret. This needs `synctex` and LaTeX Workshop running in the editor named by `EDITOR` in `review.py` (default `cursor`).

**Chat.** The side panel sends the paragraph and the manuscript text to an OpenAI-compatible model. The default is LM Studio at `http://127.0.0.1:1234/v1`. The gear in the chat panel sets the base URL, model, API key and context size for your browser.

The port, the editor name and the chat defaults are constants at the top of `review.py`.

## The mascot

Bleb lives in [`bleb/`](bleb/) and can be embedded in other pages. See [`bleb/README.md`](bleb/README.md), or open `/bleb/demo.html` on the running server to try every activity.
