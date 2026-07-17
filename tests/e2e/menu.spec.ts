import { readFileSync } from "node:fs";
import { cert, deleteApp, initializeApp, type App } from "firebase-admin/app";
import { getFirestore, type DocumentReference } from "firebase-admin/firestore";
import { expect, test } from "@playwright/test";

const testStoreSlug = "teste";
const emptyCategoryName = "Categoria vazia E2E";
const serviceAccountPath = process.env.E2E_FIREBASE_SERVICE_ACCOUNT?.trim();
const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "virtual-order-manager";

let adminApp: App;
let emptyCategoryRef: DocumentReference;

test.describe("cardápio público da loja teste", () => {
  test.skip(!serviceAccountPath, "Defina E2E_FIREBASE_SERVICE_ACCOUNT para testar categorias vazias.");

  test.beforeAll(async () => {
    const serviceAccount = JSON.parse(readFileSync(serviceAccountPath!, "utf8"));
    adminApp = initializeApp(
      { credential: cert(serviceAccount), projectId },
      `menu-e2e-${process.pid}`,
    );
    const db = getFirestore(adminApp);
    const stores = await db.collection("stores").where("slug", "==", testStoreSlug).limit(2).get();

    if (stores.size !== 1) {
      throw new Error(`Era esperada uma única loja '${testStoreSlug}', mas foram encontradas ${stores.size}.`);
    }

    const storeRef = stores.docs[0].ref;
    emptyCategoryRef = storeRef.collection("categories").doc(`e2e-empty-${process.pid}`);
    await emptyCategoryRef.set({
      storeId: storeRef.id,
      name: emptyCategoryName,
      order: 999,
      isActive: true,
    });
  });

  test.afterAll(async () => {
    if (emptyCategoryRef) {
      await emptyCategoryRef.delete();
    }

    if (adminApp) {
      await deleteApp(adminApp);
    }
  });

  test("não exibe uma categoria ativa sem itens disponíveis", async ({ page }) => {
    await page.goto(`/loja/${testStoreSlug}`);

    await expect(page.getByRole("heading", { name: testStoreSlug, exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("tab", { name: "Pratos", exact: true })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Bebidas", exact: true })).toBeVisible();
    await expect(page.getByRole("tab", { name: emptyCategoryName, exact: true })).toHaveCount(0);
  });
});
