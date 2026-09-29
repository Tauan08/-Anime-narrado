const videoPlayer = document.getElementById('videoPlayer');
const videoFile = document.getElementById('videoFile');
const srtFile = document.getElementById('srtFile');
const voiceSelect = document.getElementById('voiceSelect');
const rateInput = document.getElementById('rate');
const rateVal = document.getElementById('rateVal');

let subtitles = [];
let lastSubtitleIndex = -1;
let synth = window.speechSynthesis;

// 1. Carrega as Vozes do Sistema (Igual à extensão fazia)
function loadVoices() {
    let voices = synth.getVoices();
    voiceSelect.innerHTML = '';
    voices.forEach((voice, index) => {
        // Prioriza mostrar vozes em Português
        if (voice.lang.includes('pt')) {
            let option = document.createElement('option');
            option.value = index;
            option.textContent = `${voice.name} (${voice.lang})`;
            voiceSelect.appendChild(option);
        }
    });
    // Se não achar em PT, lista todas
    if(voiceSelect.children.length === 0) {
        voices.forEach((voice, index) => {
            let option = document.createElement('option');
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

// Atualiza o indicador de velocidade na tela
rateInput.addEventListener('input', () => { rateVal.textContent = rateInput.value; });

// 2. Carrega o vídeo local no player
videoFile.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        const fileURL = URL.createObjectURL(file);
        videoPlayer.src = fileURL;
    }
});

// 3. Processador (Parser) de arquivo de Legenda SRT
srtFile.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(evt) {
        const text = evt.target.result;
        subtitles = parseSRT(text);
        alert(`Sucesso! ${subtitles.length} linhas de legenda carregadas.`);
    };
    reader.readAsText(file);
});

// Função para converter o texto do SRT em segundos e frases legíveis
function parseSRT(data) {
    const regex = /(\d+)\r?\n(\d\d:\d\d:\d\d,\d\d\d) --> (\d\d:\d\d:\d\d,\d\d\d)\r?\n([\s\S]*?)(?=\r?\n\r?\n|\r?\n*\$)/g;
    let converted = [];
    let matches;
    
    while ((matches = regex.exec(data)) !== null) {
        converted.push({
            startTime: timeToSeconds(matches[2]),
            endTime: timeToSeconds(matches[3]),
            text: matches[4].replace(/\r?\n/g, ' ').replace(/<[^>]*>/g, '') // remove tags HTML como <i>
        });
    }
    return converted;
}

function timeToSeconds(timeString) {
    const parts = timeString.split(':');
    const secondsParts = parts[2].split(',');
    return parseInt(parts[0], 10) * 3600 + parseInt(parts[1], 10) * 60 + parseInt(secondsParts[0], 10) + parseInt(secondsParts[1], 10) / 1000;
}

// 4. Sincronização em Tempo Real (Evento de atualização de tempo do vídeo)
videoPlayer.addEventListener('timeupdate', () => {
    const currentTime = videoPlayer.currentTime;
    
    // Procura se existe uma legenda para o segundo atual do vídeo
    const activeSubIndex = subtitles.findIndex(sub => currentTime >= sub.startTime && currentTime <= sub.endTime);
    
    if (activeSubIndex !== -1 && activeSubIndex !== lastSubtitleIndex) {
        lastSubtitleIndex = activeSubIndex;
        narrarTexto(subtitles[activeSubIndex].text);
    }
});

// 5. Executa a voz de robô
function narrarTexto(texto) {
    // Cancela falas anteriores pendentes para não encavalar o áudio
    synth.cancel(); 
    
    let utterance = new SpeechSynthesisUtterance(texto);
    let selectedVoiceIndex = voiceSelect.value;
    let voices = synth.getVoices();
    
    if (voices[selectedVoiceIndex]) {
        utterance.voice = voices[selectedVoiceIndex];
    }
    
    utterance.rate = parseFloat(rateInput.value);
    synth.speak(utterance);
}

