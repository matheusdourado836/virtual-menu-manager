import * as admin from "firebase-admin";
import { deleteApp, initializeApp as initializeClientApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { doc, getFirestore as getClientFirestore, writeBatch } from "firebase/firestore";
import { existsSync, readFileSync } from "node:fs";
import { seedBundles } from "../src/data/cafe-carioca-seed";

const loadEnvFile = (path: string) => {
  if (!existsSync(path)) {
    return;
  }

  const lines = readFileSync(path, "utf8").split(/\r?\n/);

  for (const line of lines) {
    const trimmedLine = line.trim();

    if (!trimmedLine || trimmedLine.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmedLine.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmedLine.slice(0, separatorIndex).trim();
    const rawValue = trimmedLine.slice(separatorIndex + 1).trim();
    const value = rawValue.replace(/^["']|["']$/g, "");

    if (value.startsWith("TODO_CONFIG")) {
      continue;
    }

    process.env[key] ??= value;
  }
};

loadEnvFile(".env");
loadEnvFile(".env.local");

const projectId = process.env.FIREBASE_PROJECT_ID;
const ownerEmail = process.env.SEED_OWNER_EMAIL || "cafecarioca@gmail.com";
const ownerPassword = process.env.SEED_OWNER_PASSWORD || "123456";

const buildStore = (ownerUid: string, bundle: (typeof seedBundles)[number]) => ({
  ...bundle.store,
  owners: [ownerUid],
  adminUsers: Array.from(new Set([ownerUid, ...bundle.store.adminUsers.filter((uid) => !uid.startsWith("TODO_"))])),
  updatedAt: new Date().toISOString(),
});

const removeUndefined = <T>(value: T): T => {
  if (Array.isArray(value)) {
    return value.map((item) => removeUndefined(item)) as T;
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, itemValue]) => itemValue !== undefined)
        .map(([key, itemValue]) => [key, removeUndefined(itemValue)]),
    ) as T;
  }

  return value;
};

async function seedWithAdmin() {
  if (!admin.apps.length) {
    admin.initializeApp({
      projectId,
    });
  }

  const db = admin.firestore();
  const owner = await admin.auth().getUserByEmail(ownerEmail);

  for (const bundle of seedBundles) {
    const store = buildStore(owner.uid, bundle);
    const storeRef = db.collection("stores").doc(bundle.store.id);
    await storeRef.set(removeUndefined(store), { merge: true });
    await storeRef.collection("theme").doc(bundle.theme.id).set(removeUndefined(bundle.theme), { merge: true });

    const batch = db.batch();

    for (const table of bundle.tables) {
      batch.set(storeRef.collection("tables").doc(table.id), removeUndefined(table), { merge: true });
    }

    for (const category of bundle.categories) {
      batch.set(storeRef.collection("categories").doc(category.id), removeUndefined(category), { merge: true });
    }

    for (const additional of bundle.additionals) {
      batch.set(storeRef.collection("additionals").doc(additional.id), removeUndefined(additional), { merge: true });
    }

    for (const item of bundle.menuItems) {
      batch.set(storeRef.collection("menuItems").doc(item.id), removeUndefined(item), { merge: true });
    }

    await batch.commit();
    console.log(`Seed aplicado via Admin SDK: ${bundle.store.name} (${bundle.menuItems.length} itens)`);
    console.log(`Owner vinculado: ${ownerEmail} (${owner.uid})`);
  }
}

async function seedWithClient() {
  const firebaseConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  };

  const app = initializeClientApp(firebaseConfig);
  const auth = getAuth(app);
  const credential = await signInWithEmailAndPassword(auth, ownerEmail, ownerPassword);
  const db = getClientFirestore(app);

  try {
    for (const bundle of seedBundles) {
      const store = buildStore(credential.user.uid, bundle);
      const batch = writeBatch(db);
      const storeRef = doc(db, "stores", bundle.store.id);

      batch.set(storeRef, removeUndefined(store), { merge: true });
      batch.set(doc(db, "stores", bundle.store.id, "theme", bundle.theme.id), removeUndefined(bundle.theme), { merge: true });

      for (const table of bundle.tables) {
        batch.set(doc(db, "stores", bundle.store.id, "tables", table.id), removeUndefined(table), { merge: true });
      }

      for (const category of bundle.categories) {
        batch.set(doc(db, "stores", bundle.store.id, "categories", category.id), removeUndefined(category), { merge: true });
      }

      for (const additional of bundle.additionals) {
        batch.set(doc(db, "stores", bundle.store.id, "additionals", additional.id), removeUndefined(additional), { merge: true });
      }

      for (const item of bundle.menuItems) {
        batch.set(doc(db, "stores", bundle.store.id, "menuItems", item.id), removeUndefined(item), { merge: true });
      }

      await batch.commit();
      console.log(`Seed aplicado via Client SDK: ${bundle.store.name} (${bundle.menuItems.length} itens)`);
      console.log(`Owner vinculado: ${ownerEmail} (${credential.user.uid})`);
    }
  } finally {
    await signOut(auth);
    await deleteApp(app);
  }
}

async function seed() {
  try {
    await seedWithAdmin();
  } catch (adminError) {
    const message = adminError instanceof Error ? adminError.message : String(adminError);

    if (!message.includes("Could not load the default credentials") && !message.includes("failed to fetch")) {
      throw adminError;
    }

    console.warn("Admin SDK sem credencial local. Tentando fallback com Firebase Client SDK.");
    await seedWithClient();
  }
}

seed().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
