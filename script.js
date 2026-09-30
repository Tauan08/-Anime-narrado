const videoPlayer = document.getElementById('videoPlayer');
const videoFile = document.getElementById('videoFile');
const srtFile = document.getElementById('srtFile');
const voiceSelect = document.getElementById('voiceSelect');
const rateInput = document.getElementById('rate');
const rateVal = document.getElementById('rateVal');
const videoVolume = document.getElementById('videoVolume');
const videoVolVal = document.getElementById('videoVolVal');
const voiceVolume = document.getElementById('voiceVolume');
const voiceVolVal = document.getElementById('voiceVolVal');
const duckingCheck = document.getElementById('ducking');
const duckLevel = document.getElementById('duckLevel');
const duckVal = document.getElementById('duckVal');
const statusEl = document.getElementById('status');
const testVoiceBtn = document.getElementById('testVoice');

let subtitles = [];
let lastSubtitleIndex = -1;
let synth = window.speechSynthesis;
let voices = [];
let currentUtterance = null;

// Web Audio API para controlar o volume do vídeo sem depender da propriedade volume (que no iOS é read-only)
let audioCtx = null;
let videoSource = null;
let videoGain = null;
let audioInitialized = false;

function initAudioContext() {
  if (audioInitialized) return;
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    videoSource = audioCtx.createMediaElementSource(videoPlayer);
    videoGain = audioCtx.createGain();
    videoSource.connect(videoGain);
    videoGain.connect(audioCtx.destination);
    // Volume inicial do vídeo
    videoGain.gain.value = videoVolume.value / 100;
    audioInitialized = true;
  } catch (e) {
    console.warn('Web Audio API não disponível, usando volume nativo:', e);
    // Fallback: tenta usar a propriedade volume (pode não funcionar no iOS)
    audioInitialized = false;
  }
}

// Garante que o AudioContext seja retomado após interação do usuário
function resumeAudioContext() {
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
}

// ========== VOZES ==========
function loadVoices() {
  voices = synth.getVoices();
  voiceSelect.innerHTML = '';

  // Prioriza vozes em português
  const ptVoices = voices.filter(v => v.lang.toLowerCase().includes('pt'));
  const list = ptVoices.length ? ptVoices : voices;

  list.forEach((voice, index) => {
    const option = document.createElement('option');
    // Guarda o index real no array global de vozes
    const realIndex = voices.indexOf(voice);
    option.value = realIndex;
    option.textContent = `${voice.name} (${voice.lang})`;
    voiceSelect.appendChild(option);
  });

  // Se não houver vozes em português, mostra todas
  if (list.length === 0) {
    voices.forEach((voice, index) => {
      const option = document.createElement('option');
      option.value = index;
      option.textContent = `${voice.name} (${voice.lang})`;
      voiceSelect.appendChild(option);
    });
  }
}

if (speechSynthesis.onvoiceschanged !== undefined) {
  speechSynthesis.onvoiceschanged = loadVoices;
}
loadVoices();

// ========== CONTROLES ==========
rateInput.addEventListener('input', () => {
  rateVal.textContent = rateInput.value;
});

videoVolume.addEventListener('input', () => {
  videoVolVal.textContent = videoVolume.value;
  if (videoGain) {
    videoGain.gain.value = videoVolume.value / 100;
  } else {
    // Fallback
    videoPlayer.volume = videoVolume.value / 100;
  }
});

voiceVolume.addEventListener('input', () => {
  voiceVolVal.textContent = voiceVolume.value;
});

duckLevel.addEventListener('input', () => {
  duckVal.textContent = duckLevel.value;
});

// ========== CARREGAR VÍDEO ==========
videoFile.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;

  // Inicializa o contexto de áudio na primeira interação
  initAudioContext();
  resumeAudioContext();

  const fileURL = URL.createObjectURL(file);
  videoPlayer.src = fileURL;

  // Garante que o ganho inicial seja aplicado
  if (videoGain) {
    videoGain.gain.value = videoVolume.value / 100;
  } else {
    videoPlayer.volume = videoVolume.value / 100;
  }
});

// ========== CARREGAR LEGENDA ==========
srtFile.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(evt) {
    const text = evt.target.result;
    subtitles = parseSRT(text);
    statusEl.textContent = `✅ ${subtitles.length} linhas de legenda carregadas.`;
    lastSubtitleIndex = -1;
  };
  reader.readAsText(file);
});

// ========== PARSER SRT ==========
function parseSRT(data) {
  const regex = /(\d+)\r?\n(\d\d:\d\d:\d\d,\d\d\d) --> (\d\d:\d\d:\d\d,\d\d\d)\r?\n([\s\S]*?)(?=\r?\n\r?\n|\r?\n*$)/g;
  let converted = [];
  let matches;

  while ((matches = regex.exec(data)) !== null) {
    converted.push({
      startTime: timeToSeconds(matches[2]),
      endTime: timeToSeconds(matches[3]),
      text: matches[4].replace(/\r?\n/g, ' ').replace(/<[^>]*>/g, '')
    });
  }
  return converted;
}

function timeToSeconds(timeString) {
  const parts = timeString.split(':');
  const secondsParts = parts[2].split(',');
  return parseInt(parts[0], 10) * 3600 + parseInt(parts[1], 10) * 60 + parseInt(secondsParts[0], 10) + parseInt(secondsParts[1], 10) / 1000;
}

// ========== SINCRONIZAÇÃO ==========
videoPlayer.addEventListener('timeupdate', () => {
  const currentTime = videoPlayer.currentTime;

  const activeSubIndex = subtitles.findIndex(sub => currentTime >= sub.startTime && currentTime <= sub.endTime);

  if (activeSubIndex !== -1 && activeSubIndex !== lastSubtitleIndex) {
    lastSubtitleIndex = activeSubIndex;
    narrarTexto(subtitles[activeSubIndex].text);
  }

  // Se não houver legenda ativa, restaura o volume do vídeo (caso ducking esteja ativo)
  if (activeSubIndex === -1 && duckingCheck.checked && videoGain) {
    videoGain.gain.value = videoVolume.value / 100;
  }
});

// ========== NARRAÇÃO ==========
function narrarTexto(texto) {
  if (!texto || texto.trim() === '') return;

  // Cancela falas anteriores para não encavalar
  synth.cancel();

  // Aplica ducking: abaixa o volume do vídeo
  if (duckingCheck.checked && videoGain) {
    const duckValue = duckLevel.value / 100;
    videoGain.gain.value = duckValue;
  }

  const utterance = new SpeechSynthesisUtterance(texto);
  const selectedVoiceIndex = voiceSelect.value;
  if (voices[selectedVoiceIndex]) {
    utterance.voice = voices[selectedVoiceIndex];
  }

  utterance.rate = parseFloat(rateInput.value);
  utterance.volume = voiceVolume.value / 100;

  utterance.onend = () => {
    // Restaura o volume do vídeo após a fala
    if (duckingCheck.checked && videoGain) {
      videoGain.gain.value = videoVolume.value / 100;
    }
    currentUtterance = null;
  };

  utterance.onerror = () => {
    if (duckingCheck.checked && videoGain) {
      videoGain.gain.value = videoVolume.value / 100;
    }
    currentUtterance = null;
  };

  currentUtterance = utterance;
  synth.speak(utterance);
}

// ========== TESTAR VOZ ==========
testVoiceBtn.addEventListener('click', () => {
  resumeAudioContext();
  const texto = 'Esta é uma amostra da voz narrativa.';
  const utterance = new SpeechSynthesisUtterance(texto);
  const selectedVoiceIndex = voiceSelect.value;
  if (voices[selectedVoiceIndex]) {
    utterance.voice = voices[selectedVoiceIndex];
  }
  utterance.rate = parseFloat(rateInput.value);
  utterance.volume = voiceVolume.value / 100;
  synth.cancel();
  synth.speak(utterance);
});

// ========== INICIALIZAÇÃO DE ÁUDIO EM CLIQUES ==========
document.body.addEventListener('click', () => {
  resumeAudioContext();
}, { once: true });

videoPlayer.addEventListener('play', () => {
  resumeAudioContext();
});
