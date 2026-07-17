import { readFileSync } from "node:fs";
import { cert, deleteApp, initializeApp, type App } from "firebase-admin/app";
import {
  FieldValue,
  getFirestore,
  type DocumentData,
  type DocumentReference,
  type Firestore,
} from "firebase-admin/firestore";
import { expect, test, type Page } from "@playwright/test";

const testStoreSlug = "teste";
const serviceAccountPath = process.env.E2E_FIREBASE_SERVICE_ACCOUNT?.trim();
const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "virtual-order-manager";
const alwaysOpenHours = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"]
  .map((day) => `${day} 00:00-24:00`)
  .join(", ");
const runId = `${Date.now()}-${process.pid}`;
const successCustomerName = `Cliente E2E ${runId}`;

let adminApp: App;
let db: Firestore;
let storeRef: DocumentReference<DocumentData>;
let originalStoreAvailability: Record<string, unknown>;

const restorePatch = (original: DocumentData, keys: string[]) =>
  Object.fromEntries(
    keys.map((key) => [key, original[key] === undefined ? FieldValue.delete() : original[key]]),
  );

const addItemToCart = async (page: Page, itemName: string, optionNames: string[] = []) => {
  await page.goto(`/loja/${testStoreSlug}`);
  await expect(page.getByRole("heading", { name: "teste", exact: true })).toBeVisible({ timeout: 15_000 });

  if (["Água mineral", "Café expresso"].includes(itemName)) {
    await page.getByRole("tab", { name: "Bebidas", exact: true }).click();
  }

  await page.getByRole("button", { name: `Adicionar ${itemName}`, exact: true }).click();
  const dialog = page.getByRole("dialog", { name: itemName, exact: true });

  for (const optionName of optionNames) {
    await dialog.getByRole("button", { name: new RegExp(`^${optionName}`) }).click();
  }

  await dialog.getByRole("button", { name: /Adicionar/ }).click();
  await page.getByRole("link", { name: /Ir para o carrinho/ }).click();
  await expect(page.getByRole("heading", { name: "Retirada no balcão", exact: true })).toBeVisible();
};

const fillCustomer = async (
  page: Page,
  options: { name?: string; phone?: string; payment?: string; observation?: string } = {},
) => {
  await page.getByLabel("Nome *").fill(options.name ?? `Cliente E2E ${runId}`);

  if (options.phone !== undefined) {
    await page.getByLabel("Telefone opcional").fill(options.phone);
  }

  if (options.payment) {
    await page.getByLabel("Pagamento *").selectOption(options.payment);
  }

  if (options.observation) {
    await page.getByLabel("Observação do pedido").fill(options.observation);
  }
};

const withItemPatch = async (
  itemId: string,
  patch: DocumentData,
  assertion: () => Promise<void>,
) => {
  const itemRef = storeRef.collection("menuItems").doc(itemId);
  const snapshot = await itemRef.get();

  if (!snapshot.exists) {
    throw new Error(`Item de teste não encontrado: ${itemId}`);
  }

  const original = snapshot.data()!;
  await itemRef.set(patch, { merge: true });

  try {
    await assertion();
  } finally {
    await itemRef.set(restorePatch(original, Object.keys(patch)), { merge: true });
  }
};

const checkoutButton = (page: Page) => page.getByRole("button", { name: "Enviar pedido", exact: true });
const checkoutAlert = (page: Page) => page.locator(".cart-page__error");

test.describe("checkout da loja teste", () => {
  test.skip(!serviceAccountPath, "Defina E2E_FIREBASE_SERVICE_ACCOUNT para executar os cenários de checkout.");

  test.beforeAll(async () => {
    const serviceAccount = JSON.parse(readFileSync(serviceAccountPath!, "utf8"));
    adminApp = initializeApp(
      { credential: cert(serviceAccount), projectId },
      `checkout-e2e-${process.pid}`,
    );
    db = getFirestore(adminApp);

    const stores = await db.collection("stores").where("slug", "==", testStoreSlug).limit(2).get();

    if (stores.size !== 1) {
      throw new Error(`Era esperada uma única loja '${testStoreSlug}', mas foram encontradas ${stores.size}.`);
    }

    storeRef = stores.docs[0].ref;
    const store = stores.docs[0].data();

    originalStoreAvailability = restorePatch(store, [
      "isActive",
      "isAcceptingOrders",
      "openingHours",
      "pausedMessage",
    ]);

    await storeRef.set({
      isActive: true,
      isAcceptingOrders: true,
      openingHours: alwaysOpenHours,
      pausedMessage: "",
    }, { merge: true });
  });

  test.afterAll(async () => {
    if (!storeRef || !db) return;

    const testOrders = await storeRef.collection("orders").where("customerName", "==", successCustomerName).get();
    const batch = db.batch();

    for (const order of testOrders.docs) {
      batch.delete(order.ref);
      batch.delete(db.doc(`orderLookup/${order.id}`));
    }

    batch.set(storeRef, originalStoreAvailability, { merge: true });
    await batch.commit();

    if (adminApp) {
      await deleteApp(adminApp);
    }
  });

  test("cria um pedido válido com adicional, telefone, pagamento e observação", async ({ page }) => {
    await addItemToCart(page, "Café expresso", ["Leite"]);
    await fillCustomer(page, {
      name: successCustomerName,
      phone: "(11) 98765-4321",
      payment: "pix_on_pickup",
      observation: "Pedido automatizado; remover após o teste.",
    });

    await checkoutButton(page).click();

    await expect(page).toHaveURL(/\/pedido\/[^/]+$/, { timeout: 20_000 });
    await expect(page.getByRole("heading", { name: /Pedido \d+/ })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(successCustomerName, { exact: true })).toBeVisible();
    await expect(page.getByText("Leite", { exact: true })).toBeVisible();
  });

  test("bloqueia pedido sem nome e mostra instrução em português", async ({ page }) => {
    await addItemToCart(page, "Água mineral");
    await checkoutButton(page).click();

    await expect(checkoutAlert(page)).toHaveText("Informe um nome com pelo menos 2 caracteres.");
  });

  test("bloqueia telefone inválido antes de chamar o servidor", async ({ page }) => {
    await addItemToCart(page, "Água mineral");
    await fillCustomer(page, { phone: "119" });
    await checkoutButton(page).click();

    await expect(checkoutAlert(page)).toHaveText("Informe um telefone válido com DDD.");
  });

  test("informa quando a loja é pausada enquanto o cliente está no carrinho", async ({ page }) => {
    await addItemToCart(page, "Água mineral");
    await fillCustomer(page);

    await storeRef.set({
      isAcceptingOrders: false,
      pausedMessage: "Pedidos de teste pausados por alguns instantes.",
    }, { merge: true });

    try {
      await checkoutButton(page).click();
      await expect(checkoutAlert(page)).toContainText("Pedidos de teste pausados por alguns instantes.");
    } finally {
      await storeRef.set({ isAcceptingOrders: true, pausedMessage: "" }, { merge: true });
    }
  });

  test("remove e identifica o item que ficou indisponível durante a compra", async ({ page }) => {
    await addItemToCart(page, "Água mineral");
    await fillCustomer(page);

    await withItemPatch("demo-agua-mineral", { isAvailable: false }, async () => {
      await checkoutButton(page).click();
      await expect(checkoutAlert(page)).toContainText("O item Água mineral não está mais disponível.");
      await expect(checkoutAlert(page)).toContainText("seu carrinho ficou vazio");
    });
  });

  test("remove e identifica o adicional que ficou indisponível", async ({ page }) => {
    await addItemToCart(page, "Água mineral", ["Gelo"]);
    await fillCustomer(page);
    const itemSnapshot = await storeRef.collection("menuItems").doc("demo-agua-mineral").get();
    const optionsGroups = itemSnapshot.get("optionsGroups") as Array<DocumentData>;
    const unavailableGroups = optionsGroups.map((group) => ({
      ...group,
      choices: group.choices.map((choice: DocumentData) =>
        choice.id === "demo-gelo" ? { ...choice, isAvailable: false } : choice),
    }));

    await withItemPatch("demo-agua-mineral", { optionsGroups: unavailableGroups }, async () => {
      await checkoutButton(page).click();
      await expect(checkoutAlert(page)).toContainText("O adicional Gelo não está mais disponível.");
      await expect(checkoutAlert(page)).toContainText("foi removido do seu pedido");
    });
  });

  test("atualiza o carrinho quando o preço do item muda", async ({ page }) => {
    await addItemToCart(page, "Água mineral");
    await fillCustomer(page);

    await withItemPatch("demo-agua-mineral", { price: 5.25 }, async () => {
      await checkoutButton(page).click();
      await expect(checkoutAlert(page)).toContainText("O preço de Água mineral mudou de R$ 4,00 para R$ 5,25.");
      await expect(checkoutAlert(page)).toContainText("O carrinho foi atualizado");
    });
  });

  test("atualiza o carrinho quando o preço do adicional muda", async ({ page }) => {
    await addItemToCart(page, "Café expresso", ["Leite"]);
    await fillCustomer(page);
    const itemSnapshot = await storeRef.collection("menuItems").doc("demo-cafe-expresso").get();
    const optionsGroups = itemSnapshot.get("optionsGroups") as Array<DocumentData>;
    const updatedGroups = optionsGroups.map((group) => ({
      ...group,
      choices: group.choices.map((choice: DocumentData) =>
        choice.id === "demo-leite" ? { ...choice, price: 3.25 } : choice),
    }));

    await withItemPatch("demo-cafe-expresso", { optionsGroups: updatedGroups }, async () => {
      await checkoutButton(page).click();
      await expect(checkoutAlert(page)).toContainText("O preço do adicional Leite mudou de R$ 2,00 para R$ 3,25.");
      await expect(checkoutAlert(page)).toContainText("O carrinho foi atualizado");
    });
  });

  test("remove o item quando uma opção passa a ser obrigatória", async ({ page }) => {
    await addItemToCart(page, "Água mineral");
    await fillCustomer(page);
    const itemSnapshot = await storeRef.collection("menuItems").doc("demo-agua-mineral").get();
    const optionsGroups = itemSnapshot.get("optionsGroups") as Array<DocumentData>;
    const requiredGroups = optionsGroups.map((group) =>
      group.id === "personalize-bebida"
        ? { ...group, isRequired: true, minSelected: 1 }
        : group);

    await withItemPatch("demo-agua-mineral", { optionsGroups: requiredGroups }, async () => {
      await checkoutButton(page).click();
      await expect(checkoutAlert(page)).toContainText("Água mineral precisa de uma opção em Personalize sua bebida.");
      await expect(checkoutAlert(page)).toContainText("O item foi removido");
    });
  });

  test("traduz uma falha de conexão sem exibir erro técnico do Firebase", async ({ page }) => {
    await addItemToCart(page, "Água mineral");
    await fillCustomer(page);
    await page.route("**/createOrder", (route) => route.abort("internetdisconnected"));
    await checkoutButton(page).click();

    const alert = checkoutAlert(page);
    await expect(alert).toBeVisible();
    await expect(alert).not.toContainText(/Firebase|failed-precondition|internal error|unknown error/iu);
    await expect(checkoutButton(page)).toBeEnabled();
  });
});
