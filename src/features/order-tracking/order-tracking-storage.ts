interface StoredOrderReference {
  orderId: string;
  menuPath: string;
  createdAt: string;
}

const latestOrderStoragePrefix = "virtual-menu-manager:latest-order";
const orderMenuStoragePrefix = "virtual-menu-manager:order-menu";
const menuNoticeStoragePrefix = "virtual-menu-manager:menu-notice";

const getLatestOrderStorageKey = (storeId: string, tableId?: string) =>
  `${latestOrderStoragePrefix}:${storeId}:${tableId || "balcao"}`;

const getOrderMenuStorageKey = (orderId: string) => `${orderMenuStoragePrefix}:${orderId}`;
const getMenuNoticeStorageKey = (menuPath: string) => `${menuNoticeStoragePrefix}:${menuPath}`;

export const readStoredOrderReference = (storeId: string, tableId?: string): StoredOrderReference | null => {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(getLatestOrderStorageKey(storeId, tableId));
    return raw ? (JSON.parse(raw) as StoredOrderReference) : null;
  } catch {
    return null;
  }
};

export const readStoredOrderMenuPath = (orderId: string) => {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage.getItem(getOrderMenuStorageKey(orderId));
};

export const writeStoredOrderReference = (
  storeId: string,
  tableId: string | undefined,
  orderId: string,
  menuPath: string,
) => {
  if (typeof window === "undefined") {
    return;
  }

  const reference: StoredOrderReference = {
    orderId,
    menuPath,
    createdAt: new Date().toISOString(),
  };

  window.localStorage.setItem(getLatestOrderStorageKey(storeId, tableId), JSON.stringify(reference));
  window.localStorage.setItem(getOrderMenuStorageKey(orderId), menuPath);
};

export const clearStoredOrderReference = (storeId: string, tableId: string | undefined, orderId: string) => {
  if (typeof window === "undefined") {
    return;
  }

  const latestOrderKey = getLatestOrderStorageKey(storeId, tableId);
  const storedReference = readStoredOrderReference(storeId, tableId);

  if (!storedReference || storedReference.orderId === orderId) {
    window.localStorage.removeItem(latestOrderKey);
  }

  window.localStorage.removeItem(getOrderMenuStorageKey(orderId));
};

export const clearStoredOrderById = (orderId: string) => {
  if (typeof window === "undefined") {
    return;
  }

  Object.keys(window.localStorage)
    .filter((key) => key.startsWith(`${latestOrderStoragePrefix}:`))
    .forEach((key) => {
      try {
        const reference = JSON.parse(window.localStorage.getItem(key) || "") as StoredOrderReference;

        if (reference.orderId === orderId) {
          window.localStorage.removeItem(key);
        }
      } catch {
        return;
      }
    });

  window.localStorage.removeItem(getOrderMenuStorageKey(orderId));
};

export const writeMenuNotice = (menuPath: string, message: string) => {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.setItem(getMenuNoticeStorageKey(menuPath), message);
};

export const readAndClearMenuNotice = (menuPath: string) => {
  if (typeof window === "undefined") {
    return null;
  }

  const key = getMenuNoticeStorageKey(menuPath);
  const message = window.sessionStorage.getItem(key);
  window.sessionStorage.removeItem(key);
  return message;
};
