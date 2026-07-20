"use client";

import { useSortable } from "@dnd-kit/react/sortable";
import { GripVertical } from "lucide-react";
import type { ReactNode } from "react";
import type { Category } from "@/types/menu";
import "./sortable-category.scss";

interface SortableCategoryProps {
  category: Category;
  index: number;
  itemCount: number;
  isBusy: boolean;
  actions: ReactNode;
  children: ReactNode;
}

export function SortableCategory({ category, index, itemCount, isBusy, actions, children }: SortableCategoryProps) {
  const { ref, handleRef, isDragging } = useSortable({ id: category.id, index, disabled: isBusy });

  return (
    <section
      className={`menu-manager__category sortable-category${isDragging ? " sortable-category--dragging" : ""}`}
      ref={ref}
    >
      <div className="menu-manager__category-header">
        <span className="sortable-category__lead">
          <button
            className="sortable-category__handle"
            type="button"
            ref={handleRef}
            disabled={isBusy}
            aria-label={`Reordenar ${category.name}`}
            title={`Reordenar ${category.name}`}
          >
            <GripVertical size={18} aria-hidden />
          </button>
          <span className="menu-manager__category-copy">
            <strong className="menu-manager__category-title">{category.name}</strong>
            <span className="menu-manager__category-count">{itemCount} itens</span>
          </span>
        </span>
        <span className="menu-manager__category-actions">{actions}</span>
      </div>
      {children}
    </section>
  );
}
