export const onlyDigits = (value: string, maxLength?: number) => {
  const digits = value.replace(/\D/g, "");

  return typeof maxLength === "number" ? digits.slice(0, maxLength) : digits;
};

export const formatPhoneInput = (value: string) => {
  const digits = onlyDigits(value, 11);

  if (digits.length <= 2) {
    return digits;
  }

  if (digits.length <= 6) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  }

  if (digits.length <= 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }

  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
};

export const isValidBrazilianPhone = (value: string) => {
  const digits = onlyDigits(value);

  return digits.length === 10 || digits.length === 11;
};

export const sanitizePriceDigits = (value: string) =>
  onlyDigits(value, 9).replace(/^0+(?=\d)/, "");

export const formatPriceInput = (digits: string) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(digits || "0") / 100);

export const getPriceDigits = (price?: number) =>
  typeof price === "number" ? String(Math.max(0, Math.round(price * 100))) : "";

export const parsePrice = (digits: string) => Number(digits || "0") / 100;
