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

const volumeBar = document.querySelector(".volume-bar");
const volumeFill = document.querySelector(".volume-fill");
const volumeKnob = document.querySelector(".volume-knob");
const volumeInput = document.querySelector(".volume-input");
const volumeRow = document.querySelector(".volume-row");
const volumeToggle = document.querySelector(".volume-toggle");
const volumeIcon = document.querySelector(".volume-icon");

const songsListEl = document.querySelector(".songs-list");
const searchInput = document.querySelector(".songs-search-input");
const searchSelect = document.querySelector(".songs-search-select");
const progressPanel = document.querySelector(".progress-panel");
const playerToggle = document.querySelector(".player-toggle");

let songs = [];
let selectedIndex = -1;
let currentQuery = "";
let searchMode = "title";
let isPlayerCollapsed = true;

let isDragging = false;
let isPlaying = false;
let resumeAfterDrag = false;
let targetProgress = 0;
let displayedProgress = 0;
let lastTime = performance.now();
let rafId = null;
let totalDuration = 0;
let audio = null;

let isVolumeDragging = false;
let targetVolume = 0.6;
let displayedVolume = 0.6;
const VOLUME_GAMMA = 1.6;
const VOLUME_SCALE = 0.62;

const songCardEls = [];
const songPlayIcons = [];
const songDurationEls = new Map();

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const formatTime = (seconds) => {
  const safeSeconds = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const remaining = safeSeconds % 60;
  return `${minutes}:${String(remaining).padStart(2, "0")}`;
};

const setEmptyState = () => {
  if (audio) {
    audio.pause();
  }
  audio = null;
  isPlaying = false;
  totalDuration = 0;
  targetProgress = 0;
  displayedProgress = 0;
  if (titleEl) titleEl.textContent = "";
  if (artistEl) artistEl.textContent = "";
  if (thumbEl) thumbEl.removeAttribute("src"), thumbEl.classList.add("playingdisabled");
  if (timeEl) timeEl.textContent = "00:00";
  if (durationEl) durationEl.textContent = "00:00";
  if (playIcon) playIcon.src = "./assets/play.png";
  playToggle?.setAttribute("aria-label", "Play");
  updateUI(0);
};

const updateUI = (progress) => {
  const percent = progress * 100;
  progressFill.style.width = `${percent}%`;
  progressKnob.style.left = `${percent}%`;
  progressBar.setAttribute("aria-valuenow", Math.round(percent));
  if (timeEl) {
    if (!totalDuration) {
      timeEl.textContent = "00:00";
    } else {
      timeEl.textContent = formatTime(totalDuration * progress);
    }
  }
};

const updateVolumeUI = (volume) => {
  if (!volumeFill || !volumeKnob || !volumeBar) return;
  const percent = volume * 100;
  const hue = 120 * (1 - volume);
  volumeFill.style.width = `${percent}%`;
  volumeKnob.style.left = `${percent}%`;
  volumeFill.style.background = `hsl(${hue} 70% 50%)`;
  volumeKnob.style.background = `hsl(${hue} 75% 60%)`;
  volumeBar.setAttribute("aria-valuenow", Math.round(percent));
  if (volumeInput && document.activeElement !== volumeInput) {
    volumeInput.value = Math.round(percent).toString();
  }
  if (volumeIcon) {
    volumeIcon.src = volume < 0.05 ? "./assets/volume_off.png" : "./assets/volume_on.png";
  }
  if (audio) {
    const perceptual = Math.pow(clamp(volume, 0, 1), VOLUME_GAMMA) * VOLUME_SCALE;
    audio.volume = clamp(perceptual, 0, 1);
  }
};

const updateCardStates = () => {
  songCardEls.forEach((card, index) => {
    const cardIndex = Number(card.dataset.index);
    const isActive = cardIndex === selectedIndex;
    card.classList.toggle("is-active", isActive);
    const icon = songPlayIcons[index];
    if (icon) {
      icon.src = isActive && isPlaying ? "./assets/pause.png" : "./assets/play.png";
    }
  });
};

const setPlayerCollapsed = (collapsed) => {
  isPlayerCollapsed = collapsed;
  if (progressPanel) {
    progressPanel.classList.toggle("is-collapsed", collapsed);
    progressPanel.setAttribute("aria-expanded", collapsed ? "false" : "true");
  }
  document.body.classList.toggle("player-collapsed", collapsed);
  if (playerToggle) {
    playerToggle.setAttribute("aria-label", collapsed ? "Show player" : "Hide player");
  }
};

const setPlaying = async (playing) => {
  if (!audio) return;
  isPlaying = playing;

  if (thumbEl) {
    thumbEl.classList.toggle("playingdisabled", !playing)
  }

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
  updateCardStates();
  ensureTicking();
};

const attachAudioEvents = (newAudio, autoplay) => {
  newAudio.addEventListener("loadedmetadata", () => {
    totalDuration = newAudio.duration || 0;
    if (!totalDuration) {
      setEmptyState();
      updateCardStates();
      return;
    }
    if (durationEl) durationEl.textContent = formatTime(totalDuration);
    if (timeEl) timeEl.textContent = "00:00";
    targetProgress = 0;
    displayedProgress = 0;
    updateUI(0);
    if (autoplay) {
      setPlaying(true);
    }
  });

  newAudio.addEventListener("error", () => {
    setEmptyState();
    updateCardStates();
  });

  newAudio.addEventListener("ended", () => {
    setPlaying(false);
    newAudio.currentTime = 0;
    targetProgress = 0;
    displayedProgress = 0;
    updateUI(0);
    updateCardStates();
  });
};

const selectSong = (index, autoplay = false) => {
  if (!songs[index]) {
    selectedIndex = -1;
    setEmptyState();
    updateCardStates();
    return;
  }

  setPlayerCollapsed(false);

  if (audio) {
    audio.pause();
  }

  selectedIndex = index;
  isPlaying = false;
  const song = songs[index];

  if (titleEl) titleEl.textContent = song.title || "";
  if (artistEl) artistEl.textContent = song.artist || "";
  if (thumbEl) thumbEl.src = song.thumbnail || "";
  if (timeEl) timeEl.textContent = "00:00";
  if (durationEl) durationEl.textContent = song.duration ? formatTime(song.duration) : "00:00";

  totalDuration = 0;
  targetProgress = 0;
  displayedProgress = 0;
  updateUI(0);

  if (!song.audio) {
    setEmptyState();
    updateCardStates();
    return;
  }

  audio = new Audio(song.audio);
  audio.preload = "metadata";
  const perceptual = Math.pow(clamp(displayedVolume, 0, 1), VOLUME_GAMMA) * VOLUME_SCALE;
  audio.volume = clamp(perceptual, 0, 1);
  attachAudioEvents(audio, autoplay);


  if (!autoplay) {
    setPlaying(false);
  }
  updateCardStates();
  ensureTicking();
};

const toggleSongPlay = (index) => {
  if (index !== selectedIndex) {
    selectSong(index, true);
    return;
  }
  setPlaying(!isPlaying);
};

const updateFromPointer = (event) => {
  if (!audio || !totalDuration) return;
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

  const progressSpeed = isDragging ? 26 : 18;
  const progressT = 1 - Math.exp(-progressSpeed * delta);
  displayedProgress += (targetProgress - displayedProgress) * progressT;

  const volumeSpeed = isVolumeDragging ? 20 : 12;
  const volumeT = 1 - Math.exp(-volumeSpeed * delta);
  displayedVolume += (targetVolume - displayedVolume) * volumeT;

  updateUI(displayedProgress);
  updateVolumeUI(displayedVolume);

  if (
    isDragging ||
    isVolumeDragging ||
    isPlaying ||
    Math.abs(targetProgress - displayedProgress) > 0.0005 ||
    Math.abs(targetVolume - displayedVolume) > 0.0005
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

const getFilteredIndices = () => {
  const query = currentQuery.trim().toLowerCase();
  if (!query) {
    return songs.map((_, index) => index);
  }
  return songs.reduce((indices, song, index) => {
    const title = (song.title || "").toLowerCase();
    const artist = (song.artist || "").toLowerCase();
    const haystack = searchMode === "artist" ? artist : title;
    if (haystack.includes(query)) {
      indices.push(index);
    }
    return indices;
  }, []);
};

const renderSongsList = () => {
  if (!songsListEl) return;
  songsListEl.innerHTML = "";
  songCardEls.length = 0;
  songPlayIcons.length = 0;
  songDurationEls.clear();

  const visibleIndices = getFilteredIndices();
  if (visibleIndices.length === 0) {
    const empty = document.createElement("div");
    empty.className = "songs-empty";
    empty.textContent = "No matching songs.";
    songsListEl.append(empty);
    return;
  }

  visibleIndices.forEach((index) => {
    const song = songs[index];
    const card = document.createElement("div");
    card.className = "song-card";
    card.dataset.index = index.toString();

    const thumb = document.createElement("img");
    thumb.className = "song-thumb";
    thumb.src = song.thumbnail || "";
    thumb.alt = "";

    const meta = document.createElement("div");
    meta.className = "song-meta";

    const title = document.createElement("div");
    title.className = "song-title";
    title.textContent = song.title || "";

    const artist = document.createElement("div");
    artist.className = "song-artist";
    artist.textContent = song.artist || "";

    meta.append(title, artist);

    const right = document.createElement("div");
    right.className = "song-right";

    const duration = document.createElement("div");
    duration.className = "song-duration";
    duration.textContent = song.duration ? formatTime(song.duration) : "00:00";

    const playBtn = document.createElement("button");
    playBtn.className = "song-play";
    playBtn.type = "button";
    playBtn.setAttribute("aria-label", "Play");

    const playImg = document.createElement("img");
    playImg.src = "./assets/play.png";
    playImg.alt = "";
    playBtn.append(playImg);

    right.append(duration, playBtn);
    card.append(thumb, meta, right);
    songsListEl.append(card);

    card.addEventListener("click", () => {
      selectSong(index, false);
    });
    playBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      toggleSongPlay(index);
    });

    songCardEls.push(card);
    songPlayIcons.push(playImg);
    songDurationEls.set(index, duration);
  });

  updateCardStates();
};

const preloadDuration = (song, index) => {
  if (!song.audio || song.duration) return;
  const probe = new Audio(song.audio);
  probe.preload = "metadata";
  probe.addEventListener("loadedmetadata", () => {
    song.duration = probe.duration || 0;
    const durationEl = songDurationEls.get(index);
    if (durationEl) {
      durationEl.textContent = song.duration ? formatTime(song.duration) : "00:00";
    }
    if (index === selectedIndex && durationEl && song.duration) {
      durationEl.textContent = formatTime(song.duration);
    }
  });
  probe.addEventListener("error", () => {
    song.duration = 0;
    const durationEl = songDurationEls.get(index);
    if (durationEl) durationEl.textContent = "00:00";
  });
};

progressBar.addEventListener("pointerdown", (event) => {
  if (!audio) return;
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

const updateVolumeFromPointer = (event) => {
  if (!volumeBar) return;
  const rect = volumeBar.getBoundingClientRect();
  const ratio = (event.clientX - rect.left) / rect.width;
  targetVolume = clamp(ratio, 0, 1);
  ensureTicking();
};

if (volumeBar) {
  volumeBar.addEventListener("pointerdown", (event) => {
    isVolumeDragging = true;
    volumeBar.classList.add("is-dragging");
    volumeBar.setPointerCapture(event.pointerId);
    updateVolumeFromPointer(event);
  });

  volumeBar.addEventListener("pointermove", (event) => {
    if (!isVolumeDragging) return;
    updateVolumeFromPointer(event);
  });

  const stopVolumeDrag = (event) => {
    if (!isVolumeDragging) return;
    isVolumeDragging = false;
    volumeBar.classList.remove("is-dragging");
    volumeBar.releasePointerCapture(event.pointerId);
  };

  volumeBar.addEventListener("pointerup", stopVolumeDrag);
  volumeBar.addEventListener("pointercancel", stopVolumeDrag);
}

if (volumeInput) {
  const applyVolumeInput = () => {
    const rawValue = Number.parseFloat(volumeInput.value);
    const safeValue = Number.isFinite(rawValue) ? rawValue : 0;
    const clamped = clamp(safeValue, 0, 100);
    volumeInput.value = Math.round(clamped).toString();
    targetVolume = clamped / 100;
    ensureTicking();
  };

  volumeInput.addEventListener("input", applyVolumeInput);
  volumeInput.addEventListener("change", applyVolumeInput);
}

if (volumeToggle && volumeRow) {
  const toggleVolume = () => {
    volumeRow.classList.toggle("is-open");
    volumeToggle.setAttribute(
      "aria-expanded",
      volumeRow.classList.contains("is-open") ? "true" : "false"
    );
  };
  volumeToggle.addEventListener("click", toggleVolume);
}

if (playToggle) {
  playToggle.addEventListener("pointerdown", (event) => {
    playToggle.classList.add("is-pressed");
    playToggle.setPointerCapture(event.pointerId);
  });

  const releasePlay = (event) => {
    if (!playToggle.classList.contains("is-pressed")) return;
    playToggle.classList.remove("is-pressed");
    playToggle.releasePointerCapture(event.pointerId);
    if (selectedIndex === -1) {
      if (songs.length > 0) {
        selectSong(0, true);
      }
      return;
    }
    setPlaying(!isPlaying);
  };

  playToggle.addEventListener("pointerup", releasePlay);
  playToggle.addEventListener("pointercancel", releasePlay);
}

const loadSongs = async () => {
  try {
    const list = await window.blusic?.getSongs();
    songs = Array.isArray(list) ? list : [];
    renderSongsList();
    songs.forEach((song, index) => preloadDuration(song, index));
    setEmptyState();
  } catch (error) {
    console.error("Failed to load songs list", error);
    setEmptyState();
  }
};

setEmptyState();
updateVolumeUI(displayedVolume);
if (volumeToggle) {
  volumeToggle.setAttribute("aria-expanded", "false");
}
loadSongs();

setPlayerCollapsed(true);

if (playerToggle) {
  playerToggle.addEventListener("click", () => {
    setPlayerCollapsed(!isPlayerCollapsed);
  });
}

if (searchInput) {
  const applySearch = () => {
    currentQuery = searchInput.value || "";
    renderSongsList();
  };
  searchInput.addEventListener("input", applySearch);
  searchInput.addEventListener("search", applySearch);
}

if (searchSelect) {
  const applyMode = () => {
    searchMode = searchSelect.value === "artist" ? "artist" : "title";
    renderSongsList();
  };
  searchSelect.addEventListener("change", applyMode);
}

/*
if (!isPlaying) {
  thumbEl.classList.add("playingdisabled");
} else {
  thumbEl.classList.remove("playingdisabled");
}
*/