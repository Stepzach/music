import {
  addDoc,
  auth,
  authPersistenceReady,
  collection,
  collectionGroup,
  createUserWithEmailAndPassword,
  db,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onAuthStateChanged,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  where,
  writeBatch,
} from "./firebase.js?v=20261119-10";

const $ = (selector) => document.querySelector(selector);

const audio = $("#preview-audio");
const searchInput = $("#song-search");
const searchStatus = $("#search-status");
const searchResults = $("#search-results");
const selectedTrack = $("#selected-track");
const shareForm = $("#share-form");
const composer = $(".composer");
const shareContent = $("#share-content");
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
const authSwitch = $("#auth-switch");
const accountTrigger = $("#account-trigger");
const accountDialog = $("#account-dialog");
const closeAccountDialog = $("#close-account-dialog");
const accountForm = $("#account-form");
const accountNameInput = $("#account-name");
const accountEmail = $("#account-email");
const accountSaveButton = $("#account-save");
const accountStatus = $("#account-status");
const accountSignOut = $("#account-sign-out");
const yourPlaylistList = $("#your-playlist-list");
const communityPlaylistList = $("#community-playlist-list");
const homeStatus = $("#home-status");
const showCreatePlaylist = $("#show-create-playlist");
const showJoinPlaylist = $("#show-join-playlist");
const createPlaylistForm = $("#create-playlist-form");
const closeCreatePlaylist = $("#close-create-playlist");
const createPlaylistName = $("#new-playlist-name");
const selectedPlaylistVisibility = () => document.querySelector("input[name='playlist-visibility']:checked")?.value || "private";
const createPlaylistButton = $("#create-playlist-button");
const createPlaylistStatus = $("#create-playlist-status");
const joinPlaylistForm = $("#join-playlist-form");
const closeJoinPlaylist = $("#close-join-playlist");
const joinCodeInput = $("#join-code");
const joinPlaylistButton = $("#join-playlist-button");
const joinPlaylistStatus = $("#join-playlist-status");
const backToPlaylists = $("#back-to-playlists");
const playlistMembersSummary = $("#playlist-members-summary");
const leavePlaylist = $("#leave-playlist");
const invitePeople = $("#invite-people");
const inviteDialog = $("#invite-dialog");
const inviteCode = $("#invite-code");
const closeInviteDialog = $("#close-invite-dialog");
const leavePlaylistDialog = $("#leave-playlist-dialog");
const closeLeavePlaylistDialog = $("#close-leave-playlist-dialog");
const cancelLeavePlaylist = $("#cancel-leave-playlist");
const confirmLeavePlaylist = $("#confirm-leave-playlist");
const openPlaylistSettings = $("#open-playlist-settings");
const playlistSettingsDialog = $("#playlist-settings-dialog");
const closePlaylistSettings = $("#close-playlist-settings");
const renamePlaylistForm = $("#rename-playlist-form");
const renamePlaylistName = $("#rename-playlist-name");
const renamePlaylistButton = $("#rename-playlist-button");
const renamePlaylistStatus = $("#rename-playlist-status");
const deletePlaylistButton = $("#delete-playlist");
const joinToShare = $("#join-to-share");
const joinPublicPlaylistButton = $("#join-public-playlist");
const joinPublicPlaylistStatus = $("#join-public-playlist-status");
const memberDialog = $("#member-dialog");
const memberDialogList = $("#member-dialog-list");
const closeMemberDialog = $("#close-member-dialog");
const routeLoader = $("#route-loader");
const DISCO_ENGINE_URL = "./disco-engine.js?v=20261119-7";
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
  communityPlaylists: [],
  activePlaylist: null,
  activeMembers: [],
  authMode: "signUp",
  membershipUnsubscribe: null,
  communityUnsubscribe: null,
  feedUnsubscribe: null,
  memberUnsubscribe: null,
  playlistUnsubscribe: null,
  routeRequest: 0,
  initialRouteLoading: document.documentElement.classList.contains("is-route-loading"),
  initialRouteRevealed: false,
};
const deezerPreviewCache = new Map();
const deezerPreviewRequests = new Map();
const appleUrlCache = new Map();
const appleUrlRequests = new Map();
let feedPreviewRefreshTimer = 0;
let themeBoundaryTimer = 0;
const playlistMetadataUnsubscribers = new Map();
const playlistSongTotalRequests = new Map();
const playlistSongTotals = new Map();
const playlistOwnerNameRequests = new Map();

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
  if (state.initialRouteLoading && !state.initialRouteRevealed) return;
  window.__discoCue = true;
  window.dispatchEvent(new Event("disco:cue"));
}

// The exact reference engine is loaded in index.html. It uses this event
// contract to run its own Three.js ball and full-screen moving light canvas.
window.addEventListener("disco:ready", cueDisco, { once: true });
if (!state.initialRouteLoading) window.setTimeout(cueDisco, 2800);

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
  if (!isActivePlaylistMember()) {
    shareStatus.textContent = "Join this playlist to share a song.";
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
    playlistSongTotals.delete(state.activePlaylist.id);
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

function canDeleteShare(share) {
  if (!state.user || !state.activePlaylist) return false;
  if (isActivePlaylistOwner()) return true;
  return isActivePlaylistMember() && cleanText(share.senderUid, 128) === state.user.uid;
}

async function deleteShare(share, button) {
  if (!state.user || !state.activePlaylist) return;
  if (!canDeleteShare(share)) return;
  if (!window.confirm("Are you sure you want to delete?")) return;

  button.disabled = true;
  try {
    await deleteDoc(doc(db, "sharedPlaylists", state.activePlaylist.id, "shares", share.id));
    playlistSongTotals.delete(state.activePlaylist.id);
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

  if (canDeleteShare(share)) {
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

function finishInitialRouteLoad() {
  if (!state.initialRouteLoading || state.initialRouteRevealed) return;
  state.initialRouteRevealed = true;

  const titleBounds = mastheadTitle.getBoundingClientRect();
  const loaderWidth = Math.max(100, Math.min(190, window.innerWidth * .15));
  const loaderRadius = loaderWidth * .38;
  const targetY = Math.max(loaderRadius + 8, Math.round(titleBounds.top - loaderRadius - 16));
  document.documentElement.style.setProperty("--route-loader-target-y", `${targetY}px`);
  document.documentElement.classList.add("is-route-revealing");
  window.__discoHold = false;
  window.__discoSkipEntrance = true;

  window.setTimeout(cueDisco, 620);
  window.setTimeout(() => {
    document.documentElement.classList.remove("is-route-loading", "is-route-revealing");
    routeLoader?.remove();
  }, 980);
}

function readableError(error, fallback = "Something went wrong. Try again.") {
  const code = String(error?.code || "");
  const messages = {
    "auth/email-already-in-use": "That email already has an account. Try signing in.",
    "auth/invalid-credential": "That email or password isn’t right.",
    "auth/invalid-email": "Enter a valid email address.",
    "auth/weak-password": "Use at least 6 characters for your password.",
    "auth/operation-not-allowed": "This sign-in option isn’t available right now.",
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

function clearCommunitySubscription() {
  if (state.communityUnsubscribe) state.communityUnsubscribe();
  state.communityUnsubscribe = null;
  state.communityPlaylists = [];
}

function clearPlaylistSubscriptions() {
  if (state.memberUnsubscribe) state.memberUnsubscribe();
  if (state.playlistUnsubscribe) state.playlistUnsubscribe();
  state.memberUnsubscribe = null;
  state.playlistUnsubscribe = null;
  state.activeMembers = [];
  state.shares = [];
  joinToShare.hidden = true;
  joinPublicPlaylistStatus.textContent = "";
  composer.hidden = false;
  shareContent.hidden = false;
  renamePlaylistStatus.textContent = "";
  if (memberDialog.open) memberDialog.close();
  if (inviteDialog.open) inviteDialog.close();
  if (leavePlaylistDialog.open) leavePlaylistDialog.close();
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

function playlistVisibility(value) {
  return value === "public" ? "public" : "private";
}

function isPublicPlaylist(playlist) {
  return playlistVisibility(playlist?.visibility) === "public";
}

function ownerNameForPlaylist(playlist, membership = null) {
  const storedName = cleanText(playlist?.ownerName || membership?.ownerName, 40);
  if (storedName) return storedName;
  if (cleanText(playlist?.ownerUid, 128) === state.user?.uid) {
    return cleanText(state.profile?.displayName, 40) || "You";
  }
  if (membership?.role === "owner") return cleanText(membership.displayName, 40) || "You";
  return "Someone";
}

function playlistDescriptor(id, data = {}, membership = null) {
  return {
    id,
    playlistName: cleanText(data.name || membership?.playlistName, 60) || "Untitled playlist",
    ownerUid: cleanText(data.ownerUid || membership?.ownerUid, 128),
    ownerName: ownerNameForPlaylist(data, membership),
    inviteCode: cleanText(data.joinCode || membership?.inviteCode, 4),
    visibility: playlistVisibility(data.visibility || membership?.visibility),
    createdAt: data.createdAt || membership?.createdAt || null,
    updatedAt: data.updatedAt || membership?.updatedAt || null,
    role: membership?.role || "viewer",
  };
}

function membershipForPlaylist(playlistId) {
  return state.memberships.find((membership) => membership.id === playlistId) || null;
}

function activePlaylistMembership() {
  if (!state.activePlaylist) return null;
  return membershipForPlaylist(state.activePlaylist.id)
    || (state.activePlaylist.role === "owner" || state.activePlaylist.role === "member" ? state.activePlaylist : null);
}

function isActivePlaylistMember() {
  return Boolean(activePlaylistMembership());
}

function isActivePlaylistOwner() {
  if (!state.activePlaylist || !state.user) return false;
  // A membership record does not carry ownerUid. Respect its owner role while
  // the playlist document is still loading so creators never briefly see a
  // Leave button that the database would (correctly) reject.
  return state.activePlaylist.ownerUid === state.user.uid
    || activePlaylistMembership()?.role === "owner";
}

function canManageActivePlaylist() {
  return isActivePlaylistOwner() || (!isPublicPlaylist(state.activePlaylist) && isActivePlaylistMember());
}

function playlistCardDate(value) {
  const date = timestampValue(value);
  return date ? date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "recently";
}

function songTotalLabel(playlistId) {
  const total = playlistSongTotals.get(playlistId);
  if (!Number.isFinite(total)) return "… songs";
  return `${total} ${total === 1 ? "song" : "songs"}`;
}

function loadPlaylistSongTotal(playlistId) {
  if (!playlistId || playlistSongTotals.has(playlistId) || playlistSongTotalRequests.has(playlistId)) return;
  const request = getDocs(collection(db, "sharedPlaylists", playlistId, "shares"))
    .then((snapshot) => {
      const total = snapshot.docs.reduce((count, document) => count + tracksFromShare(document.data()).length, 0);
      playlistSongTotals.set(playlistId, total);
      renderHome();
    })
    .catch((error) => console.error(error))
    .finally(() => playlistSongTotalRequests.delete(playlistId));
  playlistSongTotalRequests.set(playlistId, request);
}

function loadLegacyPlaylistOwnerName(playlistId, ownerUid) {
  if (!playlistId || !ownerUid || playlistOwnerNameRequests.has(playlistId)) return;
  const userId = state.user?.uid;
  const request = getDoc(doc(db, "sharedPlaylists", playlistId, "members", ownerUid))
    .then((snapshot) => {
      if (!userId || state.user?.uid !== userId) return;
      const ownerName = cleanText(snapshot.data()?.displayName, 40);
      if (!ownerName) return;
      state.memberships = state.memberships.map((membership) => membership.id === playlistId ? { ...membership, ownerName } : membership);
      if (state.activePlaylist?.id === playlistId) state.activePlaylist = { ...state.activePlaylist, ownerName };
      renderHome();
      renderPlaylistDetails();
    })
    .catch((error) => console.error(error));
  playlistOwnerNameRequests.set(playlistId, request);
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
        playlistSongTotals.delete(membership.id);
        renderHome();
        return;
      }
      const playlist = snapshot.data();
      state.memberships = state.memberships.map((item) => item.id === membership.id
        ? { ...item, ...playlistDescriptor(membership.id, playlist, item) }
        : item);
      if (!cleanText(playlist.ownerName, 40)) {
        loadLegacyPlaylistOwnerName(membership.id, cleanText(playlist.ownerUid, 128));
      }
      renderHome();
    }, (error) => console.error(error));
    playlistMetadataUnsubscribers.set(membership.id, unsubscribe);
  });
}

function renderPlaylistCard(playlist, { community = false } = {}) {
  const item = createElement("button", `playlist-card${community ? " community-playlist-card" : ""}`);
  item.type = "button";
  const ownerName = ownerNameForPlaylist(playlist, membershipForPlaylist(playlist.id));
  const ownerCopy = playlist.ownerUid === state.user?.uid ? "you" : ownerName;
  const copy = createElement("span", "playlist-card-copy");
  const metadata = createElement("span", "playlist-card-meta");
  metadata.append(
    createElement("span", "", `by ${ownerCopy}`),
    createElement("span", "", playlistCardDate(playlist.createdAt)),
    createElement("span", "", songTotalLabel(playlist.id)),
    createElement("span", "playlist-visibility-label", isPublicPlaylist(playlist) ? "Public" : "Private")
  );
  copy.append(
    createElement("strong", "", cleanText(playlist.playlistName, 60) || "Untitled playlist"),
    metadata
  );
  item.append(copy);
  item.addEventListener("click", () => {
    const membership = membershipForPlaylist(playlist.id);
    enterPlaylist(membership || playlist);
  });
  loadPlaylistSongTotal(playlist.id);
  return item;
}

function renderPlaylistGroup(target, playlists, emptyText, options) {
  target.replaceChildren();
  if (!playlists.length) {
    target.append(createElement("p", "empty-feed", emptyText));
    return;
  }
  const fragment = document.createDocumentFragment();
  playlists.forEach((playlist) => fragment.append(renderPlaylistCard(playlist, options)));
  target.append(fragment);
}

function renderHome() {
  homeStatus.textContent = "";
  updateAccountLabels();
  renderPlaylistGroup(yourPlaylistList, state.memberships, "Nothing here yet.", {});
  renderPlaylistGroup(communityPlaylistList, state.communityPlaylists, "No public playlists yet.", { community: true });
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

function startCommunityListener() {
  if (!state.user) return;
  clearCommunitySubscription();
  const communityQuery = query(
    collection(db, "sharedPlaylists"),
    where("visibility", "==", "public")
  );
  state.communityUnsubscribe = onSnapshot(communityQuery, (snapshot) => {
    state.communityPlaylists = snapshot.docs.map((document) => {
      const membership = membershipForPlaylist(document.id);
      return playlistDescriptor(document.id, document.data(), membership);
    }).sort((left, right) => (timestampValue(right.createdAt)?.getTime() || 0) - (timestampValue(left.createdAt)?.getTime() || 0));
    renderHome();
  }, (error) => {
    console.error(error);
    homeStatus.textContent = "Couldn’t load community playlists.";
  });
}

function contributorIdentity(userId, displayName) {
  const name = cleanText(displayName, 40);
  if (!name) return null;
  const id = cleanText(userId, 128);
  return {
    id,
    name,
    key: id ? `user:${id}` : `name:${name.toLocaleLowerCase()}`,
  };
}

function contributorSongTotals() {
  const totals = new Map();
  state.shares.forEach((share) => {
    const contributor = contributorIdentity(share.senderUid, share.senderName);
    const songCount = tracksFromShare(share).length;
    if (!contributor || !songCount) return;
    const current = totals.get(contributor.key) || { ...contributor, songCount: 0 };
    current.songCount += songCount;
    totals.set(contributor.key, current);
  });
  return [...totals.values()].sort((left, right) =>
    right.songCount - left.songCount || left.name.localeCompare(right.name)
  );
}

function memberDialogContributors(playlist, creatorName) {
  const contributors = contributorSongTotals();
  const creator = contributorIdentity(playlist?.ownerUid, creatorName);
  if (creator && !contributors.some((contributor) => contributor.key === creator.key)) {
    contributors.push({ ...creator, songCount: 0 });
  }
  return contributors.sort((left, right) =>
    right.songCount - left.songCount || left.name.localeCompare(right.name)
  );
}

function songCountLabel(count) {
  return `${count} ${count === 1 ? "song" : "songs"}`;
}

function renderMemberDialog() {
  if (!state.activePlaylist) return;
  const playlist = state.activePlaylist;
  const creatorName = ownerNameForPlaylist(playlist);
  const contributors = memberDialogContributors(playlist, creatorName);

  memberDialogList.replaceChildren();

  const creator = createElement("section", "member-dialog-creator");
  const creatorLine = createElement("p", "member-dialog-creator-name", `Creator: ${creatorName}`);
  creatorLine.append(document.createTextNode(" "));
  creatorLine.append(createElement("span", "member-dialog-created-on", `(on: ${playlistCardDate(playlist.createdAt)})`));
  creator.append(creatorLine);

  const contributionSection = createElement("section", "member-contributions");
  contributionSection.append(createElement("h3", "member-contribution-heading", "Contributors"));
  if (!contributors.length) {
    contributionSection.append(createElement("p", "member-contribution-empty", "No songs shared yet."));
  } else {
    const list = createElement("ul", "member-contribution-list");
    contributors.forEach((contributor) => {
      const row = createElement("li", "member-contribution-row");
      row.append(
        createElement("span", "member-contribution-name", contributor.name),
        createElement("span", "member-contribution-count", songCountLabel(contributor.songCount))
      );
      list.append(row);
    });
    contributionSection.append(list);
  }

  memberDialogList.append(creator, contributionSection);
}

function memberNames() {
  if (!isActivePlaylistMember() && !isPublicPlaylist(state.activePlaylist)) return [];
  const contributors = new Map();
  const addContributor = (userId, displayName) => {
    const contributor = contributorIdentity(userId, displayName);
    if (contributor && !contributors.has(contributor.key)) contributors.set(contributor.key, contributor.name);
  };

  state.activeMembers.forEach((member) => {
    const memberId = cleanText(member.userId, 128);
    const displayName = memberId === state.user?.uid
      ? cleanText(state.profile?.displayName, 40) || cleanText(member.displayName, 40)
      : cleanText(member.displayName, 40);
    addContributor(memberId, displayName);
  });

  // A person who leaves stays credited only while one of their submissions is
  // still on the playlist. Active member order remains first.
  state.shares.forEach((share) => addContributor(share.senderUid, share.senderName));

  const names = [...contributors.values()];
  if (names.length) return names;
  if (!isActivePlaylistMember()) return [];
  const fallback = cleanText(state.profile?.displayName, 40);
  return fallback ? [fallback] : [];
}

function renderPlaylistDetails() {
  if (!state.activePlaylist) return;
  const names = memberNames();
  const isMember = isActivePlaylistMember();
  const isPublic = isPublicPlaylist(state.activePlaylist);
  const isOwner = isActivePlaylistOwner();
  const canManage = isOwner || (!isPublic && isMember);
  playlistMembersSummary.replaceChildren();
  if (names.length) {
    playlistMembersSummary.append(document.createTextNode(names.slice(0, 2).join(", ")));
    if (names.length > 2) {
      playlistMembersSummary.append(document.createTextNode(", "));
      const overflow = createElement("button", "member-overflow", `+${names.length - 2}`);
      overflow.type = "button";
      overflow.setAttribute("aria-label", `Show people and song contributions for ${names.length} people in this playlist`);
      overflow.addEventListener("click", () => {
        renderMemberDialog();
        if (!memberDialog.open) memberDialog.showModal();
      });
      playlistMembersSummary.append(overflow);
    }
  } else if (isPublic) {
    playlistMembersSummary.textContent = `Created by ${ownerNameForPlaylist(state.activePlaylist)}`;
  }

  const code = cleanText(state.activePlaylist?.inviteCode, 4);
  invitePeople.hidden = !isMember;
  invitePeople.disabled = !isMember || !code;
  invitePeople.setAttribute("aria-label", isMember && code ? "Invite friends to this playlist" : "No invite code available");
  inviteCode.textContent = code || "—";
  leavePlaylist.hidden = !isMember || isOwner;
  // Reset the control whenever a playlist is rendered. Without this, a
  // successful leave could leave the same shared button disabled on the next
  // playlist until the page was refreshed.
  leavePlaylist.disabled = !isMember || isOwner;
  openPlaylistSettings.hidden = !canManage;
  const shouldJoinToShare = isPublic && !isMember;
  joinToShare.hidden = !shouldJoinToShare;
  composer.hidden = false;
  shareContent.hidden = shouldJoinToShare;
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
    const membership = membershipForPlaylist(playlistId);
    const details = playlistDescriptor(playlistId, playlist, membership);
    state.activePlaylist = { ...state.activePlaylist, ...details, role: membership?.role || state.activePlaylist.role || "viewer" };
    if (membership) {
      state.memberships = state.memberships.map((item) => item.id === playlistId ? { ...item, ...details, role: item.role } : item);
    }
    state.communityPlaylists = state.communityPlaylists.map((item) => item.id === playlistId ? { ...item, ...details } : item);
    setMasthead(state.activePlaylist.playlistName || "Shared playlist");
    renderPlaylistDetails();
    renderHome();
  }, (error) => console.error(error));
}

function subscribeToActiveMembers() {
  if (state.memberUnsubscribe) state.memberUnsubscribe();
  if (!state.activePlaylist) return;
  // Public playlists intentionally show their participant list to visitors as
  // well as members. Private rosters remain available only after joining.
  if (!isActivePlaylistMember() && !isPublicPlaylist(state.activePlaylist)) {
    state.activeMembers = [];
    renderPlaylistDetails();
    return;
  }
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
    orderBy("createdAt", "desc")
  );
  state.feedUnsubscribe = onSnapshot(sharesQuery, (snapshot) => {
    state.shares = snapshot.docs.map((document) => ({ id: document.id, ...document.data() }));
    renderPlaylistDetails();
    if (memberDialog.open) renderMemberDialog();
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

function enterPlaylist(playlist, { updateRoute = true } = {}) {
  if (!state.user || !playlist?.id) return;
  clearPlaylistSubscriptions();
  clearPlaylistDraft();
  const membership = membershipForPlaylist(playlist.id);
  state.activePlaylist = {
    ...playlist,
    ...membership,
    id: playlist.id,
    playlistName: cleanText(playlist.playlistName || membership?.playlistName, 60) || "Shared playlist",
    ownerUid: cleanText(playlist.ownerUid || membership?.ownerUid, 128),
    ownerName: cleanText(playlist.ownerName || membership?.ownerName, 40) || ownerNameForPlaylist(playlist, membership),
    inviteCode: cleanText(playlist.inviteCode || membership?.inviteCode, 4),
    visibility: playlistVisibility(playlist.visibility || membership?.visibility),
    createdAt: playlist.createdAt || membership?.createdAt || null,
    role: membership?.role || playlist.role || "viewer",
  };
  setMasthead(state.activePlaylist.playlistName || "Shared playlist");
  showView("playlist");
  renderPlaylistDetails();
  subscribeToActivePlaylist();
  subscribeToActiveMembers();
  subscribeToPlaylistShares();
  if (updateRoute && state.activePlaylist.inviteCode) writePlaylistRoute(state.activePlaylist.inviteCode);
}

function backToHome({ updateRoute = true } = {}) {
  state.routeRequest += 1;
  clearFeedSubscription();
  clearPlaylistSubscriptions();
  clearPlaylistDraft();
  state.activePlaylist = null;
  state.shares = [];
  setMasthead("Your shared playlists");
  showView("home");
  renderHome();
  if (updateRoute) clearPlaylistRoute();
}

function playlistRouteCode() {
  const code = cleanText(new URLSearchParams(window.location.search).get("playlist"), 4);
  return /^\d{4}$/.test(code) ? code : "";
}

function writePlaylistRoute(code, { replace = false } = {}) {
  if (!/^\d{4}$/.test(cleanText(code, 4))) return;
  const url = new URL(window.location.href);
  if (playlistRouteCode() === code) return;
  url.searchParams.set("playlist", code);
  window.history[replace ? "replaceState" : "pushState"]({}, "", `${url.pathname}${url.search}${url.hash}`);
}

function clearPlaylistRoute({ replace = false } = {}) {
  if (!playlistRouteCode()) return;
  const url = new URL(window.location.href);
  url.searchParams.delete("playlist");
  window.history[replace ? "replaceState" : "pushState"]({}, "", `${url.pathname}${url.search}${url.hash}`);
}

function showJoinForRoute(code) {
  if (state.activePlaylist) backToHome({ updateRoute: false });
  else {
    setMasthead("Your shared playlists");
    showView("home");
    renderHome();
  }
  createPlaylistForm.hidden = true;
  joinPlaylistForm.hidden = false;
  joinCodeInput.value = code;
  joinPlaylistStatus.textContent = "Join this playlist to open it.";
}

async function openPlaylistFromRoute() {
  const code = playlistRouteCode();
  if (!code || !state.user || !state.profile) return;
  if (state.activePlaylist?.inviteCode === code) return;
  const request = ++state.routeRequest;
  try {
    const codeSnapshot = await getDoc(doc(db, "playlistCodes", code));
    if (request !== state.routeRequest) return;
    if (!codeSnapshot.exists()) {
      toast("That playlist no longer exists.", "error");
      clearPlaylistRoute({ replace: true });
      if (state.activePlaylist) backToHome({ updateRoute: false });
      else {
        setMasthead("Your shared playlists");
        showView("home");
        renderHome();
      }
      return;
    }
    const invite = codeSnapshot.data();
    const playlistId = cleanText(invite.playlistId, 128);
    const playlistName = cleanText(invite.playlistName, 60);
    if (!playlistId || !playlistName) throw new Error("That playlist link isn’t valid.");

    const membershipSnapshot = await getDoc(doc(db, "sharedPlaylists", playlistId, "members", state.user.uid));
    if (request !== state.routeRequest) return;
    if (membershipSnapshot.exists()) {
      enterPlaylist({ id: playlistId, ...membershipSnapshot.data() }, { updateRoute: false });
      return;
    }

    try {
      const playlistSnapshot = await getDoc(doc(db, "sharedPlaylists", playlistId));
      if (request !== state.routeRequest) return;
      if (playlistSnapshot.exists() && isPublicPlaylist(playlistSnapshot.data())) {
        enterPlaylist(playlistDescriptor(playlistId, playlistSnapshot.data()), { updateRoute: false });
        return;
      }
    } catch (error) {
      if (error?.code !== "permission-denied") throw error;
    }
    showJoinForRoute(code);
  } catch (error) {
    console.error(error);
    toast("Couldn’t open that playlist. Try again.", "error");
    if (!state.activePlaylist) {
      setMasthead("Your shared playlists");
      showView("home");
      renderHome();
    }
  }
}

async function showResolvedDestination() {
  if (playlistRouteCode()) {
    await openPlaylistFromRoute();
    return;
  }
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

async function createSharedPlaylist(name, visibility = "private") {
  if (!state.user || !state.profile) throw new Error("Sign in first.");
  const safeVisibility = playlistVisibility(visibility);
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
          ownerName: state.profile.displayName,
          joinCode: code,
          visibility: safeVisibility,
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
        ownerUid: state.user.uid,
        ownerName: state.profile.displayName,
        role: "owner",
        inviteCode: code,
        visibility: safeVisibility,
      };
    } catch (error) {
      if (error?.code === "resonance/code-taken") continue;
      throw error;
    }
  }
  throw new Error("Couldn’t find a free code. Try again.");
}

async function joinPlaylistWithDetails(playlist) {
  if (!state.user || !state.profile) throw new Error("Sign in first.");
  const playlistId = cleanText(playlist?.id, 128);
  const playlistName = cleanText(playlist?.playlistName, 60);
  const inviteCode = cleanText(playlist?.inviteCode, 4);
  if (!playlistId || !playlistName || !/^\d{4}$/.test(inviteCode)) throw new Error("That playlist can’t be joined right now.");

  const membershipRef = doc(db, "sharedPlaylists", playlistId, "members", state.user.uid);
  const existingMembership = await getDoc(membershipRef);
  if (existingMembership.exists()) {
    return { ...playlist, id: playlistId, ...existingMembership.data() };
  }

  await setDoc(membershipRef, {
    userId: state.user.uid,
    displayName: state.profile.displayName,
    playlistName,
    role: "member",
    inviteCode,
    joinedAt: serverTimestamp(),
  });
  return {
    ...playlist,
    id: playlistId,
    userId: state.user.uid,
    displayName: state.profile.displayName,
    playlistName,
    role: "member",
    inviteCode,
  };
}

async function joinSharedPlaylist(code) {
  if (!state.user || !state.profile) throw new Error("Sign in first.");
  const codeSnapshot = await getDoc(doc(db, "playlistCodes", code));
  if (!codeSnapshot.exists()) throw new Error("No playlist has that code.");
  const invite = codeSnapshot.data();
  const playlistId = cleanText(invite.playlistId, 128);
  const playlistName = cleanText(invite.playlistName, 60);
  if (!playlistId || !playlistName) throw new Error("That code doesn’t look right.");
  return joinPlaylistWithDetails({ id: playlistId, playlistName, inviteCode: code });
}

async function joinActivePublicPlaylist() {
  if (!state.activePlaylist || !isPublicPlaylist(state.activePlaylist)) return;
  if (isActivePlaylistMember()) return;
  joinPublicPlaylistButton.disabled = true;
  joinPublicPlaylistStatus.textContent = "Joining…";
  try {
    const membership = await joinPlaylistWithDetails(state.activePlaylist);
    upsertMembership(membership);
    state.activePlaylist = { ...state.activePlaylist, ...membership, role: membership.role || "member" };
    joinPublicPlaylistStatus.textContent = "";
    subscribeToActiveMembers();
    renderPlaylistDetails();
    toast("Joined.");
  } catch (error) {
    console.error(error);
    joinPublicPlaylistStatus.textContent = readableError(error, error?.message || "Couldn’t join that playlist.");
  } finally {
    joinPublicPlaylistButton.disabled = false;
  }
}

async function leaveActivePlaylist() {
  if (!state.user || !state.activePlaylist) return;
  if (isActivePlaylistOwner()) {
    toast("The creator can’t leave this playlist.", "error");
    return;
  }

  const playlist = state.activePlaylist;
  const membershipRef = doc(db, "sharedPlaylists", playlist.id, "members", state.user.uid);
  leavePlaylist.disabled = true;
  try {
    await deleteDoc(membershipRef);
  } catch (error) {
    // The live membership listener can be one step behind a leave completed
    // in another tab. If the row has already gone, treat the request as
    // complete and return the person to All playlists rather than trapping
    // them on a stale page.
    if (error?.code !== "permission-denied") {
      console.error(error);
      toast("Couldn’t leave this playlist. Try again.", "error");
      leavePlaylist.disabled = false;
      return;
    }

    try {
      const membershipSnapshot = await getDoc(membershipRef);
      if (membershipSnapshot.exists()) {
        if (membershipSnapshot.data()?.role === "owner") {
          toast("The creator can’t leave this playlist.", "error");
        } else {
          toast("Couldn’t leave this playlist. Try again.", "error");
        }
        leavePlaylist.disabled = false;
        return;
      }
    } catch (membershipError) {
      console.error(membershipError);
      toast("Couldn’t leave this playlist. Try again.", "error");
      leavePlaylist.disabled = false;
      return;
    }
  }

  state.memberships = state.memberships.filter((membership) => membership.id !== playlist.id);
  // Navigate before reconciling background home-list listeners, so that
  // cleanup can never hold up the promised return to All playlists.
  backToHome();
  try {
    syncMembershipMetadataSubscriptions();
  } catch (error) {
    console.error(error);
  }
  toast("Left playlist.");
}

function setInviteDialogOpen(open) {
  if (open) {
    if (!cleanText(state.activePlaylist?.inviteCode, 4)) return;
    if (!inviteDialog.open) inviteDialog.showModal();
    return;
  }
  if (inviteDialog.open) inviteDialog.close();
}

function setLeavePlaylistDialogOpen(open) {
  if (open) {
    if (!state.activePlaylist || !isActivePlaylistMember() || isActivePlaylistOwner()) return;
    if (!leavePlaylistDialog.open) leavePlaylistDialog.showModal();
    return;
  }
  if (leavePlaylistDialog.open) leavePlaylistDialog.close();
}

function setPlaylistSettingsOpen(open) {
  renamePlaylistStatus.textContent = "";
  if (open) {
    if (!canManageActivePlaylist()) return;
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
  if (!canManageActivePlaylist()) throw new Error("Only the creator can edit this public playlist.");
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
  state.communityPlaylists = state.communityPlaylists.map((playlist) => playlist.id === state.activePlaylist.id ? {
    ...playlist,
    playlistName,
  } : playlist);
  setMasthead(playlistName);
  renderPlaylistDetails();
  renderHome();
}

async function deleteActivePlaylist() {
  if (!state.activePlaylist) return;
  if (!canManageActivePlaylist()) {
    toast("Only the creator can delete this public playlist.", "error");
    return;
  }
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
  startCommunityListener();
  await showResolvedDestination();
  finishInitialRouteLoad();
}

async function activateUser(user) {
  clearFeedSubscription();
  clearPlaylistSubscriptions();
  clearMembershipSubscription();
  clearCommunitySubscription();
  if (accountDialog.open) accountDialog.close();
  state.activePlaylist = null;
  state.shares = [];
  state.memberships = [];
  playlistSongTotals.clear();
  playlistSongTotalRequests.clear();
  playlistOwnerNameRequests.clear();
  state.user = user || null;
  state.profile = null;
  updateAccountLabels();

  if (!user) {
    showAuth("signUp");
    finishInitialRouteLoad();
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
      finishInitialRouteLoad();
      return;
    }
    state.profile = profileSnapshot.data();
    updateAccountLabels();
    startMembershipListener();
    startCommunityListener();
    await showResolvedDestination();
    finishInitialRouteLoad();
  } catch (error) {
    console.error(error);
    showAuth("profile");
    authStatus.textContent = "Your account couldn’t open. Try again.";
    finishInitialRouteLoad();
  }
}

authSwitch.addEventListener("click", () => showAuth(state.authMode === "signIn" ? "signUp" : "signIn"));

authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  authSubmit.disabled = true;
  authStatus.textContent = "";
  try {
    await authPersistenceReady;
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
});

showJoinPlaylist.addEventListener("click", () => {
  joinPlaylistForm.hidden = !joinPlaylistForm.hidden;
  createPlaylistForm.hidden = true;
  joinPlaylistStatus.textContent = "";
});

closeCreatePlaylist.addEventListener("click", () => {
  createPlaylistForm.reset();
  createPlaylistForm.hidden = true;
  createPlaylistStatus.textContent = "";
});

closeJoinPlaylist.addEventListener("click", () => {
  joinPlaylistForm.reset();
  joinPlaylistForm.hidden = true;
  joinPlaylistStatus.textContent = "";
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
    const membership = await createSharedPlaylist(name, selectedPlaylistVisibility());
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
leavePlaylist.addEventListener("click", () => setLeavePlaylistDialogOpen(true));
closeInviteDialog.addEventListener("click", () => setInviteDialogOpen(false));
closeLeavePlaylistDialog.addEventListener("click", () => setLeavePlaylistDialogOpen(false));
cancelLeavePlaylist.addEventListener("click", () => setLeavePlaylistDialogOpen(false));
confirmLeavePlaylist.addEventListener("click", () => {
  setLeavePlaylistDialogOpen(false);
  void leaveActivePlaylist();
});
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

joinPublicPlaylistButton.addEventListener("click", () => {
  void joinActivePublicPlaylist();
});

closeMemberDialog.addEventListener("click", () => memberDialog.close());

window.addEventListener("popstate", () => {
  if (!state.user || !state.profile) return;
  if (playlistRouteCode()) {
    void openPlaylistFromRoute();
  } else {
    state.routeRequest += 1;
    if (state.activePlaylist) backToHome({ updateRoute: false });
  }
});

showAuth("signUp");

void authPersistenceReady.finally(() => {
  onAuthStateChanged(auth, (user) => {
    void activateUser(user);
  });
});
