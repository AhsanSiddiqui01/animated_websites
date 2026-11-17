(function () {
const { publicWidget, rpc, loadJS } = window.TRShim;
// ToonReel 3D hero: "The Reel".
// The published videos float in a dark cinema space as 3D frames. Scrolling flies the camera through them along a curved path;
// the mouse steers the camera a little and pushes glowing dust away; hovering a frame lights it up; clicking opens the video.
// Three.js (r128, UMD) is loaded from cdnjs when the hero is on the page. Everything here is original.


const THREE_URL = "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js";
const PALETTE = [0x3d5afe, 0xffc233, 0x3aa0ff, 0x2fd3a0, 0x7a5cff, 0xff8a3d];
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const ease = (t) => t * t * (3 - 2 * t);

function hasWebGL() {
    try {
        const c = document.createElement("canvas");
        return !!(window.WebGLRenderingContext && (c.getContext("webgl2") || c.getContext("webgl")));
    } catch (e) {
        return false;
    }
}

publicWidget.registry.ToonReelScene = publicWidget.Widget.extend({
    selector: ".tr-3d",
    events: { "click .tr-3d-fx": "_onToggleFx" },

    start() {
        const def = this._super(...arguments);
        this._alive = true;
        this.el._trScene = this; // handy for debugging in the browser console
        this.canvas = this.el.querySelector(".tr-3d-canvas");
        this.ui = {
            cap: this.el.querySelector(".tr-3d-cap"),
            capTitle: this.el.querySelector(".tr-3d-cap b"),
            capSmall: this.el.querySelector(".tr-3d-cap small"),
            cur: this.el.querySelector(".tr-3d-count .cur"),
            tot: this.el.querySelector(".tr-3d-count .tot"),
            bar: this.el.querySelector(".tr-3d-bar i"),
            load: this.el.querySelector(".tr-3d-load"),
            num: this.el.querySelector(".tr-3d-load .n"),
            arc: this.el.querySelector(".tr-3d-load .arc"),
            fx: this.el.querySelector(".tr-3d-fx"),
        };
        try {
            this.videos = JSON.parse(this.el.dataset.videos || "[]");
        } catch (e) {
            this.videos = [];
        }
        this.lite = window.innerWidth < 800 || (navigator.hardwareConcurrency || 8) <= 4;
        this.fx = true; // "Reduce effects" switches this off
        this.mouse = { x: 0, y: 0, sx: 0, sy: 0, nx: 0, ny: 0, has: false };
        if (!hasWebGL()) {
            this._fallback();
            return def;
        }
        loadJS(THREE_URL)
            .then(() => {
                if (this._alive) this._build();
            })
            .catch(() => this._fallback());
        return def;
    },

    destroy() {
        this._alive = false;
        cancelAnimationFrame(this._raf);
        if (this._io) this._io.disconnect();
        window.removeEventListener("resize", this._onResize);
        this.el.removeEventListener("pointermove", this._onMove);
        this.el.removeEventListener("pointerleave", this._onLeave);
        if (this.renderer) {
            this.renderer.dispose();
            this.renderer.forceContextLoss();
        }
        this._super(...arguments);
    },

    _fallback() {
        this.el.classList.add("is-fallback");
        if (this.ui.load) this.ui.load.classList.add("is-done");
    },

    // ------------------------------------------------------------------
    // Scene
    // ------------------------------------------------------------------
    _build() {
        const T = (this.T = window.THREE);
        const stage = this.canvas.parentElement;
        const w = stage.clientWidth;
        const h = stage.clientHeight;

        const renderer = (this.renderer = new T.WebGLRenderer({ canvas: this.canvas, antialias: !this.lite, powerPreference: "high-performance" }));
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.lite ? 1.25 : 1.75));
        renderer.setSize(w, h, false);
        renderer.outputEncoding = T.sRGBEncoding;
        renderer.setClearColor(0x0a0720, 1);

        const scene = (this.scene = new T.Scene());
        scene.fog = new T.FogExp2(0x0a0720, 0.032);
        const camera = (this.camera = new T.PerspectiveCamera(58, w / h, 0.1, 260));

        // --- the path the camera flies along: a gentle S-curve receding into the distance ---
        const pts = [];
        for (let i = 0; i < 12; i++) pts.push(new T.Vector3(Math.sin(i * 0.62) * 3.6, Math.sin(i * 0.8) * 1.5, -i * 7.4));
        this.curve = new T.CatmullRomCurve3(pts, false, "catmullrom", 0.5);

        this._buildTextures();
        this._buildFrames();
        this._buildThreads();
        this._buildDust();
        this._buildGlows();

        this.raycaster = new T.Raycaster();
        this.clock = new T.Clock();
        this.state = { cur: 0, intro: 0, hovered: null, nearest: -1 };
        if (this.ui.tot) this.ui.tot.textContent = String(this.frames.length - 1).padStart(2, "0"); // the last frame is the big end screen

        // events
        this._onMove = (ev) => {
            const r = this.canvas.getBoundingClientRect();
            this.mouse.nx = ((ev.clientX - r.left) / r.width) * 2 - 1;
            this.mouse.ny = -(((ev.clientY - r.top) / r.height) * 2 - 1);
            this.mouse.has = true;
        };
        this._onLeave = () => {
            this.mouse.has = false;
        };
        this.el.addEventListener("pointermove", this._onMove, { passive: true });
        this.el.addEventListener("pointerleave", this._onLeave);
        this._downAt = null;
        this.canvas.addEventListener("pointerdown", (ev) => {
            this._downAt = { x: ev.clientX, y: ev.clientY, t: performance.now() };
            this._onMove(ev); // touch: aim at the tapped point
        });
        this.canvas.addEventListener("pointerup", (ev) => {
            const d = this._downAt;
            this._downAt = null;
            if (!d || Math.hypot(ev.clientX - d.x, ev.clientY - d.y) > 10 || performance.now() - d.t > 500) return;
            this._onMove(ev);
            // the frame can slide a little under the cursor (camera parallax), so with a mouse the frame that was lit a moment ago counts too
            let hit = this._pick();
            if (!hit && ev.pointerType === "mouse" && this._hovered) hit = this._hovered.img;
            if (hit && hit.userData.video) this._open(hit.userData.video);
        });
        this._onResize = () => {
            const W = stage.clientWidth;
            const H = stage.clientHeight;
            renderer.setSize(W, H, false);
            camera.aspect = W / H;
            camera.updateProjectionMatrix();
        };
        window.addEventListener("resize", this._onResize);

        // render only while the hero is on screen
        this._visible = true;
        if ("IntersectionObserver" in window) {
            this._io = new IntersectionObserver((e) => (this._visible = e[0].isIntersecting), { threshold: 0 });
            this._io.observe(this.el);
        }
        this._t0 = performance.now();
        const loop = () => {
            if (!this._alive) return;
            this._raf = requestAnimationFrame(loop);
            if (this._visible && !document.hidden) this._frame();
        };
        loop();
    },

    // canvas textures (all drawn in code, nothing to download)
    _buildTextures() {
        const T = this.T;
        const mk = (w, h, draw) => {
            const c = document.createElement("canvas");
            c.width = w;
            c.height = h;
            draw(c.getContext("2d"), w, h);
            const t = new T.CanvasTexture(c);
            t.encoding = T.sRGBEncoding;
            return t;
        };
        // soft radial glow
        this.glowTex = mk(128, 128, (g, w, h) => {
            const r = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
            r.addColorStop(0, "rgba(255,255,255,1)");
            r.addColorStop(0.35, "rgba(255,255,255,.35)");
            r.addColorStop(1, "rgba(255,255,255,0)");
            g.fillStyle = r;
            g.fillRect(0, 0, w, h);
        });
        // film-strip border with sprocket holes
        this.borderTex = mk(768, 508, (g, w, h) => {
            g.fillStyle = "#07051a";
            g.beginPath();
            g.roundRect ? g.roundRect(0, 0, w, h, 26) : g.rect(0, 0, w, h);
            g.fill();
            g.fillStyle = "rgba(255,255,255,.16)";
            const n = 14;
            for (let i = 0; i < n; i++) {
                const x = 30 + i * ((w - 60) / (n - 1)) - 11;
                [14, h - 14 - 22].forEach((y) => {
                    g.beginPath();
                    g.roundRect ? g.roundRect(x, y, 22, 22, 6) : g.rect(x, y, 22, 22);
                    g.fill();
                });
            }
        });
        // the big screen at the end of the journey: a brand card, not a copy of any video
        this.endTex = mk(1280, 720, (g, w, h) => {
            const r = g.createLinearGradient(0, 0, w, h);
            r.addColorStop(0, "#3d5afe");
            r.addColorStop(0.55, "#7a5cff");
            r.addColorStop(1, "#3aa0ff");
            g.fillStyle = r;
            g.fillRect(0, 0, w, h);
            g.fillStyle = "rgba(255,255,255,.14)";
            g.beginPath();
            g.arc(w * 0.12, h * 1.05, h * 0.55, 0, Math.PI * 2);
            g.fill();
            g.beginPath();
            g.arc(w * 0.92, h * 0.1, h * 0.3, 0, Math.PI * 2);
            g.fill();
            // big play button
            g.fillStyle = "#fff";
            g.beginPath();
            g.arc(w / 2, h * 0.4, 110, 0, Math.PI * 2);
            g.fill();
            g.fillStyle = "#1f1b4d";
            g.beginPath();
            g.moveTo(w / 2 - 34, h * 0.4 - 54);
            g.lineTo(w / 2 + 62, h * 0.4);
            g.lineTo(w / 2 - 34, h * 0.4 + 54);
            g.closePath();
            g.fill();
            g.textAlign = "center";
            g.fillStyle = "#fff";
            g.font = "800 84px Nunito, Arial, sans-serif";
            g.fillText("ToonReel", w / 2, h * 0.76);
            g.font = "700 38px Nunito, Arial, sans-serif";
            g.globalAlpha = 0.85;
            g.fillText("Every video is waiting below", w / 2, h * 0.86);
        });
        // placeholder (used until a thumbnail arrives, or if it fails)
        this.placeholderTex = mk(64, 36, (g, w, h) => {
            const r = g.createLinearGradient(0, 0, w, h);
            r.addColorStop(0, "#3aa0ff");
            r.addColorStop(1, "#7a5cff");
            g.fillStyle = r;
            g.fillRect(0, 0, w, h);
        });
    },

    _caption(title, cat, color) {
        const T = this.T;
        const c = document.createElement("canvas");
        c.width = 1024;
        c.height = 128;
        const g = c.getContext("2d");
        g.font = "800 54px Nunito, Arial, sans-serif";
        g.textBaseline = "middle";
        g.fillStyle = "#fff";
        let t = title || "";
        while (g.measureText(t).width > 700 && t.length > 4) t = t.slice(0, -2);
        if (t !== title) t += "…";
        g.fillText(t, 14, 64);
        if (cat) {
            g.font = "800 30px Nunito, Arial, sans-serif";
            const tw = g.measureText(cat.toUpperCase()).width + 40;
            const x = 1010 - tw;
            g.fillStyle = "#" + color.toString(16).padStart(6, "0");
            g.beginPath();
            g.roundRect ? g.roundRect(x, 34, tw, 60, 30) : g.rect(x, 34, tw, 60);
            g.fill();
            g.fillStyle = "#1f1b4d";
            g.fillText(cat.toUpperCase(), x + 20, 66);
        }
        const tex = new T.CanvasTexture(c);
        tex.encoding = T.sRGBEncoding;
        return tex;
    },

    // frames: the published videos as floating 3D film frames along the path
    _buildFrames() {
        const T = this.T;
        const videos = this.videos.length ? this.videos : Array.from({ length: 10 }, (_, i) => ({ title: "Your video " + (i + 1), cat: "", img: "", id: "" }));
        const count = videos.length; // exactly one frame per video (only when there are no videos at all, 10 placeholder frames are shown)
        this.frames = [];
        this.pickables = [];
        const texCache = {};
        let total = 0;
        let loaded = 0;
        const done = () => {
            loaded++;
            this._progress(loaded / Math.max(1, total));
            if (loaded >= total) this._ready();
        };
        const loader = new T.TextureLoader();
        loader.setCrossOrigin("anonymous");
        const up = new T.Vector3(0, 1, 0);

        const build = (data, i, big) => {
            const col = PALETTE[i % PALETTE.length];
            const u = big ? 0.985 : 0.14 + 0.78 * (i / Math.max(1, count - 1));
            const centre = this.curve.getPointAt(u);
            const tan = this.curve.getTangentAt(u);
            const side = new T.Vector3().crossVectors(tan, up).normalize();
            const dir = i % 2 ? -1 : 1; // the first frame sits on the right, away from the headline
            const fw = big ? 7.2 : 3.2;
            const fh = (fw * 9) / 16;
            const g = new T.Group();
            const sideDist = big ? 0 : 2.9 + (i % 3) * 0.45;
            const yoff = big ? 0 : ((i * 37) % 10) / 10 - 0.5;
            g.position.copy(centre).addScaledVector(side, dir * sideDist);
            g.position.y += yoff * 1.1;
            // face the oncoming camera, turned ~25 degrees towards the middle of the path (a flat-on frame would look edge-on from the path)
            const toMid = centre.clone().sub(g.position).normalize();
            const face = big ? tan.clone().negate() : toMid.multiplyScalar(0.5).addScaledVector(tan, -1).normalize();
            g.lookAt(g.position.clone().addScaledVector(face, 5));
            g.rotation.z += big ? 0 : dir * 0.05;

            const glow = new T.Mesh(
                new T.PlaneGeometry(fw * 1.9, fh * 2.4),
                new T.MeshBasicMaterial({ map: this.glowTex, color: col, transparent: true, opacity: 0.2, blending: T.AdditiveBlending, depthWrite: false, fog: false })
            );
            glow.position.z = -0.08;
            const border = new T.Mesh(new T.PlaneGeometry(fw * 1.14, fh * 1.34), new T.MeshBasicMaterial({ map: this.borderTex, transparent: true }));
            border.position.z = -0.02;
            const img = new T.Mesh(new T.PlaneGeometry(fw, fh), new T.MeshBasicMaterial({ map: this.placeholderTex, transparent: true, opacity: 0 }));
            img.userData.video = data.id ? data : null;
            const cap = new T.Mesh(
                new T.PlaneGeometry(fw * 1.14, (fw * 1.14) / 8),
                new T.MeshBasicMaterial({ map: this._caption(data.title, data.cat, col), transparent: true, depthWrite: false })
            );
            cap.position.set(0, -(fh * 0.67 + 0.3), 0.01);
            g.add(glow, border, img);
            if (!big) g.add(cap); // the big end screen has no caption (the call-to-action button sits there)
            this.scene.add(g);

            const f = { g, glow, img, u, col, data, hover: 0, fade: 0, base: g.scale.x };
            this.frames.push(f);
            if (data.id) this.pickables.push(img);

            const url = data.img;
            if (url) {
                total++;
                // one download per distinct thumbnail; every frame that uses it is applied (and counted) when it arrives
                if (texCache[url]) {
                    if (texCache[url].tex) {
                        this._applyTex(f, texCache[url].tex);
                        done();
                    } else {
                        texCache[url].cbs.push(f);
                    }
                } else {
                    texCache[url] = { cbs: [f], tex: null };
                    loader.load(
                        url,
                        (tex) => {
                            tex.encoding = T.sRGBEncoding;
                            tex.anisotropy = 4;
                            texCache[url].tex = tex;
                            texCache[url].cbs.forEach((ff) => {
                                this._applyTex(ff, tex);
                                done();
                            });
                        },
                        undefined,
                        () => texCache[url].cbs.forEach(() => done()) // thumbnail failed: keep the gradient placeholder
                    );
                }
            }
            return f;
        };
        for (let i = 0; i < count; i++) build(videos[i % videos.length], i, false);
        this.endFrame = build({ title: "", cat: "", img: "", id: "" }, 3, true); // the big "screen" at the end of the journey
        this._applyTex(this.endFrame, this.endTex);
        this.pickables = this.pickables.filter(Boolean);
        this._total = total;
        if (!total) this._ready(); // nothing to download
        setTimeout(() => this._ready(), 9000); // never block the page on slow thumbnails
    },

    _applyTex(f, tex) {
        f.img.material.map = tex;
        f.img.material.needsUpdate = true;
    },

    // glowing "film threads": three spiral ribbons that wind along the path
    _buildThreads() {
        const T = this.T;
        const segs = 500;
        const frames = this.curve.computeFrenetFrames(segs, false);
        [
            [0x3d5afe, 0],
            [0xffc233, 2.1],
            [0x3aa0ff, 4.2],
        ].forEach(([col, phase]) => {
            const pts = [];
            for (let i = 0; i <= segs; i++) {
                const p = this.curve.getPointAt(i / segs);
                const a = i * 0.045 + phase;
                const r = 1.15 + Math.sin(i * 0.02 + phase) * 0.35;
                pts.push(p.clone().addScaledVector(frames.normals[i], Math.cos(a) * r).addScaledVector(frames.binormals[i], Math.sin(a) * r));
            }
            const tube = new T.Mesh(
                new T.TubeGeometry(new T.CatmullRomCurve3(pts), 700, 0.022, 5, false),
                new T.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.85, blending: T.AdditiveBlending, depthWrite: false })
            );
            this.scene.add(tube);
        });
    },

    // dust motes: additive points that drift and flee from the cursor
    _buildDust() {
        const T = this.T;
        const n = this.lite ? 700 : 1800;
        this.dustMax = n;
        const pos = new Float32Array(n * 3);
        const seed = new Float32Array(n);
        const col = new Float32Array(n * 3);
        const tmp = new T.Color();
        for (let i = 0; i < n; i++) {
            const p = this.curve.getPointAt(Math.random());
            const r = 1.5 + Math.random() * 7;
            const a = Math.random() * Math.PI * 2;
            pos[i * 3] = p.x + Math.cos(a) * r;
            pos[i * 3 + 1] = p.y + Math.sin(a) * r * 0.7;
            pos[i * 3 + 2] = p.z + (Math.random() - 0.5) * 7;
            seed[i] = Math.random();
            tmp.setHex(Math.random() < 0.45 ? 0xffffff : PALETTE[(Math.random() * PALETTE.length) | 0]);
            col[i * 3] = tmp.r;
            col[i * 3 + 1] = tmp.g;
            col[i * 3 + 2] = tmp.b;
        }
        const geo = new T.BufferGeometry();
        geo.setAttribute("position", new T.BufferAttribute(pos, 3));
        geo.setAttribute("aSeed", new T.BufferAttribute(seed, 1));
        geo.setAttribute("aColor", new T.BufferAttribute(col, 3));
        this.dustUniforms = { uTime: { value: 0 }, uMouse: { value: new T.Vector3(0, 0, 9999) }, uPx: { value: renderer_px(this.renderer) } };
        const mat = new T.ShaderMaterial({
            uniforms: this.dustUniforms,
            transparent: true,
            depthWrite: false,
            blending: T.AdditiveBlending,
            vertexShader: `
                uniform float uTime; uniform vec3 uMouse; uniform float uPx;
                attribute float aSeed; attribute vec3 aColor;
                varying vec3 vColor; varying float vAlpha;
                void main() {
                    vec3 p = position;
                    p.x += sin(uTime * 0.25 + aSeed * 20.0) * 0.6;
                    p.y += cos(uTime * 0.30 + aSeed * 30.0) * 0.6;
                    p.z += sin(uTime * 0.20 + aSeed * 10.0) * 0.4;
                    vec3 d = p - uMouse;
                    float push = smoothstep(3.6, 0.0, length(d));
                    p += normalize(d + 0.0001) * push * 1.5;
                    vec4 mv = modelViewMatrix * vec4(p, 1.0);
                    gl_Position = projectionMatrix * mv;
                    gl_PointSize = (0.5 + aSeed * 1.3) * uPx * (26.0 / max(0.5, -mv.z));
                    vColor = aColor;
                    vAlpha = clamp(1.0 - (-mv.z) / 70.0, 0.0, 1.0) * (0.35 + aSeed * 0.65) + push * 0.45;
                }`,
            fragmentShader: `
                varying vec3 vColor; varying float vAlpha;
                void main() {
                    float d = length(gl_PointCoord - 0.5);
                    float a = smoothstep(0.5, 0.0, d);
                    gl_FragColor = vec4(vColor, a * vAlpha);
                }`,
        });
        this.dust = new T.Points(geo, mat);
        this.dust.frustumCulled = false;
        this.scene.add(this.dust);
    },

    // big soft lights in the distance for depth
    _buildGlows() {
        const T = this.T;
        [
            [0.2, 0x3d5afe, 30, 0.35],
            [0.45, 0x7a5cff, 38, 0.4],
            [0.7, 0x3aa0ff, 34, 0.32],
            [0.97, 0xffc233, 46, 0.5],
        ].forEach(([u, col, size, op]) => {
            const s = new T.Sprite(new T.SpriteMaterial({ map: this.glowTex, color: col, transparent: true, opacity: op, blending: T.AdditiveBlending, depthWrite: false, fog: false }));
            const p = this.curve.getPointAt(u);
            s.position.set(p.x + (u * 10 % 2 ? 7 : -7), p.y + 3, p.z - 4);
            s.scale.set(size, size, 1);
            this.scene.add(s);
        });
    },

    // ------------------------------------------------------------------
    // Loading / intro
    // ------------------------------------------------------------------
    _progress(p) {
        const pct = Math.round(clamp(p, 0, 1) * 100);
        if (this.ui.num) this.ui.num.textContent = pct;
        if (this.ui.arc) this.ui.arc.style.strokeDashoffset = String(214 * (1 - pct / 100));
    },
    _ready() {
        if (this._isReady) return;
        this._isReady = true;
        this._progress(1);
        this._introStart = performance.now();
        setTimeout(() => this.ui.load && this.ui.load.classList.add("is-done"), 350);
        this.el.classList.add("is-live");
    },

    // ------------------------------------------------------------------
    // Interaction
    // ------------------------------------------------------------------
    _pick() {
        if (!this.pickables.length) return null;
        this.raycaster.setFromCamera({ x: this.mouse.nx, y: this.mouse.ny }, this.camera);
        const hits = this.raycaster.intersectObjects(this.pickables, false);
        return hits.length ? hits[0].object : null;
    },
    _open(video) {
        document.dispatchEvent(new CustomEvent("toonreel:openvideo", { detail: { id: video.id, title: video.title, desc: video.desc } }));
    },
    _onToggleFx(ev) {
        this.fx = !this.fx;
        const b = ev.currentTarget;
        b.textContent = this.fx ? "Reduce effects" : "Full effects";
        b.setAttribute("aria-pressed", String(!this.fx));
        this.el.classList.toggle("is-reduced", !this.fx);
        this.renderer.setPixelRatio(this.fx ? Math.min(window.devicePixelRatio || 1, this.lite ? 1.25 : 1.75) : 1);
        this._onResize();
        this.dustUniforms.uPx.value = this.renderer.getPixelRatio();
        this.dust.geometry.setDrawRange(0, this.fx ? this.dustMax : Math.floor(this.dustMax * 0.25));
    },

    // ------------------------------------------------------------------
    // Frame loop
    // ------------------------------------------------------------------
    _frame() {
        const T = this.T;
        const dt = Math.min(0.05, this.clock.getDelta());
        const time = this.clock.elapsedTime;

        // scroll progress through the tall hero section (0 at the top, 1 when it ends)
        const r = this.el.getBoundingClientRect();
        const target = clamp(-r.top / Math.max(1, r.height - window.innerHeight), 0, 1);
        const st = this.state;
        st.cur += (target - st.cur) * (1 - Math.exp(-dt * 3.4)); // damped, so the flight feels smooth
        const intro = this._introStart ? ease(clamp((performance.now() - this._introStart) / 2600, 0, 1)) : 0;
        st.intro = intro;

        // mouse smoothing
        const m = this.mouse;
        // while a frame is lit, the camera barely follows the mouse, so the frame stays under the cursor and can be clicked
        const k = (1 - Math.exp(-dt * 4)) * (this._hovered ? 0.12 : 1);
        m.sx += ((this.fx ? m.nx : 0) - m.sx) * k;
        m.sy += ((this.fx ? m.ny : 0) - m.sy) * k;

        // camera on the path
        const t = 0.004 + st.cur * 0.905; // stops a few units in front of the big end screen
        const pos = this.curve.getPointAt(t);
        const look = this.curve.getPointAt(Math.min(1, t + 0.04));
        const cam = this.camera;
        cam.position.copy(pos);
        cam.lookAt(look);
        const sway = this.fx ? 1 : 0.25;
        cam.translateX(m.sx * 0.6 + Math.sin(time * 0.35) * 0.12 * sway);
        cam.translateY(m.sy * 0.4 + Math.cos(time * 0.3) * 0.1 * sway);
        cam.translateZ((1 - intro) * 9); // fly-in at load
        cam.rotateY(-m.sx * 0.1);
        cam.rotateX(m.sy * 0.07);
        cam.rotateZ(-m.sx * 0.035);
        const fov = 58 + (1 - intro) * 14 + Math.min(1, Math.abs(target - st.cur) * 18) * 6; // slight zoom while moving fast
        if (Math.abs(cam.fov - fov) > 0.01) {
            cam.fov = fov;
            cam.updateProjectionMatrix();
        }

        // dust follows the cursor
        this.dustUniforms.uTime.value = time;
        if (m.has && this.fx) {
            this.raycaster.setFromCamera({ x: m.nx, y: m.ny }, cam);
            this.dustUniforms.uMouse.value.copy(this.raycaster.ray.origin).addScaledVector(this.raycaster.ray.direction, 9);
        } else {
            this.dustUniforms.uMouse.value.set(0, 0, 9999);
        }

        // hover + frame animation
        const hit = m.has && this.fx ? this._pick() : null;
        const hovered = hit ? this.frames.find((f) => f.img === hit) : null;
        this._hovered = hovered || null;
        this.canvas.style.cursor = hovered ? "pointer" : "";
        let nearest = 0;
        let best = 9;
        this.frames.forEach((f, i) => {
            if (f === this.endFrame) return;
            const dd = Math.abs(f.u - t);
            if (dd < best) {
                best = dd;
                nearest = i;
            }
            const want = f === hovered ? 1 : 0;
            f.hover += (want - f.hover) * (1 - Math.exp(-dt * 9));
            if (f.fade < 1) f.fade = Math.min(1, f.fade + dt * 1.4);
            f.img.material.opacity = f.fade * intro;
            const s = 1 + f.hover * 0.1;
            f.g.scale.set(s, s, s);
            f.glow.material.opacity = (0.2 + f.hover * 0.5) * intro;
            f.glow.material.color.setHex(f.col);
        });
        const ef = this.endFrame;
        ef.fade = Math.min(1, ef.fade + dt);
        ef.img.material.opacity = ef.fade * intro;
        ef.glow.material.opacity = (0.35 + 0.1 * Math.sin(time * 1.5)) * intro;
        const endHover = hovered === ef;
        ef.hover += ((endHover ? 1 : 0) - ef.hover) * (1 - Math.exp(-dt * 9));
        ef.g.scale.setScalar(1 + ef.hover * 0.04);

        // HUD / caption / CSS variables
        const el = this.el;
        el.style.setProperty("--p", st.cur.toFixed(3));
        el.style.setProperty("--end", clamp((st.cur - 0.84) / 0.1, 0, 1).toFixed(3));
        el.classList.toggle("is-away", st.cur > 0.16); // headline + buttons leave the screen (and stop being clickable)
        el.classList.toggle("is-end", st.cur > 0.9); // the final call-to-action becomes clickable
        if (this.ui.bar) this.ui.bar.style.transform = `scaleY(${st.cur.toFixed(3)})`;
        const atEnd = st.cur > 0.95;
        const shown = hovered || this.frames[nearest];
        const key = atEnd && !hovered ? "end" : (hovered ? "h" : "n") + this.frames.indexOf(shown);
        if (key !== this._capKey && shown) {
            this._capKey = key;
            if (this.ui.cur) this.ui.cur.textContent = String((atEnd ? this.frames.length - 1 : nearest + 1)).padStart(2, "0");
            if (key === "end") {
                if (this.ui.capTitle) this.ui.capTitle.textContent = "Every video is waiting below";
                if (this.ui.capSmall) this.ui.capSmall.textContent = "End of the reel";
            } else {
                if (this.ui.capTitle) this.ui.capTitle.textContent = shown.data.title || "";
                if (this.ui.capSmall) this.ui.capSmall.textContent = hovered ? "Click to watch" : st.cur < 0.02 ? "Scroll to fly through the reel" : "Now passing";
            }
        }
        this.renderer.render(this.scene, cam);
    },
});

function renderer_px(renderer) {
    return renderer.getPixelRatio();
}

})();
