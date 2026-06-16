"use client";

import { Check, Minus, Plus, ShoppingBag, X } from "lucide-react";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { formatCurrency } from "@/lib/utils/money";
import type { MenuItem } from "@/types/menu";
import "./menu-item-dialog.scss";

interface MenuItemDialogProps {
  item: MenuItem;
  note: string;
  selectedOptionIds: string[];
  onAdd: (quantity: number) => void;
  onClose: () => void;
  onNoteChange: (note: string) => void;
  onToggleOption: (groupId: string, choiceId: string, maxSelected: number) => void;
}

export function MenuItemDialog({
  item,
  note,
  selectedOptionIds,
  onAdd,
  onClose,
  onNoteChange,
  onToggleOption,
}: MenuItemDialogProps) {
  const [quantity, setQuantity] = useState(1);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.body.classList.add("menu-dialog-open");
    window.addEventListener("keydown", closeOnEscape);

    return () => {
      document.body.classList.remove("menu-dialog-open");
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [onClose]);

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
            <Image
              className="menu-item-dialog__image"
              src={item.imageUrl || "/placeholder-item.svg"}
              alt=""
              width={160}
              height={120}
            />
            <div className="menu-item-dialog__summary-copy">
              {item.description ? <p className="menu-item-dialog__description">{item.description}</p> : null}
              <strong className="menu-item-dialog__base-price">A partir de {formatCurrency(item.price)}</strong>
            </div>
          </div>

          {item.optionsGroups.map((group) => {
            const selectedCount = group.choices.filter((choice) => selectedOptionIds.includes(choice.id)).length;

            return (
              <section className="menu-item-dialog__group" key={group.id}>
                <div className="menu-item-dialog__group-header">
                  <div>
                    <h3 className="menu-item-dialog__group-title">{group.name}</h3>
                    <p className="menu-item-dialog__group-hint">
                      {group.isRequired ? "Escolha obrigatória" : "Escolha se desejar"} · até {group.maxSelected}
                    </p>
                  </div>
                  <span className="menu-item-dialog__group-count">
                    {selectedCount}/{group.maxSelected}
                  </span>
                </div>

                <div className="menu-item-dialog__choices">
                  {group.choices
                    .filter((choice) => choice.isAvailable)
                    .map((choice) => {
                      const isSelected = selectedOptionIds.includes(choice.id);

                      return (
                        <button
                          className={`menu-item-dialog__choice${
                            isSelected ? " menu-item-dialog__choice--selected" : ""
                          }`}
                          type="button"
                          aria-pressed={isSelected}
                          key={choice.id}
                          onClick={() => onToggleOption(group.id, choice.id, group.maxSelected)}
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
              rows={3}
              placeholder="Ex.: sem cebola, cortar ao meio..."
              onChange={(event) => onNoteChange(event.target.value)}
            />
          </label>
        </div>

        <footer className="menu-item-dialog__footer">
          <div className="menu-item-dialog__quantity" aria-label="Quantidade">
            <button
              className="menu-item-dialog__quantity-button"
              type="button"
              onClick={() => setQuantity((current) => Math.max(1, current - 1))}
              aria-label="Diminuir quantidade"
            >
              <Minus size={17} aria-hidden />
            </button>
            <strong className="menu-item-dialog__quantity-value">{quantity}</strong>
            <button
              className="menu-item-dialog__quantity-button"
              type="button"
              onClick={() => setQuantity((current) => current + 1)}
              aria-label="Aumentar quantidade"
            >
              <Plus size={17} aria-hidden />
            </button>
          </div>

          <button className="menu-item-dialog__add" type="button" onClick={() => onAdd(quantity)}>
            <ShoppingBag size={18} aria-hidden />
            Adicionar
            <strong className="menu-item-dialog__add-total">{formatCurrency(unitTotal * quantity)}</strong>
          </button>
        </footer>
      </section>
    </div>
  );
}
