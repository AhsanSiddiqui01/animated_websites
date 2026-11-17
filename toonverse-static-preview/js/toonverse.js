(function () {
const { publicWidget } = window.TVShim;

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));

// Mobile menu toggle (☰ / ✕)
publicWidget.registry.ToonverseHeader = publicWidget.Widget.extend({
    selector: ".tv-header",
    events: { "click .tv-toggle": "_onToggle" },
    _onToggle(ev) {
        const btn = ev.currentTarget;
        const open = this.el.querySelector(".tv-links").classList.toggle("tv-open");
        btn.setAttribute("aria-expanded", open);
        btn.textContent = open ? "✕" : "☰";
    },
});

// Cinematic, scroll-driven home page
publicWidget.registry.ToonverseHome = publicWidget.Widget.extend({
    selector: ".tvh",

    start() {
        const def = this._super(...arguments);
        this._cleanups = [];
        // Note: prefers-reduced-motion is intentionally NOT honoured here. Windows Server (and many RDP/VM setups)
        // report "reduce" by default, which would silently disable every animation on this site.
        this._reduced = false;
        this.el.classList.add("tvh-js");
        this._initStars();
        this._initWords();
        this._initReveal();
        this._initParallax();
        this._initTilt();
        this._initServices();
        this._initScroll();
        return def;
    },

    destroy() {
        (this._cleanups || []).forEach((fn) => fn());
        this._super(...arguments);
    },

    _on(target, type, fn, opts) {
        target.addEventListener(type, fn, opts);
        this._cleanups.push(() => target.removeEventListener(type, fn, opts));
    },

    _q(sel) {
        return this.el.querySelector(sel);
    },
    _qa(sel) {
        return [...this.el.querySelectorAll(sel)];
    },

    _initStars() {
        const box = this._q(".tvh-stars");
        if (!box || box.children.length) {
            return;
        }
        for (let i = 0; i < 44; i++) {
            const s = document.createElement("span");
            const size = 1 + Math.random() * 2.6;
            s.style.cssText =
                `left:${Math.random() * 100}%;top:${Math.random() * 100}%;width:${size}px;height:${size}px;` +
                `animation-duration:${3 + Math.random() * 4}s;animation-delay:${-Math.random() * 6}s;`;
            box.appendChild(s);
        }
    },

    // Big statement: words light up one by one while scrolling
    _initWords() {
        const el = this._q(".tvh-bigtext");
        if (!el) {
            return;
        }
        const frag = document.createDocumentFragment();
        const walk = (node, hl) => {
            node.childNodes.forEach((n) => {
                if (n.nodeType === 3) {
                    n.textContent.split(/(\s+)/).forEach((part) => {
                        if (!part) {
                            return;
                        }
                        if (/^\s+$/.test(part)) {
                            frag.appendChild(document.createTextNode(" "));
                        } else {
                            const w = document.createElement("span");
                            w.className = "w" + (hl ? " hl" : "");
                            w.textContent = part;
                            frag.appendChild(w);
                        }
                    });
                } else if (n.nodeType === 1) {
                    walk(n, hl || n.tagName === "EM");
                }
            });
        };
        walk(el, false);
        el.textContent = "";
        el.appendChild(frag);
        this._words = { el, list: [...el.querySelectorAll(".w")] };
    },

    _updateWords() {
        if (!this._words) {
            return;
        }
        const { el, list } = this._words;
        const r = el.getBoundingClientRect();
        const vh = window.innerHeight;
        const p = clamp((vh * 0.82 - r.top) / (r.height + vh * 0.2));
        const n = Math.round(p * list.length);
        list.forEach((w, i) => w.classList.toggle("on", i < n));
    },

    _initReveal() {
        const items = this._qa(".tvh-reveal");
        const counters = this._qa("[data-count]");
        if (this._reduced || !("IntersectionObserver" in window)) {
            items.forEach((i) => i.classList.add("tvh-in"));
            counters.forEach((c) => this._setCount(c, 1));
            return;
        }
        const io = new IntersectionObserver(
            (entries) => {
                entries.forEach((e) => {
                    if (e.isIntersecting) {
                        e.target.classList.add("tvh-in");
                        io.unobserve(e.target);
                    }
                });
            },
            { threshold: 0.12, rootMargin: "0px 0px -6% 0px" }
        );
        items.forEach((i) => io.observe(i));
        counters.forEach((c) => this._setCount(c, 0));
        const co = new IntersectionObserver(
            (entries) => {
                entries.forEach((e) => {
                    if (e.isIntersecting) {
                        this._animateCount(e.target);
                        co.unobserve(e.target);
                    }
                });
            },
            { threshold: 0.6 }
        );
        counters.forEach((c) => co.observe(c));
        this._cleanups.push(() => {
            io.disconnect();
            co.disconnect();
        });
    },

    _setCount(el, p) {
        const target = parseFloat(el.dataset.count) || 0;
        const dec = parseInt(el.dataset.decimals || "0", 10);
        el.textContent =
            (target * p).toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec }) + (el.dataset.suffix || "");
    },

    _animateCount(el) {
        const t0 = performance.now();
        const tick = (now) => {
            const t = Math.min(1, (now - t0) / 1800);
            this._setCount(el, 1 - Math.pow(1 - t, 3));
            if (t < 1) {
                requestAnimationFrame(tick);
            }
        };
        requestAnimationFrame(tick);
    },

    // Mouse parallax on hero visual
    _initParallax() {
        const hero = this._q(".tvh-hero");
        if (!hero || this._reduced || !window.matchMedia("(hover: hover)").matches) {
            return;
        }
        const layers = this._qa(".tvh-par");
        let raf = 0;
        const move = (ev) => {
            const r = hero.getBoundingClientRect();
            const nx = (ev.clientX - r.left) / r.width - 0.5;
            const ny = (ev.clientY - r.top) / r.height - 0.5;
            cancelAnimationFrame(raf);
            raf = requestAnimationFrame(() => {
                layers.forEach((l) => {
                    const d = parseFloat(l.dataset.depth || "20");
                    l.style.transform = `translate3d(${(nx * d).toFixed(1)}px, ${(ny * d).toFixed(1)}px, 0)`;
                });
            });
        };
        this._on(hero, "mousemove", move);
        this._on(hero, "mouseleave", () => layers.forEach((l) => (l.style.transform = "")));
    },

    // 3D tilt on trending cards
    _initTilt() {
        if (this._reduced || !window.matchMedia("(hover: hover)").matches) {
            return;
        }
        this._qa(".tvh-card").forEach((card) => {
            this._on(card, "mousemove", (ev) => {
                const r = card.getBoundingClientRect();
                const x = (ev.clientX - r.left) / r.width - 0.5;
                const y = (ev.clientY - r.top) / r.height - 0.5;
                card.style.setProperty("--ry", `${(x * 12).toFixed(2)}deg`);
                card.style.setProperty("--rx", `${(-y * 12).toFixed(2)}deg`);
            });
            this._on(card, "mouseleave", () => {
                card.style.setProperty("--rx", "0deg");
                card.style.setProperty("--ry", "0deg");
            });
        });
    },

    // Services page: cursor spotlight on cards + monthly/yearly price switch
    _initServices() {
        this._qa(".tvh-svc").forEach((card) => {
            this._on(card, "mousemove", (ev) => {
                const r = card.getBoundingClientRect();
                card.style.setProperty("--mx", `${ev.clientX - r.left}px`);
                card.style.setProperty("--my", `${ev.clientY - r.top}px`);
            });
        });
        const sw = this._q(".tvh-switch");
        if (!sw) {
            return;
        }
        const btns = [...sw.querySelectorAll("button")];
        const amts = this._qa(".tvh-amt");
        const notes = this._qa(".tvh-bill");
        btns.forEach((b) =>
            this._on(b, "click", () => {
                const yearly = b.dataset.mode === "y";
                sw.classList.toggle("y", yearly);
                btns.forEach((x) => x.classList.toggle("on", x === b));
                amts.forEach((a) => {
                    a.classList.add("swap");
                    const id = setTimeout(() => {
                        a.textContent = yearly ? a.dataset.y : a.dataset.m;
                        a.classList.remove("swap");
                    }, 170);
                    this._cleanups.push(() => clearTimeout(id));
                });
                notes.forEach((n) => (n.textContent = yearly ? n.dataset.y : n.dataset.m));
            })
        );
    },

    // ---------- scroll-linked scenes ----------
    _initScroll() {
        this._sc = {
            hero: this._q(".tvh-hero"),
            copy: this._q(".tvh-copy"),
            stage: this._q(".tvh-stage"),
            blobs: this._qa(".tvh-blob"),
            story: this._q(".tvh-story"),
            chapters: this._qa(".tvh-chapter"),
            arts: this._qa(".tvh-art"),
            glows: this._qa(".tvh-glow"),
            dots: this._qa(".tvh-dots i"),
            ring: this._q(".tvh-story-ring"),
            hs: this._q(".tvh-hs"),
            track: this._q(".tvh-hs-track"),
            mq: this._q(".tvh-mq"),
            rows: this._qa(".tvh-mrow"),
            tl: this._q(".tvh-tl"),
            steps: this._qa(".tvh-step"),
            pars: this._qa("[data-par]"),
            cta: this._q(".tvh-cta"),
            fls: this._qa(".tvh-fl"),
            bar: this._q(".tvh-progress"),
            header: document.querySelector("header.tv-header"),
        };
        this._hsDist = 0;
        this._flat = null;
        let ticking = false;
        const schedule = () => {
            if (!ticking) {
                ticking = true;
                requestAnimationFrame(() => {
                    ticking = false;
                    this._update();
                });
            }
        };
        const relayout = () => {
            this._applyMode();
            this._measure();
            schedule();
        };
        // #wrapwrap is the scroll container in Odoo, so listen in capture mode
        this._on(document, "scroll", schedule, true);
        this._on(window, "scroll", schedule);
        this._on(window, "resize", relayout);
        this._on(window, "load", relayout);
        this._applyMode();
        this._measure();
        [400, 1200, 2500].forEach((ms) => {
            const id = setTimeout(relayout, ms);
            this._cleanups.push(() => clearTimeout(id));
        });
        this._update();
    },

    _applyMode() {
        const flat = this._reduced || window.innerWidth <= 980;
        if (flat === this._flat) {
            return;
        }
        this._flat = flat;
        this.el.classList.toggle("tvh-flat", flat);
        if (flat) {
            const sc = this._sc;
            [...sc.chapters, ...sc.arts, ...sc.glows].forEach((e) => {
                e.style.opacity = "";
                e.style.transform = "";
            });
            if (sc.track) {
                sc.track.style.transform = "";
            }
            if (sc.hs) {
                sc.hs.style.removeProperty("--hsh");
            }
        }
    },

    _measure() {
        const sc = this._sc;
        if (this._flat || !sc.hs || !sc.track) {
            return;
        }
        const dist = Math.max(0, sc.track.scrollWidth - window.innerWidth + 40);
        this._hsDist = dist;
        sc.hs.style.setProperty("--hsh", `${Math.round(dist + window.innerHeight)}px`);
    },

    _update() {
        const sc = this._sc;
        const vh = window.innerHeight;
        const flat = this._flat;

        // overall progress bar + header state
        const er = this.el.getBoundingClientRect();
        if (sc.bar) {
            sc.bar.style.setProperty("--p", clamp(-er.top / Math.max(1, er.height - vh)).toFixed(4));
        }
        if (sc.header) {
            sc.header.classList.toggle("tv-scrolled", er.top < -20);
        }

        this._updateWords();

        if (this._reduced) {
            return;
        }

        // hero: content drifts, fades; mascot rises and grows; blobs move at different speeds
        if (sc.hero) {
            const hr = sc.hero.getBoundingClientRect();
            const t = clamp(-hr.top / hr.height);
            if (sc.copy) {
                sc.copy.style.translate = `0 ${(t * 90).toFixed(1)}px`;
                sc.copy.style.opacity = (1 - t * 1.5).toFixed(3);
            }
            if (sc.stage) {
                sc.stage.style.translate = `0 ${(-t * 60).toFixed(1)}px`;
                sc.stage.style.scale = (1 + t * 0.12).toFixed(3);
            }
            sc.blobs.forEach((b, i) => (b.style.translate = `0 ${(t * (i + 1) * 80).toFixed(1)}px`));
        }

        // typography rows slide sideways, opposite directions
        if (sc.mq && sc.rows.length) {
            const mr = sc.mq.getBoundingClientRect();
            const m = clamp((vh - mr.top) / (vh + mr.height));
            sc.rows.forEach((row, i) => {
                const range = Math.min(row.scrollWidth - window.innerWidth, window.innerWidth * 1.1);
                const x = i % 2 ? -range + m * range : -m * range;
                row.style.transform = `translate3d(${x.toFixed(1)}px,0,0)`;
            });
        }

        // pinned story: chapters + characters crossfade as you scroll
        if (sc.story && !flat) {
            const sr = sc.story.getBoundingClientRect();
            const p = clamp(-sr.top / Math.max(1, sr.height - vh));
            const n = sc.chapters.length;
            sc.chapters.forEach((c, i) => {
                const ctr = (i + 0.5) / n;
                let d = p - ctr;
                if ((i === 0 && d < 0) || (i === n - 1 && d > 0)) {
                    d = 0;
                }
                const a = clamp(1 - Math.abs(d) * n * 1.3);
                const e = a * a * (3 - 2 * a);
                c.style.opacity = e.toFixed(3);
                c.style.transform = `translate3d(0,${(-d * n * 130).toFixed(1)}px,0)`;
                const art = sc.arts[i];
                if (art) {
                    art.style.opacity = e.toFixed(3);
                    art.style.transform = `translate3d(0,${(-d * n * 70).toFixed(1)}px,0) scale(${(0.76 + 0.24 * e).toFixed(3)}) rotate(${(d * n * 16).toFixed(2)}deg)`;
                }
                if (sc.glows[i]) {
                    sc.glows[i].style.opacity = e.toFixed(3);
                }
                if (sc.dots[i]) {
                    sc.dots[i].classList.toggle("on", a > 0.5);
                }
            });
            if (sc.ring) {
                sc.ring.style.transform = `rotate(${(p * 540).toFixed(1)}deg)`;
            }
        }

        // horizontal gallery: vertical scroll drives sideways movement
        if (sc.hs && sc.track && !flat) {
            const hr = sc.hs.getBoundingClientRect();
            const p = clamp(-hr.top / Math.max(1, hr.height - vh));
            sc.track.style.transform = `translate3d(${(-p * this._hsDist).toFixed(1)}px,0,0)`;
            sc.hs.style.setProperty("--hp", p.toFixed(4));
        }

        // process timeline: line fills as you scroll, steps light up
        if (sc.tl) {
            const tr = sc.tl.getBoundingClientRect();
            sc.tl.style.setProperty("--tp", clamp((vh * 0.62 - tr.top) / Math.max(1, tr.height - 90)).toFixed(4));
            sc.steps.forEach((s) => s.classList.toggle("on", s.getBoundingClientRect().top < vh * 0.64));
        }

        // mascots may be swapped for inline svg after start: follow the new elements
        if (sc.pars.some((e) => !e.isConnected)) {
            sc.pars = this._qa("[data-par]");
        }
        if (sc.fls.some((e) => !e.isConnected)) {
            sc.fls = this._qa(".tvh-fl");
        }

        // generic parallax: elements with data-par drift at their own speed
        sc.pars.forEach((el) => {
            const r = el.getBoundingClientRect();
            el.style.translate = `0 ${(-(r.top + r.height / 2 - vh / 2) * parseFloat(el.dataset.par || "0.08")).toFixed(1)}px`;
        });

        // closing banner zooms in; floating characters drift
        if (sc.cta) {
            const cr = sc.cta.parentElement.getBoundingClientRect();
            const m = clamp((vh - cr.top) / (vh * 0.9));
            const e = 1 - Math.pow(1 - m, 3);
            sc.cta.style.setProperty("--s", (0.8 + 0.2 * e).toFixed(3));
            sc.fls.forEach((f, i) => {
                f.style.translate = `0 ${((0.5 - m) * (60 + i * 30)).toFixed(1)}px`;
            });
        }
    },
});

})();
