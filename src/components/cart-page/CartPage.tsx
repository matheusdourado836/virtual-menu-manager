"use client";

import { ArrowLeft, Minus, Plus, ReceiptText, Send, ShoppingBag, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ThemeScope } from "@/components/theme-scope/ThemeScope";
import { EmptyState } from "@/components/ui/empty-state/EmptyState";
import { LoadingState } from "@/components/ui/loading-state/LoadingState";
import { getCartSubtotal, getLineTotal, readStoredCart, writeStoredCart } from "@/features/cart/cart-utils";
import { writeStoredOrderReference } from "@/features/order-tracking/order-tracking-storage";
import { createOrder, getStoreBundleBySlug } from "@/lib/services/store-service";
import { playUiSound, UI_SOUNDS } from "@/lib/utils/audio";
import { formatPhoneInput, isValidBrazilianPhone } from "@/lib/utils/input-format";
import { formatCurrency } from "@/lib/utils/money";
import type { CartLine, PaymentMethod, StoreBundle } from "@/types/menu";
import "./cart-page.scss";

interface CartPageProps {
  slug: string;
  tableId?: string;
}

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

  useEffect(() => {
    let isMounted = true;

    getStoreBundleBySlug(slug)
      .then((loadedBundle) => {
        if (!isMounted) {
          return;
        }

        setBundle(loadedBundle);

        if (loadedBundle) {
          setCartLines(readStoredCart(loadedBundle.store.id, tableId));
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

  const table = useMemo(
    () => bundle?.tables.find((candidate) => candidate.id === tableId && candidate.isActive),
    [bundle, tableId],
  );

  const subtotal = useMemo(() => getCartSubtotal(cartLines), [cartLines]);
  const menuLink = table?.id ? `/loja/${slug}/mesa/${table.id}` : `/loja/${slug}`;

  const updateCart = (lines: CartLine[]) => {
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

    updateCart(cartLines.map((line) => (line.id === lineId ? { ...line, quantity } : line)));
  };

  const removeLine = (lineId: string) => {
    updateCart(cartLines.filter((line) => line.id !== lineId));
  };

  const submitOrder = async () => {
    if (!bundle) {
      return;
    }

    setError("");

    if (!customerName.trim()) {
      setError("Informe seu nome para identificar o pedido.");
      return;
    }

    if (customerPhone.trim() && !isValidBrazilianPhone(customerPhone)) {
      setError("Informe um telefone válido com DDD.");
      return;
    }

    if (!cartLines.length) {
      setError("Adicione pelo menos um item ao carrinho.");
      return;
    }

    playUiSound(UI_SOUNDS.orderComplete);
    setIsSubmitting(true);

    try {
      const order = await createOrder({
        storeId: bundle.store.id,
        tableId: table?.id,
        tableLabel: table?.label,
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim() || undefined,
        paymentMethod,
        observation: observation.trim() || undefined,
        items: cartLines.map((line) => ({
          menuItemId: line.menuItemId,
          quantity: line.quantity,
          observation: line.observation,
          selectedOptions: line.selectedOptions.map((option) => ({
            groupId: option.groupId,
            choiceId: option.choiceId,
          })),
        })),
      });

      writeStoredOrderReference(bundle.store.id, table?.id, order.id, menuLink);
      updateCart([]);
      router.push(`/pedido/${order.id}`);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Não foi possível enviar o pedido.");
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
                    <p className="cart-page__panel-subtitle">Confirme seus dados para enviar</p>
                  </div>
                </div>

                <div className="cart-page__form">
                  <label className="cart-page__field">
                    <span className="cart-page__label">Nome *</span>
                    <input
                      className="cart-page__control"
                      value={customerName}
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

                {error ? <p className="cart-page__error">{error}</p> : null}

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
