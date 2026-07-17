import type { OrderStatus } from "@/types/menu";

export interface CustomerDirectoryItem {
  id: string;
  name: string;
  phone: string;
  orderCount: number;
  deliveredOrderCount: number;
  firstOrderAt: string;
  firstOrderId: string;
  firstOrderCode: string;
  lastOrderAt: string;
  lastOrderId: string;
  lastOrderCode: string;
  lastOrderStatus: OrderStatus;
}

export interface CustomerDirectoryData {
  customers: CustomerDirectoryItem[];
  ordersWithoutPhone: number;
}
