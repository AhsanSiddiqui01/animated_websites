(function () {
const { publicWidget } = window.TVShim;

/*
 * ToonVerse "live" layer
 *  1. Living mascots: the SVG art is inlined so eyes blink, pupils follow the cursor,
 *     lips move on hover and a click makes the character bounce and send hearts.
 *  2. Demo player: "Start Watching" / any show card opens a cartoon player.
 *  3. Demo catalog: "Browse Genres" / any genre tile opens a browsable list
 *     (e.g. Action = 120 shows) where every show opens the player.
 *
 * Everything here is dummy data generated in the browser. To play a real video
 * instead of the animated demo episode, set CONFIG.video to an mp4 URL.
 */
const CONFIG = {
    video: "", // e.g. "/web/content/123/episode.mp4"
    episodeSeconds: 96,
    pageSize: 12,
};

// bump when the mascot SVG files change, so browsers do not keep serving old copies
const ART_VERSION = 4;
// Only these parts of the home page have touchable mascots: the top, "Fan favourites" and "Made for everyone".
const LIVE_SECTIONS = ".tvh-hero, #featured, .tvh-story";
const IMG_BASE = "img/";
const MASCOTS = ["fox", "octopus", "robot", "dino", "unicorn", "alien", "panda", "rocket"];

const PALETTE = [
    ["#ff6b35", "#d9471b"],
    ["#14a3b8", "#0b6e8a"],
    ["#8b6bff", "#5a3fd1"],
    ["#2ee6c5", "#0f9c86"],
    ["#7ed957", "#3d9a2a"],
    ["#ff5d8f", "#c2336a"],
    ["#5b7bff", "#2a3fb5"],
    ["#ffc83d", "#e08a00"],
];

const GENRES = [
    { name: "Action", count: 120, words: [
        ["Turbo", "Blaze", "Storm", "Thunder", "Rocket", "Iron", "Shadow", "Nitro", "Comet", "Falcon", "Hyper", "Titan"],
        ["Rangers", "Squad", "Strike", "Dash", "Patrol", "Legends", "Force", "Riders", "Heroes", "Racers", "Guardians", "Crew"],
    ] },
    { name: "Comedy", count: 98, words: [
        ["Giggle", "Wobbly", "Noodle", "Banana", "Silly", "Goofy", "Pickle", "Bouncy", "Tickle", "Waffle", "Jelly", "Zany"],
        ["Town", "Club", "Brothers", "Bunch", "Academy", "Chronicles", "Party", "Show", "Gang", "Parade", "Kitchen", "Island"],
    ] },
    { name: "Fantasy", count: 76, words: [
        ["Moonlight", "Crystal", "Enchanted", "Dragon", "Starlit", "Mystic", "Fairy", "Velvet", "Ember", "Rainbow", "Silver", "Wonder"],
        ["Realm", "Kingdom", "Quest", "Tales", "Guardians", "Spell", "Forest", "Legacy", "Castle", "Meadow", "Journey", "Magic"],
    ] },
    { name: "Sci-Fi", count: 64, words: [
        ["Galaxy", "Cosmic", "Quantum", "Orbit", "Nebula", "Cyber", "Astro", "Pixel", "Plasma", "Lunar", "Solar", "Warp"],
        ["Pioneers", "Station", "Explorers", "Buddies", "Academy", "Mission", "Command", "Frontier", "Signal", "Odyssey", "Lab", "Voyage"],
    ] },
    { name: "Kids", count: 140, words: [
        ["Little", "Happy", "Sunny", "Tiny", "Cuddly", "Sparkle", "Puddle", "Fuzzy", "Cheery", "Snuggle", "Bubbly", "Merry"],
        ["Friends", "Explorers", "Garden", "Playtime", "Parade", "Picnic", "Adventures", "Pals", "Wonders", "Treehouse", "Zoo", "Band"],
    ] },
    { name: "Mystery", count: 52, words: [
        ["Midnight", "Secret", "Hidden", "Phantom", "Whisper", "Curious", "Foggy", "Silent", "Puzzle", "Lantern", "Twilight", "Clue"],
        ["Detectives", "Files", "Manor", "Case", "Society", "Mystery", "Club", "Trail", "Cellar", "Gazette", "Agency", "Riddle"],
    ] },
];
// genres that exist on cards but not as a tile
const GENRE_ALIAS = { Adventure: "Action", Family: "Kids" };

const EPISODES = [
    "The Big Beginning", "A Mysterious Glow", "The Secret Cave", "Race to the Hills",
    "Friends Forever", "Storm Over the Valley", "The Great Escape", "A New Day",
];

const SUBTITLES = [
    "“Ready for today’s big adventure?”",
    "A strange glow lights up the horizon…",
    "“Follow me! This way!”",
    "Something is rumbling behind the hills!",
    "“We can do it together!”",
    "“That was the best day ever!”",
];

/* ------------------------------------------------------------------ helpers */
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

function rng(seed) {
    // mulberry32: stable pseudo-random numbers so the catalog is the same on every visit
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
const hash = (str) => [...str].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7);

/* ------------------------------------------------------------------ mascot art */
const artText = new Map();
let artUid = 0;

function loadArt(name) {
    if (artText.has(name)) {
        return Promise.resolve();
    }
    return fetch(`${IMG_BASE}${name}.svg?v=${ART_VERSION}`)
        .then((r) => (r.ok ? r.text() : Promise.reject(r.status)))
        .then((t) => artText.set(name, t))
        .catch(() => {});
}

function makeArt(name, cls = "", label = "") {
    const raw = artText.get(name);
    if (!raw) {
        return null;
    }
    const n = ++artUid;
    const html = raw
        .replace(/\bid="([^"]+)"/g, (m, i) => `id="tv${n}_${i}"`)
        .replace(/url\(#([^)]+)\)/g, (m, i) => `url(#tv${n}_${i})`);
    const tpl = document.createElement("template");
    tpl.innerHTML = html.trim();
    const svg = tpl.content.firstElementChild;
    svg.setAttribute("class", `tv-art ${cls}`.trim());
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", label || name);
    svg.dataset.c = name;
    svg.style.setProperty("--bd", `${(Math.random() * 4).toFixed(2)}s`);
    return svg;
}

/* ------------------------------------------------------------------ dummy catalog data */
let CATALOG = null;

function buildCatalog(seed) {
    const out = {};
    GENRES.forEach((g, gi) => {
        const r = rng(hash(g.name));
        const used = new Set();
        const list = [];
        const [A, B] = g.words;
        // shuffled combinations so neighbours do not look alike
        const combos = [];
        A.forEach((a) => B.forEach((b) => combos.push(`${a} ${b}`)));
        for (let i = combos.length - 1; i > 0; i--) {
            const j = Math.floor(r() * (i + 1));
            [combos[i], combos[j]] = [combos[j], combos[i]];
        }
        for (let i = 0; i < g.count; i++) {
            let title = combos[i % combos.length];
            if (i >= combos.length) {
                title += " Returns";
            }
            used.add(title);
            const tagRoll = r();
            const pal = PALETTE[(i + gi) % PALETTE.length];
            list.push({
                title,
                genre: g.name,
                eps: 6 + Math.floor(r() * 42),
                rating: (4 + r()).toFixed(1),
                mascot: MASCOTS[Math.floor(r() * MASCOTS.length)],
                tag: tagRoll < 0.08 ? "hot" : tagRoll < 0.18 ? "new" : "",
                c1: pal[0],
                c2: pal[1],
            });
        }
        out[g.name] = list;
    });
    // put the shows visible on the page first, so the catalog matches what the visitor just clicked
    (seed || []).forEach((s) => {
        const name = GENRE_ALIAS[s.genre] || s.genre;
        const list = out[name];
        if (!list) {
            return;
        }
        const dup = list.findIndex((x) => x.title === s.title);
        if (dup >= 0) {
            list.splice(dup, 1);
        } else {
            list.pop();
        }
        list.unshift({ ...s, genre: name });
    });
    return out;
}

function allShows(cat) {
    // round-robin so "All" mixes the genres
    const lists = GENRES.map((g) => cat[g.name]);
    const out = [];
    const max = Math.max(...lists.map((l) => l.length));
    for (let i = 0; i < max; i++) {
        lists.forEach((l) => l[i] && out.push(l[i]));
    }
    return out;
}

/* ------------------------------------------------------------------ overlay (player + catalog) */
class Overlay {
    constructor(getSeed) {
        this.getSeed = getSeed;
        this.cat = null;
        this.state = { genre: "Action", shown: CONFIG.pageSize, query: "" };
        this.player = { show: null, ep: 1, t: 0, playing: false, muted: false, raf: 0, last: 0 };
        this.from = null;
        this._build();
        if (window.speechSynthesis) {
            window.speechSynthesis.getVoices();
        }
    }

    _build() {
        const root = document.createElement("div");
        root.className = "tv-modal";
        root.setAttribute("aria-hidden", "true");
        root.innerHTML = `
<div class="tv-backdrop"></div>
<section class="tv-dialog tv-player" role="dialog" aria-modal="true" aria-label="Video player" hidden>
  <button type="button" class="tv-x" data-act="close" aria-label="Close">✕</button>
  <button type="button" class="tv-back" data-act="back" hidden>← Back to shows</button>
  <div class="tv-screen">
    <div class="tv-scene">
      <div class="tv-sun"></div>
      <div class="tv-cloud a"></div><div class="tv-cloud b"></div><div class="tv-cloud c"></div>
      <div class="tv-hills far"></div><div class="tv-hills near"></div>
      <div class="tv-actor"></div>
      <div class="tv-buddy"></div>
      <div class="tv-ground"></div>
    </div>
    <video class="tv-video" playsinline hidden></video>
    <div class="tv-sub"></div>
    <div class="tv-titlecard"><small></small><b></b></div>
    <button type="button" class="tv-bigplay" data-act="toggle" aria-label="Play / pause"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></button>
    <div class="tv-end" hidden>
      <b>Episode finished</b>
      <div><button type="button" class="tv-btn" data-act="replay">↺ Replay</button><button type="button" class="tv-btn alt" data-act="next">Next episode →</button></div>
    </div>
    <div class="tv-ctrl">
      <button type="button" data-act="toggle" class="tv-i tv-pp" aria-label="Play / pause"></button>
      <div class="tv-bar" data-act="seek"><i></i><u></u></div>
      <span class="tv-time">0:00 / 0:00</span>
      <button type="button" data-act="mute" class="tv-i tv-mute" aria-label="Mute"></button>
      <button type="button" data-act="full" class="tv-i" aria-label="Full screen"><svg viewBox="0 0 24 24"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>
    </div>
  </div>
  <div class="tv-pinfo">
    <div><h3></h3><p></p></div>
    <div class="tv-next"><span>Up next</span><div class="tv-eps"></div></div>
  </div>
</section>
<section class="tv-dialog tv-catalog" role="dialog" aria-modal="true" aria-label="Browse genres" hidden>
  <button type="button" class="tv-x" data-act="close" aria-label="Close">✕</button>
  <header class="tv-chead">
    <h3>Browse <em>genres</em></h3>
    <label class="tv-search"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2"/><path d="M20 20l-4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg><input type="search" placeholder="Search all shows…" aria-label="Search shows"/></label>
  </header>
  <div class="tv-pills" role="tablist"></div>
  <div class="tv-cmeta"></div>
  <div class="tv-grid"></div>
  <div class="tv-more"><button type="button" class="tv-btn" data-act="more">Load more</button></div>
</section>`;
        document.body.appendChild(root);
        this.root = root;
        this.elPlayer = root.querySelector(".tv-player");
        this.elCat = root.querySelector(".tv-catalog");
        this.screen = root.querySelector(".tv-screen");
        this.video = root.querySelector(".tv-video");
        this.toastEl = document.createElement("div");
        this.toastEl.className = "tv-toast";
        document.body.appendChild(this.toastEl);

        this._onClick = (ev) => this._click(ev);
        this._onKey = (ev) => this._key(ev);
        this._onWheel = (ev) => {
            if (ev.target.classList.contains("tv-backdrop")) {
                ev.preventDefault();
            }
        };
        root.addEventListener("click", this._onClick);
        root.addEventListener("wheel", this._onWheel, { passive: false });
        document.addEventListener("keydown", this._onKey);
        root.querySelector(".tv-search input").addEventListener("input", (e) => {
            this.state.query = e.target.value.trim();
            this.state.shown = CONFIG.pageSize;
            this._renderGrid();
        });
        // scrubbing the progress bar
        const bar = root.querySelector(".tv-bar");
        const seekTo = (e) => {
            const r = bar.getBoundingClientRect();
            this._seek(clamp((e.clientX - r.left) / r.width));
        };
        bar.addEventListener("pointerdown", (e) => {
            bar.setPointerCapture(e.pointerId);
            seekTo(e);
            const move = (ev) => seekTo(ev);
            const up = () => {
                bar.removeEventListener("pointermove", move);
                bar.removeEventListener("pointerup", up);
            };
            bar.addEventListener("pointermove", move);
            bar.addEventListener("pointerup", up);
        });
        this._icons();
    }

    destroy() {
        this._stopLoop();
        document.removeEventListener("keydown", this._onKey);
        this.root.remove();
        this.toastEl.remove();
    }

    _icons() {
        this.root.querySelector(".tv-pp").innerHTML = '<svg viewBox="0 0 24 24"><path class="p" d="M8 5v14l11-7z"/><path class="u" d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z"/></svg>';
        this.root.querySelector(".tv-mute").innerHTML = '<svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9z"/><path class="w" d="M16 8.5a5 5 0 010 7M18.5 6a8.5 8.5 0 010 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path class="x" d="M17 9l5 6M22 9l-5 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
    }

    /* ---- open / close ---- */
    get isOpen() {
        return this.root.classList.contains("on");
    }

    _show(which) {
        this.elPlayer.hidden = which !== "player";
        this.elCat.hidden = which !== "catalog";
        if (!this.isOpen) {
            this._prevFocus = document.activeElement;
            this.root.classList.add("on");
            this.root.setAttribute("aria-hidden", "false");
            document.documentElement.classList.add("tv-lock");
        }
        const dlg = which === "player" ? this.elPlayer : this.elCat;
        dlg.classList.remove("in");
        void dlg.offsetWidth;
        dlg.classList.add("in");
        const x = dlg.querySelector(".tv-x");
        x && x.focus({ preventScroll: true });
    }

    close() {
        this._pause();
        this._stopLoop();
        if (this.video.src) {
            this.video.pause();
        }
        this.root.classList.remove("on");
        this.root.setAttribute("aria-hidden", "true");
        document.documentElement.classList.remove("tv-lock");
        this.from = null;
        if (this._prevFocus && this._prevFocus.focus) {
            this._prevFocus.focus({ preventScroll: true });
        }
    }

    toast(msg) {
        this.toastEl.textContent = msg;
        this.toastEl.classList.add("on");
        clearTimeout(this._toastT);
        this._toastT = setTimeout(() => this.toastEl.classList.remove("on"), 2600);
    }

    /* ---- catalog ---- */
    _ensureCatalog() {
        if (!this.cat) {
            this.cat = buildCatalog(this.getSeed());
        }
    }

    openCatalog(genre) {
        this._ensureCatalog();
        this._pause();
        this.state.genre = genre === "All" || this.cat[genre] ? genre : "Action";
        this.state.shown = CONFIG.pageSize;
        this.state.query = "";
        this.elCat.querySelector(".tv-search input").value = "";
        this._renderPills();
        this._renderGrid();
        this._show("catalog");
        const grid = this.elCat;
        grid.scrollTop = 0;
    }

    _renderPills() {
        const total = GENRES.reduce((n, g) => n + g.count, 0);
        const pills = [{ name: "All", count: total }, ...GENRES.map((g) => ({ name: g.name, count: g.count }))];
        this.elCat.querySelector(".tv-pills").innerHTML = pills
            .map(
                (p) =>
                    `<button type="button" role="tab" class="${p.name === this.state.genre && !this.state.query ? "on" : ""}" data-act="genre" data-genre="${esc(p.name)}" aria-selected="${p.name === this.state.genre}">${esc(p.name)}<i>${p.count}</i></button>`
            )
            .join("");
    }

    _list() {
        const q = this.state.query.toLowerCase();
        if (q) {
            return allShows(this.cat).filter((s) => s.title.toLowerCase().includes(q));
        }
        return this.state.genre === "All" ? allShows(this.cat) : this.cat[this.state.genre];
    }

    _renderGrid() {
        const list = this._list();
        const q = this.state.query;
        const grid = this.elCat.querySelector(".tv-grid");
        const meta = this.elCat.querySelector(".tv-cmeta");
        const more = this.elCat.querySelector(".tv-more");
        this._renderPills();
        meta.innerHTML = q
            ? `Results for “<strong>${esc(q)}</strong>” · <span>${list.length} shows</span>`
            : `<strong>${esc(this.state.genre)}</strong> · <span>${list.length} shows</span>`;
        const slice = list.slice(0, this.state.shown);
        grid.textContent = "";
        if (!slice.length) {
            grid.innerHTML = '<p class="tv-empty">No shows found. Try another word.</p>';
        }
        const frag = document.createDocumentFragment();
        slice.forEach((s, i) => {
            const b = document.createElement("button");
            b.type = "button";
            b.className = "tv-card";
            b.dataset.act = "show";
            b.dataset.i = i;
            b.style.cssText = `--c1:${s.c1};--c2:${s.c2};animation-delay:${(i % CONFIG.pageSize) * 0.035}s`;
            b.innerHTML = `<div class="tv-poster">${s.tag ? `<span class="tv-tag ${s.tag}">${s.tag.toUpperCase()}</span>` : ""}<span class="tv-pl">▶</span></div>
<div class="tv-cinfo"><h4>${esc(s.title)}</h4><p><span>${esc(s.genre)} · ${s.eps} eps</span><b>★ ${s.rating}</b></p></div>`;
            const art = makeArt(s.mascot, "", s.title);
            art && b.querySelector(".tv-poster").prepend(art);
            frag.appendChild(b);
        });
        grid.appendChild(frag);
        this._slice = slice;
        const left = list.length - slice.length;
        more.hidden = left <= 0;
        more.querySelector("button").textContent = `Load more (${left} left)`;
    }

    /* ---- player ---- */
    openPlayer(show, fromCatalog = false) {
        const s = { ...show };
        s.mascot = MASCOTS.includes(s.mascot) ? s.mascot : "fox";
        s.c1 = s.c1 || PALETTE[0][0];
        s.c2 = s.c2 || PALETTE[0][1];
        this.from = fromCatalog ? "catalog" : null;
        this.player.show = s;
        this.player.ep = 1;
        this._loadEpisode();
        this._show("player");
        this.elPlayer.querySelector(".tv-back").hidden = !fromCatalog;
        this._play();
    }

    _loadEpisode() {
        const p = this.player;
        const s = p.show;
        const el = this.elPlayer;
        p.t = 0;
        this._say("");
        el.style.setProperty("--c1", s.c1);
        el.style.setProperty("--c2", s.c2);
        el.querySelector(".tv-titlecard small").textContent = `Episode ${p.ep}`;
        el.querySelector(".tv-titlecard b").textContent = EPISODES[(p.ep - 1) % EPISODES.length];
        el.querySelector(".tv-pinfo h3").textContent = s.title;
        el.querySelector(".tv-pinfo p").textContent = `${s.genre || "Cartoon"} · ${s.eps || 24} episodes · ★ ${s.rating || "4.8"}  —  Ep ${p.ep}: ${EPISODES[(p.ep - 1) % EPISODES.length]}`;
        el.querySelector(".tv-end").hidden = true;
        el.querySelector(".tv-sub").textContent = "";
        // mascots in the scene
        const actor = el.querySelector(".tv-actor");
        const buddy = el.querySelector(".tv-buddy");
        actor.textContent = "";
        buddy.textContent = "";
        const a = makeArt(s.mascot, "tv-act", s.title);
        const buddyName = MASCOTS[(MASCOTS.indexOf(s.mascot) + 3) % (MASCOTS.length - 1)];
        const b = makeArt(buddyName, "tv-act", buddyName);
        a && actor.appendChild(a);
        b && buddy.appendChild(b);
        // restart the intro animation of the title card
        const tc = el.querySelector(".tv-titlecard");
        tc.classList.remove("go");
        void tc.offsetWidth;
        tc.classList.add("go");
        // "up next" chips
        const eps = el.querySelector(".tv-eps");
        eps.innerHTML = [1, 2, 3, 4]
            .map((k) => {
                return `<button type="button" data-act="ep" data-ep="${p.ep + k}"><b>Ep ${p.ep + k}</b>${esc(EPISODES[(p.ep + k - 1) % EPISODES.length])}</button>`;
            })
            .join("");
        // optional real video
        if (CONFIG.video) {
            this.video.hidden = false;
            this.video.src = CONFIG.video;
            this.video.controls = true;
            el.classList.add("tv-real");
        } else {
            el.classList.remove("tv-real");
        }
        this._update();
    }

    _play() {
        const p = this.player;
        if (CONFIG.video) {
            this.video.play().catch(() => {});
        }
        if (p.t >= CONFIG.episodeSeconds) {
            p.t = 0;
        }
        p.playing = true;
        p.last = performance.now();
        this.screen.classList.add("tv-playing");
        this.screen.classList.remove("tv-ended");
        this.elPlayer.querySelector(".tv-end").hidden = true;
        this.elPlayer.classList.remove("paused");
        this._say(this.elPlayer.querySelector(".tv-sub").textContent);
        this._startLoop();
        this._update();
    }

    _pause() {
        const p = this.player;
        p.playing = false;
        this._say("");
        if (CONFIG.video) {
            this.video.pause();
        }
        this.screen.classList.remove("tv-playing");
        this.elPlayer.classList.add("paused");
        this._update();
    }

    _toggle() {
        this.player.playing ? this._pause() : this._play();
    }

    _seek(frac) {
        const p = this.player;
        p.t = frac * CONFIG.episodeSeconds;
        this._say("");
        if (CONFIG.video && this.video.duration) {
            this.video.currentTime = frac * this.video.duration;
        }
        this.elPlayer.querySelector(".tv-end").hidden = true;
        this._update();
    }

    _startLoop() {
        if (this.player.raf) {
            return;
        }
        const step = (now) => {
            const p = this.player;
            p.raf = requestAnimationFrame(step);
            if (!p.playing) {
                return;
            }
            p.t += (now - p.last) / 1000;
            p.last = now;
            if (p.t >= CONFIG.episodeSeconds) {
                p.t = CONFIG.episodeSeconds;
                p.playing = false;
                this._say("");
                this.screen.classList.remove("tv-playing");
                this.screen.classList.add("tv-ended");
                this.elPlayer.querySelector(".tv-end").hidden = false;
            }
            this._update();
        };
        this.player.raf = requestAnimationFrame(step);
    }

    _stopLoop() {
        cancelAnimationFrame(this.player.raf);
        this.player.raf = 0;
    }

    _update() {
        const p = this.player;
        const frac = p.t / CONFIG.episodeSeconds;
        const el = this.elPlayer;
        el.querySelector(".tv-bar i").style.width = `${frac * 100}%`;
        el.querySelector(".tv-time").textContent = `${fmt(p.t)} / ${fmt(CONFIG.episodeSeconds)}`;
        el.classList.toggle("is-playing", p.playing);
        const idx = Math.min(SUBTITLES.length - 1, Math.floor(frac * SUBTITLES.length));
        const sub = el.querySelector(".tv-sub");
        const line = p.t < 2.6 || p.t >= CONFIG.episodeSeconds ? "" : SUBTITLES[idx];
        if (sub.textContent !== line) {
            sub.textContent = line;
            this._say(line);
        }
        const actorArt = el.querySelector(".tv-actor svg");
        actorArt && actorArt.classList.toggle("tv-talk", p.playing && (this._voiceOk ? this._speaking : !!line));
    }

    /* ---- voice-over: the subtitles are read aloud with the browser's speech engine ---- */
    _say(line) {
        const synth = window.speechSynthesis;
        this._speaking = false;
        if (!synth) {
            return;
        }
        synth.cancel();
        if (!line || !this.player.playing || this.player.muted || CONFIG.video) {
            return;
        }
        const voices = synth.getVoices();
        if (!voices.length) {
            // Chrome loads its voices a moment after the first request: wait for them, then retry once
            this._voiceOk = false;
            if (!this._waitVoices) {
                this._waitVoices = true;
                const retry = () => {
                    synth.removeEventListener("voiceschanged", retry);
                    if (!this._waitVoices) {
                        return;
                    }
                    this._waitVoices = false;
                    if (synth.getVoices().length) {
                        this._say(this.elPlayer.querySelector(".tv-sub").textContent);
                    }
                };
                synth.addEventListener("voiceschanged", retry);
                setTimeout(() => {
                    if (this._waitVoices) {
                        this._waitVoices = false;
                        synth.removeEventListener("voiceschanged", retry);
                        if (!synth.getVoices().length && !this._warned) {
                            this._warned = true;
                            this.toast("No voice is installed in this browser, so only subtitles are shown.");
                        }
                    }
                }, 2500);
            }
            return;
        }
        const u = new SpeechSynthesisUtterance(line.replace(/[“”"]/g, ""));
        const en = voices.filter((v) => /^en/i.test(v.lang));
        const v = en.find((x) => /zira|aria|jenny|samantha|female/i.test(x.name)) || en[0];
        if (v) {
            u.voice = v;
        }
        u.pitch = 1.4;
        u.rate = 1.02;
        u.onstart = () => {
            this._speaking = true;
        };
        u.onend = u.onerror = () => {
            this._speaking = false;
        };
        this._voiceOk = true;
        synth.speak(u);
    }

    _mute() {
        const p = this.player;
        p.muted = !p.muted;
        this.video.muted = p.muted;
        this.elPlayer.classList.toggle("is-muted", p.muted);
        this._say(p.muted ? "" : this.elPlayer.querySelector(".tv-sub").textContent);
    }

    _full() {
        const el = this.screen;
        if (document.fullscreenElement) {
            document.exitFullscreen();
        } else if (el.requestFullscreen) {
            el.requestFullscreen().catch(() => {});
        }
    }

    _nextEpisode(n) {
        this.player.ep = n || this.player.ep + 1;
        this._loadEpisode();
        this._play();
    }

    /* ---- events ---- */
    _click(ev) {
        if (ev.target.classList.contains("tv-backdrop")) {
            this.close();
            return;
        }
        const t = ev.target.closest("[data-act]");
        if (!t || t.dataset.act === "seek") {
            return;
        }
        switch (t.dataset.act) {
            case "close":
                this.close();
                break;
            case "back":
                this._pause();
                this._renderGrid();
                this._show("catalog");
                break;
            case "toggle":
                this._toggle();
                break;
            case "replay":
                this.player.t = 0;
                this._play();
                break;
            case "next":
                this._nextEpisode();
                break;
            case "ep":
                this._nextEpisode(parseInt(t.dataset.ep, 10));
                break;
            case "mute":
                this._mute();
                break;
            case "full":
                this._full();
                break;
            case "genre":
                this.state.genre = t.dataset.genre;
                this.state.shown = CONFIG.pageSize;
                this.state.query = "";
                this.elCat.querySelector(".tv-search input").value = "";
                this._renderGrid();
                break;
            case "more": {
                const keep = this.elCat.scrollTop;
                this.state.shown += CONFIG.pageSize;
                this._renderGrid();
                this.elCat.scrollTop = keep;
                break;
            }
            case "show": {
                const s = this._slice[parseInt(t.dataset.i, 10)];
                s && this.openPlayer(s, true);
                break;
            }
        }
    }

    _key(ev) {
        if (!this.isOpen) {
            return;
        }
        if (ev.key === "Escape" && !document.fullscreenElement) {
            this.close();
        }
        if (this.elPlayer.hidden) {
            return;
        }
        if (ev.target && ev.target.tagName === "INPUT") {
            return;
        }
        if (ev.key === " " || ev.key.toLowerCase() === "k") {
            ev.preventDefault();
            this._toggle();
        } else if (ev.key === "ArrowRight") {
            this._seek(clamp((this.player.t + 5) / CONFIG.episodeSeconds));
        } else if (ev.key === "ArrowLeft") {
            this._seek(clamp((this.player.t - 5) / CONFIG.episodeSeconds));
        } else if (ev.key.toLowerCase() === "f") {
            this._full();
        } else if (ev.key.toLowerCase() === "m") {
            this._mute();
        }
    }
}

/* ------------------------------------------------------------------ the widget */
publicWidget.registry.ToonverseLive = publicWidget.Widget.extend({
    selector: "#wrapwrap",

    start() {
        const def = this._super(...arguments);
        this._cleanups = [];
        // never interfere with the website editor
        if (document.body.classList.contains("editor_enable") || this.editableMode) {
            return def;
        }
        this._ready = Promise.all(MASCOTS.map(loadArt)).then(() => {
            if (this.isDestroyed && this.isDestroyed()) {
                return;
            }
            this._inlineMascots();
            this._initMascotEvents();
        });
        this._on(document, "click", (ev) => this._onClick(ev));
        return def;
    },

    destroy() {
        (this._cleanups || []).forEach((fn) => fn());
        if (this._overlay) {
            this._overlay.destroy();
        }
        this._super(...arguments);
    },

    _on(target, type, fn, opts) {
        target.addEventListener(type, fn, opts);
        this._cleanups.push(() => target.removeEventListener(type, fn, opts));
    },

    _getOverlay() {
        if (!this._overlay) {
            this._overlay = new Overlay(() => this._seedShows());
        }
        return this._overlay;
    },

    /* ---- mascots ---- */
    _inlineMascots() {
        this.el.querySelectorAll('img[src^="img/"]').forEach((img) => {
            const m = /img\/([a-z]+)\.svg/.exec(img.getAttribute("src"));
            if (!m || !artText.has(m[1])) {
                return;
            }
            const svg = makeArt(m[1], img.className, img.alt);
            if (!svg) {
                return;
            }
            // keep the data-* hooks (parallax) but drop the old element's frozen "translate" offset
            [...img.attributes].forEach((a) => {
                if (a.name.startsWith("data-")) {
                    svg.setAttribute(a.name, a.value);
                }
            });
            const style = (img.getAttribute("style") || "").replace(/(^|;)\s*translate\s*:[^;]*/g, "$1");
            if (style.trim()) {
                svg.setAttribute("style", `${style};${svg.getAttribute("style") || ""}`);
            }
            if (img.closest(LIVE_SECTIONS)) {
                svg.classList.add("tv-live");
            }
            img.replaceWith(svg);
        });
    },

    _initMascotEvents() {
        const hostOf = (t) => t.closest && t.closest(".tvh-poster, .tvh-avatars span, svg.tv-live");
        const artOf = (host) => {
            const a = host.matches("svg.tv-art") ? host : host.querySelector("svg.tv-live");
            return a && a.classList.contains("tv-live") ? a : null;
        };

        this._on(document, "mouseover", (ev) => {
            const host = hostOf(ev.target);
            const art = host && artOf(host);
            if (art) {
                this._wake(art);
            }
        });
        this._on(document, "mouseout", (ev) => {
            const host = hostOf(ev.target);
            const art = host && artOf(host);
            if (art && !host.contains(ev.relatedTarget)) {
                art.classList.remove("tv-alive");
            }
        });
        // touch / click: bounce + hearts
        this._on(document, "pointerdown", (ev) => {
            const art = ev.target.closest && ev.target.closest("svg.tv-live");
            if (!art) {
                return;
            }
            this._wake(art, 1800);
            art.classList.remove("tv-boing");
            void art.getBoundingClientRect();
            art.classList.add("tv-boing");
            setTimeout(() => art.classList.remove("tv-boing"), 750);
            this._hearts(ev.clientX, ev.clientY);
        });
        // eyes follow the cursor
        let raf = 0;
        let px = 0;
        let py = 0;
        const track = () => {
            raf = 0;
            const vh = window.innerHeight;
            document.querySelectorAll("svg.tv-live[data-c]").forEach((a) => {
                if (a.dataset.c === "rocket") {
                    return;
                }
                const r = a.getBoundingClientRect();
                if (r.bottom < 0 || r.top > vh || !r.width) {
                    return;
                }
                const dx = px - (r.left + r.width / 2);
                const dy = py - (r.top + r.height * 0.45);
                const d = Math.hypot(dx, dy) || 1;
                const k = Math.min(1, d / 260) / d;
                a.style.setProperty("--ex", (dx * k).toFixed(2));
                a.style.setProperty("--ey", (dy * k).toFixed(2));
            });
        };
        this._on(document, "pointermove", (ev) => {
            px = ev.clientX;
            py = ev.clientY;
            if (!raf) {
                raf = requestAnimationFrame(track);
            }
        });
    },

    _wake(art, ms) {
        art.classList.add("tv-alive");
        art.classList.remove("tv-blink");
        void art.getBoundingClientRect();
        art.classList.add("tv-blink");
        clearTimeout(art._blinkT);
        art._blinkT = setTimeout(() => art.classList.remove("tv-blink"), 420);
        if (ms) {
            clearTimeout(art._aliveT);
            art._aliveT = setTimeout(() => art.classList.remove("tv-alive"), ms);
        }
    },

    _hearts(x, y) {
        for (let i = 0; i < 6; i++) {
            const h = document.createElement("span");
            h.className = "tv-heart";
            h.textContent = "♥";
            h.style.cssText = `left:${x}px;top:${y}px;--dx:${(Math.random() * 120 - 60).toFixed(0)}px;--dr:${(Math.random() * 50 - 25).toFixed(0)}deg;--s:${(0.7 + Math.random() * 0.9).toFixed(2)};animation-delay:${i * 0.05}s`;
            document.body.appendChild(h);
            setTimeout(() => h.remove(), 1500);
        }
    },

    /* ---- shows found on the page ---- */
    _seedShows() {
        const out = [];
        document.querySelectorAll(".tvh-card").forEach((c) => {
            const show = this._showFromCard(c);
            show && out.push(show);
        });
        return out;
    },

    _showFromCard(card) {
        const title = card.querySelector("h3");
        if (!title) {
            return null;
        }
        const meta = (card.querySelector(".tvh-meta span") || {}).textContent || "";
        const [genre, eps] = meta.split("·").map((x) => x.trim());
        const poster = card.querySelector(".tvh-poster");
        const cs = poster ? getComputedStyle(poster) : null;
        const art = card.querySelector("svg.tv-art");
        const img = card.querySelector("img");
        const m = img && /img\/([a-z]+)\.svg/.exec(img.getAttribute("src") || "");
        return {
            title: title.textContent.trim(),
            genre: genre || "Action",
            eps: parseInt(eps, 10) || 24,
            rating: ((card.querySelector(".tvh-meta b") || {}).textContent || "").replace("★", "").trim() || "4.8",
            mascot: (art && art.dataset.c) || (m && m[1]) || "fox",
            c1: cs ? cs.getPropertyValue("--c1").trim() : "",
            c2: cs ? cs.getPropertyValue("--c2").trim() : "",
            tag: "",
        };
    },

    /* ---- clicks on the page ---- */
    _onClick(ev) {
        if (ev.defaultPrevented || ev.button || ev.ctrlKey || ev.metaKey || ev.shiftKey) {
            return;
        }
        const target = ev.target.closest && ev.target.closest('[data-tv], .tvh a.tvh-btn[href="#featured"], .tvh a.tvh-btn[href="#categories"], .tvh .tvh-card, .tvh .tvh-cat, .tvh .tvh-post, .tvh a.tvh-link');
        if (!target || !this.el.contains(target) || target.closest(".tv-modal")) {
            return;
        }
        ev.preventDefault();
        const href = target.getAttribute("href");
        const act = target.dataset.tv || (href === "#featured" && target.matches(".tvh-btn") ? "play" : href === "#categories" && target.matches(".tvh-btn") ? "browse" : "");
        if (act === "play") {
            const first = this.el.querySelector(".tvh-card");
            this._getOverlay().openPlayer((first && this._showFromCard(first)) || { title: "ToonVerse Originals", genre: "Action", mascot: "fox" });
        } else if (act === "browse") {
            this._getOverlay().openCatalog(target.dataset.genre || "Action");
        } else if (target.matches(".tvh-card")) {
            const show = this._showFromCard(target);
            show && this._getOverlay().openPlayer(show);
        } else if (target.matches(".tvh-cat")) {
            const g = (target.querySelector("h3") || {}).textContent || "Action";
            this._getOverlay().openCatalog(g.trim());
        } else if (target.matches("a.tvh-link") && /view all/i.test(target.textContent)) {
            this._getOverlay().openCatalog("All");
        } else {
            this._getOverlay().toast("Demo only: this page is not built yet.");
        }
    },
});

})();
