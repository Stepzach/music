import {
  addDoc,
  collection,
  db,
  deleteDoc,
  doc,
  ensureAnonymousUser,
  getCurrentUser,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
} from "./firebase.js";

const $ = (selector) => document.querySelector(selector);

const audio = $("#preview-audio");
const searchInput = $("#song-search");
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
const themeToggle = $("#theme-toggle");
const themeIcon = $("#theme-icon");
const themeColor = $("meta[name='theme-color']");
const DISCO_ENGINE_URL = "./disco-engine.js";
const MAX_TRACKS_PER_SHARE = 12;
const THEME_STORAGE_KEY = "resonance-theme";
const deviceTheme = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const DEEZER_PREVIEW_REFRESH_MS = 2 * 60 * 1000;
const DEEZER_PREVIEW_SAFETY_MS = 2 * 60 * 1000;

const state = {
  selectedTracks: [],
  searchVersion: 0,
  currentPlaybackKey: null,
  currentPreviewUrl: "",
  discoPartyOn: false,
  shares: [],
  ownerUid: "",
};
const deezerPreviewCache = new Map();
const deezerPreviewRequests = new Map();
const appleUrlCache = new Map();
const appleUrlRequests = new Map();
let feedPreviewRefreshTimer = 0;

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
  if (themeIcon) themeIcon.textContent = isDark ? "☾" : "☀";
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
    svg.append(createSvgElement("path", {
      class: "apple-music-mark",
      d: "M16.7 12.7c0-2.35 1.92-3.47 2.01-3.53-1.09-1.59-2.78-1.81-3.38-1.84-1.43-.15-2.79.85-3.51.85-.73 0-1.84-.83-3.04-.81-1.56.03-3 .93-3.81 2.37-1.63 2.83-.42 7.01 1.16 9.31.77 1.13 1.7 2.39 2.9 2.34 1.16-.05 1.6-.75 3-.75 1.39 0 1.79.75 3.02.72 1.24-.02 2.03-1.13 2.8-2.27.9-1.31 1.27-2.59 1.29-2.66-.03-.01-2.44-.94-2.44-3.78ZM14.48 5.88c.64-.78 1.07-1.87.95-2.95-.92.04-2.05.63-2.71 1.4-.6.69-1.12 1.8-.99 2.84 1.02.08 2.09-.52 2.75-1.29Z"
    }));
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

function catalogUrl(queryText, callbackName = "") {
  const params = new URLSearchParams({
    term: queryText,
    entity: "song",
    media: "music",
    country: localCountry(),
    limit: "18",
  });
  if (callbackName) params.set("callback", callbackName);
  return `https://itunes.apple.com/search?${params.toString()}`;
}

function playableTracks(payload) {
  return (payload?.results || [])
    .map(normalizeTrack)
    .filter((track) => track.title && track.artist && track.previewUrl)
    .slice(0, 8);
}

function normalizeDeezerTrack(item) {
  return {
    id: `deezer-${String(item?.id || songKey({ artistName: item?.artist?.name, trackName: item?.title }))}`,
    title: cleanText(item?.title || item?.title_short || "Unknown song", 120),
    artist: cleanText(item?.artist?.name || "Unknown artist", 120),
    album: cleanText(item?.album?.title || "Single", 140),
    artwork: safeUrl(item?.album?.cover_xl || item?.album?.cover_big || item?.album?.cover_medium || ""),
    previewUrl: safeUrl(item?.preview),
    appleUrl: "",
    durationMs: Math.max(0, Math.min((Number(item?.duration) || 0) * 1000, 900000)),
    explicit: Boolean(item?.explicit_lyrics),
  };
}

function isAppleMobile() {
  const userAgent = navigator.userAgent || "";
  return /iPad|iPhone|iPod/.test(userAgent)
    || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

async function fetchAppleCatalog(queryText) {
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  const timeout = controller ? window.setTimeout(() => controller.abort(), 8500) : null;

  try {
    const response = await fetch(catalogUrl(queryText), { signal: controller?.signal });
    if (!response.ok) throw new Error(`Music search returned ${response.status}.`);
    return playableTracks(await response.json());
  } finally {
    if (timeout) window.clearTimeout(timeout);
  }
}

function fetchJsonp(callbackPrefix, urlForCallback) {
  return new Promise((resolve, reject) => {
    const callbackName = `${callbackPrefix}${Date.now()}${Math.random().toString(36).slice(2)}`;
    const script = document.createElement("script");
    let settled = false;
    let timeout;
    const finish = (error, payload) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      delete window[callbackName];
      script.remove();
      if (error) reject(error);
      else resolve(payload || []);
    };
    timeout = window.setTimeout(() => finish(new Error("Search timed out. Try again.")), 9000);

    window[callbackName] = (payload) => finish(null, payload);
    script.onerror = () => finish(new Error("Couldn’t reach the music catalogue."));
    script.src = urlForCallback(callbackName);
    document.head.append(script);
  });
}

function fetchAppleCatalogJsonp(queryText) {
  return fetchJsonp("resonanceAppleSearch", (callbackName) => catalogUrl(queryText, callbackName))
    .then(playableTracks);
}

function deezerCatalogUrl(queryText, callbackName) {
  const params = new URLSearchParams({ q: queryText, limit: "18", output: "jsonp", callback: callbackName });
  return `https://api.deezer.com/search?${params.toString()}`;
}

function deezerTrackId(track) {
  const match = /^deezer-(\d+)$/.exec(String(track?.id || ""));
  return match ? match[1] : "";
}

function previewExpiryMs(url) {
  try {
    const token = new URL(url).searchParams.get("hdnea") || "";
    const match = /(?:^|~)exp=(\d+)/.exec(token);
    return match ? Number(match[1]) * 1000 : 0;
  } catch {
    return 0;
  }
}

function cachedDeezerPreview(track) {
  const trackId = deezerTrackId(track);
  const cached = trackId && deezerPreviewCache.get(trackId);
  if (!cached) return "";
  if (cached.expiresAt && cached.expiresAt - Date.now() <= DEEZER_PREVIEW_SAFETY_MS) {
    deezerPreviewCache.delete(trackId);
    return "";
  }
  return cached.url;
}

function refreshDeezerPreview(track, { force = false } = {}) {
  const trackId = deezerTrackId(track);
  if (!trackId) return Promise.resolve("");

  if (!force) {
    const cached = cachedDeezerPreview(track);
    if (cached) return Promise.resolve(cached);
  }
  if (deezerPreviewRequests.has(trackId)) return deezerPreviewRequests.get(trackId);

  const request = fetchJsonp("resonanceDeezerTrack", (callbackName) => {
    const params = new URLSearchParams({ output: "jsonp", callback: callbackName });
    return `https://api.deezer.com/track/${encodeURIComponent(trackId)}?${params.toString()}`;
  }).then((payload) => {
    const url = safeUrl(payload?.preview);
    if (url) deezerPreviewCache.set(trackId, { url, expiresAt: previewExpiryMs(url) });
    return url;
  }).catch(() => "").finally(() => {
    deezerPreviewRequests.delete(trackId);
  });

  deezerPreviewRequests.set(trackId, request);
  return request;
}

function fetchDeezerCatalogJsonp(queryText) {
  return fetchJsonp("resonanceDeezerSearch", (callbackName) => deezerCatalogUrl(queryText, callbackName))
    .then((payload) => (payload?.data || [])
      .map(normalizeDeezerTrack)
      .filter((track) => track.title && track.artist && track.previewUrl)
      .slice(0, 8));
}

async function searchCatalog(term) {
  const queryText = cleanText(term, 120);
  if (queryText.length < 2) return [];

  const requestId = ++state.searchVersion;
  const sources = isAppleMobile()
    ? [fetchDeezerCatalogJsonp, fetchAppleCatalog, fetchAppleCatalogJsonp]
    : [fetchAppleCatalog, fetchAppleCatalogJsonp, fetchDeezerCatalogJsonp];
  let lastError;

  for (const source of sources) {
    if (requestId !== state.searchVersion) return [];
    try {
      const tracks = await source(queryText);
      if (requestId !== state.searchVersion) return [];
      if (tracks.length) return tracks;
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError) throw new Error("Couldn’t reach the music catalogue.");
  return [];
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
    searchInput.blur();
    toast("Already added.", "error");
    return;
  }
  if (state.selectedTracks.length >= MAX_TRACKS_PER_SHARE) {
    toast("That’s enough for one share.", "error");
    return;
  }

  state.selectedTracks.push(track);
  searchInput.blur();
  clearSearchQuery();
  renderSelectedTracks();
}

function removeSelectedTrack(trackId) {
  if (state.currentPlaybackKey === `draft:${trackId}`) stopPlayback();
  state.selectedTracks = state.selectedTracks.filter((track) => track.id !== trackId);
  renderSelectedTracks();
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
  shareStatus.textContent = "Uploading…";
  toast("Uploading.");
  try {
    const owner = await ensureAnonymousUser();
    state.ownerUid = owner.uid;
    await Promise.all(state.selectedTracks.map(async (track) => {
      const [previewUrl, appleUrl] = await Promise.all([
        refreshDeezerPreview(track),
        resolveAppleMusicUrl(track),
      ]);
      if (previewUrl) track.previewUrl = previewUrl;
      if (appleUrl) track.appleUrl = appleUrl;
    }));
    await addDoc(collection(db, "shares"), {
      tracks: state.selectedTracks,
      senderName,
      note,
      ownerUid: state.ownerUid,
      createdAt: serverTimestamp(),
    });
    rememberName(senderNameInput.value ? senderName : "");
    if (state.currentPlaybackKey?.startsWith("draft:")) stopPlayback();
    noteInput.value = "";
    state.selectedTracks = [];
    clearSearchQuery();
    renderSelectedTracks();
  } catch (error) {
    shareButton.disabled = false;
    shareStatus.textContent = "Couldn’t upload that. Try again.";
    toast("Couldn’t upload that. Try again.", "error");
    console.error(error);
  }
});

function trackFromRaw(raw) {
  const value = raw && typeof raw === "object" ? raw : {};
  const track = {
    id: cleanText(value.id, 60),
    title: cleanText(value.title, 120) || "Unknown song",
    artist: cleanText(value.artist, 120) || "Unknown artist",
    album: cleanText(value.album, 140),
    artwork: safeUrl(value.artwork),
    previewUrl: safeUrl(value.previewUrl),
    appleUrl: safeUrl(value.appleUrl),
  };
  return {
    ...track,
    previewUrl: cachedDeezerPreview(track) || track.previewUrl,
    appleUrl: cachedAppleMusicUrl(track) || track.appleUrl,
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

function localAppleMusicUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.hostname !== "music.apple.com") return "";
    const path = url.pathname.split("/");
    if (/^[a-z]{2}$/i.test(path[1] || "")) path[1] = localCountry().toLowerCase();
    url.pathname = path.join("/");
    return url.href;
  } catch {
    return "";
  }
}

function appleTrackKey(track) {
  return `${track.id}:${cleanText(track.title, 120).toLowerCase()}:${cleanText(track.artist, 120).toLowerCase()}`;
}

function cachedAppleMusicUrl(track) {
  const direct = localAppleMusicUrl(track.appleUrl);
  return direct || appleUrlCache.get(appleTrackKey(track)) || "";
}

function appleResultScore(candidate, track) {
  const title = cleanText(track.title, 120).toLowerCase();
  const artist = cleanText(track.artist, 120).toLowerCase();
  const candidateTitle = cleanText(candidate.title, 120).toLowerCase();
  const candidateArtist = cleanText(candidate.artist, 120).toLowerCase();
  return (candidateTitle === title ? 4 : candidateTitle.includes(title) || title.includes(candidateTitle) ? 2 : 0)
    + (candidateArtist === artist ? 3 : candidateArtist.includes(artist) || artist.includes(candidateArtist) ? 1 : 0);
}

function resolveAppleMusicUrl(track) {
  const known = cachedAppleMusicUrl(track);
  if (known) return Promise.resolve(known);

  const key = appleTrackKey(track);
  if (appleUrlRequests.has(key)) return appleUrlRequests.get(key);

  const request = (async () => {
    const searchText = cleanText(`${track.title} ${track.artist}`, 240);
    const sources = [fetchAppleCatalog, fetchAppleCatalogJsonp];
    for (const source of sources) {
      try {
        const results = await source(searchText);
        const match = [...results].sort((a, b) => appleResultScore(b, track) - appleResultScore(a, track))[0];
        const url = localAppleMusicUrl(match?.appleUrl);
        if (url) {
          appleUrlCache.set(key, url);
          return url;
        }
      } catch {
        // The JSONP source below covers browsers that block a direct catalogue request.
      }
    }
    return "";
  })().finally(() => appleUrlRequests.delete(key));

  appleUrlRequests.set(key, request);
  return request;
}

function providerUrl(track, provider) {
  const text = encodeURIComponent(`${track.title} ${track.artist}`);
  if (provider === "Apple Music") {
    return localAppleMusicUrl(track.appleUrl)
      || `https://music.apple.com/${localCountry().toLowerCase()}/search?term=${text}`;
  }
  return `https://open.spotify.com/search/${text}`;
}

async function deleteShare(share, button) {
  if (!state.ownerUid || cleanText(share.ownerUid, 128) !== state.ownerUid) return;
  if (!window.confirm("Are you sure?")) return;

  button.disabled = true;
  try {
    await deleteDoc(doc(db, "shares", share.id));
    toast("Deleted.");
  } catch (error) {
    button.disabled = false;
    toast("Couldn’t delete that. Try again.", "error");
    console.error(error);
  }
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
  const freshPreview = cachedDeezerPreview(track);
  if (freshPreview) track.previewUrl = freshPreview;
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
    if (deezerTrackId(track)) {
      void refreshDeezerPreview(track, { force: true }).then((previewUrl) => {
        if (previewUrl) {
          track.previewUrl = previewUrl;
          toast("Preview refreshed — tap play again.");
        } else {
          toast("Preview couldn’t play in this browser.", "error");
        }
      });
    } else {
      toast("Preview couldn’t play in this browser.", "error");
    }
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

  const meta = createElement("div", "shared-meta share-meta");
  const metaCopy = createElement("span", "share-meta-copy");
  metaCopy.append(
    createElement("b", "", cleanText(share.senderName, 40) || "someone"),
    document.createTextNode(` · ${relativeTime(share.createdAt)}`)
  );
  const metaActions = createElement("div", "share-meta-actions");
  const links = createElement("div", "quick-links");
  links.append(createElement("span", "open-in", "Open in:"));
  tracks.forEach((track) => {
    const providers = createElement("span", "provider-set");
    providers.setAttribute("aria-label", `Open ${track.title}`);
    ["Spotify", "Apple Music"].forEach((provider) => {
      const link = createElement("a", `quick-link provider-link ${provider === "Spotify" ? "spotify-link" : "apple-music-link"}`);
      link.href = providerUrl(track, provider);
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.setAttribute("aria-label", `Open ${track.title} in ${provider}`);
      link.append(providerIcon(provider));
      providers.append(link);
    });
    links.append(providers);
  });
  metaActions.append(links);

  if (state.ownerUid && cleanText(share.ownerUid, 128) === state.ownerUid) {
    const remove = createElement("button", "delete-share", "×");
    remove.type = "button";
    remove.setAttribute("aria-label", "Delete this share");
    remove.title = "Delete this share";
    remove.addEventListener("click", () => deleteShare(share, remove));
    metaActions.append(remove);
  }

  meta.append(metaCopy, metaActions);
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

    row.append(play, image(track.artwork, `Artwork for ${track.title}`), copy);
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

function refreshFeedPreviews() {
  const tracks = new Map();
  state.shares.forEach((share) => {
    tracksFromShare(share).forEach((track) => {
      const trackId = deezerTrackId(track);
      if (trackId && !cachedDeezerPreview(track)) tracks.set(trackId, track);
    });
  });
  if (!tracks.size) return;

  void Promise.all([...tracks.values()].map((track) => refreshDeezerPreview(track)))
    .then((previews) => {
      if (previews.some(Boolean)) renderFeed();
    });
}

function refreshAppleMusicLinks() {
  const tracks = new Map();
  state.shares.forEach((share) => {
    tracksFromShare(share).forEach((track) => {
      if (!cachedAppleMusicUrl(track)) tracks.set(appleTrackKey(track), track);
    });
  });
  if (!tracks.size) return;

  void Promise.all([...tracks.values()].map((track) => resolveAppleMusicUrl(track)))
    .then((urls) => {
      if (urls.some(Boolean)) renderFeed();
    });
}

function scheduleFeedPreviewRefresh() {
  window.clearTimeout(feedPreviewRefreshTimer);
  if (!state.shares.some((share) => tracksFromShare(share).some((track) => deezerTrackId(track)))) return;
  feedPreviewRefreshTimer = window.setTimeout(() => {
    refreshFeedPreviews();
    scheduleFeedPreviewRefresh();
  }, DEEZER_PREVIEW_REFRESH_MS);
}

void getCurrentUser().then((user) => {
  if (!user) return;
  state.ownerUid = user.uid;
  renderFeed();
}).catch((error) => {
  console.warn("Couldn’t restore this browser’s posting identity.", error);
});

const feedQuery = query(collection(db, "shares"), orderBy("createdAt", "desc"), limit(60));
onSnapshot(feedQuery, (snapshot) => {
  state.shares = snapshot.docs.map((document) => ({ id: document.id, ...document.data() }));
  renderFeed();
  refreshFeedPreviews();
  refreshAppleMusicLinks();
  scheduleFeedPreviewRefresh();
}, (error) => {
  console.error(error);
  feedStatus.textContent = "The wall needs a quick Firebase setup before it can load.";
  feedCount.textContent = "";
});
