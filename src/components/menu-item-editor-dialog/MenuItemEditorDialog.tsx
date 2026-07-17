"use client";

import { arrayMove } from "@dnd-kit/helpers";
import { DragDropProvider, type DragEndEvent } from "@dnd-kit/react";
import { isSortable } from "@dnd-kit/react/sortable";
import { ImagePlus, Loader2, Plus, Save, X } from "lucide-react";
import Image from "next/image";
import { useEffect, useMemo, useState, type DragEvent, type FormEvent } from "react";
import { SortableAdditionalCard } from "@/components/menu-item-editor-dialog/sortable-additional-card/SortableAdditionalCard";
import { ConfirmDialog } from "@/components/ui/confirm-dialog/ConfirmDialog";
import { getFriendlyErrorMessage } from "@/lib/errors/friendly-error";
import { deleteUploadedImage, uploadMenuItemImage, type MenuItemInput } from "@/lib/services/store-service";
import { formatPriceInput, getPriceDigits, parsePrice, sanitizePriceDigits } from "@/lib/utils/input-format";
import type { Additional, Category, MenuItem, OptionGroup } from "@/types/menu";
import "./menu-item-editor-dialog.scss";

interface MenuItemEditorDialogProps {
  storeId: string;
  categories: Category[];
  additionals: Additional[];
  item?: MenuItem;
  isSaving: boolean;
  onClose: () => void;
  onSubmit: (payload: MenuItemInput) => Promise<void>;
  onCreateCategory: (name: string) => Promise<Category>;
}

const createCategoryOptionValue = "__create_category__";
const maxSourceImageSizeInBytes = 15 * 1024 * 1024;
const defaultAdditionalGroupId = "adicionais";

const getInitialSelectedAdditionalIds = (item?: MenuItem) =>
  Array.from(new Set(item?.optionsGroups.flatMap((group) => group.choices.map((choice) => choice.id)) || []));

export function MenuItemEditorDialog({
  storeId,
  categories,
  additionals,
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
  const [isImageRemoved, setIsImageRemoved] = useState(false);
  const [categoryId, setCategoryId] = useState(item?.categoryId || categories[0]?.id || "");
  const [priceDigits, setPriceDigits] = useState(getPriceDigits(item?.price));
  const [isAvailable, setIsAvailable] = useState(item?.isAvailable ?? true);
  const [hasAdditionals, setHasAdditionals] = useState(
    item ? item.optionsGroups.some((group) => group.choices.length > 0) : false,
  );
  const [selectedAdditionalIds, setSelectedAdditionalIds] = useState(getInitialSelectedAdditionalIds(item));
  const [hasCustomAdditionalOrder, setHasCustomAdditionalOrder] = useState(Boolean(item));
  const [createdCategories, setCreatedCategories] = useState<Category[]>([]);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [isCategoryCreatorOpen, setIsCategoryCreatorOpen] = useState(false);
  const [isCreatingCategory, setIsCreatingCategory] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isImageDragging, setIsImageDragging] = useState(false);
  const [error, setError] = useState("");
  const [categoryError, setCategoryError] = useState("");
  const [isDiscardConfirmOpen, setIsDiscardConfirmOpen] = useState(false);
  const isBusy = isSaving || isUploadingImage || isCreatingCategory;
  const isDirty =
    Boolean(imageFile) ||
    isImageRemoved ||
    name.trim() !== (item?.name.trim() ?? "") ||
    description.trim() !== (item?.description.trim() ?? "") ||
    priceDigits !== getPriceDigits(item?.price);
  const requestClose = () => {
    if (isBusy) {
      return;
    }

    if (isDirty) {
      setIsDiscardConfirmOpen(true);
    } else {
      onClose();
    }
  };
  const displayedImageUrl = isImageRemoved ? "" : imagePreviewUrl || currentImageUrl;
  const availableCategories = [
    ...categories,
    ...createdCategories.filter((category) => !categories.some((current) => current.id === category.id)),
  ];
  const additionalGroupId =
    item?.optionsGroups.find((group) => group.choices.length > 0)?.id || defaultAdditionalGroupId;
  const additionalById = useMemo(
    () => new Map(additionals.map((additional) => [additional.id, additional])),
    [additionals],
  );
  const selectedAdditionals = selectedAdditionalIds
    .map((additionalId) => additionalById.get(additionalId))
    .filter((additional): additional is Additional => Boolean(additional));
  const displayedAdditionals = [
    ...selectedAdditionals,
    ...additionals.filter((additional) => !selectedAdditionalIds.includes(additional.id)),
  ];

  const buildOptionsGroups = (): OptionGroup[] => {
    if (!hasAdditionals) {
      return [];
    }

    const choices = selectedAdditionalIds
      .map((additionalId) => additionalById.get(additionalId))
      .filter((additional): additional is Additional => Boolean(additional))
      .map((additional) => ({
        id: additional.id,
        name: additional.name,
        price: additional.price,
        isAvailable: additional.isAvailable,
      }));

    if (!choices.length) {
      return [];
    }

    return [
      {
        id: additionalGroupId,
        name: "Adicionais",
        minSelected: 0,
        maxSelected: choices.length,
        choices,
        isRequired: false,
      },
    ];
  };

  const sortAdditionalIdsByGlobalOrder = (additionalIds: string[]) => {
    const selectedIds = new Set(additionalIds);
    return additionals.filter((additional) => selectedIds.has(additional.id)).map((additional) => additional.id);
  };

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

    if (hasAdditionals && !selectedAdditionalIds.length) {
      setError("Selecione os adicionais ou marque que o item não tem adicionais.");
      return;
    }

    if (imageFile && imageFile.size > maxSourceImageSizeInBytes) {
      setError("A imagem original deve ter até 15 MB.");
      return;
    }

    setError("");

    try {
      setIsUploadingImage(Boolean(imageFile));
      const imageUrl = isImageRemoved ? "" : imageFile ? await uploadMenuItemImage(storeId, imageFile) : currentImageUrl;

      await onSubmit({
        categoryId,
        name: name.trim(),
        description: description.trim(),
        imageUrl,
        price: parsedPrice,
        isAvailable,
        optionsGroups: buildOptionsGroups(),
      });

      if (currentImageUrl && currentImageUrl !== imageUrl) {
        await deleteUploadedImage(currentImageUrl).catch(() => undefined);
      }
    } catch (submitError) {
      setError(getFriendlyErrorMessage(submitError, "Não foi possível salvar o item. Revise os dados e tente novamente."));
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

    if (file.size > maxSourceImageSizeInBytes) {
      setError("A imagem original deve ter até 15 MB.");
      return;
    }

    setImageFile(file);
    setImagePreviewUrl(URL.createObjectURL(file));
    setIsImageRemoved(false);
    setError("");
  };

  const removeImage = () => {
    if (isBusy) {
      return;
    }

    setImageFile(null);
    setImagePreviewUrl("");
    setIsImageRemoved(true);
    setError("");
  };

  const dragImageFile = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();

    if (!isBusy) {
      setIsImageDragging(true);
    }
  };

  const leaveImageDropZone = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    setIsImageDragging(false);
  };

  const dropImageFile = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    setIsImageDragging(false);

    if (isBusy) {
      return;
    }

    selectImageFile(event.dataTransfer.files[0]);
  };

  const closeCategoryCreator = () => {
    if (isCreatingCategory) {
      return;
    }

    setCategoryError("");
    setNewCategoryName("");
    setIsCategoryCreatorOpen(false);
  };

  const toggleAdditional = (additionalId: string) => {
    setSelectedAdditionalIds((current) => {
      const next = current.includes(additionalId)
        ? current.filter((currentAdditionalId) => currentAdditionalId !== additionalId)
        : [...current, additionalId];

      return hasCustomAdditionalOrder ? next : sortAdditionalIdsByGlobalOrder(next);
    });
    setError("");
  };

  const finishAdditionalDrag = (event: DragEndEvent) => {
    if (event.canceled) {
      return;
    }

    const { source } = event.operation;

    if (!isSortable(source) || source.initialIndex === source.index) {
      return;
    }

    setHasCustomAdditionalOrder(true);
    setSelectedAdditionalIds((current) => {
      if (source.initialIndex < 0 || source.index < 0 || source.index >= current.length) {
        return current;
      }

      return arrayMove(current, source.initialIndex, source.index);
    });
  };

  return (
    <div className="menu-item-editor-dialog" role="presentation" onMouseDown={isBusy ? undefined : requestClose}>
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
          <button className="menu-item-editor-dialog__close" type="button" onClick={requestClose} disabled={isBusy} aria-label="Fechar">
            <X size={20} aria-hidden />
          </button>
        </header>

        <div className="menu-item-editor-dialog__content">
          <label className="menu-item-editor-dialog__image-field">
            <span className="menu-item-editor-dialog__label">Imagem</span>
            <span
              className={`menu-item-editor-dialog__upload${
                isImageDragging ? " menu-item-editor-dialog__upload--dragging" : ""
              }`}
              onDragEnter={dragImageFile}
              onDragOver={dragImageFile}
              onDragLeave={leaveImageDropZone}
              onDrop={dropImageFile}
            >
              <input
                className="menu-item-editor-dialog__file-input"
                type="file"
                accept="image/*"
                onChange={(event) => {
                  selectImageFile(event.target.files?.[0]);
                  event.target.value = "";
                }}
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
              {displayedImageUrl ? (
                <button
                  className="menu-item-editor-dialog__remove-image"
                  type="button"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    removeImage();
                  }}
                  disabled={isBusy}
                  aria-label="Remover imagem"
                  title="Remover imagem"
                >
                  <X size={16} aria-hidden />
                </button>
              ) : null}
            </span>
          </label>

          <label className="menu-item-editor-dialog__field">
            <span className="menu-item-editor-dialog__label">Nome *</span>
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
                Categoria *
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
              <span className="menu-item-editor-dialog__label">Preço *</span>
              <input
                className="menu-item-editor-dialog__control"
                type="text"
                value={formatPriceInput(priceDigits)}
                onChange={(event) => setPriceDigits(sanitizePriceDigits(event.target.value))}
                inputMode="numeric"
                autoComplete="off"
                placeholder="R$ 0,00"
                required
              />
            </label>
          </div>

          <section className="menu-item-editor-dialog__addons">
            <div className="menu-item-editor-dialog__addons-header">
              <div>
                <span className="menu-item-editor-dialog__label">Adicionais</span>
                <p className="menu-item-editor-dialog__hint">
                  Escolha os adicionais disponíveis. Arraste os marcados para definir a ordem no cardápio público.
                </p>
              </div>
              <label className="menu-item-editor-dialog__toggle">
                <input
                  className="menu-item-editor-dialog__toggle-input"
                  type="checkbox"
                  checked={hasAdditionals}
                  onChange={(event) => {
                    setHasAdditionals(event.target.checked);
                    if (!event.target.checked) {
                      setSelectedAdditionalIds([]);
                    }
                    setError("");
                  }}
                />
                <span className="menu-item-editor-dialog__toggle-control" />
                Este item tem adicionais
              </label>
            </div>

            {hasAdditionals ? (
              additionals.length ? (
                <DragDropProvider onDragEnd={finishAdditionalDrag}>
                  <div className="menu-item-editor-dialog__addons-list">
                    {displayedAdditionals.map((additional, index) => (
                      <SortableAdditionalCard
                        additional={additional}
                        index={index}
                        isSelected={selectedAdditionalIds.includes(additional.id)}
                        isBusy={isBusy}
                        selectedCount={selectedAdditionals.length}
                        onToggle={toggleAdditional}
                        key={additional.id}
                      />
                    ))}
                  </div>
                </DragDropProvider>
              ) : (
                <p className="menu-item-editor-dialog__hint">
                  Cadastre adicionais na tela de Cardápio para poder vinculá-los ao item.
                </p>
              )
            ) : null}
          </section>

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
          <button className="menu-item-editor-dialog__cancel" type="button" onClick={requestClose} disabled={isBusy}>
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
              <span className="menu-item-editor-dialog__label">Nome da categoria *</span>
              <input
                className="menu-item-editor-dialog__control"
                value={newCategoryName}
                onChange={(event) => setNewCategoryName(event.target.value)}
                placeholder="Ex.: Sobremesas"
                required
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

      {isDiscardConfirmOpen ? (
        <ConfirmDialog
          title="Descartar alterações?"
          description="As informações preenchidas neste item serão perdidas."
          confirmLabel="Descartar"
          cancelLabel="Continuar editando"
          loadingLabel="Descartando"
          onCancel={() => setIsDiscardConfirmOpen(false)}
          onConfirm={onClose}
        />
      ) : null}
    </div>
  );
}
