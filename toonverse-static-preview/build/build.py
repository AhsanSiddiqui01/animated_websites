# -*- coding: utf-8 -*-
"""Builds the static ToonVerse preview (plain HTML/CSS/JS, no Odoo needed) from the real Odoo module.

    python build.py            (needs:  pip install libsass lxml)

Output goes to the parent folder (index.html, services.html, about.html, contact.html, message-sent.html, css/, js/, img/).
"""
import datetime
import os
import re
import shutil
import sys

import sass

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from qweb_lite import QWeb  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.dirname(HERE)
MOD = os.path.join(os.path.dirname(OUT), "theme_toonverse")


class Rec:
    def __init__(self, **kw): self.__dict__.update(kw)
    def __bool__(self): return True


MENU = [("Home", "index.html"), ("Services", "services.html"), ("About", "about.html"), ("Contact us", "contact.html")]
website = Rec(menu_id=Rec(child_id=[Rec(name=n, is_visible=True, new_window=False, _clean_url=(lambda u=u: u)) for n, u in MENU]))


def ctx_for(path):
    return {"request": Rec(params={}, httprequest=Rec(path=path), env=Rec(user=Rec(name="Visitor", _is_public=lambda: True))),
            "website": website, "datetime": datetime, "no_header": False, "no_footer": False}


qw = QWeb()
for f in ("layout", "pages", "about", "contact"):
    qw.load(os.path.join(MOD, "views", f + ".xml"))


def render(tid, xpath, path):
    return qw._node(qw.templates[tid].xpath(xpath)[0], ctx_for(path), False)


def fix_links(html):
    html = html.replace("/theme_toonverse/static/src/img/", "img/")
    html = re.sub(r'<form class="tv-search".*?</form>', "", html, flags=re.S)                 # header search posts to Odoo
    html = re.sub(r'<a href="/web/login" class="tv-login">.*?</a>', "", html, flags=re.S)      # header "Login" (no backend here)
    html = re.sub(r'<a href="/web/login">.*?</a>', "", html, flags=re.S)                       # footer "Login"
    html = re.sub(r'<a href="/my/home">.*?</a>', "", html, flags=re.S)                         # footer "My Account"
    html = html.replace('href="/web/signup"', 'href="contact.html"')                            # no sign-up without Odoo
    for old, new in (("/our-services", "services.html"), ("/about-us", "about.html"), ("/contactus", "contact.html"),
                     ("/message-sent", "message-sent.html")):
        html = re.sub(r'(href|action)="%s' % old, r'\1="%s' % new, html)
    html = re.sub(r'(href|action)="/#', r'\1="index.html#', html)
    html = re.sub(r'(href|action)="/"', r'\1="index.html"', html)
    return html


def inner(wrap_html):
    return re.match(r'\s*<div id="wrap">(.*)</div>\s*$', wrap_html, re.S).group(1)


PAGES = [  # file, title, template id, path used for the "active" menu link
    ("index.html", "ToonVerse - where cartoons come alive", "toonverse_home", "index.html"),
    ("services.html", "Services - ToonVerse", "toonverse_services", "services.html"),
    ("about.html", "About - ToonVerse", "toonverse_about", "about.html"),
    ("contact.html", "Contact - ToonVerse", "toonverse_contact", "contact.html"),
    ("message-sent.html", "Message sent - ToonVerse", "toonverse_contact_thanks", "message-sent.html"),
]


def page(title, header, body, footer):
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title>
<meta name="description" content="Your cartoon universe: epic animated adventures, legendary characters and endless entertainment.">
<link rel="stylesheet" href="css/base.css">
<link rel="stylesheet" href="css/style.css">
</head>
<body>
<div id="wrapwrap">
{header}
<main><div id="wrap">{body}</div></main>
{footer}
</div>
<script src="js/config.js"></script>
<script src="js/shim.js"></script>
<script src="js/toonverse.js"></script>
<script src="js/toonverse_live.js"></script>
<script src="js/form.js"></script>
<script src="js/boot.js"></script>
</body>
</html>
"""


for d in ("css", "js", "img"):
    os.makedirs(os.path.join(OUT, d), exist_ok=True)

footer = fix_links(render("toonverse_footer", ".//footer", ""))
for fn, title, tid, path in PAGES:
    header = fix_links(render("toonverse_header", ".//header", path))
    wrap = fix_links(render(tid, ".//div[@id='wrap']", path))
    with open(os.path.join(OUT, fn), "w", encoding="utf-8") as f:
        f.write(page(title, header, inner(wrap), footer))

# css: the module bundles three SCSS files (shared variables), so compile them as one
scss_dir = os.path.join(MOD, "static", "src", "scss")
src = "\n".join(open(os.path.join(scss_dir, n), encoding="utf-8").read()
                for n in ("toonverse.scss", "toonverse_live.scss", "toonverse_pages.scss"))
css = sass.compile(string=src).replace("/theme_toonverse/static/src/img/", "../img/")
with open(os.path.join(OUT, "css", "style.css"), "w", encoding="utf-8") as f:
    f.write(css)
shutil.copy(os.path.join(HERE, "base.css"), os.path.join(OUT, "css", "base.css"))

# js: the module's own scripts, wrapped so they run without Odoo
for name in ("toonverse.js", "toonverse_live.js"):
    s = open(os.path.join(MOD, "static", "src", "js", name), encoding="utf-8").read()
    s = re.sub(r'^/\*\* @odoo-module \*\*/\s*', "", s)
    s = re.sub(r'^import .*?;\s*$', "", s, flags=re.M)
    s = s.replace('"/theme_toonverse/static/src/img/"', '"img/"')
    s = s.replace('img[src*="theme_toonverse/static/src/img/"]', 'img[src^="img/"]')
    s = "(function () {\nconst { publicWidget } = window.TVShim;\n" + s + "\n})();\n"
    with open(os.path.join(OUT, "js", name), "w", encoding="utf-8") as f:
        f.write(s)
for name in ("shim.js", "form.js", "config.js"):
    shutil.copy(os.path.join(HERE, name), os.path.join(OUT, "js", name))
shutil.copy(os.path.join(HERE, "boot.js"), os.path.join(OUT, "js", "boot.js"))

imgdir = os.path.join(MOD, "static", "src", "img")
for fn in os.listdir(imgdir):
    shutil.copy(os.path.join(imgdir, fn), os.path.join(OUT, "img", fn))
open(os.path.join(OUT, ".nojekyll"), "w").close()
print("built:", OUT, "| pages:", len(PAGES))
