"use client";

import { AlertTriangle, Loader2, X } from "lucide-react";
import { useEffect } from "react";
import "./confirm-dialog.scss";

interface ConfirmDialogProps {
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  isLoading?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function ConfirmDialog({
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancelar",
  isLoading = false,
  onCancel,
  onConfirm,
}: ConfirmDialogProps) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isLoading) {
        onCancel();
      }
    };

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [isLoading, onCancel]);

  return (
    <div className="confirm-dialog" role="presentation" onMouseDown={isLoading ? undefined : onCancel}>
      <section
        className="confirm-dialog__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-description"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button
          className="confirm-dialog__close"
          type="button"
          onClick={onCancel}
          disabled={isLoading}
          aria-label="Fechar confirmação"
        >
          <X size={18} aria-hidden />
        </button>

        <span className="confirm-dialog__icon">
          <AlertTriangle size={22} aria-hidden />
        </span>
        <div className="confirm-dialog__copy">
          <h2 className="confirm-dialog__title" id="confirm-dialog-title">
            {title}
          </h2>
          <p className="confirm-dialog__description" id="confirm-dialog-description">
            {description}
          </p>
        </div>

        <div className="confirm-dialog__actions">
          <button className="confirm-dialog__cancel" type="button" onClick={onCancel} disabled={isLoading}>
            {cancelLabel}
          </button>
          <button className="confirm-dialog__confirm" type="button" onClick={onConfirm} disabled={isLoading}>
            {isLoading ? <Loader2 className="confirm-dialog__spinner" size={16} aria-hidden /> : null}
            {isLoading ? "Excluindo" : confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
