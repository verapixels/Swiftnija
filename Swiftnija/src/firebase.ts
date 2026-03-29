// firebase.ts
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getMessaging } from 'firebase/messaging';
import { getFunctions } from 'firebase/functions'; // ← ADD THIS

const firebaseConfig = {
  apiKey: "AIzaSyDYNYEchX_JuxkwvPi6HD_TdijN_adsQ74",
  authDomain: "swiftnija-c0e04.firebaseapp.com",
  projectId: "swiftnija-c0e04",
  storageBucket: "swiftnija-c0e04.firebasestorage.app",
  messagingSenderId: "607481849237",
  appId: "1:607481849237:web:88b2b88774158dceed429c",
  measurementId: "G-4MCX1H4M1C"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const messaging = getMessaging(app);
export const functions = getFunctions(app); // ← ADD THIS
export default app;