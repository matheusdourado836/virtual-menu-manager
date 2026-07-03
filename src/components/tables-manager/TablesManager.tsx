"use client";

import QRCode from "qrcode";
import { Check, Copy, Plus, Printer, QrCode, ShoppingBag, ToggleLeft, ToggleRight } from "lucide-react";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { createTable, updateTable } from "@/lib/services/store-service";
import { getPublicAppUrl } from "@/lib/utils/public-url";
import type { Table } from "@/types/menu";
import "./tables-manager.scss";

interface TablesManagerProps {
  storeId: string;
  tables: Table[];
  storeSlug: string;
  onCreateOrder: (tableId?: string) => void;
  onFeedback?: (message: string, variant?: "success" | "error" | "info") => void;
}

const escapePrintText = (value: string) =>
  value.replace(/[&<>"']/gu, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };

    return entities[character] || character;
  });

export function TablesManager({ storeId, tables, storeSlug, onCreateOrder, onFeedback }: TablesManagerProps) {
  const [localTables, setLocalTables] = useState<Table[]>([]);
  const [newLabel, setNewLabel] = useState("");
  const [qrCodes, setQrCodes] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [copiedTableId, setCopiedTableId] = useState("");
  const [changedTableId, setChangedTableId] = useState("");
  const [updatingTableId, setUpdatingTableId] = useState("");

  const visibleTables = useMemo(
    () => [
      ...tables.map((table) => localTables.find((candidate) => candidate.id === table.id) || table),
      ...localTables.filter((table) => !tables.some((candidate) => candidate.id === table.id)),
    ],
    [localTables, tables],
  );

  const baseUrl = useMemo(() => getPublicAppUrl(), []);
  const tableCards = useMemo(
    () =>
      visibleTables.map((table) => {
        const isMenuLink = table.code === "BALCAO";
        const link = isMenuLink ? `${baseUrl}/loja/${storeSlug}` : `${baseUrl}/loja/${storeSlug}/mesa/${table.id}`;

        return {
          table,
          isMenuLink,
          link,
          title: isMenuLink ? "Cardápio" : table.label,
          subtitle: isMenuLink ? "Link pro cardápio" : table.code,
        };
      }),
    [baseUrl, storeSlug, visibleTables],
  );

  useEffect(() => {
    tableCards.forEach((card) => {
      QRCode.toDataURL(card.link, { margin: 1, width: 180 }).then((dataUrl) => {
        setQrCodes((state) => ({ ...state, [card.table.id]: dataUrl }));
      });
    });
  }, [tableCards]);

  useEffect(() => {
    if (!copiedTableId) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => setCopiedTableId(""), 1600);
    return () => window.clearTimeout(timeoutId);
  }, [copiedTableId]);

  useEffect(() => {
    if (!changedTableId) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => setChangedTableId(""), 900);
    return () => window.clearTimeout(timeoutId);
  }, [changedTableId]);

  const addTable = async () => {
    if (!newLabel.trim()) {
      setError("Informe o nome da mesa ou ponto de retirada.");
      return;
    }

    setError("");
    setIsCreating(true);

    try {
      const table = await createTable(storeId, newLabel.trim());
      setLocalTables((currentTables) => [...currentTables, table]);
      setNewLabel("");
      onFeedback?.("Mesa criada.");
    } catch (creationError) {
      const message = creationError instanceof Error ? creationError.message : "Não foi possível criar a mesa.";
      setError(message);
      onFeedback?.(message, "error");
    } finally {
      setIsCreating(false);
    }
  };

  const toggleTable = async (tableId: string) => {
    const table = visibleTables.find((candidate) => candidate.id === tableId);

    if (!table || updatingTableId) {
      return;
    }

    const nextIsActive = !table.isActive;
    setUpdatingTableId(tableId);
    setLocalTables((currentTables) => [
      ...currentTables.filter((candidate) => candidate.id !== tableId),
      { ...table, isActive: nextIsActive },
    ]);

    try {
      const updatedTable = await updateTable(storeId, tableId, nextIsActive);
      setLocalTables((currentTables) => [
        ...currentTables.filter((candidate) => candidate.id !== tableId),
        updatedTable,
      ]);
      setChangedTableId(tableId);
      onFeedback?.(`${updatedTable.label} ${updatedTable.isActive ? "ativada" : "desativada"}.`);
    } catch (updateError) {
      setLocalTables((currentTables) => [
        ...currentTables.filter((candidate) => candidate.id !== tableId),
        table,
      ]);
      onFeedback?.(
        updateError instanceof Error ? updateError.message : "Não foi possível atualizar a mesa.",
        "error",
      );
    } finally {
      setUpdatingTableId("");
    }
  };

  const copyLink = async (tableId: string, link: string, isMenuLink: boolean) => {
    try {
      await navigator.clipboard.writeText(link);
      setCopiedTableId(tableId);
      onFeedback?.(
        isMenuLink ? "Link do cardápio copiado pra área de transferência." : "Link da mesa copiado pra área de transferência.",
      );
    } catch {
      onFeedback?.("Não foi possível copiar o link.", "error");
    }
  };

  const printQrCode = (title: string, qrCode?: string) => {
    if (!qrCode) {
      onFeedback?.("QR Code ainda carregando.", "info");
      return;
    }

    const printWindow = window.open("", "_blank", "width=420,height=520");

    if (!printWindow) {
      onFeedback?.("Não foi possível abrir a impressão.", "error");
      return;
    }

    printWindow.document.write(`<!doctype html>
      <html lang="pt-BR">
        <head>
          <meta charset="utf-8" />
          <title>${escapePrintText(title)}</title>
          <style>
            @page { margin: 0; }
            html,
            body {
              width: 100%;
              height: 100%;
              margin: 0;
            }
            body {
              display: grid;
              place-items: center;
            }
            img {
              width: 72vmin;
              height: 72vmin;
              object-fit: contain;
            }
          </style>
        </head>
        <body>
          <img src="${qrCode}" alt="QR Code" />
        </body>
      </html>`);
    printWindow.document.close();

    const qrImage = printWindow.document.querySelector("img");
    const runPrint = () => {
      printWindow.focus();
      printWindow.print();
    };

    if (qrImage?.complete) {
      runPrint();
      return;
    }

    qrImage?.addEventListener("load", runPrint, { once: true });
  };

  return (
    <section className="tables-manager">
      <div className="tables-manager__form">
        <label className="tables-manager__field">
          <span>Nova mesa ou ponto de retirada *</span>
          <input
            className="tables-manager__control"
            value={newLabel}
            onChange={(event) => setNewLabel(event.target.value)}
            placeholder="Mesa 03"
            required
          />
        </label>
        <button className="tables-manager__add" type="button" onClick={addTable}>
          <Plus size={18} aria-hidden />
          {isCreating ? "Criando" : "Criar mesa"}
        </button>
        {error ? <p className="tables-manager__error">{error}</p> : null}
      </div>

      <div className="tables-manager__grid">
        {tableCards.map(({ table, isMenuLink, link, title, subtitle }) => {
          const isCopied = copiedTableId === table.id;
          const didSwitchChange = changedTableId === table.id;
          const isUpdating = updatingTableId === table.id;
          const qrCode = qrCodes[table.id];

          return (
            <article className="tables-manager__table" key={table.id}>
              <div className="tables-manager__header">
                <div className="tables-manager__heading">
                  <h2 className="tables-manager__title">{title}</h2>
                  <span className="tables-manager__code">{subtitle}</span>
                </div>
                <div className="tables-manager__header-actions">
                  <button
                    className="tables-manager__icon-button"
                    type="button"
                    onClick={() => printQrCode(title, qrCode)}
                    aria-label="Imprimir QR Code"
                    title="Imprimir QR Code"
                  >
                    <Printer size={18} aria-hidden />
                  </button>
                  {isMenuLink ? null : (
                    <button
                      className={`tables-manager__icon-button tables-manager__icon-button--switch${
                        table.isActive ? " tables-manager__icon-button--active" : ""
                      }${didSwitchChange ? " tables-manager__icon-button--changed" : ""}`}
                      type="button"
                      onClick={() => void toggleTable(table.id)}
                      role="switch"
                      aria-checked={table.isActive}
                      aria-label={table.isActive ? "Desativar mesa" : "Ativar mesa"}
                      title={table.isActive ? "Desativar mesa" : "Ativar mesa"}
                      disabled={isUpdating}
                    >
                      {table.isActive ? <ToggleRight size={24} aria-hidden /> : <ToggleLeft size={24} aria-hidden />}
                    </button>
                  )}
                </div>
              </div>

              <div className="tables-manager__qr">
                {qrCode ? (
                  <Image
                    className="tables-manager__qr-image"
                    src={qrCode}
                    alt={`QR Code ${title}`}
                    width={180}
                    height={180}
                    unoptimized
                  />
                ) : (
                  <QrCode size={96} />
                )}
              </div>

              <div className="tables-manager__link">
                <span className="tables-manager__link-text">{link}</span>
              </div>

              <button
                className={`tables-manager__copy-link${isCopied ? " tables-manager__copy-link--copied" : ""}`}
                type="button"
                onClick={() => void copyLink(table.id, link, isMenuLink)}
              >
                {isCopied ? <Check size={17} aria-hidden /> : <Copy size={17} aria-hidden />}
                {isCopied ? "Link copiado" : isMenuLink ? "Copiar link do cardápio" : "Copiar link da mesa"}
              </button>

              <button
                className="tables-manager__table-order"
                type="button"
                onClick={() => onCreateOrder(isMenuLink ? undefined : table.id)}
              >
                <ShoppingBag size={17} aria-hidden />
                {isMenuLink ? "Criar pedido pelo Cardápio" : `Criar pedido para ${table.label}`}
              </button>
            </article>
          );
        })}
      </div>
    </section>
  );
}
