import type { CustomerDirectoryItem } from "@/features/customer-directory/types/customer-directory.types";
import { formatDateTime } from "@/lib/utils/dates";

const escapeCsv = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`;

export const downloadCustomersCsv = (customers: CustomerDirectoryItem[], filename: string) => {
  const header = [
    "Cliente",
    "Telefone",
    "Pedidos",
    "Pedidos finalizados",
    "Primeiro pedido",
    "Último pedido",
    "Código do último pedido",
  ];
  const rows = customers.map((customer) => [
    customer.name,
    customer.phone,
    customer.orderCount,
    customer.deliveredOrderCount,
    formatDateTime(customer.firstOrderAt),
    formatDateTime(customer.lastOrderAt),
    customer.lastOrderCode,
  ]);
  const csv = [header, ...rows].map((row) => row.map(escapeCsv).join(";")).join("\n");
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
};
