/* Runs the Odoo module's own scripts without Odoo.
   - publicWidget: a tiny stand-in (selector + delegated events + start/destroy)
   - rpc: answers "/toonreel/videos" (search, category filter, pagination) from data/videos.json in the browser,
          and "/toonreel/contact" by posting to an optional form service (see js/config.js)
   - loadJS: loads a script file (used for Three.js) */
(function () {
    const registry = {};
    const publicWidget = { registry, Widget: { extend(o) { return o; } } };

    // ---- videos (search / filter / pagination) ----
    let dataPromise = null;
    const load = () => dataPromise || (dataPromise = fetch("data/videos.json").then((r) => r.json()));

    async function videosRoute(p) {
        const data = await load();
        const q = String(p.q || "").trim().toLowerCase().slice(0, 100);
        const cat = parseInt(p.cat || 0, 10) || 0;
        let rows = data.videos.filter((v) => {
            if (cat && v.cat !== cat) return false;
            if (!q) return true;
            return v.name.toLowerCase().includes(q) || v.desc.toLowerCase().includes(q) || v.catName.toLowerCase().includes(q);
        });
        const size = data.perPage;
        const pages = Math.max(1, Math.ceil(rows.length / size));
        const page = Math.min(Math.max(parseInt(p.page || 1, 10) || 1, 1), pages);
        const slice = rows.slice((page - 1) * size, page * size);
        const html = slice.map((v, i) => v.html.replace("--dl:0.0s", "--dl:" + ((i % 5) * 0.06).toFixed(2) + "s")).join("");
        return { html, total: rows.length, page, pages, page_size: size };
    }

    // ---- contact form ----
    async function contactRoute(d) {
        if (d.website_url) return { ok: true }; // honeypot
        const name = (d.name || "").trim(), email = (d.email || "").trim(), message = (d.message || "").trim();
        if (!name) return { ok: false, error: "Please tell us your name." };
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, error: "Please enter a valid email address." };
        if (message.length < 5) return { ok: false, error: "Please write a short message." };
        const url = window.TR_FORM_ENDPOINT;
        if (!url) {
            console.info("[static preview] No form service configured (js/config.js), message not sent:", { name, email, subject: d.subject, message });
            setTimeout(() => { const p = document.querySelector(".trc-thanks p"); if (p) p.textContent = "This is a static preview, so your message was not actually sent."; }, 0);
            return { ok: true, demo: true };
        }
        const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify({ name, email, subject: d.subject, message }) });
        return res.ok ? { ok: true } : { ok: false, error: "Could not send your message. Please try again later." };
    }

    const rpc = async (route, params) => {
        if (route === "/toonreel/videos") return videosRoute(params || {});
        if (route === "/toonreel/contact") return contactRoute(params || {});
        throw new Error("Unknown route " + route);
    };

    const loaded = {};
    const loadJS = (url) => loaded[url] || (loaded[url] = new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = url; s.onload = resolve; s.onerror = reject;
        document.head.appendChild(s);
    }));

    window.TRShim = { publicWidget, rpc, loadJS };
})();
