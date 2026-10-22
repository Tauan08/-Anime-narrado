/* =========================================================
   Anime Dubber Platform — com persistência (IndexedDB + localStorage)
   + botões de limpeza (vídeo, legenda, tudo)
   + modal próprio de confirmação
   + editor de SRT em tempo real (sincronia manual)
   ========================================================= */

const videoPlayer   = document.getElementById('videoPlayer');
const videoFile     = document.getElementById('videoFile');
const srtFile       = document.getElementById('srtFile');
const voiceSelect   = document.getElementById('voiceSelect');
const rateInput     = document.getElementById('rate');
const rateVal       = document.getElementById('rateVal');
const videoVolume   = document.getElementById('videoVolume');
const videoVolVal   = document.getElementById('videoVolVal');
const voiceVolume   = document.getElementById('voiceVolume');
const voiceVolVal   = document.getElementById('voiceVolVal');
const duckingCheck  = document.getElementById('ducking');
const duckLevel     = document.getElementById('duckLevel');
const duckVal       = document.getElementById('duckVal');
const statusEl      = document.getElementById('status');
const testVoiceBtn  = document.getElementById('testVoice');

const clearVideoBtn = document.getElementById('clearVideoBtn');
const clearSrtBtn   = document.getElementById('clearSrtBtn');
const clearDataBtn  = document.getElementById('clearData');

/* Modal de confirmação próprio */
const confirmOverlay = document.getElementById('confirmOverlay');
const confirmTitle   = document.getElementById('confirmTitle');
const confirmMessage = document.getElementById('confirmMessage');
const confirmCancel  = document.getElementById('confirmCancel');
const confirmOk      = document.getElementById('confirmOk');

let subtitles = [];
let lastSubtitleIndex = -1;
const synth = window.speechSynthesis;
let voices = [];
let currentUtterance = null;
let pendingVoiceURI = '';

/* ---------- Web Audio API ---------- */
let audioCtx = null;
let videoSource = null;
let videoGain = null;
let audioInitialized = false;

/* =========================================================
   1) PERSISTÊNCIA — chaves e helpers
   ========================================================= */
const LS_KEY     = 'animeDubber.state.v1';
const DB_NAME    = 'animeDubberDB';
const DB_VERSION = 1;
const STORE      = 'files';

let videoName = '';
let srtName   = '';
let videoObjectURL = null;

function openDB() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('IndexedDB indisponível neste navegador'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

async function idbPut(key, value) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror    = () => { db.close(); reject(tx.error); };
  });
}

async function idbGet(key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => { db.close(); resolve(req.result); };
    req.onerror   = () => { db.close(); reject(req.error); };
  });
}

async function idbDelete(key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(key);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror    = () => { db.close(); reject(tx.error); };
  });
}

async function idbClear() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).clear();
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror    = () => { db.close(); reject(tx.error); };
  });
}

/* ---------- Estado no localStorage ---------- */
function readSavedState() {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY)) || {};
  } catch (e) {
    return {};
  }
}

function persistState() {
  try {
    const state = {
      voiceURI:     voices[voiceSelect.value] ? voices[voiceSelect.value].voiceURI : '',
      rate:         rateInput.value,
      videoVolume:  videoVolume.value,
      voiceVolume:  voiceVolume.value,
      ducking:      duckingCheck.checked,
      duckLevel:    duckLevel.value,
      videoName:    videoName,
      srtName:      srtName,
      time:         videoPlayer.currentTime || 0
    };
    localStorage.setItem(LS_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('Não foi possível salvar o estado:', e);
  }
}

/* =========================================================
   2) MODAL DE CONFIRMAÇÃO PRÓPRIO
   ========================================================= */
function askConfirm(title, message, okLabel = 'Sim, apagar') {
  return new Promise((resolve) => {
    confirmTitle.textContent   = title;
    confirmMessage.textContent = message;
    confirmOk.textContent      = okLabel;
    confirmOverlay.hidden      = false;

    const cleanup = () => {
      confirmOverlay.hidden = true;
      confirmOk.removeEventListener('click', onOk);
      confirmCancel.removeEventListener('click', onCancel);
      confirmOverlay.removeEventListener('click', onOverlay);
    };

    const onOk      = () => { cleanup(); resolve(true);  };
    const onCancel  = () => { cleanup(); resolve(false); };
    const onOverlay = (e) => {
      if (e.target === confirmOverlay) { cleanup(); resolve(false); }
    };

    confirmOk.addEventListener('click', onOk);
    confirmCancel.addEventListener('click', onCancel);
    confirmOverlay.addEventListener('click', onOverlay);
  });
}

/* =========================================================
   3) ÁUDIO — inicialização e controle de ganho
   ========================================================= */
function initAudioContext() {
  if (audioInitialized) return;
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    videoSource = audioCtx.createMediaElementSource(videoPlayer);
    videoGain = audioCtx.createGain();
    videoSource.connect(videoGain);
    videoGain.connect(audioCtx.destination);
    videoGain.gain.value = videoVolume.value / 100;
    audioInitialized = true;
  } catch (e) {
    console.warn('Web Audio API não disponível, usando volume nativo:', e);
    audioInitialized = false;
  }
}

function resumeAudioContext() {
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
}

function setVideoGain(value01) {
  if (videoGain) {
    videoGain.gain.value = value01;
  } else {
    try { videoPlayer.volume = value01; } catch (e) { /* iOS: read-only */ }
  }
}

/* =========================================================
   4) VOZES
   ========================================================= */
function loadVoices() {
  voices = synth.getVoices();
  if (!voices.length) return;

  voiceSelect.innerHTML = '';

  const sorted = [...voices].sort((a, b) => {
    const ap = a.lang.toLowerCase().startsWith('pt') ? 0 : 1;
    const bp = b.lang.toLowerCase().startsWith('pt') ? 0 : 1;
    return ap - bp;
  });

  sorted.forEach((voice) => {
    const realIndex = voices.indexOf(voice);
    const option = document.createElement('option');
    option.value = String(realIndex);
    option.textContent = `${voice.name} (${voice.lang})`;
    voiceSelect.appendChild(option);
  });

  if (pendingVoiceURI) {
    const idx = voices.findIndex(v => v.voiceURI === pendingVoiceURI);
    if (idx !== -1) voiceSelect.value = String(idx);
    pendingVoiceURI = '';
  }
}

if (speechSynthesis.onvoiceschanged !== undefined) {
  speechSynthesis.onvoiceschanged = loadVoices;
}

/* =========================================================
   5) APLICAÇÃO DO ESTADO SALVO
   ========================================================= */
const savedState = readSavedState();

if (savedState.rate)                      rateInput.value    = savedState.rate;
if (savedState.videoVolume !== undefined) videoVolume.value  = savedState.videoVolume;
if (savedState.voiceVolume !== undefined) voiceVolume.value  = savedState.voiceVolume;
if (savedState.duckLevel   !== undefined) duckLevel.value    = savedState.duckLevel;
if (savedState.ducking     !== undefined) duckingCheck.checked = !!savedState.ducking;

videoName = savedState.videoName || '';
srtName   = savedState.srtName   || '';
pendingVoiceURI = savedState.voiceURI || '';

rateVal.textContent     = rateInput.value;
videoVolVal.textContent = videoVolume.value;
voiceVolVal.textContent = voiceVolume.value;
duckVal.textContent     = duckLevel.value;

loadVoices();
setTimeout(loadVoices, 300);
setTimeout(loadVoices, 1200);

/* =========================================================
   6) CONTROLES — listeners
   ========================================================= */
rateInput.addEventListener('input', () => {
  rateVal.textContent = rateInput.value;
  persistState();
});

videoVolume.addEventListener('input', () => {
  videoVolVal.textContent = videoVolume.value;
  setVideoGain(videoVolume.value / 100);
  persistState();
});

voiceVolume.addEventListener('input', () => {
  voiceVolVal.textContent = voiceVolume.value;
  persistState();
});

duckLevel.addEventListener('input', () => {
  duckVal.textContent = duckLevel.value;
  persistState();
});

duckingCheck.addEventListener('change', persistState);
voiceSelect.addEventListener('change', persistState);

/* =========================================================
   7) CARREGAR VÍDEO
   ========================================================= */
videoFile.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  initAudioContext();
  resumeAudioContext();

  videoName = file.name;

  if (videoObjectURL) {
    URL.revokeObjectURL(videoObjectURL);
    videoObjectURL = null;
  }

  videoObjectURL = URL.createObjectURL(file);
  videoPlayer.src = videoObjectURL;
  videoPlayer.load();

  setVideoGain(videoVolume.value / 100);
  persistState();

  statusEl.textContent = '💾 Salvando vídeo...';
  try {
    await idbPut('video', file);
    statusEl.textContent = `✅ Vídeo salvo (${file.name}).`;
  } catch (err) {
    console.error(err);
    statusEl.textContent = '⚠️ Não foi possível salvar o vídeo (arquivo muito grande?).';
  }
});

/* =========================================================
   8) CARREGAR LEGENDA
   ========================================================= */
srtFile.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;

  srtName = file.name;
  const reader = new FileReader();

  reader.onload = async function (evt) {
    const text = evt.target.result;
    subtitles = parseSubtitles(text);
    lastSubtitleIndex = -1;
    statusEl.textContent = `✅ ${subtitles.length} linhas de legenda carregadas.`;
    persistState();

    /* --- reset do editor + mostrar painel --- */
    srtEditorState.history = [];
    srtEditorState.editingIndex = -1;
    srtEditorState.editingBuffer = null;
    srtEditorState.filter = '';
    srtSearch.value = '';
    lastHighlightedSubIndex = -1;
    showSrtEditorPanel();
    renderSrtEditor();

    try {
      await idbPut('srt', file);
      await idbPut('subtitles', subtitles);
    } catch (err) {
      console.error(err);
      statusEl.textContent += ' (⚠️ legenda não pôde ser salva)';
    }
  };

  reader.readAsText(file);
});

/* =========================================================
   9) PARSER DE LEGENDAS (SRT + VTT)
   ========================================================= */
function parseSubtitles(data) {
  let text = String(data)
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');

  const blocks = text.split(/\n{2,}/);
  const timeRe = /(\d{1,2}):(\d{2}):(\d{2})[.,](\d{1,3})\s*-->\s*(\d{1,2}):(\d{2}):(\d{2})[.,](\d{1,3})/;
  const subs = [];

  for (const block of blocks) {
    const lines = block.split('\n').filter(l => l.trim() !== '');
    if (!lines.length) continue;

    const timeLineIdx = lines.findIndex(l => timeRe.test(l));
    if (timeLineIdx === -1) continue;

    const m = lines[timeLineIdx].match(timeRe);
    const start =
      parseInt(m[1], 10) * 3600 +
      parseInt(m[2], 10) * 60 +
      parseInt(m[3], 10) +
      parseInt(m[4].padEnd(3, '0'), 10) / 1000;

    const end =
      parseInt(m[5], 10) * 3600 +
      parseInt(m[6], 10) * 60 +
      parseInt(m[7], 10) +
      parseInt(m[8].padEnd(3, '0'), 10) / 1000;

    const txt = lines.slice(timeLineIdx + 1)
      .join(' ')
      .replace(/<[^>]*>/g, '')
      .replace(/\{[^}]*\}/g, '')
      .trim();

    if (txt) subs.push({
      startTime: start,
      endTime: end,
      text: txt,
      origStartTime: start,
      origEndTime: end
    });
  }

  subs.sort((a, b) => a.startTime - b.startTime);
  return subs;
}

/* =========================================================
   10) SINCRONIZAÇÃO + SALVAMENTO PERIÓDICO
   ========================================================= */
let lastPersistAt = 0;

videoPlayer.addEventListener('timeupdate', () => {
  if (videoPlayer.paused) return;

  const currentTime = videoPlayer.currentTime;
  const activeSubIndex = subtitles.findIndex(
    sub => currentTime >= sub.startTime && currentTime <= sub.endTime
  );

  if (activeSubIndex !== -1 && activeSubIndex !== lastSubtitleIndex) {
    lastSubtitleIndex = activeSubIndex;
    narrarTexto(subtitles[activeSubIndex].text);
  }

  if (activeSubIndex === -1 && duckingCheck.checked) {
    setVideoGain(videoVolume.value / 100);
  }

  if (Date.now() - lastPersistAt > 3000) {
    lastPersistAt = Date.now();
    persistState();
  }

  updateSrtHighlight();
});

videoPlayer.addEventListener('seeked', () => updateSrtHighlight());
videoPlayer.addEventListener('play',   () => updateSrtHighlight());

/* =========================================================
   11) NARRAÇÃO
   ========================================================= */
function narrarTexto(texto) {
  if (!texto || texto.trim() === '') return;

  synth.cancel();

  if (duckingCheck.checked) {
    setVideoGain(duckLevel.value / 100);
  }

  const utterance = new SpeechSynthesisUtterance(texto);
  const selectedVoiceIndex = voiceSelect.value;
  if (voices[selectedVoiceIndex]) {
    utterance.voice = voices[selectedVoiceIndex];
  }

  utterance.rate   = parseFloat(rateInput.value);
  utterance.volume = voiceVolume.value / 100;

  const restore = () => {
    if (duckingCheck.checked) {
      setVideoGain(videoVolume.value / 100);
    }
    currentUtterance = null;
  };

  utterance.onend   = restore;
  utterance.onerror = restore;

  currentUtterance = utterance;
  synth.speak(utterance);
}

/* =========================================================
   12) TESTAR VOZ
   ========================================================= */
testVoiceBtn.addEventListener('click', () => {
  resumeAudioContext();
  const texto = 'Esta é uma amostra da voz narrativa.';
  const utterance = new SpeechSynthesisUtterance(texto);
  const selectedVoiceIndex = voiceSelect.value;
  if (voices[selectedVoiceIndex]) {
    utterance.voice = voices[selectedVoiceIndex];
  }
  utterance.rate   = parseFloat(rateInput.value);
  utterance.volume = voiceVolume.value / 100;
  synth.cancel();
  synth.speak(utterance);
});

/* =========================================================
   13) LIMPEZA — só vídeo, só legenda, tudo
   ========================================================= */
clearVideoBtn.addEventListener('click', async () => {
  const ok = await askConfirm(
    'Limpar vídeo?',
    'O vídeo salvo será removido deste aparelho. As legendas e preferências continuam.',
    'Sim, limpar vídeo'
  );
  if (!ok) return;

  try { await idbDelete('video'); } catch (e) { console.warn(e); }

  if (videoObjectURL) {
    URL.revokeObjectURL(videoObjectURL);
    videoObjectURL = null;
  }

  videoPlayer.removeAttribute('src');
  videoPlayer.load();

  videoName = '';
  persistState();
  statusEl.textContent = '🎬 Vídeo removido.';
});

clearSrtBtn.addEventListener('click', async () => {
  const ok = await askConfirm(
    'Limpar legenda?',
    'A legenda salva será removida deste aparelho. O vídeo e as preferências continuam.',
    'Sim, limpar legenda'
  );
  if (!ok) return;

  try { await idbDelete('srt'); }       catch (e) { console.warn(e); }
  try { await idbDelete('subtitles'); } catch (e) { console.warn(e); }

  subtitles = [];
  lastSubtitleIndex = -1;
  srtName = '';

  /* reset do editor */
  hideSrtEditorPanel();
  srtEditorState.history = [];
  srtEditorState.editingIndex = -1;
  srtEditorState.editingBuffer = null;
  srtEditorState.filter = '';
  srtSearch.value = '';
  lastHighlightedSubIndex = -1;

  persistState();
  statusEl.textContent = '📝 Legenda removida.';
});

clearDataBtn.addEventListener('click', async () => {
  const ok = await askConfirm(
    'Limpar TUDO?',
    'Isso apaga vídeo, legenda, posição e todas as preferências salvas neste aparelho. Não tem como desfazer.',
    'Sim, apagar tudo'
  );
  if (!ok) return;

  localStorage.removeItem(LS_KEY);
  try { await idbClear(); } catch (e) { console.warn(e); }

  if (videoObjectURL) {
    URL.revokeObjectURL(videoObjectURL);
    videoObjectURL = null;
  }

  subtitles = [];
  lastSubtitleIndex = -1;
  videoName = '';
  srtName = '';

  videoPlayer.removeAttribute('src');
  videoPlayer.load();

  /* reset do editor */
  hideSrtEditorPanel();
  srtEditorState.history = [];
  srtEditorState.editingIndex = -1;
  srtEditorState.editingBuffer = null;
  srtEditorState.filter = '';
  srtSearch.value = '';
  lastHighlightedSubIndex = -1;

  statusEl.textContent = '🗑️ Todos os dados salvos foram apagados.';
});

/* =========================================================
   14) RESTAURAÇÃO AO ABRIR A PÁGINA
   ========================================================= */
async function restoreFiles() {
  let videoBlob = null;
  let srtBlob   = null;
  let savedSubs = null;

  try {
    videoBlob = await idbGet('video');
    srtBlob   = await idbGet('srt');
    savedSubs = await idbGet('subtitles');
  } catch (e) {
    console.warn('Falha ao ler do IndexedDB:', e);
    return;
  }

  const hasSavedSubs = Array.isArray(savedSubs) && savedSubs.length > 0;

  if (!videoBlob && !srtBlob && !hasSavedSubs) {
    statusEl.textContent = 'Nenhuma legenda carregada.';
    return;
  }

  /* --- Legenda --- */
  if (hasSavedSubs || srtBlob) {
    try {
      if (hasSavedSubs) {
        subtitles = savedSubs.map(s => ({
          ...s,
          origStartTime: s.origStartTime !== undefined ? s.origStartTime : s.startTime,
          origEndTime:   s.origEndTime   !== undefined ? s.origEndTime   : s.endTime
        }));
      } else {
        const text = await srtBlob.text();
        subtitles = parseSubtitles(text);
      }

      lastSubtitleIndex = -1;
      statusEl.textContent =
        `♻️ Legenda restaurada: ${subtitles.length} linhas (${srtName || 'arquivo salvo'}).`;

      showSrtEditorPanel();
      renderSrtEditor();
    } catch (e) {
      console.warn(e);
    }
  }

  /* --- Vídeo --- */
  if (videoBlob) {
    if (videoObjectURL) URL.revokeObjectURL(videoObjectURL);
    videoObjectURL = URL.createObjectURL(videoBlob);
    videoPlayer.src = videoObjectURL;

    const savedTime = savedState.time || 0;

    const seekOnce = () => {
      videoPlayer.removeEventListener('loadedmetadata', seekOnce);
      if (savedTime > 0 && isFinite(savedTime)) {
        try {
          videoPlayer.currentTime = savedTime;
          lastPersistAt = Date.now();
        } catch (e) {
          console.warn('Não foi possível restaurar a posição:', e);
        }
      }
      setVideoGain(videoVolume.value / 100);
    };

    videoPlayer.addEventListener('loadedmetadata', seekOnce);

    statusEl.textContent =
      `♻️ Vídeo restaurado (${videoName || 'arquivo salvo'}). ` +
      `Toque em ▶️ para continuar de onde parou.`;
  }
}

/* =========================================================
   15) INICIALIZAÇÃO DE ÁUDIO / SALVAMENTO FINAL
   ========================================================= */
document.body.addEventListener('click', () => {
  initAudioContext();
  resumeAudioContext();
  setVideoGain(videoVolume.value / 100);
}, { once: true });

videoPlayer.addEventListener('play', () => {
  initAudioContext();
  resumeAudioContext();
  setVideoGain(videoVolume.value / 100);
});

videoPlayer.addEventListener('pause', persistState);
videoPlayer.addEventListener('ended', persistState);

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    persistState();
    if (subtitles.length) {
      idbPut('subtitles', subtitles).catch(() => {});
    }
  }
});

window.addEventListener('pagehide', () => {
  persistState();
  if (subtitles.length) {
    idbPut('subtitles', subtitles).catch(() => {});
  }
});
window.addEventListener('beforeunload', persistState);

/* =========================================================
   16) EDITOR DE LEGENDAS EM TEMPO REAL
   ========================================================= */
const srtEditorPanel    = document.getElementById('srtEditorPanel');
const toggleSrtEditor   = document.getElementById('toggleSrtEditor');
const srtToggleIcon     = document.getElementById('srtToggleIcon');
const srtEditorBody     = document.getElementById('srtEditorBody');
const srtEditorInfo     = document.getElementById('srtEditorInfo');
const srtList           = document.getElementById('srtList');
const srtSearch         = document.getElementById('srtSearch');
const srtGlobalShiftIn  = document.getElementById('srtGlobalShift');
const srtApplyGlobalBtn = document.getElementById('srtApplyGlobalShift');
const srtFollowBtn      = document.getElementById('srtFollowPlayback');
const srtUndoBtn        = document.getElementById('srtUndo');
const srtRevertAllBtn   = document.getElementById('srtRevertAll');
const srtExportBtn      = document.getElementById('srtExport');

const srtEditorState = {
  editingIndex: -1,
  editingBuffer: null,
  filter: '',
  history: []
};
let lastHighlightedSubIndex = -1;

/* ---------- helpers ---------- */
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => (
    {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]
  ));
}

function fmtTime(sec) {
  sec = Math.max(0, Math.round(sec * 1000) / 1000);
  const h  = Math.floor(sec / 3600);
  const m  = Math.floor((sec % 3600) / 60);
  const s  = Math.floor(sec % 60);
  const ms = Math.round((sec - Math.floor(sec)) * 1000);
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')},${String(ms).padStart(3,'0')}`;
}

function parseFmtTime(str) {
  str = String(str).trim().replace(',', '.');
  let m = str.match(/^(\d+):(\d+):(\d+)(?:\.(\d+))?$/);
  if (m) return (+m[1])*3600 + (+m[2])*60 + (+m[3]) + (+(m[4]||'0').padEnd(3,'0').slice(0,3))/1000;
  m = str.match(/^(\d+):(\d+)(?:\.(\d+))?$/);
  if (m) return (+m[1])*60 + (+m[2]) + (+(m[3]||'0').padEnd(3,'0').slice(0,3))/1000;
  m = str.match(/^(\d+)(?:\.(\d+))?$/);
  if (m) return (+m[1]) + (+(m[2]||'0').padEnd(3,'0').slice(0,3))/1000;
  return null;
}

function fmtDelta(sec) {
  const sign = sec < 0 ? '-' : '+';
  const abs = Math.abs(sec);
  if (abs < 1) return `${sign}${(abs * 1000).toFixed(0)}ms`;
  return `${sign}${abs.toFixed(2)}s`;
}

/* ---------- persistência das edições ---------- */
function scheduleSaveSubtitles() {
  clearTimeout(scheduleSaveSubtitles._t);
  scheduleSaveSubtitles._t = setTimeout(async () => {
    try { await idbPut('subtitles', subtitles); } catch (e) { console.warn(e); }
  }, 400);
}

/* ---------- painel ---------- */
function showSrtEditorPanel() {
  srtEditorPanel.hidden = false;
  updateSrtEditorInfo();
}
function hideSrtEditorPanel() {
  srtEditorPanel.hidden = true;
  srtEditorBody.hidden = true;
  srtToggleIcon.classList.remove('open');
}
function updateSrtEditorInfo() {
  if (!subtitles.length) {
    srtEditorInfo.textContent = 'nenhuma legenda';
    return;
  }
  let mod = 0;
  for (const s of subtitles) {
    if (s.startTime !== s.origStartTime || s.endTime !== s.origEndTime) mod++;
  }
  srtEditorInfo.textContent = `${subtitles.length} legendas` + (mod ? ` · ${mod} alterada(s)` : '');
}

/* ---------- render ---------- */
function getFilteredSubIndices() {
  const q = srtEditorState.filter.trim().toLowerCase();
  if (!q) return subtitles.map((_, i) => i);
  return subtitles.map((s, i) => ({ s, i }))
    .filter(({ s }) =>
      s.text.toLowerCase().includes(q) ||
      fmtTime(s.startTime).toLowerCase().includes(q) ||
      fmtTime(s.endTime).toLowerCase().includes(q)
    ).map(({ i }) => i);
}

function renderSrtEditor() {
  updateSrtEditorInfo();
  updateSrtUndoBtn();

  const scrollTop = srtList.scrollTop;

  if (!subtitles.length) {
    srtList.innerHTML = '<div class="srt-empty">Carregue um arquivo .SRT para editar as legendas.</div>';
    return;
  }

  const filtered = getFilteredSubIndices();
  if (!filtered.length) {
    srtList.innerHTML = `<div class="srt-empty">Nenhum resultado para "${escapeHtml(srtEditorState.filter)}"</div>`;
    return;
  }

  const frag = document.createDocumentFragment();
  filtered.forEach(i => {
    const sub = subtitles[i];
    const modified = sub.startTime !== sub.origStartTime || sub.endTime !== sub.origEndTime;
    const isEditing = srtEditorState.editingIndex === i;
    const dur = sub.endTime - sub.startTime;

    const row = document.createElement('div');
    row.className = 'srt-item'
      + (modified ? ' modified' : '')
      + (isEditing ? ' editing' : '');
    row.dataset.index = i;

    row.innerHTML = `
      <div class="srt-item-header">
        <button type="button" class="srt-seek" data-index="${i}" title="Ir para este tempo">▶</button>
        <span class="srt-num">#${i + 1}</span>
        <span class="srt-time">${fmtTime(sub.startTime)} → ${fmtTime(sub.endTime)}</span>
        <span class="srt-dur">(${dur.toFixed(2)}s)</span>
        ${modified ? '<span class="srt-badge">alterado</span>' : ''}
      </div>
      <div class="srt-text">${escapeHtml(sub.text) || '<span style="color:#5c6274">(vazio)</span>'}</div>
    `;

    if (isEditing) row.appendChild(createSrtInlineEditor(i));
    frag.appendChild(row);
  });

  srtList.innerHTML = '';
  srtList.appendChild(frag);
  srtList.scrollTop = scrollTop;

  lastHighlightedSubIndex = -1;
  updateSrtHighlight();
}

/* ---------- editor inline ---------- */
function createSrtInlineEditor(i) {
  const sub = subtitles[i];
  const buf = srtEditorState.editingBuffer;

  const el = document.createElement('div');
  el.className = 'srt-inline-editor';
  el.addEventListener('click', e => e.stopPropagation());
  el.innerHTML = `
    <div class="srt-time-row">
      <label>Início</label>
      <input class="srt-time-input" data-field="start" value="${fmtTime(buf.startTime)}" spellcheck="false">
      <button type="button" class="srt-shift-btn" data-shift="-1">−1s</button>
      <button type="button" class="srt-shift-btn" data-shift="-0.1">−0.1s</button>
      <button type="button" class="srt-shift-btn" data-shift="0.1">+0.1s</button>
      <button type="button" class="srt-shift-btn" data-shift="1">+1s</button>
    </div>
    <div class="srt-time-row">
      <label>Fim</label>
      <input class="srt-time-input" data-field="end" value="${fmtTime(buf.endTime)}" spellcheck="false">
      <span class="srt-delta zero" data-delta>0</span>
    </div>
    <div class="srt-editor-actions">
      <button type="button" class="btn" data-action="reset">↺ Restaurar</button>
      <button type="button" class="btn" data-action="this">Só este</button>
      <button type="button" class="btn btn-primary" data-action="forward">Este e os seguintes →</button>
      <button type="button" class="btn" data-action="all">Em todos</button>
    </div>`;

  const startInput = el.querySelector('[data-field="start"]');
  const endInput   = el.querySelector('[data-field="end"]');

  function refresh() {
    startInput.value = fmtTime(buf.startTime);
    endInput.value   = fmtTime(buf.endTime);
    const d = buf.startTime - sub.origStartTime;
    const dd = el.querySelector('[data-delta]');
    if (Math.abs(d) < 0.0005) {
      dd.textContent = 'sem alteração';
      dd.className = 'srt-delta zero';
    } else {
      dd.textContent = fmtDelta(d);
      dd.className = 'srt-delta' + (d < 0 ? ' neg' : '');
    }
  }

  function readStart() {
    const v = parseFmtTime(startInput.value);
    if (v === null) { startInput.value = fmtTime(buf.startTime); return; }
    const dur = buf.endTime - buf.startTime;
    buf.startTime = Math.max(0, v);
    buf.endTime = buf.startTime + dur;
    refresh();
  }
  function readEnd() {
    const v = parseFmtTime(endInput.value);
    if (v === null) { endInput.value = fmtTime(buf.endTime); return; }
    buf.endTime = v <= buf.startTime ? buf.startTime + 0.1 : v;
    refresh();
  }

  startInput.addEventListener('change', readStart);
  startInput.addEventListener('blur',   readStart);
  endInput.addEventListener('change',   readEnd);
  endInput.addEventListener('blur',     readEnd);

  [startInput, endInput].forEach(inp => inp.addEventListener('keydown', e => {
    if (e.key === 'Enter')  { e.preventDefault(); inp.blur(); }
    if (e.key === 'Escape') { e.preventDefault(); closeSrtInlineEditor(); }
  }));

  el.querySelectorAll('[data-shift]').forEach(btn => btn.addEventListener('click', () => {
    const delta = parseFloat(btn.dataset.shift);
    buf.startTime = Math.max(0, buf.startTime + delta);
    buf.endTime   = Math.max(buf.startTime + 0.1, buf.endTime + delta);
    refresh();
  }));

  el.querySelector('[data-action="reset"]').addEventListener('click', () => {
    buf.startTime = sub.origStartTime;
    buf.endTime   = sub.origEndTime;
    refresh();
  });
  el.querySelector('[data-action="this"]').addEventListener('click', () => applySrtThis(i));
  el.querySelector('[data-action="forward"]').addEventListener('click', () => applySrtForward(i));
  el.querySelector('[data-action="all"]').addEventListener('click', () => applySrtAll(i));

  refresh();
  return el;
}

function closeSrtInlineEditor() {
  srtEditorState.editingIndex = -1;
  srtEditorState.editingBuffer = null;
  renderSrtEditor();
}

/* ---------- aplicar edições ---------- */
function pushSrtHistory() {
  srtEditorState.history.push(subtitles.map(s => ({ ...s })));
  if (srtEditorState.history.length > 30) srtEditorState.history.shift();
  updateSrtUndoBtn();
}
function updateSrtUndoBtn() {
  srtUndoBtn.disabled      = srtEditorState.history.length === 0;
  srtRevertAllBtn.disabled = !subtitles.length;
}

function applySrtThis(i) {
  const buf = srtEditorState.editingBuffer;
  if (!buf) return;
  pushSrtHistory();
  subtitles[i].startTime = Math.max(0, buf.startTime);
  subtitles[i].endTime   = Math.max(subtitles[i].startTime + 0.1, buf.endTime);
  closeSrtInlineEditor();
  scheduleSaveSubtitles();
}

function applySrtForward(i) {
  const buf = srtEditorState.editingBuffer;
  if (!buf) return;
  pushSrtHistory();
  const delta = buf.startTime - subtitles[i].startTime;

  subtitles[i].startTime = Math.max(0, buf.startTime);
  subtitles[i].endTime   = Math.max(subtitles[i].startTime + 0.1, buf.endTime);

  if (delta !== 0) {
    for (let j = i + 1; j < subtitles.length; j++) {
      const s = subtitles[j];
      const dur = s.endTime - s.startTime;
      s.startTime = Math.max(0, s.startTime + delta);
      s.endTime   = s.startTime + dur;
    }
  }
  closeSrtInlineEditor();
  scheduleSaveSubtitles();
}

function applySrtAll(i) {
  const buf = srtEditorState.editingBuffer;
  if (!buf) return;
  pushSrtHistory();
  const delta = buf.startTime - subtitles[i].startTime;

  for (let j = 0; j < subtitles.length; j++) {
    if (j === i) {
      subtitles[j].startTime = Math.max(0, buf.startTime);
      subtitles[j].endTime   = Math.max(subtitles[j].startTime + 0.1, buf.endTime);
    } else if (delta !== 0) {
      const s = subtitles[j];
      const dur = s.endTime - s.startTime;
      s.startTime = Math.max(0, s.startTime + delta);
      s.endTime   = s.startTime + dur;
    }
  }
  closeSrtInlineEditor();
  scheduleSaveSubtitles();
}

function applySrtGlobalShift() {
  const val = parseFloat(srtGlobalShiftIn.value);
  if (!isFinite(val) || val === 0 || !subtitles.length) return;
  pushSrtHistory();
  for (const s of subtitles) {
    const dur = s.endTime - s.startTime;
    s.startTime = Math.max(0, s.startTime + val);
    s.endTime   = s.startTime + dur;
  }
  srtEditorState.editingIndex = -1;
  srtEditorState.editingBuffer = null;
  renderSrtEditor();
  scheduleSaveSubtitles();
}

function undoSrtEdit() {
  if (!srtEditorState.history.length) return;
  subtitles = srtEditorState.history.pop();
  srtEditorState.editingIndex = -1;
  srtEditorState.editingBuffer = null;
  lastSubtitleIndex = -1;
  renderSrtEditor();
  scheduleSaveSubtitles();
}

function revertAllSrtEdits() {
  if (!subtitles.length) return;
  pushSrtHistory();
  for (const s of subtitles) {
    s.startTime = s.origStartTime;
    s.endTime   = s.origEndTime;
  }
  srtEditorState.editingIndex = -1;
  srtEditorState.editingBuffer = null;
  lastSubtitleIndex = -1;
  renderSrtEditor();
  scheduleSaveSubtitles();
}

/* ---------- navegação / destaque ---------- */
function seekToSub(i) {
  const s = subtitles[i];
  if (!s) return;
  try { videoPlayer.currentTime = s.startTime; } catch (e) { /* ignore */ }
}

function updateSrtHighlight() {
  if (!srtEditorBody || srtEditorBody.hidden || !subtitles.length) return;

  const t = videoPlayer.currentTime;
  const idx = subtitles.findIndex(s => t >= s.startTime && t <= s.endTime);

  if (idx === lastHighlightedSubIndex) return;
  lastHighlightedSubIndex = idx;

  const prev = srtList.querySelector('.srt-item.active');
  if (prev) prev.classList.remove('active');

  if (idx !== -1) {
    const row = srtList.querySelector(`.srt-item[data-index="${idx}"]`);
    if (row) row.classList.add('active');
  }
}

function followCurrentSub() {
  if (!subtitles.length) return;
  if (srtEditorBody.hidden) {
    srtEditorBody.hidden = false;
    srtToggleIcon.classList.add('open');
    renderSrtEditor();
  }
  const t = videoPlayer.currentTime;
  let idx = subtitles.findIndex(s => t >= s.startTime && t <= s.endTime);
  if (idx === -1) idx = subtitles.findIndex(s => s.startTime > t);
  if (idx === -1) idx = subtitles.length - 1;

  const filtered = getFilteredSubIndices();
  if (!filtered.includes(idx)) {
    srtEditorState.filter = '';
    srtSearch.value = '';
    renderSrtEditor();
  }

  const row = srtList.querySelector(`.srt-item[data-index="${idx}"]`);
  if (row) {
    row.scrollIntoView({ block: 'center', behavior: 'smooth' });
    row.classList.add('flash');
    setTimeout(() => row.classList.remove('flash'), 1400);
  }
}

/* ---------- exportar ---------- */
function downloadSrt() {
  if (!subtitles.length) return;
  const srt = subtitles.map((s, i) =>
    `${i + 1}\n${fmtTime(s.startTime)} --> ${fmtTime(s.endTime)}\n${s.text}`
  ).join('\n\n') + '\n';

  const blob = new Blob([srt], { type: 'text/plain;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = ((srtName || 'legenda').replace(/\.(srt|vtt)$/i, '')) + '_sincronizado.srt';
  a.click();
  URL.revokeObjectURL(url);
}

/* ---------- eventos do painel ---------- */
toggleSrtEditor.addEventListener('click', () => {
  const open = srtEditorBody.hidden;
  srtEditorBody.hidden = !open;
  srtToggleIcon.classList.toggle('open', open);
  if (open) renderSrtEditor();
});

srtList.addEventListener('click', (e) => {
  if (e.target.closest('.srt-inline-editor')) return;

  const seekBtn = e.target.closest('.srt-seek');
  if (seekBtn) {
    seekToSub(+seekBtn.dataset.index);
    return;
  }

  const row = e.target.closest('.srt-item');
  if (!row) return;

  const i = +row.dataset.index;
  if (srtEditorState.editingIndex === i) {
    closeSrtInlineEditor();
    return;
  }
  srtEditorState.editingIndex = i;
  srtEditorState.editingBuffer = {
    startTime: subtitles[i].startTime,
    endTime:   subtitles[i].endTime
  };
  renderSrtEditor();
});

srtSearch.addEventListener('input', () => {
  srtEditorState.filter = srtSearch.value;
  if (srtEditorState.editingIndex !== -1 &&
      !getFilteredSubIndices().includes(srtEditorState.editingIndex)) {
    srtEditorState.editingIndex = -1;
    srtEditorState.editingBuffer = null;
  }
  renderSrtEditor();
});

srtApplyGlobalBtn.addEventListener('click', applySrtGlobalShift);
srtGlobalShiftIn.addEventListener('keydown', e => {
  if (e.key === 'Enter') { e.preventDefault(); applySrtGlobalShift(); }
});

srtFollowBtn.addEventListener('click', followCurrentSub);
srtUndoBtn.addEventListener('click', undoSrtEdit);
srtRevertAllBtn.addEventListener('click', revertAllSrtEdits);
srtExportBtn.addEventListener('click', downloadSrt);

/* atalhos globais (respeitando campos de texto) */
document.addEventListener('keydown', (e) => {
  const inField = e.target.closest('input, textarea, select');
  if (inField) return;
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.key.toLowerCase() === 'z' && !srtEditorBody.hidden) {
    e.preventDefault(); undoSrtEdit();
  }
  if (mod && e.key.toLowerCase() === 's') {
    e.preventDefault(); downloadSrt();
  }
});

/* =========================================================
   17) START
   ========================================================= */
restoreFiles();
