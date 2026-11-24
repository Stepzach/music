const { onRequest } = require("firebase-functions/v2/https");

const APP_URL = "https://stepzach.github.io/music/";
const SHARE_URL = "https://resonance-1bf87.web.app/share";
const ICON_URL = "https://stepzach.github.io/music/assets/disco-ball-icon.png?v=3";
const SITE_TITLE = "Resonance";
const SITE_DESCRIPTION = "Shared playlists for the people you love.";
function cleanText(value, maxLength = 60) {
  const source = Array.isArray(value) ? value[0] : value;
  return String(source || "")
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function playlistCode(value) {
  const code = cleanText(value, 4);
  return /^\d{4}$/.test(code) ? code : "";
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  })[character]);
}

function appLink(code) {
  const url = new URL(APP_URL);
  if (code) url.searchParams.set("playlist", code);
  return url.toString();
}

function previewLink(code, name) {
  const url = new URL(SHARE_URL);
  if (code) url.searchParams.set("playlist", code);
  if (name) url.searchParams.set("name", name);
  return url.toString();
}

function previewDocument({ title, description, previewUrl, targetUrl }) {
  const escapedTitle = escapeHtml(title);
  const escapedDescription = escapeHtml(description);
  const escapedPreviewUrl = escapeHtml(previewUrl);
  const escapedTargetUrl = escapeHtml(targetUrl);
  const redirect = JSON.stringify(targetUrl).replace(/</g, "\\u003c");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex, nofollow, noarchive, nosnippet" />
    <title>${escapedTitle}</title>
    <meta name="description" content="${escapedDescription}" />
    <meta property="og:title" content="${escapedTitle}" />
    <meta property="og:description" content="${escapedDescription}" />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="${escapedPreviewUrl}" />
    <meta property="og:image" content="${ICON_URL}" />
    <meta property="og:image:alt" content="Resonance disco ball" />
    <meta name="twitter:card" content="summary" />
    <meta name="twitter:title" content="${escapedTitle}" />
    <meta name="twitter:description" content="${escapedDescription}" />
    <meta name="twitter:image" content="${ICON_URL}" />
    <script>window.location.replace(${redirect});</script>
  </head>
  <body>
    <a href="${escapedTargetUrl}">Open Resonance</a>
  </body>
</html>`;
}

exports.sharePreview = onRequest(
  {
    region: "us-central1",
    invoker: "public",
    maxInstances: 3,
  },
  (request, response) => {
    if (!["GET", "HEAD"].includes(request.method)) {
      response.set("Allow", "GET, HEAD").status(405).send("Method not allowed");
      return;
    }

    const code = playlistCode(request.query.playlist);
    // The intentionally shared link supplies the title. This function never
    // looks up four-digit invite codes, so playlist names cannot be guessed.
    const name = code ? cleanText(request.query.name) : "";
    const title = name ? `${name} · ${SITE_TITLE}` : SITE_TITLE;
    const description = name
      ? `Open ${name} on ${SITE_TITLE}.`
      : SITE_DESCRIPTION;
    const previewUrl = previewLink(code, name);
    const targetUrl = appLink(code);

    response.set({
      "Cache-Control": "private, no-store",
      "Content-Type": "text/html; charset=utf-8",
      "X-Robots-Tag": "noindex, nofollow, noarchive, nosnippet",
    });

    if (request.method === "HEAD") {
      response.status(200).end();
      return;
    }

    response.status(200).send(previewDocument({ title, description, previewUrl, targetUrl }));
  }
);
