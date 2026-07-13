"use client";

import { useSortable } from "@dnd-kit/react/sortable";
import { GripVertical } from "lucide-react";
import { formatPriceInput, getPriceDigits } from "@/lib/utils/input-format";
import type { Additional } from "@/types/menu";
import "./sortable-additional-card.scss";

interface SortableAdditionalCardProps {
  additional: Additional;
  index: number;
  isSelected: boolean;
  isBusy: boolean;
  selectedCount: number;
  onToggle: (additionalId: string) => void;
}

const createInputId = (additionalId: string) => `menu-item-additional-${encodeURIComponent(additionalId)}`;

export function SortableAdditionalCard({
  additional,
  index,
  isSelected,
  isBusy,
  selectedCount,
  onToggle,
}: SortableAdditionalCardProps) {
  const { ref, isDragging } = useSortable({
    id: additional.id,
    index,
    disabled: !isSelected || isBusy || selectedCount < 2,
  });
  const inputId = createInputId(additional.id);

  return (
    <div
      className={`sortable-additional-card${isSelected ? " sortable-additional-card--selected" : ""}${
        isDragging ? " sortable-additional-card--dragging" : ""
      }${additional.isAvailable ? "" : " sortable-additional-card--disabled"}`}
      ref={ref}
    >
      {isSelected ? (
        <span className="sortable-additional-card__drag-indicator" aria-hidden>
          <GripVertical size={18} aria-hidden />
        </span>
      ) : (
        <span className="sortable-additional-card__drag-placeholder" aria-hidden />
      )}

      <label className="sortable-additional-card__select" htmlFor={inputId}>
        <input
          id={inputId}
          className="sortable-additional-card__checkbox"
          type="checkbox"
          checked={isSelected}
          onChange={() => onToggle(additional.id)}
          disabled={isBusy}
        />
        <span className="sortable-additional-card__copy">
          <strong className="sortable-additional-card__name">{additional.name}</strong>
          <small className="sortable-additional-card__price">
            {formatPriceInput(getPriceDigits(additional.price))}
            {additional.isAvailable ? "" : " · indisponível"}
          </small>
        </span>
      </label>
    </div>
  );
}
