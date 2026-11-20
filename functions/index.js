const { onRequest } = require("firebase-functions/v2/https");
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { defineSecret } = require("firebase-functions/params");
const { getApps, initializeApp } = require("firebase-admin/app");
const { FieldValue, getFirestore, Timestamp } = require("firebase-admin/firestore");
const logger = require("firebase-functions/logger");
const webpush = require("web-push");

const APP_URL = "https://stepzach.github.io/music/";
const SHARE_URL = "https://resonance-1bf87.web.app/share";
const ICON_URL = "https://stepzach.github.io/music/assets/disco-ball-icon.png?v=3";
const SITE_TITLE = "Resonance";
const SITE_DESCRIPTION = "Shared playlists for the people you love.";
const VAPID_PRIVATE_KEY = defineSecret("VAPID_PRIVATE_KEY");
// This public half is intentionally safe to ship in both the app and the
// function. It is filled during the one-time VAPID setup alongside the client
// value; the private half always stays in the Firebase secret above.
const VAPID_PUBLIC_KEY = "zkbrU3iKHrJFnHpW_5fEk1EY2f-s4XdU2h_yBBJU4yYTo0YBBk9DiYLMUvoCzvvQwU0FGre3qSk3Dy8EmBMLoA";

if (!getApps().length) initializeApp();
const firestore = getFirestore();

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

function safeUserId(value) {
  return typeof value === "string" && value.length >= 1 && value.length <= 128 && !value.includes("/")
    ? value
    : "";
}

function validPushSubscription(data) {
  if (!data || typeof data !== "object") return false;
  if (typeof data.endpoint !== "string" || typeof data.p256dh !== "string" || typeof data.auth !== "string") return false;
  if (data.endpoint.length > 2048 || data.p256dh.length > 512 || data.auth.length > 256) return false;

  try {
    return new URL(data.endpoint).protocol === "https:";
  } catch {
    return false;
  }
}

function deliveryReference(playlistId, shareId) {
  return firestore.collection("_notificationDeliveries").doc(`${playlistId}_${shareId}`);
}

async function claimDelivery(reference, playlistId, shareId) {
  const now = Timestamp.now();
  const leaseLengthMs = 90 * 1000;

  return firestore.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(reference);
    const current = snapshot.data() || {};
    if (current.status === "completed") return "completed";

    const startedAt = current.startedAt;
    const leaseIsActive = current.status === "sending" &&
      startedAt instanceof Timestamp &&
      now.toMillis() - startedAt.toMillis() < leaseLengthMs;
    if (leaseIsActive) return "sending";

    const attempts = Number.isInteger(current.attempts) && current.attempts >= 0
      ? current.attempts + 1
      : 1;
    transaction.set(reference, {
      playlistId,
      shareId,
      status: "sending",
      attempts,
      createdAt: current.createdAt || now,
      startedAt: now,
      updatedAt: now,
    }, { merge: true });
    return "claimed";
  });
}

function isNotificationEnabled(snapshot) {
  return !snapshot.exists || snapshot.data()?.enabled !== false;
}

async function collectSubscriptions(recipientIds) {
  const endpointSet = new Set();
  const perRecipient = await Promise.all(recipientIds.map(async (userId) => {
    const profileRef = firestore.collection("profiles").doc(userId);
    const [settingsSnapshot, subscriptionsSnapshot] = await Promise.all([
      profileRef.collection("notificationSettings").doc("song-shares").get(),
      profileRef.collection("pushSubscriptions").get(),
    ]);

    if (!isNotificationEnabled(settingsSnapshot)) return [];

    return subscriptionsSnapshot.docs
      .map((snapshot) => ({ reference: snapshot.ref, subscription: snapshot.data() }))
      .filter(({ subscription }) => validPushSubscription(subscription));
  }));

  return perRecipient.flat().filter(({ subscription }) => {
    if (endpointSet.has(subscription.endpoint)) return false;
    endpointSet.add(subscription.endpoint);
    return true;
  });
}

async function sendPush({ reference, subscription, payload, topic }) {
  try {
    await webpush.sendNotification({
      endpoint: subscription.endpoint,
      keys: {
        p256dh: subscription.p256dh,
        auth: subscription.auth,
      },
    }, payload, {
      TTL: 60 * 60 * 12,
      urgency: "normal",
      topic,
    });
    return { sent: true };
  } catch (error) {
    // A subscription expires when a person removes the web app, clears their
    // browser data, or turns off notifications in the browser. Do not retry
    // those endpoints indefinitely.
    if (error?.statusCode === 404 || error?.statusCode === 410) {
      await reference.delete();
      return { removed: true };
    }
    throw error;
  }
}

exports.notifyPrivatePlaylistShare = onDocumentCreated(
  {
    document: "sharedPlaylists/{playlistId}/shares/{shareId}",
    region: "europe-west1",
    retry: true,
    secrets: [VAPID_PRIVATE_KEY],
    timeoutSeconds: 60,
    maxInstances: 5,
  },
  async (event) => {
    const { playlistId, shareId } = event.params;
    const share = event.data?.data();
    if (!share) return;

    const playlistSnapshot = await firestore.collection("sharedPlaylists").doc(playlistId).get();
    if (!playlistSnapshot.exists) return;

    const playlist = playlistSnapshot.data() || {};
    // Legacy playlists were private before visibility was introduced, so only
    // the explicit public state opts out of alerts.
    if (playlist.visibility === "public") return;

    const senderUid = safeUserId(share.senderUid);
    const senderName = cleanText(share.senderName, 40);
    if (!senderUid || !senderName) {
      logger.warn("Skipped a playlist alert with an incomplete sender.", { playlistId, shareId });
      return;
    }

    const deliveryRef = deliveryReference(playlistId, shareId);
    const claim = await claimDelivery(deliveryRef, playlistId, shareId);
    if (claim === "completed") return;
    // Firestore events are delivered at least once. A sibling invocation that
    // arrives during the short lease can safely leave delivery to the active
    // invocation instead of creating a duplicate push. If that invocation
    // fails, its own configured retry claims the delivery after the lease.
    if (claim === "sending") return;

    const membersSnapshot = await playlistSnapshot.ref.collection("members").get();
    const recipientIds = [...new Set(membersSnapshot.docs
      .map((snapshot) => {
        const member = snapshot.data();
        const userId = safeUserId(member.userId);
        return userId === snapshot.id && userId !== senderUid ? userId : "";
      })
      .filter(Boolean))];

    const subscriptions = await collectSubscriptions(recipientIds);
    const topic = `share-${playlistId}-${shareId}`.slice(0, 32);
    const payload = JSON.stringify({
      title: SITE_TITLE,
      body: `${senderName} just added a song! Open Resonance to view`,
      url: appLink(playlistCode(playlist.joinCode)),
      tag: topic,
    });
    let results = [];
    if (subscriptions.length) {
      const publicKey = VAPID_PUBLIC_KEY;
      const privateKey = VAPID_PRIVATE_KEY.value();
      if (!publicKey || !privateKey) {
        throw new Error("VAPID keys are not configured for playlist notifications.");
      }

      webpush.setVapidDetails(APP_URL, publicKey, privateKey);
      results = await Promise.allSettled(subscriptions.map((entry) => sendPush({
        ...entry,
        payload,
        topic,
      })));
    }
    const retryableFailures = results.filter((result) => result.status === "rejected");
    if (retryableFailures.length) {
      const firstFailure = retryableFailures[0].reason;
      logger.error("Could not deliver one or more playlist alerts.", {
        playlistId,
        shareId,
        failures: retryableFailures.length,
        statusCode: firstFailure?.statusCode,
      });
      throw firstFailure instanceof Error ? firstFailure : new Error("Could not deliver playlist alerts.");
    }

    const sentCount = results.filter((result) => result.status === "fulfilled" && result.value.sent).length;
    await deliveryRef.set({
      status: "completed",
      recipientCount: recipientIds.length,
      subscriptionCount: subscriptions.length,
      sentCount,
      completedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    logger.info("Delivered private playlist alerts.", {
      playlistId,
      shareId,
      recipientCount: recipientIds.length,
      subscriptionCount: subscriptions.length,
      sentCount,
    });
  }
);
