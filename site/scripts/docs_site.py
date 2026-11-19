#!/usr/bin/env python3
"""docs_site.py — generate a responsive, multi-page static docs site.

Zero-dependency. The agent supplies content (Markdown) plus a small JSON
config; this script computes the HTML, navigation, themes, i18n and a
responsive, dependency-free layout:

- 860px mobile breakpoint with a full-screen navigation panel.
- Fluid content width that follows the viewport.
- Multi-page static output: one self-contained HTML file per page.
- Markdown integration with optional YAML front-matter.
- A "list" page type that renders a data table (e.g. pull requests) with
  client-side sorting (by any column, incl. commit count and last-updated),
  text filters and status badges.
- A light/dark theme switch and an EN/中 language toggle.

Usage:
  python3 docs_site.py generate --config site.json --content ./docs --out ./out
  python3 docs_site.py check   --out ./out
"""

import argparse
import html
import json
import os
import re
import sys

DEFAULTS = {
    "title": "Documentation",
    "tagline": "",
    "description": "",
    "repo": "",
    "base_url": "",
    "theme": "auto",
    "lang": "en",
    "i18n": ["en", "zh"],
    "nav": [],
    "pages": [],
    "breakpoint": 860,
}


def fail(msg):
    print("docs_site: error: " + msg, file=sys.stderr)
    raise SystemExit(2)


def read_config(path):
    if not os.path.isfile(path):
        fail("config not found: " + path)
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    cfg = dict(DEFAULTS)
    cfg.update(data)
    if not isinstance(cfg.get("pages"), list) or not cfg["pages"]:
        fail("config must define a non-empty 'pages' list")
    return cfg


# ---- bilingual site extensions ------------------------------------------------
LOCALES = ("zh", "en")


def ltext(cfg, lang, key, default=""):
    return cfg.get("locales", {}).get(lang, {}).get(key, default)


def page_href(slug, lang):
    safe = re.sub(r"[^a-z0-9-]", "-", slug.lower())
    return safe + ".html" if lang == "zh" else "en/" + safe + ".html"


def rel_href(slug, cur_lang, target_lang):
    """Link to a page relative to the current page's directory (en pages live in en/)."""
    target = page_href(slug, target_lang)
    if cur_lang == "en":
        return target[3:] if target_lang == "en" else "../" + target
    return "./" + target


def rewrite_md_links(body_html, lang):
    """Rewrite *.md links emitted by md_to_html into language-aware static page links."""

    def repl(match):
        href = match.group(1)
        raw = href.split("#", 1)
        target = raw[0]
        anchor = ("#" + raw[1]) if len(raw) > 1 and raw[1] else ""
        key = target
        tlang = lang
        if key.startswith("./"):
            key = key[2:]
        elif key.startswith("../"):
            tlang, key = "zh", key[3:]
        if key.startswith("en/"):
            tlang, key = "en", key[3:]
        key = re.sub(r"\.md$", "", key)
        return '<a href="' + rel_href(key, lang, tlang) + anchor + '">'

    return re.sub(r'<a href="([^"]+\.md(?:#[^"]*)?)">', repl, body_html)


def repo_url(cfg):
    repo = cfg.get("repo", "")
    if not repo:
        return ""
    return repo if repo.startswith("http") else "https://" + repo


def read_file(path):
    if not os.path.isfile(path):
        fail("missing file: " + path)
    with open(path, "r", encoding="utf-8") as f:
        return f.read()


def split_front_matter(text):
    """Return (meta_dict, body). Only supports a YAML-ish 'key: value' block."""
    meta = {}
    if text.startswith("---"):
        end = text.find("\n---", 3)
        if end != -1:
            block = text[3:end]
            body = text[end + 4:]
            for line in block.splitlines():
                m = re.match(r"^([A-Za-z0-9_-]+)\s*:\s*(.*)$", line)
                if m:
                    key = m.group(1).strip().lower()
                    val = m.group(2).strip().strip('"').strip("'")
                    meta[key] = val
            return meta, body
    return meta, text


def md_to_html(md, caption="Click to enlarge"):
    """Minimal, deterministic Markdown -> HTML. No external libs."""
    lines = md.splitlines()
    out = []
    in_code = False
    code_lang = ""
    code_buf = []
    list_stack = []  # [(indent, 'ul'|'ol')] — supports nested lists
    in_table = False
    table_rows = []

    def close_lists():
        while list_stack:
            out.append("</%s>" % list_stack.pop()[1])

    def flush_table():
        nonlocal table_rows, in_table
        if not table_rows:
            in_table = False
            return
        head, rows = table_rows[0], table_rows[1:]
        sep = table_rows and len(table_rows) > 1
        html_out = ["<table class='doc-table'>"]
        html_out.append("<thead><tr>")
        for cell in head:
            html_out.append("<th>" + inline(md_cell(cell)) + "</th>")
        html_out.append("</tr></thead>")
        if len(table_rows) > 2:
            html_out.append("<tbody>")
            for r in rows:
                if r and all(re.fullmatch(r":?-{3,}:?", c.strip()) for c in r):
                    continue
                html_out.append("<tr>")
                for cell in r:
                    html_out.append("<td>" + inline(md_cell(cell)) + "</td>")
                html_out.append("</tr>")
            html_out.append("</tbody>")
        html_out.append("</table>")
        out.append("\n".join(html_out))
        table_rows = []
        in_table = False

    def md_cell(c):
        return c.strip()

    def inline(s):
        s = html.escape(s)
        s = re.sub(r"`([^`]+)`", r"<code>\1</code>", s)
        s = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", s)
        s = re.sub(r"\*([^*]+)\*", r"<em>\1</em>", s)
        s = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", r'<a href="\2">\1</a>', s)
        s = re.sub(r"(https?://\S+)", r'<a href="\1">\1</a>', s)
        return s

    i = 0
    while i < len(lines):
        line = lines[i]
        stripped = line.strip()

        if stripped.startswith("```"):
            if not in_code:
                in_code = True
                code_lang = stripped[3:].strip()
                code_buf = []
            else:
                if code_lang == "mermaid":
                    graph = "\n".join(code_buf)
                    out.append(
                        "<figure class='doc-figure mermaid-figure' data-mermaid='true' data-lightbox='true' tabindex='0'>"
                        "<pre class='mermaid'>" + html.escape(graph) + "</pre>"
                        "<figcaption>" + html.escape(caption) + "</figcaption></figure>"
                    )
                else:
                    block = "<pre><code"
                    if code_lang:
                        block += " class='language-" + html.escape(code_lang) + "'"
                    block += ">" + html.escape("\n".join(code_buf)) + "</code></pre>"
                    out.append(block)
                in_code = False
                code_lang = ""
            i += 1
            continue
        if in_code:
            code_buf.append(line)
            i += 1
            continue

        # table detection
        if "|" in stripped and stripped.startswith("|"):
            cells = [c for c in stripped.strip("|").split("|")]
            table_rows.append([c.strip() for c in cells])
            in_table = True
            i += 1
            continue
        if in_table:
            flush_table()

        if stripped.startswith("#"):
            lvl = len(stripped) - len(stripped.lstrip("#"))
            lvl = min(lvl, 6)
            text = stripped.lstrip("#").strip()
            plain = re.sub(r"<[^>]+>", "", text).strip().lower()
            plain = re.sub(r"[`*_~]", "", plain)
            plain = re.sub(r"[（）()：:，,。.？?！!【】\[\]\"']", "", plain)
            slug = re.sub(r"\s+", "-", plain).strip("-")
            out.append("<h%d id='%s' class='doc-h%d'>%s</h%d>" % (lvl, slug, lvl, inline(text), lvl))
            i += 1
            continue

        if stripped.startswith(">"):
            out.append("<blockquote>" + inline(stripped.lstrip("> ").strip()) + "</blockquote>")
            i += 1
            continue

        m_item = re.match(r"^(\s*)([-*]|\d+\.)\s+(.*)$", line)
        if m_item:
            indent = len(m_item.group(1))
            kind = "ul" if m_item.group(2) in ("-", "*") else "ol"
            text = m_item.group(3)
            while list_stack and list_stack[-1][0] > indent:
                out.append("</%s>" % list_stack.pop()[1])
            if list_stack and list_stack[-1][0] == indent and list_stack[-1][1] != kind:
                out.append("</%s>" % list_stack.pop()[1])
            if not list_stack or list_stack[-1][0] != indent:
                list_stack.append((indent, kind))
                out.append("<%s class='doc-list'>" % kind)
            out.append("<li>" + inline(text) + "</li>")
            i += 1
            continue

        if list_stack:
            close_lists()

        if not stripped:
            i += 1
            continue

        out.append("<p>" + inline(stripped) + "</p>")
        i += 1

    close_lists()
    if in_code:
        out.append("<pre><code>" + html.escape("\n".join(code_buf)) + "</code></pre>")
    if in_table:
        flush_table()
    return "\n".join(out)


def build_figure_block(md):
    """If markdown contains fenced mermaid or an svg placeholder, wrap for lightbox."""
    m = re.search(r"```mermaid\n(.*?)```", md, re.DOTALL)
    if m:
        diagram = html.escape(m.group(1))
        return (
            "<figure class='doc-figure' data-lightbox='true' tabindex='0'>"
            "<pre class='mermaid-src'><code class='language-mermaid'>" + diagram + "</code></pre>"
            "<figcaption>Diagram — click to enlarge</figcaption></figure>"
        )
    return ""


def build_nav_html(cfg, active_slug, lang):
    items = []
    for nav in cfg.get("nav", []):
        if "group" in nav:
            glabel = nav.get("group_en", nav["group"]) if lang == "en" else nav["group"]
            items.append('<div class="nav-group"><div class="nav-group-label">%s</div>' % html.escape(glabel))
            for child in nav.get("items", []):
                act = " is-active" if child.get("slug") == active_slug else ""
                label = child.get("label_en", child.get("label", "")) if lang == "en" else child.get("label", "")
                items.append('<a class="nav-link%s" href="%s">%s</a>' % (
                    act, rel_href(child.get("slug", ""), lang, lang), html.escape(label)))
            items.append("</div>")
        else:
            act = " is-active" if nav.get("slug") == active_slug else ""
            label = nav.get("label", nav.get("slug", ""))
            if lang == "en":
                label = nav.get("label_en", label)
            items.append('<a class="nav-link%s" href="%s">%s</a>' % (
                act, rel_href(nav.get("slug", ""), lang, lang), html.escape(label)))
    return "\n".join(items)


def status_badge(status):
    cls = "badge-" + status
    return "<span class='status-badge %s'>%s</span>" % (cls, html.escape(status))


def build_list_page(cfg_page, i18n):
    data = cfg_page.get("data", [])
    columns = cfg_page.get("columns", [])
    sortables = cfg_page.get("sortable", ["last_updated", "commits"])
    filters = cfg_page.get("filters", [])
    status_field = cfg_page.get("status_field", "status")

    th = []
    for c in columns:
        key = c.get("key", "")
        sortable = " data-sortable='true'" if key in sortables else ""
        th.append("<th%s>%s</th>" % (sortable, html.escape(c.get("label", key))))
    head = "<tr>" + "".join(th) + "</tr>"

    rows = []
    for rec in data:
        tds = []
        for c in columns:
            key = c.get("key", "")
            val = rec.get(key, "")
            if key == status_field:
                tds.append("<td>" + status_badge(str(val)) + "</td>")
            elif key in sortables:
                tds.append("<td data-value='%s'>%s</td>" % (html.escape(str(rec.get("_v_" + key, val))), html.escape(str(val))))
            else:
                link = c.get("link")
                if link and rec.get(link):
                    tds.append("<td><a href='%s'>%s</a></td>" % (html.escape(rec[link]), html.escape(str(val))))
                else:
                    tds.append("<td>%s</td>" % html.escape(str(val)))
        status_val = rec.get(status_field, "")
        rows.append("<tr data-status='%s' data-commits='%s' data-updated='%s'>" % (html.escape(str(status_val)), html.escape(str(rec.get("_v_commits", rec.get("commits", 0)))), html.escape(str(rec.get("_v_last_updated", rec.get("last_updated", ""))))) + "".join(tds) + "</tr>")

    filter_ui = []
    if filters:
        opts = "".join("<option value='%s'>%s</option>" % (html.escape(str(f)), html.escape(str(f))) for f in filters)
        filter_ui.append(
            "<label class='list-filter'>Filter status: "
            "<select id='f-status' data-filter='status'><option value=''>All</option>%s</select></label>" % opts
        )
    search_ui = (
        "<label class='list-filter'>Search "
        "<input id='f-search' type='search' placeholder='title / author' /></label>"
    )
    toolbar = ("<div class='list-toolbar'>" + search_ui + "".join(filter_ui) + "</div>")

    table = "<div class='list-scroll'><table class='doc-table list-table'><thead>%s</thead><tbody>%s</tbody></table></div>" % (head, "\n".join(rows))
    return toolbar + table


def prep_record(rec, sortables):
    for s in sortables:
        rec["_v_" + s] = str(rec.get(s, ""))
    return rec


def language_strings(cfg, lang):
    i18n = {}
    for item in cfg.get("nav", []):
        if item.get("slug") and item.get("label"):
            i18n["nav." + item["slug"]] = (
                item.get("label_en", item["label"]) if lang == "en" else item["label"]
            )
    i18n["filter"] = ltext(cfg, lang, "filter", "Filter status")
    i18n["search"] = ltext(cfg, lang, "search", "Search")
    i18n["en"] = "EN"
    i18n["zh"] = "中"
    i18n["fit"] = ltext(cfg, lang, "fit", "Fit to screen")
    i18n["close"] = ltext(cfg, lang, "close", "Close")
    return i18n


CSS = """
:root{
  --bg:#f6f7f9;--card:#fff;--ink:#141414;--muted:#667085;--line:#d0d5dd;
  --accent:#0b5fff;--accent-2:#7a3cff;--radius:12px;
  --header-h:56px;--top-break:{bp}px;
}
*{box-sizing:border-box}
html,body{margin:0;min-height:100%;background:var(--bg);color:var(--ink);
  font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;
  -webkit-font-smoothing:antialiased}
a{color:var(--accent);text-decoration:none}
a:hover{text-decoration:underline}
/* shell: two-col desktop */
.shell{display:grid;grid-template-columns:280px minmax(0,1fr);min-height:100dvh}
/* sidebar / header */
.sidebar{position:sticky;top:0;height:100dvh;border-right:1px solid var(--line);
  background:var(--card);display:flex;flex-direction:column;overflow:hidden}
.brand{position:relative}
.brand-row{display:flex;align-items:center;justify-content:space-between;gap:8px;
  min-height:var(--header-h);padding:12px 16px;border-bottom:1px solid var(--line)}
.brand a{font-weight:700;font-size:16px;color:var(--ink)}
.brand a:hover{text-decoration:none;color:var(--accent)}
.brand-home,.brand-link{display:inline-flex;align-items:center;gap:8px;
  font-weight:700;font-size:16px;color:var(--ink);text-decoration:none}
.brand-home:hover,.brand-link:hover{text-decoration:none;color:var(--accent)}
.brand-mark{width:24px;height:24px;flex:0 0 24px;border-radius:6px;
  background:linear-gradient(135deg,var(--accent),var(--accent-2));
  color:#fff;font-size:13px;font-weight:800;display:inline-flex;
  align-items:center;justify-content:center;line-height:1}
.tagline{font-size:12px;color:var(--muted);padding:6px 16px}
.sidebar-scroll{flex:1;overflow-y:auto;padding:12px}
/* nav */
.nav-group{margin-bottom:14px}
.nav-group-label{font-size:11px;text-transform:uppercase;letter-spacing:.05em;
  color:var(--muted);padding:4px 8px}
.nav-link{display:block;padding:8px 10px;border-radius:8px;color:var(--ink);font-size:14px}
.nav-link:hover{background:rgba(11,95,255,.08);text-decoration:none}
.nav-link.is-active{background:rgba(11,95,255,.12);color:var(--accent);font-weight:600}
/* top bar (mobile only, hidden desktop) */
.topbar{display:none}
.topbar-row{display:flex;align-items:center;justify-content:space-between;gap:8px;
  min-height:var(--header-h);padding:0 12px;background:var(--card);
  position:sticky;top:0;z-index:50;border-bottom:1px solid var(--line)}
.icon-btn{width:36px;height:36px;border-radius:9px;border:1px solid var(--line);
  background:var(--card);display:inline-flex;align-items:center;justify-content:center;
  cursor:pointer;color:var(--ink);font-size:15px}
.icon-btn:hover{border-color:var(--accent)}
.icon-btn:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.nav-toggle{position:relative}
.nav-toggle span,.nav-toggle span::before,.nav-toggle span::after{content:'';
  display:block;width:18px;height:2px;background:currentColor;border-radius:2px;position:relative}
.nav-toggle span::before{position:absolute;top:-6px}
.nav-toggle span::after{position:absolute;top:6px}
/* content */
.content{min-width:0;padding:0}
.content-inner{padding:clamp(20px,3vw,56px)}
.breadcrumb{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--muted);margin-bottom:18px}
.breadcrumb a{color:var(--muted);font-size:12px}
.breadcrumb a:hover{color:var(--accent);text-decoration:none}
.breadcrumb .sep{opacity:.5}
.page-title{font-size:clamp(26px,4vw,40px);line-height:1.1;margin:4px 0 10px;font-weight:750}
.page-desc{color:var(--muted);line-height:1.7;max-width:64ch}
/* doc body */
.doc-body{max-width:72ch;line-height:1.75;overflow-wrap:break-word;min-width:0}
.doc-body :not(pre)>code{overflow-wrap:anywhere;background:rgba(100,116,139,.12);
  padding:2px 5px;border-radius:5px;font-size:.9em}
pre{background:#0f172a;color:#e2e8f0;padding:14px 16px;border-radius:10px;overflow-x:auto;font-size:13.5px}
pre code{background:none;padding:0;color:inherit}
.doc-h1,.doc-h2,.doc-h3{line-height:1.25;margin:24px 0 8px}
.doc-h1{font-size:28px}.doc-h2{font-size:22px}.doc-h3{font-size:18px}
.doc-list{line-height:1.7;padding-left:22px}
blockquote{border-left:3px solid var(--accent);margin:12px 0;padding:6px 14px;
  background:rgba(11,95,255,.06);border-radius:0 8px 8px 0}
/* tables */
.doc-table{border-collapse:collapse;width:100%;font-size:14px;margin:14px 0}
.doc-table th,.doc-table td{border:1px solid var(--line);padding:9px 12px;text-align:left}
.doc-table th{background:rgba(100,116,139,.08);font-weight:600}
.list-scroll{overflow-x:auto}
.list-table th{cursor:pointer;user-select:none;white-space:nowrap}
.list-table th[data-sortable]::after{content:' ⇅';opacity:.4;font-size:11px}
.list-table th.sort-asc::after{content:' ↑';opacity:1;color:var(--accent)}
.list-table th.sort-desc::after{content:' ↓';opacity:1;color:var(--accent)}
/* list toolbar */
.list-toolbar{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin:14px 0}
.list-filter{font-size:13px;color:var(--muted);display:flex;gap:6px;align-items:center}
.list-filter input,.list-filter select{padding:7px 10px;border:1px solid var(--line);
  border-radius:8px;background:var(--card);font-size:13px}
.list-filter input{width:220px}
.list-count{font-size:13px;color:var(--muted);margin-left:auto}
/* status badges */
.status-badge{display:inline-block;padding:3px 9px;border-radius:999px;font-size:12px;
  font-weight:600;line-height:1.4}
.badge-open{background:rgba(22,163,74,.15);color:#15803d}
.badge-merged{background:rgba(109,40,217,.15);color:#6d28d9}
.badge-closed{background:rgba(100,116,139,.15);color:#475569}
.badge-draft{background:rgba(217,119,6,.15);color:#b45309}
.badge-in-review,.badge-changes-requested{background:rgba(234,179,8,.18);color:#854d0e}
.badge-merged,.badge-approve,.badge-approved{background:rgba(109,40,217,.15);color:#6d28d9}
.badge-default{background:rgba(100,116,139,.15);color:#475569}
/* figure / lightbox */
.doc-figure{margin:16px 0;background:var(--card);border:1px solid var(--line);
  border-radius:12px;padding:14px;cursor:zoom-in;position:relative}
.doc-figure .expand-mark{position:absolute;top:10px;right:10px;width:32px;height:32px;
  display:flex;align-items:center;justify-content:center;font-size:16px;color:var(--muted);
  border:1px solid var(--line);border-radius:8px}
.doc-figure figcaption{color:var(--muted);font-size:12px;margin-top:8px}
.lightbox{display:none;position:fixed;inset:0;z-index:100;background:rgba(15,23,42,.86);
  padding:clamp(12px,3vw,40px)}
.lightbox.is-open{display:flex;flex-direction:column}
.lightbox-head{display:flex;align-items:center;gap:10px;color:#e2e8f0;margin-bottom:10px}
.lightbox-head .lb-title{flex:1;font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lightbox-stage{flex:1;display:flex;align-items:center;justify-content:center;overflow:hidden;
  transform-origin:center}
.lightbox pre{max-width:100%;max-height:100%;margin:0;transform-origin:center}
.lightbox .lb-btn{width:40px;height:40px;border-radius:9px;border:1px solid rgba(255,255,255,.25);
  background:rgba(255,255,255,.08);color:#fff;cursor:pointer;font-size:15px}
/* footer */
.footer{border-top:1px solid var(--line);padding:18px 16px;color:var(--muted);font-size:13px}
.footer-actions{display:flex;flex-wrap:wrap;gap:8px}
/* theme controls */
.theme-ctl,.lang-ctl,.brand-meta{display:flex;align-items:center;gap:6px}
.theme-ctl button,.lang-btn{height:30px;border-radius:8px;border:1px solid var(--line);
  background:var(--card);color:var(--ink);cursor:pointer;font-size:12px;
  display:inline-flex;align-items:center;justify-content:center;line-height:1}
.theme-ctl button{width:36px}
/* mobile scrim: sibling of the drawer so it can actually receive clicks */
.nav-scrim{display:none}
/* ===== MOBILE (≤ breakpoint) ===== */
@media (max-width:{bp}px){
  .shell{display:block}
  .sidebar{position:fixed;top:var(--header-h);right:0;bottom:0;left:0;width:100%;height:auto;
    z-index:40;transform:translateY(-120%);transition:transform .2s ease;box-shadow:0 12px 30px rgba(0,0,0,.25)}
  body.nav-open .sidebar{transform:translateY(0)}
  .nav-scrim{display:none;position:fixed;top:var(--header-h);right:0;bottom:0;left:0;z-index:35;
    background:rgba(15,23,42,.45);border:0;padding:0;margin:0;cursor:default}
  body.nav-open .nav-scrim{display:block}
  .topbar{display:block;position:sticky;top:0;z-index:50}
  .topbar-row{position:static}
  .topbar .lang-btn{height:36px}
  .nav-toggle.is-open span{background:transparent}
  .nav-toggle.is-open span::before{top:0;transform:rotate(45deg)}
  .nav-toggle.is-open span::after{top:0;transform:rotate(-45deg)}
  .content-inner{padding:20px 16px calc(20px + env(safe-area-inset-bottom))}
  .hero h1{overflow-wrap:anywhere}
  .hero-stats div{flex:1 1 45%;min-width:0}
  .hero-stats b{font-size:18px}
}
/* ---- bilingual site additions ---- */
.lang-btn{min-width:40px;padding:0 10px;font-weight:700;color:var(--accent);text-decoration:none}
.lang-btn:hover{border-color:var(--accent);background:rgba(11,95,255,.06);text-decoration:none}
.footer a{display:inline-flex;align-items:center;gap:6px;padding:8px 12px;border:1px solid var(--line);
  border-radius:8px;background:var(--card);color:var(--accent);font-weight:600;font-size:13px;text-decoration:none}
.footer a:hover{border-color:var(--accent);background:rgba(11,95,255,.06);text-decoration:none}
.footer .lang-btn{height:34px;padding:0 12px;font-size:13px}
.mermaid-figure svg{max-width:100%;height:auto;display:block;margin:0 auto}
.mermaid-figure figcaption::before{content:'⛶ '}
.lightbox-stage .mermaid-svg,.lightbox-stage pre{max-width:100%;max-height:100%;transform-origin:center}
/* home page */
.hero{border:1px solid var(--line);border-radius:14px;padding:clamp(20px,3vw,36px);
  background:linear-gradient(135deg,rgba(11,95,255,.06),rgba(122,60,255,.04)),var(--card);
  margin-bottom:4px}
.hero-kicker{color:var(--accent);font-size:12px;font-weight:700;letter-spacing:.14em;text-transform:uppercase}
.hero h1{font-size:clamp(28px,4vw,42px);line-height:1.15;margin:10px 0;font-weight:750}
.hero h1 .grad{background:linear-gradient(90deg,var(--accent),var(--accent-2));-webkit-background-clip:text;
  background-clip:text;color:transparent}
.hero-lead{color:var(--muted);line-height:1.75;max-width:64ch}
.hero-actions{display:flex;flex-wrap:wrap;gap:10px;margin:18px 0}
.hero-btn{display:inline-block;padding:9px 16px;border:1px solid var(--line);border-radius:9px;
  font-size:14px;font-weight:600;color:var(--ink)}
.hero-btn.primary{background:var(--accent);border-color:transparent;color:#fff}
.hero-btn:hover{text-decoration:none;border-color:var(--accent)}
.hero-stats{display:flex;flex-wrap:wrap;border:1px solid var(--line);border-radius:12px;overflow:hidden;margin-top:20px}
.hero-stats div{flex:1 1 140px;padding:12px 16px;border-right:1px solid var(--line)}
.hero-stats div:last-child{border-right:none}
.hero-stats b{display:block;font-size:20px;color:var(--accent)}
.hero-stats span{font-size:12px;color:var(--muted)}
.doc-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:12px;margin:12px 0 8px}
.doc-card{display:block;position:relative;padding:16px;border:1px solid var(--line);border-radius:10px;color:var(--ink)}
.doc-card::before{content:'';position:absolute;top:0;left:16px;width:36px;height:3px;
  border-radius:0 0 3px 3px;background:var(--accent)}
.doc-grid .doc-card:nth-child(4n+2)::before{background:#06b6d4}
.doc-grid .doc-card:nth-child(4n+3)::before{background:#8b5cf6}
.doc-grid .doc-card:nth-child(4n+4)::before{background:#f43f5e}
.doc-card b{display:block;font-size:15px;margin-bottom:4px}
.doc-card span{font-size:12px;color:var(--muted)}
.doc-card:hover{text-decoration:none;border-color:var(--accent);background:rgba(11,95,255,.05)}
.section-title{font-size:20px;font-weight:750;margin:26px 0 4px}
.section-sub{color:var(--muted);font-size:13px;margin:0 0 12px}
/* dark theme */
[data-theme='dark']{--bg:#0b0d12;--card:#14171f;--ink:#e6e8ee;--muted:#9aa3b2;--line:#2a2f3a}
[data-theme='dark'] .list-table th{background:rgba(148,163,184,.1)}
"""


LIST_JS = """
(function(){
  var table=document.querySelector('.list-table');
  if(!table)return;
  var headCells=table.querySelectorAll('th');
  var bodyRows=Array.prototype.slice.call(table.querySelectorAll('tbody tr'));
  function rowVals(r){var tds=r.querySelectorAll('td');return Array.prototype.map.call(tds,function(td,i){
      return {td:td,i:i,raw:td.dataset.value!==undefined?td.dataset.value:td.textContent,value:td.dataset.value!==undefined?td.dataset.value:td.textContent};});}
  var sortKey=-1,sortDir='desc';
  headCells.forEach(function(th,idx){
    if(!th.hasAttribute('data-sortable'))return;
    th.addEventListener('click',function(){
      var dir = (sortKey===idx)? (sortDir==='asc'?'desc':'asc') : 'desc';
      sortKey=idx;sortDir=dir;applySort();
    });
  });
  function applySort(){
    bodyRows.forEach(function(r){var tds=r.querySelectorAll('td');tds[sortKey].dataset.value=tds[sortKey].dataset.value||tds[sortKey].textContent;});
    var cols=rowCols();
    bodyRows.sort(function(a,b){
      var av=rowVals(a)[sortKey],bv=rowVals(b)[sortKey];
      var an=parseFloat(av.raw),bn=parseFloat(bv.raw);
      var cmp=(!isNaN(an)&&!isNaN(bn))?an-bn:(av.value.localeCompare(bv.value));
      return cmp*(sortDir==='asc'?1:-1);
    });
    var tb=table.tBodies[0];bodyRows.forEach(function(r){tb.appendChild(r);});
    headCells.forEach(function(th,i){th.classList.remove('sort-asc','sort-desc');});
    if(sortKey>=0)headCells[sortKey].classList.add(sortDir==='asc'?'sort-asc':'sort-desc');
    updateCount();
  }
  function rowCols(){return headCells.length;}
  var search=document.getElementById('f-search');
  var statusF=document.getElementById('f-status');
  function updateCount(){
    var n=0;bodyRows.forEach(function(r){if(!r.hidden)n++;});
    var c=document.querySelector('.list-count');if(c)c.textContent=n+' of '+bodyRows.length+' pull requests';
  }
  function applyFilters(){
    var q=(search?search.value:'').toLowerCase();
    var st=statusF?statusF.value:'';
    bodyRows.forEach(function(r){
      var ok=true;
      if(st&&r.getAttribute('data-status')!==st)ok=false;
      if(q){var hay=r.textContent.toLowerCase();if(hay.indexOf(q)===-1)ok=false;}
      r.hidden=!ok;
    });
    updateCount();
  }
  if(search)search.addEventListener('input',applyFilters);
  if(statusF)statusF.addEventListener('change',applyFilters);
  applySort();
  updateCount();
})();
"""


THEME_JS = """
(function(){
  var root=document.documentElement;
  var mode=localStorage.getItem('docs-theme')||'{theme}';
  function apply(m){root.setAttribute('data-theme',m);}
  if(mode==='auto'){apply(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');}
  else{apply(mode);}
  var btns=document.querySelectorAll('[data-theme-toggle]');
  btns.forEach(function(b){b.addEventListener('click',function(){
    var cur=root.getAttribute('data-theme');
    var next=(cur==='dark')?'light':'dark';
    apply(next);localStorage.setItem('docs-theme',next);
  });});
})();
"""

NAV_JS = """
(function(){
  var toggle=document.querySelector('.nav-toggle');
  var body=document.body;
  if(!toggle)return;
  var scrim=document.querySelector('.nav-scrim');
  function close(){body.classList.remove('nav-open');body.style.overflow='';toggle.classList.remove('is-open');toggle.setAttribute('aria-expanded','false');}
  function open(){body.classList.add('nav-open');body.style.overflow='hidden';toggle.classList.add('is-open');toggle.setAttribute('aria-expanded','true');}
  toggle.addEventListener('click',function(){body.classList.contains('nav-open')?close():open();});
  if(scrim)scrim.addEventListener('click',close);
  document.querySelectorAll('.nav-link').forEach(function(a){
    a.addEventListener('click',function(){close();});
  });
  document.addEventListener('keydown',function(e){if(e.key==='Escape'&&body.classList.contains('nav-open')){close();toggle.focus();}});
  var mq=window.matchMedia('screen and (max-width:{bp}px)');
  function sync(){if(!mq.matches)close();}
  if(mq.addEventListener)mq.addEventListener('change',sync);else mq.addListener(sync);
})();
"""

LIGHTBOX_JS = """
(function(){
  var lb=document.querySelector('.lightbox');
  if(!lb)return;
  var stage=lb.querySelector('.lightbox-stage');
  var cur=1;
  function fit(){var pre=stage.querySelector('pre');if(!pre)return;pre.style.transform='scale('+cur+')';}
  function open(fig){var src=fig.querySelector('pre')||fig.querySelector('.mermaid-svg');stage.innerHTML='';
    if(src)stage.appendChild(src.cloneNode(true));lb.classList.add('is-open');cur=1;fit();document.body.style.overflow='hidden';}
  function closeLb(){lb.classList.remove('is-open');document.body.style.overflow='';}
  document.querySelectorAll('.doc-figure[data-lightbox]').forEach(function(f){
    f.addEventListener('click',function(){open(f);});
    f.addEventListener('keydown',function(e){if(e.key==='Enter')open(f);});
  });
  lb.querySelectorAll('[data-lb-close]').forEach(function(b){b.addEventListener('click',closeLb);});
  lb.querySelectorAll('[data-lb-fit]').forEach(function(b){b.addEventListener('click',function(){cur=1;fit();});});
  lb.querySelectorAll('[data-lb-plus]').forEach(function(b){b.addEventListener('click',function(){cur=Math.min(4,cur+0.25);fit();});});
  lb.querySelectorAll('[data-lb-minus]').forEach(function(b){b.addEventListener('click',function(){cur=Math.max(0.4,cur-0.25);fit();});});
  document.addEventListener('keydown',function(e){if(e.key==='Escape'&&lb.classList.contains('is-open'))closeLb();});
  window.addEventListener('resize',fit);
})();
"""


MERMAID_RUNTIME_JS = """
(function(){
  var m=window.mermaid;
  if(!m)return;
  m.initialize({startOnLoad:false,theme:'neutral',securityLevel:'loose'});
  var seq=0;
  function draw(){
    document.querySelectorAll('figure[data-mermaid] pre.mermaid').forEach(function(pre){
      if(pre.dataset.pending)return;
      pre.dataset.pending='1';
      var graph=pre.textContent||'';
      m.render('arcs-mermaid-'+(++seq),graph).then(function(res){
        var holder=document.createElement('div');holder.className='mermaid-svg';holder.innerHTML=res.svg;
        pre.replaceWith(holder);
      }).catch(function(err){pre.setAttribute('data-error',String(err));delete pre.dataset.pending;});
    });
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',draw);else draw();
})();
"""


def lightbox_html(page):
    if "data-lightbox" in page.get("body_html", ""):
        return (
            "<div class='lightbox' role='dialog' aria-modal='true' aria-label='Diagram enlarged'>"
            "<div class='lightbox-head'><div class='lb-title'>Diagram</div>"
            "<button class='lb-btn' data-lb-fit title='Fit'>⛶</button>"
            "<button class='lb-btn' data-lb-plus title='Zoom in'>+</button>"
            "<button class='lb-btn' data-lb-minus title='Zoom out'>−</button>"
            "<button class='lb-btn' data-lb-close aria-label='Close'>✕</button></div>"
            "<div class='lightbox-stage'></div></div>"
        )
    return ""


def move_figure_into_lightbox(page_body_html):
    """Re-stage the figure's pre into the lightbox so zooming shows it fullscreen."""
    m = re.search(r"<pre class='mermaid-src'>.*?</pre>", page_body_html, re.DOTALL)
    if m:
        return m.group(0)
    return ""


def build_home_html(cfg, lang):
    """Home page: hero + principles + doc matrix, built from locale strings and nav."""
    s = lambda key, default="": ltext(cfg, lang, key, default)
    parts = ['<section class="hero">']
    parts.append("<div class='hero-kicker'>" + html.escape(s("hero_kicker")) + "</div>")
    parts.append("<h1>" + html.escape(s("hero_title")) + " <span class='grad'>" + html.escape(s("hero_grad")) + "</span></h1>")
    parts.append("<p class='hero-lead'>" + html.escape(s("hero_lead")) + "</p>")
    parts.append("<div class='hero-actions'>")
    for cta in cfg.get("hero_actions", []):
        label = cta.get("label_en", cta.get("label", "")) if lang == "en" else cta.get("label", "")
        parts.append('<a class="hero-btn%s" href="%s">%s</a>' % (
            " primary" if cta.get("primary") else "",
            rel_href(cta.get("slug", "index"), lang, lang), html.escape(label)))
    parts.append("</div><div class='hero-stats'>")
    for st in cfg.get("hero_stats", []):
        val = st.get("value_en", st.get("value", "")) if lang == "en" else st.get("value", "")
        lab = st.get("label_en", st.get("label", "")) if lang == "en" else st.get("label", "")
        parts.append("<div><b>" + html.escape(val) + "</b><span>" + html.escape(lab) + "</span></div>")
    parts.append("</div></section>")

    if cfg.get("principles"):
        parts.append("<h2 class='section-title'>" + html.escape(s("principles_title", "")) + "</h2><div class='doc-grid'>")
        for pr in cfg["principles"]:
            t = pr.get("title_en", pr.get("title", "")) if lang == "en" else pr.get("title", "")
            b = pr.get("body_en", pr.get("body", "")) if lang == "en" else pr.get("body", "")
            parts.append("<div class='doc-card'><b>" + html.escape(t) + "</b><span>" + html.escape(b) + "</span></div>")
        parts.append("</div>")

    parts.append("<h2 class='section-title'>" + html.escape(s("doc_matrix", "Documentation")) + "</h2>")
    if s("doc_matrix_sub", ""):
        parts.append("<p class='section-sub'>" + html.escape(s("doc_matrix_sub")) + "</p>")
    for nav in cfg.get("nav", []):
        glabel = nav.get("group_en", nav["group"]) if lang == "en" else nav["group"]
        parts.append("<div class='nav-group-label'>" + html.escape(glabel) + "</div><div class='doc-grid'>")
        for child in nav.get("items", []):
            label = child.get("label_en", child.get("label", "")) if lang == "en" else child.get("label", "")
            desc = child.get("desc_en", child.get("desc", "")) if lang == "en" else child.get("desc", "")
            parts.append('<a class="doc-card" href="%s"><b>%s</b><span>%s</span></a>' % (
                rel_href(child.get("slug", ""), lang, lang), html.escape(label), html.escape(desc)))
        parts.append("</div>")
    return "\n".join(parts)


def render_page(cfg, page, out_dir, slug, lang):
    bp = str(cfg.get("breakpoint", 860))
    i18n = language_strings(cfg, lang)
    is_list = page.get("type") == "list"
    is_home = page.get("type") == "home"
    body_html = build_home_html(cfg, lang) if is_home else page.get("body_html", "")

    if is_list:
        for rec in page.get("data", []):
            prep_record(rec, page.get("sortable", ["last_updated", "commits"]))
        body_html = build_list_page(page, i18n)

    # mermaid figures are emitted by md_to_html; lightbox stage is filled on click
    lightbox = lightbox_html({"body_html": body_html, "type": page.get("type")})

    nav_html = build_nav_html(cfg, slug, lang)
    css = CSS.replace("{bp}", bp)
    theme_js = THEME_JS.replace("{theme}", cfg.get("theme", "auto"))
    nav_js = NAV_JS.replace("{bp}", bp)

    def pick(key, default):
        if lang == "en" and page.get(key + "_en"):
            return page[key + "_en"]
        return page.get(key, default)

    if is_home:
        title = ltext(cfg, lang, "title", cfg.get("title", "ARCS"))
        desc = ltext(cfg, lang, "tagline", cfg.get("tagline", ""))
    else:
        title = pick("title", cfg.get("title", "Page"))
        desc = pick("description", ltext(cfg, lang, "description", cfg.get("description", "")))

    other = "en" if lang == "zh" else "zh"
    toggle_label = ltext(cfg, lang, "toggle", "EN" if lang == "zh" else "中")
    toggle_html = '<a class="lang-btn" href="%s" hreflang="%s" title="%s">%s</a>' % (
        rel_href(slug, lang, other), other,
        html.escape(ltext(cfg, other, "name", other)), html.escape(toggle_label))

    gh = repo_url(cfg)
    gh_footer = ('<a href="%s" target="_blank" rel="noreferrer">%s</a>' % (
        html.escape(gh), html.escape(ltext(cfg, lang, "github", "GitHub ↗")))) if gh else ""
    gh_top = ('<a class="icon-btn" href="%s" target="_blank" rel="noreferrer" aria-label="GitHub" title="GitHub">↗</a>' % html.escape(gh)) if gh else ""

    home_href = rel_href("index", lang, lang)
    brand = ltext(cfg, lang, "title", cfg.get("title", "ARCS"))
    tagline = ltext(cfg, lang, "tagline", cfg.get("tagline", ""))
    crumb = (ltext(cfg, lang, "doc_center", "文档中心" if lang == "zh" else "Documentation")
             if is_home else title)
    asset = "../assets/mermaid.min.js" if lang == "en" else "./assets/mermaid.min.js"
    favicon = "../favicon.svg" if lang == "en" else "./favicon.svg"
    html_lang = "zh-CN" if lang == "zh" else "en"

    html_doc = """<!doctype html>
<html lang="{html_lang}" data-theme="{theme}">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<link rel="icon" type="image/svg+xml" href="{favicon}"/>
<title>{title} · {site}</title>
<style>{css}</style>
</head>
<body>
<header class="topbar">
  <div class="topbar-row">
    <a class="brand-link" href="{home}"><span class="brand-mark">A</span>{brand}</a>
    <div class="brand-meta">
      <div class="lang-ctl">{toggle}</div>
      {gh_top}
      <button class="icon-btn nav-toggle" aria-expanded="false" aria-controls="site-nav" aria-label="Toggle navigation menu"><span></span></button>
    </div>
  </div>
</header>
<button type="button" class="nav-scrim" aria-label="Close navigation menu" tabindex="-1"></button>
<div class="shell">
  <aside class="sidebar" id="site-nav">
    <div class="brand"><div class="brand-row"><a class="brand-home" href="{home}"><span class="brand-mark">A</span><span>{brand}</span></a>
      <div class="brand-meta">
        <button class="icon-btn" data-theme-toggle aria-label="Toggle theme">◐</button></div></div></div>
    <div class="tagline">{tagline}</div>
    <div class="sidebar-scroll">{nav}</div>
    <div class="footer"><div class="footer-actions">{gh_footer}{toggle}</div></div>
  </aside>
  <main class="content">
    <div class="content-inner">
      <div class="breadcrumb"><a href="{home}">{brand}</a><span class="sep">/</span><span>{crumb}</span></div>
      {heading}{desc_html}
      {count_html}{body}
      {lightbox}
    </div>
  </main>
</div>
<script src="{asset}"></script>
<script>{mermaid_js}</script>
<script>{theme_js}</script>
<script>{nav_js}</script>
<script>{lb_js}</script>
{list_js}
</body>
</html>
""".format(
        html_lang=html_lang,
        theme=cfg.get("theme", "auto"),
        title=html.escape(title),
        site=html.escape(cfg.get("short_title", "ARCS")),
        css=css,
        home=home_href,
        brand=html.escape(brand),
        crumb=html.escape(crumb),
        tagline=html.escape(tagline),
        nav=nav_html,
        gh_footer=gh_footer,
        gh_top=gh_top,
        toggle=toggle_html,
        desc=html.escape(desc),
        heading=("" if is_home else "<h1 class='page-title'>" + html.escape(title) + "</h1>"),
        desc_html=("" if is_home else "<p class='page-desc'>" + html.escape(desc) + "</p>"),
        count_html=('<div class="list-count"></div>') if is_list else "",
        body=body_html,
        lightbox=lightbox,
        asset=asset,
        favicon=favicon,
        mermaid_js=MERMAID_RUNTIME_JS,
        theme_js=theme_js,
        nav_js=nav_js,
        lb_js=LIGHTBOX_JS,
        list_js=(LIST_JS if is_list else ""),
    )

    path = os.path.join(out_dir, page_href(slug, lang))
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(html_doc)
    return path


def cmd_generate(args):
    cfg = read_config(args.config)
    content_dir = args.content or "."
    out_dir = args.out or "docs-site-out"
    os.makedirs(os.path.join(out_dir, "en"), exist_ok=True)

    written = []
    for page in cfg["pages"]:
        slug = page.get("slug", page.get("title", "page").lower().replace(" ", "-"))
        for lang in LOCALES:
            p = dict(page)
            p["slug"] = slug
            if page.get("type") in ("home", "list"):
                if page.get("type") == "list" and page.get("source_data"):
                    base = os.path.join(content_dir, page["source_data"])
                    p["data"] = json.loads(read_file(base))
                p["body_html"] = ""
            else:
                md_path = page.get("source")
                if not md_path:
                    fail("page '" + slug + "' has no 'source' markdown file")
                rel = md_path if lang == "zh" else "en/" + md_path
                raw = read_file(os.path.join(content_dir, rel))
                meta, body_md = split_front_matter(raw)
                if meta.get("title"):
                    p["title" if lang == "zh" else "title_en"] = meta["title"]
                if meta.get("description"):
                    p["description" if lang == "zh" else "description_en"] = meta["description"]
                if meta.get("tagline"):
                    p["tagline" if lang == "zh" else "tagline_en"] = meta["tagline"]
                p["source_md"] = raw
                caption = ltext(cfg, lang, "caption", "Click to enlarge")
                p["body_html"] = rewrite_md_links(md_to_html(body_md, caption), lang)
            written.append(render_page(cfg, p, out_dir, slug, lang))
    print("Generated " + str(len(written)) + " pages into " + out_dir)
    for p in written:
        print("  " + p)


def cmd_check(args):
    out_dir = args.out or "docs-site-out"
    if not os.path.isdir(out_dir):
        fail("output dir not found: " + out_dir)
    zh_files = sorted(f for f in os.listdir(out_dir) if f.endswith(".html"))
    en_dir = os.path.join(out_dir, "en")
    en_files = sorted(f for f in os.listdir(en_dir) if f.endswith(".html")) if os.path.isdir(en_dir) else []
    print("Found " + str(len(zh_files) + len(en_files)) + " HTML page(s) (" +
          str(len(zh_files)) + " zh, " + str(len(en_files)) + " en) in " + out_dir)
    problems = []
    for f in zh_files:
        if f not in en_files:
            problems.append("missing English counterpart: en/" + f)
        path = os.path.join(out_dir, f)
    for sub, files in (("", zh_files), ("en/", en_files)):
        for f in files:
            text = read_file(os.path.join(out_dir, sub, f))
            checks = {
                "doctype": text.startswith("<!doctype html>"),
                "responsive-breakpoint": "max-width:" in text,
                "mobile-topbar": "topbar" in text,
                "nav-panel": "nav-toggle" in text,
                "nav-scrim": "nav-scrim" in text,
                "theme-switch": "data-theme-toggle" in text,
                "language-toggle": 'class="lang-btn"' in text,
                "footer-actions": "footer-actions" in text,
                "brand-mark": "brand-mark" in text,
                "breadcrumb": "breadcrumb" in text,
                "github-link": "github.com/" in text,
                "mermaid-runtime": "assets/mermaid.min.js" in text or "../assets/mermaid.min.js" in text,
            }
            if "list-table'" in text and "<table class='doc-table list-table'>" in text:
                checks["list-sortable"] = "data-sortable" in text
                checks["status-badge"] = "status-badge" in text
                checks["list-filter"] = "f-status" in text or "f-search" in text
            for k, v in checks.items():
                if not v:
                    problems.append("%s%s: missing %s" % (sub, f, k))
    if not os.path.isfile(os.path.join(out_dir, "assets", "mermaid.min.js")):
        problems.append("missing assets/mermaid.min.js")
    if problems:
        print("PROBLEMS:")
        for p in problems:
            print("  - " + p)
        raise SystemExit(1)
    print("All structural checks passed.")


def main(argv=None):
    ap = argparse.ArgumentParser(description="Generate a responsive multi-page docs site.")
    sub = ap.add_subparsers(dest="cmd")
    g = sub.add_parser("generate")
    g.add_argument("--config", required=True)
    g.add_argument("--content")
    g.add_argument("--out")
    g.set_defaults(func=cmd_generate)
    c = sub.add_parser("check")
    c.add_argument("--out")
    c.set_defaults(func=cmd_check)
    args = ap.parse_args(argv)
    if not getattr(args, "func", None):
        ap.print_help()
        raise SystemExit(1)
    args.func(args)


if __name__ == "__main__":
    main()
