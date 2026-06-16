"use client";

import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import { useEffect } from "react";
import "./snackbar.scss";

const snackbarDurationMs = 4500;

interface SnackbarProps {
  message: string;
  onDismiss: () => void;
  variant?: "success" | "error" | "info";
}

const snackbarIcon = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
};

export function Snackbar({ message, onDismiss, variant = "success" }: SnackbarProps) {
  useEffect(() => {
    const timeout = window.setTimeout(onDismiss, snackbarDurationMs);
    return () => window.clearTimeout(timeout);
  }, [onDismiss]);

  const Icon = snackbarIcon[variant];

  return (
    <div className={`snackbar snackbar--${variant}`} role="status">
      <Icon className="snackbar__icon" size={19} aria-hidden />
      <span className="snackbar__message">{message}</span>
      <button className="snackbar__dismiss" type="button" onClick={onDismiss} aria-label="Fechar mensagem">
        <X size={17} aria-hidden />
      </button>
    </div>
  );
}
