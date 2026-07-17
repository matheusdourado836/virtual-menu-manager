"use client";

import { Check, Minus, Plus, ShoppingBag, X } from "lucide-react";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { MAX_ITEM_OBSERVATION_LENGTH, MAX_ORDER_ITEM_QUANTITY } from "@/lib/constants/order";
import { formatCurrency } from "@/lib/utils/money";
import type { MenuItem } from "@/types/menu";
import "./menu-item-dialog.scss";

interface MenuItemDialogProps {
  item: MenuItem;
  note: string;
  selectedOptionIds: string[];
  isImagePreviewOpen?: boolean;
  onAdd: (quantity: number) => void;
  onClose: () => void;
  onImagePreview?: () => void;
  onNoteChange: (note: string) => void;
  onToggleOption: (groupId: string, choiceId: string, maxSelected: number) => void;
}

export function MenuItemDialog({
  item,
  note,
  selectedOptionIds,
  isImagePreviewOpen = false,
  onAdd,
  onClose,
  onImagePreview,
  onNoteChange,
  onToggleOption,
}: MenuItemDialogProps) {
  const [quantity, setQuantity] = useState(1);
  const [selectionError, setSelectionError] = useState("");

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isImagePreviewOpen) {
        onClose();
      }
    };

    document.body.classList.add("menu-dialog-open");
    window.addEventListener("keydown", closeOnEscape);

    return () => {
      document.body.classList.remove("menu-dialog-open");
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [isImagePreviewOpen, onClose]);

  const unitTotal = useMemo(
    () =>
      item.price +
      item.optionsGroups.reduce(
        (total, group) =>
          total +
          group.choices
            .filter((choice) => selectedOptionIds.includes(choice.id))
            .reduce((choiceTotal, choice) => choiceTotal + choice.price, 0),
        0,
      ),
    [item, selectedOptionIds],
  );
  const visibleOptionGroups = useMemo(
    () =>
      item.optionsGroups
        .map((group) => ({
          ...group,
          choices: group.choices.filter((choice) => choice.isAvailable),
        }))
        .filter((group) => group.choices.length > 0),
    [item.optionsGroups],
  );
  const requiredSelectionIssue = useMemo(() => {
    for (const group of item.optionsGroups) {
      const availableChoices = group.choices.filter((choice) => choice.isAvailable);
      const minimumRequired = Math.max(Number(group.minSelected) || 0, group.isRequired ? 1 : 0);
      const selectedCount = availableChoices.filter((choice) => selectedOptionIds.includes(choice.id)).length;

      if (selectedCount < minimumRequired) {
        const selectionLabel = minimumRequired === 1 ? "uma opção" : `${minimumRequired} opções`;
        const hasEnoughAvailableChoices = availableChoices.length >= minimumRequired;

        return hasEnoughAvailableChoices
          ? `Escolha pelo menos ${selectionLabel} em ${group.name}.`
          : `As opções obrigatórias de ${group.name} estão indisponíveis no momento.`;
      }
    }

    return "";
  }, [item.optionsGroups, selectedOptionIds]);

  const addConfiguredItem = () => {
    if (requiredSelectionIssue) {
      setSelectionError(requiredSelectionIssue);
      return;
    }

    setSelectionError("");
    onAdd(quantity);
  };

  return (
    <div className="menu-item-dialog" role="presentation" onMouseDown={onClose}>
      <section
        className="menu-item-dialog__sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="menu-item-dialog-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="menu-item-dialog__header">
          <div className="menu-item-dialog__heading">
            <span className="menu-item-dialog__eyebrow">Personalizar item</span>
            <h2 className="menu-item-dialog__title" id="menu-item-dialog-title">
              {item.name}
            </h2>
          </div>
          <button className="menu-item-dialog__close" type="button" onClick={onClose} aria-label="Fechar">
            <X size={20} aria-hidden />
          </button>
        </header>

        <div className="menu-item-dialog__content">
          <div className="menu-item-dialog__summary">
            <button
              className="menu-item-dialog__image-button"
              type="button"
              onClick={onImagePreview}
              aria-label={`Ver foto de ${item.name}`}
              title={`Ver foto de ${item.name}`}
            >
              <Image
                className="menu-item-dialog__image"
                src={item.imageUrl || "/placeholder-item.svg"}
                alt=""
                width={80}
                height={80}
                sizes="80px"
              />
            </button>
            <div className="menu-item-dialog__summary-copy">
              {item.description ? <p className="menu-item-dialog__description">{item.description}</p> : null}
              <strong className="menu-item-dialog__base-price">A partir de {formatCurrency(item.price)}</strong>
            </div>
          </div>

          {visibleOptionGroups.map((group) => {
            const selectedCount = group.choices.filter((choice) => selectedOptionIds.includes(choice.id)).length;
            const minimumRequired = Math.max(Number(group.minSelected) || 0, group.isRequired ? 1 : 0);
            const selectionHint = minimumRequired > 0
              ? minimumRequired === 1
                ? "Escolha obrigatória"
                : `Escolha pelo menos ${minimumRequired}`
              : "Escolha se desejar";

            return (
              <section className="menu-item-dialog__group" key={group.id}>
                <div className="menu-item-dialog__group-header">
                  <div>
                    <h3 className="menu-item-dialog__group-title">{group.name}</h3>
                    <p className="menu-item-dialog__group-hint">
                      {selectionHint} · até {group.maxSelected}
                    </p>
                  </div>
                  <span className="menu-item-dialog__group-count">
                    {selectedCount}/{group.maxSelected}
                  </span>
                </div>

                <div className="menu-item-dialog__choices">
                  {group.choices.map((choice) => {
                    const isSelected = selectedOptionIds.includes(choice.id);

                    return (
                      <button
                        className={`menu-item-dialog__choice${
                          isSelected ? " menu-item-dialog__choice--selected" : ""
                        }`}
                        type="button"
                        aria-pressed={isSelected}
                        key={choice.id}
                        onClick={() => {
                          setSelectionError("");
                          onToggleOption(group.id, choice.id, group.maxSelected);
                        }}
                      >
                        <span className="menu-item-dialog__choice-copy">
                          <strong className="menu-item-dialog__choice-name">{choice.name}</strong>
                          <small className="menu-item-dialog__choice-price">+ {formatCurrency(choice.price)}</small>
                        </span>
                        <span
                          className={`menu-item-dialog__choice-check${
                            isSelected ? " menu-item-dialog__choice-check--selected" : ""
                          }`}
                        >
                          {isSelected ? <Check size={15} aria-hidden /> : null}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            );
          })}

          <label className="menu-item-dialog__note-field">
            <span className="menu-item-dialog__note-label">Alguma observação?</span>
            <textarea
              className="menu-item-dialog__note"
              value={note}
              maxLength={MAX_ITEM_OBSERVATION_LENGTH}
              rows={3}
              placeholder="Ex.: sem cebola, cortar ao meio..."
              onChange={(event) => onNoteChange(event.target.value)}
            />
          </label>

          {selectionError ? (
            <p className="menu-item-dialog__selection-error" role="alert">
              {selectionError}
            </p>
          ) : null}
        </div>

        <footer className="menu-item-dialog__footer">
          <div className="menu-item-dialog__quantity" aria-label="Quantidade">
            <button
              className="menu-item-dialog__quantity-button"
              type="button"
              onClick={() => setQuantity((current) => Math.max(1, current - 1))}
              disabled={quantity <= 1}
              aria-label="Diminuir quantidade"
            >
              <Minus size={17} aria-hidden />
            </button>
            <strong className="menu-item-dialog__quantity-value">{quantity}</strong>
            <button
              className="menu-item-dialog__quantity-button"
              type="button"
              onClick={() => setQuantity((current) => Math.min(MAX_ORDER_ITEM_QUANTITY, current + 1))}
              disabled={quantity >= MAX_ORDER_ITEM_QUANTITY}
              aria-label="Aumentar quantidade"
            >
              <Plus size={17} aria-hidden />
            </button>
          </div>

          <button className="menu-item-dialog__add" type="button" onClick={addConfiguredItem}>
            <ShoppingBag size={18} aria-hidden />
            Adicionar
            <strong className="menu-item-dialog__add-total">{formatCurrency(unitTotal * quantity)}</strong>
          </button>
        </footer>
      </section>
    </div>
  );
}
