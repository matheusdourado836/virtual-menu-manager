import type { CustomerDirectoryData, CustomerDirectoryItem } from "@/features/customer-directory/types/customer-directory.types";
import type { Order } from "@/types/menu";

const phoneCountryCode = "55";

export const normalizeBrazilianCustomerPhone = (value?: string) => {
  const digits = value?.replace(/\D/g, "") || "";
  const nationalPhone =
    digits.startsWith(phoneCountryCode) && (digits.length === 12 || digits.length === 13)
      ? digits.slice(phoneCountryCode.length)
      : digits;

  if (nationalPhone.length !== 10 && nationalPhone.length !== 11) {
    return undefined;
  }

  return `${phoneCountryCode}${nationalPhone}`;
};

export const formatCustomerPhone = (normalizedPhone: string) => {
  const nationalPhone = normalizedPhone.startsWith(phoneCountryCode)
    ? normalizedPhone.slice(phoneCountryCode.length)
    : normalizedPhone;
  const areaCode = nationalPhone.slice(0, 2);
  const localNumber = nationalPhone.slice(2);

  return localNumber.length === 9
    ? `(${areaCode}) ${localNumber.slice(0, 5)}-${localNumber.slice(5)}`
    : `(${areaCode}) ${localNumber.slice(0, 4)}-${localNumber.slice(4)}`;
};

const getOrderTimestamp = (order: Order) => {
  const timestamp = new Date(order.createdAt).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
};

const isNewerOrder = (candidate: Order, current: CustomerDirectoryItem) =>
  getOrderTimestamp(candidate) >= new Date(current.lastOrderAt).getTime();

export const buildCustomerDirectory = (orders: Order[]): CustomerDirectoryData => {
  const customersByPhone = new Map<string, CustomerDirectoryItem>();
  let ordersWithoutPhone = 0;

  orders.forEach((order) => {
    const normalizedPhone = normalizeBrazilianCustomerPhone(order.customerPhone);

    if (!normalizedPhone) {
      ordersWithoutPhone += 1;
      return;
    }

    const current = customersByPhone.get(normalizedPhone);

    if (!current) {
      customersByPhone.set(normalizedPhone, {
        id: normalizedPhone,
        name: order.customerName,
        phone: formatCustomerPhone(normalizedPhone),
        orderCount: 1,
        deliveredOrderCount: order.status === "delivered" ? 1 : 0,
        firstOrderAt: order.createdAt,
        firstOrderId: order.id,
        firstOrderCode: order.code,
        lastOrderAt: order.createdAt,
        lastOrderId: order.id,
        lastOrderCode: order.code,
        lastOrderStatus: order.status,
      });
      return;
    }

    current.orderCount += 1;
    current.deliveredOrderCount += order.status === "delivered" ? 1 : 0;

    if (getOrderTimestamp(order) < new Date(current.firstOrderAt).getTime()) {
      current.firstOrderAt = order.createdAt;
      current.firstOrderId = order.id;
      current.firstOrderCode = order.code;
    }

    if (isNewerOrder(order, current)) {
      current.name = order.customerName;
      current.lastOrderAt = order.createdAt;
      current.lastOrderId = order.id;
      current.lastOrderCode = order.code;
      current.lastOrderStatus = order.status;
    }
  });

  return {
    customers: Array.from(customersByPhone.values()).sort(
      (first, second) => new Date(second.lastOrderAt).getTime() - new Date(first.lastOrderAt).getTime(),
    ),
    ordersWithoutPhone,
  };
};
