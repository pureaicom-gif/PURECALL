import {PET_SPECIES,speciesName,getSkin,getCharacter} from './pet-catalog.js';

export const petMotion = {type:'idle', until:0};
let generation = 0, cleanupRecording = null, voiceTimer = null, nativeId = null;
const native = () => typeof navigator !== 'undefined' && navigator.userAgent.includes('PUREAndroid/');

export function reactPet(type) {
  petMotion.type = type;
  petMotion.until = performance.now() + 3500;
}

export function isPetVoiceEnabled() {
  try {
    return localStorage.getItem('pure_pet_voice') !== '0';
  } catch {
    return true;
  }
}

export function setPetVoiceEnabled(enabled) {
  try {
    localStorage.setItem('pure_pet_voice', enabled ? '1' : '0');
  } catch {}
  if (!enabled) {
    stopSpeakingVoice();
  }
}

let audioCtx = null;
function getAudioContext() {
  if (typeof window === 'undefined') return null;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;
  if (!audioCtx || audioCtx.state === 'closed') {
    try {
      audioCtx = new AudioContextClass();
    } catch {}
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

export function playPetChirp(species = 'cat', action = 'greet') {
  if (!isPetVoiceEnabled()) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    if (action === 'feed') {
      const osc1 = ctx.createOscillator(), osc2 = ctx.createOscillator(), gain = ctx.createGain();
      osc1.type = 'triangle'; osc2.type = 'sine';
      osc1.frequency.setValueAtTime(520, now);
      osc1.frequency.exponentialRampToValueAtTime(780, now + 0.08);
      osc2.frequency.setValueAtTime(650, now + 0.09);
      osc2.frequency.exponentialRampToValueAtTime(980, now + 0.18);
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.18, now + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
      osc1.connect(gain); osc2.connect(gain); gain.connect(ctx.destination);
      osc1.start(now); osc1.stop(now + 0.12);
      osc2.start(now + 0.08); osc2.stop(now + 0.25);
      return;
    }
    if (action === 'wash') {
      [587, 740, 880, 1174].forEach((freq, i) => {
        const osc = ctx.createOscillator(), gain = ctx.createGain();
        osc.type = 'sine';
        const t = now + i * 0.05;
        osc.frequency.setValueAtTime(freq, t);
        osc.frequency.exponentialRampToValueAtTime(freq * 1.25, t + 0.09);
        gain.gain.setValueAtTime(0.001, t);
        gain.gain.linearRampToValueAtTime(0.12, t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.13);
        osc.connect(gain); gain.connect(ctx.destination);
        osc.start(t); osc.stop(t + 0.14);
      });
      return;
    }
    if (action === 'sleep') {
      [523.25, 659.25, 783.99].forEach((freq, i) => {
        const osc = ctx.createOscillator(), gain = ctx.createGain();
        osc.type = 'sine';
        const t = now + i * 0.11;
        osc.frequency.setValueAtTime(freq, t);
        gain.gain.setValueAtTime(0.001, t);
        gain.gain.linearRampToValueAtTime(0.12, t + 0.04);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
        osc.connect(gain); gain.connect(ctx.destination);
        osc.start(t); osc.stop(t + 0.48);
      });
      return;
    }
    if (action === 'play') {
      [660, 880, 1100].forEach((freq, i) => {
        const osc = ctx.createOscillator(), gain = ctx.createGain();
        osc.type = 'triangle';
        const t = now + i * 0.07;
        osc.frequency.setValueAtTime(freq, t);
        gain.gain.setValueAtTime(0.001, t);
        gain.gain.linearRampToValueAtTime(0.15, t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
        osc.connect(gain); gain.connect(ctx.destination);
        osc.start(t); osc.stop(t + 0.18);
      });
      return;
    }
    if (species === 'cat') {
      const osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(500, now);
      osc.frequency.exponentialRampToValueAtTime(820, now + 0.16);
      osc.frequency.exponentialRampToValueAtTime(460, now + 0.38);
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.2, now + 0.06);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(now); osc.stop(now + 0.42);
    } else if (species === 'dog') {
      const osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(520, now);
      osc.frequency.exponentialRampToValueAtTime(290, now + 0.14);
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.22, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(now); osc.stop(now + 0.18);
    } else if (species === 'chick' || species === 'duck') {
      [0, 0.09].forEach(offset => {
        const osc = ctx.createOscillator(), gain = ctx.createGain();
        osc.type = 'sine';
        const t = now + offset;
        osc.frequency.setValueAtTime(1800, t);
        osc.frequency.exponentialRampToValueAtTime(2400, t + 0.06);
        gain.gain.setValueAtTime(0.001, t);
        gain.gain.linearRampToValueAtTime(0.18, t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
        osc.connect(gain); gain.connect(ctx.destination);
        osc.start(t); osc.stop(t + 0.08);
      });
    } else if (species === 'frog') {
      const osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(220, now);
      osc.frequency.linearRampToValueAtTime(320, now + 0.08);
      osc.frequency.linearRampToValueAtTime(180, now + 0.18);
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.14, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(now); osc.stop(now + 0.22);
    } else {
      [660, 880].forEach((freq, i) => {
        const osc = ctx.createOscillator(), gain = ctx.createGain();
        osc.type = 'sine';
        const t = now + i * 0.07;
        osc.frequency.setValueAtTime(freq, t);
        gain.gain.setValueAtTime(0.001, t);
        gain.gain.linearRampToValueAtTime(0.18, t + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
        osc.connect(gain); gain.connect(ctx.destination);
        osc.start(t); osc.stop(t + 0.24);
      });
    }
  } catch (err) {}
}

export function stopSpeakingVoice() {
  try {
    const synth = typeof window !== 'undefined' ? window.speechSynthesis : globalThis.speechSynthesis;
    synth?.cancel?.();
    const pureAndroid = typeof window !== 'undefined' ? window.PureAndroid : globalThis.PureAndroid;
    if (pureAndroid && typeof pureAndroid.stopSpeak === 'function') {
      pureAndroid.stopSpeak();
    } else if (native() && typeof location !== 'undefined') {
      location.href = 'pure-tts://stop';
    }
  } catch {}
  clearTimeout(voiceTimer);
  petMotion.until = 0;
}

export function stopCompanion() {
  generation++;
  cleanupRecording?.();
  cleanupRecording = null;
  stopSpeakingVoice();
  nativeId = null;
  petMotion.until = 0;
}

export function speak(text, enabled = true, status = () => {}, character = getCharacter('cat'), species = 'cat') {
  if (!enabled || !isPetVoiceEnabled()) return;
  if (!text || !text.trim()) return;

  playPetChirp(species);
  stopSpeakingVoice();

  reactPet('talk');
  petMotion.until = performance.now() + 45000;

  const cleanText = text.replace(/[\u{1F300}-\u{1FAFF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu, '').trim() || text;

  // Tier 1: PureAndroid JavascriptInterface
  const pureAndroid = typeof window !== 'undefined' ? window.PureAndroid : globalThis.PureAndroid;
  if (pureAndroid && typeof pureAndroid.speakText === 'function') {
    nativeId = String(Date.now());
    const ok = pureAndroid.speakText(cleanText, character.rate || 1.0, character.pitch || 1.15);
    if (ok) {
      status('กำลังพูด…');
      voiceTimer = setTimeout(() => {
        petMotion.until = 0;
        status('พร้อมคุยกับคุณ');
      }, 45000);
      return;
    }
  }

  // Tier 2: PureAndroid URL Scheme fallback
  if (native() && typeof location !== 'undefined') {
    nativeId = String(Date.now());
    location.href = 'pure-tts://speak?text=' + encodeURIComponent(cleanText) + '&id=' + nativeId + '&rate=' + (character.rate || 1.0) + '&pitch=' + (character.pitch || 1.15);
    status('กำลังพูด…');
    voiceTimer = setTimeout(() => {
      petMotion.until = 0;
      status('พร้อมคุยกับคุณ');
    }, 45000);
    return;
  }

  // Tier 3: Web Speech API
  const synth = typeof window !== 'undefined' ? window.speechSynthesis : globalThis.speechSynthesis;
  const Utterance = typeof SpeechSynthesisUtterance !== 'undefined' ? SpeechSynthesisUtterance : globalThis.SpeechSynthesisUtterance;
  if (!synth || !Utterance) {
    petMotion.until = 0;
    status('เครื่องนี้ไม่มีระบบอ่านออกเสียง');
    return;
  }

  try {
    const utterance = new Utterance(cleanText);
    if (typeof window !== 'undefined') window._purePetUtterance = utterance;
    utterance.lang = 'th-TH';
    utterance.rate = character.rate || 1.0;
    utterance.pitch = character.pitch || 1.15;

    const voices = synth.getVoices ? synth.getVoices() : [];
    const thaiVoice = voices.find(v => v.lang && (v.lang.startsWith('th') || v.lang === 'tha'));
    if (thaiVoice) utterance.voice = thaiVoice;

    utterance.onstart = () => status('กำลังพูด…');
    utterance.onend = () => {
      petMotion.until = 0;
      if (typeof window !== 'undefined') window._purePetUtterance = null;
      status('พร้อมคุยกับคุณ');
    };
    utterance.onerror = () => {
      petMotion.until = 0;
      if (typeof window !== 'undefined') window._purePetUtterance = null;
      status('พร้อมคุยกับคุณ');
    };

    synth.speak(utterance);
  } catch (err) {
    petMotion.until = 0;
    status('พร้อมคุยกับคุณ');
  }
}

export function speakPetActivity(action, pet) {
  if (!pet) return;
  const character = getCharacter(pet.kind);
  const quotes = {
    feed: ['งั่มๆ อร่อยจัง ขอบคุณนะ ฅ', 'อิ่มอร่อยสุดๆ เลย ขอบคุณสำหรับอาหารนะ!'],
    play: ['เย้! เล่นสนุกที่สุดเลย มาเล่นกันอีกนะ!', 'กระโดดดึ๋งๆ สนุกจังเลย!'],
    wash: ['ซ่าๆ อาบน้ำสดชื่น ตัวหอมฟุ้งเลย ฅ', 'สะอาดเอี่ยมอ่อง สบายตัวจัง!'],
    sleep: ['ฮาววว ง่วงจัง ขอพักผ่อนนอนหลับสบายนะ zZ', 'ฝันดีนะ พักผ่อนให้เต็มที่นะ ☾'],
    decorate: ['ว้าว ห้องใหม่สวยถูกใจมากเลย!', 'ห้องสวยจัง ขอบคุณที่ตกแต่งให้นะ ฅ']
  };
  const list = quotes[action];
  if (!list) return;
  const text = list[Math.floor(Math.random() * list.length)];
  const bubble = document.querySelector('.pet-speech-bubble');
  if (bubble) bubble.textContent = text;
  playPetChirp(pet.kind, action);
  speak(text, isPetVoiceEnabled(), () => {}, character, pet.kind);
}

if (typeof window !== 'undefined') {
  window.addEventListener('pure-tts-state', e => {
    if (e.detail?.id !== nativeId) return;
    const label = document.querySelector('#pet-voice-status');
    if (label) {
      label.textContent = e.detail.state === 'start' ? 'กำลังพูด…' : e.detail.state === 'error' ? 'ไม่มีเสียงภาษาไทย กรุณาติดตั้งเสียงใน Android' : 'พร้อมคุยกับคุณ';
    }
    if (e.detail.state !== 'start') {
      clearTimeout(voiceTimer);
      petMotion.until = 0;
      nativeId = null;
    }
  });
}

function waveBlob(chunks, sampleRate) {
  const samples = chunks.reduce((n, a) => n + a.length, 0), all = new Float32Array(samples);
  let pos = 0;
  for (const a of chunks) {
    all.set(a, pos);
    pos += a.length;
  }
  const rate = 16000, length = Math.floor(samples * rate / sampleRate), buffer = new ArrayBuffer(44 + length * 2), v = new DataView(buffer);
  const str = (at, s) => [...s].forEach((c, i) => v.setUint8(at + i, c.charCodeAt(0)));
  str(0, 'RIFF');
  v.setUint32(4, 36 + length * 2, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, 'data');
  v.setUint32(40, length * 2, true);
  for (let i = 0; i < length; i++) {
    const x = i * sampleRate / rate, j = Math.floor(x), f = x - j, s = Math.max(-1, Math.min(1, (all[j] || 0) * (1 - f) + (all[j + 1] || 0) * f));
    v.setInt16(44 + i * 2, s < 0 ? s * 32768 : s * 32767, true);
  }
  return new Blob([buffer], {type: 'audio/wav'});
}

function timeGreeting(name) {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return `อรุณสวัสดิ์นะ! วันนี้ ${name} พร้อมอยู่เป็นเพื่อนคุณแล้ว ฅ`;
  if (h >= 12 && h < 17) return `สวัสดีตอนบ่าย! ทานอะไรหรือยัง อย่าลืมพักสายตาบ้างนะ ฅ`;
  if (h >= 17 && h < 21) return `ยินดีต้อนรับกลับมา! วันนี้เหนื่อยไหม มาพักผ่อนกับ ${name} นะ ฅ`;
  return `ดึกแล้วนะคุณ คืนนี้อย่านอนดึกมากนะ ${name} เป็นห่วง ☾`;
}

export async function mountCompanion({api, esc, state, toast, renderPet, isCalling}) {
  stopCompanion();
  const gen = generation, p = state.pet, visitor = state.visit, character = getCharacter(p.kind);
  const canvas = document.querySelector('#pet-canvas');
  if (!canvas) return;
  const stage = canvas.parentElement;

  let toggleBtn = stage.querySelector('#pet-stage-voice-toggle');
  if (!toggleBtn) {
    toggleBtn = document.createElement('button');
    toggleBtn.type = 'button';
    toggleBtn.id = 'pet-stage-voice-toggle';
    toggleBtn.className = 'pet-voice-toggle-btn';
    toggleBtn.innerHTML = isPetVoiceEnabled() ? '🔊 เสียงพูด: เปิด' : '🔇 เสียงพูด: ปิด';
    toggleBtn.title = 'เปิด/ปิดเสียงพูดและเสียงร้องของสัตว์เลี้ยง';
    toggleBtn.onclick = (e) => {
      e.stopPropagation();
      const next = !isPetVoiceEnabled();
      setPetVoiceEnabled(next);
      toggleBtn.innerHTML = next ? '🔊 เสียงพูด: เปิด' : '🔇 เสียงพูด: ปิด';
      const chk = document.querySelector('#pet-speak-enabled');
      if (chk) chk.checked = next;
      toast(next ? 'เปิดเสียงพูดสัตว์เลี้ยงแล้ว' : 'ปิดเสียงพูดสัตว์เลี้ยงแล้ว');
      if (next) {
        speak('เปิดเสียงแล้วจ้า ฅ', true, () => {}, character, p.kind);
      }
    };
    stage.append(toggleBtn);
  }

  const bubble = document.createElement('div');
  bubble.className = 'pet-speech-bubble';
  const greeting = visitor ? `สวัสดีจ้า! ยินดีต้อนรับสู่ห้องของ ${visitor.name} ฅ` : timeGreeting(p.name);
  bubble.textContent = greeting;
  stage.append(bubble);
  reactPet('wave');

  // Automatic gentle welcome speech on entry
  setTimeout(() => {
    if (gen === generation) {
      speak(greeting, isPetVoiceEnabled(), () => {}, character, p.kind);
    }
  }, 400);

  canvas.tabIndex = 0;
  canvas.setAttribute('role', 'button');
  canvas.setAttribute('aria-label', 'ลูบหัว ' + p.name);
  const tapGreetings = [
    character.love,
    character.greeting,
    `วันนี้เป็นยังไงบ้าง เล่าให้ ${p.name} ฟังได้นะ ฅ`,
    character.dance,
    `รักเจ้านายที่สุดเลย ♡`
  ];
  let tapIndex = 0;
  const petTap = () => {
    reactPet('love');
    const t = tapGreetings[tapIndex++ % tapGreetings.length];
    bubble.textContent = t;
    playPetChirp(p.kind, 'love');
    speak(t, isPetVoiceEnabled(), () => {}, character, p.kind);
  };
  canvas.onclick = petTap;
  canvas.onkeydown = e => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      petTap();
    }
  };

  if (visitor) return;

  const tabs = document.createElement('div');
  tabs.className = 'pet-room-tabs';
  tabs.innerHTML = '<button data-pet-jump="room">ฅ ห้องของน้อง</button><button data-pet-jump="chat">◉ คุยกับ AI</button><button data-pet-jump="wardrobe">✦ สัตว์และสกิน</button>';
  document.querySelector('.page-header').after(tabs);

  const panel = document.createElement('section');
  panel.className = 'companion-section';
  panel.innerHTML = '<p class="muted">กำลังเปิดห้อง AI ของน้อง…</p>';
  document.querySelector('#page').append(panel);

  let config;
  try {
    config = await api('/pet-ai');
  } catch (e) {
    if (gen === generation) panel.textContent = e.message;
    return;
  }
  if (gen !== generation) return;

  panel.innerHTML = `
    <div class="companion-grid">
      <div class="card companion-chat">
        <p class="eyebrow">A FRIEND WITH A LITTLE PERSONALITY</p>
        <h2>คุยกับ ${esc(p.name)} <span class="ai-tag">AI PET</span></h2>
        <p class="muted pet-consent">ข้อความและเสียงที่กดส่งจะส่งให้ PURE AI เพื่อให้น้องตอบกลับ เก็บบทสนทนาล่าสุด 10 คู่ในบัญชี ไม่เก็บไฟล์เสียงบนเซิร์ฟเวอร์</p>
        <div class="pet-quick-actions">
          <button data-react="greet">ทักทาย 👋</button>
          <button data-react="wave">โบกมือ</button>
          <button data-react="love">ลูบหัว ♡</button>
          <button data-react="dance">เต้นด้วยกัน ♪</button>
          <button data-react="sleep">พักผ่อน ☾</button>
        </div>
        <div id="pet-chat-history" class="pet-chat-history" aria-live="polite"></div>
        <p id="pet-voice-status" class="voice-status" role="status">${config.ready ? 'พร้อมคุยกับคุณ' : 'PURE AI ยังไม่พร้อมใช้งาน · ติดต่อผู้ดูแล'}</p>
        <form id="pet-chat-form">
          <input id="pet-chat-input" maxlength="2000" placeholder="เล่าเรื่องวันนี้ให้น้องฟัง…" aria-label="ข้อความถึงสัตว์เลี้ยง" required>
          <button class="primary" id="pet-chat-send">ส่ง ⌲</button>
        </form>
        <div class="pet-voice-controls">
          <button id="pet-record" class="secondary">◉ กดเพื่อพูด</button>
          <button id="pet-stop-voice" class="text-button">หยุดเสียง</button>
          <label><input id="pet-speak-enabled" type="checkbox" ${isPetVoiceEnabled() ? 'checked' : ''}> อ่านคำตอบออกเสียง</label>
          <button type="button" id="pet-auto-greet" class="text-button" style="margin-left:auto;">✨ ให้น้องทักทาย</button>
        </div>
        <small>อัดได้สูงสุด 20 วินาที กดอีกครั้งเพื่อส่ง • ต้องใช้ HTTPS/localhost และอนุญาตไมค์</small>
        <button id="pet-clear-history" class="text-button">ล้างประวัติคุยกับน้อง</button>
      </div>
      <div>
        <div class="card">
          <p class="eyebrow">CHOOSE YOUR COMPANION</p>
          <h3>วันนี้อยากมีเพื่อนแบบไหน</h3>
          <p class="current-pet-character muted">${esc(character.trait)}</p>
          <div class="species-grid">
            ${PET_SPECIES.map(s => `<button data-species="${s.id}" class="species-choice ${p.kind === s.id ? 'chosen' : ''}"><span>${s.symbol}</span>${s.name}</button>`).join('')}
          </div>
          <label class="pet-personality-label" for="pet-personality">บุคลิกของน้อง</label>
          <select id="pet-personality">
            ${config.personalities.map(x => `<option value="${x.id}" ${p.personality === x.id ? 'selected' : ''}>${x.name} · ${x.description}</option>`).join('')}
          </select>
        </div>
        <div class="card">
          <p class="eyebrow">A WARDROBE FOR EVERY MOOD</p>
          <h3>สกินของ ${esc(p.name)}</h3>
          <div class="skin-grid">
            ${config.skins.map(s => `<button data-skin="${s.id}" class="skin-choice ${p.skin === s.id ? 'chosen' : ''}"><span class="skin-swatch skin-${s.id}">${s.accessory === 'helmet' ? '◉' : s.accessory === 'wizard' ? '✦' : s.accessory === 'moon' ? '☾' : s.accessory === 'crown' ? '👑' : s.accessory === 'flower' ? '🌸' : 'ฅ'}</span><strong>${s.name}</strong><small>${p.skin === s.id ? 'ใส่อยู่ ✓' : config.owned.includes(s.id) ? 'เลือกใส่' : s.price + ' เหรียญ'}</small></button>`).join('')}
          </div>
          <small>ซื้อครั้งเดียว ใช้ได้กับสัตว์ทุกชนิด ไม่มีเงินจริง</small>
        </div>
      </div>
    </div>
  `;

  const $ = s => panel.querySelector(s);
  const status = text => {
    if (gen === generation && $('#pet-voice-status')) {
      $('#pet-voice-status').textContent = text;
    }
  };

  $('#pet-speak-enabled').onchange = e => {
    setPetVoiceEnabled(e.target.checked);
    const tb = document.querySelector('#pet-stage-voice-toggle');
    if (tb) tb.innerHTML = e.target.checked ? '🔊 เสียงพูด: เปิด' : '🔇 เสียงพูด: ปิด';
  };

  tabs.querySelectorAll('button').forEach(b => b.onclick = () => {
    const target = b.dataset.petJump === 'room' ? canvas : b.dataset.petJump === 'chat' ? $('.companion-chat') : $('[data-species]').closest('.card');
    target.scrollIntoView({behavior: 'smooth', block: 'start'});
  });

  let history = config.history, busy = false, recording = false, finishRecording = null;

  function renderHistory() {
    $('#pet-chat-history').innerHTML = history.length
      ? history.map(m => `<div class="pet-chat-message ${m.role === 'user' ? 'own' : ''}"><small>${m.role === 'user' ? 'คุณ' : esc(p.name) + ' · AI'}</small><p>${esc(m.text)}</p></div>`).join('')
      : '<p class="muted">“วันนี้เป็นยังไงบ้าง มาเล่าให้ฟังได้นะ”<br><small>คำทักทายของแอป · เริ่มส่งข้อความเพื่อคุยกับ PURE AI</small></p>';
    $('#pet-chat-history').scrollTop = $('#pet-chat-history').scrollHeight;
  }
  renderHistory();

  function lock(value) {
    busy = value;
    $('#pet-chat-send').disabled = value;
    $('#pet-record').disabled = value;
    panel.querySelectorAll('[data-species],[data-skin],#pet-personality,#pet-clear-history,#pet-auto-greet').forEach(b => b.disabled = value);
  }

  async function send(body, voice = false) {
    if (busy) return;
    lock(true);
    status('น้องกำลังคิด…');
    reactPet('wave');
    try {
      const d = await api(voice ? '/pet-ai/voice' : '/pet-ai/chat', body);
      if (gen !== generation) return;
      history.push({role: 'user', text: voice ? '[ข้อความเสียง]' : body.text}, {role: 'model', text: d.text});
      history = history.slice(-20);
      renderHistory();
      $('#pet-chat-input').value = '';
      bubble.textContent = d.text.slice(0, 100);
      status('น้องตอบแล้ว');
      speak(d.text, $('#pet-speak-enabled').checked, status, character, p.kind);
    } catch (e) {
      status(e.message);
      toast(e.message);
    } finally {
      if (gen === generation) lock(false);
    }
  }

  $('#pet-chat-form').onsubmit = e => {
    e.preventDefault();
    if (!recording) send({text: $('#pet-chat-input').value.trim()});
  };

  $('#pet-auto-greet')?.addEventListener('click', () => {
    if (!busy && !recording) send({text: 'ทักทายฉันหน่อย วันนี้เธอเป็นยังไงบ้าง'});
  });

  panel.querySelectorAll('[data-react]').forEach(b => b.onclick = () => {
    if (busy || recording) return;
    const act = b.dataset.react;
    reactPet(act);
    let text = '';
    if (act === 'greet') text = character.greeting;
    else if (act === 'wave') text = `สวัสดีนะ! วันนี้ ${p.name} อยู่ตรงนี้เสมอ ฅ`;
    else if (act === 'love') text = character.love;
    else if (act === 'dance') text = character.dance;
    else if (act === 'sleep') text = 'ขอนอนพักผ่อนเอาแรงแป๊บหนึ่งนะ zZ';
    bubble.textContent = text;
    status(act === 'greet' ? 'คำทักทายประจำตัว' : 'กำลังแสดงท่าทาง');
    playPetChirp(p.kind, act);
    speak(text, $('#pet-speak-enabled')?.checked, status, character, p.kind);
  });

  panel.querySelectorAll('[data-species]').forEach(b => b.onclick = async () => {
    if (busy || recording) return;
    lock(true);
    try {
      state.pet = (await api('/pet', {name: p.name, kind: b.dataset.species})).pet;
      renderPet();
      toast('เปลี่ยนเป็น' + speciesName(b.dataset.species) + 'แล้ว');
    } catch (e) {
      toast(e.message);
      lock(false);
    }
  });

  panel.querySelectorAll('[data-skin]').forEach(b => b.onclick = async () => {
    if (busy || recording) return;
    const skin = getSkin(b.dataset.skin);
    if (!config.owned.includes(skin.id) && !confirm(`ซื้อสกิน ${skin.name} ด้วย ${skin.price} เหรียญ?`)) return;
    lock(true);
    try {
      state.pet = (await api('/pet-ai/skin', {skin: skin.id})).pet;
      renderPet();
      toast('ใส่สกิน ' + skin.name + ' แล้ว');
    } catch (e) {
      toast(e.message);
      lock(false);
    }
  });

  $('#pet-personality').onchange = async () => {
    if (recording) return;
    try {
      state.pet = (await api('/pet-ai/personality', {personality: $('#pet-personality').value})).pet;
      toast('บันทึกบุคลิกแล้ว');
    } catch (e) {
      toast(e.message);
    }
  };

  $('#pet-clear-history').onclick = async () => {
    if (!confirm('ลบประวัติคุยกับสัตว์เลี้ยงทั้งหมด?')) return;
    try {
      await api('/pet-ai/history', null, 'DELETE');
      history = [];
      renderHistory();
    } catch (e) {
      toast(e.message);
    }
  };

  $('#pet-stop-voice').onclick = () => {
    stopSpeakingVoice();
    status('หยุดเสียงแล้ว');
  };

  $('#pet-record').onclick = async () => {
    if (recording) {
      finishRecording?.(true);
      return;
    }
    if (busy) return;
    if (!config.ready) return status('PURE AI ยังไม่พร้อมใช้งาน');
    if (isCalling()) return toast('วางสายก่อนคุยเสียงกับสัตว์เลี้ยง');
    if (!navigator.mediaDevices?.getUserMedia) return status('ไมโครโฟนต้องใช้ HTTPS หรือ localhost');

    lock(true);
    stopSpeakingVoice();

    let stream, context, source, processor, gain, timer, started = 0, frames = [], done = false;
    const cleanup = () => {
      clearTimeout(timer);
      if (processor) {
        processor.onaudioprocess = null;
        processor.disconnect();
      }
      source?.disconnect();
      gain?.disconnect();
      stream?.getTracks().forEach(t => t.stop());
      context?.close().catch(() => {});
      recording = false;
      cleanupRecording = null;
    };

    finishRecording = async submit => {
      if (done) return;
      done = true;
      const rate = context?.sampleRate || 16000, duration = performance.now() - started;
      cleanup();
      if (gen !== generation) return;
      $('#pet-record').textContent = '◉ กดเพื่อพูด';
      $('#pet-record').classList.remove('recording');
      lock(false);
      if (submit && duration > 300 && frames.length) {
        const body = new FormData();
        body.append('audio', waveBlob(frames, rate), 'pet-voice.wav');
        frames = [];
        await send(body, true);
      } else {
        status('ยกเลิกการอัดเสียง');
      }
    };

    cleanupRecording = () => {
      done = true;
      cleanup();
    };

    try {
      stream = await navigator.mediaDevices.getUserMedia({audio: {echoCancellation: true, noiseSuppression: true}, video: false});
      if (gen !== generation) {
        cleanup();
        return;
      }
      context = new AudioContext();
      await context.resume();
      source = context.createMediaStreamSource(stream);
      processor = context.createScriptProcessor(4096, 1, 1);
      gain = context.createGain();
      gain.gain.value = 0;
      processor.onaudioprocess = e => {
        if (!done) frames.push(new Float32Array(e.inputBuffer.getChannelData(0)));
      };
      source.connect(processor);
      processor.connect(gain);
      gain.connect(context.destination);
      started = performance.now();
      recording = true;
      $('#pet-record').disabled = false;
      $('#pet-record').textContent = '■ หยุดและส่งเสียง';
      $('#pet-record').classList.add('recording');
      status('กำลังฟัง… กดอีกครั้งเพื่อส่ง (สูงสุด 20 วินาที)');
      timer = setTimeout(() => finishRecording(true), 20000);
    } catch (e) {
      cleanup();
      if (gen === generation) {
        lock(false);
        status('เปิดไมค์ไม่ได้ กรุณาอนุญาตไมโครโฟน');
      }
    }
  };
}
