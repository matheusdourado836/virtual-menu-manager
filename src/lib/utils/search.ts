/**
 * Normaliza texto para busca: remove acentos/diacríticos, passa tudo para
 * minúsculas e remove qualquer caractere que não seja letra ou número
 * (símbolos, hífen, espaços). Assim "Hamburguer", "hambúrguer", "HAMBÚRGUER!"
 * e "xsalada"/"x-salada"/"x salada" batem no mesmo item.
 * Deve ser aplicado tanto na busca digitada quanto no texto comparado.
 */
export const normalizeSearchText = (value: string): string =>
  value
    .normalize("NFD")
    .replace(/\p{Mn}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/gu, "");
