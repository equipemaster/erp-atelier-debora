import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getDatabase } from 'firebase/database';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyDHWdwZ-SyOZjvUv9blUv1m70m5CvaOs8o",
  authDomain: "erp-ateliedebora-275e7.firebaseapp.com",
  databaseURL: "https://erp-ateliedebora-275e7-default-rtdb.firebaseio.com",
  projectId: "erp-ateliedebora-275e7",
};

// Start Firebase App
const app = initializeApp(firebaseConfig);

// Initialize Firebase Services
export const auth = getAuth(app);
export const database = getDatabase(app);
export const db = getFirestore(app);

// Expor globalmente para manter compatibilidade temporária com scripts inline existentes do legado
window.auth = auth;
window.db = database;
window.firebaseApp = app;
