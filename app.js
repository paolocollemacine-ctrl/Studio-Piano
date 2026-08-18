// ============================================================
// 1. GESTIONE DATI E STATO
// ============================================================
const STORAGE_KEY = 'studio_pianoforte_v2';
const THEME_KEY = 'studio_pianoforte_theme';

const PASTEL_PALETTE = [
    '#A0C4FF', '#CAFFBF', '#FFD6A5', '#BDB2FF', '#FFC6FF',
    '#9BF6FF', '#FFADAD', '#FDFFB6', '#B9FBC0', '#FFB4A2'
];

const DEFAULT_DATA = {
    categories: [
        { id: 'scale', name: 'Scale', exercises: [], color: '#A0C4FF' },
        { id: 'arpeggi', name: 'Arpeggi', exercises: [], color: '#CAFFBF' },
        { id: 'hanon', name: 'Hanon', exercises: [], color: '#FFD6A5' },
        { id: 'czerny', name: 'Czerny', exercises: [], color: '#FFADAD' },
        { id: 'bach', name: 'Bach', exercises: [], color: '#FDFFB6' },
        { id: 'komplete', name: 'Komplete 26', exercises: [], color: '#BDB2FF' },
        { id: 'improvvisazione', name: 'Improvvisazione', exercises: [], color: '#FFC6FF' },
        { id: 'armonia', name: 'Crea Armonia', exercises: [], color: '#9BF6FF', special: 'armonia' },
    ]
};

const MECHANICAL_BPMS = [40,42,44,46,48,50,52,54,56,58,60,63,66,69,72,76,80,84,88,92,96,100,104,108,112,116,120,126,132,138,144,152,160,168,176,184,192,200,208];

function buildBpmOptions(selectedValue) {
    const sel = selectedValue ?? '';
    let html = `<option value=""${sel === '' ? ' selected' : ''}>—</option>`;
    MECHANICAL_BPMS.forEach(bpm => {
        html += `<option value="${bpm}"${Number(sel) === bpm ? ' selected' : ''}>${bpm}</option>`;
    });
    return html;
}

let appData = null;
let currentCatId = null;

// ============================================================
// 2. CARICAMENTO DATI
// ============================================================
function loadData() {
    let d;
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) d = structuredClone(DEFAULT_DATA);
        else {
            const parsed = JSON.parse(raw);
            d = (!parsed.categories) ? structuredClone(DEFAULT_DATA) : parsed;
        }
    } catch (e) {
        console.error('Errore lettura dati', e);
        d = structuredClone(DEFAULT_DATA);
    }
    d.categories.forEach((cat, i) => {
        if (!cat.color) cat.color = PASTEL_PALETTE[i % PASTEL_PALETTE.length];
    });
    if (!d.categories.find(c => c.id === 'armonia')) {
        d.categories.push({ id: 'armonia', name: 'Crea Armonia', exercises: [], color: '#9BF6FF', special: 'armonia' });
    }
    if (!Array.isArray(d.lezioni)) d.lezioni = [];
    d.lezioni.forEach(l => {
        if (!l.note || typeof l.note !== 'object') l.note = {};
        if (!l.status || typeof l.status !== 'object') l.status = {};
        if (!Array.isArray(l.activeCats)) {
            l.activeCats = d.categories.filter(c => !LEZIONI_DEFAULT_ESCLUSE.includes(c.id)).map(c => c.id);
        }
    });
    if (!d.scaleChecklist || typeof d.scaleChecklist !== 'object') d.scaleChecklist = {};
    if (!d.arpeggiChecklist || typeof d.arpeggiChecklist !== 'object') d.arpeggiChecklist = {};
    appData = d;
    return d;
}

function saveData() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(appData));
    } catch (e) {
        alert('Impossibile salvare i dati nel browser. Esporta un backup.');
        console.error(e);
    }
}

function uid(prefix) { return prefix + '_' + Math.random().toString(36).slice(2, 9); }

// ============================================================
// 3. TEMA
// ============================================================
function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    document.querySelectorAll('[data-theme-btn]').forEach(b => {
        b.classList.toggle('active', b.dataset.themeBtn === theme);
        b.setAttribute('aria-pressed', b.dataset.themeBtn === theme ? 'true' : 'false');
    });
    try { localStorage.setItem(THEME_KEY, theme); } catch (e) {}
}

function loadTheme() {
    let theme = 'dark';
    try {
        theme = localStorage.getItem(THEME_KEY) ||
            (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
    } catch (e) {}
    applyTheme(theme);
}

document.querySelectorAll('[data-theme-btn]').forEach(btn => {
    btn.addEventListener('click', () => applyTheme(btn.dataset.themeBtn));
});

// ============================================================
// 4. METRONOMO UNIFICATO (singleton)
// ============================================================
const Metronome = {
    playing: false,
    bpm: 80,
    beats: 4,
    beat: 0,
    audioCtx: null,
    nextNoteTime: 0,
    timerId: null,
    initialized: false,

    init() {
        if (this.initialized) return;
        this.initialized = true;
        const container = document.getElementById('metronomo-global');
        if (!container) return;
        this.slider = container.querySelector('#bpm-slider-global');
        this.valDisplay = container.querySelector('#bpm-val-global');
        this.btn = container.querySelector('#metronome-btn-global');
        this.beatInd = container.querySelector('#beat-indicator-global');
        this.timeSelect = container.querySelector('#time-select-global');

        this.slider.value = 10;
        this.valDisplay.textContent = 80;
        this.beats = parseInt(this.timeSelect.value.split('/')[0]) || 4;

        this.slider.addEventListener('input', () => {
            const idx = parseInt(this.slider.value);
            const bpm = MECHANICAL_BPMS[idx] || 80;
            this.valDisplay.textContent = bpm;
            if (this.playing) this.bpm = bpm;
        });

        this.timeSelect.addEventListener('change', () => {
            this.beats = parseInt(this.timeSelect.value.split('/')[0]) || 4;
            if (this.playing) { this.stop(); this.start(); }
        });

        this.btn.addEventListener('click', () => {
            if (this.playing) this.stop();
            else this.start();
        });

        container.querySelectorAll('.bpm-step-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                let idx = parseInt(this.slider.value) + parseInt(btn.dataset.step);
                idx = Math.max(0, Math.min(MECHANICAL_BPMS.length - 1, idx));
                this.slider.value = idx;
                const bpm = MECHANICAL_BPMS[idx] || 80;
                this.valDisplay.textContent = bpm;
                if (this.playing) this.bpm = bpm;
            });
        });
    },

    start() {
        if (this.playing) return;
        this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        this.playing = true;
        this.beat = 0;
        this.nextNoteTime = this.audioCtx.currentTime + 0.05;
        this.bpm = MECHANICAL_BPMS[parseInt(this.slider.value)] || 80;
        this.beats = parseInt(this.timeSelect.value.split('/')[0]) || 4;
        this.btn.textContent = 'Stop';
        this.btn.classList.add('playing');
        this._schedule();
    },

    stop() {
        this.playing = false;
        if (this.timerId) { clearTimeout(this.timerId); this.timerId = null; }
        this.btn.textContent = 'Avvia';
        this.btn.classList.remove('playing');
        this.beatInd.querySelectorAll('.beat-dot').forEach(d => d.className = 'beat-dot');
        if (this.audioCtx && this.audioCtx.state === 'running') {
            this.audioCtx.close();
        }
        this.audioCtx = null;
    },

    _schedule() {
        if (!this.playing) return;
        const secPerBeat = 60.0 / this.bpm;
        while (this.nextNoteTime < this.audioCtx.currentTime + 0.1) {
            this._playBeat(this.nextNoteTime);
            this.nextNoteTime += secPerBeat;
            this.beat = (this.beat + 1) % this.beats;
        }
        this.timerId = setTimeout(() => this._schedule(), 25);
    },

    _playBeat(time) {
        const isDown = this.beats > 1 && this.beat === 0;
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();
        osc.connect(gain);
        gain.connect(this.audioCtx.destination);
        osc.frequency.value = isDown ? 1200 : 800;
        gain.gain.setValueAtTime(0.15, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.08);
        osc.start(time);
        osc.stop(time + 0.08);

        const dots = this.beatInd.querySelectorAll('.beat-dot');
        dots.forEach((dot, idx) => {
            dot.className = 'beat-dot';
            if (idx === this.beat % this.beats) {
                dot.classList.add('active');
                if (isDown && idx === 0) dot.classList.add('downbeat');
            }
        });
    },

    getBPM() { return this.bpm; },
    getBeat() { return this.beat; }
};

// ============================================================
// 5. NAVIGAZIONE
// ============================================================
function showView(viewId) {
    ['view-home', 'view-cat', 'view-lezioni', 'view-circle', 'view-scale-list', 'view-arpeggi', 'view-komplete', 'view-improv', 'view-armonia'].forEach(id => {
        document.getElementById(id).classList.toggle('hidden', id !== viewId);
    });
}

// Instrada verso la sezione corretta a partire da un id di categoria,
// riusata sia dalle card della home sia dalle righe delle lezioni.
function navigateToCategory(catId) {
    if (catId === 'scale') openScaleList();
    else if (catId === 'arpeggi') openArpeggi();
    else if (catId === 'komplete') openKomplete();
    else if (catId === 'improvvisazione') openImprov();
    else {
        const cat = appData.categories.find(c => c.id === catId);
        if (cat && cat.special === 'armonia') openArmonia();
        else openCategory(catId);
    }
}

function closeCategory() {
    currentCatId = null;
    showView('view-home');
    renderHome();
}

function openCategory(catId) {
    currentCatId = catId;
    showView('view-cat');
    renderCategory();
}

// ============================================================
// 6. HOME E CATEGORIE
// ============================================================
// Raccoglie tutto ciò che è segnato in rosso (esercizi, checklist scale/arpeggi, lezioni)
// e lo mostra come riepilogo "da studiare" in cima alla home.
function renderTodaySummary() {
    const container = document.getElementById('today-summary');
    if (!container) return;
    const items = [];

    appData.categories.forEach(cat => {
        cat.exercises.forEach(ex => {
            if (ex.status === 'rosso') {
                items.push({ label: ex.name || 'Esercizio senza nome', sub: cat.name, catId: cat.id });
            }
        });
    });

    if (items.length === 0) {
        container.innerHTML = `<div class="today-summary today-summary-empty">🎉 Niente in rosso al momento — tutto sotto controllo.</div>`;
        return;
    }

    container.innerHTML = `
        <div class="today-summary">
          <div class="today-summary-title">🔴 Da studiare (${items.length})</div>
          <div class="today-summary-list">
            ${items.map((it, idx) => `
              <button type="button" class="today-item" data-idx="${idx}">
                <span class="today-item-label">${escapeHtml(it.label)}</span>
                <span class="today-item-sub">${escapeHtml(it.sub)}</span>
              </button>
            `).join('')}
          </div>
        </div>
      `;
    container.querySelectorAll('.today-item').forEach((btn, idx) => {
        btn.addEventListener('click', () => navigateToCategory(items[idx].catId));
    });
}

function renderHome() {
    renderTodaySummary();
    const grid = document.getElementById('cat-grid');
    grid.innerHTML = '';

    const lezCount = (appData.lezioni || []).length;
    const lezCard = document.createElement('div');
    lezCard.className = 'card lez-home-card';
    lezCard.tabIndex = 0;
    applyCatColorVars(lezCard, '#FFB4A2');
    lezCard.innerHTML = `
      <div class="color-bar" style="background:#FFB4A2;"></div>
      <h3>📘 Lezioni</h3>
      <div class="count">${lezCount} lezion${lezCount === 1 ? 'e' : 'i'}</div>
    `;
    lezCard.addEventListener('click', () => openLezioni());
    lezCard.addEventListener('keydown', (e) => { if (e.key === 'Enter') lezCard.click(); });
    grid.appendChild(lezCard);

    const circoloCard = document.createElement('div');
    circoloCard.className = 'card circolo-home-card';
    circoloCard.tabIndex = 0;
    applyCatColorVars(circoloCard, '#BDB2FF');
    circoloCard.innerHTML = `
      <div class="color-bar" style="background:#BDB2FF;"></div>
      <h3>🎡 Circolo delle Quinte</h3>
      <div class="count">Scala e arpeggio casuali</div>
    `;
    circoloCard.addEventListener('click', () => openCircle());
    circoloCard.addEventListener('keydown', (e) => { if (e.key === 'Enter') circoloCard.click(); });
    grid.appendChild(circoloCard);

    appData.categories.forEach(cat => {
        const card = document.createElement('div');
        card.className = 'card';
        card.tabIndex = 0;
        card.draggable = true;
        card.dataset.catId = cat.id;
        applyCatColorVars(card, cat.color);
        card.innerHTML = `
          <div class="color-bar" style="background:${escapeAttr(cat.color || '#A0C4FF')};"></div>
          <button class="rename-cat" aria-label="Rinomina categoria">&#9998;</button>
          <button class="del-cat" aria-label="Elimina categoria">&times;</button>
          <div class="color-dot" aria-label="Cambia colore" style="background:${escapeAttr(cat.color || '#A0C4FF')};"></div>
          <div class="color-popover hidden">
            ${PASTEL_PALETTE.map(c => `<button class="color-swatch" data-color="${c}" style="background:${c};" aria-label="Colore ${c}"></button>`).join('')}
          </div>
          <h3>${escapeHtml(cat.name)}</h3>
          <div class="count">${cat.exercises.length} esercizi${cat.exercises.length === 1 ? 'o' : 'i'}</div>
        `;
        card.addEventListener('click', (e) => {
            if (e.target.closest('.del-cat') || e.target.closest('.rename-cat') || e.target.closest('.color-dot') || e.target.closest('.color-popover')) return;
            navigateToCategory(cat.id);
        });
        card.addEventListener('keydown', (e) => { if (e.key === 'Enter') card.click(); });

        card.addEventListener('dragstart', (e) => {
            card.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', cat.id);
        });
        card.addEventListener('dragend', () => {
            card.classList.remove('dragging');
            grid.querySelectorAll('.card').forEach(c => c.classList.remove('drag-over'));
        });
        card.addEventListener('dragover', (e) => {
            if (!e.dataTransfer.types.includes('text/plain')) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            card.classList.add('drag-over');
        });
        card.addEventListener('dragleave', () => card.classList.remove('drag-over'));
        card.addEventListener('drop', (e) => {
            e.preventDefault();
            card.classList.remove('drag-over');
            const draggedId = e.dataTransfer.getData('text/plain');
            if (!draggedId || draggedId === cat.id) return;
            const fromIdx = appData.categories.findIndex(c => c.id === draggedId);
            const toIdx = appData.categories.findIndex(c => c.id === cat.id);
            if (fromIdx === -1 || toIdx === -1) return;
            const [moved] = appData.categories.splice(fromIdx, 1);
            appData.categories.splice(toIdx, 0, moved);
            saveData();
            renderHome();
        });

        card.querySelector('.del-cat').addEventListener('click', (e) => {
            e.stopPropagation();
            if (confirm(`Eliminare la categoria "${cat.name}" e tutti i suoi esercizi?`)) {
                appData.categories = appData.categories.filter(c => c.id !== cat.id);
                saveData();
                renderHome();
            }
        });
        card.querySelector('.rename-cat').addEventListener('click', (e) => {
            e.stopPropagation();
            const newName = prompt('Nuovo nome per questa categoria:', cat.name);
            if (newName && newName.trim()) {
                cat.name = newName.trim();
                saveData();
                renderHome();
            }
        });
        const dot = card.querySelector('.color-dot');
        const popover = card.querySelector('.color-popover');
        dot.addEventListener('click', (e) => {
            e.stopPropagation();
            document.querySelectorAll('.color-popover').forEach(p => { if (p !== popover) p.classList.add('hidden'); });
            popover.classList.toggle('hidden');
        });
        popover.querySelectorAll('.color-swatch').forEach(sw => {
            sw.addEventListener('click', (e) => {
                e.stopPropagation();
                cat.color = sw.dataset.color;
                saveData();
                renderHome();
            });
        });
        grid.appendChild(card);
    });

    document.addEventListener('click', () => {
        document.querySelectorAll('.color-popover').forEach(p => p.classList.add('hidden'));
    }, { once: true });

    const addCard = document.createElement('div');
    addCard.className = 'card add-card';
    addCard.tabIndex = 0;
    addCard.innerHTML = `<h3>+ Nuova categoria</h3>`;
    addCard.addEventListener('click', () => {
        const name = prompt('Nome della nuova categoria (es. Scarlatti, Improvvisazione...)');
        if (name && name.trim()) {
            const color = PASTEL_PALETTE[appData.categories.length % PASTEL_PALETTE.length];
            appData.categories.push({ id: uid('cat'), name: name.trim(), exercises: [], color });
            saveData();
            renderHome();
        }
    });
    grid.appendChild(addCard);
}

function renderCategory() {
    const cat = appData.categories.find(c => c.id === currentCatId);
    if (!cat) { closeCategory(); return; }
    document.getElementById('cat-title-text').textContent = cat.name;
    applyCatColorVars(document.getElementById('view-cat'), cat.color);
    renderExerciseListInto(cat, 'exercise-list', renderCategory);
}

// Renderizza la lista esercizi di una categoria in un qualsiasi contenitore della pagina.
// rerender è la funzione da richiamare per ridisegnare la lista dopo una modifica/cancellazione.
function renderExerciseListInto(cat, listElId, rerender) {
    const list = document.getElementById(listElId);
    list.innerHTML = '';
    if (cat.exercises.length === 0) {
        list.innerHTML = `<div class="empty-state">Nessun esercizio ancora. Aggiungine uno con il pulsante qui sotto.</div>`;
    }
    cat.exercises.forEach(ex => {
        const el = document.createElement('div');
        el.className = 'exercise' + (ex._open ? ' open' : '');
        el.appendChild(buildExerciseHead(ex));
        el.appendChild(buildExerciseBody(ex, cat, el, rerender));
        el.querySelector('.ex-head').addEventListener('click', () => {
            ex._open = !ex._open;
            el.classList.toggle('open');
            el.querySelector('.ex-head').setAttribute('aria-expanded', ex._open ? 'true' : 'false');
        });
        list.appendChild(el);
    });
}

document.getElementById('btn-add-exercise').addEventListener('click', () => {
    const cat = appData.categories.find(c => c.id === currentCatId);
    if (!cat) return;
    cat.exercises.push({ id: uid('ex'), name: '', pdf: '', speedSep: null, speedTog: null, _open: true });
    saveData();
    renderCategory();
});

function buildExerciseHead(ex) {
    const head = document.createElement('div');
    head.className = 'ex-head';
    head.setAttribute('aria-expanded', ex._open ? 'true' : 'false');
    head.innerHTML = `
        <div class="left">
          <div class="name"><span class="status-dot status-${ex.status || 'none'}"></span>${escapeHtml(ex.name || 'Esercizio senza nome')}</div>
          <div class="chips">${buildChips(ex)}</div>
        </div>
        <div class="icon-btn chevron">&#9662;</div>
      `;
    return head;
}

function buildChips(ex) {
    const chips = [];
    if (ex.speedSep) chips.push(`<span class="chip">MS ${ex.speedSep} bpm</span>`);
    if (ex.speedTog) chips.push(`<span class="chip">MU ${ex.speedTog} bpm</span>`);
    return chips.join('');
}

function buildExerciseBody(ex, cat, el, rerender) {
    const body = document.createElement('div');
    body.className = 'ex-body';
    body.innerHTML = `
        <label for="f-name-${ex.id}">Nome esercizio</label>
        <input type="text" id="f-name-${ex.id}" class="f-name" value="${escapeAttr(ex.name || '')}" placeholder="Es. Scala di Do maggiore, 4 ottave">
        <div class="status-row">
          <label>Stato</label>
          <div class="status-picker">
            <button type="button" class="status-btn${ex.status === 'verde' ? ' active' : ''}" data-status="verde" aria-label="Verde: sotto controllo" title="Sotto controllo">🟢</button>
            <button type="button" class="status-btn${ex.status === 'giallo' ? ' active' : ''}" data-status="giallo" aria-label="Giallo: da ripassare" title="Da ripassare">🟡</button>
            <button type="button" class="status-btn${ex.status === 'rosso' ? ' active' : ''}" data-status="rosso" aria-label="Rosso: da lavorare" title="Da lavorare">🔴</button>
          </div>
        </div>
        <div class="pdf-row">
          <div class="field">
            <label for="f-pdf-${ex.id}">PDF (percorso relativo, es. scale-do-maggiore.pdf, o link Drive)</label>
            <input type="text" id="f-pdf-${ex.id}" class="f-pdf" value="${escapeAttr(ex.pdf || '')}" placeholder="nome-file.pdf oppure https://drive.google.com/...">
          </div>
          <button class="btn btn-open-pdf" aria-label="Apri PDF">Apri PDF</button>
        </div>
        <div class="speed-row">
          <div class="bpm-field">
            <label for="f-speed-sep-${ex.id}">Velocità mani separate</label>
            <select id="f-speed-sep-${ex.id}" class="f-speed-sep">${buildBpmOptions(ex.speedSep)}</select>
            <span class="unit">bpm</span>
          </div>
          <div class="bpm-field">
            <label for="f-speed-tog-${ex.id}">Velocità mani unite</label>
            <select id="f-speed-tog-${ex.id}" class="f-speed-tog">${buildBpmOptions(ex.speedTog)}</select>
            <span class="unit">bpm</span>
          </div>
        </div>
        <div class="ex-footer">
          <button class="btn btn-ghost btn-delete-ex" aria-label="Elimina esercizio">Elimina esercizio</button>
        </div>
      `;
    const bindField = (selector, prop, isNumber = false) => {
        body.querySelector(selector).addEventListener('input', (e) => {
            ex[prop] = isNumber ? (e.target.value === '' ? null : Number(e.target.value)) : e.target.value;
            saveData();
            if (['name', 'speedSep', 'speedTog'].includes(prop)) {
                refreshHead(el, ex);
            }
        });
    };
    bindField('.f-name', 'name');
    bindField('.f-pdf', 'pdf');
    bindField('.f-speed-sep', 'speedSep', true);
    bindField('.f-speed-tog', 'speedTog', true);

    body.querySelectorAll('.status-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            ex.status = ex.status === btn.dataset.status ? null : btn.dataset.status;
            body.querySelectorAll('.status-btn').forEach(b => b.classList.toggle('active', b.dataset.status === ex.status));
            saveData();
            refreshHead(el, ex);
        });
    });

    body.querySelector('.btn-open-pdf').addEventListener('click', (e) => {
        e.stopPropagation();
        const path = ex.pdf && ex.pdf.trim();
        if (!path) { alert('Inserisci prima il percorso o il link del PDF.'); return; }
        window.open(path, '_blank');
    });

    body.querySelector('.btn-delete-ex').addEventListener('click', (e) => {
        e.stopPropagation();
        if (confirm(`Eliminare l'esercizio "${ex.name || 'senza nome'}"?`)) {
            cat.exercises = cat.exercises.filter(x => x !== ex);
            saveData();
            rerender();
        }
    });
    return body;
}

function refreshHead(el, ex) {
    const head = el.querySelector('.ex-head');
    const newHead = buildExerciseHead(ex);
    head.replaceWith(newHead);
    newHead.addEventListener('click', () => {
        ex._open = !ex._open;
        el.classList.toggle('open');
        newHead.setAttribute('aria-expanded', ex._open ? 'true' : 'false');
    });
}

// ============================================================
// 7. UTILITY
// ============================================================
function escapeHtml(str) { return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } [c])); }
function escapeAttr(str) { return escapeHtml(str); }

function applyCatColorVars(el, hex) {
    if (!hex) return;
    const [r, g, b] = hexToRgbTuple(hex);
    const darken = (amt) => `rgb(${Math.max(0, r - amt)}, ${Math.max(0, g - amt)}, ${Math.max(0, b - amt)})`;
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
    const ink = brightness > 150 ? '#1a1a2e' : '#ffffff';
    el.style.setProperty('--accent', hex);
    el.style.setProperty('--accent-strong', darken(45));
    el.style.setProperty('--accent-ink', ink);
    el.style.setProperty('--accent-soft', `rgba(${r}, ${g}, ${b}, 0.18)`);
    el.style.setProperty('--accent-glow', `0 0 20px rgba(${r}, ${g}, ${b}, 0.35)`);
}

function hexToRgbTuple(hex) {
    const h = hex.replace('#', '');
    const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
    const num = parseInt(full, 16);
    return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function applySectionHeader(viewId, catId, titleElId) {
    const cat = appData.categories.find(c => c.id === catId);
    if (cat) {
        applyCatColorVars(document.getElementById(viewId), cat.color);
        document.getElementById(titleElId).textContent = cat.name;
    }
}

// ============================================================
// 7bis. LEZIONI
// ============================================================
function openLezioni() {
    showView('view-lezioni');
    renderLezioni();
}

function formatDateIt(iso) {
    if (!iso) return 'senza data';
    const parts = iso.split('-');
    if (parts.length !== 3) return iso;
    const [y, m, d] = parts;
    return `${d}/${m}/${y}`;
}

function renderLezioni() {
    const list = document.getElementById('lezioni-list');
    list.innerHTML = '';
    const lezioni = (appData.lezioni || []).slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    if (lezioni.length === 0) {
        list.innerHTML = `<div class="empty-state">Nessuna lezione ancora. Aggiungine una con il pulsante qui sotto.</div>`;
        return;
    }
    lezioni.forEach(lez => {
        const el = document.createElement('div');
        el.className = 'exercise' + (lez._open ? ' open' : '');
        el.appendChild(buildLezioneHead(lez));
        el.appendChild(buildLezioneBody(lez, el));
        el.querySelector('.ex-head').addEventListener('click', () => {
            lez._open = !lez._open;
            el.classList.toggle('open');
            el.querySelector('.ex-head').setAttribute('aria-expanded', lez._open ? 'true' : 'false');
        });
        list.appendChild(el);
    });
}

function buildLezioneHead(lez) {
    const head = document.createElement('div');
    head.className = 'ex-head';
    head.setAttribute('aria-expanded', lez._open ? 'true' : 'false');
    const note = lez.note || {};
    const filledCount = Object.values(note).filter(v => v && v.trim()).length;
    head.innerHTML = `
        <div class="left">
          <div class="name">Lezione del ${formatDateIt(lez.date)}${lez.title ? ' · ' + escapeHtml(lez.title) : ''}</div>
          <div class="chips">${filledCount ? `<span class="chip">${filledCount} sezion${filledCount === 1 ? 'e' : 'i'} con note</span>` : ''}</div>
        </div>
        <div class="icon-btn chevron">&#9662;</div>
      `;
    return head;
}

function refreshLezioneHead(el, lez) {
    const head = el.querySelector('.ex-head');
    const newHead = buildLezioneHead(lez);
    head.replaceWith(newHead);
    newHead.addEventListener('click', () => {
        lez._open = !lez._open;
        el.classList.toggle('open');
        newHead.setAttribute('aria-expanded', lez._open ? 'true' : 'false');
    });
}

// Categorie escluse di default dalle nuove lezioni (puoi comunque riaggiungerle a mano).
const LEZIONI_DEFAULT_ESCLUSE = ['komplete', 'improvvisazione', 'armonia'];

function defaultActiveCats() {
    return appData.categories.filter(c => !LEZIONI_DEFAULT_ESCLUSE.includes(c.id)).map(c => c.id);
}

function buildLezioneBody(lez, el) {
    const body = document.createElement('div');
    body.className = 'ex-body';
    body.innerHTML = `
        <div class="field-row">
          <div class="field">
            <label for="f-lez-date-${lez.id}">Data</label>
            <input type="date" id="f-lez-date-${lez.id}" class="f-lez-date" value="${escapeAttr(lez.date || '')}">
          </div>
          <div class="field">
            <label for="f-lez-title-${lez.id}">Titolo/nota (facoltativo)</label>
            <input type="text" id="f-lez-title-${lez.id}" class="f-lez-title" value="${escapeAttr(lez.title || '')}" placeholder="Es. Bach + scale minori">
          </div>
        </div>
        <div class="pdf-row">
          <div class="field">
            <label for="f-lez-pdf-${lez.id}">PDF / link OneDrive (facoltativo)</label>
            <input type="text" id="f-lez-pdf-${lez.id}" class="f-lez-pdf" value="${escapeAttr(lez.pdf || '')}" placeholder="https://onedrive.live.com/...">
          </div>
          <button class="btn btn-open-pdf">Apri PDF</button>
        </div>
        <div class="lez-fields" id="lez-fields-${lez.id}"></div>
        <div class="lez-add-section-row" id="lez-add-section-${lez.id}"></div>
        <div class="ex-footer">
          <button class="btn btn-ghost btn-delete-lez">Elimina lezione</button>
        </div>
      `;

    body.querySelector('.f-lez-date').addEventListener('input', (e) => {
        lez.date = e.target.value;
        saveData();
        refreshLezioneHead(el, lez);
    });
    body.querySelector('.f-lez-title').addEventListener('input', (e) => {
        lez.title = e.target.value;
        saveData();
        refreshLezioneHead(el, lez);
    });
    body.querySelector('.f-lez-pdf').addEventListener('input', (e) => {
        lez.pdf = e.target.value;
        saveData();
    });
    body.querySelector('.btn-open-pdf').addEventListener('click', (e) => {
        e.stopPropagation();
        const path = lez.pdf && lez.pdf.trim();
        if (!path) { alert('Inserisci prima il link del PDF.'); return; }
        window.open(path, '_blank');
    });
    body.querySelector('.btn-delete-lez').addEventListener('click', (e) => {
        e.stopPropagation();
        if (confirm(`Eliminare la lezione del ${formatDateIt(lez.date)}?`)) {
            appData.lezioni = appData.lezioni.filter(l => l !== lez);
            saveData();
            renderLezioni();
        }
    });

    renderLezFields(lez, body, el);
    return body;
}

// Solo le sezioni attive per questa lezione (lez.activeCats): nome sezione,
// descrizione libera scritta da te, pulsante di salto, e una "x" per toglierla.
// Sotto, un selettore per riaggiungere una sezione tolta.
function renderLezFields(lez, body, el) {
    const container = body.querySelector(`#lez-fields-${lez.id}`);
    container.innerHTML = '';
    lez.note = lez.note || {};
    if (!Array.isArray(lez.activeCats)) lez.activeCats = defaultActiveCats();

    const activeCats = appData.categories.filter(c => lez.activeCats.includes(c.id));

    if (activeCats.length === 0) {
        container.innerHTML = `<div class="empty-state" style="padding:14px;">Nessuna sezione qui dentro. Aggiungine una qui sotto.</div>`;
    }

    activeCats.forEach(cat => {
        lez.status = lez.status || {};
        const status = lez.status[cat.id] || 'none';
        const row = document.createElement('div');
        row.className = 'lez-field-row';
        row.innerHTML = `
            <button type="button" class="check-cell lez-field-status status-${status}" data-cat-id="${escapeAttr(cat.id)}" aria-label="Stato ${escapeAttr(cat.name)}: clicca per cambiare"></button>
            <label class="lez-field-label">${escapeHtml(cat.name)}</label>
            <input type="text" class="lez-field-input" value="${escapeAttr(lez.note[cat.id] || '')}" placeholder="Es. n.2 a 80 bpm">
            <button class="btn lez-field-jump">${escapeHtml(cat.name)} &rarr;</button>
            <button class="icon-btn lez-field-remove" aria-label="Togli questa sezione dalla lezione" title="Togli sezione">&times;</button>
        `;
        row.querySelector('.lez-field-status').addEventListener('click', (e) => {
            e.stopPropagation();
            const next = cycleChecklistStatus(lez.status, cat.id);
            e.target.className = 'check-cell lez-field-status status-' + next;
        });
        row.querySelector('.lez-field-input').addEventListener('input', (e) => {
            lez.note[cat.id] = e.target.value;
            saveData();
            refreshLezioneHead(el, lez);
        });
        row.querySelector('.lez-field-jump').addEventListener('click', (e) => {
            e.stopPropagation();
            navigateToCategory(cat.id);
        });
        row.querySelector('.lez-field-remove').addEventListener('click', (e) => {
            e.stopPropagation();
            lez.activeCats = lez.activeCats.filter(id => id !== cat.id);
            saveData();
            renderLezFields(lez, body, el);
        });
        container.appendChild(row);
    });

    renderLezAddSection(lez, body, el);
}

function renderLezAddSection(lez, body, el) {
    const wrap = body.querySelector(`#lez-add-section-${lez.id}`);
    const remaining = appData.categories.filter(c => !lez.activeCats.includes(c.id));
    if (remaining.length === 0) {
        wrap.innerHTML = '';
        return;
    }
    wrap.innerHTML = `
        <select class="lez-add-select" aria-label="Scegli sezione da aggiungere">
          ${remaining.map(c => `<option value="${escapeAttr(c.id)}">${escapeHtml(c.name)}</option>`).join('')}
        </select>
        <button class="btn btn-outline lez-add-btn">+ Aggiungi sezione</button>
      `;
    wrap.querySelector('.lez-add-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        const catId = wrap.querySelector('.lez-add-select').value;
        if (!catId) return;
        lez.activeCats.push(catId);
        saveData();
        renderLezFields(lez, body, el);
    });
}

document.getElementById('btn-add-lezione').addEventListener('click', () => {
    appData.lezioni = appData.lezioni || [];
    const today = new Date().toISOString().slice(0, 10);
    appData.lezioni.push({ id: uid('lez'), date: today, title: '', pdf: '', note: {}, status: {}, activeCats: defaultActiveCats(), _open: true });
    saveData();
    renderLezioni();
});

// ============================================================
// 8. BACKUP
// ============================================================
document.getElementById('btn-export').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(appData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'backup-studio-pianoforte.json';
    a.click();
    URL.revokeObjectURL(url);
});
document.getElementById('btn-import').addEventListener('click', () => {
    document.getElementById('file-import').click();
});
document.getElementById('file-import').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
        try {
            const parsed = JSON.parse(reader.result);
            if (!parsed.categories) throw new Error('formato non valido');
            if (confirm('Importare questo backup? I dati attuali verranno sovrascritti.')) {
                appData = parsed;
                if (!Array.isArray(appData.lezioni)) appData.lezioni = [];
                appData.lezioni.forEach(l => { if (!l.note || typeof l.note !== 'object') l.note = {}; if (!l.status || typeof l.status !== 'object') l.status = {}; });
                if (!appData.scaleChecklist || typeof appData.scaleChecklist !== 'object') appData.scaleChecklist = {};
                if (!appData.arpeggiChecklist || typeof appData.arpeggiChecklist !== 'object') appData.arpeggiChecklist = {};
                saveData();
                renderHome();
                closeCategory();
                window._circleRendered = false;
                window._arpeggiRendered = false;
                window._improvRendered = false;
                if (document.getElementById('view-komplete').classList.contains('hidden') === false) kRender();
            }
        } catch (err) { alert('File non valido: ' + err.message); }
    };
    reader.readAsText(file);
});

// ============================================================
// 9. PULSANTI BACK
// ============================================================
document.getElementById('btn-back').addEventListener('click', closeCategory);
document.getElementById('btn-back-circle').addEventListener('click', closeCategory);
document.getElementById('btn-back-arpeggi').addEventListener('click', closeCategory);
document.getElementById('btn-back-komplete').addEventListener('click', closeCategory);
document.getElementById('btn-back-improv').addEventListener('click', closeCategory);
document.getElementById('btn-back-armonia').addEventListener('click', closeCategory);

// ============================================================
// 9bis. CHECKLIST SCALE E ARPEGGI (traccia personale, non esercizi)
// ============================================================
const CHECKLIST_KEYS = [
    { id: 'do', label: 'Do' }, { id: 'sol', label: 'Sol' }, { id: 're', label: 'Re' },
    { id: 'la', label: 'La' }, { id: 'mi', label: 'Mi' }, { id: 'si', label: 'Si' },
    { id: 'fad', label: 'Fa♯' }, { id: 'reb', label: 'Reb' }, { id: 'lab', label: 'Lab' },
    { id: 'mib', label: 'Mib' }, { id: 'sib', label: 'Sib' }, { id: 'fa', label: 'Fa' }
];
// Relativa minore di ciascuna tonalità maggiore (stessa armatura di chiave).
const RELATIVE_MINOR_LABEL = {
    do: 'Lam', sol: 'Mim', re: 'Sim', la: 'Fa♯m', mi: 'Do♯m', si: 'Sol♯m',
    fad: 'Re♯m', reb: 'Sibm', lab: 'Fam', mib: 'Dom', sib: 'Solm', fa: 'Rem'
};
const SCALE_CHECKLIST_TYPES = [
    { id: 'maggiore', label: 'Maggiore' },
    { id: 'minarm', label: 'Min. armonica' },
    { id: 'minmel', label: 'Min. melodica' }
];
const CHECKLIST_MOTI = [
    { id: 'retto', label: 'Retto' },
    { id: 'contrario', label: 'Contrario' }
];
const ARPEGGIO_CHECKLIST_TYPES = [
    { id: 'maggiore', label: 'Maggiore' },
    { id: 'minore', label: 'Minore' }
];
const CHECKLIST_STATUS_ORDER = ['none', 'verde', 'giallo', 'rosso'];

function cycleChecklistStatus(map, id) {
    const current = map[id] || 'none';
    const next = CHECKLIST_STATUS_ORDER[(CHECKLIST_STATUS_ORDER.indexOf(current) + 1) % CHECKLIST_STATUS_ORDER.length];
    if (next === 'none') delete map[id]; else map[id] = next;
    saveData();
    return next;
}

function renderScaleChecklist() {
    if (!appData.scaleChecklist) appData.scaleChecklist = {};
    const map = appData.scaleChecklist;
    const container = document.getElementById('scale-checklist');
    let html = '<div class="checklist-scroll"><table class="checklist-table"><thead><tr><th class="row-label-head">Tonalità</th>';
    SCALE_CHECKLIST_TYPES.forEach(t => {
        CHECKLIST_MOTI.forEach(m => {
            html += `<th>${escapeHtml(t.label)}<br><span class="moto-label">${escapeHtml(m.label)}</span></th>`;
        });
    });
    html += '</tr></thead><tbody>';
    CHECKLIST_KEYS.forEach(k => {
        html += `<tr><th class="row-label">${escapeHtml(k.label)}<br><span class="relative-minor-label">${escapeHtml(RELATIVE_MINOR_LABEL[k.id] || '')}</span></th>`;
        SCALE_CHECKLIST_TYPES.forEach(t => {
            CHECKLIST_MOTI.forEach(m => {
                const id = `${k.id}_${t.id}_${m.id}`;
                const status = map[id] || 'none';
                html += `<td><button type="button" class="check-cell status-${status}" data-id="${id}" aria-label="${escapeAttr(k.label)} ${escapeAttr(t.label)}, moto ${escapeAttr(m.label)}"></button></td>`;
            });
        });
        html += '</tr>';
    });
    html += '</tbody></table></div>';
    container.innerHTML = html;
    container.querySelectorAll('.check-cell').forEach(btn => {
        btn.addEventListener('click', () => {
            const next = cycleChecklistStatus(map, btn.dataset.id);
            btn.className = 'check-cell status-' + next;
        });
    });
}

function renderArpeggiChecklist() {
    if (!appData.arpeggiChecklist) appData.arpeggiChecklist = {};
    const map = appData.arpeggiChecklist;
    const container = document.getElementById('arpeggi-checklist');
    let html = '<div class="checklist-scroll"><table class="checklist-table"><thead><tr><th class="row-label-head">Tonalità</th>';
    ARPEGGIO_CHECKLIST_TYPES.forEach(t => {
        html += `<th>${escapeHtml(t.label)}</th>`;
    });
    html += '</tr></thead><tbody>';
    CHECKLIST_KEYS.forEach(k => {
        html += `<tr><th class="row-label">${escapeHtml(k.label)}</th>`;
        ARPEGGIO_CHECKLIST_TYPES.forEach(t => {
            const id = `${k.id}_${t.id}`;
            const status = map[id] || 'none';
            html += `<td><button type="button" class="check-cell status-${status}" data-id="${id}" aria-label="${escapeAttr(k.label)} ${escapeAttr(t.label)}"></button></td>`;
        });
        html += '</tr>';
    });
    html += '</tbody></table></div>';
    container.innerHTML = html;
    container.querySelectorAll('.check-cell').forEach(btn => {
        btn.addEventListener('click', () => {
            const next = cycleChecklistStatus(map, btn.dataset.id);
            btn.className = 'check-cell status-' + next;
        });
    });
}

// ============================================================
// 10. CIRCOLO (Scale)
// ============================================================
function openCircle() {
    showView('view-circle');
    const scaleCat = appData.categories.find(c => c.id === 'scale');
    if (scaleCat) applyCatColorVars(document.getElementById('view-circle'), scaleCat.color);
    if (!window._circleRendered) { renderCircle(); window._circleRendered = true; }
    updateCircleColors();
    if (!window._arpeggiRendered) { renderArpeggi(); window._arpeggiRendered = true; }
}

function openScaleList() {
    showView('view-scale-list');
    applySectionHeader('view-scale-list', 'scale', 'scale-list-title-text');
    renderScaleChecklist();
    renderScaleExercises();
}

function renderScaleExercises() {
    const cat = appData.categories.find(c => c.id === 'scale');
    if (!cat) return;
    renderExerciseListInto(cat, 'scale-exercise-list', renderScaleExercises);
}

document.getElementById('btn-add-exercise-scale').addEventListener('click', () => {
    const cat = appData.categories.find(c => c.id === 'scale');
    if (!cat) return;
    cat.exercises.push({ id: uid('ex'), name: '', pdf: '', speedSep: null, speedTog: null, _open: true });
    saveData();
    renderScaleExercises();
});

const CX = 400, CY = 400;
const R_SIG_OUT = 392, R_SIG_IN = 340;
const R_MAJ_OUT = 340, R_MAJ_IN = 232;
const R_MIN_OUT = 232, R_MIN_IN = 140;
const KEYS = [
    { majIt: "Do", majNotesIt: ["Do", "Re", "Mi", "Fa", "Sol", "La", "Si"], minIt: "Lam", minRoot: "La", minNotesIt: ["La", "Si", "Do", "Re", "Mi", "Fa", "Sol"], sig: "0", sigFull: "Nessuna alterazione", sigCount: 0, sigType: "none" },
    { majIt: "Sol", majNotesIt: ["Sol", "La", "Si", "Do", "Re", "Mi", "Fa♯"], minIt: "Mim", minRoot: "Mi", minNotesIt: ["Mi", "Fa♯", "Sol", "La", "Si", "Do", "Re"], sig: "1♯", sigFull: "1 diesis (Fa♯)", sigCount: 1, sigType: "sharp" },
    { majIt: "Re", majNotesIt: ["Re", "Mi", "Fa♯", "Sol", "La", "Si", "Do♯"], minIt: "Sim", minRoot: "Si", minNotesIt: ["Si", "Do♯", "Re", "Mi", "Fa♯", "Sol", "La"], sig: "2♯", sigFull: "2 diesis (Fa♯ Do♯)", sigCount: 2, sigType: "sharp" },
    { majIt: "La", majNotesIt: ["La", "Si", "Do♯", "Re", "Mi", "Fa♯", "Sol♯"], minIt: "Fa♯m", minRoot: "Fa♯", minNotesIt: ["Fa♯", "Sol♯", "La", "Si", "Do♯", "Re", "Mi"], sig: "3♯", sigFull: "3 diesis (Fa♯ Do♯ Sol♯)", sigCount: 3, sigType: "sharp" },
    { majIt: "Mi", majNotesIt: ["Mi", "Fa♯", "Sol♯", "La", "Si", "Do♯", "Re♯"], minIt: "Do♯m", minRoot: "Do♯", minNotesIt: ["Do♯", "Re♯", "Mi", "Fa♯", "Sol♯", "La", "Si"], sig: "4♯", sigFull: "4 diesis (Fa♯ Do♯ Sol♯ Re♯)", sigCount: 4, sigType: "sharp" },
    { majIt: "Si", majNotesIt: ["Si", "Do♯", "Re♯", "Mi", "Fa♯", "Sol♯", "La♯"], minIt: "Sol♯m", minRoot: "Sol♯", minNotesIt: ["Sol♯", "La♯", "Si", "Do♯", "Re♯", "Mi", "Fa♯"], sig: "5♯", sigFull: "5 diesis (Fa♯ Do♯ Sol♯ Re♯ La♯)", sigCount: 5, sigType: "sharp" },
    { majIt: "Fa♯/Sol♭", majNotesIt: ["Fa♯", "Sol♯", "La♯", "Si", "Do♯", "Re♯", "Mi♯"], minIt: "Re♯m/Mi♭m", minRoot: "Re♯/Mi♭", minNotesIt: ["Re♯", "Mi♯", "Fa♯", "Sol♯", "La♯", "Si", "Do♯"], sig: "6♯/6♭", sigFull: "6 diesis (o 6 bemolli, enarmonico Sol♭)", sigCount: 6, sigType: "sharp" },
    { majIt: "Re♭", majNotesIt: ["Re♭", "Mi♭", "Fa", "Sol♭", "La♭", "Si♭", "Do"], minIt: "Si♭m", minRoot: "Si♭", minNotesIt: ["Si♭", "Do", "Re♭", "Mi♭", "Fa", "Sol♭", "La♭"], sig: "5♭", sigFull: "5 bemolli (Si♭ Mi♭ La♭ Re♭ Sol♭)", sigCount: 5, sigType: "flat" },
    { majIt: "La♭", majNotesIt: ["La♭", "Si♭", "Do", "Re♭", "Mi♭", "Fa", "Sol"], minIt: "Fam", minRoot: "Fa", minNotesIt: ["Fa", "Sol", "La♭", "Si♭", "Do", "Re♭", "Mi♭"], sig: "4♭", sigFull: "4 bemolli (Si♭ Mi♭ La♭ Re♭)", sigCount: 4, sigType: "flat" },
    { majIt: "Mi♭", majNotesIt: ["Mi♭", "Fa", "Sol", "La♭", "Si♭", "Do", "Re"], minIt: "Dom", minRoot: "Do", minNotesIt: ["Do", "Re", "Mi♭", "Fa", "Sol", "La♭", "Si♭"], sig: "3♭", sigFull: "3 bemolli (Si♭ Mi♭ La♭)", sigCount: 3, sigType: "flat" },
    { majIt: "Si♭", majNotesIt: ["Si♭", "Do", "Re", "Mi♭", "Fa", "Sol", "La"], minIt: "Solm", minRoot: "Sol", minNotesIt: ["Sol", "La", "Si♭", "Do", "Re", "Mi♭", "Fa"], sig: "2♭", sigFull: "2 bemolli (Si♭ Mi♭)", sigCount: 2, sigType: "flat" },
    { majIt: "Fa", majNotesIt: ["Fa", "Sol", "La", "Si♭", "Do", "Re", "Mi"], minIt: "Rem", minRoot: "Re", minNotesIt: ["Re", "Mi", "Fa", "Sol", "La", "Si♭", "Do"], sig: "1♭", sigFull: "1 bemolle (Si♭)", sigCount: 1, sigType: "flat" },
];

function polar(angleDeg, r) {
    const rad = angleDeg * Math.PI / 180;
    return { x: CX + r * Math.sin(rad), y: CY - r * Math.cos(rad) };
}

function ringPath(startAngle, endAngle, rOuter, rInner) {
    const p1 = polar(startAngle, rOuter), p2 = polar(endAngle, rOuter);
    const p3 = polar(endAngle, rInner), p4 = polar(startAngle, rInner);
    const large = (endAngle - startAngle) > 180 ? 1 : 0;
    return `M ${p1.x} ${p1.y} A ${rOuter} ${rOuter} 0 ${large} 1 ${p2.x} ${p2.y} L ${p3.x} ${p3.y} A ${rInner} ${rInner} 0 ${large} 0 ${p4.x} ${p4.y} Z`;
}

function labelTransform(midAngle, x, y) {
    let rot = midAngle;
    if (midAngle > 90 && midAngle <= 270) rot = midAngle - 180;
    return `rotate(${rot} ${x} ${y})`;
}

const svgNS = "http://www.w3.org/2000/svg";
const wheelSvg = document.getElementById('circle-wheel');
let activeMaj = null, activeMin = null;
const majorSegments = [], minorSegments = [], majorLabels = [], minorLabels = [];
let _circleRendered = false;

function renderCircle() {
    wheelSvg.innerHTML = '';
    majorSegments.length = 0; minorSegments.length = 0; majorLabels.length = 0; minorLabels.length = 0;
    activeMaj = null; activeMin = null;
    KEYS.forEach((k, i) => {
        const start = i * 30 - 15, end = i * 30 + 15, mid = i * 30;
        const sigPath = createEl('path', { d: ringPath(start, end, R_SIG_OUT, R_SIG_IN), class: 'circle-seg sig' });
        wheelSvg.appendChild(sigPath);
        const sigPos = polar(mid, (R_SIG_OUT + R_SIG_IN) / 2);
        const sigText = createEl('text', { x: sigPos.x, y: sigPos.y, class: 'circle-sig-label', transform: labelTransform(mid, sigPos.x, sigPos.y) });
        sigText.textContent = k.sig;
        wheelSvg.appendChild(sigText);
        const majPath = createEl('path', { d: ringPath(start, end, R_MAJ_OUT, R_MAJ_IN), class: 'circle-seg major' });
        wheelSvg.appendChild(majPath);
        majorSegments.push(majPath);
        const majPos = polar(mid, (R_MAJ_OUT + R_MAJ_IN) / 2);
        const majText = createEl('text', { x: majPos.x, y: majPos.y, class: 'circle-label major-label', transform: labelTransform(mid, majPos.x, majPos.y) });
        majText.textContent = k.majIt;
        wheelSvg.appendChild(majText);
        majorLabels.push(majText);
        const minPath = createEl('path', { d: ringPath(start, end, R_MIN_OUT, R_MIN_IN), class: 'circle-seg minor' });
        wheelSvg.appendChild(minPath);
        minorSegments.push(minPath);
        const minPos = polar(mid, (R_MIN_OUT + R_MIN_IN) / 2);
        const minText = createEl('text', { x: minPos.x, y: minPos.y, class: 'circle-label minor-label', transform: labelTransform(mid, minPos.x, minPos.y) });
        if (k.minIt.includes('/')) {
            const parts = k.minIt.split('/');
            minText.classList.add('minor-label-split');
            const t1 = createEl('tspan', { x: minPos.x, dy: '-0.6em' }); t1.textContent = parts[0];
            const t2 = createEl('tspan', { x: minPos.x, dy: '1.2em' }); t2.textContent = parts[1];
            minText.appendChild(t1); minText.appendChild(t2);
        } else { minText.textContent = k.minIt; }
        wheelSvg.appendChild(minText);
        minorLabels.push(minText);
        majPath.addEventListener('click', () => selectKey(i, 'major'));
        minPath.addEventListener('click', () => selectKey(i, 'minor'));
    });
    wheelSvg.appendChild(createEl('circle', { cx: CX, cy: CY, r: R_MIN_IN, fill: 'var(--surface-2)', stroke: 'var(--border)', 'stroke-width': 2 }));
    const t1 = createEl('text', { x: CX, y: CY - 8, class: 'circle-center-title' }); t1.textContent = 'circolo';
    wheelSvg.appendChild(t1);
    const t2 = createEl('text', { x: CX, y: CY + 14, class: 'circle-center-title' }); t2.textContent = 'delle quinte';
    wheelSvg.appendChild(t2);
    const t3 = createEl('text', { x: CX, y: CY + 34, class: 'circle-center-sub' }); t3.textContent = 'MAGGIORI · MINORI';
    wheelSvg.appendChild(t3);
    _circleRendered = true;
}

function createEl(tag, attrs) {
    const el = document.createElementNS(svgNS, tag);
    for (const k in attrs) el.setAttribute(k, attrs[k]);
    return el;
}

function updateCircleColors() {
    const hub = wheelSvg.querySelector('circle[fill="var(--surface-2)"]');
    if (hub) { hub.setAttribute('fill', 'var(--surface-2)'); hub.setAttribute('stroke', 'var(--border)'); }
}

function selectKey(index, quality) {
    if (activeMaj) { activeMaj.classList.remove('active'); }
    if (activeMin) { activeMin.classList.remove('active'); }
    document.querySelectorAll('.circle-label.major-label.active-label, .circle-label.minor-label.active-label').forEach(el => el.classList.remove('active-label'));
    if (quality === 'major') {
        const seg = majorSegments[index], label = majorLabels[index];
        if (seg && label) { seg.classList.add('active'); label.classList.add('active-label'); activeMaj = seg; activeMin = null; }
        showInfo(KEYS[index], 'major');
    } else {
        const seg = minorSegments[index], label = minorLabels[index];
        if (seg && label) { seg.classList.add('active'); label.classList.add('active-label'); activeMin = seg; activeMaj = null; }
        showInfo(KEYS[index], 'minor');
    }
}

document.getElementById('randomBtn').addEventListener('click', function() {
    const idx = Math.floor(Math.random() * KEYS.length);
    const quality = Math.random() < 0.5 ? 'major' : 'minor';
    selectKey(idx, quality);
});

function buildStaffSVG(sigCount, sigType) {
    const W = 150, H = 78, L = 8, bottomY = 58;
    const yFor = pos => bottomY - pos * L;
    let lines = '';
    for (let i = 0; i < 5; i++) { const y = bottomY - i * L; lines += `<line x1="34" y1="${y}" x2="${W-8}" y2="${y}" stroke="#3a3a3a" stroke-width="1.2"/>`; }
    let accidentals = '';
    if (sigCount > 0) {
        const positions = sigType === 'sharp' ? [4,2.5,4.5,3,1.5,3.5,2] : [2,3.5,1.5,3,1,2.5,0.5];
        const symbol = sigType === 'sharp' ? '\u266F' : '\u266D';
        const dy = sigType === 'sharp' ? 6 : 9;
        for (let i = 0; i < sigCount; i++) {
            const x = 46 + i * 11;
            const y = yFor(positions[i]) + dy;
            accidentals += `<text x="${x}" y="${y}" font-size="19" fill="#1a1a1a" font-family="'IBM Plex Mono', monospace" text-anchor="middle">${symbol}</text>`;
        }
    }
    return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg"><rect x="0" y="0" width="${W}" height="${H}" rx="10" fill="#f2ede1"/>${lines}<text x="8" y="52" font-size="46" fill="#1a1a1a" font-family="serif">&#119070;</text>${accidentals}</svg>`;
}

function showInfo(k, quality) {
    const eyebrow = document.getElementById('p-eyebrow'), title = document.getElementById('p-title');
    const qualityEl = document.getElementById('p-quality'), body = document.getElementById('p-body');
    const staffSVG = buildStaffSVG(k.sigCount, k.sigType);
    if (quality === 'major') {
        eyebrow.textContent = 'Tonalità maggiore';
        title.textContent = k.majIt + ' maggiore';
        qualityEl.textContent = 'Scala Ionica';
        const chipsHtml = k.majNotesIt.map((n, idx) => `<span class="note-chip${idx === 0 ? ' root' : ''}">${n}</span>`).join('');
        body.innerHTML = `
          <div class="circle-row"><div class="k">Note della scala</div><div class="notes-list">${chipsHtml}</div></div>
          <div class="circle-row"><div class="k">Armatura di chiave</div><div class="v">${k.sigFull}</div><div class="staff-wrap">${staffSVG}</div></div>
          <div class="circle-row"><div class="k">Relativa minore</div><div class="v">${k.minIt.replace('m',' minore')}</div></div>
        `;
    } else {
        eyebrow.textContent = 'Tonalità minore';
        title.textContent = k.minRoot + ' minore';
        qualityEl.textContent = 'Scala Eolia (naturale)';
        const naturalChips = k.minNotesIt.map((n, idx) => `<span class="note-chip${idx === 0 ? ' root' : ''}">${n}</span>`).join('');
        const harmNotes = k.minNotesIt.slice(); harmNotes[6] = raiseNote(harmNotes[6]);
        const harmChips = harmNotes.map((n, idx) => `<span class="note-chip${idx === 0 ? ' root' : ''}">${n}</span>`).join('');
        const melAsc = k.minNotesIt.slice(); melAsc[5] = raiseNote(melAsc[5]); melAsc[6] = raiseNote(melAsc[6]);
        const melChips = melAsc.map((n, idx) => `<span class="note-chip${idx === 0 ? ' root' : ''}">${n}</span>`).join('');
        const melDesc = k.minNotesIt.slice().reverse();
        const melDescChips = melDesc.map((n) => `<span class="note-chip${n === k.minNotesIt[0] ? ' root' : ''}">${n}</span>`).join('');
        body.innerHTML = `
          <div class="circle-row"><div class="k">Scala minore naturale</div><div class="notes-list">${naturalChips}</div></div>
          <div class="circle-row"><div class="k">Scala minore armonica</div><div class="notes-list">${harmChips}</div></div>
          <div class="circle-row"><div class="k">Scala minore melodica (ascendente)</div><div class="notes-list">${melChips}</div></div>
          <div class="circle-row"><div class="k">Scala minore melodica (discendente)</div><div class="notes-list">${melDescChips}</div></div>
          <div class="circle-row"><div class="k">Armatura di chiave</div><div class="v">${k.sigFull}</div><div class="staff-wrap">${staffSVG}</div></div>
          <div class="circle-row"><div class="k">Relativa maggiore</div><div class="v">${k.majIt} maggiore</div></div>
        `;
    }
}

function raiseNote(str) {
    const LETTERS = ['Sol', 'Do', 'Re', 'Mi', 'Fa', 'La', 'Si'];
    const letter = LETTERS.find(l => str.startsWith(l));
    const rest = str.slice(letter.length);
    let level = 0;
    for (const ch of rest) { if (ch === '♯') level += 1; if (ch === '♭') level -= 1; if (ch === '𝄪') level += 2; if (ch === '𝄫') level -= 2; }
    if (level === 0) return letter + '♯';
    if (level === 1) return letter + '𝄪';
    if (level === -1) return letter;
    return str + '♯';
}

// ============================================================
// 11. ARPEGGI
// ============================================================
function openArpeggi() {
    showView('view-arpeggi');
    applySectionHeader('view-arpeggi', 'arpeggi', 'arpeggi-title-text');
    renderArpeggiChecklist();
    renderArpeggiExercises();
}

function renderArpeggiExercises() {
    const cat = appData.categories.find(c => c.id === 'arpeggi');
    if (!cat) return;
    renderExerciseListInto(cat, 'arpeggi-exercise-list', renderArpeggiExercises);
}

document.getElementById('btn-add-exercise-arpeggi').addEventListener('click', () => {
    const cat = appData.categories.find(c => c.id === 'arpeggi');
    if (!cat) return;
    cat.exercises.push({ id: uid('ex'), name: '', pdf: '', speedSep: null, speedTog: null, _open: true });
    saveData();
    renderArpeggiExercises();
});

const ARPEGGI_DATA = {
    'C': { major: { notes: ['Do', 'Mi', 'Sol', 'Do'], rh: [1, 3, 5, 1], lh: [5, 3, 2, 1] }, minor: { notes: ['Do', 'Mib', 'Sol', 'Do'], rh: [1, 3, 5, 1], lh: [5, 3, 2, 1] }, diminished: { notes: ['Do', 'Mib', 'Solb', 'Do'], rh: [1, 3, 5, 1], lh: [5, 3, 2, 1] }, augmented: { notes: ['Do', 'Mi', 'Sol#', 'Do'], rh: [1, 3, 5, 1], lh: [5, 3, 2, 1] } },
    'G': { major: { notes: ['Sol', 'Si', 'Re', 'Sol'], rh: [1, 3, 5, 1], lh: [5, 3, 2, 1] }, minor: { notes: ['Sol', 'Sib', 'Re', 'Sol'], rh: [1, 3, 5, 1], lh: [5, 3, 2, 1] }, diminished: { notes: ['Sol', 'Sib', 'Reb', 'Sol'], rh: [1, 3, 5, 1], lh: [5, 3, 2, 1] }, augmented: { notes: ['Sol', 'Si', 'Re#', 'Sol'], rh: [1, 3, 5, 1], lh: [5, 3, 2, 1] } },
    'D': { major: { notes: ['Re', 'Fa#', 'La', 'Re'], rh: [1, 3, 5, 1], lh: [5, 3, 2, 1] }, minor: { notes: ['Re', 'Fa', 'La', 'Re'], rh: [1, 3, 5, 1], lh: [5, 3, 2, 1] }, diminished: { notes: ['Re', 'Fa', 'Lab', 'Re'], rh: [1, 3, 5, 1], lh: [5, 3, 2, 1] }, augmented: { notes: ['Re', 'Fa#', 'La#', 'Re'], rh: [1, 3, 5, 1], lh: [5, 3, 2, 1] } },
    'A': { major: { notes: ['La', 'Do#', 'Mi', 'La'], rh: [1, 3, 5, 1], lh: [5, 3, 2, 1] }, minor: { notes: ['La', 'Do', 'Mi', 'La'], rh: [1, 3, 5, 1], lh: [5, 3, 2, 1] }, diminished: { notes: ['La', 'Do', 'Mib', 'La'], rh: [1, 3, 5, 1], lh: [5, 3, 2, 1] }, augmented: { notes: ['La', 'Do#', 'Mi#', 'La'], rh: [1, 3, 5, 1], lh: [5, 3, 2, 1] } },
    'E': { major: { notes: ['Mi', 'Sol#', 'Si', 'Mi'], rh: [1, 3, 5, 1], lh: [5, 3, 2, 1] }, minor: { notes: ['Mi', 'Sol', 'Si', 'Mi'], rh: [1, 3, 5, 1], lh: [5, 3, 2, 1] }, diminished: { notes: ['Mi', 'Sol', 'Sib', 'Mi'], rh: [1, 3, 5, 1], lh: [5, 3, 2, 1] }, augmented: { notes: ['Mi', 'Sol#', 'Si#', 'Mi'], rh: [1, 3, 5, 1], lh: [5, 3, 2, 1] } },
    'B': { major: { notes: ['Si', 'Re#', 'Fa#', 'Si'], rh: [1, 3, 5, 1], lh: [5, 3, 2, 1] }, minor: { notes: ['Si', 'Re', 'Fa#', 'Si'], rh: [1, 3, 5, 1], lh: [5, 3, 2, 1] }, diminished: { notes: ['Si', 'Re', 'Fa', 'Si'], rh: [1, 3, 5, 1], lh: [5, 3, 2, 1] }, augmented: { notes: ['Si', 'Re#', 'Fa##', 'Si'], rh: [1, 3, 5, 1], lh: [5, 3, 2, 1] } },
    'F#': { major: { notes: ['Fa#', 'La#', 'Do#', 'Fa#'], rh: [1, 3, 5, 1], lh: [5, 3, 2, 1] }, minor: { notes: ['Fa#', 'La', 'Do#', 'Fa#'], rh: [1, 3, 5, 1], lh: [5, 3, 2, 1] }, diminished: { notes: ['Fa#', 'La', 'Do', 'Fa#'], rh: [1, 3, 5, 1], lh: [5, 3, 2, 1] }, augmented: { notes: ['Fa#', 'La#', 'Do##', 'Fa#'], rh: [1, 3, 5, 1], lh: [5, 3, 2, 1] } },
    'Db': { major: { notes: ['Reb', 'Fa', 'Lab', 'Reb'], rh: [1, 3, 5, 1], lh: [5, 3, 2, 1] }, minor: { notes: ['Reb', 'Fab', 'Lab', 'Reb'], rh: [1, 3, 5, 1], lh: [5, 3, 2, 1] }, diminished: { notes: ['Reb', 'Fab', 'Solbb', 'Reb'], rh: [1, 3, 5, 1], lh: [5, 3, 2, 1] }, augmented: { notes: ['Reb', 'Fa', 'La', 'Reb'], rh: [1, 3, 5, 1], lh: [5, 3, 2, 1] } },
    'Ab': { major: { notes: ['Lab', 'Do', 'Mib', 'Lab'], rh: [1, 3, 5, 1], lh: [5, 3, 2, 1] }, minor: { notes: ['Lab', 'Dob', 'Mib', 'Lab'], rh: [1, 3, 5, 1], lh: [5, 3, 2, 1] }, diminished: { notes: ['Lab', 'Dob', 'Mibb', 'Lab'], rh: [1, 3, 5, 1], lh: [5, 3, 2, 1] }, augmented: { notes: ['Lab', 'Do', 'Mi', 'Lab'], rh: [1, 3, 5, 1], lh: [5, 3, 2, 1] } },
    'Eb': { major: { notes: ['Mib', 'Sol', 'Sib', 'Mib'], rh: [1, 3, 5, 1], lh: [5, 3, 2, 1] }, minor: { notes: ['Mib', 'Solb', 'Sib', 'Mib'], rh: [1, 3, 5, 1], lh: [5, 3, 2, 1] }, diminished: { notes: ['Mib', 'Solb', 'Sibb', 'Mib'], rh: [1, 3, 5, 1], lh: [5, 3, 2, 1] }, augmented: { notes: ['Mib', 'Sol', 'Si', 'Mib'], rh: [1, 3, 5, 1], lh: [5, 3, 2, 1] } },
    'Bb': { major: { notes: ['Sib', 'Re', 'Fa', 'Sib'], rh: [1, 3, 5, 1], lh: [5, 3, 2, 1] }, minor: { notes: ['Sib', 'Reb', 'Fa', 'Sib'], rh: [1, 3, 5, 1], lh: [5, 3, 2, 1] }, diminished: { notes: ['Sib', 'Reb', 'Fab', 'Sib'], rh: [1, 3, 5, 1], lh: [5, 3, 2, 1] }, augmented: { notes: ['Sib', 'Re', 'Fa#', 'Sib'], rh: [1, 3, 5, 1], lh: [5, 3, 2, 1] } },
    'F': { major: { notes: ['Fa', 'La', 'Do', 'Fa'], rh: [1, 3, 5, 1], lh: [5, 3, 2, 1] }, minor: { notes: ['Fa', 'Lab', 'Do', 'Fa'], rh: [1, 3, 5, 1], lh: [5, 3, 2, 1] }, diminished: { notes: ['Fa', 'Lab', 'Dob', 'Fa'], rh: [1, 3, 5, 1], lh: [5, 3, 2, 1] }, augmented: { notes: ['Fa', 'La', 'Do#', 'Fa'], rh: [1, 3, 5, 1], lh: [5, 3, 2, 1] } }
};

function renderArpeggi() {
    const tonic = document.getElementById('arpeggi-tonic').value;
    const type = document.getElementById('arpeggi-type').value;
    const data = ARPEGGI_DATA[tonic];
    if (!data || !data[type]) return;
    const arp = data[type];
    const notesDisplay = document.getElementById('arpeggi-notes-display');
    notesDisplay.innerHTML = `<span class="label">Note</span> ` +
        arp.notes.map((n, i) => `<span class="arpeggi-note">${n} <span class="finger">${arp.rh[i]}</span></span>`).join('');

    document.getElementById('arpeggi-rh').innerHTML = arp.notes.map((n, i) => `<span class="seq-note">${n} <span class="dig">${arp.rh[i]}</span></span>`).join('');
    document.getElementById('arpeggi-lh').innerHTML = arp.notes.map((n, i) => `<span class="seq-note">${n} <span class="dig">${arp.lh[i]}</span></span>`).join('');
}

document.getElementById('arpeggi-tonic').addEventListener('change', renderArpeggi);
document.getElementById('arpeggi-type').addEventListener('change', renderArpeggi);
document.getElementById('arpeggi-random').addEventListener('click', function() {
    const tonics = Object.keys(ARPEGGI_DATA);
    const types = ['major', 'minor', 'diminished', 'augmented'];
    document.getElementById('arpeggi-tonic').value = tonics[Math.floor(Math.random() * tonics.length)];
    document.getElementById('arpeggi-type').value = types[Math.floor(Math.random() * types.length)];
    renderArpeggi();
});

// ============================================================
// 12. KOMPLETE
// ============================================================
const SOUNDS = [
    { id: "ambient", label: "Ambient / Sci-Fi / Cinema" },
    { id: "blues", label: "Blues" },
    { id: "jazz", label: "Jazz" },
    { id: "pop", label: "Pop" },
    { id: "rock", label: "Rock" },
    { id: "cantautore", label: "Cantautore" },
    { id: "electronic", label: "Elettronica / EDM" },
    { id: "hiphop", label: "Hip-Hop / Trap" },
    { id: "orchestral", label: "Orchestrale / Classica" },
    { id: "folk", label: "Folk / Acustico" }
];
const CATEGORIES = [
    { id: "synth", label: "Synth", code: "SYN" },
    { id: "texture", label: "Texture & Play Series", code: "TEX" },
    { id: "drums", label: "Batteria & Percussioni", code: "DRM" },
    { id: "real", label: "Pianoforti, Chitarre, Bassi & Strumenti Reali", code: "STR" },
    { id: "fx", label: "Effetti (FX)", code: "FX" }
];
const KDATA = [
    { cat: "synth", name: "Absynth 6", desc: "semi-modulare per texture organiche", s: { ambient: 5, electronic: 4, cantautore: 2 }, tags: ["granular", "texture"] },
    { cat: "synth", name: "Massive X", desc: "wavetable flagship, bassi complessi", s: { ambient: 4, electronic: 5, pop: 2, hiphop: 2 }, tags: ["wavetable", "flagship"] },
    { cat: "synth", name: "Massive", desc: "wavetable per lead e bassi EDM", s: { electronic: 5, hiphop: 2 }, tags: ["wavetable", "classic"] },
    { cat: "synth", name: "FM8", desc: "sintesi FM, suoni digitali anni '80", s: { ambient: 4, electronic: 4, pop: 2, jazz: 2 }, tags: ["fm", "vintage"] },
    { cat: "synth", name: "Monark", desc: "mono-synth analogico stile Minimoog", s: { rock: 4, electronic: 4, blues: 2, pop: 2, cantautore: 2 }, tags: ["analog", "mono"] },
    { cat: "synth", name: "Reaktor 6", desc: "piattaforma modulare per sound design", s: { ambient: 5, electronic: 4 }, tags: ["modular", "platform"] },
    { cat: "synth", name: "Super 8", desc: "polysynth analogico vintage a 8 voci", s: { ambient: 4, pop: 4, cantautore: 2 }, tags: ["analog", "poly"] },
    { cat: "texture", name: "Ethereal Earth", desc: "coro e orchestra ambientale", s: { ambient: 5, orchestral: 4, cantautore: 2 }, tags: ["choir", "orchestral"] },
    { cat: "texture", name: "Hybrid Keys", desc: "ibrido piano/synth, pad emotivi", s: { ambient: 4, pop: 4, cantautore: 4 }, tags: ["hybrid", "piano"] },
    { cat: "texture", name: "Lo-Fi Glow", desc: "texture lo-fi, calore a nastro", s: { hiphop: 4, ambient: 2, jazz: 2, cantautore: 2 }, tags: ["lofi", "vintage"] },
    { cat: "texture", name: "Analog Dreams", desc: "pad e synth analogici caldi", s: { ambient: 4, electronic: 4, pop: 2, cantautore: 2 }, tags: ["analog", "pads"] },
    { cat: "texture", name: "Modular Icons", desc: "pluck e texture ispirati al modulare", s: { electronic: 4, ambient: 4 }, tags: ["modular", "pluck"] },
    { cat: "texture", name: "Cloud Supply", desc: "pad onirici, leggeri e sospesi", s: { ambient: 4, pop: 2, cantautore: 2 }, tags: ["dreamy", "pads"] },
    { cat: "texture", name: "Stacks", desc: "pad stratificati, ampi e avvolgenti", s: { ambient: 4, pop: 4, cantautore: 2 }, tags: ["pads", "layered"] },
    { cat: "texture", name: "Soul Sessions", desc: "tastiere soul/R&B, groove caldo", s: { jazz: 4, blues: 2, pop: 2 }, tags: ["soul", "rnb"] },
    { cat: "texture", name: "Duets", desc: "due strumenti in dialogo, arrangiamenti intimi", s: { cantautore: 2, jazz: 2, pop: 2 }, tags: ["intimate", "duo"] },
    { cat: "texture", name: "Nacht", desc: "pianoforte notturno e intimo", s: { cantautore: 5, ambient: 4, jazz: 2 }, tags: ["piano", "nocturnal"] },
    { cat: "drums", name: "Battery 4", desc: "drum sampler / groove machine versatile", s: { hiphop: 5, electronic: 4, pop: 2, rock: 2 }, tags: ["sampler", "versatile"] },
    { cat: "drums", name: "Drumlab", desc: "batteria acustica multi-mic", s: { rock: 4, pop: 4, jazz: 2, cantautore: 2 }, tags: ["acoustic", "realistic"] },
    { cat: "drums", name: "Abbey Road 60s Drummer", desc: "batteria vintage anni '60", s: { rock: 5, pop: 4, cantautore: 4, blues: 2 }, tags: ["vintage", "classic"] },
    { cat: "drums", name: "Studio Drummer", desc: "batteria acustica da studio multi-genere", s: { rock: 4, pop: 4, jazz: 4, blues: 4, cantautore: 4 }, tags: ["studio", "versatile"] },
    { cat: "drums", name: "West Africa", desc: "percussioni tradizionali africane", s: { folk: 5, ambient: 2, cantautore: 2 }, tags: ["african", "organic"] },
    { cat: "real", name: "Noire", desc: "pianoforte intimo e cinematico (Nils Frahm)", s: { cantautore: 5, ambient: 4, jazz: 2, pop: 2 }, tags: ["piano", "cinematic"] },
    { cat: "real", name: "Una Corda", desc: "pianoforte ovattato/preparato", s: { cantautore: 5, ambient: 4, jazz: 2 }, tags: ["piano", "prepared"] },
    { cat: "real", name: "The Gentleman", desc: "pianoforte verticale vintage", s: { jazz: 4, blues: 4, cantautore: 2, folk: 2 }, tags: ["piano", "vintage"] },
    { cat: "real", name: "The Maverick", desc: "pianoforte verticale vissuto", s: { blues: 4, folk: 4, jazz: 2, cantautore: 2 }, tags: ["piano", "rustic"] },
    { cat: "real", name: "The Grandeur", desc: "gran coda da concerto", s: { orchestral: 4, jazz: 4, pop: 2, cantautore: 4, blues: 2 }, tags: ["piano", "concert"] },
    { cat: "real", name: "Scarbee Rickenbacker Bass", desc: "basso elettrico iconico", s: { rock: 4, pop: 4, blues: 2, cantautore: 2 }, tags: ["bass", "electric"] },
    { cat: "real", name: "Session Guitarist – Strummed Acoustic", desc: "chitarra acustica strimpellata", s: { cantautore: 5, folk: 5, pop: 2, blues: 2 }, tags: ["guitar", "acoustic"] },
    { cat: "real", name: "Session Bassist – Upright Bass", desc: "contrabbasso acustico", s: { jazz: 5, blues: 4, folk: 4, cantautore: 2 }, tags: ["bass", "acoustic"] },
    { cat: "real", name: "Session Horns", desc: "sezione fiati, calore soul/jazz", s: { jazz: 5, blues: 4, pop: 2, cantautore: 2 }, tags: ["horns", "brass"] },
    { cat: "real", name: "Session Strings 2", desc: "ensemble di corde orchestrali", s: { orchestral: 5, ambient: 4, cantautore: 4, pop: 2 }, tags: ["strings", "orchestral"] },
    { cat: "real", name: "Vintage Organs", desc: "organi Hammond vintage", s: { blues: 5, jazz: 4, rock: 2, cantautore: 2 }, tags: ["organ", "vintage"] },
    { cat: "fx", name: "Raum", desc: "riverbero spaziale, ambienti naturali", s: { ambient: 4, cantautore: 2, jazz: 2, orchestral: 4, folk: 2 }, tags: ["reverb", "spatial"] },
    { cat: "fx", name: "Replika", desc: "delay versatile, dallo spaziale al preciso", s: { ambient: 4, electronic: 4, rock: 2, cantautore: 2 }, tags: ["delay", "versatile"] },
    { cat: "fx", name: "Guitar Rig 6 LE", desc: "simulazione ampli chitarra", s: { rock: 5, blues: 4, pop: 2 }, tags: ["guitar", "amp"] },
    { cat: "fx", name: "Driver", desc: "distorsione/overdrive per carattere", s: { rock: 4, electronic: 2 }, tags: ["distortion", "overdrive"] },
    { cat: "fx", name: "Dirt", desc: "degrado lo-fi e sporco controllato", s: { hiphop: 4, ambient: 2, electronic: 2 }, tags: ["lofi", "degradation"] },
    { cat: "fx", name: "Freak", desc: "modulazione/glitch per texture imprevedibili", s: { electronic: 4, ambient: 2, hiphop: 2 }, tags: ["glitch", "modulation"] }
];

let kSelectedSounds = new Set(['cantautore']);
let kSearchQuery = '';
let kFavorites = new Set();
let kCompareList = [];
let kCollapsed = new Set();
let kCurrentMood = null;
let kSearchTimeout = null;

function openKomplete() {
    showView('view-komplete');
    applySectionHeader('view-komplete', 'komplete', 'komplete-title-text');
    kLoadState();
    kRender();
}

function kLoadState() {
    try {
        const sf = localStorage.getItem('komplete_favorites');
        if (sf) JSON.parse(sf).forEach(n => kFavorites.add(n));
        const sf2 = localStorage.getItem('komplete_filters');
        if (sf2) { const p = JSON.parse(sf2); if (p.length > 0) kSelectedSounds = new Set(p); }
        const sc = localStorage.getItem('komplete_compare');
        if (sc) kCompareList = JSON.parse(sc);
        const scoll = localStorage.getItem('komplete_collapsed');
        if (scoll) kCollapsed = new Set(JSON.parse(scoll));
    } catch (e) {}
}
function kSaveFav() { try { localStorage.setItem('komplete_favorites', JSON.stringify([...kFavorites])); } catch (e) {} }
function kSaveFilters() { try { localStorage.setItem('komplete_filters', JSON.stringify([...kSelectedSounds])); } catch (e) {} }
function kSaveCompare() { try { localStorage.setItem('komplete_compare', JSON.stringify(kCompareList)); } catch (e) {} }
function kSaveCollapsed() { try { localStorage.setItem('komplete_collapsed', JSON.stringify([...kCollapsed])); } catch (e) {} }

function kRender() {
    const fContainer = document.getElementById('kompleteFilters');
    fContainer.innerHTML = '';
    SOUNDS.forEach(s => {
        const btn = document.createElement('button');
        btn.className = `komplete-pill${kSelectedSounds.has(s.id) ? ' active' : ''}`;
        btn.textContent = s.label;
        btn.dataset.id = s.id;
        btn.addEventListener('click', () => { kToggleFilter(s.id); });
        fContainer.appendChild(btn);
    });
    document.getElementById('kompleteFilterCount').textContent = `${kSelectedSounds.size} selezionati`;

    const grid = document.getElementById('kompleteGrid');
    grid.innerHTML = '';
    const activeIds = [...kSelectedSounds];
    const hasFilters = activeIds.length > 0;
    const catCounts = {};

    CATEGORIES.forEach(cat => {
        let items = KDATA.filter(d => d.cat === cat.id).map(d => {
            let score = 0;
            if (hasFilters) {
                const scores = activeIds.map(id => d.s[id] || 0);
                score = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
            } else { score = Math.max(...Object.values(d.s)); }
            return { ...d, score };
        }).filter(d => d.score > 0);
        if (kSearchQuery.trim()) {
            const q = kSearchQuery.toLowerCase().trim();
            items = items.filter(d => d.name.toLowerCase().includes(q) || d.desc.toLowerCase().includes(q) || (d.tags && d.tags.some(t => t.toLowerCase().includes(q))));
        }
        catCounts[cat.id] = items.length;
    });

    CATEGORIES.forEach(cat => {
        let items = KDATA.filter(d => d.cat === cat.id).map(d => {
            let score = 0;
            if (hasFilters) {
                const scores = activeIds.map(id => d.s[id] || 0);
                score = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
            } else { score = Math.max(...Object.values(d.s)); }
            return { ...d, score };
        }).filter(d => d.score > 0);
        if (kSearchQuery.trim()) {
            const q = kSearchQuery.toLowerCase().trim();
            items = items.filter(d => d.name.toLowerCase().includes(q) || d.desc.toLowerCase().includes(q) || (d.tags && d.tags.some(t => t.toLowerCase().includes(q))));
        }
        if (items.length === 0) return;
        items.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
        const totalInCat = catCounts[cat.id] || 1;
        const isCollapsed = kCollapsed.has(cat.id);
        const icon = isCollapsed ? '▶' : '▼';

        let bodyHtml = items.map((it, i) => {
            const isFav = kFavorites.has(it.name);
            const isComp = kCompareList.includes(it.name);
            const segs = [1,2,3,4,5].map(n => `<span class="seg${n <= it.score ? ' on' : ''}"></span>`).join('');
            const tags = (it.tags || []).map(t => `<span class="tag">${t}</span>`).join('');
            let sugg = '';
            if (isFav) {
                const suggested = kGetSuggested(it.name);
                if (suggested.length > 0) sugg = `<div class="komplete-desc"><span class="suggestion-hint">⭐ Prova anche ${suggested.map(s=>s.name).join(', ')}</span></div>`;
            }
            return `<div class="komplete-row${isFav ? ' favorite' : ''}${isComp ? ' compare-selected' : ''}" data-inst="${it.name}">
                <span class="komplete-rank">${i+1}</span>
                <div class="komplete-info">
                  <div class="komplete-name">
                    ${it.name}
                    ${isFav ? '<span class="suggestion-badge">⭐ Consigliato</span>' : ''}
                    <span class="fav-star" data-inst="${it.name}">${isFav ? '❤' : '🤍'}</span>
                    <span class="compare-check" data-inst="${it.name}">${isComp ? '✅' : '⬜'}</span>
                    <span class="tags">${tags}</span>
                  </div>
                  <div class="komplete-desc">${it.desc}</div>
                  ${sugg}
                </div>
                <div class="komplete-meter">${segs}</div>
              </div>`;
        }).join('');

        const panel = document.createElement('div');
        panel.className = `komplete-panel category-${cat.id}`;
        panel.innerHTML = `
          <div class="komplete-head" data-cat="${cat.id}">
            <span class="code">${cat.code}</span>
            <span class="title">${cat.label}</span>
            <span class="count-badge">${items.length}</span>
            <span class="toggle-icon${isCollapsed ? ' collapsed' : ''}">${icon}</span>
          </div>
          <div class="komplete-body${isCollapsed ? ' collapsed' : ''}">${bodyHtml}</div>
        `;
        grid.appendChild(panel);
    });

    grid.querySelectorAll('.fav-star').forEach(el => {
        el.addEventListener('click', (e) => { e.stopPropagation(); kToggleFav(el.dataset.inst); });
    });
    grid.querySelectorAll('.compare-check').forEach(el => {
        el.addEventListener('click', (e) => { e.stopPropagation(); kToggleCompare(el.dataset.inst); });
    });
    grid.querySelectorAll('.komplete-head').forEach(head => {
        head.addEventListener('click', () => {
            const catId = head.dataset.cat;
            const body = head.parentElement.querySelector('.komplete-body');
            const icon = head.querySelector('.toggle-icon');
            if (kCollapsed.has(catId)) { kCollapsed.delete(catId); body.classList.remove('collapsed'); icon.classList.remove('collapsed'); icon.textContent = '▼'; }
            else { kCollapsed.add(catId); body.classList.add('collapsed'); icon.classList.add('collapsed'); icon.textContent = '▶'; }
            kSaveCollapsed();
        });
    });

    kRenderStats();
    kUpdateCompareBar();
    kUpdateFavIndicator();
}

function kGetSuggested(name) {
    if (kFavorites.size === 0) return [];
    const current = KDATA.find(d => d.name === name);
    if (!current) return [];
    const suggestions = [];
    KDATA.forEach(d => {
        if (d.name === name || kFavorites.has(d.name)) return;
        let score = 0;
        const commonTags = (d.tags || []).filter(t => (current.tags || []).includes(t));
        score += commonTags.length * 2;
        if (d.cat === current.cat) score += 1;
        SOUNDS.forEach(s => { if (current.s[s.id] >= 4 && d.s[s.id] >= 4) score += 1; });
        if (score > 0) suggestions.push({ ...d, matchScore: score });
    });
    suggestions.sort((a, b) => b.matchScore - a.matchScore);
    return suggestions.slice(0, 3);
}

function kToggleFilter(id) {
    if (kSelectedSounds.has(id)) kSelectedSounds.delete(id);
    else kSelectedSounds.add(id);
    if (kSelectedSounds.size === 0) { SOUNDS.forEach(s => kSelectedSounds.add(s.id)); }
    kSaveFilters();
    kRender();
}

function kToggleFav(name) {
    if (kFavorites.has(name)) { kFavorites.delete(name); kToast(`✖️ ${name} rimosso dai preferiti`); }
    else { kFavorites.add(name); const suggested = kGetSuggested(name); let extra = ''; if (suggested.length > 0) extra = `<br><br>⭐ Prova anche: ${suggested.map(s=>s.name).join(', ')}`; kToast(`❤️ ${name} aggiunto ai preferiti!${extra}`, '❤️', 8000); }
    kSaveFav();
    kRender();
}

function kToggleCompare(name) {
    const idx = kCompareList.indexOf(name);
    if (idx > -1) { kCompareList.splice(idx, 1); kToast(`✖️ ${name} rimosso dal confronto`); }
    else if (kCompareList.length < 4) { kCompareList.push(name); kToast(`✅ ${name} aggiunto al confronto`); }
    else { kToast('⚠️ Massimo 4 strumenti confrontabili'); return; }
    kSaveCompare();
    kRender();
}

function kUpdateCompareBar() {
    const bar = document.getElementById('kompleteCompareBar');
    const items = document.getElementById('kompleteCompareItems');
    if (kCompareList.length > 0) {
        bar.classList.add('show');
        items.innerHTML = kCompareList.map(n => `<span class="compare-item">${n} <button class="remove-compare" data-name="${n}">✕</button></span>`).join('');
        items.querySelectorAll('.remove-compare').forEach(b => {
            b.addEventListener('click', () => kToggleCompare(b.dataset.name));
        });
    } else { bar.classList.remove('show'); }
}

function kUpdateFavIndicator() {
    const el = document.getElementById('kompleteFavIndicator');
    const count = kFavorites.size;
    if (count > 0) { el.style.display = 'flex'; document.getElementById('kompleteFavCount').textContent = count; } else { el.style.display = 'none'; }
}
document.getElementById('kompleteFavIndicator').addEventListener('click', () => {
    const first = document.querySelector('.komplete-row.favorite');
    if (first) { first.scrollIntoView({ behavior: 'smooth', block: 'center' }); first.style.backgroundColor = 'rgba(248,113,113,0.2)'; setTimeout(() => first.style.backgroundColor = '', 1500); }
});

function kRenderStats() {
    const activeIds = [...kSelectedSounds];
    const hasFilters = activeIds.length > 0;
    const catScores = CATEGORIES.map(cat => {
        const items = KDATA.filter(d => d.cat === cat.id);
        let total = 0, count = 0;
        items.forEach(d => {
            if (hasFilters) {
                const scores = activeIds.map(id => d.s[id] || 0);
                const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
                if (avg > 0) { total += avg; count++; }
            } else { const max = Math.max(...Object.values(d.s)); if (max > 0) { total += max; count++; } }
        });
        return { id: cat.id, label: cat.label, score: count > 0 ? Math.round(total / count * 10) / 10 : 0, count };
    });
    const maxScore = Math.max(...catScores.map(c => c.score), 1);
    document.getElementById('kompleteStats').innerHTML = `
        <div class="stat"><strong>${KDATA.length}</strong> strumenti</div>
        <div class="stat"><strong>${kFavorites.size}</strong> preferiti ❤️</div>
        <div class="stat" style="flex:1;min-width:160px;">
          <span style="font-size:11px;color:var(--text-muted);">Punteggio categoria:</span>
          <div class="bar-chart">
            ${catScores.map(c => `<div class="bar" style="height:${(c.score/maxScore)*22}px;background:${c.score>0?'var(--accent)':'var(--border-light)'};" title="${c.label}: ${c.score}/5 (${c.count} strumenti)"><span class="bar-label">${c.label.substring(0,3)}</span></div>`).join('')}
          </div>
        </div>
      `;
}

document.getElementById('kompleteSearch').addEventListener('input', (e) => {
    clearTimeout(kSearchTimeout);
    kSearchTimeout = setTimeout(() => {
        kSearchQuery = e.target.value;
        kRender();
    }, 200);
});
document.getElementById('kompleteClearFilters').addEventListener('click', () => {
    kSelectedSounds.clear();
    SOUNDS.forEach(s => kSelectedSounds.add(s.id));
    kSaveFilters();
    kRender();
});
document.getElementById('kompleteClearCompare').addEventListener('click', () => { kCompareList = []; kSaveCompare(); kRender(); });
document.getElementById('kompleteCompareBtn').addEventListener('click', kOpenCompareModal);
document.getElementById('kompleteCloseCompare').addEventListener('click', () => { document.getElementById('kompleteCompareModal').classList.remove('show'); });
document.getElementById('kompleteCompareModal').addEventListener('click', (e) => { if (e.target === e.currentTarget) document.getElementById('kompleteCompareModal').classList.remove('show'); });

function kOpenCompareModal() {
    if (kCompareList.length < 2) { kToast('⚠️ Seleziona almeno 2 strumenti'); return; }
    const insts = KDATA.filter(d => kCompareList.includes(d.name));
    let html = `<table class="komplete-compare-table"><thead><tr><th>Strumento</th><th>Categoria</th><th>Tags</th>`;
    SOUNDS.forEach(s => html += `<th>${s.label.split('/')[0].trim()}</th>`);
    html += `</tr></thead><tbody>`;
    insts.forEach(inst => {
        html += `<tr><td><strong>${inst.name}</strong></td><td>${CATEGORIES.find(c=>c.id===inst.cat)?.label||inst.cat}</td><td>${(inst.tags||[]).join(', ')}</td>`;
        SOUNDS.forEach(s => {
            const score = inst.s[s.id] || 0;
            const segs = [1,2,3,4,5].map(n => `<span class="seg${n<=score?' on':''}"></span>`).join('');
            html += `<td><div class="score-cell">${segs}</div></td>`;
        });
        html += `</tr>`;
    });
    html += `</tbody></table>`;
    document.getElementById('kompleteCompareTable').innerHTML = html;
    document.getElementById('kompleteCompareModal').classList.add('show');
}

const KMOOD = {
    happy: { emoji: '🎉', name: 'Felice', instruments: ['The Grandeur', 'Super 8', 'Stacks', 'Replika'], scalerTips: ['🎼 Scala: Do maggiore — Luminosa', '🎹 Accordi: C - F - G', '💡 Suona con energia'], genres: ['pop', 'rock', 'orchestral'] },
    melancholic: { emoji: '😢', name: 'Malinconico', instruments: ['Noire', 'Nacht', 'Raum', 'Session Strings 2'], scalerTips: ['🎼 Scala: Do minore naturale — Profonda', '🎹 Accordi: Cm - Fm - Gm', '💡 Suona piano, note lunghe'], genres: ['cantautore', 'ambient', 'jazz'] },
    energetic: { emoji: '🔥', name: 'Energico', instruments: ['Massive X', 'Battery 4', 'Monark', 'Guitar Rig 6 LE'], scalerTips: ['🎼 Scala: Do misolidio — Potente', '🎹 Accordi: C5 - Bb5 - F5', '💡 Suona forte e incisivo'], genres: ['rock', 'electronic', 'hiphop'] },
    dreamy: { emoji: '🌙', name: 'Sognante', instruments: ['Ethereal Earth', 'Absynth 6', 'Cloud Supply', 'Raum'], scalerTips: ['🎼 Scala: Do lidio — Magico', '🎹 Accordi: C△#11', '💡 Usa arpeggi lenti'], genres: ['ambient', 'orchestral', 'electronic'] },
    dark: { emoji: '🖤', name: 'Scuro', instruments: ['Absynth 6', 'Polyplex', 'Freak', 'Raum'], scalerTips: ['🎼 Scala: Do frigio — Misterioso', '🎹 Accordi: Db - Cm', '💡 Usa dissonanze'], genres: ['electronic', 'ambient'] },
    cinematic: { emoji: '🎬', name: 'Cinematico', instruments: ['Ethereal Earth', 'Session Strings 2', 'Noire', 'Raum'], scalerTips: ['🎼 Scala: Do minore melodico — Epico', '🎹 Accordi: Cm - Ab - Bb', '💡 Suona con ampiezza'], genres: ['orchestral', 'ambient'] },
    groovy: { emoji: '🕺', name: 'Groovy', instruments: ['Battery 4', 'Soul Sessions', 'Session Bassist – Prime Bass', 'Replika'], scalerTips: ['🎼 Scala: Do dorico — Funky', '🎹 Accordi: Cm - F', '💡 Ritmi sincopati'], genres: ['pop', 'jazz', 'hiphop'] },
    intimate: { emoji: '🤗', name: 'Intimo', instruments: ['Una Corda', 'Nacht', 'Duets', 'Raum'], scalerTips: ['🎼 Scala: Do minore armonico — Profondo', '🎹 Accordi: Cm - Ab', '💡 Suona piano, espressivo'], genres: ['cantautore', 'jazz'] }
};

document.querySelectorAll('.komplete-mood-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.komplete-mood-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        kApplyMood(btn.dataset.mood);
    });
});

function kApplyMood(moodId) {
    const mood = KMOOD[moodId];
    if (!mood) return;
    const result = document.getElementById('kompleteMoodResult');
    result.classList.add('show');
    document.getElementById('kmMoodEmoji').textContent = mood.emoji;
    document.getElementById('kmMoodName').textContent = mood.name;
    document.getElementById('kmMoodInstruments').innerHTML = mood.instruments.map(i => `<span class="komplete-mood-instrument-tag">${i}</span>`).join('');
    document.getElementById('kmMoodScaler').innerHTML = mood.scalerTips.map(t => `<div class="komplete-mood-scaler-tip">${t}</div>`).join('');
    kCurrentMood = moodId;
    result.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

document.getElementById('kompleteMoodClose').addEventListener('click', () => {
    document.getElementById('kompleteMoodResult').classList.remove('show');
    document.querySelectorAll('.komplete-mood-btn').forEach(b => b.classList.remove('active'));
});

document.getElementById('kmMoodApply').addEventListener('click', () => {
    if (!kCurrentMood) return;
    const mood = KMOOD[kCurrentMood];
    kSelectedSounds.clear();
    mood.genres.forEach(g => { if (SOUNDS.some(s => s.id === g)) kSelectedSounds.add(g); });
    if (kSelectedSounds.size === 0) { SOUNDS.forEach(s => kSelectedSounds.add(s.id)); }
    kSaveFilters();
    kRender();
    kToast(`🎯 Filtri applicati per mood "${mood.name}"!`, '🎯');
});

document.getElementById('kmMoodCopy').addEventListener('click', () => {
    if (!kCurrentMood) return;
    const mood = KMOOD[kCurrentMood];
    let text = `🎭 MOOD: ${mood.emoji} ${mood.name}\n\n🎹 STRUMENTI CONSIGLIATI:\n${mood.instruments.map(i=>'  • '+i).join('\n')}\n\n🎼 PER SCALER 3:\n${mood.scalerTips.map(t=>'  • '+t).join('\n')}`;
    navigator.clipboard.writeText(text).then(() => kToast('📋 Consigli copiati!', '📋')).catch(() => {
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        kToast('📋 Consigli copiati!', '📋');
    });
});

let kToastTimeout = null;
function kToast(msg, icon = '💡', duration = 5000) {
    const el = document.getElementById('kompleteToast');
    document.getElementById('kToastMessage').innerHTML = msg;
    document.getElementById('kToastIcon').textContent = icon;
    document.getElementById('kToastActions').innerHTML = '';
    el.classList.add('show');
    if (kToastTimeout) { clearTimeout(kToastTimeout); }
    kToastTimeout = setTimeout(() => { el.classList.remove('show'); }, duration);
}
document.getElementById('kToastClose').addEventListener('click', () => {
    document.getElementById('kompleteToast').classList.remove('show');
    if (kToastTimeout) { clearTimeout(kToastTimeout); kToastTimeout = null; }
});

// ============================================================
// 13. IMPROVVISAZIONE
// ============================================================
function openImprov() {
    showView('view-improv');
    applySectionHeader('view-improv', 'improvvisazione', 'improv-title-text');
    if (!window._improvRendered) { iBuildKeyboard(); window._improvRendered = true; }
    iRender();
}

const jazzProgressions = [
    [{ name: "D min 7", displayTones: "D - F - A - C", lhNotes: [38,41,45,48], rhTargets: [62,65,69,72,74,77,81,84], rhPassing: [60,64,67,71,76,79,83], scaleName: "Re Dorico", lick: "Inizia sulla 9a (Mi) e scendi sul Do passando dal Sib (approccio cromatico)." },
    { name: "G 7", displayTones: "G - B - D - F", lhNotes: [43,47,50,53], rhTargets: [62,65,67,71,74,77,79,83], rhPassing: [60,64,69,73,76,81,84], scaleName: "Sol Misolidio", lick: "Risolvi puntando sul Fa (7a) o sul Si (3a)." },
    { name: "C maj 7", displayTones: "C - E - G - B", lhNotes: [48,52,55,59], rhTargets: [60,64,67,71,72,76,79,83], rhPassing: [62,65,69,74,77,81,84], scaleName: "Do Maggiore", lick: "Fraseggia per terze: Mi - Sol - Si - Re (arpeggio Em7)." },
    { name: "A 7", displayTones: "A - C# - E - G", lhNotes: [45,49,52,55], rhTargets: [61,64,67,69,73,76,79,81], rhPassing: [62,65,70,74,77,82], scaleName: "La Dominante", lick: "Usa il Do naturale come passaggio cromatico verso Do#." }
], [
    { name: "C maj 7", displayTones: "C - E - G - B", lhNotes: [48,52,55,59], rhTargets: [60,64,67,71,72,76,79,83], rhPassing: [62,65,69,74,77,81,84], scaleName: "Do Maggiore", lick: "Linea ascendente dal Do4 al Sol4 e Si4." },
    { name: "A min 7", displayTones: "A - C - E - G", lhNotes: [45,48,52,55], rhTargets: [60,64,67,69,72,76,79,81], rhPassing: [62,65,71,74,77,83], scaleName: "La Eolio", lick: "Pentatonica minore di La, ritmo sincopato." },
    { name: "D min 7", displayTones: "D - F - A - C", lhNotes: [38,41,45,48], rhTargets: [62,65,69,72,74,77,81,84], rhPassing: [60,64,67,71,76,79,83], scaleName: "Re Dorico", lick: "Arpeggio di Fa maggiore sulla mano destra." },
    { name: "G 7", displayTones: "G - B - D - F", lhNotes: [43,47,50,53], rhTargets: [62,65,67,71,74,77,79,83], rhPassing: [60,64,69,73,76,81,84], scaleName: "Sol Misolidio", lick: "Scendi cromaticamente da Fa a Mi per il Cmaj7." }
], [
    { name: "B m7 (b5)", displayTones: "B - D - F - A", lhNotes: [47,50,53,57], rhTargets: [62,65,69,71,74,77,81,83], rhPassing: [60,64,67,72,76,79,84], scaleName: "Si Locrio", lick: "Insisti sulla quinta diminuita (Fa)." },
    { name: "E 7 (b9)", displayTones: "E - G# - B - D", lhNotes: [40,44,47,50], rhTargets: [62,64,68,71,74,76,80,83], rhPassing: [61,65,67,69,73,77,79,81,85], scaleName: "Mi Alterata", lick: "Arpeggio diminuito da Sol# (G# - B - D - F)." },
    { name: "A min 7", displayTones: "A - C - E - G", lhNotes: [45,48,52,55], rhTargets: [60,64,67,69,72,76,79,81], rhPassing: [62,65,71,74,77,83], scaleName: "La Dorico", lick: "Tocca il Fa# (6a) per un sapore Dorico." },
    { name: "A min 7", displayTones: "A - C - E - G", lhNotes: [45,48,52,55], rhTargets: [60,64,67,69,72,76,79,81], rhPassing: [62,65,71,74,77,83], scaleName: "La Minore Naturale", lick: "Scala discendente pulita dal Mi alto alla tonica La." }
], [
    { name: "D min 7", displayTones: "F - C (b3 - b7)", lhNotes: [48,53], rhTargets: [62,69,74,81], rhPassing: [60,64,65,67,71], scaleName: "Re Dorico", lick: "Target: La (5ª chord tone). Basso: Re → La (colore)." },
    { name: "D min 7", displayTones: "F - C (b3 - b7)", lhNotes: [48,53], rhTargets: [62,65,74,77], rhPassing: [60,64,67,69,71], scaleName: "Re Dorico", lick: "Approccio cromatico/diatonico verso Sol. Basso: Re → Fa (sale a Sol)." },
    { name: "G 7", displayTones: "F - B (b7 - 3)", lhNotes: [53,59], rhTargets: [62,67,74,79], rhPassing: [60,64,65,69,71], scaleName: "Sol Misolidio", lick: "Target: Re (5ª). Basso: Sol → Re (colore)." },
    { name: "G 7", displayTones: "F - B (b7 - 3)", lhNotes: [53,59], rhTargets: [67,71,79,83], rhPassing: [60,62,64,65,69], scaleName: "Sol Misolidio", lick: "Risoluzione Si (3ª) → Do. Basso: Sol → Si (sale a Do)." },
    { name: "C maj 7", displayTones: "E - B (3 - 7)", lhNotes: [52,59], rhTargets: [60,67,72,79], rhPassing: [62,64,65,69,71], scaleName: "Do Ionio (Maggiore)", lick: "Target: Sol (5ª). Basso: Do → Sol (colore)." },
    { name: "C maj 7", displayTones: "E - B (3 - 7)", lhNotes: [52,59], rhTargets: [60,64,72,76], rhPassing: [62,65,67,69,71], scaleName: "Arpeggio Cmaj7", lick: "Arrivo prioritario sulla 3ª (Mi). Basso: Mi → Do (colore)." },
    { name: "C maj 7", displayTones: "E - B (3 - 7)", lhNotes: [52,59], rhTargets: [60,69,72,81], rhPassing: [62,64,67], scaleName: "Do Pentatonica Maggiore", lick: "Focus su La (6ª) per colore soft-jazz. Basso: Sol → La (colore)." },
    { name: "C maj 7", displayTones: "E - B (3 - 7)", lhNotes: [52,59], rhTargets: [60,67,72,79], rhPassing: [62,64,65,69,71], scaleName: "Do Ionio (Maggiore)", lick: "Preparazione al cambio di tonalità. Basso: Do → Sol (resta stabile)." },
    { name: "C 7", displayTones: "E - Bb (3 - b7)", lhNotes: [52,58], rhTargets: [60,70,72,82], rhPassing: [62,64,65,67,69], scaleName: "Do Misolidio (mod.)", lick: "Modulazione: tensione su Sib (b7). Basso: Do → Sib (scende a Sol)." },
    { name: "G min 7", displayTones: "F - Bb (b7 - b3)", lhNotes: [53,58], rhTargets: [67,70,79,82], rhPassing: [60,62,64,65,69], scaleName: "Sol Dorico", lick: "Target: Sib (b3). Basso: Sol → Re (colore)." },
    { name: "G min 7", displayTones: "F - Bb (b7 - b3)", lhNotes: [53,58], rhTargets: [67,70,79,82], rhPassing: [60,62,64,65,69], scaleName: "Sol Dorico", lick: "Spinta melodica Sib → Do. Basso: Sol → Sib (sale a Do)." },
    { name: "C 7", displayTones: "E - Bb (3 - b7)", lhNotes: [52,58], rhTargets: [60,67,72,79], rhPassing: [62,64,65,69,70], scaleName: "Do Misolidio", lick: "Target: Sol (5ª). Basso: Do → Sol (colore)." },
    { name: "C 7", displayTones: "E - Bb (3 - b7)", lhNotes: [52,58], rhTargets: [60,70,72,82], rhPassing: [62,64,65,67,69], scaleName: "Do Misolidio", lick: "Sib (b7) risolve su La (3ª di Fa). Basso: Do → Sib (scende a La)." },
    { name: "F maj 7", displayTones: "E - A (7 - 3)", lhNotes: [52,57], rhTargets: [65,69,77,81], rhPassing: [60,62,64,67,70], scaleName: "Fa Ionio", lick: "Target: La (3ª). Basso: Fa → Do (colore)." },
    { name: "F maj 7", displayTones: "E - A (7 - 3)", lhNotes: [52,57], rhTargets: [65,69,77,81], rhPassing: [60,67,70], scaleName: "Arpeggio Fmaj7", lick: "Enfasi sulla 3ª (La). Basso: La → Fa (colore/tonica)." },
    { name: "F maj 7", displayTones: "E - A (7 - 3)", lhNotes: [52,57], rhTargets: [62,65,74,77], rhPassing: [60,67,69], scaleName: "Fa Pentatonica Maggiore", lick: "Colore con Re (6ª). Basso: Do → Re (colore)." },
    { name: "F maj 7", displayTones: "E - A (7 - 3)", lhNotes: [52,57], rhTargets: [65,72,77,84], rhPassing: [62,67,69,70], scaleName: "Fa Ionio", lick: "Riposo armonico su Fa. Basso: Fa → Do (stabile)." },
    { name: "G 7", displayTones: "F - B (b7 - 3)", lhNotes: [53,59], rhTargets: [65,67,77,79], rhPassing: [60,62,64,69,71], scaleName: "Sol Misolidio", lick: "Dominante secondaria, transizione. Basso: Sol → Fa (scende a Mi)." },
    { name: "A 7 (Turnaround)", displayTones: "G - C# (b7 - 3)", lhNotes: [49,55], rhTargets: [61,69,73,81], rhPassing: [64,65,67,70], scaleName: "La Misolidio (b9 b13)", lick: "Do# (sensibile) spinge forte al Re- di battuta 1. Basso: La → Mi / Do#." }
]];

// Nomi personalizzati per alcune progressioni jazz (se assente, si usa l'etichetta generica "Jazz #N")
const jazzProgressionNames = ['', '', '', 'ii-V-I · Do → Fa (19 battute)'];

const bluesProgressions = [
    [{ name: "C 7", displayTones: "C - E - G - Bb", lhNotes: [36,40,43,46], rhTargets: [60,67,70,72,79,82,84], rhPassing: [63,65,66,75,77,78], scaleName: "Do Blues Scale", lick: "Insisti su tonica e settima minore (Sib)." },
    { name: "C 7", displayTones: "C - E - G - Bb", lhNotes: [36,40,43,46], rhTargets: [60,67,70,72,79,82,84], rhPassing: [63,65,66,75,77,78], scaleName: "Do Blues Scale", lick: "Call & response: rispondi al bar 1." },
    { name: "C 7", displayTones: "C - E - G - Bb", lhNotes: [36,40,43,46], rhTargets: [60,67,70,72,79,82,84], rhPassing: [63,65,66,75,77,78], scaleName: "Do Blues Scale", lick: "Scivola da Mib a Mi naturale (blue note)." },
    { name: "C 7", displayTones: "C - E - G - Bb", lhNotes: [36,40,43,46], rhTargets: [60,67,70,72,79,82,84], rhPassing: [63,65,66,75,77,78], scaleName: "Do Blues Scale", lick: "Prepara il cambio con una nota lunga (Sol o Sib)." },
    { name: "F 7", displayTones: "F - A - C - Eb", lhNotes: [41,45,48,51], rhTargets: [60,63,65,72,75,77,84], rhPassing: [66,67,70,78,79,82], scaleName: "Do Blues Scale", lick: "Il IV grado: Mib diventa settima di Fa7." },
    { name: "F 7", displayTones: "F - A - C - Eb", lhNotes: [41,45,48,51], rhTargets: [60,63,65,72,75,77,84], rhPassing: [66,67,70,78,79,82], scaleName: "Do Blues Scale", lick: "Aggiungi sesta (Re) o nona (Sol) sopra Fa7." },
    { name: "C 7", displayTones: "C - E - G - Bb", lhNotes: [36,40,43,46], rhTargets: [60,67,70,72,79,82,84], rhPassing: [63,65,66,75,77,78], scaleName: "Do Blues Scale", lick: "Ritorno alla tonica: rilancia il motivo un'ottava sopra." },
    { name: "C 7", displayTones: "C - E - G - Bb", lhNotes: [36,40,43,46], rhTargets: [60,67,70,72,79,82,84], rhPassing: [63,65,66,75,77,78], scaleName: "Do Blues Scale", lick: "Costruisci tensione con un trillo incalzante." },
    { name: "G 7", displayTones: "G - B - D - F", lhNotes: [43,47,50,53], rhTargets: [65,67,77,79], rhPassing: [60,63,66,70,72,75,78,82,84], scaleName: "Do Blues Scale", lick: "Il V grado: usa Fa e Sol come ancore." },
    { name: "F 7", displayTones: "F - A - C - Eb", lhNotes: [41,45,48,51], rhTargets: [60,63,65,72,75,77,84], rhPassing: [66,67,70,78,79,82], scaleName: "Do Blues Scale", lick: "Quick four: torna al IV per il colore." },
    { name: "C 7", displayTones: "C - E - G - Bb", lhNotes: [36,40,43,46], rhTargets: [60,67,70,72,79,82,84], rhPassing: [63,65,66,75,77,78], scaleName: "Do Blues Scale", lick: "Penultima: rilassa la frase sulla tonica." },
    { name: "G 7", displayTones: "G - B - D - F", lhNotes: [43,47,50,53], rhTargets: [65,67,77,79], rhPassing: [60,63,66,70,72,75,78,82,84], scaleName: "Do Blues Scale", lick: "Turnaround: chiudi con un lick discendente." }
], [
    { name: "G 7", displayTones: "G - B - D - F", lhNotes: [43,47,50,53], rhTargets: [62,65,67,74,77,79], rhPassing: [60,61,70,72,73,82,84], scaleName: "Sol Blues Scale", lick: "Apri sul Sol, usa Sol e Fa come ancore." },
    { name: "C 7", displayTones: "C - E - G - Bb", lhNotes: [36,40,43,46], rhTargets: [60,67,70,72,79,82,84], rhPassing: [61,62,65,73,74,77], scaleName: "Sol Blues Scale", lick: "Quick change: Sol, Do, Sib come appoggi." },
    { name: "G 7", displayTones: "G - B - D - F", lhNotes: [43,47,50,53], rhTargets: [62,65,67,74,77,79], rhPassing: [60,61,70,72,73,82,84], scaleName: "Sol Blues Scale", lick: "Rispondi al bar 2 con una frase a specchio." },
    { name: "G 7", displayTones: "G - B - D - F", lhNotes: [43,47,50,53], rhTargets: [62,65,67,74,77,79], rhPassing: [60,61,70,72,73,82,84], scaleName: "Sol Blues Scale", lick: "Sincopa l'ultima battuta di tonica." },
    { name: "C 7", displayTones: "C - E - G - Bb", lhNotes: [36,40,43,46], rhTargets: [60,67,70,72,79,82,84], rhPassing: [61,62,65,73,74,77], scaleName: "Sol Blues Scale", lick: "Sezione del IV: frasi lunghe e legate." },
    { name: "C 7", displayTones: "C - E - G - Bb", lhNotes: [36,40,43,46], rhTargets: [60,67,70,72,79,82,84], rhPassing: [61,62,65,73,74,77], scaleName: "Sol Blues Scale", lick: "Tensione cromatica da Reb a Re naturale." },
    { name: "G 7", displayTones: "G - B - D - F", lhNotes: [43,47,50,53], rhTargets: [62,65,67,74,77,79], rhPassing: [60,61,70,72,73,82,84], scaleName: "Sol Blues Scale", lick: "Ritorno a casa: motivo iniziale un'ottava sopra." },
    { name: "G 7", displayTones: "G - B - D - F", lhNotes: [43,47,50,53], rhTargets: [62,65,67,74,77,79], rhPassing: [60,61,70,72,73,82,84], scaleName: "Sol Blues Scale", lick: "Lascia un vuoto ritmico prima del turnaround." },
    { name: "D 7", displayTones: "D - F# - A - C", lhNotes: [38,42,45,48], rhTargets: [60,62,72,74,84], rhPassing: [61,65,67,70,73,77,79,82], scaleName: "Sol Blues Scale", lick: "Il V grado: la frizione con Fa# fa cantare il blues." },
    { name: "C 7", displayTones: "C - E - G - Bb", lhNotes: [36,40,43,46], rhTargets: [60,67,70,72,79,82,84], rhPassing: [61,62,65,73,74,77], scaleName: "Sol Blues Scale", lick: "Quick four: ultimo tocco di colore." },
    { name: "G 7", displayTones: "G - B - D - F", lhNotes: [43,47,50,53], rhTargets: [62,65,67,74,77,79], rhPassing: [60,61,70,72,73,82,84], scaleName: "Sol Blues Scale", lick: "Torna sulla tonica con calma." },
    { name: "D 7", displayTones: "D - F# - A - C", lhNotes: [38,42,45,48], rhTargets: [60,62,72,74,84], rhPassing: [61,65,67,70,73,77,79,82], scaleName: "Sol Blues Scale", lick: "Turnaround finale: sale da Fa a Sol." }
]];

let iStyle = 'jazz';
let iProgIdx = 0;
let iMeasure = 0;
let iBeat = 0;
let iPlaying = false;
let iBpm = 75;
let iNextNoteTime = 0;
let iTimerId = null;
let iAudioCtx = null;
const iLookahead = 25;
const iScheduleAhead = 0.1;

function iGetProg() {
    const data = iStyle === 'jazz' ? jazzProgressions : bluesProgressions;
    return data[iProgIdx] || data[0];
}

function iRender() {
    const prog = iGetProg();
    const sel = document.getElementById('improvSelect');
    const data = iStyle === 'jazz' ? jazzProgressions : bluesProgressions;
    sel.innerHTML = data.map((p, idx) => {
        const customName = iStyle === 'jazz' && jazzProgressionNames[idx] ? jazzProgressionNames[idx] : `${iStyle === 'jazz' ? 'Jazz' : 'Blues'} #${idx+1} (${p.length} acc.)`;
        return `<option value="${idx}" ${idx === iProgIdx ? 'selected' : ''}>${customName}</option>`;
    }).join('');
    sel.onchange = function() {
        iProgIdx = parseInt(this.value);
        iMeasure = 0;
        iBeat = 0;
        if (iPlaying) { iStopPlay(); }
        iRenderChords();
        iUpdateUI(0, 0);
    };

    document.getElementById('improvTitle').textContent = iStyle === 'jazz' ? 'Jazz Practice Station V4' : 'Blues Practice Station';
    document.getElementById('improvSubtitle').textContent = iStyle === 'jazz' ? 'Studio Accordi Manuale + Idee Fraseggio Lick' : 'Scala Blues Fissa + Target/Passing Dinamici + Call & Response';

    const legend = document.getElementById('improvLegend');
    if (iStyle === 'jazz') {
        legend.innerHTML = `<div class="item"><span class="color accent"></span> LH: 3a &amp; 7a (shell voicing)</div>
          <div class="item"><span class="color accent-soft"></span> RH: Target Tones</div>
          <div class="item"><span class="color accent-soft" style="background:transparent;border:2px solid var(--accent);"></span> RH: Passing Tones</div>`;
    } else {
        legend.innerHTML = `<div class="item"><span class="color accent"></span> LH: 3a &amp; 7a (shell voicing)</div>
          <div class="item"><span class="color accent-soft"></span> RH: Target (note della blues scale sull'accordo)</div>
          <div class="item"><span class="color accent-soft" style="background:transparent;border:2px solid var(--accent);"></span> RH: Passing (altre note della blues scale)</div>`;
    }

    document.getElementById('improvGuideText').innerHTML = iStyle === 'jazz' ?
        `<p>Clicca su una scheda accordo per visualizzare note, scale e lick sulla tastiera, anche a riproduzione ferma.</p>
        <ul><li><strong>Mano Sinistra:</strong> 3a e 7a dell'accordo (shell voicing).</li>
        <li><strong>Mano Destra:</strong> Target Tones (note dell'accordo) e Passing Tones (note di passaggio della scala).</li>
        <li><strong>Lick:</strong> idee di fraseggio contestuali all'accordo selezionato.</li></ul>` :
        `<p>Clicca su una scheda accordo per visualizzare note, scala e lick sulla tastiera, anche a riproduzione ferma.</p>
        <ul><li><strong>Scala fissa sulla tonica:</strong> la scala suggerita NON cambia ad ogni accordo. Resta sempre la blues scale della tonica.</li>
        <li><strong>Target/Passing:</strong> Target = note della blues scale che coincidono con l'accordo corrente. Passing = le altre note.</li>
        <li><strong>12 battute reali:</strong> ogni giro riproduce un chorus completo.</li></ul>`;

    iRenderChords();
    iUpdateUI(0, 0);
    iUpdateBpmDisplay();
}

function iRenderChords() {
    const container = document.getElementById('improvChords');
    container.innerHTML = '';
    const prog = iGetProg();
    prog.forEach((chord, idx) => {
        const card = document.createElement('div');
        card.className = 'improv-chord-card';
        card.dataset.idx = idx;
        card.innerHTML = `<div class="name">${chord.name}</div><div class="tones">${chord.displayTones}</div>`;
        card.addEventListener('click', () => {
            if (!iPlaying) { iMeasure = idx; iBeat = 0; iUpdateUI(0, idx); }
        });
        container.appendChild(card);
    });
}

function iUpdateUI(beat, measure) {
    const prog = iGetProg();
    if (!prog[measure]) measure = 0;
    document.querySelectorAll('.improv-beat-dot').forEach((dot, idx) => {
        if (iPlaying) { dot.className = `improv-beat-dot${idx === beat ? ' active' : ''}${(idx === beat && beat === 0) ? ' downbeat' : ''}`; }
        else { dot.className = 'improv-beat-dot'; }
    });
    document.querySelectorAll('.improv-chord-card').forEach((card, idx) => {
        card.classList.toggle('active', idx === measure);
    });
    const chord = prog[measure];
    document.getElementById('improvChordName').textContent = chord.name;
    document.getElementById('improvLH').textContent = chord.displayTones;
    document.getElementById('improvRH').textContent = chord.scaleName;
    document.getElementById('improvLickText').textContent = chord.lick;
    iUpdateKeyboard(chord);
}

function iUpdateKeyboard(chord) {
    const keys = document.querySelectorAll('.improv-key');
    keys.forEach(k => {
        k.className = `improv-key ${k.dataset.black === 'true' ? 'black' : 'white'}`;
        if (k.dataset.label) { k.innerHTML = `<span class="label">${k.dataset.label}</span>`; }
        else { k.innerHTML = ''; }
    });
    chord.lhNotes.forEach(m => { const el = document.querySelector(`.improv-key[data-midi="${m}"]`); if (el) el.classList.add('lh-chord'); });
    chord.rhTargets.forEach(m => { const el = document.querySelector(`.improv-key[data-midi="${m}"]`); if (el) el.classList.add('rh-target'); });
    chord.rhPassing.forEach(m => { const el = document.querySelector(`.improv-key[data-midi="${m}"]`); if (el) el.classList.add('rh-passing'); });
}

function iBuildKeyboard() {
    const kb = document.getElementById('improvKeyboard');
    kb.innerHTML = '';
    const startMidi = 36, endMidi = 84;
    const blackOffsets = [1,3,6,8,10];
    function isBlack(m) { return blackOffsets.includes(m % 12); }
    for (let m = startMidi; m <= endMidi; m++) {
        const key = document.createElement('div');
        const black = isBlack(m);
        key.className = `improv-key ${black ? 'black' : 'white'}`;
        key.dataset.midi = m;
        key.dataset.black = black ? 'true' : 'false';
        let label = '';
        if (m === 36) label = 'C2';
        else if (m === 48) label = 'C3';
        else if (m === 60) label = 'C4';
        else if (m === 72) label = 'C5';
        else if (m === 84) label = 'C6';
        if (label) { key.dataset.label = label; key.innerHTML = `<span class="label">${label}</span>`; }
        kb.appendChild(key);
    }
}

function iNextNote() {
    const secPerBeat = 60.0 / iBpm;
    iNextNoteTime += secPerBeat;
    iBeat = (iBeat + 1) % 4;
    if (iBeat === 0) {
        const prog = iGetProg();
        iMeasure = (iMeasure + 1) % prog.length;
    }
}

function iPlayCymbal(time, isDownbeat, isUpbeatTriplet) {
    if (!iAudioCtx) return;
    const bufSize = iAudioCtx.sampleRate * 0.15;
    const buf = iAudioCtx.createBuffer(1, bufSize, iAudioCtx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) { data[i] = Math.random() * 2 - 1; }
    const noise = iAudioCtx.createBufferSource();
    noise.buffer = buf;
    const filter = iAudioCtx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 7500;
    const gain = iAudioCtx.createGain();
    let vol = 0.03;
    if (isDownbeat) vol = 0.06;
    if (isUpbeatTriplet) vol = 0.02;
    gain.gain.setValueAtTime(vol, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + (isUpbeatTriplet ? 0.05 : 0.12));
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(iAudioCtx.destination);
    noise.start(time);
    noise.stop(time + 0.15);
}

function iScheduleNote(beatNum, time) {
    const secPerBeat = 60.0 / iBpm;
    iPlayCymbal(time, beatNum === 0 || beatNum === 2, false);
    if (beatNum === 1 || beatNum === 3) {
        const tripletTime = time + (secPerBeat * 0.667);
        iPlayCymbal(tripletTime, false, true);
    }
    const osc = iAudioCtx.createOscillator();
    const g = iAudioCtx.createGain();
    osc.connect(g);
    g.connect(iAudioCtx.destination);
    osc.frequency.value = beatNum === 0 ? 550 : 280;
    g.gain.setValueAtTime(beatNum === 0 ? 0.03 : 0.008, time);
    g.gain.exponentialRampToValueAtTime(0.001, time + 0.04);
    osc.start(time);
    osc.stop(time + 0.05);
    setTimeout(() => { iUpdateUI(beatNum, iMeasure); }, (time - iAudioCtx.currentTime) * 1000);
}

function iScheduler() {
    while (iNextNoteTime < iAudioCtx.currentTime + iScheduleAhead) {
        iScheduleNote(iBeat, iNextNoteTime);
        iNextNote();
    }
    iTimerId = setTimeout(iScheduler, iLookahead);
}

function iStopPlay() {
    iPlaying = false;
    document.getElementById('improvPlayBtn').textContent = 'START';
    document.getElementById('improvPlayBtn').classList.remove('playing');
    clearTimeout(iTimerId);
    iUpdateUI(0, iMeasure);
}

document.getElementById('improvPlayBtn').addEventListener('click', () => {
    if (!iAudioCtx) { iAudioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
    if (iPlaying) { iStopPlay(); return; }
    iPlaying = true;
    document.getElementById('improvPlayBtn').textContent = 'STOP';
    document.getElementById('improvPlayBtn').classList.add('playing');
    iBeat = 0;
    iMeasure = 0;
    iNextNoteTime = iAudioCtx.currentTime + 0.05;
    iScheduler();
});

document.getElementById('improvBpm').addEventListener('input', (e) => {
    iBpm = parseInt(e.target.value);
    iUpdateBpmDisplay();
});

function iUpdateBpmDisplay() {
    document.getElementById('improvBpmVal').textContent = `${iBpm} BPM`;
}

document.querySelectorAll('.improv-nav-link').forEach(link => {
    link.addEventListener('click', () => {
        const style = link.dataset.style;
        if (style === iStyle) return;
        if (iPlaying) iStopPlay();
        iStyle = style;
        document.querySelectorAll('.improv-nav-link').forEach(l => l.classList.remove('active'));
        link.classList.add('active');
        document.getElementById('improvContainer').style.setProperty('--primary', style === 'jazz' ? 'var(--accent)' : 'var(--accent)');
        iProgIdx = 0;
        iMeasure = 0;
        iBeat = 0;
        iRender();
    });
});

// ============================================================
// 14. ARMONIA (Catena Armonica - incorporata direttamente,
//     inizializzata una sola volta al primo accesso alla vista)
// ============================================================
function openArmonia() {
    showView('view-armonia');
    applySectionHeader('view-armonia', 'armonia', 'armonia-title-text');
    if (!window._armoniaInitialized) {
        initArmoniaModule();
        window._armoniaInitialized = true;
    }
}

function initArmoniaModule() {
    const root = document.getElementById('view-armonia');
    const NOTES = ["C","G","D","A","E","B","Gb","Db","Ab","Eb","Bb","F"];
    const SEMI  = { C:0,G:7,D:2,A:9,E:4,B:11,Gb:6,Db:1,Ab:8,Eb:3,Bb:10,F:5 };
    const N = NOTES.length;
    const acx=400, acy=400;
    const RADIUS = { minor:110, aug:180, dom7:250, major:320 };
    const NODE_R = { minor:20, aug:18, dom7:20, major:24 };
    const RING_COLOR = { minor:"--arm-relminor", aug:"--arm-aug", dom7:"--arm-dom7", major:"--arm-major" };
    function armLabel(type,i){ if(type==="major") return NOTES[i]; if(type==="minor") return NOTES[i]+"m"; if(type==="dom7") return NOTES[i]+"7"; if(type==="aug") return NOTES[i]+"aug"; }
    function semiOf(i){ return SEMI[NOTES[i]]; }
    function indexOfSemi(target){ for(let i=0;i<N;i++) if(semiOf(i)===target) return i; return -1; }
    function angleFor(i){ return (-90+i*(360/N))*Math.PI/180; }
    function armPos(type,i){ const a=angleFor(i); return { x: acx+RADIUS[type]*Math.cos(a), y: acy+RADIUS[type]*Math.sin(a) }; }
    function curvePath(p1,p2){ const mx=(p1.x+p2.x)/2, my=(p1.y+p2.y)/2; const dx=mx-acx, dy=my-acy, pull=0.18; return `M ${p1.x} ${p1.y} Q ${mx-dx*pull} ${my-dy*pull} ${p2.x} ${p2.y}`; }
    const edges=[]; const seenPairs=new Set();
    function pairKey(a,b,t){ return [a,b].sort().join("|")+"|"+t; }
    for(let i=0;i<N;i++){
        const majTarget=indexOfSemi((semiOf(i)+5)%12);
        edges.push({ a:"dom7-"+i, b:"major-"+majTarget, color:"--arm-dom7", arrow:true });
        const relTarget=indexOfSemi((semiOf(i)-3+12)%12);
        const k1=pairKey("major-"+i,"minor-"+relTarget,"rel");
        if(!seenPairs.has(k1)){ seenPairs.add(k1); edges.push({ a:"major-"+i, b:"minor-"+relTarget, color:"--arm-relminor" }); }
        const k2=pairKey("major-"+i,"minor-"+i,"par");
        if(!seenPairs.has(k2)){ seenPairs.add(k2); edges.push({ a:"major-"+i, b:"minor-"+i, color:"--arm-parminor" }); }
        const domTarget=indexOfSemi((semiOf(i)+5)%12);
        edges.push({ a:"minor-"+i, b:"dom7-"+domTarget, color:"--arm-iiv", arrow:true });
        const subdomTarget=indexOfSemi((semiOf(i)+5)%12);
        const kSub=pairKey("major-"+i,"major-"+subdomTarget,"subdom");
        if(!seenPairs.has(kSub)){ seenPairs.add(kSub); edges.push({ a:"major-"+i, b:"major-"+subdomTarget, color:"--arm-subdom" }); }
        const submedTarget=indexOfSemi((semiOf(i)+8)%12);
        const kSubmed=pairKey("minor-"+i,"major-"+submedTarget,"submed");
        if(!seenPairs.has(kSubmed)){ seenPairs.add(kSubmed); edges.push({ a:"minor-"+i, b:"major-"+submedTarget, color:"--arm-submediant" }); }
        [4,8].forEach(step=>{
            const sib=indexOfSemi((semiOf(i)+step)%12);
            const k=pairKey("aug-"+i,"aug-"+sib,"augsib");
            if(!seenPairs.has(k)){ seenPairs.add(k); edges.push({ a:"aug-"+i, b:"aug-"+sib, color:"--arm-aug", dashed:true }); }
        });
        const k3=pairKey("aug-"+i,"major-"+i,"augbuilt");
        if(!seenPairs.has(k3)){ seenPairs.add(k3); edges.push({ a:"aug-"+i, b:"major-"+i, color:"--arm-aug" }); }
        const trit=indexOfSemi((semiOf(i)+6)%12);
        const k4=pairKey("dom7-"+i,"dom7-"+trit,"tritone");
        if(!seenPairs.has(k4)){ seenPairs.add(k4); edges.push({ a:"dom7-"+i, b:"dom7-"+trit, color:"--arm-tritone", dashed:true }); }
    }
    const adjacency={};
    function addAdj(a,b){ if(!adjacency[a]) adjacency[a]=new Set(); if(!adjacency[b]) adjacency[b]=new Set(); adjacency[a].add(b); adjacency[b].add(a); }
    edges.forEach(e=> addAdj(e.a,e.b));
    const svgNS2="http://www.w3.org/2000/svg";
    const svg2=document.getElementById("arm-wheel");
    const defs2=document.createElementNS(svgNS2,"defs");
    defs2.innerHTML = '<marker id="arrow-arm-dom7" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="var(--arm-dom7)"/></marker><marker id="arrow-arm-iiv" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="var(--arm-iiv)"/></marker>';
    svg2.appendChild(defs2);
    const edgesLayer=document.createElementNS(svgNS2,"g");
    const nodesLayer=document.createElementNS(svgNS2,"g");
    svg2.appendChild(edgesLayer); svg2.appendChild(nodesLayer);
    const nodeMeta={}; const nodeEls={};
    function typeOf(key){ return key.split("-")[0]; }
    function idxOf(key){ return parseInt(key.split("-")[1],10); }
    ["minor","aug","dom7","major"].forEach(type=>{
        for(let i=0;i<N;i++){
            const key=type+"-"+i;
            const p=armPos(type,i);
            nodeMeta[key]=p;
            const g=document.createElementNS(svgNS2,"g");
            g.setAttribute("class","arm-node arm-idle");
            g.dataset.key=key;
            const col=getComputedStyle(root).getPropertyValue(RING_COLOR[type]).trim();
            g.style.color=col;
            const c=document.createElementNS(svgNS2,"circle");
            c.setAttribute("cx",p.x); c.setAttribute("cy",p.y);
            c.setAttribute("r",NODE_R[type]);
            c.setAttribute("stroke",col);
            g.appendChild(c);
            const t=document.createElementNS(svgNS2,"text");
            t.setAttribute("x",p.x); t.setAttribute("y",p.y);
            t.setAttribute("font-size", type==="major"?15:12.5);
            t.textContent=armLabel(type,i);
            g.appendChild(t);
            g.addEventListener("click",()=>onNodeClick(key));
            nodesLayer.appendChild(g);
            nodeEls[key]=g;
        }
    });
    edges.forEach(e=>{
        const p1=nodeMeta[e.a], p2=nodeMeta[e.b];
        const path=document.createElementNS(svgNS2,"path");
        path.setAttribute("d",curvePath(p1,p2));
        const col=getComputedStyle(root).getPropertyValue(e.color).trim();
        path.setAttribute("stroke",col);
        path.setAttribute("stroke-width","1.6");
        path.setAttribute("class","arm-edge");
        if(e.dashed) path.setAttribute("stroke-dasharray","3 4");
        if(e.arrow) path.setAttribute("marker-end", "url(#arrow-arm-"+e.color.replace("--arm-","")+")");
        path.dataset.a=e.a; path.dataset.b=e.b;
        edgesLayer.appendChild(path);
    });
    const PRESETS = [
        { title:"🚀 Sci-Fi Ambient", chords:["Am","D7","G","Em"] },
        { title:"🛸 Sci-Fi Deep Space", chords:["Caug","Eaug","Abaug","Caug"] },
        { title:"🎷 Jazz Smooth / Noir", chords:["Am","E7","Bb7","B"] },
        { title:"🎹 Jazz Modal Voyage (ii-V-I)", chords:["Dm","G7","C","Am"] },
        { title:"🎸 Blues / Gospel Soft", chords:["C","Am","F","E7"] },
        { title:"🥃 Neo-Noir Blues", chords:["Cm","F7","Bb7","Ab"] },
        { title:"🍷 Malinconia Cantautorale", chords:["Am","F","C","E7"] },
        { title:"🌙 Onirico Cinematografico", chords:["C","Caug","C","Fm"] },
        { title:"⚔️ Epico / Eroico", chords:["Am","F","C","G"] },
        { title:"🤘 Metal Oscuro", chords:["Em","C","Bb7","Em"] }
    ];
    function keyFromLabel(lbl){
        let type, root2;
        if(lbl.endsWith("aug")){ type="aug"; root2=lbl.slice(0,-3); }
        else if(lbl.endsWith("7")){ type="dom7"; root2=lbl.slice(0,-1); }
        else if(lbl.endsWith("m")){ type="minor"; root2=lbl.slice(0,-1); }
        else { type="major"; root2=lbl; }
        const idx = NOTES.indexOf(root2);
        return type+"-"+idx;
    }
    const presetSelect = document.getElementById("arm-presetSelect");
    PRESETS.forEach((p,idx)=>{ const opt=document.createElement("option"); opt.value = idx; opt.textContent = p.title+"  ("+p.chords.join(" → ")+")"; presetSelect.appendChild(opt); });
    presetSelect.addEventListener("change",()=>{ const p = PRESETS[presetSelect.value]; if(!p) return; chain = p.chords.map(keyFromLabel); render(); });
    let chain = [];
    const chainPathLayer=document.createElementNS(svgNS2,"g");
    svg2.appendChild(chainPathLayer);
    function drawChainPathLines(){
        chainPathLayer.innerHTML="";
        for(let i=0;i<chain.length-1;i++){
            const p1=nodeMeta[chain[i]], p2=nodeMeta[chain[i+1]];
            if(!p1||!p2) continue;
            const path=document.createElementNS(svgNS2,"path");
            path.setAttribute("d",curvePath(p1,p2));
            path.setAttribute("stroke","#E5E7EB");
            path.setAttribute("stroke-width","3");
            path.setAttribute("fill","none");
            path.setAttribute("opacity","0.85");
            chainPathLayer.appendChild(path);
        }
    }
    const SHARP_CHROMATIC = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
    const FLAT_CHROMATIC  = ["C","Db","D","Eb","E","F","Gb","G","Ab","A","Bb","B"];
    const FLAT_ROOTS = new Set(["F","Bb","Eb","Ab","Db","Gb"]);
    function getNoteAtInterval(rootNote, semitones){
        const table = FLAT_ROOTS.has(rootNote) ? FLAT_CHROMATIC : SHARP_CHROMATIC;
        const startIdx = table.indexOf(rootNote);
        if(startIdx===-1) return "";
        return table[(startIdx+semitones)%12];
    }
    function computeVoicings(type, rootNote){
        const m3=getNoteAtInterval(rootNote,3), M3=getNoteAtInterval(rootNote,4);
        const p4=getNoteAtInterval(rootNote,5), p5=getNoteAtInterval(rootNote,7);
        const a5=getNoteAtInterval(rootNote,8), M6=getNoteAtInterval(rootNote,9);
        const m7=getNoteAtInterval(rootNote,10), M7=getNoteAtInterval(rootNote,11);
        const M9=getNoteAtInterval(rootNote,2), m9=getNoteAtInterval(rootNote,1);
        const a11=getNoteAtInterval(rootNote,6), M13=getNoteAtInterval(rootNote,9);
        const dim5=getNoteAtInterval(rootNote,6), dim7=getNoteAtInterval(rootNote,9);
        if(type==="major"){
            return [
                { name:"Maj7", notes:rootNote+" - "+M3+" - "+p5+" - "+M7 },
                { name:"Add9 (tranquillo)", notes:rootNote+" - "+M3+" - "+p5+" - "+M9 },
                { name:"6/9 Jazz", notes:rootNote+" - "+M3+" - "+M6+" - "+M9 },
                { name:"sus4 (sospeso)", notes:rootNote+" - "+p4+" - "+p5 },
                { name:"Maj7#11 (lidio)", notes:rootNote+" - "+M3+" - "+p5+" - "+M7+" - "+a11 },
                { name:"Aumentata (aug)", notes:rootNote+" - "+M3+" - "+a5 }
            ];
        }
        if(type==="minor"){
            return [
                { name:"min7", notes:rootNote+" - "+m3+" - "+p5+" - "+m7 },
                { name:"min9 (morbido)", notes:rootNote+" - "+m3+" - "+p5+" - "+m7+" - "+M9 },
                { name:"minMaj7 (noir)", notes:rootNote+" - "+m3+" - "+p5+" - "+M7 },
                { name:"min6", notes:rootNote+" - "+m3+" - "+p5+" - "+M6 },
                { name:"Diminuito 7 (dim7)", notes:rootNote+" - "+m3+" - "+dim5+" - "+dim7 },
                { name:"Semidiminuito (ø)", notes:rootNote+" - "+m3+" - "+dim5+" - "+m7 }
            ];
        }
        if(type==="dom7"){
            return [
                { name:"7 (base)", notes:rootNote+" - "+M3+" - "+p5+" - "+m7 },
                { name:"9 (jazz standard)", notes: rootNote+" - "+M3+" - "+m7+" - "+M9 },
                { name:"13 (smooth jazz)", notes: rootNote+" - "+M3+" - "+m7+" - "+M9+" - "+M13 },
                { name:"7sus4 (urban)", notes:rootNote+" - "+p4+" - "+p5+" - "+m7 },
                { name:"7#5 (aug7, sci-fi)", notes:rootNote+" - "+M3+" - "+a5+" - "+m7 },
                { name:"7b9 (noir/blues)", notes:rootNote+" - "+M3+" - "+m7+" - "+m9 }
            ];
        }
        if(type==="aug"){
            return [
                { name:"Triade aumentata", notes:rootNote+" - "+M3+" - "+a5 },
                { name:"aug7 (spaziale)", notes:rootNote+" - "+M3+" - "+a5+" - "+m7 },
                { name:"Maj7#5 (cinematico)", notes:rootNote+" - "+M3+" - "+a5+" - "+M7 },
                { name:"Lidio #5 esteso", notes:rootNote+" - "+M3+" - "+a5+" - "+M7+" - "+M9+" - "+a11 },
                { name:"Scala esatonale", notes:"toni interi da "+rootNote }
            ];
        }
        return [];
    }
    function renderVoicings(){
        const titleEl = document.getElementById("arm-voicingTitle");
        const subEl = document.getElementById("arm-voicingSub");
        const gridEl = document.getElementById("arm-voicingGrid");
        gridEl.innerHTML = "";
        if(chain.length===0){ titleEl.textContent = "Estensioni & Voicing"; subEl.textContent = "Seleziona un accordo per vedere le sue estensioni (9, 13, sus4, dim, aug7...)."; return; }
        const last = chain[chain.length-1];
        const type = typeOf(last), i = idxOf(last);
        const rootNote = NOTES[i];
        const chordLabel = armLabel(type,i);
        titleEl.textContent = "Estensioni & Voicing per "+chordLabel;
        subEl.textContent = "Note calcolate a partire dalla fondamentale "+rootNote+". Mano sinistra: l'accordo base o fondamentale bassa. Mano destra: le tensioni qui sotto.";
        computeVoicings(type, rootNote).forEach(item=>{
            const div=document.createElement("div");
            div.className="arm-voicing-item";
            div.innerHTML = "<strong>"+item.name+"</strong><div class=\"arm-voicing-notes\">"+item.notes+"</div>";
            gridEl.appendChild(div);
        });
    }
    function render(){
        const last = chain.length ? chain[chain.length-1] : null;
        const availableSet = last ? adjacency[last] : null;
        const chainSet = new Set(chain);
        drawChainPathLines();
        renderVoicings();
        Object.keys(nodeEls).forEach(key=>{
            const g = nodeEls[key];
            g.classList.remove("arm-idle","arm-available","arm-inactive","arm-inchain","arm-current");
            if(chain.length===0){ g.classList.add("arm-idle"); }
            else if(key===last){ g.classList.add("arm-inchain","arm-current"); }
            else if(chainSet.has(key)){ g.classList.add("arm-inchain"); }
            else if(availableSet && availableSet.has(key)){ g.classList.add("arm-available"); }
            else { g.classList.add("arm-inactive"); }
        });
        root.querySelectorAll(".arm-step-badge").forEach(b=>b.remove());
        chain.forEach((key,idx)=>{
            const p = nodeMeta[key];
            const g = document.createElementNS(svgNS2,"g");
            g.setAttribute("class","arm-step-badge");
            const bx = p.x + 16, by = p.y - 16;
            const c = document.createElementNS(svgNS2,"circle");
            c.setAttribute("cx",bx); c.setAttribute("cy",by); c.setAttribute("r",11);
            g.appendChild(c);
            const t = document.createElementNS(svgNS2,"text");
            t.setAttribute("x",bx); t.setAttribute("y",by);
            t.textContent = idx+1;
            g.appendChild(t);
            nodesLayer.appendChild(g);
        });
        edgesLayer.querySelectorAll(".arm-edge").forEach(el=>{
            el.classList.remove("arm-avail","arm-chain");
            const a=el.dataset.a, b=el.dataset.b;
            let isChainEdge=false;
            for(let i=0;i<chain.length-1;i++){
                if((chain[i]===a&&chain[i+1]===b)||(chain[i]===b&&chain[i+1]===a)){ isChainEdge=true; break; }
            }
            if(isChainEdge){ el.classList.add("arm-chain"); return; }
            if(last && ((a===last && availableSet.has(b)) || (b===last && availableSet.has(a)))){
                el.classList.add("arm-avail");
            }
        });
        const statusEl=document.getElementById("arm-status");
        if(chain.length===0){ statusEl.textContent="Clicca un accordo qualsiasi per iniziare la sequenza."; }
        else { const lastLabel = armLabel(typeOf(last), idxOf(last)); statusEl.textContent = "Ultimo accordo: "+lastLabel+". Clicca un vicino in evidenza per continuare, o un accordo già in catena per tornare indietro."; }
        const row=document.getElementById("arm-chainRow");
        row.innerHTML="";
        if(chain.length===0){ row.innerHTML = "<span class=\"arm-empty-chain\">La catena è vuota.</span>"; }
        else {
            chain.forEach((key,idx)=>{
                if(idx>0){ const sep=document.createElement("span"); sep.className="arm-arrow-sep"; sep.textContent="→"; row.appendChild(sep); }
                const chip=document.createElement("div");
                const type=typeOf(key), i=idxOf(key);
                const col=getComputedStyle(root).getPropertyValue(RING_COLOR[type]).trim();
                chip.className="arm-chip";
                chip.style.borderColor=col;
                chip.style.color=col;
                const numSpan = document.createElement("span");
                numSpan.className="arm-chip-num";
                numSpan.textContent = (idx+1)+".";
                chip.appendChild(numSpan);
                chip.appendChild(document.createTextNode(armLabel(type,i)));
                chip.addEventListener("click",()=>{ chain = chain.slice(0, idx+1); document.getElementById("arm-presetSelect").value = ""; render(); });
                row.appendChild(chip);
            });
        }
    }
    function onNodeClick(key){ document.getElementById("arm-presetSelect").value = ""; if(chain.length===0){ chain=[key]; } else { const last=chain[chain.length-1]; if(key===last) return; if(adjacency[last] && adjacency[last].has(key)){ chain.push(key); } else if(chain.includes(key)){ const idx=chain.indexOf(key); chain = chain.slice(0, idx+1); } else { return; } } render(); }
    document.getElementById("arm-undoBtn").addEventListener("click",()=>{ chain.pop(); document.getElementById("arm-presetSelect").value = ""; render(); });
    document.getElementById("arm-resetBtn").addEventListener("click",()=>{ chain=[]; document.getElementById("arm-presetSelect").value = ""; render(); });
    render();
}

// Controllo di sicurezza per evitare il crash se il bottone non è ancora renderizzato
const btnBackArmonia = document.getElementById('btn-back-armonia');
if (btnBackArmonia) {
    btnBackArmonia.addEventListener('click', closeCategory);
}

// ============================================================
// 15. AVVIO FINALE
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    loadData();
    loadTheme();
    if (typeof Metronome !== 'undefined' && Metronome.init) {
        Metronome.init();
    }
    renderHome();

    // Gestione sicura dei pulsanti di ritorno generici
    document.querySelectorAll('.back').forEach(btn => {
        btn.addEventListener('click', closeCategory);
    });

    const themeObserver = new MutationObserver(() => {
        const circleView = document.getElementById('view-circle');
        if (circleView && !circleView.classList.contains('hidden')) {
            if (typeof updateCircleColors === 'function') updateCircleColors();
        }
    });

    if (document.body) {
        themeObserver.observe(document.body, { attributes: true, attributeFilter: ['data-theme'] });
    }
});