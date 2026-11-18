const form = document.querySelector("#download-form");
const urlInput = document.querySelector("#url-input");
const urlField = document.querySelector("#url-field");
const status = document.querySelector("#form-status");
const submitButton = form.querySelector(".submit-btn");

const platforms = [
  { name: "YouTube", hosts: ["youtube.com", "youtu.be", "youtube-nocookie.com"] },
  { name: "TikTok", hosts: ["tiktok.com", "vt.tiktok.com"] },
  { name: "Facebook", hosts: ["facebook.com", "fb.watch", "fb.com"] },
];

function platformFor(url) {
  return platforms.find(({ hosts }) => hosts.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`)));
}

function showMessage(message, kind = "error") {
  status.textContent = message;
  status.classList.toggle("success", kind === "success");
  urlField.classList.toggle("error", kind === "error");
}

urlInput.addEventListener("input", () => {
  urlField.classList.remove("error");
  status.textContent = "";
  status.classList.remove("success");
});

document.querySelectorAll('input[name="format"]').forEach((radio) => {
  radio.addEventListener("change", () => {
    document.querySelectorAll(".format-option").forEach((option) => option.classList.toggle("selected", option.contains(radio) && radio.checked));
  });
});

document.querySelector("#paste-button").addEventListener("click", async () => {
  try {
    const text = await navigator.clipboard.readText();
    if (!text) return showMessage("คลิปบอร์ดยังไม่มีลิงก์ที่คัดลอกไว้");
    urlInput.value = text.trim();
    urlInput.dispatchEvent(new Event("input"));
    urlInput.focus();
  } catch {
    urlInput.focus();
    showMessage("เบราว์เซอร์ไม่อนุญาตให้อ่านคลิปบอร์ด กรุณาวางลิงก์ในช่องนี้");
  }
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  status.textContent = "";
  urlField.classList.remove("error");

  let url;
  try {
    url = new URL(urlInput.value.trim());
    if (!/^https?:$/.test(url.protocol)) throw new Error("protocol");
  } catch {
    return showMessage("กรุณาวางลิงก์วิดีโอที่ถูกต้อง เช่น https://...");
  }

  const platform = platformFor(url);
  if (!platform) return showMessage("ลิงก์นี้ยังไม่รองรับ กรุณาใช้ลิงก์จาก YouTube, TikTok หรือ Facebook");

  const format = form.elements.format.value;
  submitButton.disabled = true;
  submitButton.querySelector("span:first-child").textContent = "กำลังเตรียมไฟล์...";
  try {
    const response = await fetch("/api/download", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: url.href, format }),
    });
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      throw new Error(result.message || "ไม่สามารถเตรียมไฟล์ได้ในขณะนี้");
    }

    const file = await response.blob();
    const disposition = response.headers.get("Content-Disposition") || "";
    const encodedName = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
    const plainName = disposition.match(/filename="?([^";]+)"?/i)?.[1];
    const filename = encodedName ? decodeURIComponent(encodedName) : plainName || `download.${format}`;
    const blobUrl = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = blobUrl;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(blobUrl);
    showMessage(`พร้อมดาวน์โหลดไฟล์ ${format.toUpperCase()} จาก ${platform.name}`, "success");
  } catch (error) {
    const message = error instanceof TypeError
      ? "ยังเชื่อมต่อบริการดาวน์โหลดไม่ได้ กรุณาตั้งค่าเซิร์ฟเวอร์ API ก่อนใช้งานจริง"
      : error.message;
    showMessage(message);
  } finally {
    submitButton.disabled = false;
    submitButton.querySelector("span:first-child").textContent = "เตรียมดาวน์โหลด";
  }
});

// Original, lightweight 2D night-flower valley backdrop.
const canvas = document.querySelector("#valley-canvas");
const ctx = canvas.getContext("2d", { alpha: false });
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
let width = 0;
let height = 0;
let pixelRatio = 1;
let pointer = { x: -1000, y: -1000 };
let drift = 0;
let lastFrame = 0;
let sceneVisible = true;
const frameInterval = 1000 / 24;
let seed = 80521;
const random = () => {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
};
const blossoms = Array.from({ length: 64 }, () => ({
  x: random(),
  depth: random(),
  size: .5 + random() * 1.8,
  hue: [112, 137, 27, 45][Math.floor(random() * 4)],
  phase: random() * Math.PI * 2,
  petals: 4 + Math.floor(random() * 3),
}));
const stars = Array.from({ length: 64 }, () => ({ x: random(), y: random() * .44, size: .4 + random() * .8, phase: random() * 6.28 }));

function resizeScene() {
  const bounds = canvas.getBoundingClientRect();
  width = bounds.width;
  height = bounds.height;
  pixelRatio = 1;
  canvas.width = Math.round(width * pixelRatio);
  canvas.height = Math.round(height * pixelRatio);
  ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  paintScene(performance.now());
}

function hill(points, color) {
  ctx.beginPath();
  ctx.moveTo(0, height);
  ctx.lineTo(0, points[0] * height);
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1], next = points[i];
    const x = (i / (points.length - 1)) * width;
    const prevX = ((i - 1) / (points.length - 1)) * width;
    ctx.quadraticCurveTo((prevX + x) / 2, prev * height, x, next * height);
  }
  ctx.lineTo(width, height);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

function paintScene(now) {
  if (!width || !height) return;
  const seconds = now * .001;
  ctx.globalCompositeOperation = "source-over";
  const sky = ctx.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, "#070c0a");
  sky.addColorStop(.48, "#101b16");
  sky.addColorStop(1, "#09100c");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);

  const moonGlow = ctx.createRadialGradient(width * .52, height * .49, 2, width * .52, height * .49, width * .45);
  moonGlow.addColorStop(0, "rgba(120,155,105,.17)");
  moonGlow.addColorStop(.45, "rgba(72,117,82,.075)");
  moonGlow.addColorStop(1, "rgba(25,48,35,0)");
  ctx.fillStyle = moonGlow;
  ctx.fillRect(0, 0, width, height);

  for (const star of stars) {
    const twinkle = reducedMotion ? .5 : .28 + .52 * (Math.sin(seconds * .7 + star.phase) + 1) / 2;
    ctx.fillStyle = `rgba(231,239,209,${twinkle})`;
    ctx.beginPath();
    ctx.arc(star.x * width, star.y * height, star.size, 0, Math.PI * 2);
    ctx.fill();
  }

  hill([.57,.50,.55,.46,.53,.58,.50,.55,.60], "#0b1711");
  hill([.63,.61,.66,.58,.62,.69,.61,.64,.70], "#0a140e");
  hill([.77,.70,.81,.69,.76,.85,.73,.80,.88], "#08110c");

  const horizon = height * .37;
  ctx.globalCompositeOperation = "lighter";
  for (const flower of blossoms) {
    const depth = (flower.depth + drift) % 1;
    const perspective = Math.pow(depth, 1.42);
    const y = horizon + perspective * height * .77;
    const side = Math.abs(flower.x - .5);
    const valleyX = .5 + (flower.x - .5) * (1.05 + perspective * 1.45);
    const x = valleyX * width;
    const scale = (.75 + perspective * 3.1) * flower.size;
    const dx = x - pointer.x, dy = y - pointer.y;
    const distance = Math.hypot(dx, dy);
    const pull = Math.max(0, 1 - distance / 115) * 19;
    const px = distance < 115 ? x + dx / (distance || 1) * pull : x;
    const py = distance < 115 ? y + dy / (distance || 1) * pull : y;
    const centerGlow = Math.max(0, 1 - distance / 130);
    const alpha = Math.min(.9, .13 + perspective * .75 + centerGlow * .4);
    const stem = Math.max(0, scale * 2.4);
    const sway = reducedMotion ? 0 : Math.sin(seconds * .55 + flower.phase) * scale * .35;

    if (perspective > .16 && side > .11) {
      ctx.globalAlpha = alpha * .5;
      ctx.strokeStyle = `hsla(${flower.hue}, 35%, 54%, ${alpha})`;
      ctx.lineWidth = Math.max(.45, scale * .11);
      ctx.beginPath();
      ctx.moveTo(px, py + scale * .35);
      ctx.quadraticCurveTo(px + sway, py + stem * .55, px + sway * .65, py + stem);
      ctx.stroke();
    }

    const bloom = scale * (1.05 + perspective * .72);
    const glow = .11 + perspective * .52 + centerGlow * .65;
    ctx.globalAlpha = Math.min(1, glow);
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.fillStyle = `hsla(${flower.hue}, 72%, ${70 + centerGlow * 15}%, ${alpha})`;
    for (let petal = 0; petal < flower.petals; petal++) {
      const angle = (Math.PI * 2 * petal) / flower.petals + flower.phase * .08 + sway * .025;
      ctx.beginPath();
      ctx.ellipse(px + Math.cos(angle) * bloom * .62, py + Math.sin(angle) * bloom * .62, Math.max(.7, bloom * .43), Math.max(.6, bloom * .27), angle, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = `rgba(255,238,180,${alpha})`;
    ctx.beginPath();
    ctx.arc(px, py, Math.max(.65, bloom * .23), 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
}

function animate(now) {
  if (!sceneVisible) return;
  if (now - lastFrame < frameInterval) {
    requestAnimationFrame(animate);
    return;
  }
  if (!reducedMotion) {
    const delta = Math.min((now - (lastFrame || now)) / 1000, .05);
    drift = (drift + delta * .022) % 1;
  }
  lastFrame = now;
  paintScene(now);
  if (!reducedMotion) requestAnimationFrame(animate);
}

window.addEventListener("resize", resizeScene, { passive: true });
window.addEventListener("pointermove", (event) => { pointer = { x: event.clientX, y: event.clientY }; }, { passive: true });
window.addEventListener("pointerleave", () => { pointer = { x: -1000, y: -1000 }; }, { passive: true });
document.addEventListener("visibilitychange", () => {
  sceneVisible = !document.hidden;
  if (sceneVisible && !reducedMotion) {
    lastFrame = performance.now();
    requestAnimationFrame(animate);
  }
});
const heroObserver = new IntersectionObserver(([entry]) => {
  sceneVisible = entry.isIntersecting && !document.hidden;
  if (sceneVisible && !reducedMotion) requestAnimationFrame(animate);
}, { threshold: 0 });
heroObserver.observe(document.querySelector(".hero"));
resizeScene();
if (!reducedMotion) requestAnimationFrame(animate);

// A very quiet, generated ambient chord. Audio begins only after the visitor opts in.
const soundButton = document.querySelector("#sound-button");
let audioContext;
let ambientGain;
let oscillators = [];
soundButton.addEventListener("click", async () => {
  const turnOn = soundButton.getAttribute("aria-pressed") !== "true";
  if (!audioContext && turnOn) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    audioContext = new AudioContextClass();
    ambientGain = audioContext.createGain();
    const filter = audioContext.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 260;
    ambientGain.gain.value = 0;
    filter.connect(ambientGain);
    ambientGain.connect(audioContext.destination);
    for (const [frequency, volume] of [[55, .32], [82.41, .18], [110, .11]]) {
      const oscillator = audioContext.createOscillator();
      const voiceGain = audioContext.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      voiceGain.gain.value = volume;
      oscillator.connect(voiceGain);
      voiceGain.connect(filter);
      oscillator.start();
      oscillators.push(oscillator);
    }
  }
  if (!audioContext) return;
  await audioContext.resume();
  const now = audioContext.currentTime;
  ambientGain.gain.cancelScheduledValues(now);
  ambientGain.gain.setTargetAtTime(turnOn ? .024 : 0, now, .7);
  soundButton.setAttribute("aria-pressed", String(turnOn));
  soundButton.setAttribute("aria-label", turnOn ? "ปิดเสียงบรรยากาศ" : "เปิดเสียงบรรยากาศ");
});

const copyPromptPayButton = document.querySelector("#copy-promptpay");
const donateStatus = document.querySelector("#donate-status");
copyPromptPayButton.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText("0656866237");
  } catch {
    const temporaryInput = document.createElement("textarea");
    temporaryInput.value = "0656866237";
    temporaryInput.setAttribute("readonly", "");
    temporaryInput.style.position = "fixed";
    temporaryInput.style.opacity = "0";
    document.body.append(temporaryInput);
    temporaryInput.select();
    const copied = document.execCommand("copy");
    temporaryInput.remove();
    if (!copied) {
      donateStatus.textContent = "คัดลอกไม่สำเร็จ กรุณากดค้างที่เบอร์เพื่อคัดลอก";
      return;
    }
  }
  donateStatus.textContent = "คัดลอกเบอร์ PromptPay แล้ว";
});
