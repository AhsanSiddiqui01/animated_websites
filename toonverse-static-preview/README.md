# ToonVerse - static preview

A plain HTML/CSS/JS copy of the **ToonVerse** Odoo 18 website theme (`theme_toonverse`), so it can be hosted for free
(GitHub Pages, Netlify, Cloudflare Pages). No Odoo, no database, no server needed.

> This is a **preview**. The real product is the Odoo module in `../theme_toonverse`.

## Pages
`index.html` (home), `services.html`, `about.html`, `contact.html`, `message-sent.html`

## What is different from the Odoo version
- Odoo-only parts are removed: header search, Login / My Account links. "Create Free Account" buttons open the contact page.
- The contact form posts to an optional free form service instead of Odoo (see below).

## Run it locally
Open a terminal in this folder:

    python -m http.server 8000

then open http://localhost:8000

## Put it online for free (GitHub Pages)
1. Push this folder to GitHub (together with the module folders, or alone).
2. Repo > Settings > Pages > "Deploy from a branch" > choose the branch and the folder that holds `index.html`
   (`/ (root)` if this folder is the repo root, otherwise copy it to `/docs`).
3. Wait a minute; the site is at `https://<your-username>.github.io/<repo>/`.

## Contact form
Create a free endpoint at https://formspree.io (or https://web3forms.com) and paste its URL into `js/config.js`
(`TV_FORM_ENDPOINT`). Until then the form only shows a demo "Message sent" page and sends nothing.

## Rebuild after changing the Odoo module
The files are generated from the real Odoo templates, styles and scripts:

    pip install libsass lxml
    python build/build.py

(`build/` expects the module folder `theme_toonverse` to sit next to this folder.)
