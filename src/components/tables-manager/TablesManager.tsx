"use client";

import QRCode from "qrcode";
import { Check, Copy, Plus, QrCode, ShoppingBag, ToggleLeft, ToggleRight } from "lucide-react";
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

  useEffect(() => {
    visibleTables.forEach((table) => {
      const url = `${baseUrl}/loja/${storeSlug}/mesa/${table.id}`;
      QRCode.toDataURL(url, { margin: 1, width: 180 }).then((dataUrl) => {
        setQrCodes((state) => ({ ...state, [table.id]: dataUrl }));
      });
    });
  }, [baseUrl, storeSlug, visibleTables]);

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

  const copyLink = async (tableId: string) => {
    try {
      await navigator.clipboard.writeText(`${baseUrl}/loja/${storeSlug}/mesa/${tableId}`);
      setCopiedTableId(tableId);
      onFeedback?.("Link da mesa copiado pra área de transferência.");
    } catch {
      onFeedback?.("Não foi possível copiar o link.", "error");
    }
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
        {visibleTables.map((table) => {
          const link = `${baseUrl}/loja/${storeSlug}/mesa/${table.id}`;
          const isCopied = copiedTableId === table.id;
          const didSwitchChange = changedTableId === table.id;
          const isUpdating = updatingTableId === table.id;

          return (
            <article className="tables-manager__table" key={table.id}>
              <div className="tables-manager__header">
                <div className="tables-manager__heading">
                  <h2 className="tables-manager__title">{table.label}</h2>
                  <span className="tables-manager__code">{table.code}</span>
                </div>
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
              </div>

              <div className="tables-manager__qr">
                {qrCodes[table.id] ? (
                  <Image
                    className="tables-manager__qr-image"
                    src={qrCodes[table.id]}
                    alt={`QR Code ${table.label}`}
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
                <button
                  className={`tables-manager__copy${isCopied ? " tables-manager__copy--copied" : ""}`}
                  type="button"
                  onClick={() => void copyLink(table.id)}
                  aria-label={isCopied ? "Link copiado" : "Copiar link"}
                  title={isCopied ? "Link copiado" : "Copiar link"}
                >
                  {isCopied ? <Check size={16} aria-hidden /> : <Copy size={16} aria-hidden />}
                </button>
              </div>

              <button className="tables-manager__table-order" type="button" onClick={() => onCreateOrder(table.id)}>
                <ShoppingBag size={17} aria-hidden />
                Criar pedido para {table.label}
              </button>
            </article>
          );
        })}
      </div>
    </section>
  );
}
