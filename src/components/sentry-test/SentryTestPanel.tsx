"use client";

import * as Sentry from "@sentry/nextjs";
import { CircleCheck, CircleX, Loader2 } from "lucide-react";
import { useState } from "react";

export function SentryTestPanel() {
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "disabled">("idle");
  const [eventId, setEventId] = useState("");

  const sendTestError = async () => {
    setStatus("sending");
    const client = Sentry.getClient();

    if (!client) {
      setStatus("disabled");
      return;
    }

    const nextEventId = Sentry.captureException(
      new Error("Sentry verification error from virtual-menu-manager"),
      { tags: { source: "sentry-test-page" } },
    );

    await Sentry.flush(2_000);
    setEventId(nextEventId);
    setStatus("sent");
  };

  return (
    <main className="sentry-test">
      <section className="sentry-test__panel" aria-labelledby="sentry-test-title">
        <p className="sentry-test__eyebrow">Diagnóstico local</p>
        <h1 id="sentry-test-title">Verificar integração com o Sentry</h1>
        <p className="sentry-test__description">
          Este teste envia uma exceção controlada para confirmar a captura de erros no navegador.
        </p>

        <button
          className="sentry-test__button"
          type="button"
          onClick={() => void sendTestError()}
          disabled={status === "sending"}
        >
          {status === "sending" ? <Loader2 className="sentry-test__spinner" size={18} aria-hidden /> : null}
          {status === "sending" ? "Enviando" : "Enviar erro de teste"}
        </button>

        {status === "sent" ? (
          <p className="sentry-test__result sentry-test__result--success" role="status">
            <CircleCheck size={19} aria-hidden /> Evento enviado: <code>{eventId}</code>
          </p>
        ) : null}

        {status === "disabled" ? (
          <p className="sentry-test__result sentry-test__result--error" role="alert">
            <CircleX size={19} aria-hidden /> O cliente Sentry não foi inicializado. Verifique o DSN público.
          </p>
        ) : null}
      </section>
    </main>
  );
}
