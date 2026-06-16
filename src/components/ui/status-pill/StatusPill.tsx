import { Bell, CheckCheck, ChefHat, CircleDot, XCircle } from "lucide-react";
import type { OrderStatus } from "@/types/menu";
import "./status-pill.scss";

const statusLabel: Record<OrderStatus, string> = {
  received: "Novo",
  accepted: "Aceito",
  preparing: "Em preparo",
  ready: "Pronto",
  delivered: "Finalizado",
  cancelled: "Cancelado",
};

const statusIcon: Record<OrderStatus, typeof CircleDot> = {
  received: CircleDot,
  accepted: CircleDot,
  preparing: ChefHat,
  ready: Bell,
  delivered: CheckCheck,
  cancelled: XCircle,
};

interface StatusPillProps {
  status: OrderStatus;
}

export function StatusPill({ status }: StatusPillProps) {
  const Icon = statusIcon[status];

  return (
    <span className={`status-pill status-pill--${status}`}>
      <Icon size={14} aria-hidden />
      {statusLabel[status]}
    </span>
  );
}

export { statusLabel };
