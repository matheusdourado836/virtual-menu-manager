"use client";

import { ArrowLeft, CheckCircle2, Clock3, Search, XCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { EmptyState } from "@/components/ui/empty-state/EmptyState";
import { LoadingState } from "@/components/ui/loading-state/LoadingState";
import {
  clearStoredOrderById,
  clearStoredOrderReference,
  readStoredOrderMenuPath,
  writeMenuNotice,
} from "@/features/order-tracking/order-tracking-storage";
import { getStoreById, subscribeOrder } from "@/lib/services/store-service";
import { formatCurrency } from "@/lib/utils/money";
import type { Order, OrderStatus } from "@/types/menu";
import "./order-tracker.scss";

const progressStatuses = ["received", "preparing", "ready", "delivered"] as const;
const progressIndexByStatus: Record<OrderStatus, number> = {
  received: -1,
  accepted: 0,
  preparing: 1,
  ready: 2,
  delivered: 3,
  cancelled: -1,
};
const trackerStatusLabel: Record<OrderStatus, string> = {
  received: "Aguardando confirmação",
  accepted: "Pedido confirmado",
  preparing: "Em preparo",
  ready: "Pronto",
  delivered: "Finalizado",
  cancelled: "Cancelado",
};

const progressStatusLabel: Record<"received" | "preparing" | "ready" | "delivered", string> = {
  received: "Pedido confirmado",
  preparing: "Em preparo",
  ready: "Pronto",
  delivered: "Finalizado",
};

interface OrderTrackerProps {
  orderId: string;
}

export function OrderTracker({ orderId }: OrderTrackerProps) {
  const router = useRouter();
  const [order, setOrder] = useState<Order | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [menuLink, setMenuLink] = useState(() => readStoredOrderMenuPath(orderId));
  const hasRedirected = useRef(false);

  useEffect(() => {
    const unsubscribe = subscribeOrder(
      orderId,
      (updatedOrder) => {
        if (!updatedOrder) {
          clearStoredOrderById(orderId);
        }

        setLoadError("");
        setOrder(updatedOrder);
        setMenuLink((currentMenuLink) => currentMenuLink || readStoredOrderMenuPath(orderId));
        setIsLoading(false);
      },
      (error) => {
        setLoadError(error.message || "Não foi possível acompanhar este pedido.");
        setIsLoading(false);
      },
    );

    return unsubscribe;
  }, [orderId]);

  useEffect(() => {
    if (!order || menuLink) {
      return;
    }

    let isMounted = true;

    getStoreById(order.storeId)
      .then((store) => {
        if (!isMounted || !store) {
          return;
        }

        setMenuLink(order.tableId ? `/loja/${store.slug}/mesa/${order.tableId}` : `/loja/${store.slug}`);
      })
      .catch(() => {
        if (isMounted) {
          setMenuLink("");
        }
      });

    return () => {
      isMounted = false;
    };
  }, [menuLink, order]);

  useEffect(() => {
    if (!order || order.status !== "delivered" || !menuLink || hasRedirected.current) {
      return;
    }

    hasRedirected.current = true;
    clearStoredOrderReference(order.storeId, order.tableId, order.id);
    writeMenuNotice(menuLink, "Pedido finalizado com sucesso.");
    router.replace(menuLink);
  }, [menuLink, order, router]);

  const activeIndex = useMemo(() => {
    return order ? progressIndexByStatus[order.status] : -1;
  }, [order]);

  if (isLoading) {
    return (
      <main className="order-tracker">
        <LoadingState label="Buscando pedido" />
      </main>
    );
  }

  if (!order) {
    return (
      <main className="order-tracker">
        <EmptyState
          icon={<Search size={28} aria-hidden />}
          title={loadError ? "Não foi possível acompanhar o pedido" : "Pedido não encontrado"}
          text={
            loadError ||
            "Pedidos mockados ficam no navegador em que foram criados. Com Firebase real, esta rota usa o índice orderLookup."
          }
        />
      </main>
    );
  }

  return (
    <main className="order-tracker">
      <section className="order-tracker__card">
        {menuLink ? (
          <Link className="order-tracker__back" href={menuLink}>
            <ArrowLeft size={17} aria-hidden />
            Voltar ao cardápio
          </Link>
        ) : null}

        <div className="order-tracker__header">
          <div className="order-tracker__heading">
            <span className="order-tracker__eyebrow">Acompanhamento</span>
            <h1 className="order-tracker__title">Pedido {order.code}</h1>
          </div>
          <span className={`order-tracker__status order-tracker__status--${order.status}`}>
            {order.status === "cancelled" ? (
              <XCircle size={18} aria-hidden />
            ) : order.status === "received" ? (
              <Clock3 size={18} aria-hidden />
            ) : (
              <CheckCircle2 size={18} aria-hidden />
            )}
            {trackerStatusLabel[order.status]}
          </span>
        </div>

        <div className="order-tracker__summary">
          <span>Nome:</span>
          <strong className="order-tracker__customer-name">{order.customerName}</strong>
        </div>

        <ol className="order-tracker__steps" aria-label="Progresso do pedido">
          {progressStatuses.map((status, index) => {
            const isDone = activeIndex >= index;

            return (
              <li className={`order-tracker__step${isDone ? " order-tracker__step--done" : ""}`} key={status}>
                {isDone ? <CheckCircle2 size={22} aria-hidden /> : <Clock3 size={22} aria-hidden />}
                <span>{progressStatusLabel[status]}</span>
              </li>
            );
          })}
        </ol>

        {order.status === "cancelled" ? (
          <div className="order-tracker__cancelled" role="status">
            Pedido cancelado. Procure o atendimento para detalhes.
          </div>
        ) : null}

        <div className="order-tracker__items">
          <h2 className="order-tracker__items-title">Itens</h2>
          {order.items.map((item) => (
            <article className="order-tracker__item" key={`${item.menuItemId}-${item.name}`}>
              <div className="order-tracker__item-copy">
                <strong>
                  {item.quantity}x {item.name}
                </strong>
                {item.selectedOptions.length ? (
                  <span className="order-tracker__item-detail">
                    {item.selectedOptions.map((option) => option.choiceName).join(", ")}
                  </span>
                ) : null}
                {item.observation ? <span className="order-tracker__item-detail">{item.observation}</span> : null}
              </div>
              <strong>{formatCurrency(item.lineTotal)}</strong>
            </article>
          ))}
        </div>

        <div className="order-tracker__total">
          <span>Total</span>
          <strong>{formatCurrency(order.total)}</strong>
        </div>

        <p className="order-tracker__hint">
          <Clock3 size={16} aria-hidden />
          A tela atualiza automaticamente quando a cozinha muda o status.
        </p>
      </section>
    </main>
  );
}
