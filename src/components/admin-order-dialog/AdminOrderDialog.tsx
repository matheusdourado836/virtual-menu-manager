"use client";

import { Minus, Plus, ShoppingBag, Store, Trash2, UserRound, X } from "lucide-react";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import { MenuItemDialog } from "@/components/menu-item-dialog/MenuItemDialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog/ConfirmDialog";
import { createCartLine, getCartSubtotal, getLineTotal } from "@/features/cart/cart-utils";
import { createAdminOrder, createTable } from "@/lib/services/store-service";
import { getFriendlyErrorMessage } from "@/lib/errors/friendly-error";
import { formatPhoneInput, isValidBrazilianPhone } from "@/lib/utils/input-format";
import { formatCurrency } from "@/lib/utils/money";
import type { CartLine, CartSelectedOption, MenuItem, PaymentMethod, StoreBundle, Table } from "@/types/menu";
import "./admin-order-dialog.scss";

type DestinationType = "person" | "table";

interface AdminOrderDialogProps {
  bundle: StoreBundle;
  initialTableId?: string;
  onClose: () => void;
  onCreated: () => void | Promise<void>;
  onFeedback: (message: string, variant?: "success" | "error" | "info") => void;
}

export function AdminOrderDialog({ bundle, initialTableId, onClose, onCreated, onFeedback }: AdminOrderDialogProps) {
  const [destinationType, setDestinationType] = useState<DestinationType>(initialTableId ? "table" : "person");
  const [tables, setTables] = useState<Table[]>(bundle.tables);
  const [selectedTableId, setSelectedTableId] = useState(initialTableId || "");
  const [newTableLabel, setNewTableLabel] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("pay_on_pickup");
  const [selectedCategory, setSelectedCategory] = useState(bundle.categories.find((category) => category.isActive)?.id || "");
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string[]>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [cartLines, setCartLines] = useState<CartLine[]>([]);
  const [error, setError] = useState("");
  const [isCreatingTable, setIsCreatingTable] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDiscardConfirmOpen, setIsDiscardConfirmOpen] = useState(false);

  const requestClose = useCallback(() => {
    if (cartLines.length > 0) {
      setIsDiscardConfirmOpen(true);
    } else {
      onClose();
    }
  }, [cartLines.length, onClose]);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !selectedItem && !isDiscardConfirmOpen) {
        requestClose();
      }
    };

    document.body.classList.add("admin-order-dialog-open");
    window.addEventListener("keydown", closeOnEscape);

    return () => {
      document.body.classList.remove("admin-order-dialog-open");
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [requestClose, selectedItem, isDiscardConfirmOpen]);

  const visibleItems = useMemo(
    () => bundle.menuItems.filter((item) => item.categoryId === selectedCategory && item.isAvailable),
    [bundle.menuItems, selectedCategory],
  );
  const selectedTable = tables.find((table) => table.id === selectedTableId);
  const subtotal = getCartSubtotal(cartLines);
  const canSubmit =
    cartLines.length > 0 &&
    (destinationType === "table" ? Boolean(selectedTable) : customerName.trim().length >= 2) &&
    !isSubmitting;

  const closeItem = useCallback(() => setSelectedItem(null), []);

  const toggleOption = (item: MenuItem, groupId: string, choiceId: string, maxSelected: number) => {
    const current = selectedOptions[item.id] || [];
    const group = item.optionsGroups.find((candidate) => candidate.id === groupId);

    if (!group) {
      return;
    }

    const groupChoiceIds = group.choices.map((choice) => choice.id);
    const selectedInGroup = current.filter((candidate) => groupChoiceIds.includes(candidate));
    const next = current.includes(choiceId)
      ? current.filter((candidate) => candidate !== choiceId)
      : selectedInGroup.length < maxSelected
        ? [...current, choiceId]
        : current;

    setSelectedOptions((state) => ({ ...state, [item.id]: next }));
  };

  const getSelectedOptionDetails = (item: MenuItem): CartSelectedOption[] => {
    const optionIds = selectedOptions[item.id] || [];

    return item.optionsGroups.flatMap((group) =>
      group.choices
        .filter((choice) => optionIds.includes(choice.id))
        .map((choice) => ({
          groupId: group.id,
          groupName: group.name,
          choiceId: choice.id,
          choiceName: choice.name,
          price: choice.price,
        })),
    );
  };

  const addItem = (item: MenuItem, quantity: number) => {
    setCartLines((lines) => [
      ...lines,
      { ...createCartLine(item, getSelectedOptionDetails(item), notes[item.id]), quantity },
    ]);
    setSelectedOptions((state) => ({ ...state, [item.id]: [] }));
    setNotes((state) => ({ ...state, [item.id]: "" }));
    setSelectedItem(null);
  };

  const changeLineQuantity = (lineId: string, delta: number) => {
    setCartLines((lines) =>
      lines
        .map((line) =>
          line.id === lineId ? { ...line, quantity: Math.min(20, Math.max(0, line.quantity + delta)) } : line,
        )
        .filter((line) => line.quantity > 0),
    );
  };

  const removeLine = (lineId: string) => {
    setCartLines((lines) => lines.filter((line) => line.id !== lineId));
  };

  const submitNewTable = async () => {
    if (newTableLabel.trim().length < 2) {
      setError("Informe um nome válido para a mesa.");
      return;
    }

    setError("");
    setIsCreatingTable(true);

    try {
      const table = await createTable(bundle.store.id, newTableLabel.trim());
      setTables((current) => [...current, table]);
      setSelectedTableId(table.id);
      setNewTableLabel("");
      await onCreated();
      onFeedback("Mesa criada.");
    } catch (creationError) {
      const message = getFriendlyErrorMessage(creationError, "Não foi possível criar a mesa.");
      setError(message);
      onFeedback(message, "error");
    } finally {
      setIsCreatingTable(false);
    }
  };

  const submitOrder = async () => {
    if (!canSubmit) {
      return;
    }

    if (destinationType === "person" && customerPhone.trim() && !isValidBrazilianPhone(customerPhone)) {
      setError("Informe um telefone válido com DDD.");
      return;
    }

    setError("");
    setIsSubmitting(true);

    try {
      await createAdminOrder({
        storeId: bundle.store.id,
        tableId: destinationType === "table" ? selectedTable?.id : undefined,
        tableLabel: destinationType === "table" ? selectedTable?.label : undefined,
        customerName: destinationType === "table" ? selectedTable?.label || "Mesa" : customerName.trim(),
        customerPhone: destinationType === "person" ? customerPhone.trim() || undefined : undefined,
        paymentMethod,
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
      await onCreated();
      onFeedback("Pedido criado pelo painel.");
      onClose();
    } catch (creationError) {
      const message = getFriendlyErrorMessage(creationError, "Não foi possível criar o pedido.");
      setError(message);
      onFeedback(message, "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="admin-order-dialog"
      role="presentation"
      onMouseDown={() => {
        if (!selectedItem) {
          requestClose();
        }
      }}
    >
      <section
        className="admin-order-dialog__sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-order-dialog-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="admin-order-dialog__header">
          <div className="admin-order-dialog__heading">
            <span className="admin-order-dialog__eyebrow">Atendimento manual</span>
            <h2 className="admin-order-dialog__title" id="admin-order-dialog-title">
              Novo pedido
            </h2>
          </div>
          <button className="admin-order-dialog__close" type="button" onClick={requestClose} aria-label="Fechar">
            <X size={20} aria-hidden />
          </button>
        </header>

        <div className="admin-order-dialog__content">
          <div className="admin-order-dialog__catalog">
            <nav className="admin-order-dialog__categories" aria-label="Categorias do cardápio">
              {bundle.categories
                .filter((category) => category.isActive)
                .map((category) => (
                  <button
                    className={`admin-order-dialog__category${
                      selectedCategory === category.id ? " admin-order-dialog__category--active" : ""
                    }`}
                    type="button"
                    aria-pressed={selectedCategory === category.id}
                    key={category.id}
                    onClick={() => setSelectedCategory(category.id)}
                  >
                    {category.name}
                  </button>
                ))}
            </nav>

            <div className="admin-order-dialog__items">
              {visibleItems.map((item) => (
                <article className="admin-order-dialog__item" key={item.id}>
                  <Image
                    className="admin-order-dialog__item-image"
                    src={item.imageUrl || "/placeholder-item.svg"}
                    alt=""
                    width={56}
                    height={56}
                    unoptimized
                  />
                  <span className="admin-order-dialog__item-copy">
                    <strong className="admin-order-dialog__item-name">{item.name}</strong>
                    <small className="admin-order-dialog__item-price">{formatCurrency(item.price)}</small>
                  </span>
                  <button className="admin-order-dialog__add-item" type="button" onClick={() => setSelectedItem(item)}>
                    <Plus size={16} aria-hidden />
                    <span className="admin-order-dialog__add-label">Adicionar</span>
                  </button>
                </article>
              ))}
            </div>
          </div>

          <aside className="admin-order-dialog__aside">
            <section className="admin-order-dialog__section">
              <h3 className="admin-order-dialog__section-title">Destino do pedido</h3>
              <div className="admin-order-dialog__destination">
                <button
                  className={`admin-order-dialog__destination-button${
                    destinationType === "person" ? " admin-order-dialog__destination-button--active" : ""
                  }`}
                  type="button"
                  aria-pressed={destinationType === "person"}
                  onClick={() => setDestinationType("person")}
                >
                  <UserRound size={17} aria-hidden />
                  Pessoa
                </button>
                <button
                  className={`admin-order-dialog__destination-button${
                    destinationType === "table" ? " admin-order-dialog__destination-button--active" : ""
                  }`}
                  type="button"
                  aria-pressed={destinationType === "table"}
                  onClick={() => setDestinationType("table")}
                >
                  <Store size={17} aria-hidden />
                  Mesa
                </button>
              </div>

              {destinationType === "person" ? (
                <div className="admin-order-dialog__fields">
                  <label className="admin-order-dialog__field">
                    <span>Nome *</span>
                    <input
                      className="admin-order-dialog__control"
                      value={customerName}
                      onChange={(event) => setCustomerName(event.target.value)}
                      placeholder="Nome do cliente"
                      required
                    />
                  </label>
                  <label className="admin-order-dialog__field">
                    <span>Telefone (opcional)</span>
                    <input
                      className="admin-order-dialog__control"
                      value={customerPhone}
                      onChange={(event) => setCustomerPhone(formatPhoneInput(event.target.value))}
                      placeholder="(00) 00000-0000"
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      maxLength={15}
                    />
                  </label>
                </div>
              ) : (
                <div className="admin-order-dialog__fields">
                  <label className="admin-order-dialog__field">
                    <span>Mesa *</span>
                    <select
                      className="admin-order-dialog__control"
                      value={selectedTableId}
                      onChange={(event) => setSelectedTableId(event.target.value)}
                      required
                    >
                      <option value="">Selecione uma mesa</option>
                      {tables.map((table) => (
                        <option value={table.id} key={table.id}>
                          {table.label}
                        </option>
                      ))}
                      <option value="create-table">+ Criar mesa</option>
                    </select>
                  </label>
                  {selectedTableId === "create-table" ? (
                    <div className="admin-order-dialog__new-table">
                      <label className="admin-order-dialog__field">
                        <span>Nome da mesa *</span>
                        <input
                          className="admin-order-dialog__control"
                          value={newTableLabel}
                          onChange={(event) => setNewTableLabel(event.target.value)}
                          placeholder="Ex.: Mesa 08"
                          required
                        />
                      </label>
                      <button
                        className="admin-order-dialog__secondary-action"
                        type="button"
                        onClick={submitNewTable}
                        disabled={isCreatingTable}
                      >
                        {isCreatingTable ? "Criando" : "Criar mesa"}
                      </button>
                    </div>
                  ) : null}
                </div>
              )}
            </section>

            <section className="admin-order-dialog__section">
              <h3 className="admin-order-dialog__section-title">Pagamento</h3>
              <label className="admin-order-dialog__field">
                <span>Forma de pagamento *</span>
                <select
                  className="admin-order-dialog__control"
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
            </section>

            <section className="admin-order-dialog__section admin-order-dialog__section--cart">
              <div className="admin-order-dialog__section-heading">
                <h3 className="admin-order-dialog__section-title">Itens</h3>
                <span className="admin-order-dialog__cart-count">{cartLines.length}</span>
              </div>
              <div className="admin-order-dialog__cart">
                {cartLines.length ? (
                  cartLines.map((line) => (
                    <article className="admin-order-dialog__cart-line" key={line.id}>
                      <span className="admin-order-dialog__cart-copy">
                        <strong className="admin-order-dialog__cart-name">{line.name}</strong>
                        <small className="admin-order-dialog__cart-price">{formatCurrency(getLineTotal(line))}</small>
                      </span>
                      <div className="admin-order-dialog__quantity">
                        <button
                          className="admin-order-dialog__quantity-button"
                          type="button"
                          onClick={() => changeLineQuantity(line.id, -1)}
                          aria-label={`Diminuir ${line.name}`}
                        >
                          <Minus size={14} aria-hidden />
                        </button>
                        <strong>{line.quantity}</strong>
                        <button
                          className="admin-order-dialog__quantity-button"
                          type="button"
                          onClick={() => changeLineQuantity(line.id, 1)}
                          aria-label={`Aumentar ${line.name}`}
                        >
                          <Plus size={14} aria-hidden />
                        </button>
                        <button
                          className="admin-order-dialog__remove"
                          type="button"
                          onClick={() => removeLine(line.id)}
                          aria-label={`Remover ${line.name}`}
                        >
                          <Trash2 size={14} aria-hidden />
                        </button>
                      </div>
                    </article>
                  ))
                ) : (
                  <p className="admin-order-dialog__empty-cart">Adicione itens do cardápio para montar o pedido.</p>
                )}
              </div>
            </section>
          </aside>
        </div>

        <footer className="admin-order-dialog__footer">
          <span className="admin-order-dialog__total">
            <small className="admin-order-dialog__total-label">Total</small>
            <strong>{formatCurrency(subtotal)}</strong>
          </span>
          {error ? <p className="admin-order-dialog__error">{error}</p> : null}
          <button className="admin-order-dialog__submit" type="button" disabled={!canSubmit} onClick={submitOrder}>
            <ShoppingBag size={18} aria-hidden />
            {isSubmitting ? "Criando pedido" : "Criar pedido"}
          </button>
        </footer>
      </section>

      {selectedItem ? (
        <MenuItemDialog
          item={selectedItem}
          note={notes[selectedItem.id] || ""}
          selectedOptionIds={selectedOptions[selectedItem.id] || []}
          onClose={closeItem}
          onNoteChange={(note) => setNotes((state) => ({ ...state, [selectedItem.id]: note }))}
          onToggleOption={(groupId, choiceId, maxSelected) =>
            toggleOption(selectedItem, groupId, choiceId, maxSelected)
          }
          onAdd={(quantity) => addItem(selectedItem, quantity)}
        />
      ) : null}

      {isDiscardConfirmOpen ? (
        <ConfirmDialog
          title="Descartar este pedido?"
          description="Os itens já adicionados a este pedido serão perdidos."
          confirmLabel="Descartar"
          cancelLabel="Continuar editando"
          loadingLabel="Descartando"
          onCancel={() => setIsDiscardConfirmOpen(false)}
          onConfirm={onClose}
        />
      ) : null}
    </div>
  );
}
