import {
  addDoc,
  collection,
  db,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
} from "./firebase.js";

const $ = (selector) => document.querySelector(selector);

const audio = $("#preview-audio");
const searchInput = $("#song-search");
const clearSearch = $("#clear-search");
const searchStatus = $("#search-status");
const searchResults = $("#search-results");
const selectedTrack = $("#selected-track");
const shareForm = $("#share-form");
const shareButton = $("#share-button");
const shareStatus = $("#share-status");
const senderNameInput = $("#sender-name");
const noteInput = $("#song-note");
const feedStatus = $("#feed-status");
const feedList = $("#feed-list");
const feedCount = $("#feed-count");
const toastRoot = $("#toast-root");
const shareToggle = $("#share-toggle");
const shareContent = $("#share-content");
const shareTitle = $("#share-title");
const themeToggle = $("#theme-toggle");
const themeIcon = $("#theme-icon");
const themeColor = $("meta[name='theme-color']");
const DISCO_ENGINE_URL = "./disco-engine.js";
const MAX_TRACKS_PER_SHARE = 12;
const THEME_STORAGE_KEY = "resonance-theme";
const deviceTheme = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

const state = {
  selectedTracks: [],
  searchVersion: 0,
  currentPlaybackKey: null,
  currentPreviewUrl: "",
  discoPartyOn: false,
  shares: [],
};

function storedTheme() {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY);
    return value === "dark" || value === "light" ? value : "";
  } catch {
    return "";
  }
}

function systemTheme() {
  return deviceTheme?.matches ? "dark" : "light";
}

function applyTheme(theme) {
  const nextTheme = theme === "dark" ? "dark" : "light";
  const isDark = nextTheme === "dark";
  document.documentElement.dataset.theme = nextTheme;
  document.documentElement.style.colorScheme = nextTheme;
  if (themeToggle) {
    themeToggle.setAttribute("aria-pressed", String(isDark));
    themeToggle.setAttribute("aria-label", isDark ? "Use light mode" : "Use dark mode");
    themeToggle.title = isDark ? "Use light mode" : "Use dark mode";
  }
  if (themeIcon) themeIcon.textContent = isDark ? "☀" : "☾";
  if (themeColor) themeColor.setAttribute("content", isDark ? "#141416" : "#fffefa");
}

function setManualTheme(theme) {
  try { localStorage.setItem(THEME_STORAGE_KEY, theme); } catch { /* The current session still updates. */ }
  applyTheme(theme);
}

applyTheme(storedTheme() || document.documentElement.dataset.theme || systemTheme());
themeToggle?.addEventListener("click", () => {
  setManualTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
});

function followDeviceTheme(event) {
  if (!storedTheme()) applyTheme(event.matches ? "dark" : "light");
}

if (deviceTheme?.addEventListener) deviceTheme.addEventListener("change", followDeviceTheme);
else if (deviceTheme?.addListener) deviceTheme.addListener(followDeviceTheme);

const placeholderArtwork = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80">
    <rect width="80" height="80" fill="#dcd8ec"/>
    <circle cx="40" cy="40" r="23" fill="#8574c9"/>
    <circle cx="40" cy="40" r="7" fill="#fffefa"/>
  </svg>
`)}`;

function createElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function createSvgElement(tag, attributes = {}) {
  const element = document.createElementNS(SVG_NAMESPACE, tag);
  Object.entries(attributes).forEach(([name, value]) => element.setAttribute(name, value));
  return element;
}

function providerIcon(provider) {
  const isSpotify = provider === "Spotify";
  const icon = createElement("span", `provider-icon ${isSpotify ? "spotify-icon" : "apple-music-icon"}`);
  const svg = createSvgElement("svg", { viewBox: "0 0 24 24", "aria-hidden": "true", focusable: "false" });

  if (isSpotify) {
    svg.append(
      createSvgElement("circle", { cx: "12", cy: "12", r: "10" }),
      createSvgElement("path", { d: "M6.4 9.4c3.9-1 8.4-.35 11.3 1.35" }),
      createSvgElement("path", { d: "M7.1 12.4c3.25-.8 6.8-.26 9.2 1.08" }),
      createSvgElement("path", { d: "M7.8 15.2c2.55-.56 5.2-.15 7.05.9" })
    );
  } else {
    svg.append(
      createSvgElement("rect", { class: "apple-music-tile", x: "2", y: "2", width: "20", height: "20", rx: "5.4" }),
      createSvgElement("path", { class: "apple-music-note", d: "M15.8 5.7v9.02a2.78 2.78 0 1 1-1.25-2.31V8.23l-5.1 1.2v6.17a2.78 2.78 0 1 1-1.25-2.31V8.36L15.8 5.7Z" })
    );
  }

  icon.append(svg);
  return icon;
}

function cleanText(value, maxLength = 0) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return maxLength ? text.slice(0, maxLength) : text;
}

function safeUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : "";
  } catch {
    return "";
  }
}

function image(url, alt, className = "cover") {
  const element = document.createElement("img");
  element.className = className;
  element.alt = alt;
  element.loading = "lazy";
  element.src = safeUrl(url) || placeholderArtwork;
  element.addEventListener("error", () => { element.src = placeholderArtwork; }, { once: true });
  return element;
}

function toast(message, type = "success") {
  const notice = createElement("div", `toast${type === "error" ? " error" : ""}`, message);
  toastRoot.append(notice);
  window.setTimeout(() => notice.remove(), 3600);
}

let discoPauseTimer = 0;

// Load the exact CodePen engine after the app has been initialized. The engine
// injects its own Three.js ball and the moving light canvas.
import(DISCO_ENGINE_URL).catch((error) => {
  console.warn("The disco animation could not load.", error);
});

function cueDisco() {
  window.__discoCue = true;
  window.dispatchEvent(new Event("disco:cue"));
}

// The exact reference engine is loaded in index.html. It uses this event
// contract to run its own Three.js ball and full-screen moving light canvas.
window.addEventListener("disco:ready", cueDisco, { once: true });
window.setTimeout(cueDisco, 2800);

function setDiscoParty(on) {
  window.clearTimeout(discoPauseTimer);
  if (on) {
    window.dispatchEvent(new CustomEvent("disco:pause", { detail: false }));
    if (!state.discoPartyOn) {
      state.discoPartyOn = true;
      window.dispatchEvent(new CustomEvent("disco:party", {
        detail: { on: true, getBeat: () => audio.currentTime * 2 },
      }));
    }
    return;
  }

  if (!state.discoPartyOn) return;
  state.discoPartyOn = false;
  window.dispatchEvent(new CustomEvent("disco:party", {
    detail: { on: false, getBeat: () => audio.currentTime * 2 },
  }));
  // Preserve the reference engine's own fade-out before putting it to sleep.
  discoPauseTimer = window.setTimeout(() => {
    window.dispatchEvent(new CustomEvent("disco:pause", { detail: true }));
  }, 800);
}

function setComposerExpanded(expanded) {
  shareContent.hidden = !expanded;
  shareToggle.setAttribute("aria-expanded", String(expanded));
  shareTitle.textContent = expanded ? "Share a song:" : "Share a song ?";
}

shareToggle.addEventListener("click", () => {
  const expanded = shareContent.hidden;
  setComposerExpanded(expanded);
  if (expanded) searchInput.focus();
});

setComposerExpanded(false);

function debounce(callback, delay = 320) {
  let timer;
  return (...args) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => callback(...args), delay);
  };
}

function songKey(item) {
  return String(item.trackId || item.collectionId || `${item.artistName}-${item.trackName}`)
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .slice(0, 60);
}

function normalizeTrack(item) {
  return {
    id: songKey(item),
    title: cleanText(item.trackName || "Unknown song", 120),
    artist: cleanText(item.artistName || "Unknown artist", 120),
    album: cleanText(item.collectionName || "Single", 140),
    artwork: safeUrl(String(item.artworkUrl100 || "").replace("100x100bb", "600x600bb")),
    previewUrl: safeUrl(item.previewUrl),
    appleUrl: safeUrl(item.trackViewUrl || item.collectionViewUrl),
    durationMs: Math.max(0, Math.min(Number(item.trackTimeMillis) || 0, 900000)),
    explicit: item.trackExplicitness === "explicit",
  };
}

function localCountry() {
  const candidate = (navigator.language || "en-US").split("-")[1];
  return /^[a-z]{2}$/i.test(candidate || "") ? candidate.toUpperCase() : "US";
}

function searchCatalog(term) {
  const queryText = cleanText(term, 120);
  if (queryText.length < 2) return Promise.resolve([]);

  const requestId = ++state.searchVersion;
  return new Promise((resolve, reject) => {
    const callbackName = `resonanceSearch${Date.now()}${Math.random().toString(36).slice(2)}`;
    const script = document.createElement("script");
    const finish = (error, payload) => {
      window.clearTimeout(timeout);
      delete window[callbackName];
      script.remove();
      if (error) reject(error);
      else resolve(payload || []);
    };
    const timeout = window.setTimeout(() => finish(new Error("Search timed out. Try again.")), 9000);

    window[callbackName] = (payload) => {
      if (requestId !== state.searchVersion) return finish(null, []);
      const tracks = (payload.results || [])
        .map(normalizeTrack)
        .filter((track) => track.title && track.artist && track.previewUrl)
        .slice(0, 8);
      finish(null, tracks);
    };
    script.onerror = () => finish(new Error("Couldn’t reach the music catalogue."));
    script.src = `https://itunes.apple.com/search?${new URLSearchParams({
      term: queryText,
      entity: "song",
      media: "music",
      country: localCountry(),
      limit: "18",
      callback: callbackName,
    }).toString()}`;
    document.head.append(script);
  });
}

function renderSearchResults(tracks) {
  searchResults.replaceChildren();
  tracks.forEach((track) => {
    const option = createElement("button", "search-result");
    option.type = "button";
    option.setAttribute("role", "option");
    option.append(
      image(track.artwork, "", "cover"),
      (() => {
        const copy = createElement("span", "result-copy");
        copy.append(createElement("strong", "", track.title), createElement("span", "", `${track.artist} · ${track.album}`));
        return copy;
      })(),
      createElement("span", "pick-mark", "+")
    );
    option.addEventListener("click", () => selectTrack(track));
    searchResults.append(option);
  });
}

function draftPlaybackKey(track) {
  return `draft:${track.id}`;
}

function renderSelectedTracks() {
  selectedTrack.replaceChildren();
  if (!state.selectedTracks.length) {
    selectedTrack.hidden = true;
    shareForm.hidden = true;
    shareButton.disabled = true;
    shareStatus.textContent = "";
    return;
  }

  state.selectedTracks.forEach((track) => {
    const copy = createElement("div", "result-copy");
    copy.append(createElement("strong", "", track.title), createElement("span", "", `${track.artist} · ${track.album}`));

    const preview = createElement("button", "artwork-preview");
    preview.type = "button";
    preview.dataset.playbackKey = draftPlaybackKey(track);
    preview.dataset.songTitle = track.title;
    preview.setAttribute("aria-label", `Preview ${track.title}`);
    preview.setAttribute("aria-pressed", "false");
    preview.addEventListener("click", () => toggleTrackPreview(track, draftPlaybackKey(track)));
    preview.append(image(track.artwork, "", "cover"), createElement("span", "artwork-play-icon", "▶"));

    const remove = createElement("button", "remove-song", "×");
    remove.type = "button";
    remove.setAttribute("aria-label", `Remove ${track.title}`);
    remove.addEventListener("click", () => removeSelectedTrack(track.id));

    const summary = createElement("div", "selected-song-summary");
    summary.append(preview, copy, remove);
    selectedTrack.append(summary);
  });

  selectedTrack.hidden = false;
  shareForm.hidden = false;
  shareButton.disabled = false;
  shareStatus.textContent = "";
  updatePlaybackUI();
}

function clearSearchQuery() {
  state.searchVersion += 1;
  searchInput.value = "";
  searchStatus.textContent = "";
  searchResults.replaceChildren();
}

function selectTrack(track) {
  if (state.selectedTracks.some((selected) => selected.id === track.id)) {
    toast("Already added.", "error");
    searchInput.focus();
    searchInput.select();
    return;
  }
  if (state.selectedTracks.length >= MAX_TRACKS_PER_SHARE) {
    toast("That’s enough for one share.", "error");
    return;
  }

  state.selectedTracks.push(track);
  clearSearchQuery();
  renderSelectedTracks();
  searchInput.focus();
}

function removeSelectedTrack(trackId) {
  if (state.currentPlaybackKey === `draft:${trackId}`) stopPlayback();
  state.selectedTracks = state.selectedTracks.filter((track) => track.id !== trackId);
  renderSelectedTracks();
  if (!state.selectedTracks.length) searchInput.focus();
}

async function runSearch() {
  const term = searchInput.value;
  if (cleanText(term).length < 2) {
    state.searchVersion += 1;
    searchStatus.textContent = term ? "Keep typing…" : "";
    searchResults.replaceChildren();
    return;
  }
  searchStatus.textContent = "Looking…";
  searchResults.replaceChildren();
  try {
    const tracks = await searchCatalog(term);
    if (searchInput.value !== term) return;
    if (!tracks.length) {
      searchStatus.textContent = "No playable previews found. Try another search.";
      return;
    }
    searchStatus.textContent = `${tracks.length} ${tracks.length === 1 ? "match" : "matches"}`;
    renderSearchResults(tracks);
  } catch (error) {
    if (searchInput.value !== term) return;
    searchStatus.textContent = error.message || "Search failed.";
  }
}

const debouncedSearch = debounce(runSearch, 320);
searchInput.addEventListener("input", debouncedSearch);
searchInput.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    searchResults.replaceChildren();
    searchStatus.textContent = "";
  }
});
clearSearch.addEventListener("click", clearSearchQuery);

function preferredName() {
  try { return localStorage.getItem("resonance-name") || ""; } catch { return ""; }
}

function rememberName(value) {
  try { localStorage.setItem("resonance-name", value); } catch { /* Local storage is optional. */ }
}

senderNameInput.value = preferredName();

shareForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!state.selectedTracks.length) {
    shareStatus.textContent = "Choose a song first.";
    searchInput.focus();
    return;
  }

  const senderName = cleanText(senderNameInput.value, 40) || "someone";
  const note = cleanText(noteInput.value, 280);
  shareButton.disabled = true;
  shareStatus.textContent = "Adding it…";
  try {
    await addDoc(collection(db, "shares"), {
      tracks: state.selectedTracks,
      senderName,
      note,
      createdAt: serverTimestamp(),
    });
    rememberName(senderNameInput.value ? senderName : "");
    if (state.currentPlaybackKey?.startsWith("draft:")) stopPlayback();
    noteInput.value = "";
    state.selectedTracks = [];
    clearSearchQuery();
    renderSelectedTracks();
    toast("It’s on the wall.");
  } catch (error) {
    shareButton.disabled = false;
    shareStatus.textContent = "Couldn’t add that song. Try again.";
    toast("The song wasn’t added. Check the Firebase rules, then try again.", "error");
    console.error(error);
  }
});

function trackFromRaw(raw) {
  const value = raw && typeof raw === "object" ? raw : {};
  return {
    id: cleanText(value.id, 60),
    title: cleanText(value.title, 120) || "Unknown song",
    artist: cleanText(value.artist, 120) || "Unknown artist",
    album: cleanText(value.album, 140),
    artwork: safeUrl(value.artwork),
    previewUrl: safeUrl(value.previewUrl),
    appleUrl: safeUrl(value.appleUrl),
  };
}

function tracksFromShare(share) {
  const rawTracks = Array.isArray(share.tracks) && share.tracks.length
    ? share.tracks
    : share.track ? [share.track] : [];
  return rawTracks
    .filter((track) => track && typeof track === "object")
    .map(trackFromRaw);
}

function providerUrl(track, provider) {
  const text = encodeURIComponent(`${track.title} ${track.artist}`);
  if (provider === "Apple Music") return track.appleUrl || `https://music.apple.com/us/search?term=${text}`;
  return `https://open.spotify.com/search/${text}`;
}

function timestampValue(value) {
  if (value && typeof value.toDate === "function") return value.toDate();
  if (value?.seconds) return new Date(value.seconds * 1000);
  return null;
}

function relativeTime(value) {
  const date = timestampValue(value);
  if (!date) return "just now";
  const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function updatePlaybackUI() {
  const playing = Boolean(state.currentPlaybackKey && !audio.paused);
  document.documentElement.classList.toggle("is-playing", playing);
  setDiscoParty(playing);

  document.querySelectorAll(".play-button").forEach((button) => {
    const current = playing && button.dataset.playbackKey === state.currentPlaybackKey;
    button.classList.toggle("is-current", current);
    button.textContent = current ? "Ⅱ" : "▶";
    button.setAttribute("aria-label", current ? `Pause ${button.dataset.songTitle}` : `Play ${button.dataset.songTitle}`);
  });

  document.querySelectorAll(".artwork-preview").forEach((button) => {
    const current = playing && button.dataset.playbackKey === state.currentPlaybackKey;
    button.classList.toggle("is-current", current);
    const icon = button.querySelector(".artwork-play-icon");
    if (icon) icon.textContent = current ? "Ⅱ" : "▶";
    button.setAttribute("aria-label", current ? `Pause ${button.dataset.songTitle}` : `Preview ${button.dataset.songTitle}`);
    button.setAttribute("aria-pressed", String(current));
  });
}

function stopPlayback() {
  audio.pause();
  state.currentPlaybackKey = null;
  state.currentPreviewUrl = "";
  updatePlaybackUI();
}

function updateMediaSession(track) {
  if (!navigator.mediaSession || typeof MediaMetadata === "undefined") return;
  navigator.mediaSession.metadata = new MediaMetadata({
    title: track.title,
    artist: track.artist,
    album: track.album,
    artwork: track.artwork ? [{ src: track.artwork, sizes: "600x600", type: "image/jpeg" }] : [],
  });
}

async function toggleTrackPreview(track, playbackKey) {
  if (!track.previewUrl) {
    toast("This song doesn’t have a preview.", "error");
    return;
  }
  if (state.currentPlaybackKey === playbackKey && !audio.paused) {
    audio.pause();
    // Some browsers report the pause state before dispatching the media event.
    // Update immediately so the button and lights never look stuck playing.
    updatePlaybackUI();
    return;
  }
  state.currentPlaybackKey = playbackKey;
  state.currentPreviewUrl = track.previewUrl;
  if (audio.src !== track.previewUrl) audio.src = track.previewUrl;
  try {
    await audio.play();
    updateMediaSession(track);
    // Keep the visual state in lockstep even before a browser dispatches play.
    updatePlaybackUI();
  } catch (error) {
    state.currentPlaybackKey = null;
    state.currentPreviewUrl = "";
    updatePlaybackUI();
    toast("Preview couldn’t play in this browser.", "error");
  }
}

audio.addEventListener("play", updatePlaybackUI);
audio.addEventListener("pause", updatePlaybackUI);
audio.addEventListener("ended", () => {
  state.currentPlaybackKey = null;
  state.currentPreviewUrl = "";
  updatePlaybackUI();
});
audio.addEventListener("error", () => {
  state.currentPlaybackKey = null;
  state.currentPreviewUrl = "";
  updatePlaybackUI();
});

function renderShare(share) {
  const tracks = tracksFromShare(share);
  if (!tracks.length) return null;

  const article = createElement("article", "feed-item");

  const meta = createElement("p", "shared-meta share-meta");
  meta.append(
    createElement("b", "", cleanText(share.senderName, 40) || "someone"),
    document.createTextNode(` · ${relativeTime(share.createdAt)}`)
  );
  article.append(meta);

  const trackList = createElement("div", "shared-tracks");
  tracks.forEach((track, index) => {
    const row = createElement("div", "feed-track");
    const playbackKey = `share:${share.id}:${index}`;
    const play = createElement("button", "play-button", "▶");
    play.type = "button";
    play.dataset.playbackKey = playbackKey;
    play.dataset.songTitle = track.title;
    play.setAttribute("aria-label", `Play ${track.title}`);
    play.addEventListener("click", () => toggleTrackPreview(track, playbackKey));

    const copy = createElement("div", "track-copy");
    copy.append(createElement("h3", "", track.title), createElement("p", "", track.artist));

    const links = createElement("div", "quick-links");
    links.append(createElement("span", "open-in", "Open in:"));
    ["Spotify", "Apple Music"].forEach((provider) => {
      const link = createElement("a", `quick-link provider-link ${provider === "Spotify" ? "spotify-link" : "apple-music-link"}`);
      link.href = providerUrl(track, provider);
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.setAttribute("aria-label", `Open ${track.title} in ${provider}`);
      link.append(providerIcon(provider));
      links.append(link);
    });

    row.append(play, image(track.artwork, `Artwork for ${track.title}`), copy, links);
    trackList.append(row);
  });
  article.append(trackList);

  const note = cleanText(share.note, 280);
  if (note) article.append(createElement("p", "note", `“${note}”`));
  return article;
}

function renderFeed() {
  feedList.replaceChildren();
  feedStatus.textContent = "";
  const trackCount = state.shares.reduce((count, share) => count + tracksFromShare(share).length, 0);
  feedCount.textContent = trackCount ? `${trackCount} ${trackCount === 1 ? "song" : "songs"}` : "";
  if (!state.shares.length) {
    feedList.append(createElement("p", "empty-feed", "No songs yet."));
    return;
  }
  const fragment = document.createDocumentFragment();
  state.shares.forEach((share) => {
    const item = renderShare(share);
    if (item) fragment.append(item);
  });
  feedList.append(fragment);
  updatePlaybackUI();
}

const feedQuery = query(collection(db, "shares"), orderBy("createdAt", "desc"), limit(60));
onSnapshot(feedQuery, (snapshot) => {
  state.shares = snapshot.docs.map((document) => ({ id: document.id, ...document.data() }));
  renderFeed();
}, (error) => {
  console.error(error);
  feedStatus.textContent = "The wall needs a quick Firebase setup before it can load.";
  feedCount.textContent = "";
});
