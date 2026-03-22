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
const progressPanel = document.querySelector(".progress-panel");
const playerToggle = document.querySelector(".player-toggle");
const searchOverlay = document.querySelector(".search-overlay");
const loadingOverlay = document.querySelector(".loading-overlay");

let songs = [];
let songsIndex = [];
let creators = [];
let selectedIndex = -1;
let currentQuery = "";
let isPlayerCollapsed = true;
let songsLoadPromise = null;
let songsIndexPromise = null;
let creatorsPromise = null;
let searchToken = 0;

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

const normalizeText = (value) => {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
};

const tokenize = (value) => {
  const normalized = normalizeText(value);
  return normalized ? normalized.split(" ") : [];
};

const matchesTokens = (text, tokens) => {
  if (!tokens.length) return false;
  const haystack = normalizeText(text);
  return tokens.every((token) => haystack.includes(token));
};

const RECENTS_STORAGE_KEY = "blusic:recent-plays";
const RECENTS_LIMIT = 50;
let lastRecordedKey = "";
let lastRecordedAt = 0;

const getSongKey = (title, artist) => {
  return `${normalizeText(title)}::${normalizeText(artist)}`;
};

const loadRecentPlays = () => {
  try {
    const raw = localStorage.getItem(RECENTS_STORAGE_KEY);
    const data = raw ? JSON.parse(raw) : [];
    return Array.isArray(data) ? data : [];
  } catch (error) {
    return [];
  }
};

const saveRecentPlays = (plays) => {
  try {
    localStorage.setItem(RECENTS_STORAGE_KEY, JSON.stringify(plays));
  } catch (error) {
    // Ignore storage errors silently.
  }
};

const recordRecentPlay = (song) => {
  if (!song) return;
  const key = getSongKey(song.title, song.artist);
  const now = Date.now();
  if (key === lastRecordedKey && now - lastRecordedAt < 30000) {
    return;
  }
  lastRecordedKey = key;
  lastRecordedAt = now;

  const plays = loadRecentPlays().filter((entry) => entry?.key !== key);
  plays.unshift({
    key,
    title: song.title || "",
    artist: song.artist || "",
    playedAt: now
  });
  saveRecentPlays(plays.slice(0, RECENTS_LIMIT));
};

const getRecentSongIndices = (limit) => {
  const plays = loadRecentPlays();
  if (!plays.length) return [];
  const indexByKey = new Map(
    songs.map((song, index) => [getSongKey(song.title, song.artist), index])
  );
  const indices = [];
  for (const entry of plays) {
    const idx = indexByKey.get(entry.key);
    if (idx !== undefined) {
      indices.push(idx);
      if (indices.length >= limit) break;
    }
  }
  return indices;
};

const getRecommendations = (limit) => {
  const plays = loadRecentPlays();
  const historyKeys = new Set(plays.map((entry) => entry.key));
  const artistWeights = new Map();
  const recentTokens = new Set();
  const total = Math.max(plays.length, 1);

  plays.forEach((entry, index) => {
    const weight = (total - index) / total;
    const artistKey = normalizeText(entry.artist || "");
    if (artistKey) {
      artistWeights.set(artistKey, (artistWeights.get(artistKey) || 0) + weight);
    }
    tokenize(entry.title || "").forEach((token) => recentTokens.add(token));
  });

  const scored = songs.map((song, index) => {
    const key = getSongKey(song.title, song.artist);
    if (historyKeys.has(key)) return null;
    const artistKey = normalizeText(song.artist || "");
    const artistScore = artistWeights.get(artistKey) || 0;
    let tokenScore = 0;
    tokenize(song.title || "").forEach((token) => {
      if (recentTokens.has(token)) tokenScore += 1;
    });
    return {
      index,
      score: artistScore * 3 + tokenScore
    };
  });

  const ranked = scored
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.index);

  if (ranked.length >= limit) {
    return ranked.slice(0, limit);
  }

  const fallback = songs
    .map((song, index) => ({ index, key: getSongKey(song.title, song.artist) }))
    .filter((entry) => !historyKeys.has(entry.key))
    .map((entry) => entry.index);

  const combined = [...new Set([...ranked, ...fallback])];
  return combined.slice(0, limit);
};

const getArtistRecommendationIndices = (artistName, limit) => {
  const normalized = normalizeText(artistName || "");
  if (!normalized) return [];
  const plays = loadRecentPlays();
  const historyIndex = new Map(
    plays.map((entry, index) => [entry.key, index])
  );

  const indices = songsIndex.reduce((result, song, index) => {
    const artistKey = normalizeText(song.artist || "");
    if (artistKey === normalized) {
      result.push(index);
    }
    return result;
  }, []);

  indices.sort((a, b) => {
    const keyA = getSongKey(songsIndex[a]?.title, songsIndex[a]?.artist);
    const keyB = getSongKey(songsIndex[b]?.title, songsIndex[b]?.artist);
    const playedA = historyIndex.has(keyA);
    const playedB = historyIndex.has(keyB);
    if (playedA !== playedB) return playedA ? 1 : -1;
    const idxA = historyIndex.get(keyA) ?? -1;
    const idxB = historyIndex.get(keyB) ?? -1;
    return idxB - idxA;
  });

  return indices.slice(0, limit);
};

const showSearchLoading = () => {
  if (!searchOverlay) return;
  searchOverlay.classList.add("is-visible");
};

const hideSearchLoading = () => {
  if (!searchOverlay) return;
  searchOverlay.classList.remove("is-visible");
};

const resetSongCards = () => {
  songCardEls.length = 0;
  songPlayIcons.length = 0;
  songDurationEls.clear();
};

const clearResults = () => {
  if (!songsListEl) return;
  songsListEl.innerHTML = "";
  resetSongCards();
};

const addSectionTitle = (label) => {
  if (!songsListEl || !label) return;
  const header = document.createElement("div");
  header.className = "song-section-title";
  header.textContent = label;
  songsListEl.append(header);
};

const registerDurationEl = (index, element) => {
  if (!songDurationEls.has(index)) {
    songDurationEls.set(index, new Set());
  }
  songDurationEls.get(index).add(element);
};

const updateDurationElements = (index, duration) => {
  const elements = songDurationEls.get(index);
  if (!elements) return;
  elements.forEach((el) => {
    el.textContent = duration ? formatTime(duration) : "00:00";
  });
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
      if (songs[selectedIndex]) {
        recordRecentPlay(songs[selectedIndex]);
      }
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

const getCreatorCounts = () => {
  return songsIndex.reduce((map, song) => {
    const artist = normalizeText(song.artist || "");
    if (!artist) return map;
    map.set(artist, (map.get(artist) || 0) + 1);
    return map;
  }, new Map());
};

const getMatchingSongIndices = (tokens) => {
  return songsIndex.reduce((indices, song, index) => {
    const haystack = `${song.title || ""} ${song.artist || ""}`;
    if (matchesTokens(haystack, tokens)) {
      indices.push(index);
    }
    return indices;
  }, []);
};

const appendSongCard = (index) => {
  const song = songs[index];
  if (!song || !songsListEl) return;

  const card = document.createElement("div");
  card.className = "song-card";
  card.dataset.index = index.toString();

  const thumb = document.createElement("img");
  thumb.className = "song-thumb";
  thumb.src = song.thumbnail || "";
  thumb.alt = "";

  const meta = document.createElement("div");
  meta.className = "song-meta";

  const artist = document.createElement("div");
  artist.className = "song-artist";
  artist.textContent = song.artist || "";

  const title = document.createElement("div");
  title.className = "song-title";
  title.textContent = song.title || "";

  meta.append(artist, title);

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
  registerDurationEl(index, duration);
  if (song.duration) {
    updateDurationElements(index, song.duration);
  }
  preloadDuration(song, index);
};

const renderSongCards = (indices) => {
  indices.forEach((index) => appendSongCard(index));
  updateCardStates();
};

const appendSongTile = (index, container) => {
  const song = songs[index];
  if (!song) return;

  const tile = document.createElement("button");
  tile.className = "song-tile";
  tile.type = "button";

  const thumb = document.createElement("img");
  thumb.className = "song-tile-thumb";
  thumb.src = song.thumbnail || "";
  thumb.alt = "";

  const meta = document.createElement("div");
  meta.className = "song-tile-meta";

  const title = document.createElement("div");
  title.className = "song-tile-title";
  title.textContent = song.title || "";

  const artist = document.createElement("div");
  artist.className = "song-tile-artist";
  artist.textContent = song.artist || "";

  const duration = document.createElement("div");
  duration.className = "song-tile-duration";
  duration.textContent = song.duration ? formatTime(song.duration) : "00:00";

  meta.append(title, artist, duration);
  tile.append(thumb, meta);
  container.append(tile);

  tile.addEventListener("click", () => {
    selectSong(index, true);
  });

  registerDurationEl(index, duration);
  if (song.duration) {
    updateDurationElements(index, song.duration);
  }
  preloadDuration(song, index);
};

const renderSongTiles = (indices, parent = songsListEl) => {
  if (!parent) return;
  const grid = document.createElement("div");
  grid.className = "song-tiles";
  indices.forEach((index) => appendSongTile(index, grid));
  parent.append(grid);
};

const renderCreatorCards = (matching, counts) => {
  matching.forEach((creator) => {
    const card = document.createElement("div");
    card.className = "creator-card";
    card.dataset.creator = creator.creator_name || "";

    const top = document.createElement("div");
    top.className = "creator-top";

    const avatar = document.createElement("img");
    avatar.className = "creator-avatar";
    avatar.src = creator.creator_pfp || "";
    avatar.alt = "";

    const meta = document.createElement("div");
    meta.className = "creator-meta";

    const name = document.createElement("div");
    name.className = "creator-name";
    name.textContent = creator.creator_name || "";

    const key = normalizeText(creator.creator_name || "");
    const total = counts.get(key) || 0;
    const count = document.createElement("div");
    count.className = "creator-count";
    count.textContent = `${total} ${total === 1 ? "track" : "tracks"}`;

    meta.append(name, count);
    top.append(avatar, meta);

    card.append(top);
    songsListEl.append(card);

    const recIndices = getArtistRecommendationIndices(creator.creator_name, 3);
    const recBlock = document.createElement("div");
    recBlock.className = "creator-rec-block";
    if (recIndices.length === 0) {
      const empty = document.createElement("div");
      empty.className = "creator-rec-empty";
      empty.textContent = "No recommendations yet.";
      recBlock.append(empty);
    } else {
      renderSongTiles(recIndices, recBlock);
    }
    songsListEl.append(recBlock);
  });
};

const preloadDuration = (song, index) => {
  if (!song.audio) return;
  if (song.duration) {
    updateDurationElements(index, song.duration);
    return;
  }
  const probe = new Audio(song.audio);
  probe.preload = "metadata";
  probe.addEventListener("loadedmetadata", () => {
    song.duration = probe.duration || 0;
    updateDurationElements(index, song.duration);
  });
  probe.addEventListener("error", () => {
    song.duration = 0;
    updateDurationElements(index, song.duration);
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
    setEmptyState();
    return songs;
  } catch (error) {
    console.error("Failed to load songs list", error);
    setEmptyState();
    return [];
  }
};

const ensureSongsLoaded = async () => {
  if (songs.length > 0) return songs;
  if (!songsLoadPromise) {
    songsLoadPromise = loadSongs().finally(() => {
      songsLoadPromise = null;
    });
  }
  return songsLoadPromise;
};

const loadSongsIndex = async () => {
  try {
    const list = await window.blusic?.getSongsIndex();
    songsIndex = Array.isArray(list) ? list : [];
    return songsIndex;
  } catch (error) {
    console.error("Failed to load songs index", error);
    return [];
  }
};

const ensureSongsIndexLoaded = async () => {
  if (songsIndex.length > 0) return songsIndex;
  if (!songsIndexPromise) {
    songsIndexPromise = loadSongsIndex().finally(() => {
      songsIndexPromise = null;
    });
  }
  return songsIndexPromise;
};

const loadCreators = async () => {
  try {
    const list = await window.blusic?.getCreators();
    creators = Array.isArray(list) ? list : [];
    return creators;
  } catch (error) {
    console.error("Failed to load creators", error);
    return [];
  }
};

const ensureCreatorsLoaded = async () => {
  if (creators.length > 0) return creators;
  if (!creatorsPromise) {
    creatorsPromise = loadCreators().finally(() => {
      creatorsPromise = null;
    });
  }
  return creatorsPromise;
};

const showSongsForArtist = async (artistName) => {
  currentQuery = artistName || "";
  if (searchInput) {
    searchInput.value = artistName || "";
  }
  const token = ++searchToken;
  showSearchLoading();
  await Promise.all([ensureSongsIndexLoaded(), ensureSongsLoaded()]);
  if (token !== searchToken) return;

  const normalized = normalizeText(artistName || "");
  const matches = songsIndex.reduce((indices, song, index) => {
    const artist = normalizeText(song.artist || "");
    if (artist && artist === normalized) {
      indices.push(index);
    }
    return indices;
  }, []);

  clearResults();

  if (matches.length === 0) {
    const empty = document.createElement("div");
    empty.className = "songs-empty";
    empty.textContent = "No matching songs.";
    songsListEl.append(empty);
    hideSearchLoading();
    return;
  }

  addSectionTitle(artistName);
  renderSongCards(matches);
  hideSearchLoading();
};

const renderHome = async () => {
  if (!songsListEl) return;
  const token = ++searchToken;
  showSearchLoading();
  await Promise.all([ensureSongsIndexLoaded(), ensureSongsLoaded()]);
  if (token !== searchToken) return;

  clearResults();

  const recentIndices = getRecentSongIndices(5);
  addSectionTitle("Watch Again");
  if (recentIndices.length === 0) {
    const empty = document.createElement("div");
    empty.className = "songs-empty";
    empty.textContent = "Play something to see it here.";
    songsListEl.append(empty);
  } else {
    renderSongTiles(recentIndices);
  }

  const recIndices = getRecommendations(6);
  addSectionTitle("Recommended For You");
  if (recIndices.length === 0) {
    const empty = document.createElement("div");
    empty.className = "songs-empty";
    empty.textContent = "No recommendations yet.";
    songsListEl.append(empty);
  } else {
    renderSongTiles(recIndices);
  }

  hideSearchLoading();
};

const runSearch = async () => {
  const query = currentQuery.trim();
  const token = ++searchToken;
  if (!query) {
    await renderHome();
    return;
  }
  showSearchLoading();
  const tokens = tokenize(query);

  await Promise.all([ensureSongsIndexLoaded(), ensureCreatorsLoaded()]);
  if (token !== searchToken) return;

  const matchingCreators = creators.filter((creator) => {
    return matchesTokens(creator.creator_name || "", tokens);
  });

  const matchingSongIndices = getMatchingSongIndices(tokens);

  if (matchingSongIndices.length > 0 || matchingCreators.length > 0) {
    await ensureSongsLoaded();
    if (token !== searchToken) return;
  }

  clearResults();

  const hasCreators = matchingCreators.length > 0;
  const hasSongs = matchingSongIndices.length > 0;

  if (!hasCreators && !hasSongs) {
    const empty = document.createElement("div");
    empty.className = "songs-empty";
    empty.textContent = "No matching results.";
    songsListEl.append(empty);
    hideSearchLoading();
    return;
  }

  if (hasCreators) {
    addSectionTitle("Artists");
    renderCreatorCards(matchingCreators, getCreatorCounts());
  }

  if (hasSongs) {
    addSectionTitle(hasCreators ? "Songs" : "Songs");
    renderSongCards(matchingSongIndices);
  }

  hideSearchLoading();
};

setEmptyState();
updateVolumeUI(displayedVolume);
if (volumeToggle) {
  volumeToggle.setAttribute("aria-expanded", "false");
}

setPlayerCollapsed(true);

if (playerToggle) {
  playerToggle.addEventListener("click", () => {
    setPlayerCollapsed(!isPlayerCollapsed);
  });
}

if (searchInput) {
  const applySearch = () => {
    currentQuery = searchInput.value || "";
    runSearch();
  };
  searchInput.addEventListener("input", applySearch);
  searchInput.addEventListener("search", applySearch);
}

if (songsListEl) {
  songsListEl.addEventListener("click", (event) => {
    const target = event.target.closest(".creator-card");
    if (!target) return;
    const creator = target.dataset.creator || "";
    if (!creator) return;
    showSongsForArtist(creator);
  });
}

const hideLoading = () => {
  if (!loadingOverlay) return;
  loadingOverlay.classList.add("is-hidden");
  window.setTimeout(() => {
    loadingOverlay.remove();
  }, 500);
};

window.addEventListener("load", () => {
  window.setTimeout(() => {
    hideLoading();
    renderHome();
  }, 600);
});

/*
if (!isPlaying) {
  thumbEl.classList.add("playingdisabled");
} else {
  thumbEl.classList.remove("playingdisabled");
}
*/
