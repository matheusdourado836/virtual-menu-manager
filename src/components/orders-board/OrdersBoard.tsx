"use client";

import { Bell, Check, ChefHat, CircleDot, Loader2, Search, Store, Trash2, X } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog/ConfirmDialog";
import { EmptyState } from "@/components/ui/empty-state/EmptyState";
import { StatusPill } from "@/components/ui/status-pill/StatusPill";
import { deleteOrder, updateOrderStatus } from "@/lib/services/store-service";
import { formatDateTime, formatElapsedTime } from "@/lib/utils/dates";
import { playUiSound, UI_SOUNDS } from "@/lib/utils/audio";
import { formatCurrency } from "@/lib/utils/money";
import type { Order, OrderStatus } from "@/types/menu";
import "./orders-board.scss";

type OrderGroup = "all" | "new" | "preparing" | "ready" | "finalized" | "cancelled";

const orderGroups: Array<{
  id: OrderGroup;
  label: string;
  statuses: OrderStatus[];
}> = [
  { id: "all", label: "Todos", statuses: ["received", "accepted", "preparing", "ready", "delivered", "cancelled"] },
  { id: "new", label: "Novos", statuses: ["received", "accepted"] },
  { id: "preparing", label: "Em preparo", statuses: ["preparing"] },
  { id: "ready", label: "Prontos", statuses: ["ready"] },
  { id: "finalized", label: "Finalizados", statuses: ["delivered"] },
  { id: "cancelled", label: "Cancelados", statuses: ["cancelled"] },
];

interface OrdersBoardProps {
  storeId: string;
  orders: Order[];
  onFeedback: (message: string, variant?: "success" | "error" | "info") => void;
}

export function OrdersBoard({ storeId, orders, onFeedback }: OrdersBoardProps) {
  const [search, setSearch] = useState("");
  const [activeGroup, setActiveGroup] = useState<OrderGroup>("all");
  const [pendingAction, setPendingAction] = useState<{ orderId: string; action: string } | null>(null);
  const [confirmingOrder, setConfirmingOrder] = useState<Order | null>(null);
  const [deletingOrderId, setDeletingOrderId] = useState("");

  const filteredOrders = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    const selectedStatuses = orderGroups.find((group) => group.id === activeGroup)?.statuses || [];
    const groupOrders = orders.filter((order) => selectedStatuses.includes(order.status));

    if (!normalized) {
      return groupOrders;
    }

    return groupOrders.filter(
      (order) =>
        order.code.toLowerCase().includes(normalized) ||
        order.customerName.toLowerCase().includes(normalized) ||
        order.tableLabel?.toLowerCase().includes(normalized),
    );
  }, [activeGroup, orders, search]);

  const changeStatus = async (order: Order, status: OrderStatus, action: string) => {
    if (status === "delivered") {
      playUiSound(UI_SOUNDS.orderComplete);
    }

    setPendingAction({ orderId: order.id, action });

    try {
      await updateOrderStatus(storeId, order.id, status);
      onFeedback(`Pedido #${order.code} atualizado.`);
    } catch (error) {
      onFeedback(error instanceof Error ? error.message : "Não foi possível atualizar o pedido.", "error");
    } finally {
      setPendingAction(null);
    }
  };

  const confirmRemoveOrder = async () => {
    if (!confirmingOrder) {
      return;
    }

    setDeletingOrderId(confirmingOrder.id);

    try {
      await deleteOrder(storeId, confirmingOrder.id);
      onFeedback(`Pedido #${confirmingOrder.code} excluído.`);
      setConfirmingOrder(null);
    } catch (error) {
      onFeedback(error instanceof Error ? error.message : "Não foi possível excluir o pedido.", "error");
    } finally {
      setDeletingOrderId("");
    }
  };

  const renderActionButton = (
    order: Order,
    action: string,
    label: string,
    icon: ReactNode,
    onClick: () => void,
    isDanger = false,
  ) => {
    const isPending = pendingAction?.orderId === order.id && pendingAction.action === action;
    const isDisabled = Boolean(pendingAction) || Boolean(deletingOrderId);

    return (
      <button
        className={`orders-board__action${isDanger ? " orders-board__action--danger" : ""}`}
        type="button"
        onClick={onClick}
        disabled={isDisabled}
      >
        {isPending ? <Loader2 className="orders-board__spinner" size={15} aria-hidden /> : icon}
        {isPending ? "Atualizando" : label}
      </button>
    );
  };

  const renderStatusActions = (order: Order) => {
    if (order.status === "received") {
      return (
        <>
          {renderActionButton(order, "accepted", "Aceitar", <Check size={16} aria-hidden />, () =>
            changeStatus(order, "accepted", "accepted"),
          )}
          {renderActionButton(order, "preparing", "Preparar", <ChefHat size={16} aria-hidden />, () =>
            changeStatus(order, "preparing", "preparing"),
          )}
          {renderActionButton(order, "cancelled", "Cancelar", <X size={16} aria-hidden />, () =>
            changeStatus(order, "cancelled", "cancelled"),
          )}
        </>
      );
    }

    if (order.status === "accepted") {
      return (
        <>
          {renderActionButton(order, "preparing", "Preparar", <ChefHat size={16} aria-hidden />, () =>
            changeStatus(order, "preparing", "preparing"),
          )}
          {renderActionButton(order, "cancelled", "Cancelar", <X size={16} aria-hidden />, () =>
            changeStatus(order, "cancelled", "cancelled"),
          )}
        </>
      );
    }

    if (order.status === "preparing") {
      return renderActionButton(order, "ready", "Pronto", <Bell size={16} aria-hidden />, () =>
        changeStatus(order, "ready", "ready"),
      );
    }

    if (order.status === "ready") {
      return renderActionButton(order, "delivered", "Finalizar", <Check size={16} aria-hidden />, () =>
        changeStatus(order, "delivered", "delivered"),
      );
    }

    return null;
  };

  return (
    <section className="orders-board">
      <div className="orders-board__toolbar">
        <div className="orders-board__filters" role="tablist" aria-label="Filtrar pedidos por status">
          {orderGroups.map((group) => {
            const count = orders.filter((order) => group.statuses.includes(order.status)).length;

            return (
              <button
                className={`orders-board__filter${activeGroup === group.id ? " orders-board__filter--active" : ""}`}
                type="button"
                role="tab"
                aria-selected={activeGroup === group.id}
                key={group.id}
                onClick={() => setActiveGroup(group.id)}
              >
                {group.label}
                <span className="orders-board__filter-count">{count}</span>
              </button>
            );
          })}
        </div>

        <div className="orders-board__toolbar-actions">
          <label className="orders-board__search">
            <Search size={18} aria-hidden />
            <input
              className="orders-board__search-input"
              value={search}
              placeholder="Buscar código, nome ou mesa"
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
        </div>
      </div>

      <div className="orders-board__list">
        {!orders.length ? (
          <EmptyState
            icon={<Bell size={28} aria-hidden />}
            title="Sem pedidos ainda"
            text="Crie um pedido pelo painel ou aguarde um cliente enviar pelo cardápio."
          />
        ) : filteredOrders.length ? (
          filteredOrders.map((order) => (
            <article className={`orders-board__order orders-board__order--${order.status}`} key={order.id}>
              <div className="orders-board__identity">
                <span className="orders-board__order-icon">
                  {order.tableLabel ? <Store size={20} aria-hidden /> : <CircleDot size={20} aria-hidden />}
                </span>
                <span className="orders-board__order-heading">
                  <strong>{order.tableLabel || order.customerName || "Balcão"}</strong>
                  <small className="orders-board__order-meta">
                    #{order.code} · {order.items.length} itens · {formatCurrency(order.total)}
                  </small>
                </span>
              </div>

              <div className="orders-board__items">
                {order.items.slice(0, 3).map((item) => (
                  <p className="orders-board__item-line" key={`${order.id}-${item.menuItemId}`}>
                    <strong className="orders-board__item-quantity">{item.quantity}x</strong> {item.name}
                  </p>
                ))}
                {order.items.length > 3 ? (
                  <span className="orders-board__more-items">+ {order.items.length - 3} itens</span>
                ) : null}
              </div>

              <time className="orders-board__time" dateTime={order.createdAt}>
                {formatDateTime(order.createdAt)}
              </time>

              <div className="orders-board__actions">
                <span className="orders-board__status-summary">
                  <StatusPill status={order.status} />
                  <span className="orders-board__wait">{formatElapsedTime(order.createdAt)}</span>
                </span>
                {renderStatusActions(order)}
                <button
                  className="orders-board__action orders-board__action--danger"
                  type="button"
                  onClick={() => setConfirmingOrder(order)}
                  disabled={Boolean(pendingAction) || Boolean(deletingOrderId)}
                >
                  <Trash2 size={15} aria-hidden />
                  Excluir
                </button>
              </div>

              {order.observation ? <p className="orders-board__note">{order.observation}</p> : null}
            </article>
          ))
        ) : (
          <div className="orders-board__empty">
            <Search size={24} aria-hidden />
            <strong className="orders-board__empty-title">Nenhum pedido encontrado</strong>
            <span className="orders-board__empty-text">Ajuste o status selecionado ou o termo de busca.</span>
          </div>
        )}
      </div>

      {confirmingOrder ? (
        <ConfirmDialog
          title="Tem certeza que deseja excluir este pedido?"
          description={`Essa ação não pode ser desfeita. O pedido #${confirmingOrder.code} será removido da lista e do acompanhamento do cliente.`}
          confirmLabel="Excluir pedido"
          isLoading={deletingOrderId === confirmingOrder.id}
          onCancel={() => {
            if (!deletingOrderId) {
              setConfirmingOrder(null);
            }
          }}
          onConfirm={confirmRemoveOrder}
        />
      ) : null}
    </section>
  );
}
