"use client";

import { ImagePlus, Loader2, Plus, Save, X } from "lucide-react";
import Image from "next/image";
import { useEffect, useState, type FormEvent } from "react";
import { uploadMenuItemImage, type MenuItemInput } from "@/lib/services/store-service";
import type { Category, MenuItem } from "@/types/menu";
import "./menu-item-editor-dialog.scss";

interface MenuItemEditorDialogProps {
  storeId: string;
  categories: Category[];
  item?: MenuItem;
  isSaving: boolean;
  onClose: () => void;
  onSubmit: (payload: MenuItemInput) => Promise<void>;
  onCreateCategory: (name: string) => Promise<Category>;
}

const createCategoryOptionValue = "__create_category__";
const maxImageSizeInBytes = 5 * 1024 * 1024;

const formatPriceInput = (digits: string) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(digits || "0") / 100);

const getPriceDigits = (price?: number) =>
  typeof price === "number" ? String(Math.max(0, Math.round(price * 100))) : "";

const parsePrice = (digits: string) => Number(digits || "0") / 100;

export function MenuItemEditorDialog({
  storeId,
  categories,
  item,
  isSaving,
  onClose,
  onSubmit,
  onCreateCategory,
}: MenuItemEditorDialogProps) {
  const [name, setName] = useState(item?.name || "");
  const [description, setDescription] = useState(item?.description || "");
  const [currentImageUrl] = useState(item?.imageUrl || "");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState("");
  const [categoryId, setCategoryId] = useState(item?.categoryId || categories[0]?.id || "");
  const [priceDigits, setPriceDigits] = useState(getPriceDigits(item?.price));
  const [isAvailable, setIsAvailable] = useState(item?.isAvailable ?? true);
  const [createdCategories, setCreatedCategories] = useState<Category[]>([]);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [isCategoryCreatorOpen, setIsCategoryCreatorOpen] = useState(false);
  const [isCreatingCategory, setIsCreatingCategory] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [error, setError] = useState("");
  const [categoryError, setCategoryError] = useState("");
  const isBusy = isSaving || isUploadingImage || isCreatingCategory;
  const displayedImageUrl = imagePreviewUrl || currentImageUrl;

  const availableCategories = [
    ...categories,
    ...createdCategories.filter((category) => !categories.some((current) => current.id === category.id)),
  ];

  useEffect(() => {
    return () => {
      if (imagePreviewUrl.startsWith("blob:")) {
        URL.revokeObjectURL(imagePreviewUrl);
      }
    };
  }, [imagePreviewUrl]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsedPrice = parsePrice(priceDigits);

    if (!name.trim() || !categoryId || Number.isNaN(parsedPrice) || parsedPrice <= 0) {
      setError("Preencha nome, categoria e preço válido.");
      return;
    }

    if (imageFile && imageFile.size > maxImageSizeInBytes) {
      setError("A imagem deve ter até 5 MB.");
      return;
    }

    setError("");

    try {
      setIsUploadingImage(Boolean(imageFile));
      const imageUrl = imageFile ? await uploadMenuItemImage(storeId, imageFile) : currentImageUrl;

      await onSubmit({
        categoryId,
        name: name.trim(),
        description: description.trim(),
        imageUrl,
        price: parsedPrice,
        isAvailable,
      });
    } catch {
      setError("Revise os dados e tente novamente.");
    } finally {
      setIsUploadingImage(false);
    }
  };

  const submitCategory = async () => {
    if (newCategoryName.trim().length < 2) {
      setCategoryError("Informe um nome válido para a categoria.");
      return;
    }

    setCategoryError("");
    setIsCreatingCategory(true);

    try {
      const category = await onCreateCategory(newCategoryName.trim());
      setCreatedCategories((current) => [...current, category]);
      setCategoryId(category.id);
      setNewCategoryName("");
      setIsCategoryCreatorOpen(false);
    } catch {
      setCategoryError("Não foi possível criar a categoria.");
    } finally {
      setIsCreatingCategory(false);
    }
  };

  const changeCategory = (value: string) => {
    if (value === createCategoryOptionValue) {
      setCategoryError("");
      setNewCategoryName("");
      setIsCategoryCreatorOpen(true);
      return;
    }

    setCategoryId(value);
    setIsCategoryCreatorOpen(false);
    setNewCategoryName("");
  };

  const selectImageFile = (file?: File) => {
    if (!file) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      setError("Selecione um arquivo de imagem.");
      return;
    }

    if (file.size > maxImageSizeInBytes) {
      setError("A imagem deve ter até 5 MB.");
      return;
    }

    setImageFile(file);
    setImagePreviewUrl(URL.createObjectURL(file));
    setError("");
  };

  const closeCategoryCreator = () => {
    if (isCreatingCategory) {
      return;
    }

    setCategoryError("");
    setNewCategoryName("");
    setIsCategoryCreatorOpen(false);
  };

  return (
    <div className="menu-item-editor-dialog" role="presentation" onMouseDown={isBusy ? undefined : onClose}>
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
          <button className="menu-item-editor-dialog__close" type="button" onClick={onClose} disabled={isBusy} aria-label="Fechar">
            <X size={20} aria-hidden />
          </button>
        </header>

        <div className="menu-item-editor-dialog__content">
          <label className="menu-item-editor-dialog__image-field">
            <span className="menu-item-editor-dialog__label">Imagem</span>
            <span className="menu-item-editor-dialog__upload">
              <input
                className="menu-item-editor-dialog__file-input"
                type="file"
                accept="image/*"
                onChange={(event) => selectImageFile(event.target.files?.[0])}
                disabled={isBusy}
              />
              <span className="menu-item-editor-dialog__upload-box">
                {displayedImageUrl ? (
                  <Image
                    className="menu-item-editor-dialog__upload-preview"
                    src={displayedImageUrl}
                    alt=""
                    width={92}
                    height={92}
                    unoptimized
                  />
                ) : (
                  <span className="menu-item-editor-dialog__upload-placeholder">
                    <ImagePlus size={20} aria-hidden />
                    <span className="menu-item-editor-dialog__upload-text">Selecionar</span>
                  </span>
                )}
              </span>
            </span>
          </label>

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
            <div className="menu-item-editor-dialog__field">
              <label className="menu-item-editor-dialog__label" htmlFor="menu-item-category">
                Categoria
              </label>
              <select
                id="menu-item-category"
                className="menu-item-editor-dialog__control"
                value={categoryId}
                onChange={(event) => changeCategory(event.target.value)}
                required
              >
                <option value="" disabled>
                  Selecione uma categoria
                </option>
                {availableCategories.map((category) => (
                  <option value={category.id} key={category.id}>
                    {category.name}
                  </option>
                ))}
                <option value={createCategoryOptionValue}>+ Criar categoria</option>
              </select>
            </div>

            <label className="menu-item-editor-dialog__field">
              <span className="menu-item-editor-dialog__label">Preço</span>
              <input
                className="menu-item-editor-dialog__control"
                value={formatPriceInput(priceDigits)}
                onChange={(event) =>
                  setPriceDigits(event.target.value.replace(/\D/g, "").replace(/^0+(?=\d)/, "").slice(0, 9))
                }
                inputMode="numeric"
                placeholder="R$ 0,00"
                required
              />
            </label>
          </div>

          {item ? (
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
                <small className="menu-item-editor-dialog__switch-text">
                  Itens indisponíveis ficam ocultos do cardápio público.
                </small>
              </span>
            </label>
          ) : null}
        </div>

        <footer className="menu-item-editor-dialog__footer">
          {error ? <p className="menu-item-editor-dialog__error">{error}</p> : null}
          <button className="menu-item-editor-dialog__cancel" type="button" onClick={onClose} disabled={isBusy}>
            Cancelar
          </button>
          <button className="menu-item-editor-dialog__submit" type="submit" disabled={isBusy}>
            {isSaving || isUploadingImage ? (
              <Loader2 className="menu-item-editor-dialog__spinner" size={17} aria-hidden />
            ) : (
              <Save size={17} aria-hidden />
            )}
            {isUploadingImage ? "Enviando" : isSaving ? "Salvando" : "Salvar item"}
          </button>
        </footer>
      </form>

      {isCategoryCreatorOpen ? (
        <div
          className="menu-item-editor-dialog__category-overlay"
          role="presentation"
          onMouseDown={(event) => {
            event.stopPropagation();
            closeCategoryCreator();
          }}
        >
          <section
            className="menu-item-editor-dialog__category-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="menu-item-category-dialog-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header className="menu-item-editor-dialog__category-header">
              <div>
                <span className="menu-item-editor-dialog__eyebrow">Nova categoria</span>
                <h3 className="menu-item-editor-dialog__category-title" id="menu-item-category-dialog-title">
                  Criar categoria
                </h3>
              </div>
              <button
                className="menu-item-editor-dialog__close"
                type="button"
                onClick={closeCategoryCreator}
                disabled={isCreatingCategory}
                aria-label="Fechar criação de categoria"
              >
                <X size={20} aria-hidden />
              </button>
            </header>

            <label className="menu-item-editor-dialog__field">
              <span className="menu-item-editor-dialog__label">Nome da categoria</span>
              <input
                className="menu-item-editor-dialog__control"
                value={newCategoryName}
                onChange={(event) => setNewCategoryName(event.target.value)}
                placeholder="Ex.: Sobremesas"
              />
            </label>

            {categoryError ? <p className="menu-item-editor-dialog__category-error">{categoryError}</p> : null}

            <div className="menu-item-editor-dialog__category-actions">
              <button
                className="menu-item-editor-dialog__cancel"
                type="button"
                onClick={closeCategoryCreator}
                disabled={isCreatingCategory}
              >
                Cancelar
              </button>
              <button
                className="menu-item-editor-dialog__submit"
                type="button"
                onClick={submitCategory}
                disabled={isCreatingCategory}
              >
                {isCreatingCategory ? (
                  <Loader2 className="menu-item-editor-dialog__spinner" size={17} aria-hidden />
                ) : (
                  <Plus size={17} aria-hidden />
                )}
                {isCreatingCategory ? "Criando" : "Criar categoria"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
