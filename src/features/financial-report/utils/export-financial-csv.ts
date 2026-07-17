import { escapeCsvCell } from "@/lib/utils/csv";
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

const summarizeItems = (order: Order) =>
  order.items.map((item) => `${item.quantity}x ${item.name}`).join(", ");

const summarizeAdditionals = (order: Order) =>
  order.items
    .flatMap((item) => item.selectedOptions.map((option) => `${item.quantity}x ${option.choiceName}`))
    .join(", ");

const getAdditionalsTotal = (order: Order) =>
  order.items.reduce(
    (total, item) =>
      total + item.selectedOptions.reduce((optionTotal, option) => optionTotal + Number(option.price || 0), 0) * item.quantity,
    0,
  );

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
    "Adicionais",
    "Total em adicionais",
    "Subtotal",
    "Taxa de serviço",
    "Total",
    "Motivo do cancelamento",
  ];

  const rows = orders.map((order) => [
    order.code,
    formatDateTime(order.createdAt),
    order.customerName,
    order.tableLabel ?? "",
    statusLabels[order.status],
    getPaymentMethodLabel(order.paymentMethod),
    getPaymentStatusLabel(order.paymentStatus),
    summarizeItems(order),
    summarizeAdditionals(order),
    formatCurrency(getAdditionalsTotal(order)),
    formatCurrency(Number(order.subtotal)),
    formatCurrency(Number(order.serviceFee)),
    formatCurrency(Number(order.total)),
    order.cancelReason ?? "",
  ]);

  const csv = [header, ...rows].map((row) => row.map(escapeCsvCell).join(";")).join("\n");
  const blob = new Blob([String.fromCharCode(0xfeff) + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
};
