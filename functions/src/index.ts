import * as admin from "firebase-admin";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import QRCode from "qrcode";
import { z } from "zod";

admin.initializeApp();

const db = admin.firestore();

const nullableOptionalString = z
  .string()
  .optional()
  .nullable()
  .transform((value) => value ?? undefined);

const nullableOptionalText = (maxLength: number) =>
  z
    .string()
    .max(maxLength)
    .optional()
    .nullable()
    .transform((value) => value ?? undefined);

const optionalTrimmedValue = (maxLength: number) =>
  z
    .string()
    .trim()
    .max(maxLength)
    .optional()
    .nullable()
    .transform((value) => value ?? "");

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

const orderStatusSchema = z.enum(["received", "accepted", "preparing", "ready", "delivered", "cancelled"]);

const createOrderSchema = z.object({
  storeId: z.string().min(1),
  tableId: nullableOptionalString,
  tableLabel: nullableOptionalString,
  customerName: z.string().min(2),
  customerPhone: nullableOptionalString,
  paymentMethod: z.enum(["pay_on_pickup", "pix_on_pickup", "card_on_pickup"]),
  observation: nullableOptionalText(500),
  items: z
    .array(
      z.object({
        menuItemId: z.string().min(1),
        quantity: z.number().int().min(1).max(20),
        observation: nullableOptionalText(300),
        selectedOptions: z.array(
          z.object({
            groupId: z.string().min(1),
            choiceId: z.string().min(1),
          }),
        ),
      }),
    )
    .min(1),
});

const setClaimsSchema = z.object({
  uid: z.string().min(1),
  claims: z.record(z.string(), z.boolean()),
});

const createStoreSchema = z.object({
  name: z.string().min(2),
  slug: z.string().min(2),
  description: z.string().default(""),
  owners: z.array(z.string()).min(1),
  adminUsers: z.array(z.string()).default([]),
});

const updateStatusSchema = z.object({
  storeId: z.string().min(1),
  orderId: z.string().min(1),
  status: orderStatusSchema,
});

const deleteOrderSchema = z.object({
  storeId: z.string().min(1),
  orderId: z.string().min(1),
});

const getAdminStoreBundleSchema = z.object({
  slug: z.string().trim().min(2),
});

const createTableSchema = z.object({
  storeId: z.string().min(1),
  label: z.string().trim().min(2).max(60),
});

const createCategorySchema = z.object({
  storeId: z.string().min(1),
  name: z.string().trim().min(2).max(80),
});

const menuItemFieldsSchema = z.object({
  categoryId: z.string().min(1),
  name: z.string().trim().min(2).max(120),
  description: optionalTrimmedValue(500),
  imageUrl: optionalTrimmedValue(500),
  price: z.number().min(0).max(99999),
  isAvailable: z.boolean().default(true),
});

const createMenuItemSchema = menuItemFieldsSchema.extend({
  storeId: z.string().min(1),
});

const updateMenuItemSchema = menuItemFieldsSchema.extend({
  storeId: z.string().min(1),
  itemId: z.string().min(1),
});

const deleteMenuItemSchema = z.object({
  storeId: z.string().min(1),
  itemId: z.string().min(1),
});

const updateStoreSettingsSchema = z.object({
  storeId: z.string().min(1),
  store: z
    .object({
      name: z.string().trim().min(2).max(120).optional(),
      description: z.string().trim().max(500).optional(),
      phone: optionalTrimmedValue(80),
      address: optionalTrimmedValue(240),
      openingHours: optionalTrimmedValue(240),
      isActive: z.boolean().optional(),
      isAcceptingOrders: z.boolean().optional(),
      pausedMessage: z.string().trim().max(240).optional(),
      estimatedPrepMinutes: z.number().int().min(1).max(240).optional(),
    })
    .optional(),
  theme: z
    .object({
      primaryColor: z.string().trim().min(4).max(24).optional(),
      secondaryColor: z.string().trim().min(4).max(24).optional(),
      accentColor: z.string().trim().min(4).max(24).optional(),
      backgroundColor: z.string().trim().min(4).max(24).optional(),
      surfaceColor: z.string().trim().min(4).max(24).optional(),
      textColor: z.string().trim().min(4).max(24).optional(),
      mutedTextColor: z.string().trim().min(4).max(24).optional(),
      borderColor: z.string().trim().min(4).max(24).optional(),
      fontFamily: z.string().trim().min(2).max(120).optional(),
      borderRadius: z.number().int().min(0).max(40).optional(),
      logoUrl: optionalTrimmedValue(500),
      bannerUrl: optionalTrimmedValue(500),
      visualStyle: z.string().trim().min(2).max(120).optional(),
    })
    .optional(),
});

const generateQrSchema = z.object({
  storeId: z.string().min(1),
  tableId: z.string().min(1),
  publicBaseUrl: z.string().url(),
});

const assertPlatformAdmin = (auth: { token?: admin.auth.DecodedIdToken } | undefined) => {
  if (!auth?.token?.platformAdmin) {
    throw new HttpsError("permission-denied", "Apenas admin global pode executar esta operação.");
  }
};

const assertStoreAdmin = async (storeId: string, auth: { uid?: string; token?: admin.auth.DecodedIdToken } | undefined) => {
  if (!auth?.uid) {
    throw new HttpsError("unauthenticated", "Autenticação obrigatória.");
  }

  if (auth.token?.platformAdmin) {
    return;
  }

  const storeSnapshot = await db.doc(`stores/${storeId}`).get();
  const store = storeSnapshot.data() as { owners?: string[]; adminUsers?: string[] } | undefined;

  if (!store?.owners?.includes(auth.uid) && !store?.adminUsers?.includes(auth.uid)) {
    throw new HttpsError("permission-denied", "Usuário sem permissão nesta loja.");
  }
};

const mapDocument = (snapshot: admin.firestore.DocumentSnapshot) => ({
  id: snapshot.id,
  ...(snapshot.data() || {}),
});

const getStoreBundle = async (storeSnapshot: admin.firestore.DocumentSnapshot) => {
  if (!storeSnapshot.exists) {
    throw new HttpsError("not-found", "Loja não encontrada.");
  }

  const storeRef = db.collection("stores").doc(storeSnapshot.id);
  const [themeSnapshot, tableSnapshot, categorySnapshot, itemSnapshot] = await Promise.all([
    storeRef.collection("theme").doc("default").get(),
    storeRef.collection("tables").orderBy("label", "asc").get(),
    storeRef.collection("categories").orderBy("order", "asc").get(),
    storeRef.collection("menuItems").orderBy("order", "asc").get(),
  ]);

  if (!themeSnapshot.exists) {
    throw new HttpsError("failed-precondition", "Tema padrão da loja não encontrado.");
  }

  return {
    store: mapDocument(storeSnapshot),
    theme: mapDocument(themeSnapshot),
    tables: tableSnapshot.docs.map(mapDocument),
    categories: categorySnapshot.docs.map(mapDocument),
    menuItems: itemSnapshot.docs.map(mapDocument),
  };
};

export const setUserClaims = onCall(async (request) => {
  assertPlatformAdmin(request.auth);
  const payload = setClaimsSchema.parse(request.data);
  await admin.auth().setCustomUserClaims(payload.uid, payload.claims);
  return { ok: true };
});

export const createStore = onCall(async (request) => {
  assertPlatformAdmin(request.auth);
  const payload = createStoreSchema.parse(request.data);
  const now = new Date().toISOString();
  const storeRef = db.collection("stores").doc();

  await storeRef.set({
    name: payload.name,
    slug: payload.slug,
    description: payload.description,
    owners: payload.owners,
    adminUsers: payload.adminUsers,
    isActive: true,
    isAcceptingOrders: true,
    pausedMessage: "Pedidos online pausados no momento.",
    estimatedPrepMinutes: 20,
    createdAt: now,
    updatedAt: now,
  });

  return { id: storeRef.id };
});

export const getAdminStoreBundle = onCall(async (request) => {
  const payload = getAdminStoreBundleSchema.parse(request.data);
  const storeSnapshot = await db.collection("stores").where("slug", "==", payload.slug).limit(1).get();
  const storeDocument = storeSnapshot.docs[0];

  if (!storeDocument) {
    throw new HttpsError("not-found", "Loja não encontrada.");
  }

  await assertStoreAdmin(storeDocument.id, request.auth);
  return getStoreBundle(storeDocument);
});

interface CreateOrderOptions {
  allowPausedStore?: boolean;
  initialStatus?: "received" | "accepted";
}

const createOrderRecord = async (payload: z.infer<typeof createOrderSchema>, options: CreateOrderOptions = {}) => {
  const storeRef = db.doc(`stores/${payload.storeId}`);
  const orderRef = storeRef.collection("orders").doc();
  const counterRef = storeRef.collection("counters").doc("orders");
  const now = new Date().toISOString();

  const order = await db.runTransaction(async (transaction) => {
    const storeSnapshot = await transaction.get(storeRef);
    const store = storeSnapshot.data() as { isActive?: boolean; isAcceptingOrders?: boolean } | undefined;

    if (!store?.isActive || (!options.allowPausedStore && !store?.isAcceptingOrders)) {
      throw new HttpsError("failed-precondition", "Loja indisponível para pedidos online.");
    }

    const officialItems = [];

    for (const item of payload.items) {
      const itemSnapshot = await transaction.get(storeRef.collection("menuItems").doc(item.menuItemId));
      const officialItem = itemSnapshot.data();

      if (!officialItem?.isAvailable) {
        throw new HttpsError("failed-precondition", `Item ${item.menuItemId} indisponível.`);
      }

      const selectedOptions = item.selectedOptions.map((selectedOption) => {
        const group = officialItem.optionsGroups?.find((candidate: { id: string }) => candidate.id === selectedOption.groupId);
        const choice = group?.choices?.find((candidate: { id: string }) => candidate.id === selectedOption.choiceId);

        if (!choice?.isAvailable) {
          throw new HttpsError("failed-precondition", `Adicional ${selectedOption.choiceId} indisponível.`);
        }

        return {
          groupId: group.id,
          groupName: group.name,
          choiceId: choice.id,
          choiceName: choice.name,
          price: Number(choice.price),
        };
      });

      const unitPrice = Number(officialItem.price);
      const optionsTotal = selectedOptions.reduce((total, option) => total + option.price, 0);

      officialItems.push({
        menuItemId: item.menuItemId,
        name: officialItem.name,
        unitPrice,
        quantity: item.quantity,
        observation: item.observation,
        selectedOptions,
        lineTotal: (unitPrice + optionsTotal) * item.quantity,
      });
    }

    const counterSnapshot = await transaction.get(counterRef);
    const nextCode = Number(counterSnapshot.data()?.nextCode || 1);
    const subtotal = officialItems.reduce((total, item) => total + item.lineTotal, 0);
    const initialStatus = options.initialStatus || "received";
    const createdOrder = {
      id: orderRef.id,
      storeId: payload.storeId,
      code: String(nextCode).padStart(3, "0"),
      tableId: payload.tableId,
      tableLabel: payload.tableLabel,
      customerName: payload.customerName,
      customerPhone: payload.customerPhone,
      status: initialStatus,
      paymentMethod: payload.paymentMethod,
      paymentStatus: "pending",
      observation: payload.observation,
      items: officialItems,
      subtotal,
      serviceFee: 0,
      total: subtotal,
      trackingEnabled: true,
      createdAt: now,
      updatedAt: now,
      acceptedAt: initialStatus === "accepted" ? now : undefined,
    };

    const sanitizedOrder = removeUndefined(createdOrder);

    transaction.set(orderRef, sanitizedOrder);
    transaction.set(counterRef, { nextCode: nextCode + 1 }, { merge: true });
    transaction.set(db.doc(`orderLookup/${orderRef.id}`), {
      storeId: payload.storeId,
      orderId: orderRef.id,
      createdAt: now,
    });

    return sanitizedOrder;
  });

  return order;
};

export const createOrder = onCall(async (request) => {
  const payload = createOrderSchema.parse(request.data);
  return createOrderRecord(payload);
});

export const createAdminOrder = onCall(async (request) => {
  const payload = createOrderSchema.parse(request.data);
  await assertStoreAdmin(payload.storeId, request.auth);
  return createOrderRecord(payload, { allowPausedStore: true, initialStatus: "accepted" });
});

export const updateOrderStatus = onCall(async (request) => {
  const payload = updateStatusSchema.parse(request.data);
  await assertStoreAdmin(payload.storeId, request.auth);

  const now = new Date().toISOString();
  const timestampField = `${payload.status}At`;
  await db.doc(`stores/${payload.storeId}/orders/${payload.orderId}`).set(
    {
      status: payload.status,
      updatedAt: now,
      [timestampField]: now,
    },
    { merge: true },
  );

  return { ok: true };
});

export const deleteOrder = onCall(async (request) => {
  const payload = deleteOrderSchema.parse(request.data);
  await assertStoreAdmin(payload.storeId, request.auth);

  const batch = db.batch();
  batch.delete(db.doc(`stores/${payload.storeId}/orders/${payload.orderId}`));
  batch.delete(db.doc(`orderLookup/${payload.orderId}`));
  await batch.commit();

  return { ok: true };
});

export const createTable = onCall(async (request) => {
  const payload = createTableSchema.parse(request.data);
  await assertStoreAdmin(payload.storeId, request.auth);

  const now = new Date().toISOString();
  const tableRef = db.collection(`stores/${payload.storeId}/tables`).doc();
  const table = {
    id: tableRef.id,
    label: payload.label,
    code: payload.label.toUpperCase(),
    isActive: true,
    createdAt: now,
  };

  await tableRef.set(removeUndefined(table));
  return table;
});

export const createCategory = onCall(async (request) => {
  const payload = createCategorySchema.parse(request.data);
  await assertStoreAdmin(payload.storeId, request.auth);

  const storeRef = db.doc(`stores/${payload.storeId}`);
  const now = new Date().toISOString();
  const categoryRef = storeRef.collection("categories").doc();
  const lastCategorySnapshot = await storeRef.collection("categories").orderBy("order", "desc").limit(1).get();
  const nextOrder = Number(lastCategorySnapshot.docs[0]?.data().order || 0) + 1;
  const category = {
    id: categoryRef.id,
    storeId: payload.storeId,
    name: payload.name,
    order: nextOrder,
    isActive: true,
  };

  await categoryRef.set(removeUndefined({ ...category, createdAt: now, updatedAt: now }));
  return category;
});

export const createMenuItem = onCall(async (request) => {
  const payload = createMenuItemSchema.parse(request.data);
  await assertStoreAdmin(payload.storeId, request.auth);

  const storeRef = db.doc(`stores/${payload.storeId}`);
  const categorySnapshot = await storeRef.collection("categories").doc(payload.categoryId).get();

  if (!categorySnapshot.exists) {
    throw new HttpsError("failed-precondition", "Categoria não encontrada.");
  }

  const now = new Date().toISOString();
  const itemRef = storeRef.collection("menuItems").doc();
  const lastItemSnapshot = await storeRef.collection("menuItems").orderBy("order", "desc").limit(1).get();
  const nextOrder = Number(lastItemSnapshot.docs[0]?.data().order || 0) + 1;
  const item = {
    id: itemRef.id,
    storeId: payload.storeId,
    categoryId: payload.categoryId,
    name: payload.name,
    description: payload.description || "",
    imageUrl: payload.imageUrl,
    price: payload.price,
    isAvailable: payload.isAvailable,
    order: nextOrder,
    optionsGroups: [],
    createdAt: now,
    updatedAt: now,
  };

  await itemRef.set(removeUndefined(item));
  return removeUndefined(item);
});

export const updateMenuItem = onCall(async (request) => {
  const payload = updateMenuItemSchema.parse(request.data);
  await assertStoreAdmin(payload.storeId, request.auth);

  const storeRef = db.doc(`stores/${payload.storeId}`);
  const categorySnapshot = await storeRef.collection("categories").doc(payload.categoryId).get();

  if (!categorySnapshot.exists) {
    throw new HttpsError("failed-precondition", "Categoria não encontrada.");
  }

  const now = new Date().toISOString();
  const itemRef = storeRef.collection("menuItems").doc(payload.itemId);
  const itemSnapshot = await itemRef.get();

  if (!itemSnapshot.exists) {
    throw new HttpsError("not-found", "Item não encontrado.");
  }

  await itemRef.set(
    removeUndefined({
      categoryId: payload.categoryId,
      name: payload.name,
      description: payload.description || "",
      imageUrl: payload.imageUrl,
      price: payload.price,
      isAvailable: payload.isAvailable,
      updatedAt: now,
    }),
    { merge: true },
  );

  const updatedSnapshot = await itemRef.get();
  return { id: updatedSnapshot.id, ...updatedSnapshot.data() };
});

export const deleteMenuItem = onCall(async (request) => {
  const payload = deleteMenuItemSchema.parse(request.data);
  await assertStoreAdmin(payload.storeId, request.auth);

  await db.doc(`stores/${payload.storeId}/menuItems/${payload.itemId}`).delete();
  return { ok: true };
});

export const updateStoreSettings = onCall(async (request) => {
  const payload = updateStoreSettingsSchema.parse(request.data);
  await assertStoreAdmin(payload.storeId, request.auth);

  const now = new Date().toISOString();
  const batch = db.batch();

  if (payload.store && Object.keys(payload.store).length) {
    batch.set(
      db.doc(`stores/${payload.storeId}`),
      removeUndefined({
        ...payload.store,
        updatedAt: now,
      }),
      { merge: true },
    );
  }

  if (payload.theme && Object.keys(payload.theme).length) {
    batch.set(
      db.doc(`stores/${payload.storeId}/theme/default`),
      removeUndefined({
        ...payload.theme,
        storeId: payload.storeId,
        updatedAt: now,
      }),
      { merge: true },
    );
  }

  await batch.commit();
  return { ok: true };
});

export const generateTableQrCode = onCall(async (request) => {
  const payload = generateQrSchema.parse(request.data);
  await assertStoreAdmin(payload.storeId, request.auth);
  const link = `${payload.publicBaseUrl}/loja/${payload.storeId}/mesa/${payload.tableId}`;
  const qrCodeDataUrl = await QRCode.toDataURL(link, { margin: 1, width: 480 });
  return { link, qrCodeDataUrl };
});
