import { initializeApp } from "https://www.gstatic.com/firebasejs/11.4.0/firebase-app.js";
import {
  browserLocalPersistence,
  browserSessionPersistence,
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  setPersistence,
  updateProfile,
} from "https://www.gstatic.com/firebasejs/11.4.0/firebase-auth.js";
import {
  addDoc,
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
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
// Firebase defaults to local persistence on the web. Set it explicitly before
// the app observes auth state so normal browser restarts keep the account.
const authPersistenceReady = setPersistence(auth, browserLocalPersistence)
  .catch(() => setPersistence(auth, browserSessionPersistence))
  .catch(() => undefined);
const db = getFirestore(app);

export {
  addDoc,
  auth,
  authPersistenceReady,
  browserLocalPersistence,
  browserSessionPersistence,
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
  setPersistence,
  updateProfile,
  where,
  writeBatch,
};
