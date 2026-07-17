"use client";

import { ArrowLeft, CheckCircle2, Clock3, ExternalLink, Loader2, RefreshCw, Search, Send, Star, XCircle } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { EmptyState } from "@/components/ui/empty-state/EmptyState";
import { LoadingState } from "@/components/ui/loading-state/LoadingState";
import {
  clearStoredOrderById,
  clearStoredOrderReference,
  readStoredOrderMenuPath,
  writeMenuNotice,
} from "@/features/order-tracking/order-tracking-storage";
import { getStoreById, submitOrderFeedback, subscribeOrder } from "@/lib/services/store-service";
import { formatCurrency } from "@/lib/utils/money";
import type { Order, OrderStatus, Store } from "@/types/menu";
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
  const [order, setOrder] = useState<Order | null>(null);
  const [store, setStore] = useState<Store | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [menuLink, setMenuLink] = useState(() => readStoredOrderMenuPath(orderId));
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [feedbackError, setFeedbackError] = useState("");
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);
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
    if (!order || store) {
      return;
    }

    let isMounted = true;

    getStoreById(order.storeId)
      .then((store) => {
        if (!isMounted || !store) {
          return;
        }

        setStore(store);
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
  }, [order, store]);

  useEffect(() => {
    if (!order || order.status !== "delivered" || hasRedirected.current) {
      return;
    }

    hasRedirected.current = true;
    clearStoredOrderReference(order.storeId, order.tableId, order.id);
  }, [order]);

  const activeIndex = useMemo(() => {
    return order ? progressIndexByStatus[order.status] : -1;
  }, [order]);
  const googleReviewUrl = store?.googleReviewUrl?.trim();

  const markMenuReturnNotice = () => {
    if (menuLink) {
      writeMenuNotice(menuLink, "Pedido finalizado com sucesso.");
    }
  };

  const submitFeedback = async () => {
    if (!order || isSubmittingFeedback) {
      return;
    }

    setFeedbackError("");
    setFeedbackMessage("");
    setIsSubmittingFeedback(true);

    try {
      const result = await submitOrderFeedback({
        orderId: order.id,
        rating,
        comment: comment.trim(),
      });

      setFeedbackMessage(result.alreadySubmitted ? "Sua avaliação já foi registrada." : "Obrigado pela avaliação.");
      setComment("");
    } catch (error) {
      setFeedbackError(error instanceof Error ? error.message : "Não foi possível enviar sua avaliação.");
    } finally {
      setIsSubmittingFeedback(false);
    }
  };

  if (isLoading) {
    return (
      <main className="order-tracker">
        <LoadingState label="Buscando pedido" />
      </main>
    );
  }

  if (!order) {
    return (
      <main className="order-tracker order-tracker--centered">
        <section className="order-tracker__empty-card">
          <EmptyState
            icon={<Search size={28} aria-hidden />}
            title="Pedido não encontrado"
            text={
              loadError ||
              "Esse pedido não foi encontrado ou pode ter sido cancelado pela loja."
            }
          />
          {menuLink ? (
            <Link className="order-tracker__empty-action" href={menuLink}>
              <ArrowLeft size={17} aria-hidden />
              Voltar ao cardápio
            </Link>
          ) : (
            <button
              className="order-tracker__empty-action"
              type="button"
              onClick={() => window.location.reload()}
            >
              <RefreshCw size={17} aria-hidden />
              Atualizar
            </button>
          )}
        </section>
      </main>
    );
  }

  if (order.status === "delivered") {
    return (
      <main className="order-tracker">
        <section className="order-tracker__card order-tracker__card--finished">
          <div className="order-tracker__finished-icon">
            <CheckCircle2 size={30} aria-hidden />
          </div>

          <div className="order-tracker__finished-heading">
            <span className="order-tracker__eyebrow">Pedido finalizado</span>
            <h1 className="order-tracker__title">Obrigado, {order.customerName || "cliente"}!</h1>
            <p className="order-tracker__finished-text">
              O pedido {order.code} foi finalizado. Sua experiência ajuda a loja a melhorar o atendimento.
            </p>
          </div>

          <div className="order-tracker__finished-summary">
            <span className="order-tracker__finished-label">Cliente</span>
            <strong>{order.customerName}</strong>
            <span className="order-tracker__finished-label">Total</span>
            <strong>{formatCurrency(order.total)}</strong>
          </div>

          {googleReviewUrl ? (
            <div className="order-tracker__review-card">
              <h2 className="order-tracker__review-title">Avalie no Google</h2>
              <p className="order-tracker__review-text">
                Toque no botão abaixo para abrir a página oficial de avaliação da loja.
              </p>
              <a
                className="order-tracker__review-action"
                href={googleReviewUrl}
                target="_blank"
                rel="noreferrer"
              >
                <ExternalLink size={18} aria-hidden />
                Avaliar no Google
              </a>
            </div>
          ) : (
            <div className="order-tracker__review-card">
              <h2 className="order-tracker__review-title">Como foi sua experiência?</h2>
              <div className="order-tracker__rating" aria-label="Nota da avaliação">
                {[1, 2, 3, 4, 5].map((value) => (
                  <button
                    className={`order-tracker__rating-button${
                      value <= rating ? " order-tracker__rating-button--selected" : ""
                    }`}
                    type="button"
                    key={value}
                    onClick={() => setRating(value)}
                    aria-label={`${value} estrela${value === 1 ? "" : "s"}`}
                    aria-pressed={value <= rating}
                  >
                    <Star fill={value <= rating ? "currentColor" : "none"} size={24} aria-hidden />
                  </button>
                ))}
              </div>

              <label className="order-tracker__feedback-field">
                <span>Comentário opcional</span>
                <textarea
                  className="order-tracker__feedback-textarea"
                  value={comment}
                  onChange={(event) => setComment(event.target.value)}
                  rows={4}
                  maxLength={500}
                  placeholder="Conte rapidamente como foi o atendimento..."
                />
              </label>

              {feedbackError ? <p className="order-tracker__feedback-error">{feedbackError}</p> : null}
              {feedbackMessage ? <p className="order-tracker__feedback-success">{feedbackMessage}</p> : null}

              <button
                className="order-tracker__review-action"
                type="button"
                onClick={() => void submitFeedback()}
                disabled={isSubmittingFeedback || Boolean(feedbackMessage)}
              >
                {isSubmittingFeedback ? <Loader2 className="order-tracker__spinner" size={18} aria-hidden /> : <Send size={18} aria-hidden />}
                {isSubmittingFeedback ? "Enviando" : "Enviar avaliação"}
              </button>
            </div>
          )}

          {menuLink ? (
            <Link className="order-tracker__empty-action" href={menuLink} onClick={markMenuReturnNotice}>
              <ArrowLeft size={17} aria-hidden />
              Voltar ao cardápio
            </Link>
          ) : null}
        </section>
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
          {order.items.map((item, itemIndex) => (
            <article className="order-tracker__item" key={`${item.menuItemId}-${itemIndex}`}>
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
