(function () {
const { publicWidget, rpc, loadJS } = window.TRShim;


// The page can be scrolled by the window, <body> or #wrapwrap depending on the Odoo version / CSS, so read all of them
const scrollers = () => [document.scrollingElement || document.documentElement, document.body, document.getElementById("wrapwrap")].filter(Boolean);
const getScroll = () => Math.max(window.scrollY || 0, ...scrollers().map((e) => e.scrollTop || 0));
const getMax = () => Math.max(1, ...scrollers().map((e) => e.scrollHeight - e.clientHeight));
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// Light / Dark switch. The choice is remembered in the browser (the <head> script applies it before first paint).
const getTheme = () => (document.documentElement.getAttribute("data-tr-theme") === "dark" ? "dark" : "light");
const syncSwitches = () => {
    const dark = getTheme() === "dark";
    document.querySelectorAll(".tr-theme").forEach((b) => {
        b.setAttribute("aria-checked", dark);
        b.setAttribute("title", dark ? "Switch to Light mode" : "Switch to Dark mode");
        b.setAttribute("aria-label", dark ? "Switch to Light mode" : "Switch to Dark mode");
    });
};
publicWidget.registry.ToonReelTheme = publicWidget.Widget.extend({
    selector: ".tr-theme",
    events: { click: "_onClick" },
    start() {
        syncSwitches();
        return this._super(...arguments);
    },
    _onClick() {
        const root = document.documentElement;
        const next = getTheme() === "dark" ? "light" : "dark";
        root.classList.add("tr-theming"); // short colour fade
        root.setAttribute("data-tr-theme", next);
        try { localStorage.setItem("tr-theme", next); } catch (e) { /* private mode: still works for this visit */ }
        syncSwitches();
        clearTimeout(this._fade);
        this._fade = setTimeout(() => root.classList.remove("tr-theming"), 450);
    },
});

// Sticky header: outline on scroll, progress bar, mobile menu, video search box
publicWidget.registry.ToonReelHeader = publicWidget.Widget.extend({
    selector: ".tr-header",
    events: {
        "click .tr-burger": "_onBurger",
        "click .tr-links a": "_onLink",
        "submit .tr-search": "_onSearchSubmit",
        "input .tr-search input": "_onSearchInput",
    },

    start() {
        const def = this._super(...arguments);
        this._onScroll = () => {
            const y = getScroll();
            this.el.classList.toggle("is-scrolled", y > 12);
            this.el.style.setProperty("--p", Math.min(1, y / getMax()).toFixed(4));
        };
        // capture mode: scroll events don't bubble, and the scroller may be #wrapwrap or window
        document.addEventListener("scroll", this._onScroll, { capture: true, passive: true });
        this._onScroll();
        // cinema header: also peek in when the mouse touches the top edge of the screen
        if (this.el.classList.contains("is-cinema")) {
            this._onMove = (ev) => this.el.classList.toggle("is-peek", ev.clientY < 70);
            document.addEventListener("mousemove", this._onMove, { passive: true });
        }
        return def;
    },

    destroy() {
        document.removeEventListener("scroll", this._onScroll, { capture: true });
        if (this._onMove) document.removeEventListener("mousemove", this._onMove);
        this._super(...arguments);
    },

    _toggle(open) {
        this.el.querySelector(".tr-links").classList.toggle("is-open", open);
        this.el.querySelector(".tr-burger").setAttribute("aria-expanded", open);
    },
    _onBurger(ev) {
        this._toggle(ev.currentTarget.getAttribute("aria-expanded") !== "true");
    },
    _onLink() {
        this._toggle(false);
    },

    // On the home page the search filters the videos in place; on other pages the form opens "/?q=..."
    _onSearchSubmit(ev) {
        if (!document.querySelector(".tr-cards")) return; // let the form submit normally
        ev.preventDefault();
        const q = ev.currentTarget.querySelector("input").value;
        document.dispatchEvent(new CustomEvent("toonreel:search", { detail: { q, scroll: true } }));
    },
    _onSearchInput(ev) {
        if (!document.querySelector(".tr-cards")) return;
        document.dispatchEvent(new CustomEvent("toonreel:search", { detail: { q: ev.currentTarget.value, scroll: false } }));
    },
});

// Home page: reveal on scroll, parallax, YouTube popup, and server-side search / category filter / pagination
publicWidget.registry.ToonReelHome = publicWidget.Widget.extend({
    selector: ".tr",
    events: {
        "click [data-yt]": "_onOpenVideo",
        "keydown [data-yt]": "_onKeyOpen",
        "click .tr-modal-x": "_closeVideo",
        "click .tr-modal": "_onBackdrop",
        "click [data-filter]": "_onFilter",
        "input .tr-vsearch-input": "_onVSearchInput",
        "click [data-clear]": "_onClear",
        "click .tr-pager [data-page]": "_onPage",
        "click .tr-cine-sound": "_onCineSound",
        "click .tr-cine-pause": "_onCinePause",
    },

    start() {
        const def = this._super(...arguments);
        this._initReveal();
        this._initCine();
        this._initParallax();
        this._onKey = (ev) => {
            if (ev.key === "Escape") this._closeVideo();
        };
        document.addEventListener("keydown", this._onKey);
        // the 3D hero asks for a video popup through this event
        this._onOpenEvt = (ev) => this._openModal(ev.detail || {});
        document.addEventListener("toonreel:openvideo", this._onOpenEvt);
        this._initVideos();
        return def;
    },

    destroy() {
        if (this._io) this._io.disconnect();
        if (this._cineIO) this._cineIO.disconnect();
        clearInterval(this._ytTimer);
        if (this._onYtMsg) window.removeEventListener("message", this._onYtMsg);
        document.removeEventListener("scroll", this._tick, { capture: true });
        window.removeEventListener("resize", this._tick);
        document.removeEventListener("keydown", this._onKey);
        document.removeEventListener("toonreel:search", this._onSearchEvt);
        document.removeEventListener("toonreel:openvideo", this._onOpenEvt);
        cancelAnimationFrame(this._raf);
        clearTimeout(this._debounce);
        this.el.classList.remove("tr-js");
        this._super(...arguments);
    },

    // ---- reveal on scroll ----
    _initReveal() {
        const items = this.el.querySelectorAll(".tr-reveal, .tr-char");
        if (!("IntersectionObserver" in window)) return;
        this.el.classList.add("tr-js");
        this._io = new IntersectionObserver(
            (entries) => {
                entries.forEach((e) => {
                    if (e.isIntersecting) {
                        e.target.classList.add("is-in");
                        this._io.unobserve(e.target);
                    }
                });
            },
            { threshold: 0.12, rootMargin: "0px 0px -5% 0px" }
        );
        items.forEach((el) => this._io.observe(el));
    },

    // ---- scroll-linked motion: elements with data-par drift and tilt as you scroll ----
    _initParallax() {
        this._pars = [...this.el.querySelectorAll("[data-par]")];
        this._mq = this.el.querySelector(".tr-marq-row");
        this._queued = false;
        this._tick = () => {
            if (this._queued) return;
            this._queued = true;
            this._raf = requestAnimationFrame(() => {
                this._queued = false;
                this._applyParallax();
            });
        };
        document.addEventListener("scroll", this._tick, { capture: true, passive: true });
        window.addEventListener("resize", this._tick);
        this._applyParallax();
    },

    _applyParallax() {
        const vh = window.innerHeight;
        for (const el of this._pars) {
            const f = parseFloat(el.dataset.par) || 0;
            const r = (el.offsetParent || el.parentElement).getBoundingClientRect();
            const off = r.top + r.height / 2 - vh / 2; // 0 when the parent is centred on screen
            el.style.setProperty("--par", clamp(off * f, -90, 90).toFixed(1) + "px");
            el.style.setProperty("--rot", clamp(off * -0.014 * Math.sign(f || 1), -10, 10).toFixed(1) + "deg");
        }
        if (this._mq) this._mq.style.setProperty("--mqx", (-getScroll() * 0.35).toFixed(1) + "px");
        if (this.cine) this.cine.style.setProperty("--hp", clamp(getScroll() / vh, 0, 1).toFixed(3));
    },

    // ======================================================================
    // Cinema hero: background video (YouTube or uploaded file). Fades in when ready, pauses when off-screen.
    // ======================================================================
    _initCine() {
        this.cine = this.el.querySelector(".tr-cine");
        if (!this.cine) return;
        this._cv = this.cine.querySelector(".tr-cine-video");
        this._cy = this.cine.querySelector(".tr-cine-yt");
        this._cs = { paused: false, muted: true, visible: true };
        const media = this._cv || this._cy;
        if (!media) return;
        const ready = () => media.classList.add("is-ready");
        if (this._cv) {
            this._cv.muted = true;
            this._cv.addEventListener("playing", ready, { once: true });
            const p = this._cv.play();
            if (p && p.catch) p.catch(() => {}); // autoplay blocked: the poster / gradient stays visible
            setTimeout(ready, 4000);
        } else {
            // fade the YouTube frame in only once it really plays (avoids its loading spinner). Fallback after 7s.
            const y = this._cy;
            let done = false;
            const finish = () => {
                if (done) return;
                done = true;
                clearInterval(this._ytTimer);
                window.removeEventListener("message", this._onYtMsg);
                ready();
            };
            this._onYtMsg = (ev) => {
                if (!y.contentWindow || ev.source !== y.contentWindow) return;
                let d = ev.data;
                if (typeof d === "string") {
                    try {
                        d = JSON.parse(d);
                    } catch (e) {
                        return;
                    }
                }
                if (!d) return;
                if ((d.event === "onStateChange" && d.info === 1) || (d.event === "infoDelivery" && d.info && d.info.playerState === 1)) finish();
            };
            window.addEventListener("message", this._onYtMsg);
            const listen = () => {
                if (y.contentWindow) y.contentWindow.postMessage(JSON.stringify({ event: "listening", id: 1, channel: "widget" }), "*");
            };
            listen();
            this._ytTimer = setInterval(listen, 500);
            setTimeout(finish, 7000);
        }
        // save CPU/data: pause while the hero is scrolled out of view
        if ("IntersectionObserver" in window) {
            this._cineIO = new IntersectionObserver((entries) => {
                this._cs.visible = entries[0].isIntersecting;
                this._cinePlayState();
            }, { threshold: 0.05 });
            this._cineIO.observe(this.cine);
        }
    },
    _cineCmd(func, args) {
        if (this._cy && this._cy.contentWindow) {
            this._cy.contentWindow.postMessage(JSON.stringify({ event: "command", func, args: args || [] }), "*");
        }
    },
    _cinePlayState() {
        const play = this._cs.visible && !this._cs.paused;
        if (this._cv) {
            if (play) {
                const p = this._cv.play();
                if (p && p.catch) p.catch(() => {});
            } else this._cv.pause();
        } else {
            this._cineCmd(play ? "playVideo" : "pauseVideo");
        }
    },
    _onCinePause(ev) {
        this._cs.paused = !this._cs.paused;
        const btn = ev.currentTarget;
        btn.querySelector(".lbl").textContent = this._cs.paused ? "Play" : "Pause";
        btn.querySelector("path").setAttribute("d", this._cs.paused ? "M7 4.5v15l12-7.5z" : "M8 5v14M16 5v14");
        btn.setAttribute("aria-label", this._cs.paused ? "Play video" : "Pause video");
        this._cinePlayState();
    },
    _onCineSound(ev) {
        this._cs.muted = !this._cs.muted;
        const btn = ev.currentTarget;
        btn.classList.toggle("is-on", !this._cs.muted);
        btn.querySelector(".lbl").textContent = this._cs.muted ? "Sound on" : "Sound off";
        btn.setAttribute("aria-label", this._cs.muted ? "Turn sound on" : "Turn sound off");
        if (this._cv) this._cv.muted = this._cs.muted;
        else this._cineCmd(this._cs.muted ? "mute" : "unMute");
    },

    // ======================================================================
    // Videos: search + category filter + pagination (server side, so it covers ALL videos)
    // ======================================================================
    _initVideos() {
        this.grid = this.el.querySelector(".tr-cards");
        if (!this.grid) return;
        const total = parseInt(this.grid.dataset.total || "0", 10);
        const size = parseInt(this.grid.dataset.pageSize || "10", 10) || 10;
        this._state = { q: "", cat: "all", page: 1 };
        this._meta = { total, page: 1, pages: Math.max(1, Math.ceil(total / size)), page_size: size };
        this._seq = 0;
        this._renderPager();
        this._updateStatus();
        // header search box -> events
        this._onSearchEvt = (ev) => this._setQuery(ev.detail.q, !!ev.detail.scroll, !ev.detail.scroll);
        document.addEventListener("toonreel:search", this._onSearchEvt);
        // opened from another page as /?q=word
        const q = new URLSearchParams(window.location.search).get("q");
        if (q) this._setQuery(q, true, false);
    },

    _setQuery(q, scroll, debounce) {
        q = (q || "").trim();
        // keep both search boxes in sync
        const boxes = [this.el.querySelector(".tr-vsearch-input"), document.querySelector(".tr-search input")];
        boxes.forEach((b) => {
            if (b && b.value.trim() !== q) b.value = q;
        });
        const x = this.el.querySelector(".tr-vsearch-x");
        if (x) x.hidden = !q;
        this._state.q = q;
        this._state.page = 1;
        clearTimeout(this._debounce);
        const run = () => this._load(scroll);
        if (debounce) this._debounce = setTimeout(run, 300);
        else run();
    },

    _onVSearchInput(ev) {
        this._setQuery(ev.currentTarget.value, false, true);
    },
    _onClear() {
        this._state.cat = "all";
        this.el.querySelectorAll(".tr-fchip").forEach((c) => c.classList.toggle("is-on", c.dataset.filter === "all"));
        this._setQuery("", false, false);
    },
    _onFilter(ev) {
        const el = ev.currentTarget;
        const f = String(el.dataset.filter);
        this._state.cat = f;
        this._state.page = 1;
        this.el.querySelectorAll(".tr-fchip").forEach((c) => c.classList.toggle("is-on", String(c.dataset.filter) === f));
        this._load(false);
        if (el.dataset.goto) this._scrollToVideos();
    },
    _onPage(ev) {
        const p = parseInt(ev.currentTarget.dataset.page, 10);
        if (!p || p === this._state.page) return;
        this._state.page = p;
        this._load(true);
    },

    _scrollToVideos() {
        const sec = this.el.querySelector("#latest");
        if (sec) sec.scrollIntoView({ behavior: "smooth", block: "start" });
    },

    async _load(scroll) {
        if (!this.grid) return;
        const seq = ++this._seq;
        this.grid.classList.add("is-loading");
        let res;
        try {
            res = await rpc("/toonreel/videos", {
                page: this._state.page,
                q: this._state.q,
                cat: this._state.cat === "all" ? 0 : parseInt(this._state.cat, 10),
            });
        } catch (e) {
            this.grid.classList.remove("is-loading");
            return;
        }
        if (seq !== this._seq) return; // a newer request replaced this one
        this.grid.classList.remove("is-loading");
        this.grid.innerHTML = res.html;
        this._state.page = res.page;
        this._meta = res;
        this._renderPager();
        this._updateStatus();
        if (scroll) this._scrollToVideos();
    },

    _updateStatus() {
        const { total, page, page_size: size } = this._meta;
        const { q, cat } = this._state;
        const filtered = !!q || cat !== "all";
        const result = this.el.querySelector(".tr-result");
        const none = this.el.querySelector(".tr-noresult");
        if (none) {
            none.hidden = total > 0 || !filtered;
            const qEl = none.querySelector(".q");
            if (qEl) qEl.textContent = q ? "“" + q + "”" : "this category";
        }
        if (!result) return;
        if (!total) {
            result.textContent = "";
        } else if (total > size || filtered) {
            const from = (page - 1) * size + 1;
            const to = Math.min(total, page * size);
            result.textContent = `Showing ${from}-${to} of ${total} video${total === 1 ? "" : "s"}` + (q ? ` for “${q}”` : "");
        } else {
            result.textContent = "";
        }
    },

    _renderPager() {
        const nav = this.el.querySelector(".tr-pager");
        if (!nav) return;
        const { page, pages } = this._meta;
        if (pages <= 1) {
            nav.hidden = true;
            nav.innerHTML = "";
            return;
        }
        nav.hidden = false;
        const nums = [...new Set([1, pages, page - 1, page, page + 1].filter((n) => n >= 1 && n <= pages))].sort((a, b) => a - b);
        let html = `<button type="button" class="tr-pg tr-pg-arrow" data-page="${page - 1}" aria-label="Previous page"${page === 1 ? " disabled" : ""}>&#8249;</button>`;
        let prev = 0;
        for (const n of nums) {
            if (n - prev > 1) html += '<span class="tr-pg-gap">&hellip;</span>';
            html += `<button type="button" class="tr-pg${n === page ? " is-on" : ""}" data-page="${n}"${n === page ? ' aria-current="page"' : ""}>${esc(n)}</button>`;
            prev = n;
        }
        html += `<button type="button" class="tr-pg tr-pg-arrow" data-page="${page + 1}" aria-label="Next page"${page === pages ? " disabled" : ""}>&#8250;</button>`;
        nav.innerHTML = html;
    },

    // ---- YouTube popup (youtube-nocookie embed) ----
    _onKeyOpen(ev) {
        if (ev.key === "Enter" || ev.key === " ") this._onOpenVideo(ev);
    },
    _onOpenVideo(ev) {
        const el = ev.currentTarget;
        if (!el.dataset.yt) return;
        ev.preventDefault();
        this._openModal({ id: el.dataset.yt, title: el.dataset.title, desc: el.dataset.desc });
    },
    _openModal({ id, title, desc }) {
        if (!id) return;
        const modal = this.el.querySelector(".tr-modal");
        modal.querySelector("iframe").src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?autoplay=1&rel=0&modestbranding=1`;
        modal.querySelector(".tr-modal-title").textContent = title || "";
        modal.querySelector(".tr-modal-desc").textContent = desc || "";
        modal.querySelector(".tr-yt-link").href = `https://www.youtube.com/watch?v=${encodeURIComponent(id)}`;
        modal.classList.add("is-open");
    },
    _onBackdrop(ev) {
        if (ev.target === ev.currentTarget) this._closeVideo();
    },
    _closeVideo() {
        const modal = this.el.querySelector(".tr-modal");
        if (!modal || !modal.classList.contains("is-open")) return;
        modal.classList.remove("is-open");
        modal.querySelector("iframe").src = "about:blank"; // stops playback
    },
});

// Contact page form
publicWidget.registry.ToonReelContact = publicWidget.Widget.extend({
    selector: ".trc",
    events: { "submit .tr-cform": "_onSubmit" },

    start() {
        const def = this._super(...arguments);
        // footer links open /contactus?subject=copyright|report|suggest|general
        const subject = new URLSearchParams(window.location.search).get("subject");
        const select = this.el.querySelector("select[name=subject]");
        if (select && subject && [...select.options].some((o) => o.value === subject)) select.value = subject;
        return def;
    },

    _showError(msg) {
        const box = this.el.querySelector(".trc-error");
        box.textContent = msg || "";
        box.hidden = !msg;
    },

    async _onSubmit(ev) {
        ev.preventDefault();
        const form = ev.currentTarget;
        this._showError("");
        if (!form.checkValidity()) {
            form.reportValidity();
            return;
        }
        const btn = form.querySelector(".trc-send");
        const label = btn.querySelector(".lbl");
        btn.disabled = true;
        label.textContent = "Sending...";
        const data = Object.fromEntries(new FormData(form).entries());
        try {
            const res = await rpc("/toonreel/contact", data);
            if (res && res.ok) {
                form.hidden = true;
                this.el.querySelector(".trc-thanks").hidden = false;
                form.reset();
                return;
            }
            this._showError((res && res.error) || "Something went wrong. Please try again.");
        } catch (e) {
            this._showError("Could not send your message. Please check your connection and try again.");
        }
        btn.disabled = false;
        label.textContent = "Send message";
    },
});

})();
