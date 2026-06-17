"use client";

import { ChevronDown, Loader2, Pencil, Plus, Trash2, ToggleLeft, ToggleRight } from "lucide-react";
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
      await updateMenuItem(storeId, item.id, {
        categoryId: item.categoryId,
        name: item.name,
        description: item.description,
        imageUrl: item.imageUrl,
        price: item.price,
        isAvailable: !item.isAvailable,
      });
      await onChanged();
      onFeedback(item.isAvailable ? "Item marcado como indisponível." : "Item marcado como disponível.");
    } catch (error) {
      onFeedback(error instanceof Error ? error.message : "Não foi possível alterar a disponibilidade.", "error");
    } finally {
      setSavingItemId("");
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
            <button
              className="menu-manager__category-header"
              type="button"
              aria-expanded={!collapsedCategories[category.id]}
              onClick={() =>
                setCollapsedCategories((current) => ({
                  ...current,
                  [category.id]: !current[category.id],
                }))
              }
            >
              <span className="menu-manager__category-copy">
                <strong className="menu-manager__category-title">{category.name}</strong>
                <span className="menu-manager__category-count">{items.length} itens</span>
              </span>
              <ChevronDown
                className={`menu-manager__category-icon${
                  !collapsedCategories[category.id] ? " menu-manager__category-icon--open" : ""
                }`}
                size={20}
                aria-hidden
              />
            </button>
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
