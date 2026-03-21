const progressBar = document.querySelector(".progress-bar");
const progressFill = document.querySelector(".progress-fill");
const progressKnob = document.querySelector(".progress-knob");
const timeEl = document.querySelector(".time");
const durationEl = document.querySelector(".duration");
const playToggle = document.querySelector(".play-toggle");
const playIcon = playToggle?.querySelector("img");
const titleEl = document.querySelector(".track-title");
const artistEl = document.querySelector(".track-artist");
const thumbEl = document.querySelector(".track-thumb");

let isDragging = false;
let isPlaying = false;
let resumeAfterDrag = false;
let targetProgress = 0;
let displayedProgress = 0;
let lastTime = performance.now();
let rafId = null;
let totalDuration = 0;
let audio = null;

const setEmptyState = () => {
  if (titleEl) titleEl.textContent = "";
  if (artistEl) artistEl.textContent = "";
  if (thumbEl) thumbEl.removeAttribute("src");
  if (timeEl) timeEl.textContent = "00:00";
  if (durationEl) durationEl.textContent = "00:00";
  totalDuration = 0;
  targetProgress = 0;
  displayedProgress = 0;
  updateUI(0);
};

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const updateUI = (progress) => {
  const percent = progress * 100;
  progressFill.style.width = `${percent}%`;
  progressKnob.style.left = `${percent}%`;
  progressBar.setAttribute("aria-valuenow", Math.round(percent));
  if (timeEl && durationEl) {
    if (!totalDuration) {
      timeEl.textContent = "00:00";
    } else {
      const currentSeconds = Math.round(totalDuration * progress);
      timeEl.textContent = formatTime(currentSeconds);
    }
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

  if (isPlaying && !isDragging && audio && totalDuration > 0) {
    targetProgress = clamp(audio.currentTime / totalDuration, 0, 1);
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
  if (audio && totalDuration > 0) {
    audio.currentTime = clamp(targetProgress, 0, 1) * totalDuration;
  }
  if (resumeAfterDrag) {
    resumeAfterDrag = false;
    setPlaying(true);
    playToggle?.classList.remove("is-drag-paused");
  }
  ensureTicking();
};

progressBar.addEventListener("pointerup", stopDragging);
progressBar.addEventListener("pointercancel", stopDragging);

const setPlaying = async (playing) => {
  if (!audio) return;
  isPlaying = playing;
  if (playIcon) {
    playIcon.src = playing ? "./assets/pause.png" : "./assets/play.png";
  }
  playToggle?.setAttribute("aria-label", playing ? "Pause" : "Play");
  try {
    if (playing) {
      await audio.play();
    } else {
      audio.pause();
    }
  } catch (error) {
    isPlaying = false;
    if (playIcon) playIcon.src = "./assets/play.png";
  }
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

const loadSongs = async () => {
  try {
    const songs = await window.blusic?.getSongs();
    if (!songs || songs.length === 0) {
      setEmptyState();
      return;
    }
    const current = songs[0];
    if (!current?.audio) {
      setEmptyState();
      return;
    }
    if (titleEl) titleEl.textContent = current.title || "";
    if (artistEl) artistEl.textContent = current.artist || "";
    if (thumbEl) thumbEl.src = current.thumbnail || "";
    audio = new Audio(current.audio);
    audio.preload = "metadata";
    audio.addEventListener("loadedmetadata", () => {
      totalDuration = audio.duration || 0;
      if (!totalDuration) {
        setEmptyState();
        return;
      }
      if (durationEl) durationEl.textContent = formatTime(Math.round(totalDuration));
      if (timeEl) timeEl.textContent = "00:00";
      targetProgress = 0;
      displayedProgress = 0;
      updateUI(0);
    });
    audio.addEventListener("error", () => {
      setEmptyState();
    });
    audio.addEventListener("ended", () => {
      setPlaying(false);
      audio.currentTime = 0;
      targetProgress = 0;
      displayedProgress = 0;
      updateUI(0);
    });
  } catch (error) {
    console.error("Failed to load songs list", error);
    setEmptyState();
  }
};

loadSongs();
