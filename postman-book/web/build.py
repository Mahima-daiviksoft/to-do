#!/usr/bin/env python3
"""Build the interactive web edition of the Postman book.

Usage:  MMDC=/path/to/mmdc python3 build.py
Output: postman-book.html (artifact body, no doctype) and index.html (standalone page).
Needs: pandoc, and mermaid-cli (mmdc) with a Chromium for the diagrams.
"""
import base64, html, json, os, re, subprocess, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
BOOK = os.path.dirname(HERE)
MMDC = os.environ.get("MMDC", "mmdc")
CHROME = os.environ.get("CHROME", "/opt/pw-browsers/chromium-1194/chrome-linux/chrome")

PARTS = [
    ("Foundations", ["01", "02", "03", "04"]),
    ("Core skills", ["05", "06", "07", "08", "09", "10"]),
    ("Automation & platform", ["11", "12", "13"]),
    ("Teams, security & debugging", ["14", "15", "16", "17"]),
    ("Interview preparation", ["18a", "18b", "18c", "18d"]),
    ("Practice & reference", ["19", "20"]),
    ("Advanced topics", ["21", "22", "23", "24", "25", "26"]),
    ("Appendix", ["27"]),
]
LEVEL = {"01": "e", "02": "e", "03": "e", "04": "e", "05": "i", "06": "i", "07": "i", "08": "i",
         "09": "x", "10": "i", "11": "x", "12": "i", "13": "i", "14": "x", "15": "x", "16": "i",
         "17": "x", "18a": "e", "18b": "i", "18c": "x", "18d": "x", "19": "a", "20": "a",
         "21": "x", "22": "i", "23": "x", "24": "x", "25": "x", "26": "a", "27": "a"}

files = sorted(f for f in os.listdir(BOOK) if re.match(r"^\d\d[a-z]?-.*\.md$", f))
key_of = lambda f: re.match(r"^(\d\d[a-z]?)", f).group(1)
file_by_key = {key_of(f): f for f in files}

tmp = tempfile.mkdtemp()
pp = os.path.join(tmp, "pp.json")
open(pp, "w").write(json.dumps({"executablePath": CHROME, "args": ["--no-sandbox"]}))


def render_diagram(src, idx):
    out = []
    for theme in ("default", "dark"):
        mmd = os.path.join(tmp, f"d{idx}.mmd")
        svg = os.path.join(tmp, f"d{idx}-{theme}.svg")
        open(mmd, "w").write(src)
        subprocess.run([MMDC, "-p", pp, "-i", mmd, "-o", svg, "-t", theme, "-b", "transparent"],
                       check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        out.append("data:image/svg+xml;base64," + base64.b64encode(open(svg, "rb").read()).decode())
    return ('<figure class="diagram"><img class="dg-light" alt="Diagram" src="%s">'
            '<img class="dg-dark" alt="Diagram" src="%s"></figure>' % tuple(out))


def fix_links(md):
    def repl(m):
        label, target = m.group(1), m.group(2)
        base = target.split("#")[0]
        if base in files:
            return f"[{label}](#ch-{key_of(base)})"
        if base == "README.md":
            return f"[{label}](#home)"
        if base.startswith("verification"):
            return f"{label} (the `postman-book/verification/` folder in the repository)"
        return m.group(0)
    return re.sub(r"\[([^\]]+)\]\(([^)\s]+)\)", repl, md)


LV_CHIP = {"🟢": '<span class="lvl lvl-e">Entry</span>', "🟡": '<span class="lvl lvl-i">Mid</span>',
           "🔴": '<span class="lvl lvl-x">Senior</span>'}

chapters, diagram_no = [], 0
for f in files:
    k = key_of(f)
    md = open(os.path.join(BOOK, f), encoding="utf-8").read()
    title_line = md.split("\n", 1)[0].lstrip("# ").strip()
    m = re.match(r"Chapter\s+(\w+)\s+—\s+(.*)", title_line)
    num, title = (m.group(1), m.group(2)) if m else (k, title_line)
    words = len(re.findall(r"\w+", md))
    diagrams = {}

    def mrepl(mm):
        global diagram_no
        diagram_no += 1
        diagrams[diagram_no] = render_diagram(mm.group(1), diagram_no)
        return f'\n<div data-dg="{diagram_no}"></div>\n'
    md = re.sub(r"```mermaid\n(.*?)```", mrepl, md, flags=re.S)
    md = fix_links(md)
    body = subprocess.run(["pandoc", "-f", "gfm", "-t", "html5", f"--id-prefix=c{k}-"],
                          input=md, capture_output=True, text=True, check=True).stdout
    for n, fig in diagrams.items():
        body = body.replace(f'<div data-dg="{n}"></div>', fig)
    for e, chip in LV_CHIP.items():
        body = body.replace(e, chip)
    body = re.sub(r"<h1[^>]*>.*?</h1>", "", body, count=1, flags=re.S)  # page header renders the title
    chapters.append({"key": k, "num": num, "title": title, "level": LEVEL.get(k, "a"),
                     "minutes": max(3, round(words / 200)), "words": words, "html": body})

# glossary flashcards
gl = open(os.path.join(BOOK, file_by_key["19"]), encoding="utf-8").read()
gl = gl.split("## 19.7", 1)[1].split("\n## ", 1)[0]
cards = [{"t": a.strip(), "d": b.strip()} for a, b in re.findall(r"^\| \*\*(.+?)\*\* \| (.+?) \|$", gl, re.M)]

qa_count = sum(len(re.findall(r"^\*\*(?:Q\d+|S\d+|C\d+|A\d+|Q)\. ", open(os.path.join(BOOK, file_by_key[k])).read(), re.M))
               for k in ("18a", "18b", "18c", "18d"))
total_words = sum(c["words"] for c in chapters)

meta = [{k: c[k] for k in ("key", "num", "title", "level", "minutes")} for c in chapters]
parts = [{"name": n, "keys": ks} for n, ks in PARTS]
templates = "\n".join(f'<template id="tpl-{c["key"]}">{c["html"]}</template>' for c in chapters)

page = open(os.path.join(HERE, "template.html"), encoding="utf-8").read()
data = json.dumps({"chapters": meta, "parts": parts, "cards": cards, "qaCount": qa_count,
                   "words": total_words, "diagrams": diagram_no}, ensure_ascii=False)
page = (page.replace("/*__DATA__*/null", data.replace("</", "<\\/"))
            .replace("<!--__TEMPLATES__-->", templates)
            .replace("__QA__", str(qa_count))
            .replace("__WORDS__", f"{round(total_words / 1000)},000")
            .replace("__CHAPTERS__", str(len(chapters)))
            .replace("__DIAGRAMS__", str(diagram_no)))
open(os.path.join(HERE, "postman-book.html"), "w", encoding="utf-8").write(page)
standalone = ('<!doctype html>\n<html lang="en">\n<head><meta charset="utf-8">'
              '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">'
              '</head>\n<body>\n' + page + "\n</body>\n</html>\n")
open(os.path.join(HERE, "index.html"), "w", encoding="utf-8").write(standalone)
print(f"chapters={len(chapters)} diagrams={diagram_no} cards={len(cards)} qa={qa_count} "
      f"words={total_words} size={len(page)/1e6:.2f}MB")
