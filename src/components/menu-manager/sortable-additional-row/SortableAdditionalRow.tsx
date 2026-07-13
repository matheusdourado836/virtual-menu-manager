"use client";

import { useSortable } from "@dnd-kit/react/sortable";
import { GripVertical, Pencil, Trash2 } from "lucide-react";
import { formatCurrency } from "@/lib/utils/money";
import type { Additional } from "@/types/menu";
import "./sortable-additional-row.scss";

interface SortableAdditionalRowProps {
  additional: Additional;
  index: number;
  isBusy: boolean;
  onEdit: (additional: Additional) => void;
  onDelete: (additional: Additional) => void;
}

export function SortableAdditionalRow({
  additional,
  index,
  isBusy,
  onEdit,
  onDelete,
}: SortableAdditionalRowProps) {
  const { ref, handleRef, isDragging } = useSortable({
    id: additional.id,
    index,
    disabled: isBusy,
  });

  return (
    <article
      className={`sortable-additional-row${additional.isAvailable ? "" : " sortable-additional-row--disabled"}${
        isDragging ? " sortable-additional-row--dragging" : ""
      }`}
      ref={ref}
    >
      <button
        className="sortable-additional-row__handle"
        type="button"
        ref={handleRef}
        disabled={isBusy}
        aria-label={`Reordenar ${additional.name}`}
        title={`Reordenar ${additional.name}`}
      >
        <GripVertical size={18} aria-hidden />
      </button>

      <span className="sortable-additional-row__copy">
        <strong className="sortable-additional-row__name">{additional.name}</strong>
        <small className="sortable-additional-row__price">{formatCurrency(additional.price)}</small>
      </span>

      <span className="sortable-additional-row__buttons">
        <button
          className="sortable-additional-row__action"
          type="button"
          onClick={() => onEdit(additional)}
          disabled={isBusy}
          aria-label={`Editar ${additional.name}`}
          title={`Editar ${additional.name}`}
        >
          <Pencil size={18} aria-hidden />
        </button>
        <button
          className="sortable-additional-row__action sortable-additional-row__action--danger"
          type="button"
          onClick={() => onDelete(additional)}
          disabled={isBusy}
          aria-label={`Excluir ${additional.name}`}
          title={`Excluir ${additional.name}`}
        >
          <Trash2 size={18} aria-hidden />
        </button>
      </span>
    </article>
  );
}
