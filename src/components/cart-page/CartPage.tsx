"use client";

import { ArrowLeft, Minus, Plus, ReceiptText, Send, ShoppingBag, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ThemeScope } from "@/components/theme-scope/ThemeScope";
import { EmptyState } from "@/components/ui/empty-state/EmptyState";
import { LoadingState } from "@/components/ui/loading-state/LoadingState";
import {
  describeCartReconciliation,
  getCartSubtotal,
  getLineTotal,
  readStoredCart,
  reconcileCartWithMenu,
  writeStoredCart,
} from "@/features/cart/cart-utils";
import { writeStoredOrderReference } from "@/features/order-tracking/order-tracking-storage";
import {
  MAX_CUSTOMER_NAME_LENGTH,
  MAX_ORDER_ITEM_QUANTITY,
  MAX_ORDER_OBSERVATION_LENGTH,
  MIN_CUSTOMER_NAME_LENGTH,
} from "@/lib/constants/order";
import { reportCartReconciliation, reportOrderSubmissionError } from "@/lib/errors/order-submission-error";
import { createOrder, getStoreBundleBySlug } from "@/lib/services/store-service";
import { formatPhoneInput, isValidBrazilianPhone } from "@/lib/utils/input-format";
import { formatCurrency } from "@/lib/utils/money";
import { getStoreOpenState } from "@/lib/utils/opening-hours";
import type { CartLine, PaymentMethod, StoreBundle } from "@/types/menu";
import "./cart-page.scss";

interface CartPageProps {
  slug: string;
  tableId?: string;
}

const minuteInMilliseconds = 60 * 1000;

export function CartPage({ slug, tableId }: CartPageProps) {
  const router = useRouter();
  const [bundle, setBundle] = useState<StoreBundle | null>(null);
  const [cartLines, setCartLines] = useState<CartLine[]>([]);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("pay_on_pickup");
  const [observation, setObservation] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    let isMounted = true;

    getStoreBundleBySlug(slug)
      .then((loadedBundle) => {
        if (!isMounted) {
          return;
        }

        if (loadedBundle && tableId) {
          const loadedTable = loadedBundle.tables.find((candidate) => candidate.id === tableId && candidate.isActive);

          if (!loadedTable) {
            setBundle(null);
            setCartLines([]);
            setLoadError("Mesa não encontrada ou inativa.");
            return;
          }
        }

        setBundle(loadedBundle);

        if (loadedBundle) {
          const storedCart = readStoredCart(loadedBundle.store.id, tableId);
          const reconciliation = reconcileCartWithMenu(storedCart, loadedBundle.menuItems);

          setCartLines(reconciliation.lines);

          if (reconciliation.changes.length) {
            writeStoredCart(loadedBundle.store.id, tableId, reconciliation.lines);
            setError(describeCartReconciliation(reconciliation.changes));
            reportCartReconciliation(reconciliation.changes, {
              storeId: loadedBundle.store.id,
              storeSlug: slug,
              tableId,
            });
          }
        }

        setLoadError("");
      })
      .catch((loadErrorValue) => {
        if (!isMounted) {
          return;
        }

        setBundle(null);
        setLoadError(
          loadErrorValue instanceof Error ? loadErrorValue.message : "Não foi possível carregar o carrinho.",
        );
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [slug, tableId]);

  useEffect(() => {
    const intervalId = window.setInterval(() => setNow(new Date()), minuteInMilliseconds);
    return () => window.clearInterval(intervalId);
  }, []);

  const table = useMemo(
    () => bundle?.tables.find((candidate) => candidate.id === tableId && candidate.isActive),
    [bundle, tableId],
  );

  const subtotal = useMemo(() => getCartSubtotal(cartLines), [cartLines]);
  const storeOpenState = useMemo(() => (bundle ? getStoreOpenState(bundle.store, now) : null), [bundle, now]);
  const menuLink = table?.id ? `/loja/${slug}/mesa/${table.id}` : `/loja/${slug}`;
  const isTableOrder = Boolean(table);

  const updateCart = (lines: CartLine[]) => {
    setError("");
    setCartLines(lines);

    if (bundle) {
      writeStoredCart(bundle.store.id, table?.id, lines);
    }
  };

  const updateQuantity = (lineId: string, quantity: number) => {
    if (quantity < 1) {
      updateCart(cartLines.filter((line) => line.id !== lineId));
      return;
    }

    const safeQuantity = Math.min(quantity, MAX_ORDER_ITEM_QUANTITY);
    updateCart(cartLines.map((line) => (line.id === lineId ? { ...line, quantity: safeQuantity } : line)));
  };

  const removeLine = (lineId: string) => {
    updateCart(cartLines.filter((line) => line.id !== lineId));
  };

  const submitOrder = async () => {
    if (!bundle) {
      return;
    }

    setError("");

    if (!storeOpenState?.isOpen) {
      setError(storeOpenState?.message || "A loja está fechada no momento.");
      return;
    }

    if (!isTableOrder && customerName.trim().length < MIN_CUSTOMER_NAME_LENGTH) {
      setError(`Informe um nome com pelo menos ${MIN_CUSTOMER_NAME_LENGTH} caracteres.`);
      return;
    }

    if (!isTableOrder && customerPhone.trim() && !isValidBrazilianPhone(customerPhone)) {
      setError("Informe um telefone válido com DDD.");
      return;
    }

    if (!cartLines.length) {
      setError("Adicione pelo menos um item ao carrinho.");
      return;
    }

    if (cartLines.some((line) => line.quantity < 1 || line.quantity > MAX_ORDER_ITEM_QUANTITY)) {
      setError(`Cada item pode ter no máximo ${MAX_ORDER_ITEM_QUANTITY} unidades. Revise o carrinho.`);
      return;
    }

    setIsSubmitting(true);

    try {
      const order = await createOrder({
        storeId: bundle.store.id,
        tableId: table?.id,
        tableLabel: table?.label,
        customerName: isTableOrder ? undefined : customerName.trim(),
        customerPhone: isTableOrder ? undefined : customerPhone.trim() || undefined,
        paymentMethod,
        observation: observation.trim() || undefined,
        items: cartLines.map((line) => ({
          menuItemId: line.menuItemId,
          expectedUnitPrice: line.unitPrice,
          quantity: line.quantity,
          observation: line.observation,
          selectedOptions: line.selectedOptions.map((option) => ({
            groupId: option.groupId,
            choiceId: option.choiceId,
            expectedPrice: option.price,
          })),
        })),
      });

      writeStoredOrderReference(bundle.store.id, table?.id, order.id, menuLink);
      updateCart([]);
      router.push(`/pedido/${order.id}`);
    } catch (submitError) {
      const failure = reportOrderSubmissionError(submitError, {
        storeId: bundle.store.id,
        storeSlug: slug,
        tableId: table?.id,
        paymentMethod,
        itemIds: cartLines.map((line) => line.menuItemId),
        unitsCount: cartLines.reduce((total, line) => total + line.quantity, 0),
        selectedOptionsCount: cartLines.reduce((total, line) => total + line.selectedOptions.length, 0),
        hasCustomerPhone: Boolean(customerPhone.trim()),
        hasObservation: Boolean(observation.trim()),
      });
      const supportCode = failure.supportCode || (!failure.isExpected ? failure.eventId.slice(0, 8).toUpperCase() : "");
      const isUnavailableAdditional =
        failure.reason === "additional_unavailable" || failure.reason === "additional_removed";
      const storedItem = failure.itemId
        ? cartLines.find((line) => line.menuItemId === failure.itemId)
        : undefined;
      const storedChoice = failure.choiceId
        ? cartLines
          .filter((line) => !failure.itemId || line.menuItemId === failure.itemId)
          .flatMap((line) => line.selectedOptions)
          .find((option) => option.choiceId === failure.choiceId)
        : undefined;
      let errorMessage = failure.message;

      if (failure.reason === "item_unavailable" && failure.itemId) {
        const itemName = failure.itemName || storedItem?.name || "Este item";
        const updatedLines = cartLines.filter((line) => line.menuItemId !== failure.itemId);

        errorMessage = `O item ${itemName} não está mais disponível.`;

        if (updatedLines.length !== cartLines.length) {
          updateCart(updatedLines);
          errorMessage = updatedLines.length
            ? `${errorMessage} Ele foi removido do seu pedido. Confira o carrinho e tente novamente.`
            : `${errorMessage} Ele foi removido e seu carrinho ficou vazio. Volte ao cardápio para escolher outro item.`;
        }
      }

      if (failure.reason === "additional_removed" && storedChoice?.choiceName) {
        errorMessage = `O adicional ${storedChoice.choiceName} não está mais disponível.`;
      }

      if (isUnavailableAdditional && failure.choiceId) {
        let didUpdateCart = false;
        const updatedLines = cartLines.map((line) => {
          if (failure.itemId && line.menuItemId !== failure.itemId) {
            return line;
          }

          const selectedOptions = line.selectedOptions.filter((option) => option.choiceId !== failure.choiceId);

          if (selectedOptions.length === line.selectedOptions.length) {
            return line;
          }

          didUpdateCart = true;
          return { ...line, selectedOptions };
        });

        if (didUpdateCart) {
          updateCart(updatedLines);
          errorMessage = `${errorMessage} Ele foi removido do seu pedido. Confira o carrinho e tente novamente.`;
        }
      }

      if (failure.reason === "options_group_changed" && failure.itemId && failure.groupId) {
        let didUpdateCart = false;
        const updatedLines = cartLines.map((line) => {
          if (line.menuItemId !== failure.itemId) return line;

          const selectedOptions = line.selectedOptions.filter((option) => option.groupId !== failure.groupId);

          if (selectedOptions.length === line.selectedOptions.length) return line;

          didUpdateCart = true;
          return { ...line, selectedOptions };
        });

        if (didUpdateCart) {
          updateCart(updatedLines);
          errorMessage = `${errorMessage} As opções antigas foram removidas. Confira o carrinho e tente novamente.`;
        }
      }

      if (failure.reason === "item_price_changed" && failure.itemId && failure.currentPrice !== undefined) {
        let didUpdateCart = false;
        const updatedLines = cartLines.map((line) => {
          if (line.menuItemId !== failure.itemId || line.unitPrice === failure.currentPrice) return line;

          didUpdateCart = true;
          return { ...line, unitPrice: failure.currentPrice! };
        });
        const itemName = failure.itemName || storedItem?.name || "o item";
        const previousPrice = failure.previousPrice ?? storedItem?.unitPrice;

        errorMessage = previousPrice !== undefined
          ? `O preço de ${itemName} mudou de ${formatCurrency(previousPrice)} para ${formatCurrency(failure.currentPrice)}.`
          : `O preço de ${itemName} foi atualizado para ${formatCurrency(failure.currentPrice)}.`;

        if (didUpdateCart) {
          updateCart(updatedLines);
          errorMessage = `${errorMessage} O carrinho foi atualizado. Confira o total e tente novamente.`;
        }
      }

      if (
        failure.reason === "additional_price_changed"
        && failure.itemId
        && failure.choiceId
        && failure.currentPrice !== undefined
      ) {
        let didUpdateCart = false;
        const updatedLines = cartLines.map((line) => {
          if (line.menuItemId !== failure.itemId) return line;

          const selectedOptions = line.selectedOptions.map((option) => {
            if (option.choiceId !== failure.choiceId || option.price === failure.currentPrice) return option;

            didUpdateCart = true;
            return { ...option, price: failure.currentPrice! };
          });

          return didUpdateCart ? { ...line, selectedOptions } : line;
        });
        const choiceName = failure.choiceName || storedChoice?.choiceName || "adicional";
        const previousPrice = failure.previousPrice ?? storedChoice?.price;

        errorMessage = previousPrice !== undefined
          ? `O preço do adicional ${choiceName} mudou de ${formatCurrency(previousPrice)} para ${formatCurrency(failure.currentPrice)}.`
          : `O preço do adicional ${choiceName} foi atualizado para ${formatCurrency(failure.currentPrice)}.`;

        if (didUpdateCart) {
          updateCart(updatedLines);
          errorMessage = `${errorMessage} O carrinho foi atualizado. Confira o total e tente novamente.`;
        }
      }

      if (
        failure.itemId
        && ["required_options_missing", "options_limit_exceeded", "options_invalid"].includes(failure.reason || "")
      ) {
        const updatedLines = cartLines.filter((line) => line.menuItemId !== failure.itemId);

        if (updatedLines.length !== cartLines.length) {
          updateCart(updatedLines);
          errorMessage = updatedLines.length
            ? `${errorMessage} O item foi removido para ser personalizado novamente.`
            : `${errorMessage} O item foi removido e seu carrinho ficou vazio.`;
        }
      }

      setError(`${errorMessage}${supportCode ? ` Código de suporte: ${supportCode}.` : ""}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return <LoadingState label="Carregando carrinho" />;
  }

  if (!bundle) {
    return (
      <EmptyState
        icon={<ShoppingBag size={28} aria-hidden />}
        title={loadError ? "Não foi possível carregar o carrinho" : "Loja não encontrada"}
        text={loadError || "Volte para o cardápio e tente novamente."}
      />
    );
  }

  return (
    <ThemeScope theme={bundle.theme}>
      <main className="cart-page">
        <div className="cart-page__shell">
          <div className="cart-page__header">
            <Link className="cart-page__back" href={menuLink} aria-label="Voltar ao cardápio">
              <ArrowLeft size={18} aria-hidden />
            </Link>
            <div className="cart-page__heading">
              <span className="cart-page__eyebrow">Seu pedido</span>
              <h1 className="cart-page__title">{table?.label || "Retirada no balcão"}</h1>
            </div>
            <span className="cart-page__header-total">
              <small className="cart-page__header-label">Subtotal</small>
              <strong className="cart-page__total">{formatCurrency(subtotal)}</strong>
            </span>
          </div>

          {error ? <p className="cart-page__error" role="alert">{error}</p> : null}

          <div className="cart-page__layout">
            <section className="cart-page__items-panel">
              <div className="cart-page__panel-heading">
                <span className="cart-page__panel-icon">
                  <ShoppingBag size={18} aria-hidden />
                </span>
                <div>
                  <h2 className="cart-page__panel-title">Itens selecionados</h2>
                  <p className="cart-page__panel-subtitle">
                    {cartLines.length} {cartLines.length === 1 ? "item" : "itens"} no pedido
                  </p>
                </div>
              </div>

              {cartLines.length ? (
                <div className="cart-page__lines">
                  {cartLines.map((line) => (
                    <article className="cart-page__line" key={line.id}>
                      <div className="cart-page__line-copy">
                        <strong className="cart-page__line-title">{line.name}</strong>
                        {line.selectedOptions.length ? (
                          <span className="cart-page__line-detail">
                            {line.selectedOptions.map((option) => option.choiceName).join(", ")}
                          </span>
                        ) : null}
                        {line.observation ? <span className="cart-page__line-detail">{line.observation}</span> : null}
                      </div>

                      <strong className="cart-page__line-total">{formatCurrency(getLineTotal(line))}</strong>

                      <div className="cart-page__actions">
                        <button
                          className="cart-page__icon-button"
                          type="button"
                          onClick={() => updateQuantity(line.id, line.quantity - 1)}
                          aria-label="Diminuir quantidade"
                          title="Diminuir quantidade"
                        >
                          <Minus size={16} aria-hidden />
                        </button>
                        <span className="cart-page__quantity">{line.quantity}</span>
                        <button
                          className="cart-page__icon-button"
                          type="button"
                          onClick={() => updateQuantity(line.id, line.quantity + 1)}
                          disabled={line.quantity >= MAX_ORDER_ITEM_QUANTITY}
                          aria-label="Aumentar quantidade"
                          title="Aumentar quantidade"
                        >
                          <Plus size={16} aria-hidden />
                        </button>
                        <button
                          className="cart-page__remove"
                          type="button"
                          onClick={() => removeLine(line.id)}
                          aria-label="Remover item"
                          title="Remover item"
                        >
                          <Trash2 size={16} aria-hidden />
                          Remover
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <EmptyState
                  icon={<ShoppingBag size={28} aria-hidden />}
                  title="Carrinho vazio"
                  text="Volte ao cardápio para adicionar itens ao pedido."
                  action={
                    <Link className="cart-page__empty-action" href={menuLink}>
                      Ver cardápio
                    </Link>
                  }
                />
              )}
            </section>

            {cartLines.length ? (
              <aside className="cart-page__checkout">
                <div className="cart-page__panel-heading">
                  <span className="cart-page__panel-icon">
                    <ReceiptText size={18} aria-hidden />
                  </span>
                  <div>
                    <h2 className="cart-page__panel-title">Finalizar pedido</h2>
                    <p className="cart-page__panel-subtitle">
                      {isTableOrder ? "Pedido vinculado à mesa" : "Confirme seus dados para enviar"}
                    </p>
                  </div>
                </div>

                <div className="cart-page__form">
                  {isTableOrder ? (
                    <div className="cart-page__table-context">
                      <span className="cart-page__table-eyebrow">Mesa do pedido</span>
                      <strong className="cart-page__table-name">{table?.label}</strong>
                    </div>
                  ) : (
                    <>
                      <label className="cart-page__field">
                        <span className="cart-page__label">Nome *</span>
                        <input
                          className="cart-page__control"
                          value={customerName}
                          maxLength={MAX_CUSTOMER_NAME_LENGTH}
                          placeholder="Como podemos chamar você?"
                          onChange={(event) => setCustomerName(event.target.value)}
                          required
                        />
                      </label>

                      <label className="cart-page__field">
                        <span className="cart-page__label">Telefone opcional</span>
                        <input
                          className="cart-page__control"
                          value={customerPhone}
                          type="tel"
                          inputMode="tel"
                          autoComplete="tel"
                          maxLength={15}
                          placeholder="(00) 00000-0000"
                          onChange={(event) => setCustomerPhone(formatPhoneInput(event.target.value))}
                        />
                      </label>
                    </>
                  )}

                  <label className="cart-page__field">
                    <span className="cart-page__label">Pagamento *</span>
                    <select
                      className="cart-page__control"
                      value={paymentMethod}
                      onChange={(event) => setPaymentMethod(event.target.value as PaymentMethod)}
                      required
                    >
                      <option value="pay_on_pickup">Pagar na retirada</option>
                      <option value="pix_on_pickup">Pix na retirada</option>
                      <option value="card_on_pickup">Cartão na retirada</option>
                      <option value="cash_on_pickup">Dinheiro na retirada</option>
                    </select>
                  </label>

                  <label className="cart-page__field">
                    <span className="cart-page__label">Observação do pedido</span>
                    <textarea
                          className="cart-page__control cart-page__control--textarea"
                          value={observation}
                          maxLength={MAX_ORDER_OBSERVATION_LENGTH}
                      rows={3}
                      placeholder="Algo que precisamos saber?"
                      onChange={(event) => setObservation(event.target.value)}
                    />
                  </label>
                </div>

                <div className="cart-page__summary">
                  <span className="cart-page__summary-label">Total do pedido</span>
                  <strong className="cart-page__summary-total">{formatCurrency(subtotal)}</strong>
                </div>

                <button className="cart-page__submit" type="button" disabled={isSubmitting} onClick={submitOrder}>
                  <Send size={18} aria-hidden />
                  {isSubmitting ? "Enviando" : "Enviar pedido"}
                </button>
              </aside>
            ) : null}
          </div>
        </div>
      </main>
    </ThemeScope>
  );
}
