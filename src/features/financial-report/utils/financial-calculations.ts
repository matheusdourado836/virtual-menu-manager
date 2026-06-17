import { getPaymentMethodLabel } from "@/lib/utils/payment";
import type { Order, PaymentMethod } from "@/types/menu";
import type {
  FinancialGroupBy,
  FinancialReportData,
  FinancialReportFilters,
  FinancialReportRange,
  PaymentBreakdownItem,
  TimeSalesBucket,
  TopProductItem,
} from "../types/financial-report.types";

const paymentMethods: PaymentMethod[] = [
  "pay_on_pickup",
  "pix_on_pickup",
  "card_on_pickup",
  "cash_on_pickup",
];

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

const endOfDay = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);

const parseDateInput = (value: string) => {
  const [year, month, day] = value.split("-").map(Number);
  return Number.isFinite(year) && Number.isFinite(month) && Number.isFinite(day)
    ? new Date(year, month - 1, day)
    : new Date();
};

export const formatDateInput = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

export const getDefaultFinancialFilters = (): FinancialReportFilters => {
  const today = new Date();

  return {
    period: "today",
    startDate: formatDateInput(today),
    endDate: formatDateInput(today),
    status: "delivered",
    paymentMethod: "all",
    origin: "all",
    tableId: "all",
  };
};

export const getFinancialReportRange = (filters: FinancialReportFilters): FinancialReportRange => {
  const today = new Date();
  let start = startOfDay(today);
  let end = endOfDay(today);

  if (filters.period === "yesterday") {
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    start = startOfDay(yesterday);
    end = endOfDay(yesterday);
  }

  if (filters.period === "last_7_days") {
    const firstDay = new Date(today);
    firstDay.setDate(today.getDate() - 6);
    start = startOfDay(firstDay);
    end = endOfDay(today);
  }

  if (filters.period === "current_month") {
    start = new Date(today.getFullYear(), today.getMonth(), 1);
    end = endOfDay(today);
  }

  if (filters.period === "custom") {
    start = startOfDay(parseDateInput(filters.startDate));
    end = endOfDay(parseDateInput(filters.endDate));

    if (start.getTime() > end.getTime()) {
      [start, end] = [end, start];
    }
  }

  const groupBy: FinancialGroupBy =
    start.toDateString() === end.toDateString() ? "hour" : "day";

  return { start, end, groupBy };
};

const getLineTotal = (item: Order["items"][number]) =>
  Number(item.lineTotal ?? item.unitPrice * item.quantity);

const isValidSale = (order: Order) => {
  // TODO_FINANCE: quando houver confirmação real de pagamento, considerar paymentStatus === "paid".
  return order.status === "delivered";
};

const filterOrders = (orders: Order[], filters: FinancialReportFilters) =>
  orders.filter((order) => {
    if (filters.status !== "all" && order.status !== filters.status) {
      return false;
    }

    if (filters.paymentMethod !== "all" && order.paymentMethod !== filters.paymentMethod) {
      return false;
    }

    if (filters.origin === "table" && !order.tableId) {
      return false;
    }

    if (filters.origin === "manual" && order.tableId) {
      return false;
    }

    if (filters.tableId !== "all" && order.tableId !== filters.tableId) {
      return false;
    }

    return true;
  });

const getTimeBucket = (order: Order, groupBy: FinancialGroupBy) => {
  const date = new Date(order.createdAt);

  if (groupBy === "hour") {
    const hour = String(date.getHours()).padStart(2, "0");
    return {
      key: hour,
      label: `${hour}:00`,
    };
  }

  const day = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  }).format(date);

  return {
    key: formatDateInput(date),
    label: day,
  };
};

const buildPaymentBreakdown = (sales: Order[], grossRevenue: number): PaymentBreakdownItem[] => {
  const rows = new Map<PaymentMethod | "unknown", PaymentBreakdownItem>();

  paymentMethods.forEach((paymentMethod) => {
    rows.set(paymentMethod, {
      paymentMethod,
      label: getPaymentMethodLabel(paymentMethod),
      orders: 0,
      total: 0,
      percentage: 0,
    });
  });

  sales.forEach((order) => {
    const key = order.paymentMethod || "unknown";
    const current =
      rows.get(key) ||
      ({
        paymentMethod: "unknown",
        label: "Não informado",
        orders: 0,
        total: 0,
        percentage: 0,
      } satisfies PaymentBreakdownItem);

    current.orders += 1;
    current.total += Number(order.total || 0);
    rows.set(key, current);
  });

  return Array.from(rows.values()).map((row) => ({
    ...row,
    percentage: grossRevenue > 0 ? (row.total / grossRevenue) * 100 : 0,
  }));
};

const buildSalesByTime = (sales: Order[], groupBy: FinancialGroupBy): TimeSalesBucket[] => {
  const buckets = new Map<string, TimeSalesBucket>();

  sales.forEach((order) => {
    const bucket = getTimeBucket(order, groupBy);
    const current = buckets.get(bucket.key) || {
      key: bucket.key,
      label: bucket.label,
      orders: 0,
      total: 0,
    };

    current.orders += 1;
    current.total += Number(order.total || 0);
    buckets.set(bucket.key, current);
  });

  return Array.from(buckets.values()).sort((left, right) => left.key.localeCompare(right.key));
};

const buildTopProducts = (sales: Order[], grossRevenue: number): TopProductItem[] => {
  const products = new Map<string, TopProductItem>();

  sales.forEach((order) => {
    order.items.forEach((item) => {
      const current = products.get(item.menuItemId) || {
        menuItemId: item.menuItemId,
        name: item.name,
        quantity: 0,
        total: 0,
        percentage: 0,
      };

      current.quantity += item.quantity;
      current.total += getLineTotal(item);
      products.set(item.menuItemId, current);
    });
  });

  return Array.from(products.values())
    .map((item) => ({
      ...item,
      percentage: grossRevenue > 0 ? (item.total / grossRevenue) * 100 : 0,
    }))
    .sort((left, right) => right.quantity - left.quantity || right.total - left.total);
};

export const calculateFinancialReport = (
  orders: Order[],
  filters: FinancialReportFilters,
  groupBy: FinancialGroupBy,
): FinancialReportData => {
  const filteredOrders = filterOrders(orders, filters);
  const sales = filteredOrders.filter(isValidSale);
  const cancelledOrders = filteredOrders.filter((order) => order.status === "cancelled");
  const grossRevenue = sales.reduce((total, order) => total + Number(order.total || 0), 0);
  const finalizedOrders = sales.length;
  const soldItems = sales.reduce(
    (total, order) => total + order.items.reduce((itemTotal, item) => itemTotal + item.quantity, 0),
    0,
  );
  const cancelledValue = cancelledOrders.reduce((total, order) => total + Number(order.total || 0), 0);
  const salesByTime = buildSalesByTime(sales, groupBy);
  const topProducts = buildTopProducts(sales, grossRevenue);
  const bestSalesTime = [...salesByTime].sort((left, right) => right.total - left.total || right.orders - left.orders)[0];

  return {
    orders: filteredOrders,
    groupBy,
    cancelledOrders,
    paymentBreakdown: buildPaymentBreakdown(sales, grossRevenue),
    salesByTime,
    topProducts,
    summary: {
      grossRevenue,
      finalizedOrders,
      averageTicket: finalizedOrders > 0 ? grossRevenue / finalizedOrders : 0,
      soldItems,
      cancelledOrders: cancelledOrders.length,
      cancelledValue,
      topProductName: topProducts[0]?.name || "Sem vendas",
      bestSalesTime: bestSalesTime?.label || "Sem vendas",
    },
  };
};
