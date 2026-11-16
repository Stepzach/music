import { initializeApp } from "https://www.gstatic.com/firebasejs/11.4.0/firebase-app.js";
import {
  getAuth,
  signInAnonymously,
} from "https://www.gstatic.com/firebasejs/11.4.0/firebase-auth.js";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getFirestore,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/11.4.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCiBdFO7ccWE0TMHVvz-390FYFWJVqwdyg",
  authDomain: "resonance-1bf87.firebaseapp.com",
  projectId: "resonance-1bf87",
  storageBucket: "resonance-1bf87.firebasestorage.app",
  messagingSenderId: "565875992503",
  appId: "1:565875992503:web:c941a83908aa29fa2caa32",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
let anonymousSignIn;

async function getCurrentUser() {
  if (typeof auth.authStateReady === "function") await auth.authStateReady();
  return auth.currentUser;
}

async function ensureAnonymousUser() {
  const currentUser = await getCurrentUser();
  if (currentUser) return currentUser;

  if (!anonymousSignIn) {
    anonymousSignIn = signInAnonymously(auth)
      .then(({ user }) => user)
      .catch((error) => {
        anonymousSignIn = null;
        throw error;
      });
  }
  return anonymousSignIn;
}

export {
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
};
