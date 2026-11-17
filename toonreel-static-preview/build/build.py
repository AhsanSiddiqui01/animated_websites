# -*- coding: utf-8 -*-
"""Builds the static ToonReel preview (plain HTML/CSS/JS, no Odoo needed) from the real Odoo module.

    python build.py            (needs:  pip install libsass lxml)

Output goes to the parent folder (index.html, contact.html, css/, js/, img/, data/).
Edit the VIDEOS / CATEGORIES lists below (or data/videos.json after the build is not enough - rebuild instead) to change the demo content.
"""
import datetime
import json
import os
import re
import shutil
import sys
import sass

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from qweb_lite import QWeb, Raw

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.dirname(HERE)
MOD = os.path.join(os.path.dirname(OUT), "theme_toonreel")

# ------------------------------------------------------------------ demo content (open-licensed Blender films, safe to embed)
CATEGORIES = [
    (1, "Adventure", "orange"),
    (2, "Comedy", "yellow"),
    (3, "Fantasy", "violet"),
    (4, "Family", "mint"),
]
LIC = " Open movie by the Blender Foundation / Blender Studio, released under a Creative Commons licence (CC BY)."
# (youtube id, title, category id, in 3D hero, description)
VIDEOS = [
    ("aqz-KE-bpKQ", "Big Buck Bunny", 2, True, "A giant rabbit takes on three bullying rodents." + LIC),
    ("_cMxraX_5RE", "Sprite Fright", 3, True, "A funny forest adventure with mischievous creatures." + LIC),
    ("Y-rmzh0PI3c", "Cosmos Laundromat", 1, True, "A lonely sheep and a very strange salesman." + LIC),
    ("SkVqJ1SGeL0", "Caminandes: Llamigos", 4, True, "Koro the llama and Oti the armadillo go after a tasty snack." + LIC),
    ("WhWc3b3KhnY", "Spring", 3, True, "A shepherd girl and her dog face ancient spirits in a timeless cycle of life." + LIC),
    ("TLkA0RELQ1g", "Elephants Dream", 1, False, "Two strange characters explore a surreal mechanical world." + LIC),
    ("eRsGyueVLvQ", "Sintel", 1, False, "A young woman searches the world for the baby dragon she once befriended." + LIC),
    ("R6MlUcmOul8", "Tears of Steel", 1, False, "A group of warriors and scientists try to save the world from destructive robots." + LIC),
    ("PVGeM40dABA", "Coffee Run", 2, False, "A sleepy office worker, a coffee machine and a very bad morning." + LIC),
    ("mN0zPOpADL4", "Agent 327: Operation Barbershop", 2, False, "A secret agent investigates a suspicious barbershop." + LIC),
    ("Z4C82eyhwgU", "Caminandes: Gran Dillama", 4, False, "Koro the llama is on a mission to cross the fence for some fresh berries." + LIC),
    ("UXqq0ZvbOnk", "Charge", 1, False, "A weary space soldier makes a desperate dash for his last bit of energy." + LIC),
    ("u9lj-c29dxI", "Wing It!", 4, False, "A little bird, a big sky and a very small plan." + LIC),
]
PAGE_SIZE = 10
HEADLINE = "Press play on cartoon fun!"
SUBTITLE = "A bright little corner of the internet for animated stories. Pick a video, hit play and let the adventure roll."


# ------------------------------------------------------------------ stand-ins for the Odoo records the templates read
class Empty:
    id = 0
    def __bool__(self): return False
    def __getattr__(self, k): return ""


class Rec:
    def __init__(self, **kw): self.__dict__.update(kw)
    def __bool__(self): return True


class RecSet(list):
    def filtered(self, key): return RecSet(r for r in self if getattr(r, key))
    def __getitem__(self, i):
        r = super().__getitem__(i)
        return RecSet(r) if isinstance(i, slice) else r


cats = RecSet()
videos = RecSet()
for cid, name, color in CATEGORIES:
    cats.append(Rec(id=cid, name=name, color=color, published_count=sum(1 for v in VIDEOS if v[2] == cid)))
cat_by_id = {c.id: c for c in cats}
for i, (yt, title, cid, hero, desc) in enumerate(VIDEOS, 1):
    videos.append(Rec(id=i, name=title, youtube_id=yt, description=desc, category_id=cat_by_id[cid], show_in_hero=hero,
                      card_image_url=(lambda yt=yt: "https://img.youtube.com/vi/%s/maxresdefault.jpg" % yt)))

hero = Rec(
    style="webgl", poster=False, headline=HEADLINE, subtitle=SUBTITLE,
    scene_json=lambda: json.dumps([
        {"id": v.youtube_id, "title": v.name, "desc": v.description, "cat": v.category_id.name, "img": v.card_image_url()}
        for v in videos if v.show_in_hero
    ]),
)


class Model:
    def __init__(self, name): self.name = name
    def sudo(self): return self
    def search(self, domain=None, limit=None, **kw):
        if self.name == "toonreel.hero": return hero
        rows = videos if self.name == "toonreel.video" else cats
        return RecSet(rows[:limit] if limit else rows)
    def search_count(self, domain=None): return len(videos)
    def get_param(self, key, default=None): return str(PAGE_SIZE)


class Env:
    def __getitem__(self, name): return Model(name)
    user = Rec(name="Visitor", _is_public=lambda: True)


def make_request(path):
    return Rec(env=Env(), params={}, httprequest=Rec(path=path), lang=Rec(url_code="en_US"))


MENU = [("Home", "index.html"), ("Videos", "index.html#latest"), ("Categories", "index.html#categories"), ("Contact us", "contact.html")]
website = Rec(menu_id=Rec(child_id=[Rec(name=n, is_visible=True, new_window=False, _clean_url=(lambda u=u: u)) for n, u in MENU]))


# ------------------------------------------------------------------ render
qw = QWeb()
for f in ("layout", "cards", "home", "contact"):
    qw.load(os.path.join(MOD, "views", f + ".xml"))


def find(tid, xpath):
    return qw.templates[tid].xpath(xpath)[0]


def ctx_for(path):
    return {"request": make_request(path), "website": website, "datetime": datetime, "res_company": Rec(email=""),
            "int": int, "len": len, "no_header": False, "no_footer": False}


def render_el(el, path):
    return qw._node(el, ctx_for(path), False)


def fix_links(html):
    html = html.replace("/theme_toonreel/static/src/img/", "img/")
    html = re.sub(r'(href|action)="/contactus', r'\1="contact.html', html)
    html = re.sub(r'(href|action)="/#', r'\1="index.html#', html)
    html = re.sub(r'(href|action)="/"', r'\1="index.html"', html)
    html = re.sub(r'<a href="/web/login"[^>]*>.*?</a>', "", html, flags=re.S)           # header "Admin login" (no backend here)
    html = re.sub(r'<div class="tr-fcol"><h4>Team</h4>.*?</div>', "", html, flags=re.S)  # footer "Team / Admin login" column
    return html


header = fix_links(render_el(find("toonreel_header", ".//header"), ""))
footer = fix_links(render_el(find("toonreel_footer", ".//footer"), ""))
home = fix_links(render_el(find("toonreel_home", ".//div[@id='wrap']"), ""))
contact_header = fix_links(render_el(find("toonreel_header", ".//header"), "contactus"))
contact = fix_links(render_el(find("toonreel_contact", ".//div[@id='wrap']"), "contactus"))

# one pre-rendered card per video; the browser filters / pages them (same markup as the Odoo route)
cards_json = []
for v in videos:
    c = ctx_for("")
    c.update({"videos": RecSet([v]), "instant": True})
    cards_json.append({
        "id": v.id, "name": v.name, "desc": v.description, "cat": v.category_id.id, "catName": v.category_id.name,
        "html": fix_links(qw.render_template("toonreel_cards", c)),
    })

FONTS = "https://fonts.googleapis.com/css2?family=Baloo+2:wght@600;700;800&family=Nunito:wght@400;600;700;800&display=swap"
THEME_JS = 'try{var t=localStorage.getItem("tr-theme")||"light";document.documentElement.setAttribute("data-tr-theme",t==="dark"?"dark":"light")}catch(e){document.documentElement.setAttribute("data-tr-theme","light")}'


def page(title, desc, head_html, body_html):
    return f"""<!doctype html>
<html lang="en" data-tr-theme="light">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title>
<meta name="description" content="{desc}">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="{FONTS}">
<script>{THEME_JS}</script>
<link rel="stylesheet" href="css/base.css">
<link rel="stylesheet" href="css/style.css">
</head>
<body>
<div id="wrapwrap">
{head_html}
<main><div id="wrap">{body_html}</div></main>
{footer}
</div>
<script src="js/config.js"></script>
<script src="js/shim.js"></script>
<script src="js/toonreel.js"></script>
<script src="js/toonreel_scene.js"></script>
<script src="js/boot.js"></script>
</body>
</html>
"""


def inner(wrap_html):
    # the QWeb node is <div id="wrap">...</div>; page() adds its own #wrap, so strip the outer one
    m = re.match(r'\s*<div id="wrap">(.*)</div>\s*$', wrap_html, re.S)
    return m.group(1)


for d in ("css", "js", "img", "data"):
    os.makedirs(os.path.join(OUT, d), exist_ok=True)

with open(os.path.join(OUT, "index.html"), "w", encoding="utf-8") as f:
    f.write(page("ToonReel - cartoon videos", "A bright little corner of the internet for animated stories.", header, inner(home)))
with open(os.path.join(OUT, "contact.html"), "w", encoding="utf-8") as f:
    f.write(page("Contact - ToonReel", "Send ToonReel a message.", contact_header, inner(contact)))

with open(os.path.join(OUT, "data", "videos.json"), "w", encoding="utf-8") as f:
    json.dump({"perPage": PAGE_SIZE, "videos": cards_json}, f, ensure_ascii=False, indent=1)

# ------------------------------------------------------------------ css
css = sass.compile(filename=os.path.join(MOD, "static", "src", "scss", "toonreel.scss"))
css = css.replace("/theme_toonreel/static/src/img/", "../img/")
with open(os.path.join(OUT, "css", "style.css"), "w", encoding="utf-8") as f:
    f.write(css)
with open(os.path.join(OUT, "css", "base.css"), "w", encoding="utf-8") as f:
    f.write(open(os.path.join(HERE, "base.css"), encoding="utf-8").read())

# ------------------------------------------------------------------ js (the module's own scripts, unchanged, wrapped so they run without Odoo)
for name in ("toonreel.js", "toonreel_scene.js"):
    src = open(os.path.join(MOD, "static", "src", "js", name), encoding="utf-8").read()
    src = re.sub(r'^/\*\* @odoo-module \*\*/\s*', "", src)
    src = re.sub(r'^import .*?;\s*$', "", src, flags=re.M)
    src = "(function () {\nconst { publicWidget, rpc, loadJS } = window.TRShim;\n" + src + "\n})();\n"
    with open(os.path.join(OUT, "js", name), "w", encoding="utf-8") as f:
        f.write(src)
for name in ("shim.js", "boot.js", "config.js"):
    shutil.copy(os.path.join(HERE, name), os.path.join(OUT, "js", name))

# ------------------------------------------------------------------ images
imgdir = os.path.join(MOD, "static", "src", "img")
for fn in os.listdir(imgdir):
    shutil.copy(os.path.join(imgdir, fn), os.path.join(OUT, "img", fn))
open(os.path.join(OUT, ".nojekyll"), "w").close()
print("built:", OUT, "| videos:", len(videos), "| home bytes:", len(home))
