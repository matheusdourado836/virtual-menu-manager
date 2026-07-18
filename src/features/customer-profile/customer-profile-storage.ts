// Perfil do cliente salvo no próprio dispositivo (localStorage), independente de
// loja: se o cliente optar por salvar, os dados aparecem já preenchidos ao
// finalizar um pedido em QUALQUER loja. Guardamos só o que o checkout coleta
// (nome e telefone) — nada de forma de pagamento (escolha da loja) nem mesa.
export interface CustomerProfile {
  name: string;
  phone: string;
}

const customerProfileStorageKey = "virtual-menu-manager:customer-profile";

export const readCustomerProfile = (): CustomerProfile | null => {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(customerProfileStorageKey);

    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<CustomerProfile>;

    return {
      name: typeof parsed.name === "string" ? parsed.name : "",
      phone: typeof parsed.phone === "string" ? parsed.phone : "",
    };
  } catch {
    return null;
  }
};

export const writeCustomerProfile = (profile: CustomerProfile) => {
  if (typeof window === "undefined") {
    return;
  }

  const name = profile.name.trim();
  const phone = profile.phone.trim();

  // Sem nada útil para lembrar: não deixa um registro vazio para trás.
  if (!name && !phone) {
    window.localStorage.removeItem(customerProfileStorageKey);
    return;
  }

  window.localStorage.setItem(customerProfileStorageKey, JSON.stringify({ name, phone }));
};

export const clearCustomerProfile = () => {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(customerProfileStorageKey);
};
