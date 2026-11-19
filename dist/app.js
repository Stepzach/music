import {
  addDoc,
  auth,
  collection,
  collectionGroup,
  createUserWithEmailAndPassword,
  db,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getRedirectResult,
  googleProvider,
  limit,
  onAuthStateChanged,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  signInWithEmailAndPassword,
  signInWithRedirect,
  signOut,
  updateProfile,
  where,
  writeBatch,
} from "./firebase.js?v=20261119-5";

const $ = (selector) => document.querySelector(selector);

const audio = $("#preview-audio");
const searchInput = $("#song-search");
const searchStatus = $("#search-status");
const searchResults = $("#search-results");
const selectedTrack = $("#selected-track");
const shareForm = $("#share-form");
const shareButton = $("#share-button");
const shareStatus = $("#share-status");
const noteInput = $("#song-note");
const feedStatus = $("#feed-status");
const feedList = $("#feed-list");
const feedCount = $("#feed-count");
const toastRoot = $("#toast-root");
const themeToggle = $("#theme-toggle");
const themeColor = $("meta[name='theme-color']");
const mastheadTitle = $("#masthead-title");
const mastheadTagline = $("#masthead-tagline");
const authView = $("#auth-view");
const homeView = $("#home-view");
const playlistView = $("#playlist-view");
const authForm = $("#auth-form");
const authTitle = $("#auth-title");
const authSubtitle = $("#auth-subtitle");
const authNameRow = $("#auth-name-row");
const authNameInput = $("#auth-name");
const authEmailRow = $("#auth-email-row");
const authEmailInput = $("#auth-email");
const authPasswordRow = $("#auth-password-row");
const authPasswordInput = $("#auth-password");
const authSubmit = $("#auth-submit");
const authStatus = $("#auth-status");
const authDivider = $("#auth-divider");
const authSwitch = $("#auth-switch");
const googleSignInButton = $("#google-sign-in");
const accountTrigger = $("#account-trigger");
const accountDialog = $("#account-dialog");
const closeAccountDialog = $("#close-account-dialog");
const accountForm = $("#account-form");
const accountNameInput = $("#account-name");
const accountEmail = $("#account-email");
const accountSaveButton = $("#account-save");
const accountStatus = $("#account-status");
const accountSignOut = $("#account-sign-out");
const playlistList = $("#playlist-list");
const homeStatus = $("#home-status");
const showCreatePlaylist = $("#show-create-playlist");
const showJoinPlaylist = $("#show-join-playlist");
const createPlaylistForm = $("#create-playlist-form");
const createPlaylistName = $("#new-playlist-name");
const createPlaylistButton = $("#create-playlist-button");
const createPlaylistStatus = $("#create-playlist-status");
const joinPlaylistForm = $("#join-playlist-form");
const joinCodeInput = $("#join-code");
const joinPlaylistButton = $("#join-playlist-button");
const joinPlaylistStatus = $("#join-playlist-status");
const backToPlaylists = $("#back-to-playlists");
const playlistMembersSummary = $("#playlist-members-summary");
const invitePeople = $("#invite-people");
const inviteDialog = $("#invite-dialog");
const inviteCode = $("#invite-code");
const closeInviteDialog = $("#close-invite-dialog");
const openPlaylistSettings = $("#open-playlist-settings");
const playlistSettingsDialog = $("#playlist-settings-dialog");
const closePlaylistSettings = $("#close-playlist-settings");
const renamePlaylistForm = $("#rename-playlist-form");
const renamePlaylistName = $("#rename-playlist-name");
const renamePlaylistButton = $("#rename-playlist-button");
const renamePlaylistStatus = $("#rename-playlist-status");
const deletePlaylistButton = $("#delete-playlist");
const memberDialog = $("#member-dialog");
const memberDialogList = $("#member-dialog-list");
const closeMemberDialog = $("#close-member-dialog");
const DISCO_ENGINE_URL = "./disco-engine.js";
const MAX_TRACKS_PER_SHARE = 12;
const THEME_OVERRIDE_STORAGE_KEY = "resonance-theme-override";
const LEGACY_THEME_STORAGE_KEY = "resonance-theme";
const DAY_START_HOUR = 7;
const NIGHT_START_HOUR = 19;
const DEEZER_PREVIEW_REFRESH_MS = 2 * 60 * 1000;
const DEEZER_PREVIEW_SAFETY_MS = 2 * 60 * 1000;

const state = {
  selectedTracks: [],
  searchVersion: 0,
  currentPlaybackKey: null,
  currentPreviewUrl: "",
  discoPartyOn: false,
  shares: [],
  user: null,
  profile: null,
  memberships: [],
  activePlaylist: null,
  activeMembers: [],
  authMode: "signUp",
  membershipUnsubscribe: null,
  feedUnsubscribe: null,
  memberUnsubscribe: null,
  playlistUnsubscribe: null,
};
const deezerPreviewCache = new Map();
const deezerPreviewRequests = new Map();
const appleUrlCache = new Map();
const appleUrlRequests = new Map();
let feedPreviewRefreshTimer = 0;
let themeBoundaryTimer = 0;
const playlistMetadataUnsubscribers = new Map();

function automaticTheme(now = new Date()) {
  const hour = now.getHours();
  return hour >= DAY_START_HOUR && hour < NIGHT_START_HOUR ? "light" : "dark";
}

function nextThemeBoundary(now = new Date()) {
  const boundary = new Date(now);
  const hour = now.getHours();
  const nextHour = hour < DAY_START_HOUR || hour >= NIGHT_START_HOUR ? DAY_START_HOUR : NIGHT_START_HOUR;
  boundary.setHours(nextHour, 0, 0, 0);
  if (boundary <= now) boundary.setDate(boundary.getDate() + 1);
  return boundary;
}

function storedThemeOverride() {
  try {
    const value = JSON.parse(localStorage.getItem(THEME_OVERRIDE_STORAGE_KEY) || "null");
    if (value?.theme && (value.theme === "dark" || value.theme === "light") && Number(value.expiresAt) > Date.now()) {
      return value.theme;
    }
    localStorage.removeItem(THEME_OVERRIDE_STORAGE_KEY);
    // A previous release saved a permanent preference. Let the local clock take
    // over after this update rather than preserving that old override forever.
    localStorage.removeItem(LEGACY_THEME_STORAGE_KEY);
  } catch {
    // Storage is optional; the automatic theme still works without it.
  }
  return "";
}

function applyTheme(theme) {
  const nextTheme = theme === "dark" ? "dark" : "light";
  const isDark = nextTheme === "dark";
  document.documentElement.dataset.theme = nextTheme;
  document.documentElement.style.colorScheme = nextTheme;
  if (themeToggle) {
    themeToggle.setAttribute("aria-pressed", String(isDark));
    themeToggle.dataset.theme = nextTheme;
    themeToggle.dataset.automaticTheme = automaticTheme();
    themeToggle.setAttribute("aria-label", isDark ? "Switch to light mode" : "Switch to dark mode");
    themeToggle.title = isDark ? "Switch to light mode" : "Switch to dark mode";
  }
  if (themeColor) themeColor.setAttribute("content", isDark ? "#141416" : "#ffffff");
}

function setManualTheme(theme) {
  try {
    localStorage.setItem(THEME_OVERRIDE_STORAGE_KEY, JSON.stringify({
      theme,
      expiresAt: nextThemeBoundary().getTime(),
    }));
  } catch { /* The current session still updates. */ }
  applyTheme(theme);
}

function syncThemeWithLocalTime() {
  window.clearTimeout(themeBoundaryTimer);
  applyTheme(storedThemeOverride() || automaticTheme());
  const delay = Math.max(1000, nextThemeBoundary().getTime() - Date.now() + 1000);
  themeBoundaryTimer = window.setTimeout(syncThemeWithLocalTime, delay);
}

syncThemeWithLocalTime();
themeToggle?.addEventListener("click", () => {
  setManualTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
});

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) syncThemeWithLocalTime();
});

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

function providerIcon(provider) {
  const isSpotify = provider === "Spotify";
  const icon = createElement("span", `provider-icon ${isSpotify ? "spotify-icon" : "apple-music-icon"}`);
  const mark = document.createElement("img");
  mark.src = isSpotify ? "./assets/spotify.png" : "./assets/apple-music.png";
  mark.alt = "";
  mark.decoding = "async";
  icon.append(mark);
  return icon;
}

function playbackIcon(isPlaying = false) {
  const icon = createElement("i", `play-icon fa-solid ${isPlaying ? "fa-pause" : "fa-play"}`);
  icon.setAttribute("aria-hidden", "true");
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
    const previewIcon = createElement("span", "artwork-play-icon");
    previewIcon.append(playbackIcon());
    preview.append(image(track.artwork, "", "cover"), previewIcon);

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

shareForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!state.user || !state.profile || !state.activePlaylist) {
    shareStatus.textContent = "Choose a playlist first.";
    return;
  }
  if (!state.selectedTracks.length) {
    shareStatus.textContent = "Choose a song first.";
    searchInput.focus();
    return;
  }

  const senderName = cleanText(state.profile.displayName, 40) || "someone";
  const note = cleanText(noteInput.value, 280);
  shareButton.disabled = true;
  shareStatus.textContent = "Uploading…";
  try {
    await Promise.all(state.selectedTracks.map(async (track) => {
      const [previewUrl, appleUrl] = await Promise.all([
        refreshDeezerPreview(track),
        resolveAppleMusicUrl(track),
      ]);
      if (previewUrl) track.previewUrl = previewUrl;
      if (appleUrl) track.appleUrl = appleUrl;
    }));
    await addDoc(collection(db, "sharedPlaylists", state.activePlaylist.id, "shares"), {
      tracks: state.selectedTracks,
      senderName,
      note,
      senderUid: state.user.uid,
      createdAt: serverTimestamp(),
    });
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
    spotifyUrl: safeUrl(value.spotifyUrl),
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

function appleMusicUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !["music.apple.com", "geo.music.apple.com"].includes(url.hostname)) return "";
    return url.href;
  } catch {
    return "";
  }
}

function spotifyUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.hostname !== "open.spotify.com") return "";
    return url.href;
  } catch {
    return "";
  }
}

function spotifySearchUrl(track) {
  // Artist-and-title filters reduce common-title false matches.
  const query = cleanText(`track:${track.title} artist:${track.artist}`, 240);
  return `https://open.spotify.com/search/${encodeURIComponent(query)}`;
}

function appleTrackKey(track) {
  return `${track.id}:${cleanText(track.title, 120).toLowerCase()}:${cleanText(track.artist, 120).toLowerCase()}`;
}

function cachedAppleMusicUrl(track) {
  const direct = appleMusicUrl(track.appleUrl);
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
        const url = appleMusicUrl(match?.appleUrl);
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
    return appleMusicUrl(track.appleUrl)
      || `https://music.apple.com/${localCountry().toLowerCase()}/search?term=${text}`;
  }
  return spotifyUrl(track.spotifyUrl) || spotifySearchUrl(track);
}

async function deleteShare(share, button) {
  if (!state.user || !state.activePlaylist) return;
  const canDelete = cleanText(share.senderUid, 128) === state.user.uid
    || state.activePlaylist.role === "owner";
  if (!canDelete) return;
  if (!window.confirm("Are you sure you want to delete?")) return;

  button.disabled = true;
  try {
    await deleteDoc(doc(db, "sharedPlaylists", state.activePlaylist.id, "shares", share.id));
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
    const icon = button.querySelector(".play-icon");
    if (icon) icon.className = `play-icon fa-solid ${current ? "fa-pause" : "fa-play"}`;
    button.setAttribute("aria-label", current ? `Pause ${button.dataset.songTitle}` : `Play ${button.dataset.songTitle}`);
  });

  document.querySelectorAll(".artwork-preview").forEach((button) => {
    const current = playing && button.dataset.playbackKey === state.currentPlaybackKey;
    button.classList.toggle("is-current", current);
    const icon = button.querySelector(".artwork-play-icon .play-icon");
    if (icon) icon.className = `play-icon fa-solid ${current ? "fa-pause" : "fa-play"}`;
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
  tracks.forEach((track) => {
    const providers = createElement("span", "provider-set");
    providers.setAttribute("aria-label", `Open ${track.title}`);
    ["Spotify", "Apple Music"].forEach((provider) => {
      const link = createElement("a", `quick-link provider-link ${provider === "Spotify" ? "spotify-link" : "apple-music-link"}`);
      link.href = providerUrl(track, provider);
      link.setAttribute("aria-label", `Open ${track.title} in ${provider}`);
      link.append(providerIcon(provider));
      providers.append(link);
    });
    links.append(providers);
  });
  metaActions.append(links);

  const canDelete = state.user && state.activePlaylist
    && (cleanText(share.senderUid, 128) === state.user.uid || state.activePlaylist.role === "owner");
  if (canDelete) {
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
    const play = createElement("button", "play-button");
    play.type = "button";
    play.dataset.playbackKey = playbackKey;
    play.dataset.songTitle = track.title;
    play.setAttribute("aria-label", `Play ${track.title}`);
    play.addEventListener("click", () => toggleTrackPreview(track, playbackKey));
    play.append(playbackIcon());

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

function setMasthead(tagline) {
  mastheadTitle.textContent = "resonance";
  mastheadTagline.textContent = tagline;
}

function showView(name) {
  authView.hidden = name !== "auth";
  homeView.hidden = name !== "home";
  playlistView.hidden = name !== "playlist";
}

function readableError(error, fallback = "Something went wrong. Try again.") {
  const code = String(error?.code || "");
  const messages = {
    "auth/email-already-in-use": "That email already has an account. Try signing in.",
    "auth/invalid-credential": "That email or password isn’t right.",
    "auth/invalid-email": "Enter a valid email address.",
    "auth/weak-password": "Use at least 6 characters for your password.",
    "auth/operation-not-allowed": "This sign-in option isn’t available right now.",
    "auth/unauthorized-domain": "Google sign-in needs this site added to Firebase first.",
    "permission-denied": "You don’t have access to that yet.",
  };
  return messages[code] || fallback;
}

function updateAccountLabels() {
  const name = cleanText(state.profile?.displayName, 40);
  const isReady = Boolean(state.user && state.profile);
  accountTrigger.hidden = !isReady;
  accountTrigger.setAttribute("aria-label", name ? `Open ${name}'s profile` : "Open profile");
  accountTrigger.title = name || "Profile";
  accountEmail.textContent = cleanText(state.user?.email, 160) || "No email saved";
}

function showAuth(mode = "signUp") {
  state.authMode = mode;
  const isSignIn = mode === "signIn";
  const isProfile = mode === "profile";

  authNameRow.hidden = isSignIn;
  authEmailRow.hidden = isProfile;
  authPasswordRow.hidden = isProfile;
  authDivider.hidden = isProfile;
  googleSignInButton.hidden = isProfile;
  authSwitch.hidden = isProfile;
  authNameInput.required = !isSignIn;
  authEmailInput.required = !isProfile;
  authPasswordInput.required = !isProfile;
  authPasswordInput.autocomplete = isSignIn ? "current-password" : "new-password";
  authStatus.textContent = "";

  if (isProfile) {
    authTitle.textContent = "One small thing";
    authSubtitle.textContent = "What should your friends call you?";
    authSubmit.textContent = "Continue";
    authNameInput.value = authNameInput.value || cleanText(state.user?.displayName, 40);
  } else if (isSignIn) {
    authTitle.textContent = "Welcome back";
    authSubtitle.textContent = "Pick up where you left off.";
    authSubmit.textContent = "Sign in";
    authSwitch.textContent = "New here? Create an account";
  } else {
    authTitle.textContent = "Welcome";
    authSubtitle.textContent = "Make a space for the songs you share.";
    authSubmit.textContent = "Create account";
    authSwitch.textContent = "Already have an account? Sign in";
  }

  setMasthead("Shared playlists");
  showView("auth");
}

function clearFeedSubscription() {
  if (state.feedUnsubscribe) state.feedUnsubscribe();
  state.feedUnsubscribe = null;
}

function clearMembershipSubscription() {
  if (state.membershipUnsubscribe) state.membershipUnsubscribe();
  state.membershipUnsubscribe = null;
  playlistMetadataUnsubscribers.forEach((unsubscribe) => unsubscribe());
  playlistMetadataUnsubscribers.clear();
}

function clearPlaylistSubscriptions() {
  if (state.memberUnsubscribe) state.memberUnsubscribe();
  if (state.playlistUnsubscribe) state.playlistUnsubscribe();
  state.memberUnsubscribe = null;
  state.playlistUnsubscribe = null;
  state.activeMembers = [];
  renamePlaylistStatus.textContent = "";
  if (memberDialog.open) memberDialog.close();
  if (inviteDialog.open) inviteDialog.close();
  if (playlistSettingsDialog.open) playlistSettingsDialog.close();
}

function clearPlaylistDraft() {
  stopPlayback();
  state.selectedTracks = [];
  clearSearchQuery();
  noteInput.value = "";
  renderSelectedTracks();
}

function membershipFromDocument(document) {
  const playlistRef = document.ref.parent.parent;
  if (!playlistRef) return null;
  return { id: playlistRef.id, ...document.data() };
}

function sortMemberships(items) {
  return items.sort((left, right) => {
    const leftTime = timestampValue(left.joinedAt)?.getTime() || 0;
    const rightTime = timestampValue(right.joinedAt)?.getTime() || 0;
    return rightTime - leftTime;
  });
}

function sortMembers(items) {
  return items.sort((left, right) => {
    const leftTime = timestampValue(left.joinedAt)?.getTime() || 0;
    const rightTime = timestampValue(right.joinedAt)?.getTime() || 0;
    if (leftTime !== rightTime) return leftTime - rightTime;
    return cleanText(left.displayName, 40).localeCompare(cleanText(right.displayName, 40));
  });
}

function upsertMembership(membership) {
  if (!membership?.id) return;
  state.memberships = sortMemberships([
    ...state.memberships.filter((item) => item.id !== membership.id),
    membership,
  ]);
  syncMembershipMetadataSubscriptions();
  renderHome();
}

function syncMembershipMetadataSubscriptions() {
  const activeIds = new Set(state.memberships.map((membership) => membership.id));
  playlistMetadataUnsubscribers.forEach((unsubscribe, playlistId) => {
    if (!activeIds.has(playlistId)) {
      unsubscribe();
      playlistMetadataUnsubscribers.delete(playlistId);
    }
  });

  state.memberships.forEach((membership) => {
    if (playlistMetadataUnsubscribers.has(membership.id)) return;
    const playlistRef = doc(db, "sharedPlaylists", membership.id);
    const unsubscribe = onSnapshot(playlistRef, (snapshot) => {
      if (!snapshot.exists()) {
        state.memberships = state.memberships.filter((item) => item.id !== membership.id);
        renderHome();
        return;
      }
      const playlist = snapshot.data();
      state.memberships = state.memberships.map((item) => item.id === membership.id ? {
        ...item,
        playlistName: cleanText(playlist.name, 60) || item.playlistName,
        inviteCode: cleanText(playlist.joinCode, 4) || item.inviteCode,
        ownerUid: cleanText(playlist.ownerUid, 128),
      } : item);
      renderHome();
    }, (error) => console.error(error));
    playlistMetadataUnsubscribers.set(membership.id, unsubscribe);
  });
}

function renderHome() {
  playlistList.replaceChildren();
  homeStatus.textContent = "";
  updateAccountLabels();

  if (!state.memberships.length) {
    playlistList.append(createElement("p", "empty-feed", "Nothing here yet. Make one or join one."));
    return;
  }

  const fragment = document.createDocumentFragment();
  state.memberships.forEach((membership) => {
    const item = createElement("button", "playlist-card");
    item.type = "button";
    item.append(
      (() => {
        const copy = createElement("span", "playlist-card-copy");
        copy.append(
          createElement("strong", "", cleanText(membership.playlistName, 60) || "Untitled playlist"),
          createElement("span", "", `code ${cleanText(membership.inviteCode, 4) || "—"}`)
        );
        return copy;
      })()
    );
    item.addEventListener("click", () => enterPlaylist(membership));
    fragment.append(item);
  });
  playlistList.append(fragment);
}

function startMembershipListener() {
  if (!state.user) return;
  clearMembershipSubscription();
  const membershipsQuery = query(
    collectionGroup(db, "members"),
    where("userId", "==", state.user.uid)
  );
  state.membershipUnsubscribe = onSnapshot(membershipsQuery, (snapshot) => {
    state.memberships = sortMemberships(snapshot.docs.map(membershipFromDocument).filter(Boolean));
    syncMembershipMetadataSubscriptions();
    renderHome();
  }, (error) => {
    console.error(error);
    homeStatus.textContent = "";
  });
}

function memberNames() {
  const names = state.activeMembers
    .map((member) => {
      if (member.userId === state.user?.uid) {
        return cleanText(state.profile?.displayName, 40) || cleanText(member.displayName, 40);
      }
      return cleanText(member.displayName, 40);
    })
    .filter(Boolean);
  if (names.length) return names;
  const fallback = cleanText(state.profile?.displayName, 40);
  return fallback ? [fallback] : [];
}

function renderPlaylistDetails() {
  const names = memberNames();
  playlistMembersSummary.replaceChildren();
  if (names.length) {
    playlistMembersSummary.append(document.createTextNode(names.slice(0, 2).join(", ")));
    if (names.length > 2) {
      playlistMembersSummary.append(document.createTextNode(", "));
      const overflow = createElement("button", "member-overflow", `+${names.length - 2}`);
      overflow.type = "button";
      overflow.setAttribute("aria-label", `Show all ${names.length} people in this playlist`);
      overflow.addEventListener("click", () => {
        memberDialogList.textContent = names.join(", ");
        if (!memberDialog.open) memberDialog.showModal();
      });
      playlistMembersSummary.append(overflow);
    }
  }

  const code = cleanText(state.activePlaylist?.inviteCode, 4);
  invitePeople.disabled = !code;
  invitePeople.setAttribute("aria-label", code ? "Add people to this playlist" : "No invite code available");
  inviteCode.textContent = code || "—";
  if (!playlistSettingsDialog.open) {
    renamePlaylistName.value = cleanText(state.activePlaylist?.playlistName, 60);
  }
}

function subscribeToActivePlaylist() {
  if (!state.activePlaylist) return;
  if (state.playlistUnsubscribe) state.playlistUnsubscribe();
  const playlistId = state.activePlaylist.id;
  state.playlistUnsubscribe = onSnapshot(doc(db, "sharedPlaylists", playlistId), (snapshot) => {
    if (!state.activePlaylist || state.activePlaylist.id !== playlistId) return;
    if (!snapshot.exists()) {
      toast("This playlist was deleted.", "error");
      backToHome();
      return;
    }
    const playlist = snapshot.data();
    state.activePlaylist = {
      ...state.activePlaylist,
      playlistName: cleanText(playlist.name, 60) || state.activePlaylist.playlistName,
      inviteCode: cleanText(playlist.joinCode, 4) || state.activePlaylist.inviteCode,
      ownerUid: cleanText(playlist.ownerUid, 128),
    };
    setMasthead(state.activePlaylist.playlistName || "Shared playlist");
    renderPlaylistDetails();
  }, (error) => console.error(error));
}

function subscribeToActiveMembers() {
  if (state.memberUnsubscribe) state.memberUnsubscribe();
  if (!state.activePlaylist) return;
  const playlistId = state.activePlaylist.id;
  state.memberUnsubscribe = onSnapshot(collection(db, "sharedPlaylists", playlistId, "members"), (snapshot) => {
    if (!state.activePlaylist || state.activePlaylist.id !== playlistId) return;
    state.activeMembers = sortMembers(snapshot.docs.map((document) => ({ id: document.id, ...document.data() })));
    renderPlaylistDetails();
  }, (error) => console.error(error));
}

function subscribeToPlaylistShares() {
  clearFeedSubscription();
  if (!state.activePlaylist) return;
  feedStatus.textContent = "Loading songs…";
  feedCount.textContent = "";
  const sharesQuery = query(
    collection(db, "sharedPlaylists", state.activePlaylist.id, "shares"),
    orderBy("createdAt", "desc"),
    limit(60)
  );
  state.feedUnsubscribe = onSnapshot(sharesQuery, (snapshot) => {
    state.shares = snapshot.docs.map((document) => ({ id: document.id, ...document.data() }));
    renderFeed();
    refreshFeedPreviews();
    refreshAppleMusicLinks();
    scheduleFeedPreviewRefresh();
  }, (error) => {
    console.error(error);
    feedStatus.textContent = "";
    feedCount.textContent = "";
  });
}

function enterPlaylist(membership) {
  if (!state.user || !membership?.id) return;
  clearPlaylistSubscriptions();
  clearPlaylistDraft();
  state.activePlaylist = membership;
  setMasthead(cleanText(membership.playlistName, 60) || "Shared playlist");
  showView("playlist");
  renderPlaylistDetails();
  subscribeToActivePlaylist();
  subscribeToActiveMembers();
  subscribeToPlaylistShares();
}

function backToHome() {
  clearFeedSubscription();
  clearPlaylistSubscriptions();
  clearPlaylistDraft();
  state.activePlaylist = null;
  state.shares = [];
  setMasthead("Your shared playlists");
  showView("home");
  renderHome();
}

function randomJoinCode() {
  const values = new Uint32Array(1);
  if (window.crypto?.getRandomValues) window.crypto.getRandomValues(values);
  else values[0] = Math.floor(Math.random() * 10000);
  return String(values[0] % 10000).padStart(4, "0");
}

function codeTakenError() {
  const error = new Error("That code was taken.");
  error.code = "resonance/code-taken";
  return error;
}

async function createSharedPlaylist(name) {
  if (!state.user || !state.profile) throw new Error("Sign in first.");
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const code = randomJoinCode();
    const playlistRef = doc(collection(db, "sharedPlaylists"));
    const codeRef = doc(db, "playlistCodes", code);
    const memberRef = doc(db, "sharedPlaylists", playlistRef.id, "members", state.user.uid);
    try {
      await runTransaction(db, async (transaction) => {
        const existingCode = await transaction.get(codeRef);
        if (existingCode.exists()) throw codeTakenError();
        transaction.set(playlistRef, {
          name,
          ownerUid: state.user.uid,
          joinCode: code,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        transaction.set(codeRef, {
          playlistId: playlistRef.id,
          playlistName: name,
          createdAt: serverTimestamp(),
        });
        transaction.set(memberRef, {
          userId: state.user.uid,
          displayName: state.profile.displayName,
          playlistName: name,
          role: "owner",
          inviteCode: code,
          joinedAt: serverTimestamp(),
        });
      });
      return {
        id: playlistRef.id,
        userId: state.user.uid,
        displayName: state.profile.displayName,
        playlistName: name,
        role: "owner",
        inviteCode: code,
      };
    } catch (error) {
      if (error?.code === "resonance/code-taken") continue;
      throw error;
    }
  }
  throw new Error("Couldn’t find a free code. Try again.");
}

async function joinSharedPlaylist(code) {
  if (!state.user || !state.profile) throw new Error("Sign in first.");
  const codeSnapshot = await getDoc(doc(db, "playlistCodes", code));
  if (!codeSnapshot.exists()) throw new Error("No playlist has that code.");

  const invite = codeSnapshot.data();
  const playlistId = cleanText(invite.playlistId, 128);
  const playlistName = cleanText(invite.playlistName, 60);
  if (!playlistId || !playlistName) throw new Error("That code doesn’t look right.");

  const membershipRef = doc(db, "sharedPlaylists", playlistId, "members", state.user.uid);
  const existingMembership = await getDoc(membershipRef);
  if (existingMembership.exists()) {
    return { id: playlistId, ...existingMembership.data() };
  }

  await setDoc(membershipRef, {
    userId: state.user.uid,
    displayName: state.profile.displayName,
    playlistName,
    role: "member",
    inviteCode: code,
    joinedAt: serverTimestamp(),
  });
  return {
    id: playlistId,
    userId: state.user.uid,
    displayName: state.profile.displayName,
    playlistName,
    role: "member",
    inviteCode: code,
  };
}

function setInviteDialogOpen(open) {
  if (open) {
    if (!cleanText(state.activePlaylist?.inviteCode, 4)) return;
    if (!inviteDialog.open) inviteDialog.showModal();
    return;
  }
  if (inviteDialog.open) inviteDialog.close();
}

function setPlaylistSettingsOpen(open) {
  renamePlaylistStatus.textContent = "";
  if (open) {
    renamePlaylistName.value = cleanText(state.activePlaylist?.playlistName, 60);
    if (!playlistSettingsDialog.open) playlistSettingsDialog.showModal();
    window.setTimeout(() => {
      renamePlaylistName.focus();
      renamePlaylistName.select();
    }, 0);
    return;
  }
  if (playlistSettingsDialog.open) playlistSettingsDialog.close();
}

function setAccountDialogOpen(open) {
  accountStatus.textContent = "";
  if (open) {
    if (!state.user || !state.profile) return;
    accountNameInput.value = cleanText(state.profile.displayName, 40);
    accountEmail.textContent = cleanText(state.user.email, 160) || "No email saved";
    if (!accountDialog.open) accountDialog.showModal();
    window.setTimeout(() => {
      accountNameInput.focus();
      accountNameInput.select();
    }, 0);
    return;
  }
  if (accountDialog.open) accountDialog.close();
}

async function updateCurrentProfileName(name) {
  if (!state.user || !state.profile) throw new Error("Sign in first.");
  const displayName = cleanText(name, 40);
  if (!displayName) throw new Error("Add the name you’d like to use.");

  await setDoc(doc(db, "profiles", state.user.uid), {
    displayName,
    updatedAt: serverTimestamp(),
  }, { merge: true });
  await updateProfile(state.user, { displayName });

  state.profile = { ...state.profile, displayName };
  updateAccountLabels();
  renderHome();
  renderPlaylistDetails();
}

async function renameActivePlaylist(name) {
  if (!state.activePlaylist) throw new Error("Choose a playlist first.");
  const playlistName = cleanText(name, 60);
  if (!playlistName) throw new Error("Give it a name first.");

  const playlistRef = doc(db, "sharedPlaylists", state.activePlaylist.id);
  const codeRef = doc(db, "playlistCodes", state.activePlaylist.inviteCode);
  const [codeSnapshot, membersSnapshot] = await Promise.all([
    getDoc(codeRef),
    getDocs(collection(db, "sharedPlaylists", state.activePlaylist.id, "members")),
  ]);
  if (!codeSnapshot.exists() || cleanText(codeSnapshot.data().playlistId, 128) !== state.activePlaylist.id) {
    throw new Error("That playlist can’t be renamed right now.");
  }
  if (membersSnapshot.size + 2 > 450) {
    throw new Error("This playlist has too many people to rename here.");
  }

  const batch = writeBatch(db);
  batch.update(playlistRef, { name: playlistName, updatedAt: serverTimestamp() });
  batch.update(codeRef, { playlistName });
  membersSnapshot.docs.forEach((member) => batch.update(member.ref, { playlistName }));
  await batch.commit();

  state.activePlaylist = { ...state.activePlaylist, playlistName };
  state.memberships = state.memberships.map((membership) => membership.id === state.activePlaylist.id ? {
    ...membership,
    playlistName,
  } : membership);
  setMasthead(playlistName);
  renderPlaylistDetails();
  renderHome();
}

async function deleteActivePlaylist() {
  if (!state.activePlaylist) return;
  if (!window.confirm("Are you sure you want to delete this playlist?")) return;

  const playlist = state.activePlaylist;
  const playlistRef = doc(db, "sharedPlaylists", playlist.id);
  const codeRef = doc(db, "playlistCodes", playlist.inviteCode);
  deletePlaylistButton.disabled = true;
  try {
    const [membersSnapshot, sharesSnapshot, codeSnapshot] = await Promise.all([
      getDocs(collection(db, "sharedPlaylists", playlist.id, "members")),
      getDocs(collection(db, "sharedPlaylists", playlist.id, "shares")),
      getDoc(codeRef),
    ]);
    const deleteCount = membersSnapshot.size + sharesSnapshot.size + 1 + (codeSnapshot.exists() ? 1 : 0);
    if (deleteCount > 450) throw new Error("This playlist has too much history to delete here.");

    const batch = writeBatch(db);
    sharesSnapshot.docs.forEach((share) => batch.delete(share.ref));
    membersSnapshot.docs.forEach((member) => batch.delete(member.ref));
    if (codeSnapshot.exists()) batch.delete(codeRef);
    batch.delete(playlistRef);
    await batch.commit();

    state.memberships = state.memberships.filter((membership) => membership.id !== playlist.id);
    syncMembershipMetadataSubscriptions();
    toast("Playlist deleted.");
    backToHome();
  } catch (error) {
    console.error(error);
    toast(error?.message || "Couldn’t delete that playlist. Try again.", "error");
    deletePlaylistButton.disabled = false;
  }
}

async function saveProfile(user, name) {
  const displayName = cleanText(name, 40);
  if (!displayName) throw new Error("Add the name you’d like to use.");
  await updateProfile(user, { displayName });
  await setDoc(doc(db, "profiles", user.uid), {
    uid: user.uid,
    displayName,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  state.user = user;
  state.profile = { displayName };
  updateAccountLabels();
  startMembershipListener();
  setMasthead("Your shared playlists");
  showView("home");
  renderHome();
}

async function activateUser(user) {
  clearFeedSubscription();
  clearPlaylistSubscriptions();
  clearMembershipSubscription();
  if (accountDialog.open) accountDialog.close();
  state.activePlaylist = null;
  state.shares = [];
  state.memberships = [];
  state.user = user || null;
  state.profile = null;
  updateAccountLabels();

  if (!user) {
    showAuth("signUp");
    return;
  }
  if (user.isAnonymous) {
    await signOut(auth).catch(() => undefined);
    return;
  }

  try {
    const profileSnapshot = await getDoc(doc(db, "profiles", user.uid));
    if (!profileSnapshot.exists()) {
      showAuth("profile");
      return;
    }
    state.profile = profileSnapshot.data();
    updateAccountLabels();
    startMembershipListener();
    setMasthead("Your shared playlists");
    showView("home");
    renderHome();
  } catch (error) {
    console.error(error);
    showAuth("profile");
    authStatus.textContent = "Your account couldn’t open. Try again.";
  }
}

authSwitch.addEventListener("click", () => showAuth(state.authMode === "signIn" ? "signUp" : "signIn"));

authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  authSubmit.disabled = true;
  authStatus.textContent = "";
  try {
    if (state.authMode === "profile") {
      if (!state.user) throw new Error("Sign in first.");
      await saveProfile(state.user, authNameInput.value);
    } else if (state.authMode === "signIn") {
      await signInWithEmailAndPassword(auth, cleanText(authEmailInput.value, 120), authPasswordInput.value);
    } else {
      const displayName = cleanText(authNameInput.value, 40);
      if (!displayName) throw new Error("Add the name you’d like to use.");
      const credential = await createUserWithEmailAndPassword(auth, cleanText(authEmailInput.value, 120), authPasswordInput.value);
      await saveProfile(credential.user, displayName);
    }
  } catch (error) {
    console.error(error);
    authStatus.textContent = readableError(error, error?.message || "Couldn’t continue. Try again.");
  } finally {
    authSubmit.disabled = false;
  }
});

googleSignInButton.addEventListener("click", async () => {
  googleSignInButton.disabled = true;
  authStatus.textContent = "Taking you to Google…";
  try {
    await signInWithRedirect(auth, googleProvider);
  } catch (error) {
    console.error(error);
    authStatus.textContent = readableError(error);
    googleSignInButton.disabled = false;
  }
});

async function handleSignOut() {
  try {
    setAccountDialogOpen(false);
    await signOut(auth);
  } catch (error) {
    console.error(error);
    toast("Couldn’t sign out. Try again.", "error");
  }
}

accountTrigger.addEventListener("click", () => setAccountDialogOpen(true));
closeAccountDialog.addEventListener("click", () => setAccountDialogOpen(false));
accountSignOut.addEventListener("click", handleSignOut);

accountForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  accountSaveButton.disabled = true;
  accountStatus.textContent = "";
  try {
    await updateCurrentProfileName(accountNameInput.value);
    toast("Saved.");
    setAccountDialogOpen(false);
  } catch (error) {
    console.error(error);
    accountStatus.textContent = readableError(error, error?.message || "Couldn’t save your profile.");
  } finally {
    accountSaveButton.disabled = false;
  }
});

showCreatePlaylist.addEventListener("click", () => {
  createPlaylistForm.hidden = !createPlaylistForm.hidden;
  joinPlaylistForm.hidden = true;
  createPlaylistStatus.textContent = "";
  if (!createPlaylistForm.hidden) createPlaylistName.focus();
});

showJoinPlaylist.addEventListener("click", () => {
  joinPlaylistForm.hidden = !joinPlaylistForm.hidden;
  createPlaylistForm.hidden = true;
  joinPlaylistStatus.textContent = "";
  if (!joinPlaylistForm.hidden) joinCodeInput.focus();
});

joinCodeInput.addEventListener("input", () => {
  joinCodeInput.value = joinCodeInput.value.replace(/\D/g, "").slice(0, 4);
});

createPlaylistForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = cleanText(createPlaylistName.value, 60);
  if (!name) {
    createPlaylistStatus.textContent = "Give it a name first.";
    createPlaylistName.focus();
    return;
  }
  createPlaylistButton.disabled = true;
  createPlaylistStatus.textContent = "Making it…";
  try {
    const membership = await createSharedPlaylist(name);
    createPlaylistForm.reset();
    createPlaylistForm.hidden = true;
    upsertMembership(membership);
    enterPlaylist(membership);
  } catch (error) {
    console.error(error);
    createPlaylistStatus.textContent = readableError(error, error?.message || "Couldn’t make that playlist.");
  } finally {
    createPlaylistButton.disabled = false;
  }
});

joinPlaylistForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const code = cleanText(joinCodeInput.value, 4);
  if (!/^\d{4}$/.test(code)) {
    joinPlaylistStatus.textContent = "Enter all four digits.";
    joinCodeInput.focus();
    return;
  }
  joinPlaylistButton.disabled = true;
  joinPlaylistStatus.textContent = "Joining…";
  try {
    const membership = await joinSharedPlaylist(code);
    joinPlaylistForm.reset();
    joinPlaylistForm.hidden = true;
    upsertMembership(membership);
    enterPlaylist(membership);
  } catch (error) {
    console.error(error);
    joinPlaylistStatus.textContent = readableError(error, error?.message || "Couldn’t join that playlist.");
  } finally {
    joinPlaylistButton.disabled = false;
  }
});

backToPlaylists.addEventListener("click", backToHome);

invitePeople.addEventListener("click", () => setInviteDialogOpen(true));
closeInviteDialog.addEventListener("click", () => setInviteDialogOpen(false));
openPlaylistSettings.addEventListener("click", () => setPlaylistSettingsOpen(true));
closePlaylistSettings.addEventListener("click", () => setPlaylistSettingsOpen(false));

renamePlaylistForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  renamePlaylistButton.disabled = true;
  renamePlaylistStatus.textContent = "";
  try {
    await renameActivePlaylist(renamePlaylistName.value);
    setPlaylistSettingsOpen(false);
  } catch (error) {
    console.error(error);
    renamePlaylistStatus.textContent = readableError(error, error?.message || "Couldn’t save that name.");
  } finally {
    renamePlaylistButton.disabled = false;
  }
});

deletePlaylistButton.addEventListener("click", () => {
  void deleteActivePlaylist();
});

closeMemberDialog.addEventListener("click", () => memberDialog.close());

void getRedirectResult(auth).catch((error) => {
  console.error(error);
  showAuth("signUp");
  authStatus.textContent = readableError(error);
});

onAuthStateChanged(auth, (user) => {
  void activateUser(user);
});

showAuth("signUp");
