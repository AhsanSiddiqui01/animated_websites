# ToonReel - static preview

A plain HTML/CSS/JS copy of the **ToonReel** Odoo 18 website theme (`theme_toonreel`), so it can be hosted for free
(GitHub Pages, Netlify, Cloudflare Pages). No Odoo, no database, no server needed.

> This is a **preview**. The real product is the Odoo module in `../theme_toonreel`, where an admin adds videos from the
> Odoo backend. Here the same design runs on demo data.

## What works
- 3D scroll hero (Three.js), scroll animations, Light / Dark switch (remembered in the browser)
- Video cards, search, category filter and pagination (10 per page), YouTube popup player
- Contact page (see "Contact form" below)

## What is different from the Odoo version
- No admin login and no backend: videos are listed in `build/build.py` (`VIDEOS`) and written to `data/videos.json`.
- Search / filter / pagination run in the browser instead of on the Odoo server.
- Demo videos are open-licensed Blender Foundation / Blender Studio films (Creative Commons).

## Run it locally
Open a terminal in this folder:

    python -m http.server 8000

then open http://localhost:8000 (opening `index.html` by double-click will not work, the video list is loaded with `fetch`).

## Put it online for free (GitHub Pages)
1. Push this folder to GitHub (together with the module folders, or alone).
2. Repo > Settings > Pages > "Deploy from a branch" > choose the branch and the folder that holds `index.html`
   (`/ (root)` if this folder is the repo root, otherwise copy it to `/docs`).
3. Wait a minute; the site is at `https://<your-username>.github.io/<repo>/`.

## Contact form
A static site cannot receive form posts. Create a free endpoint at https://formspree.io (or https://web3forms.com),
paste its URL into `js/config.js` (`TR_FORM_ENDPOINT`). Until then the form only shows a demo "thank you".

## Rebuild after changing the Odoo module or the demo videos
The files are generated from the real Odoo templates, styles and scripts:

    pip install libsass lxml
    python build/build.py

(`build/` expects the module folder `theme_toonreel` to sit next to this folder.)
