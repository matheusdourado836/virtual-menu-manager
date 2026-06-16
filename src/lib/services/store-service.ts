import { collection, doc, getDoc, getDocs, limit, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { firebaseFunctions, firestore } from "@/lib/firebase/client";
import type { CreateOrderPayload } from "@/lib/validators/order";
import type { Category, MenuItem, Order, OrderStatus, Store, StoreBundle, StoreTheme, Table } from "@/types/menu";

export interface MenuItemInput {
  categoryId: string;
  name: string;
  description?: string;
  imageUrl?: string;
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
  const [themeDocument, tableSnapshot, categorySnapshot, itemSnapshot] = await Promise.all([
    getDoc(doc(firestore, "stores", store.id, "theme", "default")),
    getDocs(query(collection(firestore, "stores", store.id, "tables"), orderBy("label", "asc"))),
    getDocs(query(collection(firestore, "stores", store.id, "categories"), orderBy("order", "asc"))),
    getDocs(query(collection(firestore, "stores", store.id, "menuItems"), orderBy("order", "asc"))),
  ]);

  return {
    store,
    theme: { id: themeDocument.id, ...themeDocument.data() } as StoreTheme,
    tables: tableSnapshot.docs.map((candidate) => ({ id: candidate.id, ...candidate.data() }) as Table),
    categories: categorySnapshot.docs.map(
      (candidate) => ({ id: candidate.id, ...candidate.data() }) as Category,
    ),
    menuItems: itemSnapshot.docs.map((candidate) => ({ id: candidate.id, ...candidate.data() }) as MenuItem),
  };
};

export const getAdminStoreBundleBySlug = async (slug: string): Promise<StoreBundle> => {
  const callable = httpsCallable(firebaseFunctions, "getAdminStoreBundle");
  const response = await callable({ slug });

  return response.data as StoreBundle;
};

export const getStoreById = async (storeId: string): Promise<Store | null> => {
  const storeDocument = await getDoc(doc(firestore, "stores", storeId));
  return storeDocument.exists() ? ({ id: storeDocument.id, ...storeDocument.data() } as Store) : null;
};

export const createOrder = async (payload: CreateOrderPayload) => {
  const callable = httpsCallable(firebaseFunctions, "createOrder");
  const response = await callable(removeUndefined(payload));

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

export const createCategory = async (storeId: string, name: string) => {
  const callable = httpsCallable(firebaseFunctions, "createCategory");
  const response = await callable({ storeId, name });

  return response.data as Category;
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

export const updateStoreSettings = async (storeId: string, payload: StoreSettingsPayload) => {
  const callable = httpsCallable(firebaseFunctions, "updateStoreSettings");
  await callable(removeUndefined({ storeId, ...payload }));
};

export const subscribeStoreOrders = (
  storeId: string,
  onChange: (orders: Order[]) => void,
  onError?: (error: Error) => void,
) =>
  onSnapshot(
    query(collection(firestore, "stores", storeId, "orders"), orderBy("createdAt", "desc"), limit(80)),
    (snapshot) => {
      onChange(snapshot.docs.map((candidate) => ({ id: candidate.id, ...candidate.data() }) as Order));
    },
    (error) => onError?.(error),
  );

export const updateOrderStatus = async (storeId: string, orderId: string, status: OrderStatus) => {
  const callable = httpsCallable(firebaseFunctions, "updateOrderStatus");
  await callable({ storeId, orderId, status });
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

      if (!lookup?.storeId) {
        onChange(null);
        return;
      }

      unsubscribeOrder = onSnapshot(
        doc(firestore, "stores", lookup.storeId, "orders", lookup.orderId || orderId),
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
