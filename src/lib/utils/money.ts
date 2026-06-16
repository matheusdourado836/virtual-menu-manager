export const formatCurrency = (value: number) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);

export const toCents = (value: number) => Math.round(value * 100);

export const fromCents = (value: number) => value / 100;
