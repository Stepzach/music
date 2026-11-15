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

const state = {
  selectedTrack: null,
  searchVersion: 0,
  currentShareId: null,
  currentPreviewUrl: "",
  shares: [],
};

const placeholderArtwork = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80">
    <rect width="80" height="80" fill="#dcd8ec"/>
    <circle cx="40" cy="40" r="23" fill="#8574c9"/>
    <circle cx="40" cy="40" r="7" fill="#fffefa"/>
  </svg>
`)}`;

function setText(element, value) {
  element.textContent = value || "";
  return element;
}

function createElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
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

function renderSelectedTrack() {
  selectedTrack.replaceChildren();
  const track = state.selectedTrack;
  if (!track) {
    selectedTrack.hidden = true;
    shareButton.disabled = true;
    shareStatus.textContent = "Choose a song first.";
    return;
  }

  const copy = createElement("div", "result-copy");
  copy.append(createElement("strong", "", track.title), createElement("span", "", `${track.artist} · ${track.album}`));
  const change = createElement("button", "change-song", "Change");
  change.type = "button";
  change.addEventListener("click", () => {
    searchInput.focus();
    searchInput.select();
  });
  selectedTrack.append(image(track.artwork, "", "cover"), copy, change);
  selectedTrack.hidden = false;
  shareButton.disabled = false;
  shareStatus.textContent = "Ready when you are.";
}

function selectTrack(track) {
  state.selectedTrack = track;
  searchInput.value = `${track.title} — ${track.artist}`;
  clearSearch.hidden = false;
  searchStatus.textContent = "";
  searchResults.replaceChildren();
  renderSelectedTrack();
  noteInput.focus();
}

function clearSong() {
  state.selectedTrack = null;
  state.searchVersion += 1;
  searchInput.value = "";
  clearSearch.hidden = true;
  searchStatus.textContent = "";
  searchResults.replaceChildren();
  renderSelectedTrack();
  searchInput.focus();
}

async function runSearch() {
  const term = searchInput.value;
  clearSearch.hidden = term.length === 0;
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
clearSearch.addEventListener("click", clearSong);

function preferredName() {
  try { return localStorage.getItem("resonance-name") || ""; } catch { return ""; }
}

function rememberName(value) {
  try { localStorage.setItem("resonance-name", value); } catch { /* Local storage is optional. */ }
}

senderNameInput.value = preferredName();

shareForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!state.selectedTrack) {
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
      track: state.selectedTrack,
      senderName,
      note,
      createdAt: serverTimestamp(),
    });
    rememberName(senderNameInput.value ? senderName : "");
    noteInput.value = "";
    state.selectedTrack = null;
    searchInput.value = "";
    clearSearch.hidden = true;
    searchResults.replaceChildren();
    searchStatus.textContent = "";
    renderSelectedTrack();
    toast("It’s on the wall.");
  } catch (error) {
    shareButton.disabled = false;
    shareStatus.textContent = "Couldn’t add that song. Try again.";
    toast("The song wasn’t added. Check the Firebase rules, then try again.", "error");
    console.error(error);
  }
});

function trackFromShare(share) {
  const raw = share.track || {};
  return {
    id: cleanText(raw.id, 60),
    title: cleanText(raw.title, 120) || "Unknown song",
    artist: cleanText(raw.artist, 120) || "Unknown artist",
    album: cleanText(raw.album, 140),
    artwork: safeUrl(raw.artwork),
    previewUrl: safeUrl(raw.previewUrl),
    appleUrl: safeUrl(raw.appleUrl),
  };
}

function providerUrl(track, provider) {
  const text = encodeURIComponent(`${track.title} ${track.artist}`);
  if (provider === "Apple Music") return track.appleUrl || `https://music.apple.com/us/search?term=${text}`;
  if (provider === "YouTube Music") return `https://music.youtube.com/search?q=${text}`;
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
  const playing = Boolean(state.currentShareId && !audio.paused);
  document.documentElement.classList.toggle("is-playing", playing);
  document.querySelectorAll(".play-button").forEach((button) => {
    const current = playing && button.dataset.shareId === state.currentShareId;
    button.classList.toggle("is-current", current);
    button.textContent = current ? "Ⅱ" : "▶";
    button.setAttribute("aria-label", current ? `Pause ${button.dataset.songTitle}` : `Play ${button.dataset.songTitle}`);
  });
}

async function togglePlayback(share) {
  const track = trackFromShare(share);
  if (!track.previewUrl) {
    toast("This song doesn’t have a preview.", "error");
    return;
  }
  if (state.currentShareId === share.id && !audio.paused) {
    audio.pause();
    return;
  }
  state.currentShareId = share.id;
  state.currentPreviewUrl = track.previewUrl;
  if (audio.src !== track.previewUrl) audio.src = track.previewUrl;
  try {
    await audio.play();
    if ("mediaSession" in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: track.title,
        artist: track.artist,
        album: track.album,
        artwork: track.artwork ? [{ src: track.artwork, sizes: "600x600", type: "image/jpeg" }] : [],
      });
    }
  } catch (error) {
    state.currentShareId = null;
    state.currentPreviewUrl = "";
    updatePlaybackUI();
    toast("Preview couldn’t play in this browser.", "error");
  }
}

audio.addEventListener("play", updatePlaybackUI);
audio.addEventListener("pause", updatePlaybackUI);
audio.addEventListener("ended", () => {
  state.currentShareId = null;
  state.currentPreviewUrl = "";
  updatePlaybackUI();
});
audio.addEventListener("error", () => {
  state.currentShareId = null;
  state.currentPreviewUrl = "";
  updatePlaybackUI();
});

function renderShare(share) {
  const track = trackFromShare(share);
  const article = createElement("article", "feed-item");
  const play = createElement("button", "play-button", "▶");
  play.type = "button";
  play.dataset.shareId = share.id;
  play.dataset.songTitle = track.title;
  play.setAttribute("aria-label", `Play ${track.title}`);
  play.addEventListener("click", () => togglePlayback(share));

  const copy = createElement("div", "track-copy");
  copy.append(
    createElement("h3", "", track.title),
    createElement("p", "", track.artist),
    (() => {
      const meta = createElement("p", "shared-meta");
      meta.append(createElement("b", "", cleanText(share.senderName, 40) || "someone"), document.createTextNode(` · ${relativeTime(share.createdAt)}`));
      return meta;
    })()
  );

  const links = createElement("div", "quick-links");
  ["Spotify", "Apple Music", "YouTube Music"].forEach((provider) => {
    const link = createElement("a", "quick-link", provider === "Apple Music" ? "Apple" : provider === "YouTube Music" ? "YouTube" : provider);
    link.href = providerUrl(track, provider);
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.setAttribute("aria-label", `Open ${track.title} in ${provider}`);
    links.append(link);
  });

  article.append(play, image(track.artwork, `Artwork for ${track.title}`), copy, links);
  const note = cleanText(share.note, 280);
  if (note) article.append(createElement("p", "note", `“${note}”`));
  return article;
}

function renderFeed() {
  feedList.replaceChildren();
  feedStatus.textContent = "";
  feedCount.textContent = state.shares.length ? `${state.shares.length} ${state.shares.length === 1 ? "song" : "songs"}` : "";
  if (!state.shares.length) {
    feedList.append(createElement("p", "empty-feed", "Nothing here yet. Put the first song on."));
    return;
  }
  const fragment = document.createDocumentFragment();
  state.shares.forEach((share) => fragment.append(renderShare(share)));
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
