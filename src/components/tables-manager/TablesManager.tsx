"use client";

import QRCode from "qrcode";
import { Copy, Plus, QrCode, ShoppingBag, ToggleLeft, ToggleRight } from "lucide-react";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { createTable } from "@/lib/services/store-service";
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

  const visibleTables = useMemo(
    () => [
      ...tables.map((table) => localTables.find((candidate) => candidate.id === table.id) || table),
      ...localTables.filter((table) => !tables.some((candidate) => candidate.id === table.id)),
    ],
    [localTables, tables],
  );

  const baseUrl = useMemo(() => {
    if (typeof window === "undefined") {
      return "TODO_CONFIG_PUBLIC_BASE_URL";
    }

    return window.location.origin;
  }, []);

  useEffect(() => {
    visibleTables.forEach((table) => {
      const url = `${baseUrl}/loja/${storeSlug}/mesa/${table.id}`;
      QRCode.toDataURL(url, { margin: 1, width: 180 }).then((dataUrl) => {
        setQrCodes((state) => ({ ...state, [table.id]: dataUrl }));
      });
    });
  }, [baseUrl, storeSlug, visibleTables]);

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

  const toggleTable = (tableId: string) => {
    const table = visibleTables.find((candidate) => candidate.id === tableId);

    if (!table) {
      return;
    }

    setLocalTables((currentTables) => [
      ...currentTables.filter((candidate) => candidate.id !== tableId),
      { ...table, isActive: !table.isActive },
    ]);
  };

  const copyLink = (tableId: string) => {
    navigator.clipboard.writeText(`${baseUrl}/loja/${storeSlug}/mesa/${tableId}`);
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

          return (
            <article className="tables-manager__table" key={table.id}>
              <div className="tables-manager__header">
                <div className="tables-manager__heading">
                  <h2 className="tables-manager__title">{table.label}</h2>
                  <span className="tables-manager__code">{table.code}</span>
                </div>
                <button
                  className="tables-manager__icon-button"
                  type="button"
                  onClick={() => toggleTable(table.id)}
                  aria-label={table.isActive ? "Desativar mesa" : "Ativar mesa"}
                  title={table.isActive ? "Desativar mesa" : "Ativar mesa"}
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
                  className="tables-manager__copy"
                  type="button"
                  onClick={() => copyLink(table.id)}
                  aria-label="Copiar link"
                  title="Copiar link"
                >
                  <Copy size={16} aria-hidden />
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
