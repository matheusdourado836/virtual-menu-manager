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

const storeTimezone = "America/Sao_Paulo";
const weekdayLabelByShortName: Record<string, string> = {
  Sun: "Dom",
  Mon: "Seg",
  Tue: "Ter",
  Wed: "Qua",
  Thu: "Qui",
  Fri: "Sex",
  Sat: "Sáb",
};

interface OpeningEntry {
  dayLabel: string;
  opensAt: number;
  closesAt: number;
}

interface StoreAvailability {
  isActive?: boolean;
  isAcceptingOrders?: boolean;
  openingHours?: string;
  pausedMessage?: string;
}

interface TableAvailability {
  label?: string;
  isActive?: boolean;
}

const timeToMinutes = (value: string) => {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
};

const parseOpeningHours = (openingHours?: string): OpeningEntry[] => {
  if (!openingHours || openingHours.trim() === "Fechado") {
    return [];
  }

  return openingHours
    .split(",")
    .map((rawPart) => {
      const match = rawPart.trim().match(/^(Seg|Ter|Qua|Qui|Sex|Sáb|Dom)\s+(\d{2}:\d{2})-(\d{2}:\d{2})$/u);

      if (!match) {
        return null;
      }

      const [, dayLabel, opensAt, closesAt] = match;

      return {
        dayLabel,
        opensAt: timeToMinutes(opensAt),
        closesAt: timeToMinutes(closesAt),
      };
    })
    .filter((entry): entry is OpeningEntry => Boolean(entry));
};

const getZonedDayAndMinutes = (date: Date) => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: storeTimezone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const weekday = parts.find((part) => part.type === "weekday")?.value || "";
  const hour = Number(parts.find((part) => part.type === "hour")?.value || 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value || 0);

  return {
    dayLabel: weekdayLabelByShortName[weekday] || "",
    minutes: hour * 60 + minute,
  };
};

const isWithinOpeningHours = (openingHours: string | undefined, date: Date) => {
  const entries = parseOpeningHours(openingHours);
  const current = getZonedDayAndMinutes(date);
  const today = entries.find((entry) => entry.dayLabel === current.dayLabel);

  return Boolean(today && current.minutes >= today.opensAt && current.minutes < today.closesAt);
};

const orderStatusSchema = z.enum(["received", "accepted", "preparing", "ready", "delivered", "cancelled"]);

const createOrderSchema = z.object({
  storeId: z.string().min(1),
  tableId: nullableOptionalString,
  tableLabel: nullableOptionalString,
  customerName: nullableOptionalText(120),
  customerPhone: nullableOptionalString,
  paymentMethod: z.enum(["pay_on_pickup", "pix_on_pickup", "card_on_pickup", "cash_on_pickup"]),
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

const finalizeConfirmedOrdersSchema = z
  .object({
    storeId: z.string().min(1),
    orderIds: z.array(z.string().trim().min(1)).min(1).max(500),
  })
  .superRefine((payload, context) => {
    if (new Set(payload.orderIds).size !== payload.orderIds.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["orderIds"],
        message: "A lista de pedidos não pode conter ids duplicados.",
      });
    }
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

const updateTableSchema = z.object({
  storeId: z.string().min(1),
  tableId: z.string().min(1),
  isActive: z.boolean(),
});

const createCategorySchema = z.object({
  storeId: z.string().min(1),
  name: z.string().trim().min(2).max(80),
});

const optionChoiceSchema = z.object({
  id: z.string().trim().min(1).max(120),
  name: z.string().trim().min(2).max(120),
  price: z.number().min(0).max(99999),
  isAvailable: z.boolean().default(true),
});

const optionGroupSchema = z.object({
  id: z.string().trim().min(1).max(120),
  name: z.string().trim().min(2).max(120),
  minSelected: z.number().int().min(0).max(99),
  maxSelected: z.number().int().min(0).max(99),
  choices: z.array(optionChoiceSchema).max(100),
  isRequired: z.boolean().default(false),
});

const menuItemFieldsSchema = z.object({
  categoryId: z.string().min(1),
  name: z.string().trim().min(2).max(120),
  description: optionalTrimmedValue(500),
  imageUrl: optionalTrimmedValue(500),
  price: z.number().min(0).max(99999),
  isAvailable: z.boolean().default(true),
  optionsGroups: z.array(optionGroupSchema).max(20),
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

const additionalFieldsSchema = z.object({
  name: z.string().trim().min(2).max(120),
  price: z.number().min(0).max(99999),
  isAvailable: z.boolean().default(true),
});

const createAdditionalSchema = additionalFieldsSchema.extend({
  storeId: z.string().min(1),
});

const updateAdditionalSchema = additionalFieldsSchema.extend({
  storeId: z.string().min(1),
  additionalId: z.string().min(1),
});

const reorderAdditionalsSchema = z
  .object({
    storeId: z.string().min(1),
    additionalIds: z.array(z.string().trim().min(1)).min(1).max(500),
  })
  .superRefine((payload, context) => {
    if (new Set(payload.additionalIds).size !== payload.additionalIds.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["additionalIds"],
        message: "A lista de adicionais não pode conter ids duplicados.",
      });
    }
  });

const deleteAdditionalSchema = z.object({
  storeId: z.string().min(1),
  additionalId: z.string().min(1),
});

const updateStoreSettingsSchema = z.object({
  storeId: z.string().min(1),
  store: z
    .object({
      name: z.string().trim().min(2).max(120).optional(),
      description: z.string().trim().max(500).optional(),
      phone: optionalTrimmedValue(80),
      address: optionalTrimmedValue(240),
      googleReviewUrl: optionalTrimmedValue(500).refine(
        (value) => !value || /^https:\/\/.+/u.test(value),
        "Informe uma URL HTTPS para avaliações do Google.",
      ),
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

const submitOrderFeedbackSchema = z.object({
  orderId: z.string().trim().min(1),
  rating: z.number().int().min(1).max(5),
  comment: optionalTrimmedValue(500),
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
  const [themeSnapshot, tableSnapshot, categorySnapshot, additionalSnapshot, itemSnapshot] = await Promise.all([
    storeRef.collection("theme").doc("default").get(),
    storeRef.collection("tables").orderBy("label", "asc").get(),
    storeRef.collection("categories").orderBy("order", "asc").get(),
    storeRef.collection("additionals").orderBy("order", "asc").get(),
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
    additionals: additionalSnapshot.docs.map(mapDocument),
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
  const nowDate = new Date();
  const now = nowDate.toISOString();

  const order = await db.runTransaction(async (transaction) => {
    const storeSnapshot = await transaction.get(storeRef);
    const store = storeSnapshot.data() as StoreAvailability | undefined;

    if (!store?.isActive) {
      throw new HttpsError("failed-precondition", "Loja indisponível para pedidos online.");
    }

    if (!options.allowPausedStore) {
      if (!store.isAcceptingOrders) {
        throw new HttpsError(
          "failed-precondition",
          store.pausedMessage || "A loja está fechada no momento.",
        );
      }

      if (!isWithinOpeningHours(store.openingHours, nowDate)) {
        throw new HttpsError(
          "failed-precondition",
          "A loja está fechada no momento. Tente novamente dentro do horário de funcionamento.",
        );
      }
    }

    let tableId: string | undefined;
    let tableLabel: string | undefined;

    if (payload.tableId) {
      const tableSnapshot = await transaction.get(storeRef.collection("tables").doc(payload.tableId));
      const table = tableSnapshot.data() as TableAvailability | undefined;

      if (!tableSnapshot.exists || !table?.isActive) {
        throw new HttpsError("failed-precondition", "Mesa não encontrada ou inativa.");
      }

      tableId = tableSnapshot.id;
      tableLabel = table.label || "Mesa";
    }

    const customerName = tableLabel || payload.customerName?.trim();

    if (!customerName || customerName.length < 2) {
      throw new HttpsError("failed-precondition", "Informe seu nome para identificar o pedido.");
    }

    const officialItems = [];

    for (const item of payload.items) {
      const itemSnapshot = await transaction.get(storeRef.collection("menuItems").doc(item.menuItemId));
      const officialItem = itemSnapshot.data() as
        | (z.infer<typeof menuItemFieldsSchema> & { name: string })
        | undefined;

      if (!officialItem?.isAvailable) {
        throw new HttpsError("failed-precondition", `Item ${item.menuItemId} indisponível.`);
      }

      const selectedOptions = item.selectedOptions.map((selectedOption) => {
        const group = officialItem.optionsGroups.find((candidate) => candidate.id === selectedOption.groupId);

        if (!group) {
          throw new HttpsError("failed-precondition", `Grupo ${selectedOption.groupId} inválido.`);
        }

        const choice = group.choices.find((candidate) => candidate.id === selectedOption.choiceId);

        if (!choice || !choice.isAvailable) {
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
      tableId,
      tableLabel,
      customerName,
      customerPhone: tableId ? undefined : payload.customerPhone,
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

export const finalizeConfirmedOrders = onCall(async (request) => {
  const payload = finalizeConfirmedOrdersSchema.parse(request.data);
  await assertStoreAdmin(payload.storeId, request.auth);

  const now = new Date().toISOString();
  const finalizableStatuses = new Set(["accepted", "preparing", "ready"]);
  const orderRefs = payload.orderIds.map((orderId) => db.doc(`stores/${payload.storeId}/orders/${orderId}`));
  const orderSnapshots = await db.getAll(...orderRefs);
  const batch = db.batch();
  let updatedCount = 0;

  orderSnapshots.forEach((orderSnapshot) => {
    const status = orderSnapshot.data()?.status;

    if (!orderSnapshot.exists || !finalizableStatuses.has(status)) {
      return;
    }

    updatedCount += 1;
    batch.set(
      orderSnapshot.ref,
      {
        status: "delivered",
        updatedAt: now,
        deliveredAt: now,
      },
      { merge: true },
    );
  });

  if (updatedCount > 0) {
    await batch.commit();
  }

  return { ok: true, updatedCount };
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

export const updateTable = onCall(async (request) => {
  const payload = updateTableSchema.parse(request.data);
  await assertStoreAdmin(payload.storeId, request.auth);

  const now = new Date().toISOString();
  const tableRef = db.collection(`stores/${payload.storeId}/tables`).doc(payload.tableId);
  const tableSnapshot = await tableRef.get();

  if (!tableSnapshot.exists) {
    throw new HttpsError("not-found", "Mesa não encontrada.");
  }

  await tableRef.set(
    {
      isActive: payload.isActive,
      updatedAt: now,
    },
    { merge: true },
  );

  const updatedSnapshot = await tableRef.get();
  return mapDocument(updatedSnapshot);
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

const getNextOrder = async (collectionRef: admin.firestore.CollectionReference) => {
  const lastSnapshot = await collectionRef.orderBy("order", "desc").limit(1).get();
  return Number(lastSnapshot.docs[0]?.data().order || 0) + 1;
};

const updateEmbeddedAdditionalChoices = async (
  storeId: string,
  additionalId: string,
  updater: (choices: z.infer<typeof optionChoiceSchema>[]) => z.infer<typeof optionChoiceSchema>[],
) => {
  const itemSnapshot = await db.collection(`stores/${storeId}/menuItems`).get();
  const batch = db.batch();
  const now = new Date().toISOString();
  let hasChanges = false;

  itemSnapshot.docs.forEach((itemDocument) => {
    const data = itemDocument.data() as { optionsGroups: z.infer<typeof optionGroupSchema>[] };
    const groups = data.optionsGroups;
    let itemChanged = false;
    const nextGroups = groups
      .map((group) => {
        const hasAdditional = group.choices.some((choice) => choice.id === additionalId);

        if (!hasAdditional) {
          return group;
        }

        itemChanged = true;
        return {
          ...group,
          choices: updater(group.choices),
        };
      })
      .filter((group) => group.choices.length > 0);

    if (itemChanged) {
      hasChanges = true;
      batch.set(itemDocument.ref, { optionsGroups: nextGroups, updatedAt: now }, { merge: true });
    }
  });

  if (hasChanges) {
    await batch.commit();
  }
};

export const createAdditional = onCall(async (request) => {
  const payload = createAdditionalSchema.parse(request.data);
  await assertStoreAdmin(payload.storeId, request.auth);

  const now = new Date().toISOString();
  const additionalRef = db.collection(`stores/${payload.storeId}/additionals`).doc();
  const additional = {
    id: additionalRef.id,
    storeId: payload.storeId,
    name: payload.name,
    price: payload.price,
    isAvailable: payload.isAvailable,
    order: await getNextOrder(db.collection(`stores/${payload.storeId}/additionals`)),
    createdAt: now,
    updatedAt: now,
  };

  await additionalRef.set(removeUndefined(additional));
  return additional;
});

export const updateAdditional = onCall(async (request) => {
  const payload = updateAdditionalSchema.parse(request.data);
  await assertStoreAdmin(payload.storeId, request.auth);

  const additionalRef = db.doc(`stores/${payload.storeId}/additionals/${payload.additionalId}`);
  const additionalSnapshot = await additionalRef.get();
  const now = new Date().toISOString();
  const order =
    Number(additionalSnapshot.data()?.order || 0) ||
    (await getNextOrder(db.collection(`stores/${payload.storeId}/additionals`)));
  const createdAt = additionalSnapshot.data()?.createdAt || now;
  const additional = {
    id: payload.additionalId,
    storeId: payload.storeId,
    name: payload.name,
    price: payload.price,
    isAvailable: payload.isAvailable,
    order,
    createdAt,
    updatedAt: now,
  };

  await additionalRef.set(removeUndefined(additional), { merge: true });
  await updateEmbeddedAdditionalChoices(payload.storeId, payload.additionalId, (choices) =>
    choices.map((choice) =>
      choice.id === payload.additionalId
        ? {
            ...choice,
            name: payload.name,
            price: payload.price,
            isAvailable: payload.isAvailable,
          }
        : choice,
    ),
  );

  return additional;
});

export const reorderAdditionals = onCall(async (request) => {
  const payload = reorderAdditionalsSchema.parse(request.data);
  await assertStoreAdmin(payload.storeId, request.auth);

  const now = new Date().toISOString();
  const collectionRef = db.collection(`stores/${payload.storeId}/additionals`);
  const snapshot = await collectionRef.get();
  const additionalById = new Map(snapshot.docs.map((document) => [document.id, document]));
  const unknownAdditionalId = payload.additionalIds.find((additionalId) => !additionalById.has(additionalId));

  if (unknownAdditionalId) {
    throw new HttpsError("not-found", `Adicional ${unknownAdditionalId} não encontrado.`);
  }

  const requestedIds = new Set(payload.additionalIds);
  const remainingIds = snapshot.docs
    .filter((document) => !requestedIds.has(document.id))
    .sort((first, second) => {
      const firstOrder = Number(first.data().order || 0);
      const secondOrder = Number(second.data().order || 0);
      return firstOrder - secondOrder || String(first.data().name || "").localeCompare(String(second.data().name || ""));
    })
    .map((document) => document.id);
  const orderedIds = [...payload.additionalIds, ...remainingIds];
  const batch = db.batch();

  orderedIds.forEach((additionalId, index) => {
    const additionalDocument = additionalById.get(additionalId);

    if (additionalDocument) {
      batch.update(additionalDocument.ref, {
        order: index + 1,
        updatedAt: now,
      });
    }
  });

  await batch.commit();
  return { ok: true };
});

export const deleteAdditional = onCall(async (request) => {
  const payload = deleteAdditionalSchema.parse(request.data);
  await assertStoreAdmin(payload.storeId, request.auth);

  await db.doc(`stores/${payload.storeId}/additionals/${payload.additionalId}`).delete();
  await updateEmbeddedAdditionalChoices(payload.storeId, payload.additionalId, (choices) =>
    choices.filter((choice) => choice.id !== payload.additionalId),
  );

  return { ok: true };
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
    description: payload.description,
    imageUrl: payload.imageUrl,
    price: payload.price,
    isAvailable: payload.isAvailable,
    order: nextOrder,
    optionsGroups: payload.optionsGroups,
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
      description: payload.description,
      imageUrl: payload.imageUrl,
      price: payload.price,
      isAvailable: payload.isAvailable,
      optionsGroups: payload.optionsGroups,
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

export const submitOrderFeedback = onCall(async (request) => {
  const payload = submitOrderFeedbackSchema.parse(request.data);
  const lookupSnapshot = await db.doc(`orderLookup/${payload.orderId}`).get();
  const lookup = lookupSnapshot.data() as { storeId?: string; orderId?: string } | undefined;

  if (!lookup?.storeId || !lookup.orderId) {
    throw new HttpsError("not-found", "Pedido não encontrado para avaliação.");
  }

  const orderRef = db.doc(`stores/${lookup.storeId}/orders/${lookup.orderId}`);
  const feedbackRef = db.doc(`stores/${lookup.storeId}/feedbacks/${lookup.orderId}`);
  const now = new Date().toISOString();

  const result = await db.runTransaction(async (transaction) => {
    const [orderSnapshot, feedbackSnapshot] = await Promise.all([
      transaction.get(orderRef),
      transaction.get(feedbackRef),
    ]);

    if (feedbackSnapshot.exists) {
      return { ok: true as const, feedbackId: feedbackRef.id, alreadySubmitted: true };
    }

    const order = orderSnapshot.data() as
      | {
          code?: string;
          customerName?: string;
          tableLabel?: string;
          status?: string;
        }
      | undefined;

    if (!orderSnapshot.exists || !order) {
      throw new HttpsError("not-found", "Pedido não encontrado para avaliação.");
    }

    if (order.status !== "delivered") {
      throw new HttpsError("failed-precondition", "A avaliação só fica disponível após a finalização do pedido.");
    }

    transaction.set(feedbackRef, removeUndefined({
      id: feedbackRef.id,
      storeId: lookup.storeId,
      orderId: lookup.orderId,
      orderCode: order.code || "",
      customerName: order.customerName || "",
      tableLabel: order.tableLabel,
      rating: payload.rating,
      comment: payload.comment || undefined,
      source: "internal",
      createdAt: now,
    }));

    return { ok: true as const, feedbackId: feedbackRef.id };
  });

  return result;
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
