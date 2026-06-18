"use client";

import {
  Bell,
  Check,
  ChefHat,
  CircleDot,
  Eye,
  Loader2,
  MoreHorizontal,
  Search,
  Store,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog/ConfirmDialog";
import { EmptyState } from "@/components/ui/empty-state/EmptyState";
import { OrderDetailsDialog } from "@/components/order-details-dialog/OrderDetailsDialog";
import { StatusPill } from "@/components/ui/status-pill/StatusPill";
import { deleteOrder, updateOrderStatus } from "@/lib/services/store-service";
import { formatDateTime } from "@/lib/utils/dates";
import { playUiSound, UI_SOUNDS } from "@/lib/utils/audio";
import { formatCurrency } from "@/lib/utils/money";
import { getPaymentMethodLabel } from "@/lib/utils/payment";
import type { Order, OrderStatus } from "@/types/menu";
import "./orders-board.scss";

type OrderGroup =
  | "all"
  | "new"
  | "preparing"
  | "ready"
  | "finalized"
  | "cancelled";

const orderGroups: Array<{
  id: OrderGroup;
  label: string;
  statuses: OrderStatus[];
}> = [
  {
    id: "all",
    label: "Todos",
    statuses: [
      "received",
      "accepted",
      "preparing",
      "ready",
      "delivered",
      "cancelled",
    ],
  },
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
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const [pendingAction, setPendingAction] = useState<{
    orderId: string;
    action: string;
  } | null>(null);
  const [confirmingOrder, setConfirmingOrder] = useState<Order | null>(null);
  const [cancellingOrder, setCancellingOrder] = useState<Order | null>(null);
  const [deletingOrderId, setDeletingOrderId] = useState("");
  const [openActionsOrderId, setOpenActionsOrderId] = useState("");
  const actionsMenuRef = useRef<HTMLDivElement | null>(null);

  const selectedOrder = useMemo(
    () => orders.find((order) => order.id === selectedOrderId) || null,
    [orders, selectedOrderId],
  );

  const filteredOrders = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    const selectedStatuses =
      orderGroups.find((group) => group.id === activeGroup)?.statuses || [];
    const groupOrders = orders.filter((order) =>
      selectedStatuses.includes(order.status),
    );

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

  useEffect(() => {
    if (!openActionsOrderId) {
      return;
    }

    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!actionsMenuRef.current?.contains(event.target as Node)) {
        setOpenActionsOrderId("");
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenActionsOrderId("");
      }
    };

    document.addEventListener("pointerdown", closeOnOutsideClick);
    window.addEventListener("keydown", closeOnEscape);

    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [openActionsOrderId]);

  const changeStatus = async (
    order: Order,
    status: OrderStatus,
    action: string,
  ) => {
    setPendingAction({ orderId: order.id, action });

    try {
      await updateOrderStatus(storeId, order.id, status);

      if (status === "delivered") {
        playUiSound(UI_SOUNDS.orderComplete);
      }

      onFeedback(`Pedido #${order.code} atualizado.`);
      return true;
    } catch (error) {
      onFeedback(
        error instanceof Error
          ? error.message
          : "Não foi possível atualizar o pedido.",
        "error",
      );
      return false;
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
      onFeedback(
        error instanceof Error
          ? error.message
          : "Não foi possível excluir o pedido.",
        "error",
      );
    } finally {
      setDeletingOrderId("");
    }
  };

  const confirmCancelOrder = async () => {
    if (!cancellingOrder) {
      return;
    }

    const didCancel = await changeStatus(
      cancellingOrder,
      "cancelled",
      "cancelled",
    );

    if (didCancel) {
      setCancellingOrder(null);
    }
  };

  const renderActionButton = (
    order: Order,
    action: string,
    label: string,
    icon: ReactNode,
    onClick: () => void,
  ) => {
    const isPending =
      pendingAction?.orderId === order.id && pendingAction.action === action;
    const isDisabled = Boolean(pendingAction) || Boolean(deletingOrderId);

    return (
      <button
        aria-label={`${label} pedido ${order.code}`}
        className="orders-board__action orders-board__action--primary"
        type="button"
        onClick={onClick}
        disabled={isDisabled}
      >
        {isPending ? (
          <Loader2 className="orders-board__spinner" size={15} aria-hidden />
        ) : (
          icon
        )}
        {isPending ? "Atualizando" : label}
      </button>
    );
  };

  const shouldOpenOrderDetails = (target: EventTarget | null) =>
    target instanceof HTMLElement &&
    !target.closest("button, a, input, textarea, select, label");

  const renderPrimaryAction = (order: Order) => {
    if (order.status === "received") {
      return renderActionButton(
        order,
        "accepted",
        "Aceitar",
        <Check size={16} aria-hidden />,
        () => changeStatus(order, "accepted", "accepted"),
      );
    }

    if (order.status === "accepted") {
      return renderActionButton(
        order,
        "preparing",
        "Iniciar preparo",
        <ChefHat size={16} aria-hidden />,
        () => changeStatus(order, "preparing", "preparing"),
      );
    }

    if (order.status === "preparing") {
      return renderActionButton(
        order,
        "ready",
        "Marcar pronto",
        <Bell size={16} aria-hidden />,
        () => changeStatus(order, "ready", "ready"),
      );
    }

    if (order.status === "ready") {
      return renderActionButton(
        order,
        "delivered",
        "Finalizar",
        <Check size={16} aria-hidden />,
        () => changeStatus(order, "delivered", "delivered"),
      );
    }

    return null;
  };

  return (
    <section className="orders-board">
      <div className="orders-board__toolbar">
        <div
          className="orders-board__filters"
          role="tablist"
          aria-label="Filtrar pedidos por status"
        >
          {orderGroups.map((group) => {
            const count = orders.filter((order) =>
              group.statuses.includes(order.status),
            ).length;

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
          <>
            <div className="orders-board__list-header" aria-hidden="true">
              <span className="orders-board__header-cell orders-board__header-cell--client">
                Cliente
              </span>
              <span className="orders-board__header-cell">Itens</span>
              <span className="orders-board__header-cell orders-board__header-cell--center">
                Pagamento
              </span>
              <span className="orders-board__header-cell orders-board__header-cell--center">
                Criado em
              </span>
              <span className="orders-board__header-cell orders-board__header-cell--center">
                Andamento
              </span>
            </div>
            {filteredOrders.map((order) => (
              <article
                className={`orders-board__order orders-board__order--${order.status}`}
                key={order.id}
                onClick={(event) => {
                  if (shouldOpenOrderDetails(event.target)) {
                    setSelectedOrderId(order.id);
                  }
                }}
              >
                <div className="orders-board__cell orders-board__cell--client">
                  <span className="orders-board__mobile-label">Cliente</span>
                  <div className="orders-board__identity">
                    <span className="orders-board__order-icon">
                      {order.tableLabel ? (
                        <Store size={20} aria-hidden />
                      ) : (
                        <CircleDot size={20} aria-hidden />
                      )}
                    </span>
                    <span className="orders-board__order-heading">
                      <strong>
                        {order.tableLabel || order.customerName || "Balcão"}
                      </strong>
                      <small className="orders-board__order-meta">
                        #{order.code} · {order.items.length} itens ·{" "}
                        {formatCurrency(order.total)}
                      </small>
                    </span>
                  </div>
                </div>

                <div className="orders-board__cell orders-board__cell--items">
                  <span className="orders-board__mobile-label">Itens</span>
                  <div className="orders-board__items">
                    {order.items.slice(0, 3).map((item) => (
                      <p
                        className="orders-board__item-line"
                        key={`${order.id}-${item.menuItemId}`}
                      >
                        <strong className="orders-board__item-quantity">
                          {item.quantity}x
                        </strong>{" "}
                        {item.name}
                      </p>
                    ))}
                    {order.items.length > 3 ? (
                      <span className="orders-board__more-items">
                        + {order.items.length - 3} itens
                      </span>
                    ) : null}
                  </div>
                </div>

                <div className="orders-board__cell orders-board__cell--payment">
                  <span className="orders-board__mobile-label">Pagamento</span>
                  <span className="orders-board__payment">
                    {getPaymentMethodLabel(order.paymentMethod)}
                  </span>
                </div>

                <div className="orders-board__cell orders-board__cell--created">
                  <span className="orders-board__mobile-label">Criado em</span>
                  <time
                    className="orders-board__time"
                    dateTime={order.createdAt}
                  >
                    {formatDateTime(order.createdAt)}
                  </time>
                </div>

                <div className="orders-board__cell orders-board__cell--actions">
                  <span className="orders-board__mobile-label">Andamento</span>
                  <div className="orders-board__actions">
                    <span className="orders-board__status-summary">
                      <StatusPill status={order.status} />
                    </span>
                    {renderPrimaryAction(order)}
                    <div
                      className="orders-board__more"
                      ref={
                        openActionsOrderId === order.id
                          ? actionsMenuRef
                          : undefined
                      }
                    >
                      <button
                        aria-expanded={openActionsOrderId === order.id}
                        aria-haspopup="menu"
                        aria-label={`Mais ações do pedido ${order.code}`}
                        className="orders-board__more-trigger"
                        disabled={
                          Boolean(pendingAction) || Boolean(deletingOrderId)
                        }
                        onClick={() =>
                          setOpenActionsOrderId((currentOrderId) =>
                            currentOrderId === order.id ? "" : order.id,
                          )
                        }
                        type="button"
                      >
                        <MoreHorizontal size={18} aria-hidden />
                      </button>

                      {openActionsOrderId === order.id ? (
                        <div
                          aria-label={`Ações do pedido ${order.code}`}
                          className="orders-board__menu"
                          role="menu"
                        >
                          <button
                            className="orders-board__menu-item"
                            onClick={() => {
                              setOpenActionsOrderId("");
                              setSelectedOrderId(order.id);
                            }}
                            role="menuitem"
                            type="button"
                          >
                            <Eye size={16} aria-hidden />
                            Ver detalhes
                          </button>

                          {order.status !== "delivered" &&
                          order.status !== "cancelled" ? (
                            <button
                              className="orders-board__menu-item"
                              onClick={() => {
                                setOpenActionsOrderId("");
                                setCancellingOrder(order);
                              }}
                              role="menuitem"
                              type="button"
                            >
                              <X size={16} aria-hidden />
                              Cancelar pedido
                            </button>
                          ) : null}

                          <button
                            className="orders-board__menu-item orders-board__menu-item--danger"
                            onClick={() => {
                              setOpenActionsOrderId("");
                              setConfirmingOrder(order);
                            }}
                            role="menuitem"
                            type="button"
                          >
                            <Trash2 size={16} aria-hidden />
                            Excluir pedido
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>

                {order.observation ? (
                  <p className="orders-board__note">{order.observation}</p>
                ) : null}
              </article>
            ))}
          </>
        ) : (
          <div className="orders-board__empty">
            <Search size={24} aria-hidden />
            <strong className="orders-board__empty-title">
              Nenhum pedido encontrado
            </strong>
            <span className="orders-board__empty-text">
              Ajuste o status selecionado ou o termo de busca.
            </span>
          </div>
        )}
      </div>

      {selectedOrder ? (
        <OrderDetailsDialog
          order={selectedOrder}
          onClose={() => setSelectedOrderId("")}
        />
      ) : null}

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

      {cancellingOrder ? (
        <ConfirmDialog
          title="Cancelar este pedido?"
          description={`O pedido #${cancellingOrder.code} será movido para a aba de cancelados e não poderá continuar no fluxo de preparo.`}
          confirmLabel="Cancelar pedido"
          loadingLabel="Cancelando"
          isLoading={
            pendingAction?.orderId === cancellingOrder.id &&
            pendingAction.action === "cancelled"
          }
          onCancel={() => {
            if (!pendingAction) {
              setCancellingOrder(null);
            }
          }}
          onConfirm={confirmCancelOrder}
        />
      ) : null}
    </section>
  );
}
