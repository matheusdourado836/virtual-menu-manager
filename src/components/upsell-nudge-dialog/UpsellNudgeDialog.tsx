"use client";

import { Plus, ShoppingBag, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { useFocusTrap } from "@/components/ui/dialog/use-focus-trap";
import { formatCurrency } from "@/lib/utils/money";
import type { MenuItem } from "@/types/menu";
import "./upsell-nudge-dialog.scss";

interface UpsellNudgeDialogProps {
  sourceName: string;
  pairs: MenuItem[];
  onAdd: (pair: MenuItem) => void;
  onClose: () => void;
}

export function UpsellNudgeDialog({ sourceName, pairs, onAdd, onClose }: UpsellNudgeDialogProps) {
  const panelRef = useRef<HTMLElement>(null);
  useFocusTrap(panelRef);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return (
    <div className="upsell-nudge-dialog" role="presentation" onMouseDown={onClose}>
      <section
        ref={panelRef}
        className="upsell-nudge-dialog__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="upsell-nudge-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button className="upsell-nudge-dialog__close" type="button" onClick={onClose} aria-label="Fechar">
          <X size={18} aria-hidden />
        </button>

        <div className="upsell-nudge-dialog__heading">
          <span className="upsell-nudge-dialog__eyebrow">
            <ShoppingBag size={15} aria-hidden />
            {sourceName} adicionado
          </span>
          <h2 className="upsell-nudge-dialog__title" id="upsell-nudge-title">
            Que tal levar também?
          </h2>
        </div>

        <ul className="upsell-nudge-dialog__list">
          {pairs.map((pair) => (
            <li className="upsell-nudge-dialog__item" key={pair.id}>
              <span className="upsell-nudge-dialog__item-copy">
                <strong className="upsell-nudge-dialog__item-name">{pair.name}</strong>
                <small className="upsell-nudge-dialog__item-price">{formatCurrency(pair.price)}</small>
              </span>
              <button
                className="upsell-nudge-dialog__add"
                type="button"
                onClick={() => onAdd(pair)}
                aria-label={`Adicionar ${pair.name} ao pedido`}
              >
                <Plus size={16} aria-hidden />
                Adicionar
              </button>
            </li>
          ))}
        </ul>

        <button className="upsell-nudge-dialog__continue" type="button" onClick={onClose}>
          Continuar
        </button>
      </section>
    </div>
  );
}
