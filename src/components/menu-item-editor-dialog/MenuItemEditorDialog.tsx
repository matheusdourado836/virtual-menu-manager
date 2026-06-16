"use client";

import { Loader2, Save, X } from "lucide-react";
import { useState, type FormEvent } from "react";
import type { MenuItemInput } from "@/lib/services/store-service";
import type { Category, MenuItem } from "@/types/menu";
import "./menu-item-editor-dialog.scss";

interface MenuItemEditorDialogProps {
  categories: Category[];
  item?: MenuItem;
  isSaving: boolean;
  onClose: () => void;
  onSubmit: (payload: MenuItemInput) => Promise<void>;
}

const formatPriceInput = (price?: number) => (typeof price === "number" ? price.toFixed(2).replace(".", ",") : "");

const parsePrice = (price: string) => Number(price.replace(/\./g, "").replace(",", "."));

export function MenuItemEditorDialog({ categories, item, isSaving, onClose, onSubmit }: MenuItemEditorDialogProps) {
  const [name, setName] = useState(item?.name || "");
  const [description, setDescription] = useState(item?.description || "");
  const [imageUrl, setImageUrl] = useState(item?.imageUrl || "");
  const [categoryId, setCategoryId] = useState(item?.categoryId || categories[0]?.id || "");
  const [price, setPrice] = useState(formatPriceInput(item?.price));
  const [isAvailable, setIsAvailable] = useState(item?.isAvailable ?? true);
  const [error, setError] = useState("");

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsedPrice = parsePrice(price);

    if (!name.trim() || !categoryId || Number.isNaN(parsedPrice) || parsedPrice < 0) {
      setError("Preencha nome, categoria e preço válido.");
      return;
    }

    setError("");

    try {
      await onSubmit({
        categoryId,
        name: name.trim(),
        description: description.trim(),
        imageUrl: imageUrl.trim(),
        price: parsedPrice,
        isAvailable,
      });
    } catch {
      setError("Revise os dados e tente novamente.");
    }
  };

  return (
    <div className="menu-item-editor-dialog" role="presentation" onMouseDown={isSaving ? undefined : onClose}>
      <form
        className="menu-item-editor-dialog__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="menu-item-editor-title"
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={submit}
      >
        <header className="menu-item-editor-dialog__header">
          <div className="menu-item-editor-dialog__heading">
            <span className="menu-item-editor-dialog__eyebrow">{item ? "Editar item" : "Novo item"}</span>
            <h2 className="menu-item-editor-dialog__title" id="menu-item-editor-title">
              {item ? item.name : "Criar item do cardápio"}
            </h2>
          </div>
          <button className="menu-item-editor-dialog__close" type="button" onClick={onClose} disabled={isSaving} aria-label="Fechar">
            <X size={20} aria-hidden />
          </button>
        </header>

        <div className="menu-item-editor-dialog__content">
          <label className="menu-item-editor-dialog__field">
            <span className="menu-item-editor-dialog__label">Nome</span>
            <input
              className="menu-item-editor-dialog__control"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Ex.: Cappuccino clássico"
              required
            />
          </label>

          <label className="menu-item-editor-dialog__field">
            <span className="menu-item-editor-dialog__label">Descrição</span>
            <textarea
              className="menu-item-editor-dialog__textarea"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Descrição curta do item"
              rows={3}
            />
          </label>

          <div className="menu-item-editor-dialog__grid">
            <label className="menu-item-editor-dialog__field">
              <span className="menu-item-editor-dialog__label">Categoria</span>
              <select
                className="menu-item-editor-dialog__control"
                value={categoryId}
                onChange={(event) => setCategoryId(event.target.value)}
                required
              >
                {categories.map((category) => (
                  <option value={category.id} key={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="menu-item-editor-dialog__field">
              <span className="menu-item-editor-dialog__label">Preço</span>
              <input
                className="menu-item-editor-dialog__control"
                value={price}
                onChange={(event) => setPrice(event.target.value)}
                inputMode="decimal"
                placeholder="0,00"
                required
              />
            </label>
          </div>

          <label className="menu-item-editor-dialog__field">
            <span className="menu-item-editor-dialog__label">Imagem</span>
            <input
              className="menu-item-editor-dialog__control"
              value={imageUrl}
              onChange={(event) => setImageUrl(event.target.value)}
              placeholder="/placeholder-item.svg ou URL da imagem"
            />
          </label>

          <label className="menu-item-editor-dialog__switch">
            <input
              className="menu-item-editor-dialog__switch-input"
              type="checkbox"
              checked={isAvailable}
              onChange={(event) => setIsAvailable(event.target.checked)}
            />
            <span className="menu-item-editor-dialog__switch-control" />
            <span className="menu-item-editor-dialog__switch-copy">
              <strong className="menu-item-editor-dialog__switch-title">Item disponível</strong>
              <small className="menu-item-editor-dialog__switch-text">Itens indisponíveis ficam ocultos do cardápio público.</small>
            </span>
          </label>
        </div>

        <footer className="menu-item-editor-dialog__footer">
          {error ? <p className="menu-item-editor-dialog__error">{error}</p> : null}
          <button className="menu-item-editor-dialog__cancel" type="button" onClick={onClose} disabled={isSaving}>
            Cancelar
          </button>
          <button className="menu-item-editor-dialog__submit" type="submit" disabled={isSaving}>
            {isSaving ? <Loader2 className="menu-item-editor-dialog__spinner" size={17} aria-hidden /> : <Save size={17} aria-hidden />}
            {isSaving ? "Salvando" : "Salvar item"}
          </button>
        </footer>
      </form>
    </div>
  );
}
