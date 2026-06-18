"use client";

import { CalendarClock, CreditCard, Phone, ReceiptText, Store, UserRound, X } from "lucide-react";
import { useEffect } from "react";
import { StatusPill } from "@/components/ui/status-pill/StatusPill";
import { formatDateTime } from "@/lib/utils/dates";
import { formatCurrency } from "@/lib/utils/money";
import { getPaymentMethodLabel, getPaymentStatusLabel } from "@/lib/utils/payment";
import type { Order } from "@/types/menu";
import "./order-details-dialog.scss";

interface OrderDetailsDialogProps {
  order: Order;
  onClose: () => void;
}

export function OrderDetailsDialog({ order, onClose }: OrderDetailsDialogProps) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", closeOnEscape);

    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  const timeline = [
    { label: "Criado", value: order.createdAt },
    { label: "Aceito", value: order.acceptedAt },
    { label: "Em preparo", value: order.preparingAt },
    { label: "Pronto", value: order.readyAt },
    { label: "Finalizado", value: order.deliveredAt },
    { label: "Cancelado", value: order.cancelledAt },
  ].filter((event) => Boolean(event.value));

  return (
    <div className="order-details-dialog" role="presentation" onMouseDown={onClose}>
      <section
        className="order-details-dialog__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="order-details-dialog-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="order-details-dialog__header">
          <div className="order-details-dialog__heading">
            <span className="order-details-dialog__eyebrow">Detalhes do pedido</span>
            <h2 className="order-details-dialog__title" id="order-details-dialog-title">
              Pedido #{order.code}
            </h2>
          </div>
          <button className="order-details-dialog__close" type="button" onClick={onClose} aria-label="Fechar">
            <X size={20} aria-hidden />
          </button>
        </header>

        <div className="order-details-dialog__content">
          <section className="order-details-dialog__summary">
            <span className="order-details-dialog__summary-icon">
              {order.tableLabel ? <Store size={20} aria-hidden /> : <UserRound size={20} aria-hidden />}
            </span>
            <div className="order-details-dialog__summary-copy">
              <strong>{order.tableLabel || order.customerName || "Balcão"}</strong>
              <span className="order-details-dialog__summary-detail">
                {order.tableLabel ? order.customerName || "Cliente não informado" : "Pedido balcão"}
              </span>
            </div>
            <StatusPill status={order.status} />
          </section>

          <section className="order-details-dialog__section">
            <h3 className="order-details-dialog__section-title">
              <ReceiptText size={18} aria-hidden />
              Informações
            </h3>
            <dl className="order-details-dialog__info-grid">
              <div className="order-details-dialog__info">
                <dt className="order-details-dialog__info-label">Cliente</dt>
                <dd className="order-details-dialog__info-value">{order.customerName || "Não informado"}</dd>
              </div>
              <div className="order-details-dialog__info">
                <dt className="order-details-dialog__info-label">Telefone</dt>
                <dd className="order-details-dialog__info-value">{order.customerPhone || "Não informado"}</dd>
              </div>
              <div className="order-details-dialog__info">
                <dt className="order-details-dialog__info-label">Origem</dt>
                <dd className="order-details-dialog__info-value">{order.tableLabel ? `Mesa ${order.tableLabel}` : "Balcão"}</dd>
              </div>
              <div className="order-details-dialog__info">
                <dt className="order-details-dialog__info-label">Criado em</dt>
                <dd className="order-details-dialog__info-value">{formatDateTime(order.createdAt)}</dd>
              </div>
            </dl>
          </section>

          <section className="order-details-dialog__section">
            <h3 className="order-details-dialog__section-title">
              <CreditCard size={18} aria-hidden />
              Pagamento
            </h3>
            <dl className="order-details-dialog__info-grid">
              <div className="order-details-dialog__info">
                <dt className="order-details-dialog__info-label">Forma</dt>
                <dd className="order-details-dialog__info-value">{getPaymentMethodLabel(order.paymentMethod)}</dd>
              </div>
              <div className="order-details-dialog__info">
                <dt className="order-details-dialog__info-label">Status</dt>
                <dd className="order-details-dialog__info-value">{getPaymentStatusLabel(order.paymentStatus)}</dd>
              </div>
              <div className="order-details-dialog__info">
                <dt className="order-details-dialog__info-label">Subtotal</dt>
                <dd className="order-details-dialog__info-value">{formatCurrency(order.subtotal)}</dd>
              </div>
              <div className="order-details-dialog__info">
                <dt className="order-details-dialog__info-label">Total</dt>
                <dd className="order-details-dialog__info-value">{formatCurrency(order.total)}</dd>
              </div>
            </dl>
          </section>

          <section className="order-details-dialog__section">
            <h3 className="order-details-dialog__section-title">Itens</h3>
            <div className="order-details-dialog__items">
              {order.items.map((item, index) => (
                <article className="order-details-dialog__item" key={`${item.menuItemId}-${index}`}>
                  <div className="order-details-dialog__item-header">
                    <span className="order-details-dialog__item-copy">
                      <strong>{item.name}</strong>
                      <small className="order-details-dialog__item-meta">
                        {item.quantity}x {formatCurrency(item.unitPrice)}
                      </small>
                    </span>
                    <strong className="order-details-dialog__line-total">{formatCurrency(item.lineTotal)}</strong>
                  </div>

                  {item.selectedOptions.length ? (
                    <ul className="order-details-dialog__options">
                      {item.selectedOptions.map((option) => (
                        <li className="order-details-dialog__option" key={`${item.menuItemId}-${option.choiceId}`}>
                          <span>{option.choiceName}</span>
                          <strong className="order-details-dialog__option-price">+ {formatCurrency(option.price)}</strong>
                        </li>
                      ))}
                    </ul>
                  ) : null}

                  {item.observation ? (
                    <p className="order-details-dialog__note">Obs. do item: {item.observation}</p>
                  ) : null}
                </article>
              ))}
            </div>
          </section>

          {order.observation || order.cancelReason ? (
            <section className="order-details-dialog__section">
              <h3 className="order-details-dialog__section-title">
                <Phone size={18} aria-hidden />
                Observações
              </h3>
              {order.observation ? <p className="order-details-dialog__note">{order.observation}</p> : null}
              {order.cancelReason ? <p className="order-details-dialog__note">Cancelamento: {order.cancelReason}</p> : null}
            </section>
          ) : null}

          <section className="order-details-dialog__section">
            <h3 className="order-details-dialog__section-title">
              <CalendarClock size={18} aria-hidden />
              Linha do tempo
            </h3>
            <div className="order-details-dialog__timeline">
              {timeline.map((event) => (
                <span className="order-details-dialog__timeline-item" key={event.label}>
                  <strong className="order-details-dialog__timeline-label">{event.label}</strong>
                  <small className="order-details-dialog__timeline-time">{formatDateTime(event.value || "")}</small>
                </span>
              ))}
            </div>
          </section>

          <section className="order-details-dialog__totals" aria-label="Totais do pedido">
            <span className="order-details-dialog__total-row">
              <small className="order-details-dialog__total-label">Subtotal</small>
              <strong className="order-details-dialog__total-value">{formatCurrency(order.subtotal)}</strong>
            </span>
            {order.serviceFee ? (
              <span className="order-details-dialog__total-row">
                <small className="order-details-dialog__total-label">Taxa</small>
                <strong className="order-details-dialog__total-value">{formatCurrency(order.serviceFee)}</strong>
              </span>
            ) : null}
            <span className="order-details-dialog__total-row order-details-dialog__total-row--grand">
              <small className="order-details-dialog__total-label">Total</small>
              <strong className="order-details-dialog__total-value">{formatCurrency(order.total)}</strong>
            </span>
          </section>
        </div>

        <footer className="order-details-dialog__footer">
          <button className="order-details-dialog__button" type="button" onClick={onClose}>
            Fechar
          </button>
        </footer>
      </section>
    </div>
  );
}
