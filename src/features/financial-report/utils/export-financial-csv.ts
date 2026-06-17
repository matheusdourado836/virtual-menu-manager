import { formatDateTime } from "@/lib/utils/dates";
import { formatCurrency } from "@/lib/utils/money";
import { getPaymentMethodLabel, getPaymentStatusLabel } from "@/lib/utils/payment";
import type { Order, OrderStatus } from "@/types/menu";

const statusLabels: Record<OrderStatus, string> = {
  received: "Novo",
  accepted: "Aceito",
  preparing: "Em preparo",
  ready: "Pronto",
  delivered: "Finalizado",
  cancelled: "Cancelado",
};

const escapeCsv = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`;

const summarizeItems = (order: Order) =>
  order.items.map((item) => `${item.quantity}x ${item.name}`).join(", ");

export const downloadFinancialCsv = (orders: Order[], filename: string) => {
  const header = [
    "Código do pedido",
    "Data/hora",
    "Cliente",
    "Mesa",
    "Status",
    "Forma de pagamento",
    "Status do pagamento",
    "Itens",
    "Subtotal",
    "Taxa de serviço",
    "Desconto",
    "Total",
    "Motivo do cancelamento",
  ];

  const rows = orders.map((order) => [
    order.code,
    formatDateTime(order.createdAt),
    order.customerName || "Não informado",
    order.tableLabel || "Balcão",
    statusLabels[order.status],
    getPaymentMethodLabel(order.paymentMethod),
    getPaymentStatusLabel(order.paymentStatus),
    summarizeItems(order),
    formatCurrency(Number(order.subtotal || 0)),
    formatCurrency(Number(order.serviceFee || 0)),
    formatCurrency(Number((order as { discount?: number }).discount || 0)),
    formatCurrency(Number(order.total || 0)),
    order.cancelReason || "Não informado",
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
