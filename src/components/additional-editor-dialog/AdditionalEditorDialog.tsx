"use client";

import { Loader2, Save, X } from "lucide-react";
import { useRef, useState, type FormEvent } from "react";
import { useFocusTrap } from "@/components/ui/dialog/use-focus-trap";
import type { AdditionalInput } from "@/lib/services/store-service";
import { formatPriceInput, getPriceDigits, parsePrice, sanitizePriceDigits } from "@/lib/utils/input-format";
import type { Additional } from "@/types/menu";
import "./additional-editor-dialog.scss";

interface AdditionalEditorDialogProps {
  additional?: Additional;
  isSaving: boolean;
  onClose: () => void;
  onSubmit: (payload: AdditionalInput) => Promise<void>;
}

export function AdditionalEditorDialog({
  additional,
  isSaving,
  onClose,
  onSubmit,
}: AdditionalEditorDialogProps) {
  const [name, setName] = useState(additional?.name || "");
  const [priceDigits, setPriceDigits] = useState(getPriceDigits(additional?.price));
  const [isAvailable, setIsAvailable] = useState(additional?.isAvailable ?? true);
  const [error, setError] = useState("");
  const panelRef = useRef<HTMLFormElement>(null);
  useFocusTrap(panelRef);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const price = parsePrice(priceDigits);

    if (!name.trim() || Number.isNaN(price)) {
      setError("Preencha nome e preço válido.");
      return;
    }

    setError("");

    try {
      await onSubmit({
        name: name.trim(),
        price,
        isAvailable,
      });
    } catch {
      setError("Revise os dados e tente novamente.");
    }
  };

  return (
    <div className="additional-editor-dialog" role="presentation" onMouseDown={isSaving ? undefined : onClose}>
      <form
        ref={panelRef}
        className="additional-editor-dialog__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="additional-editor-title"
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={submit}
      >
        <header className="additional-editor-dialog__header">
          <div className="additional-editor-dialog__heading">
            <span className="additional-editor-dialog__eyebrow">
              {additional ? "Editar adicional" : "Novo adicional"}
            </span>
            <h2 className="additional-editor-dialog__title" id="additional-editor-title">
              {additional ? additional.name : "Criar adicional"}
            </h2>
          </div>
          <button
            className="additional-editor-dialog__close"
            type="button"
            onClick={onClose}
            disabled={isSaving}
            aria-label="Fechar"
          >
            <X size={20} aria-hidden />
          </button>
        </header>

        <div className="additional-editor-dialog__content">
          <label className="additional-editor-dialog__field">
            <span className="additional-editor-dialog__label">Nome *</span>
            <input
              className="additional-editor-dialog__control"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Ex.: Mussarela"
              required
            />
          </label>

          <label className="additional-editor-dialog__field">
            <span className="additional-editor-dialog__label">Preço *</span>
            <input
              className="additional-editor-dialog__control"
              value={formatPriceInput(priceDigits)}
              type="text"
              inputMode="numeric"
              onChange={(event) => setPriceDigits(sanitizePriceDigits(event.target.value))}
              autoComplete="off"
              placeholder="R$ 0,00"
              required
            />
          </label>

          <label className="additional-editor-dialog__switch">
            <input
              className="additional-editor-dialog__switch-input"
              type="checkbox"
              checked={isAvailable}
              onChange={(event) => setIsAvailable(event.target.checked)}
            />
            <span className="additional-editor-dialog__switch-control" />
            <span className="additional-editor-dialog__switch-copy">
              <strong className="additional-editor-dialog__switch-title">Adicional disponível</strong>
              <small className="additional-editor-dialog__switch-text">
                Adicionais indisponíveis ficam ocultos no cardápio público.
              </small>
            </span>
          </label>
        </div>

        <footer className="additional-editor-dialog__footer">
          {error ? <p className="additional-editor-dialog__error">{error}</p> : null}
          <button className="additional-editor-dialog__cancel" type="button" onClick={onClose} disabled={isSaving}>
            Cancelar
          </button>
          <button className="additional-editor-dialog__submit" type="submit" disabled={isSaving}>
            {isSaving ? (
              <Loader2 className="additional-editor-dialog__spinner" size={17} aria-hidden />
            ) : (
              <Save size={17} aria-hidden />
            )}
            {isSaving ? "Salvando" : "Salvar adicional"}
          </button>
        </footer>
      </form>
    </div>
  );
}
