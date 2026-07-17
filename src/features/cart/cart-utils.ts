import type { CartLine, CartSelectedOption, MenuItem, OrderItem } from "@/types/menu";
import { formatCurrency } from "@/lib/utils/money";

const cartStoragePrefix = "virtual-menu-manager:cart";

export type CartReconciliationChange =
  | {
    type: "item_unavailable";
    itemId: string;
    itemName: string;
  }
  | {
    type: "additional_unavailable";
    itemId: string;
    itemName: string;
    choiceId: string;
    choiceName: string;
  }
  | {
    type: "item_price_changed";
    itemId: string;
    itemName: string;
    previousPrice: number;
    currentPrice: number;
  }
  | {
    type: "item_details_changed";
    itemId: string;
    itemName: string;
  }
  | {
    type: "additional_details_changed";
    itemId: string;
    itemName: string;
    choiceId: string;
    choiceName: string;
  }
  | {
    type: "duplicate_option_removed";
    itemId: string;
    itemName: string;
    choiceId: string;
    choiceName: string;
  }
  | {
    type: "options_limit_changed";
    itemId: string;
    itemName: string;
    groupId: string;
    groupName: string;
    maxSelected: number;
  }
  | {
    type: "required_options_missing";
    itemId: string;
    itemName: string;
    groupId: string;
    groupName: string;
    minSelected: number;
  };

export interface CartReconciliationResult {
  lines: CartLine[];
  changes: CartReconciliationChange[];
}

export const createCartLine = (
  item: MenuItem,
  selectedOptions: CartSelectedOption[],
  observation?: string,
): CartLine => ({
  id: `${item.id}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  menuItemId: item.id,
  name: item.name,
  unitPrice: item.price,
  quantity: 1,
  selectedOptions,
  observation,
});

export const getLineUnitTotal = (line: Pick<CartLine, "unitPrice" | "selectedOptions">) =>
  line.unitPrice + line.selectedOptions.reduce((total, option) => total + option.price, 0);

export const getLineTotal = (line: CartLine) => getLineUnitTotal(line) * line.quantity;

export const getCartSubtotal = (lines: CartLine[]) =>
  lines.reduce((total, line) => total + getLineTotal(line), 0);

export const getCartQuantity = (lines: CartLine[]) =>
  lines.reduce((total, line) => total + line.quantity, 0);

export const getCartStorageKey = (storeId: string, tableId?: string) =>
  `${cartStoragePrefix}:${storeId}:${tableId || "balcao"}`;

export const readStoredCart = (storeId: string, tableId?: string): CartLine[] => {
  if (typeof window === "undefined") {
    return [];
  }

  const raw = window.localStorage.getItem(getCartStorageKey(storeId, tableId));

  if (!raw) {
    return [];
  }

  try {
    const parsedCart = JSON.parse(raw) as unknown;
    return Array.isArray(parsedCart) ? parsedCart as CartLine[] : [];
  } catch {
    window.localStorage.removeItem(getCartStorageKey(storeId, tableId));
    return [];
  }
};

export const writeStoredCart = (storeId: string, tableId: string | undefined, lines: CartLine[]) => {
  if (typeof window === "undefined") {
    return;
  }

  const key = getCartStorageKey(storeId, tableId);

  if (!lines.length) {
    window.localStorage.removeItem(key);
    return;
  }

  window.localStorage.setItem(key, JSON.stringify(lines));
};

export const reconcileCartWithMenu = (
  lines: CartLine[],
  menuItems: MenuItem[],
): CartReconciliationResult => {
  const changes: CartReconciliationChange[] = [];
  const changeKeys = new Set<string>();
  const addChange = (key: string, change: CartReconciliationChange) => {
    if (changeKeys.has(key)) return;

    changeKeys.add(key);
    changes.push(change);
  };

  const reconciledLines = lines.flatMap((line): CartLine[] => {
    const officialItem = menuItems.find((item) => item.id === line.menuItemId);
    const storedItemName = line.name?.trim() || "Item do cardápio";

    if (!officialItem?.isAvailable) {
      addChange(`item_unavailable:${line.menuItemId}`, {
        type: "item_unavailable",
        itemId: line.menuItemId,
        itemName: officialItem?.name?.trim() || storedItemName,
      });
      return [];
    }

    const itemName = officialItem.name.trim() || storedItemName;
    const selectedOptionsByGroup = new Map<string, CartSelectedOption[]>();
    const selectedOptionKeys = new Set<string>();

    for (const selectedOption of Array.isArray(line.selectedOptions) ? line.selectedOptions : []) {
      const group = officialItem.optionsGroups.find((candidate) => candidate.id === selectedOption.groupId);
      const choice = group?.choices.find((candidate) => candidate.id === selectedOption.choiceId);

      if (!group || !choice?.isAvailable) {
        addChange(`additional_unavailable:${line.menuItemId}:${selectedOption.choiceId}`, {
          type: "additional_unavailable",
          itemId: line.menuItemId,
          itemName,
          choiceId: selectedOption.choiceId,
          choiceName: choice?.name?.trim() || selectedOption.choiceName?.trim() || "Adicional",
        });
        continue;
      }

      const optionKey = `${group.id}:${choice.id}`;

      if (selectedOptionKeys.has(optionKey)) {
        addChange(`duplicate_option_removed:${line.menuItemId}:${choice.id}`, {
          type: "duplicate_option_removed",
          itemId: line.menuItemId,
          itemName,
          choiceId: choice.id,
          choiceName: choice.name,
        });
        continue;
      }

      selectedOptionKeys.add(optionKey);
      const officialOption = {
        groupId: group.id,
        groupName: group.name,
        choiceId: choice.id,
        choiceName: choice.name,
        price: Number(choice.price),
      };
      const groupOptions = selectedOptionsByGroup.get(group.id) || [];
      groupOptions.push(officialOption);
      selectedOptionsByGroup.set(group.id, groupOptions);

      if (
        selectedOption.groupName !== officialOption.groupName
        || selectedOption.choiceName !== officialOption.choiceName
        || Number(selectedOption.price) !== officialOption.price
      ) {
        addChange(`additional_details_changed:${line.menuItemId}:${choice.id}`, {
          type: "additional_details_changed",
          itemId: line.menuItemId,
          itemName,
          choiceId: choice.id,
          choiceName: choice.name,
        });
      }
    }

    for (const group of officialItem.optionsGroups) {
      const groupOptions = selectedOptionsByGroup.get(group.id) || [];
      const maxSelected = Math.max(0, Number(group.maxSelected) || 0);

      if (groupOptions.length > maxSelected) {
        selectedOptionsByGroup.set(group.id, groupOptions.slice(0, maxSelected));
        addChange(`options_limit_changed:${line.menuItemId}:${group.id}`, {
          type: "options_limit_changed",
          itemId: line.menuItemId,
          itemName,
          groupId: group.id,
          groupName: group.name,
          maxSelected,
        });
      }

      const minimumRequired = Math.max(Number(group.minSelected) || 0, group.isRequired ? 1 : 0);
      const selectedCount = Math.min(groupOptions.length, maxSelected);

      if (selectedCount < minimumRequired) {
        addChange(`required_options_missing:${line.menuItemId}:${group.id}`, {
          type: "required_options_missing",
          itemId: line.menuItemId,
          itemName,
          groupId: group.id,
          groupName: group.name,
          minSelected: minimumRequired,
        });
        return [];
      }
    }

    const selectedOptions = officialItem.optionsGroups.flatMap(
      (group) => selectedOptionsByGroup.get(group.id) || [],
    );
    const currentPrice = Number(officialItem.price);

    if (Number(line.unitPrice) !== currentPrice) {
      addChange(`item_price_changed:${line.menuItemId}`, {
        type: "item_price_changed",
        itemId: line.menuItemId,
        itemName,
        previousPrice: Number(line.unitPrice),
        currentPrice,
      });
    }

    if (line.name !== officialItem.name) {
      addChange(`item_details_changed:${line.menuItemId}`, {
        type: "item_details_changed",
        itemId: line.menuItemId,
        itemName,
      });
    }

    return [{
      ...line,
      name: officialItem.name,
      unitPrice: currentPrice,
      selectedOptions,
    }];
  });

  return { lines: reconciledLines, changes };
};

export const describeCartReconciliation = (changes: CartReconciliationChange[]) => {
  const descriptions = changes.map((change) => {
    switch (change.type) {
      case "item_unavailable":
        return `o item ${change.itemName} não está mais disponível e foi removido`;
      case "additional_unavailable":
        return `o adicional ${change.choiceName} de ${change.itemName} não está mais disponível e foi removido`;
      case "item_price_changed":
        return `o preço de ${change.itemName} mudou de ${formatCurrency(change.previousPrice)} para ${formatCurrency(change.currentPrice)}`;
      case "item_details_changed":
        return `os dados de ${change.itemName} foram atualizados`;
      case "additional_details_changed":
        return `os dados do adicional ${change.choiceName} de ${change.itemName} foram atualizados`;
      case "duplicate_option_removed":
        return `uma seleção duplicada de ${change.choiceName} em ${change.itemName} foi removida`;
      case "options_limit_changed":
        return `${change.itemName} agora permite até ${change.maxSelected} opções em ${change.groupName}; as excedentes foram removidas`;
      case "required_options_missing":
        return `${change.itemName} precisa de ${change.minSelected} opções em ${change.groupName} e foi removido para ser personalizado novamente`;
    }
  });
  const uniqueDescriptions = [...new Set(descriptions)];
  const visibleDescriptions = uniqueDescriptions.slice(0, 3);
  const remainingChanges = uniqueDescriptions.length - visibleDescriptions.length;
  const changesMessage = visibleDescriptions.join("; ");
  const remainingMessage = remainingChanges > 0
    ? `; e mais ${remainingChanges} ${remainingChanges === 1 ? "alteração" : "alterações"}`
    : "";

  return `O cardápio foi atualizado: ${changesMessage}${remainingMessage}. Confira o carrinho antes de confirmar o pedido.`;
};

export const buildTrustedOrderItems = (lines: CartLine[], menuItems: MenuItem[]): OrderItem[] =>
  lines.map((line) => {
    const officialItem = menuItems.find((item) => item.id === line.menuItemId);

    if (!officialItem) {
      throw new Error(`Item ${line.menuItemId} não encontrado no cardápio oficial.`);
    }

    const officialOptions = line.selectedOptions.map((selectedOption) => {
      const officialGroup = officialItem.optionsGroups.find((group) => group.id === selectedOption.groupId);

      if (!officialGroup) {
        throw new Error(`Grupo ${selectedOption.groupId} inválido para ${officialItem.name}.`);
      }

      const officialChoice = officialGroup.choices.find((choice) => choice.id === selectedOption.choiceId);

      if (!officialChoice) {
        throw new Error(`Adicional ${selectedOption.choiceId} inválido para ${officialItem.name}.`);
      }

      return {
        groupId: selectedOption.groupId,
        groupName: officialGroup.name,
        choiceId: officialChoice.id,
        choiceName: officialChoice.name,
        price: officialChoice.price,
      };
    });

    const unitTotal =
      officialItem.price + officialOptions.reduce((total, option) => total + option.price, 0);

    return {
      menuItemId: officialItem.id,
      name: officialItem.name,
      unitPrice: officialItem.price,
      quantity: line.quantity,
      observation: line.observation,
      selectedOptions: officialOptions,
      lineTotal: unitTotal * line.quantity,
    };
  });
