// Escapa um valor para uma célula CSV com proteção contra injeção de fórmula
// em planilhas (Excel/Sheets): valores iniciados por = + - @ (ou tab/quebra)
// recebem um apóstrofo antes de serem citados, para não virarem fórmula ativa.
const formulaTrigger = /^[=+\-@\t\r]/u;

export const escapeCsvCell = (value: string | number | null | undefined): string => {
  const raw = value === null || value === undefined ? "" : String(value);
  const guarded = formulaTrigger.test(raw) ? `'${raw}` : raw;

  return `"${guarded.replace(/"/gu, '""')}"`;
};

export const toCsv = (
  rows: Array<Array<string | number | null | undefined>>,
  separator = ";",
): string => rows.map((row) => row.map(escapeCsvCell).join(separator)).join("\n");
