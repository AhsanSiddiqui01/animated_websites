/* Starts every registered widget on the page (what Odoo's public-widget loader does). */
(function () {
    function start() {
        const registry = window.TRShim.publicWidget.registry;
        for (const key in registry) {
            const w = registry[key];
            if (!w.selector) continue;
            document.querySelectorAll(w.selector).forEach((el) => {
                const inst = Object.create(w);
                inst.el = el;
                inst._super = () => {};
                for (const evKey in w.events || {}) {
                    const sp = evKey.indexOf(" ");
                    const type = sp < 0 ? evKey : evKey.slice(0, sp);
                    const sel = sp < 0 ? "" : evKey.slice(sp + 1);
                    const fn = w[w.events[evKey]];
                    el.addEventListener(type, (ev) => {
                        const target = sel ? ev.target.closest(sel) : el;
                        if (!target || !el.contains(target)) return;
                        const proxy = new Proxy(ev, {
                            get: (t, p) => {
                                if (p === "currentTarget") return target;
                                const v = t[p];
                                return typeof v === "function" ? v.bind(t) : v;
                            },
                        });
                        fn.call(inst, proxy);
                    });
                }
                try { if (inst.start) inst.start(); } catch (e) { console.error(key, e); }
            });
        }
    }
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
    else start();
})();
