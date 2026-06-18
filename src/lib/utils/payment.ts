import type { PaymentMethod, PaymentStatus } from "@/types/menu";

export const paymentMethodLabels: Record<PaymentMethod, string> = {
  pay_on_pickup: "Pagar na retirada",
  pix_on_pickup: "Pix na retirada",
  card_on_pickup: "Cartão na retirada",
  cash_on_pickup: "Dinheiro na retirada",
};

export const paymentStatusLabels: Record<PaymentStatus, string> = {
  pending: "Pendente",
  paid: "Pago",
  cancelled: "Cancelado",
};

export const getPaymentMethodLabel = (paymentMethod: PaymentMethod) => paymentMethodLabels[paymentMethod];

export const getPaymentStatusLabel = (paymentStatus: PaymentStatus) => paymentStatusLabels[paymentStatus];
