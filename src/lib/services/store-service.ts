import { collection, doc, getDoc, getDocs, limit, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { deleteObject, getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { firebaseFunctions, firebaseStorage, firestore } from "@/lib/firebase/client";
import { createOrderSchema, type CreateOrderPayload } from "@/lib/validators/order";
import type {
  Additional,
  Category,
  MenuItem,
  OptionGroup,
  Order,
  OrderStatus,
  Store,
  StoreBundle,
  StoreFeedback,
  StoreTheme,
  Table,
} from "@/types/menu";

export interface MenuItemInput {
  categoryId: string;
  name: string;
  description?: string;
  imageUrl?: string;
  price: number;
  isAvailable: boolean;
  optionsGroups: OptionGroup[];
}

export interface AdditionalInput {
  name: string;
  price: number;
  isAvailable: boolean;
}

export interface StoreSettingsPayload {
  store?: Partial<
    Pick<
      Store,
      | "name"
      | "description"
      | "phone"
      | "address"
      | "googleReviewUrl"
      | "openingHours"
      | "isActive"
      | "isAcceptingOrders"
      | "pausedMessage"
      | "estimatedPrepMinutes"
    >
  >;
  theme?: Partial<
    Pick<
      StoreTheme,
      | "primaryColor"
      | "secondaryColor"
      | "accentColor"
      | "backgroundColor"
      | "surfaceColor"
      | "textColor"
      | "mutedTextColor"
      | "borderColor"
      | "fontFamily"
      | "borderRadius"
      | "logoUrl"
      | "bannerUrl"
      | "visualStyle"
    >
  >;
}

export interface FeedbackInput {
  orderId: string;
  rating: number;
  comment?: string;
}

export interface ManagedStoreSummary {
  id: string;
  name: string;
  slug: string;
  description: string;
  isActive: boolean;
  isAcceptingOrders: boolean;
  accessRole: "owner" | "admin" | "platformAdmin";
}

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

export const getStoreBundleBySlug = async (
  slug: string,
  options: { includeInactive?: boolean } = {},
): Promise<StoreBundle | null> => {
  const stores = collection(firestore, "stores");
  const storeSnapshot = await getDocs(
    options.includeInactive
      ? query(stores, where("slug", "==", slug), limit(1))
      : query(stores, where("slug", "==", slug), where("isActive", "==", true), limit(1)),
  );

  const storeDocument = storeSnapshot.docs[0];

  if (!storeDocument) {
    return null;
  }

  const store = { id: storeDocument.id, ...storeDocument.data() } as StoreBundle["store"];
  const [themeDocument, tableSnapshot, categorySnapshot, additionalSnapshot, itemSnapshot] = await Promise.all([
    getDoc(doc(firestore, "stores", store.id, "theme", "default")),
    getDocs(query(collection(firestore, "stores", store.id, "tables"), orderBy("label", "asc"))),
    getDocs(query(collection(firestore, "stores", store.id, "categories"), orderBy("order", "asc"))),
    getDocs(query(collection(firestore, "stores", store.id, "additionals"), orderBy("order", "asc"))),
    getDocs(query(collection(firestore, "stores", store.id, "menuItems"), orderBy("order", "asc"))),
  ]);

  return {
    store,
    theme: { id: themeDocument.id, ...themeDocument.data() } as StoreTheme,
    tables: tableSnapshot.docs.map((candidate) => ({ id: candidate.id, ...candidate.data() }) as Table),
    categories: categorySnapshot.docs.map(
      (candidate) => ({ id: candidate.id, ...candidate.data() }) as Category,
    ),
    additionals: additionalSnapshot.docs.map((candidate) => ({ id: candidate.id, ...candidate.data() }) as Additional),
    menuItems: itemSnapshot.docs.map((candidate) => ({ id: candidate.id, ...candidate.data() }) as MenuItem),
  };
};

export const getAdminStoreBundleBySlug = async (slug: string): Promise<StoreBundle> => {
  const callable = httpsCallable(firebaseFunctions, "getAdminStoreBundle");
  const response = await callable({ slug });

  return response.data as StoreBundle;
};

export const getManagedStores = async (): Promise<ManagedStoreSummary[]> => {
  const callable = httpsCallable<Record<string, never>, { stores: ManagedStoreSummary[] }>(
    firebaseFunctions,
    "listManagedStores",
  );
  const response = await callable({});

  return response.data.stores;
};

export const getStoreById = async (storeId: string): Promise<Store | null> => {
  const storeDocument = await getDoc(doc(firestore, "stores", storeId));
  return storeDocument.exists() ? ({ id: storeDocument.id, ...storeDocument.data() } as Store) : null;
};

export const createOrder = async (payload: CreateOrderPayload) => {
  const validation = createOrderSchema.safeParse(payload);

  if (!validation.success) {
    const validationError = new Error("Revise os dados e os itens do pedido antes de tentar novamente.") as Error & {
      code: string;
      details: { validationIssues: Array<{ field: string; code: string }> };
    };
    validationError.name = "OrderValidationError";
    validationError.code = "validation/invalid-order";
    validationError.details = {
      validationIssues: validation.error.issues.map((issue) => ({
        field: issue.path.join("."),
        code: issue.code,
      })),
    };
    throw validationError;
  }

  const callable = httpsCallable(firebaseFunctions, "createOrder");
  const response = await callable(removeUndefined(validation.data));

  return response.data as Order;
};

export const createAdminOrder = async (payload: CreateOrderPayload) => {
  const callable = httpsCallable(firebaseFunctions, "createAdminOrder");
  const response = await callable(removeUndefined(payload));

  return response.data as Order;
};

export const createTable = async (storeId: string, label: string) => {
  const callable = httpsCallable(firebaseFunctions, "createTable");
  const response = await callable({ storeId, label });

  return response.data as Table;
};

export const updateTable = async (storeId: string, tableId: string, isActive: boolean) => {
  const callable = httpsCallable(firebaseFunctions, "updateTable");
  const response = await callable({ storeId, tableId, isActive });

  return response.data as Table;
};

export const createCategory = async (storeId: string, name: string) => {
  const callable = httpsCallable(firebaseFunctions, "createCategory");
  const response = await callable({ storeId, name });

  return response.data as Category;
};

export const createAdditional = async (storeId: string, additional: AdditionalInput) => {
  const callable = httpsCallable(firebaseFunctions, "createAdditional");
  const response = await callable(removeUndefined({ storeId, ...additional }));

  return response.data as Additional;
};

export const updateAdditional = async (
  storeId: string,
  additionalId: string,
  additional: AdditionalInput,
) => {
  const callable = httpsCallable(firebaseFunctions, "updateAdditional");
  const response = await callable(removeUndefined({ storeId, additionalId, ...additional }));

  return response.data as Additional;
};

export const reorderAdditionals = async (storeId: string, additionalIds: string[]) => {
  const callable = httpsCallable(firebaseFunctions, "reorderAdditionals");
  await callable({ storeId, additionalIds });
};

export const deleteAdditional = async (storeId: string, additionalId: string) => {
  const callable = httpsCallable(firebaseFunctions, "deleteAdditional");
  await callable({ storeId, additionalId });
};

export const createMenuItem = async (storeId: string, item: MenuItemInput) => {
  const callable = httpsCallable(firebaseFunctions, "createMenuItem");
  const response = await callable(removeUndefined({ storeId, ...item }));

  return response.data as MenuItem;
};

export const updateMenuItem = async (storeId: string, itemId: string, item: MenuItemInput) => {
  const callable = httpsCallable(firebaseFunctions, "updateMenuItem");
  const response = await callable(removeUndefined({ storeId, itemId, ...item }));

  return response.data as MenuItem;
};

export const deleteMenuItem = async (storeId: string, itemId: string) => {
  const callable = httpsCallable(firebaseFunctions, "deleteMenuItem");
  await callable({ storeId, itemId });
};

const getSafeImageExtension = (file: File) => {
  const rawExtension = file.name.split(".").pop()?.toLowerCase() || "jpg";
  return rawExtension.replace(/[^a-z0-9]/g, "") || "jpg";
};

const menuItemImageMaxDimension = 768;
const menuItemImageMaxUploadSize = 4.5 * 1024 * 1024;
const menuItemImageQualitySteps = [0.82, 0.74, 0.66, 0.58] as const;

interface OptimizedImageUpload {
  blob: Blob;
  extension: string;
  contentType: string;
}

const isManagedStorageUrl = (url: string) =>
  url.startsWith("gs://") || url.startsWith("https://firebasestorage.googleapis.com/");

const loadBrowserImage = async (file: File): Promise<ImageBitmap | HTMLImageElement> => {
  if (typeof createImageBitmap === "function") {
    return createImageBitmap(file);
  }

  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Não foi possível carregar a imagem."));
    };

    image.src = objectUrl;
  });
};

const getBrowserImageSize = (image: ImageBitmap | HTMLImageElement) => {
  if (image instanceof HTMLImageElement) {
    return {
      width: image.naturalWidth,
      height: image.naturalHeight,
    };
  }

  return {
    width: image.width,
    height: image.height,
  };
};

const canvasToBlob = (canvas: HTMLCanvasElement, quality: number) =>
  new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
          return;
        }

        reject(new Error("Não foi possível otimizar a imagem."));
      },
      "image/webp",
      quality,
    );
  });

const optimizeMenuItemImageForUpload = async (file: File): Promise<OptimizedImageUpload> => {
  if (file.type === "image/svg+xml") {
    return {
      blob: file,
      extension: getSafeImageExtension(file),
      contentType: file.type,
    };
  }

  const image = await loadBrowserImage(file);
  const { width, height } = getBrowserImageSize(image);
  const largestSide = Math.max(width, height);
  const scale = largestSide > menuItemImageMaxDimension ? menuItemImageMaxDimension / largestSide : 1;
  const targetWidth = Math.max(1, Math.round(width * scale));
  const targetHeight = Math.max(1, Math.round(height * scale));
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Não foi possível preparar a imagem.");
  }

  canvas.width = targetWidth;
  canvas.height = targetHeight;
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(image, 0, 0, targetWidth, targetHeight);

  if ("close" in image) {
    image.close();
  }

  let optimizedBlob = await canvasToBlob(canvas, menuItemImageQualitySteps[0]);

  for (const quality of menuItemImageQualitySteps.slice(1)) {
    if (optimizedBlob.size <= menuItemImageMaxUploadSize) {
      break;
    }

    optimizedBlob = await canvasToBlob(canvas, quality);
  }

  return {
    blob: optimizedBlob,
    extension: "webp",
    contentType: "image/webp",
  };
};

export const uploadMenuItemImage = async (storeId: string, file: File) => {
  const optimizedImage = await optimizeMenuItemImageForUpload(file);
  const imageRef = ref(
    firebaseStorage,
    `stores/${storeId}/public/menu-items/${Date.now()}-${crypto.randomUUID()}.${optimizedImage.extension}`,
  );
  const snapshot = await uploadBytes(imageRef, optimizedImage.blob, {
    contentType: optimizedImage.contentType,
  });

  return getDownloadURL(snapshot.ref);
};

export const deleteUploadedImage = async (imageUrl: string) => {
  if (!isManagedStorageUrl(imageUrl)) {
    return;
  }

  await deleteObject(ref(firebaseStorage, imageUrl));
};

export const uploadStoreAsset = async (storeId: string, file: File, assetType: "logo" | "banner") => {
  const extension = getSafeImageExtension(file);
  const imageRef = ref(
    firebaseStorage,
    `stores/${storeId}/public/settings/${assetType}/${Date.now()}-${crypto.randomUUID()}.${extension}`,
  );
  const snapshot = await uploadBytes(imageRef, file, {
    contentType: file.type || "image/jpeg",
  });

  return getDownloadURL(snapshot.ref);
};

export const updateStoreSettings = async (storeId: string, payload: StoreSettingsPayload) => {
  const callable = httpsCallable(firebaseFunctions, "updateStoreSettings");
  await callable(removeUndefined({ storeId, ...payload }));
};

export const submitOrderFeedback = async (payload: FeedbackInput) => {
  const callable = httpsCallable(firebaseFunctions, "submitOrderFeedback");
  const response = await callable(removeUndefined(payload));

  return response.data as { ok: true; feedbackId: string; alreadySubmitted?: boolean };
};

export const subscribeStoreFeedbacks = (
  storeId: string,
  onChange: (feedbacks: StoreFeedback[]) => void,
  onError?: (error: Error) => void,
) =>
  onSnapshot(
    query(collection(firestore, "stores", storeId, "feedbacks"), orderBy("createdAt", "desc")),
    (snapshot) => {
      onChange(snapshot.docs.map((candidate) => ({ id: candidate.id, ...candidate.data() }) as StoreFeedback));
    },
    (error) => onError?.(error),
  );

export const subscribeStoreOrders = (
  storeId: string,
  onChange: (orders: Order[]) => void,
  onError?: (error: Error) => void,
) =>
  onSnapshot(
    query(collection(firestore, "stores", storeId, "orders"), orderBy("createdAt", "desc")),
    (snapshot) => {
      onChange(snapshot.docs.map((candidate) => ({ id: candidate.id, ...candidate.data() }) as Order));
    },
    (error) => onError?.(error),
  );

export const updateOrderStatus = async (storeId: string, orderId: string, status: OrderStatus) => {
  const callable = httpsCallable(firebaseFunctions, "updateOrderStatus");
  await callable({ storeId, orderId, status });
};

export const finalizeConfirmedOrders = async (storeId: string, orderIds: string[]) => {
  const callable = httpsCallable(firebaseFunctions, "finalizeConfirmedOrders");
  const response = await callable({ storeId, orderIds });

  return response.data as { ok: true; updatedCount: number };
};

export const deleteOrder = async (storeId: string, orderId: string) => {
  const callable = httpsCallable(firebaseFunctions, "deleteOrder");
  await callable({ storeId, orderId });
};

export const subscribeOrder = (
  orderId: string,
  onChange: (order: Order | null) => void,
  onError?: (error: Error) => void,
) => {
  let unsubscribeOrder: (() => void) | undefined;
  const unsubscribeLookup = onSnapshot(
    doc(firestore, "orderLookup", orderId),
    (snapshot) => {
      const lookup = snapshot.data() as { storeId?: string; orderId?: string } | undefined;
      unsubscribeOrder?.();

      if (!lookup?.storeId || !lookup.orderId) {
        onChange(null);
        return;
      }

      unsubscribeOrder = onSnapshot(
        doc(firestore, "stores", lookup.storeId, "orders", lookup.orderId),
        (orderSnapshot) =>
          onChange(orderSnapshot.exists() ? ({ id: orderSnapshot.id, ...orderSnapshot.data() } as Order) : null),
        (error) => onError?.(error),
      );
    },
    (error) => onError?.(error),
  );

  return () => {
    unsubscribeLookup();
    unsubscribeOrder?.();
  };
};
