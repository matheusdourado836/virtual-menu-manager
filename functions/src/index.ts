import * as admin from "firebase-admin";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { error as logError } from "firebase-functions/logger";
import { randomUUID } from "node:crypto";
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
        expectedUnitPrice: z.number().nonnegative().optional(),
        quantity: z.number().int().min(1).max(20),
        observation: nullableOptionalText(300),
        selectedOptions: z.array(
          z.object({
            groupId: z.string().min(1),
            choiceId: z.string().min(1),
            expectedPrice: z.number().nonnegative().optional(),
          }),
        ),
      }),
    )
    .min(1),
});

const parseCreateOrderPayload = (data: unknown) => {
  const result = createOrderSchema.safeParse(data);

  if (!result.success) {
    throw new HttpsError(
      "invalid-argument",
      "Revise os dados e os itens do pedido antes de tentar novamente.",
      {
        validationIssues: result.error.issues.map((issue) => ({
          field: issue.path.join("."),
          code: issue.code,
        })),
      },
    );
  }

  return result.data;
};

const setClaimsSchema = z.object({
  uid: z.string().min(1),
  claims: z.record(z.string(), z.boolean()),
});

const storeSlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(2)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u, "Use apenas letras minúsculas, números e hífens no slug.");

const storeUserIdsSchema = z.array(z.string().trim().min(1)).max(50).transform((userIds) => [...new Set(userIds)]);

const createStoreSchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: storeSlugSchema,
  description: z.string().trim().max(500).default(""),
  phone: optionalTrimmedValue(80),
  address: optionalTrimmedValue(240),
  openingHours: optionalTrimmedValue(240),
  owners: storeUserIdsSchema.refine((userIds) => userIds.length > 0, "Selecione ao menos um proprietário."),
  adminUsers: storeUserIdsSchema.default([]),
  isActive: z.boolean().default(true),
  isAcceptingOrders: z.boolean().default(true),
  estimatedPrepMinutes: z.number().int().min(1).max(240).default(20),
  createStarterData: z.boolean().default(true),
  publicBaseUrl: z.string().url().optional(),
});

const updatePlatformStoreSchema = z.object({
  storeId: z.string().trim().min(1),
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).default(""),
  phone: optionalTrimmedValue(80),
  address: optionalTrimmedValue(240),
  openingHours: optionalTrimmedValue(240),
  owners: storeUserIdsSchema.refine((userIds) => userIds.length > 0, "Selecione ao menos um proprietário."),
  adminUsers: storeUserIdsSchema.default([]),
  isActive: z.boolean(),
  isAcceptingOrders: z.boolean(),
  estimatedPrepMinutes: z.number().int().min(1).max(240),
});

const createPlatformUserSchema = z.object({
  email: z.email().trim().toLowerCase(),
  displayName: z.string().trim().min(2).max(120),
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

const assertKnownUsers = async (userIds: string[]) => {
  const uniqueUserIds = [...new Set(userIds)];

  if (uniqueUserIds.length === 0) {
    return;
  }

  const result = await admin.auth().getUsers(uniqueUserIds.map((uid) => ({ uid })));

  if (result.notFound.length > 0) {
    throw new HttpsError("failed-precondition", "Um ou mais usuários selecionados não existem no Firebase Auth.");
  }

  if (result.users.some((user) => user.disabled)) {
    throw new HttpsError("failed-precondition", "Uma ou mais contas selecionadas estão desativadas.");
  }
};

const platformStoreFields = (storeId: string, data: admin.firestore.DocumentData) => ({
  id: storeId,
  name: String(data.name || ""),
  slug: String(data.slug || ""),
  description: String(data.description || ""),
  phone: String(data.phone || ""),
  address: String(data.address || ""),
  openingHours: String(data.openingHours || ""),
  owners: Array.isArray(data.owners) ? data.owners.filter((uid): uid is string => typeof uid === "string") : [],
  adminUsers: Array.isArray(data.adminUsers)
    ? data.adminUsers.filter((uid): uid is string => typeof uid === "string")
    : [],
  isActive: data.isActive === true,
  isAcceptingOrders: data.isAcceptingOrders === true,
  estimatedPrepMinutes: Number(data.estimatedPrepMinutes || 20),
  createdAt: String(data.createdAt || ""),
  updatedAt: String(data.updatedAt || ""),
});

const managedStoreFields = (
  storeId: string,
  data: admin.firestore.DocumentData,
  userId: string,
) => {
  const store = platformStoreFields(storeId, data);
  const accessRole: "owner" | "admin" | "platformAdmin" = store.owners.includes(userId)
    ? "owner"
    : store.adminUsers.includes(userId)
      ? "admin"
      : "platformAdmin";

  return {
    id: store.id,
    name: store.name,
    slug: store.slug,
    description: store.description,
    isActive: store.isActive,
    isAcceptingOrders: store.isAcceptingOrders,
    accessRole,
  };
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

export const listPlatformStores = onCall(async (request) => {
  assertPlatformAdmin(request.auth);
  const snapshot = await db.collection("stores").get();
  const stores = snapshot.docs.map((document) => platformStoreFields(document.id, document.data()));

  stores.sort((first, second) => (first.name || first.slug).localeCompare(second.name || second.slug, "pt-BR"));
  return { stores };
});

export const listManagedStores = onCall(async (request) => {
  const userId = request.auth?.uid;

  if (!userId) {
    throw new HttpsError("unauthenticated", "Autenticação obrigatória.");
  }

  const isPlatformAdmin = request.auth?.token?.platformAdmin === true;
  const documents = new Map<string, admin.firestore.QueryDocumentSnapshot>();

  if (isPlatformAdmin) {
    const snapshot = await db.collection("stores").get();
    snapshot.docs.forEach((document) => documents.set(document.id, document));
  } else {
    const [ownerSnapshot, adminSnapshot] = await Promise.all([
      db.collection("stores").where("owners", "array-contains", userId).get(),
      db.collection("stores").where("adminUsers", "array-contains", userId).get(),
    ]);

    [...ownerSnapshot.docs, ...adminSnapshot.docs].forEach((document) => {
      documents.set(document.id, document);
    });
  }

  const accessPriority = { owner: 0, admin: 1, platformAdmin: 2 } as const;
  const stores = [...documents.values()]
    .map((document) => managedStoreFields(document.id, document.data(), userId))
    .filter((store) => Boolean(store.slug))
    .sort((first, second) => {
      const accessDifference = accessPriority[first.accessRole] - accessPriority[second.accessRole];
      return accessDifference || first.name.localeCompare(second.name, "pt-BR");
    });

  return { stores };
});

export const listPlatformUsers = onCall(async (request) => {
  assertPlatformAdmin(request.auth);
  const users: Array<{ uid: string; email: string; displayName: string; disabled: boolean }> = [];
  let pageToken: string | undefined;

  do {
    const result = await admin.auth().listUsers(1000, pageToken);
    users.push(
      ...result.users.map((user) => ({
        uid: user.uid,
        email: user.email || "",
        displayName: user.displayName || "",
        disabled: user.disabled,
      })),
    );
    pageToken = result.pageToken;
  } while (pageToken);

  users.sort((first, second) =>
    (first.displayName || first.email || first.uid).localeCompare(
      second.displayName || second.email || second.uid,
      "pt-BR",
    ),
  );

  return { users };
});

export const createPlatformUser = onCall(async (request) => {
  assertPlatformAdmin(request.auth);
  const payload = createPlatformUserSchema.parse(request.data);
  let user: admin.auth.UserRecord;
  let isNewUser = false;

  try {
    user = await admin.auth().getUserByEmail(payload.email);
  } catch (caughtError) {
    if ((caughtError as { code?: string }).code !== "auth/user-not-found") {
      throw caughtError;
    }

    user = await admin.auth().createUser({
      email: payload.email,
      displayName: payload.displayName,
      emailVerified: false,
      disabled: false,
    });
    isNewUser = true;
  }

  if (user.disabled) {
    throw new HttpsError("failed-precondition", "Essa conta existe, mas está desativada no Firebase Auth.");
  }

  return {
    user: {
      uid: user.uid,
      email: user.email || payload.email,
      displayName: user.displayName || payload.displayName,
      disabled: user.disabled,
    },
    isNewUser,
  };
});

export const createStore = onCall(async (request) => {
  assertPlatformAdmin(request.auth);
  const payload = createStoreSchema.parse(request.data);
  await assertKnownUsers([...payload.owners, ...payload.adminUsers]);

  const duplicateSlugSnapshot = await db.collection("stores").where("slug", "==", payload.slug).limit(1).get();

  if (!duplicateSlugSnapshot.empty) {
    throw new HttpsError("already-exists", "Já existe um restaurante usando este slug.");
  }

  const now = new Date().toISOString();
  const storeRef = db.collection("stores").doc();
  const slugReservationRef = db.collection("storeSlugs").doc(payload.slug);
  const themeRef = storeRef.collection("theme").doc("default");
  const publicBaseUrl = payload.publicBaseUrl?.replace(/\/$/u, "");

  const store = {
    name: payload.name,
    slug: payload.slug,
    description: payload.description,
    phone: payload.phone,
    address: payload.address,
    openingHours: payload.openingHours,
    owners: payload.owners,
    adminUsers: payload.adminUsers.filter((uid) => !payload.owners.includes(uid)),
    isActive: payload.isActive,
    isAcceptingOrders: payload.isActive && payload.isAcceptingOrders,
    pausedMessage: "Pedidos online pausados no momento.",
    estimatedPrepMinutes: payload.estimatedPrepMinutes,
    createdAt: now,
    updatedAt: now,
  };

  await db.runTransaction(async (transaction) => {
    const reservationSnapshot = await transaction.get(slugReservationRef);

    if (reservationSnapshot.exists) {
      throw new HttpsError("already-exists", "Já existe um restaurante usando este slug.");
    }

    transaction.set(slugReservationRef, {
      storeId: storeRef.id,
      slug: payload.slug,
      createdAt: now,
    });
    transaction.set(storeRef, removeUndefined(store));
    transaction.set(themeRef, {
      id: "default",
      storeId: storeRef.id,
      primaryColor: "#8a1020",
      secondaryColor: "#1b7f79",
      accentColor: "#f2b84b",
      backgroundColor: "#f8f4ed",
      surfaceColor: "#fffdf8",
      textColor: "#261f1c",
      mutedTextColor: "#685d56",
      borderColor: "#e6ded2",
      fontFamily: "var(--font-geist-sans)",
      borderRadius: 8,
      logoUrl: "/placeholder-logo.svg",
      bannerUrl: "/placeholder-banner.svg",
      visualStyle: "warm-quick-service",
      updatedAt: now,
    });

    if (payload.createStarterData) {
      transaction.set(storeRef.collection("tables").doc("balcao"), removeUndefined({
        id: "balcao",
        label: "Balcão",
        code: "BALCAO",
        qrCodeUrl: publicBaseUrl ? `${publicBaseUrl}/loja/${payload.slug}/mesa/balcao` : undefined,
        isActive: true,
        createdAt: now,
      }));
      transaction.set(storeRef.collection("categories").doc("pratos"), {
        id: "pratos",
        storeId: storeRef.id,
        name: "Pratos",
        order: 1,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      });
      transaction.set(storeRef.collection("categories").doc("bebidas"), {
        id: "bebidas",
        storeId: storeRef.id,
        name: "Bebidas",
        order: 2,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      });
    }
  });

  return { store: platformStoreFields(storeRef.id, store) };
});

export const updatePlatformStore = onCall(async (request) => {
  assertPlatformAdmin(request.auth);
  const payload = updatePlatformStoreSchema.parse(request.data);
  await assertKnownUsers([...payload.owners, ...payload.adminUsers]);

  const storeRef = db.collection("stores").doc(payload.storeId);
  const storeSnapshot = await storeRef.get();

  if (!storeSnapshot.exists) {
    throw new HttpsError("not-found", "Restaurante não encontrado.");
  }

  const updatedAt = new Date().toISOString();
  const update = removeUndefined({
    name: payload.name,
    description: payload.description,
    phone: payload.phone,
    address: payload.address,
    openingHours: payload.openingHours,
    owners: payload.owners,
    adminUsers: payload.adminUsers.filter((uid) => !payload.owners.includes(uid)),
    isActive: payload.isActive,
    isAcceptingOrders: payload.isActive && payload.isAcceptingOrders,
    estimatedPrepMinutes: payload.estimatedPrepMinutes,
    updatedAt,
  });

  await storeRef.set(update, { merge: true });
  return {
    store: platformStoreFields(payload.storeId, {
      ...storeSnapshot.data(),
      ...update,
    }),
  };
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

interface OrderPreconditionDetails {
  reason: string;
  itemId?: string;
  itemName?: string;
  groupId?: string;
  groupName?: string;
  choiceId?: string;
  choiceName?: string;
  previousPrice?: number;
  currentPrice?: number;
}

const orderPreconditionError = (userMessage: string, details: OrderPreconditionDetails) =>
  new HttpsError("failed-precondition", userMessage, {
    ...details,
    userMessage,
  });

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
      throw orderPreconditionError("Esta loja não está disponível para pedidos online.", {
        reason: "store_unavailable",
      });
    }

    if (!options.allowPausedStore) {
      if (!store.isAcceptingOrders) {
        throw orderPreconditionError(store.pausedMessage || "A loja está fechada no momento.", {
          reason: "store_paused",
        });
      }

      if (!isWithinOpeningHours(store.openingHours, nowDate)) {
        throw orderPreconditionError(
          "A loja está fechada no momento. Tente novamente dentro do horário de funcionamento.",
          { reason: "store_closed" },
        );
      }
    }

    let tableId: string | undefined;
    let tableLabel: string | undefined;

    if (payload.tableId) {
      const tableSnapshot = await transaction.get(storeRef.collection("tables").doc(payload.tableId));
      const table = tableSnapshot.data() as TableAvailability | undefined;

      if (!tableSnapshot.exists || !table?.isActive) {
        throw orderPreconditionError("Esta mesa não está mais disponível para receber pedidos.", {
          reason: "table_unavailable",
        });
      }

      tableId = tableSnapshot.id;
      tableLabel = table.label || "Mesa";
    }

    const customerName = tableLabel || payload.customerName?.trim();

    if (!customerName || customerName.length < 2) {
      throw orderPreconditionError("Informe seu nome para identificar o pedido.", {
        reason: "customer_name_required",
      });
    }

    const officialItems = [];

    for (const item of payload.items) {
      const itemSnapshot = await transaction.get(storeRef.collection("menuItems").doc(item.menuItemId));
      const officialItem = itemSnapshot.data() as
        | (z.infer<typeof menuItemFieldsSchema> & { name: string })
        | undefined;

      if (!officialItem?.isAvailable) {
        const itemName = officialItem?.name?.trim();
        const userMessage = itemName
          ? `O item ${itemName} não está mais disponível. Remova-o do carrinho para continuar.`
          : "Um item do seu pedido não está mais disponível. Remova-o do carrinho para continuar.";

        throw orderPreconditionError(userMessage, {
          reason: "item_unavailable",
          itemId: item.menuItemId,
          itemName,
        });
      }

      const officialUnitPrice = Number(officialItem.price);

      if (
        item.expectedUnitPrice !== undefined
        && Math.round(item.expectedUnitPrice * 100) !== Math.round(officialUnitPrice * 100)
      ) {
        throw orderPreconditionError(`O preço de ${officialItem.name} foi atualizado.`, {
          reason: "item_price_changed",
          itemId: item.menuItemId,
          itemName: officialItem.name,
          previousPrice: item.expectedUnitPrice,
          currentPrice: officialUnitPrice,
        });
      }

      const selectedOptionKeys = new Set<string>();
      const selectedOptions = item.selectedOptions.map((selectedOption) => {
        const group = officialItem.optionsGroups.find((candidate) => candidate.id === selectedOption.groupId);

        if (!group) {
          throw orderPreconditionError(
            `As opções de ${officialItem.name} foram atualizadas. Revise esse item antes de continuar.`,
            {
              reason: "options_group_changed",
              itemId: item.menuItemId,
              itemName: officialItem.name,
              groupId: selectedOption.groupId,
            },
          );
        }

        const choice = group.choices.find((candidate) => candidate.id === selectedOption.choiceId);

        if (!choice) {
          throw orderPreconditionError(
            `Um adicional de ${officialItem.name} não está mais disponível. Revise esse item antes de continuar.`,
            {
              reason: "additional_removed",
              itemId: item.menuItemId,
              itemName: officialItem.name,
              groupId: group.id,
              choiceId: selectedOption.choiceId,
            },
          );
        }

        if (!choice.isAvailable) {
          throw orderPreconditionError(`O adicional ${choice.name} não está mais disponível.`, {
            reason: "additional_unavailable",
            itemId: item.menuItemId,
            itemName: officialItem.name,
            groupId: group.id,
            choiceId: choice.id,
            choiceName: choice.name,
          });
        }

        const officialChoicePrice = Number(choice.price);

        if (
          selectedOption.expectedPrice !== undefined
          && Math.round(selectedOption.expectedPrice * 100) !== Math.round(officialChoicePrice * 100)
        ) {
          throw orderPreconditionError(`O preço do adicional ${choice.name} foi atualizado.`, {
            reason: "additional_price_changed",
            itemId: item.menuItemId,
            itemName: officialItem.name,
            groupId: group.id,
            groupName: group.name,
            choiceId: choice.id,
            choiceName: choice.name,
            previousPrice: selectedOption.expectedPrice,
            currentPrice: officialChoicePrice,
          });
        }

        const selectedOptionKey = `${group.id}:${choice.id}`;

        if (selectedOptionKeys.has(selectedOptionKey)) {
          throw orderPreconditionError(
            `O adicional ${choice.name} está duplicado em ${officialItem.name}. Revise esse item antes de continuar.`,
            {
              reason: "options_invalid",
              itemId: item.menuItemId,
              itemName: officialItem.name,
              groupId: group.id,
              groupName: group.name,
              choiceId: choice.id,
              choiceName: choice.name,
            },
          );
        }

        selectedOptionKeys.add(selectedOptionKey);

        return {
          groupId: group.id,
          groupName: group.name,
          choiceId: choice.id,
          choiceName: choice.name,
          price: Number(choice.price),
        };
      });

      for (const group of officialItem.optionsGroups) {
        const selectedCount = selectedOptions.filter((option) => option.groupId === group.id).length;
        const minimumRequired = Math.max(Number(group.minSelected) || 0, group.isRequired ? 1 : 0);
        const maximumAllowed = Math.max(0, Number(group.maxSelected) || 0);

        if (selectedCount < minimumRequired) {
          const selectionLabel = minimumRequired === 1 ? "uma opção" : `${minimumRequired} opções`;

          throw orderPreconditionError(
            `${officialItem.name} precisa de ${selectionLabel} em ${group.name}. Personalize o item novamente.`,
            {
              reason: "required_options_missing",
              itemId: item.menuItemId,
              itemName: officialItem.name,
              groupId: group.id,
              groupName: group.name,
            },
          );
        }

        if (selectedCount > maximumAllowed) {
          const selectionLabel = maximumAllowed === 1 ? "uma opção" : `${maximumAllowed} opções`;

          throw orderPreconditionError(
            `${officialItem.name} permite no máximo ${selectionLabel} em ${group.name}. Personalize o item novamente.`,
            {
              reason: "options_limit_exceeded",
              itemId: item.menuItemId,
              itemName: officialItem.name,
              groupId: group.id,
              groupName: group.name,
            },
          );
        }
      }

      const unitPrice = officialUnitPrice;
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

const createOrderWithDiagnostics = async (
  payload: z.infer<typeof createOrderSchema>,
  options: CreateOrderOptions = {},
) => {
  try {
    return await createOrderRecord(payload, options);
  } catch (error) {
    if (error instanceof HttpsError) {
      throw error;
    }

    const supportCode = randomUUID().slice(0, 8).toUpperCase();
    const serializedError = error instanceof Error
      ? { name: error.name, message: error.message, stack: error.stack }
      : { message: String(error) };

    logError("Falha inesperada ao registrar pedido.", {
      supportCode,
      storeId: payload.storeId,
      tableId: payload.tableId || null,
      itemIds: payload.items.map((item) => item.menuItemId),
      unitsCount: payload.items.reduce((total, item) => total + item.quantity, 0),
      error: serializedError,
    });

    throw new HttpsError(
      "internal",
      "Não foi possível registrar o pedido. Tente novamente e, se o problema continuar, informe o código de suporte.",
      { supportCode },
    );
  }
};

export const createOrder = onCall(async (request) => {
  const payload = parseCreateOrderPayload(request.data);
  return createOrderWithDiagnostics(payload);
});

export const createAdminOrder = onCall(async (request) => {
  const payload = parseCreateOrderPayload(request.data);
  await assertStoreAdmin(payload.storeId, request.auth);
  return createOrderWithDiagnostics(payload, { allowPausedStore: true, initialStatus: "accepted" });
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
