import { initializeApp } from "https://www.gstatic.com/firebasejs/11.4.0/firebase-app.js";
import {
  addDoc,
  collection,
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
const db = getFirestore(app);

export { addDoc, collection, db, limit, onSnapshot, orderBy, query, serverTimestamp };
