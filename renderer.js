const progressBar = document.querySelector(".progress-bar");
const progressFill = document.querySelector(".progress-fill");
const progressKnob = document.querySelector(".progress-knob");
const timeEl = document.querySelector(".time");
const durationEl = document.querySelector(".duration");
const playToggle = document.querySelector(".play-toggle");
const playIcon = playToggle?.querySelector("img");

let isDragging = false;
let isPlaying = false;
let resumeAfterDrag = false;
let targetProgress = 0.18;
let displayedProgress = 0.18;
let lastTime = performance.now();
let rafId = null;

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const updateUI = (progress) => {
  const percent = progress * 100;
  progressFill.style.width = `${percent}%`;
  progressKnob.style.left = `${percent}%`;
  progressBar.setAttribute("aria-valuenow", Math.round(percent));
  if (timeEl && durationEl) {
    const totalSeconds = parseTime(durationEl.textContent);
    const currentSeconds = Math.round(totalSeconds * progress);
    timeEl.textContent = formatTime(currentSeconds);
  }
};

const parseTime = (text) => {
  const match = (text || "").trim().match(/^(\d+):(\d{2})$/);
  if (!match) return 0;
  return Number(match[1]) * 60 + Number(match[2]);
};

const formatTime = (seconds) => {
  const safeSeconds = Math.max(0, seconds);
  const minutes = Math.floor(safeSeconds / 60);
  const remaining = safeSeconds % 60;
  return `${minutes}:${String(remaining).padStart(2, "0")}`;
};

const updateFromPointer = (event) => {
  const rect = progressBar.getBoundingClientRect();
  const ratio = (event.clientX - rect.left) / rect.width;
  targetProgress = clamp(ratio, 0, 1);
};

const tick = (now) => {
  const delta = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;

  if (isPlaying && !isDragging) {
    const totalSeconds = parseTime(durationEl?.textContent);
    if (totalSeconds > 0) {
      targetProgress = Math.min(1, targetProgress + delta / totalSeconds);
      if (targetProgress >= 1) {
        setPlaying(false);
      }
    }
  }

  const followSpeed = isDragging ? 26 : 18;
  const t = 1 - Math.exp(-followSpeed * delta);
  displayedProgress += (targetProgress - displayedProgress) * t;

  updateUI(displayedProgress);

  if (
    isDragging ||
    isPlaying ||
    Math.abs(targetProgress - displayedProgress) > 0.0005
  ) {
    rafId = requestAnimationFrame(tick);
  } else {
    rafId = null;
  }
};

const ensureTicking = () => {
  if (rafId === null) {
    lastTime = performance.now();
    rafId = requestAnimationFrame(tick);
  }
};

progressBar.addEventListener("pointerdown", (event) => {
  isDragging = true;
  progressBar.classList.add("is-dragging");
  progressBar.setPointerCapture(event.pointerId);
  if (isPlaying) {
    resumeAfterDrag = true;
    setPlaying(false);
    playToggle?.classList.add("is-drag-paused");
  }
  updateFromPointer(event);
  ensureTicking();
});

progressBar.addEventListener("pointermove", (event) => {
  if (!isDragging) return;
  updateFromPointer(event);
  ensureTicking();
});

const stopDragging = (event) => {
  if (!isDragging) return;
  isDragging = false;
  progressBar.classList.remove("is-dragging");
  progressBar.releasePointerCapture(event.pointerId);
  if (resumeAfterDrag) {
    resumeAfterDrag = false;
    setPlaying(true);
    playToggle?.classList.remove("is-drag-paused");
  }
  ensureTicking();
};

progressBar.addEventListener("pointerup", stopDragging);
progressBar.addEventListener("pointercancel", stopDragging);

const setPlaying = (playing) => {
  isPlaying = playing;
  if (playIcon) {
    playIcon.src = playing ? "./assets/pause.png" : "./assets/play.png";
  }
  playToggle?.setAttribute("aria-label", playing ? "Pause" : "Play");
  ensureTicking();
};

if (playToggle) {
  playToggle.addEventListener("pointerdown", (event) => {
    playToggle.classList.add("is-pressed");
    playToggle.setPointerCapture(event.pointerId);
  });

  const releasePlay = (event) => {
    if (!playToggle.classList.contains("is-pressed")) return;
    playToggle.classList.remove("is-pressed");
    playToggle.releasePointerCapture(event.pointerId);
    setPlaying(!isPlaying);
  };

  playToggle.addEventListener("pointerup", releasePlay);
  playToggle.addEventListener("pointercancel", releasePlay);
}

updateUI(displayedProgress);
