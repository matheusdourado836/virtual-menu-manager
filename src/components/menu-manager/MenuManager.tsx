"use client";

import { ChevronDown, Loader2, Pencil, Plus, Trash2, ToggleLeft, ToggleRight, X } from "lucide-react";
import { forwardRef, useImperativeHandle, useMemo, useState, type ForwardedRef } from "react";
import { MenuItemEditorDialog } from "@/components/menu-item-editor-dialog/MenuItemEditorDialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog/ConfirmDialog";
import {
  createCategory,
  createMenuItem,
  deleteMenuItem,
  updateMenuItem,
  type MenuItemInput,
} from "@/lib/services/store-service";
import { formatCurrency } from "@/lib/utils/money";
import type { Category, MenuItem } from "@/types/menu";
import "./menu-manager.scss";

interface MenuManagerProps {
  storeId: string;
  categories: Category[];
  menuItems: MenuItem[];
  onChanged: () => void | Promise<void>;
  onFeedback: (message: string, variant?: "success" | "error" | "info") => void;
}

export interface MenuManagerHandle {
  openCreateItem: () => void;
}

function MenuManagerComponent(
  { storeId, categories, menuItems, onChanged, onFeedback }: MenuManagerProps,
  ref: ForwardedRef<MenuManagerHandle>,
) {
  const [newCategory, setNewCategory] = useState("");
  const [isCreatingCategory, setIsCreatingCategory] = useState(false);
  const [isCreatingItem, setIsCreatingItem] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [itemToDelete, setItemToDelete] = useState<MenuItem | null>(null);
  const [savingItemId, setSavingItemId] = useState("");
  const [deletingItemId, setDeletingItemId] = useState("");
  const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({});
  const [categoryToReceiveItems, setCategoryToReceiveItems] = useState<Category | null>(null);
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [isMovingItems, setIsMovingItems] = useState(false);
  const [moveItemsError, setMoveItemsError] = useState("");

  const activeCategories = useMemo(() => categories.filter((category) => category.isActive), [categories]);
  const groupedItems = useMemo(
    () =>
      activeCategories.map((category) => ({
        category,
        items: menuItems.filter((item) => item.categoryId === category.id),
      })),
    [activeCategories, menuItems],
  );
  const isEditorOpen = isCreatingItem || Boolean(editingItem);
  const selectableItemsCount = useMemo(
    () =>
      categoryToReceiveItems
        ? groupedItems.reduce(
            (total, group) =>
              total + group.items.filter((item) => item.categoryId !== categoryToReceiveItems.id).length,
            0,
          )
        : 0,
    [categoryToReceiveItems, groupedItems],
  );

  const getItemPayload = (item: MenuItem, categoryId = item.categoryId): MenuItemInput => ({
    categoryId,
    name: item.name,
    description: item.description,
    imageUrl: item.imageUrl,
    price: item.price,
    isAvailable: item.isAvailable,
  });

  useImperativeHandle(ref, () => ({
    openCreateItem: () => {
      setEditingItem(null);
      setIsCreatingItem(true);
    },
  }));

  const addCategory = async () => {
    if (!newCategory.trim()) {
      onFeedback("Informe o nome da categoria.", "error");
      return;
    }

    setIsCreatingCategory(true);

    try {
      await createCategory(storeId, newCategory.trim());
      setNewCategory("");
      await onChanged();
      onFeedback("Categoria criada.");
    } catch (error) {
      onFeedback(error instanceof Error ? error.message : "Não foi possível criar a categoria.", "error");
    } finally {
      setIsCreatingCategory(false);
    }
  };

  const saveItem = async (payload: MenuItemInput) => {
    const itemId = editingItem?.id || "new";
    setSavingItemId(itemId);

    try {
      if (editingItem) {
        await updateMenuItem(storeId, editingItem.id, payload);
        onFeedback("Item atualizado.");
      } else {
        await createMenuItem(storeId, payload);
        onFeedback("Item criado.");
      }

      await onChanged();
      setIsCreatingItem(false);
      setEditingItem(null);
    } catch (error) {
      onFeedback(error instanceof Error ? error.message : "Não foi possível salvar o item.", "error");
      throw error;
    } finally {
      setSavingItemId("");
    }
  };

  const createCategoryFromEditor = async (name: string) => {
    const category = await createCategory(storeId, name);
    await onChanged();
    onFeedback("Categoria criada.");
    return category;
  };

  const toggleItem = async (item: MenuItem) => {
    setSavingItemId(item.id);

    try {
      await updateMenuItem(storeId, item.id, { ...getItemPayload(item), isAvailable: !item.isAvailable });
      await onChanged();
      onFeedback(item.isAvailable ? "Item marcado como indisponível." : "Item marcado como disponível.");
    } catch (error) {
      onFeedback(error instanceof Error ? error.message : "Não foi possível alterar a disponibilidade.", "error");
    } finally {
      setSavingItemId("");
    }
  };

  const openAddItemsDialog = (category: Category) => {
    setCategoryToReceiveItems(category);
    setSelectedItemIds([]);
    setMoveItemsError("");
  };

  const closeAddItemsDialog = () => {
    if (isMovingItems) {
      return;
    }

    setCategoryToReceiveItems(null);
    setSelectedItemIds([]);
    setMoveItemsError("");
  };

  const toggleSelectedItem = (itemId: string) => {
    setSelectedItemIds((current) =>
      current.includes(itemId) ? current.filter((currentItemId) => currentItemId !== itemId) : [...current, itemId],
    );
    setMoveItemsError("");
  };

  const moveSelectedItemsToCategory = async () => {
    if (!categoryToReceiveItems) {
      return;
    }

    const selectedItems = menuItems.filter((item) => selectedItemIds.includes(item.id));

    if (!selectedItems.length) {
      setMoveItemsError("Selecione pelo menos um item para adicionar.");
      return;
    }

    setIsMovingItems(true);
    setMoveItemsError("");

    try {
      await Promise.all(
        selectedItems.map((item) =>
          updateMenuItem(storeId, item.id, getItemPayload(item, categoryToReceiveItems.id)),
        ),
      );
      await onChanged();
      onFeedback(
        `${selectedItems.length} ${selectedItems.length === 1 ? "item adicionado" : "itens adicionados"} em ${categoryToReceiveItems.name}.`,
      );
      setCategoryToReceiveItems(null);
      setSelectedItemIds([]);
      setMoveItemsError("");
    } catch (error) {
      setMoveItemsError(error instanceof Error ? error.message : "Não foi possível adicionar os itens.");
      onFeedback(error instanceof Error ? error.message : "Não foi possível adicionar os itens.", "error");
    } finally {
      setIsMovingItems(false);
    }
  };

  const confirmDeleteItem = async () => {
    if (!itemToDelete) {
      return;
    }

    setDeletingItemId(itemToDelete.id);

    try {
      await deleteMenuItem(storeId, itemToDelete.id);
      await onChanged();
      onFeedback("Item excluído.");
      setItemToDelete(null);
    } catch (error) {
      onFeedback(error instanceof Error ? error.message : "Não foi possível excluir o item.", "error");
    } finally {
      setDeletingItemId("");
    }
  };

  return (
    <section className="menu-manager">
      <div className="menu-manager__toolbar">
        <div className="menu-manager__form">
          <label className="menu-manager__field">
            <span className="menu-manager__label">Nova categoria</span>
            <input
              className="menu-manager__control"
              value={newCategory}
              onChange={(event) => setNewCategory(event.target.value)}
              placeholder="Ex.: Sobremesas"
            />
          </label>
          <button className="menu-manager__button" type="button" onClick={addCategory} disabled={isCreatingCategory}>
            {isCreatingCategory ? <Loader2 className="menu-manager__spinner" size={17} aria-hidden /> : <Plus size={18} aria-hidden />}
            {isCreatingCategory ? "Criando" : "Criar categoria"}
          </button>
        </div>

      </div>

      <div className="menu-manager__categories">
        {groupedItems.map(({ category, items }) => (
          <section className="menu-manager__category" key={category.id}>
            <div className="menu-manager__category-header">
              <span className="menu-manager__category-copy">
                <strong className="menu-manager__category-title">{category.name}</strong>
                <span className="menu-manager__category-count">{items.length} itens</span>
              </span>
              <span className="menu-manager__category-actions">
                <button
                  className="menu-manager__category-button"
                  type="button"
                  onClick={() => openAddItemsDialog(category)}
                  aria-label={`Adicionar itens em ${category.name}`}
                  title={`Adicionar itens em ${category.name}`}
                >
                  <Plus size={18} aria-hidden />
                </button>
                <button
                  className="menu-manager__category-button"
                  type="button"
                  aria-expanded={!collapsedCategories[category.id]}
                  onClick={() =>
                    setCollapsedCategories((current) => ({
                      ...current,
                      [category.id]: !current[category.id],
                    }))
                  }
                  aria-label={collapsedCategories[category.id] ? `Expandir ${category.name}` : `Recolher ${category.name}`}
                  title={collapsedCategories[category.id] ? `Expandir ${category.name}` : `Recolher ${category.name}`}
                >
                  <ChevronDown
                    className={`menu-manager__category-icon${
                      !collapsedCategories[category.id] ? " menu-manager__category-icon--open" : ""
                    }`}
                    size={20}
                    aria-hidden
                  />
                </button>
              </span>
            </div>
            {!collapsedCategories[category.id] ? (
              <div className="menu-manager__items">
                {items.map((item) => {
                  const isSaving = savingItemId === item.id;
                  const isDeleting = deletingItemId === item.id;

                  return (
                    <article
                      className={`menu-manager__item${item.isAvailable ? "" : " menu-manager__item--disabled"}`}
                      key={item.id}
                    >
                      <div className="menu-manager__item-copy">
                        <strong className="menu-manager__item-name">{item.name}</strong>
                        <span className="menu-manager__item-description">{item.description || "Sem descrição"}</span>
                        {item.needsReview ? <em className="menu-manager__review">TODO_REVIEW</em> : null}
                      </div>
                      <strong className="menu-manager__price">{formatCurrency(item.price)}</strong>
                      <div className="menu-manager__item-actions">
                        <button
                          className="menu-manager__icon-button"
                          type="button"
                          onClick={() => setEditingItem(item)}
                          disabled={isSaving || isDeleting}
                          aria-label={`Editar ${item.name}`}
                          title={`Editar ${item.name}`}
                        >
                          <Pencil size={18} aria-hidden />
                        </button>
                        <button
                          className="menu-manager__icon-button"
                          type="button"
                          onClick={() => toggleItem(item)}
                          disabled={isSaving || isDeleting}
                          aria-label={item.isAvailable ? "Marcar indisponível" : "Marcar disponível"}
                          title={item.isAvailable ? "Marcar indisponível" : "Marcar disponível"}
                        >
                          {isSaving ? (
                            <Loader2 className="menu-manager__spinner" size={18} aria-hidden />
                          ) : item.isAvailable ? (
                            <ToggleRight size={22} aria-hidden />
                          ) : (
                            <ToggleLeft size={22} aria-hidden />
                          )}
                        </button>
                        <button
                          className="menu-manager__icon-button menu-manager__icon-button--danger"
                          type="button"
                          onClick={() => setItemToDelete(item)}
                          disabled={isSaving || isDeleting}
                          aria-label={`Excluir ${item.name}`}
                          title={`Excluir ${item.name}`}
                        >
                          <Trash2 size={18} aria-hidden />
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : null}
          </section>
        ))}
      </div>

      {isEditorOpen ? (
        <MenuItemEditorDialog
          storeId={storeId}
          categories={activeCategories}
          item={editingItem || undefined}
          isSaving={Boolean(savingItemId)}
          onClose={() => {
            if (!savingItemId) {
              setIsCreatingItem(false);
              setEditingItem(null);
            }
          }}
          onSubmit={saveItem}
          onCreateCategory={createCategoryFromEditor}
        />
      ) : null}

      {categoryToReceiveItems ? (
        <div className="menu-manager__dialog-overlay" role="presentation" onMouseDown={closeAddItemsDialog}>
          <section
            className="menu-manager__dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="menu-manager-add-items-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header className="menu-manager__dialog-header">
              <div className="menu-manager__dialog-heading">
                <span className="menu-manager__dialog-eyebrow">Adicionar à categoria</span>
                <h2 className="menu-manager__dialog-title" id="menu-manager-add-items-title">
                  {categoryToReceiveItems.name}
                </h2>
              </div>
              <button
                className="menu-manager__dialog-close"
                type="button"
                onClick={closeAddItemsDialog}
                disabled={isMovingItems}
                aria-label="Fechar"
              >
                <X size={20} aria-hidden />
              </button>
            </header>

            <div className="menu-manager__dialog-content">
              {selectableItemsCount ? (
                groupedItems.map(({ category, items }) => (
                  <section className="menu-manager__picker-group" key={category.id}>
                    <div className="menu-manager__picker-heading">
                      <strong className="menu-manager__picker-title">{category.name}</strong>
                      <span className="menu-manager__picker-count">
                        {category.id === categoryToReceiveItems.id ? "Já na categoria" : `${items.length} itens`}
                      </span>
                    </div>

                    {items.length ? (
                      <div className="menu-manager__picker-items">
                        {items.map((item) => {
                          const isAlreadyInTargetCategory = item.categoryId === categoryToReceiveItems.id;
                          const isSelected = selectedItemIds.includes(item.id);

                          return (
                            <label
                              className={`menu-manager__picker-item${
                                isSelected ? " menu-manager__picker-item--selected" : ""
                              }${
                                isAlreadyInTargetCategory ? " menu-manager__picker-item--disabled" : ""
                              }`}
                              key={item.id}
                            >
                              <input
                                className="menu-manager__picker-checkbox"
                                type="checkbox"
                                checked={isSelected}
                                disabled={isAlreadyInTargetCategory || isMovingItems}
                                onChange={() => toggleSelectedItem(item.id)}
                              />
                              <span className="menu-manager__picker-copy">
                                <strong className="menu-manager__picker-name">{item.name}</strong>
                                <small className="menu-manager__picker-detail">
                                  {isAlreadyInTargetCategory ? "Já está nesta categoria" : formatCurrency(item.price)}
                                </small>
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="menu-manager__picker-empty">Nenhum item nesta categoria.</p>
                    )}
                  </section>
                ))
              ) : (
                <p className="menu-manager__picker-empty">
                  Não há itens em outras categorias para adicionar aqui.
                </p>
              )}
            </div>

            <footer className="menu-manager__dialog-footer">
              {moveItemsError ? <p className="menu-manager__dialog-error">{moveItemsError}</p> : null}
              <button
                className="menu-manager__button"
                type="button"
                onClick={closeAddItemsDialog}
                disabled={isMovingItems}
              >
                Cancelar
              </button>
              <button
                className="menu-manager__primary"
                type="button"
                onClick={moveSelectedItemsToCategory}
                disabled={isMovingItems || !selectedItemIds.length}
              >
                {isMovingItems ? <Loader2 className="menu-manager__spinner" size={17} aria-hidden /> : <Plus size={17} aria-hidden />}
                {isMovingItems ? "Adicionando" : `Adicionar ${selectedItemIds.length || ""}`.trim()}
              </button>
            </footer>
          </section>
        </div>
      ) : null}

      {itemToDelete ? (
        <ConfirmDialog
          title="Tem certeza que deseja excluir este item?"
          description={`Essa ação não pode ser desfeita. "${itemToDelete.name}" deixará de aparecer no cardápio.`}
          confirmLabel="Excluir item"
          isLoading={deletingItemId === itemToDelete.id}
          onCancel={() => {
            if (!deletingItemId) {
              setItemToDelete(null);
            }
          }}
          onConfirm={confirmDeleteItem}
        />
      ) : null}
    </section>
  );
}

export const MenuManager = forwardRef(MenuManagerComponent);
