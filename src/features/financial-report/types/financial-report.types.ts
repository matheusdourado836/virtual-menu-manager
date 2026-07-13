import type { Order, PaymentMethod } from "@/types/menu";

export type FinancialPeriodPreset = "today" | "yesterday" | "last_7_days" | "current_month" | "custom";
export type FinancialStatusFilter = "delivered" | "cancelled" | "all";
export type FinancialPaymentFilter = PaymentMethod | "all";
export type FinancialOriginFilter = "all" | "table" | "manual";
export type FinancialGroupBy = "hour" | "day";

export interface FinancialReportFilters {
  period: FinancialPeriodPreset;
  startDate: string;
  endDate: string;
  status: FinancialStatusFilter;
  paymentMethod: FinancialPaymentFilter;
  origin: FinancialOriginFilter;
  tableId: string;
}

export interface FinancialReportRange {
  start: Date;
  end: Date;
  groupBy: FinancialGroupBy;
}

export interface FinancialSummary {
  grossRevenue: number;
  finalizedOrders: number;
  averageTicket: number;
  soldItems: number;
  additionalRevenue: number;
  soldAdditionals: number;
  ordersWithAdditionals: number;
  cancelledOrders: number;
  cancelledValue: number;
  topProductName: string;
  topAdditionalName: string;
  bestSalesTime: string;
}

export interface PaymentBreakdownItem {
  paymentMethod: PaymentMethod;
  label: string;
  orders: number;
  total: number;
  percentage: number;
}

export interface TimeSalesBucket {
  key: string;
  label: string;
  orders: number;
  total: number;
}

export interface TopProductItem {
  menuItemId: string;
  name: string;
  quantity: number;
  total: number;
  percentage: number;
}

export interface TopAdditionalItem {
  choiceId: string;
  name: string;
  quantity: number;
  orders: number;
  total: number;
  percentage: number;
}

export interface FinancialReportData {
  orders: Order[];
  summary: FinancialSummary;
  paymentBreakdown: PaymentBreakdownItem[];
  salesByTime: TimeSalesBucket[];
  topProducts: TopProductItem[];
  topAdditionals: TopAdditionalItem[];
  cancelledOrders: Order[];
  groupBy: FinancialGroupBy;
}
