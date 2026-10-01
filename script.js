/* =========================================================
   Anime Dubber Platform — com persistência (IndexedDB + localStorage)
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
const clearDataBtn  = document.getElementById('clearData');

let subtitles = [];
let lastSubtitleIndex = -1;
const synth = window.speechSynthesis;
let voices = [];
let currentUtterance = null;
let pendingVoiceURI = '';

/* ---------- Web Audio API (controla o volume do vídeo sem depender da
   propriedade `volume`, que no iOS é somente leitura) ---------- */
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
   2) ÁUDIO — inicialização e controle de ganho
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

/* Aplica o volume do vídeo no ganho (ou no elemento, como fallback) */
function setVideoGain(value01) {
  if (videoGain) {
    videoGain.gain.value = value01;
  } else {
    try { videoPlayer.volume = value01; } catch (e) { /* iOS: read-only */ }
  }
}

/* =========================================================
   3) VOZES
   ========================================================= */
function loadVoices() {
  voices = synth.getVoices();
  if (!voices.length) return;

  voiceSelect.innerHTML = '';

  // Português primeiro, depois o resto (mas todas disponíveis)
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

  // Restaura a voz salva
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
   4) APLICAÇÃO DO ESTADO SALVO (controles)
   ========================================================= */
const savedState = readSavedState();

if (savedState.rate) {
  rateInput.value = savedState.rate;
}
if (savedState.videoVolume !== undefined) {
  videoVolume.value = savedState.videoVolume;
}
if (savedState.voiceVolume !== undefined) {
  voiceVolume.value = savedState.voiceVolume;
}
if (savedState.duckLevel !== undefined) {
  duckLevel.value = savedState.duckLevel;
}
if (savedState.ducking !== undefined) {
  duckingCheck.checked = !!savedState.ducking;
}
videoName = savedState.videoName || '';
srtName   = savedState.srtName   || '';
pendingVoiceURI = savedState.voiceURI || '';

rateVal.textContent     = rateInput.value;
videoVolVal.textContent = videoVolume.value;
voiceVolVal.textContent = voiceVolume.value;
duckVal.textContent     = duckLevel.value;

loadVoices();
// Alguns navegadores carregam as vozes depois
setTimeout(loadVoices, 300);
setTimeout(loadVoices, 1200);

/* =========================================================
   5) CONTROLES — listeners
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
   6) CARREGAR VÍDEO (e salvar no IndexedDB)
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
   7) CARREGAR LEGENDA (e salvar no IndexedDB)
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

    try {
      await idbPut('srt', file);
    } catch (err) {
      console.error(err);
      statusEl.textContent += ' (⚠️ legenda não pôde ser salva)';
    }
  };

  reader.readAsText(file);
});

/* =========================================================
   8) PARSER DE LEGENDAS (SRT + VTT)
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

    if (txt) subs.push({ startTime: start, endTime: end, text: txt });
  }

  subs.sort((a, b) => a.startTime - b.startTime);
  return subs;
}

/* =========================================================
   9) SINCRONIZAÇÃO + SALVAMENTO PERIÓDICO DA POSIÇÃO
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

  // Salva a posição a cada ~3 segundos
  if (Date.now() - lastPersistAt > 3000) {
    lastPersistAt = Date.now();
    persistState();
  }
});

/* =========================================================
   10) NARRAÇÃO
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
   11) TESTAR VOZ
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
   12) LIMPAR DADOS SALVOS
   ========================================================= */
clearDataBtn.addEventListener('click', async () => {
  if (!confirm('Isso vai apagar o vídeo, a legenda e as preferências salvas neste aparelho. Continuar?')) {
    return;
  }

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

  statusEl.textContent = '🗑️ Dados salvos apagados.';
});

/* =========================================================
   13) RESTAURAÇÃO DOS ARQUIVOS AO ABRIR A PÁGINA
   ========================================================= */
async function restoreFiles() {
  let videoBlob = null;
  let srtBlob = null;

  try {
    videoBlob = await idbGet('video');
    srtBlob   = await idbGet('srt');
  } catch (e) {
    console.warn('Falha ao ler do IndexedDB:', e);
    return;
  }

  if (!videoBlob && !srtBlob) {
    statusEl.textContent = 'Nenhuma legenda carregada.';
    return;
  }

  // --- Legenda ---
  if (srtBlob) {
    try {
      const text = await srtBlob.text();
      subtitles = parseSubtitles(text);
      lastSubtitleIndex = -1;
      statusEl.textContent = `♻️ Legenda restaurada: ${subtitles.length} linhas (${srtName || 'arquivo salvo'}).`;
    } catch (e) {
      console.warn(e);
    }
  }

  // --- Vídeo ---
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
   14) INICIALIZAÇÃO DE ÁUDIO EM INTERAÇÕES DO USUÁRIO
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

/* Salva quando o app vai para segundo plano (trocar pro WhatsApp etc.) */
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') persistState();
});
window.addEventListener('pagehide', persistState);
window.addEventListener('beforeunload', persistState);

/* =========================================================
   15) START
   ========================================================= */
restoreFiles();
