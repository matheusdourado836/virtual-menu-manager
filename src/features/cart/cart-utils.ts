import type { CartLine, CartSelectedOption, MenuItem, OrderItem } from "@/types/menu";

const cartStoragePrefix = "virtual-menu-manager:cart";

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
  return raw ? (JSON.parse(raw) as CartLine[]) : [];
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

export const buildTrustedOrderItems = (lines: CartLine[], menuItems: MenuItem[]): OrderItem[] =>
  lines.map((line) => {
    const officialItem = menuItems.find((item) => item.id === line.menuItemId);

    if (!officialItem) {
      throw new Error(`Item ${line.menuItemId} não encontrado no cardápio oficial.`);
    }

    const officialOptions = line.selectedOptions.map((selectedOption) => {
      const officialChoice = officialItem.optionsGroups
        .find((group) => group.id === selectedOption.groupId)
        ?.choices.find((choice) => choice.id === selectedOption.choiceId);

      if (!officialChoice) {
        throw new Error(`Adicional ${selectedOption.choiceId} inválido para ${officialItem.name}.`);
      }

      return {
        groupId: selectedOption.groupId,
        groupName:
          officialItem.optionsGroups.find((group) => group.id === selectedOption.groupId)?.name ||
          selectedOption.groupName,
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
