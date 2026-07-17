import type { StoreTheme } from "@/types/menu";

export const fallbackAdminTheme: StoreTheme = {
  id: "fallback",
  storeId: "fallback",
  primaryColor: "#181818",
  secondaryColor: "#f5f5f2",
  accentColor: "#2f8f6f",
  backgroundColor: "#f7f5f0",
  surfaceColor: "#fffdf8",
  textColor: "#211f1d",
  mutedTextColor: "#6f6962",
  borderColor: "#e8e1d7",
  fontFamily: "var(--font-geist-sans)",
  borderRadius: 14,
  visualStyle: "neutral-admin",
  updatedAt: new Date(0).toISOString(),
};
