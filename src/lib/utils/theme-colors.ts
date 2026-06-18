interface RgbColor {
  r: number;
  g: number;
  b: number;
}

export interface DerivedStoreThemeColors {
  accentColor: string;
  backgroundColor: string;
  surfaceColor: string;
  textColor: string;
  mutedTextColor: string;
  borderColor: string;
}

const fallbackDarkText = "#171817";
const fallbackLightText = "#fffdf8";

const getColorChannel = (value: number) => Math.max(0, Math.min(255, Math.round(value)));

export const rgbToHex = ({ r, g, b }: RgbColor) =>
  `#${[r, g, b].map((channel) => getColorChannel(channel).toString(16).padStart(2, "0")).join("")}`;

export const hexToRgb = (hex: string): RgbColor | null => {
  const normalized = hex.trim().replace("#", "");

  if (!/^[0-9a-f]{6}$/i.test(normalized)) {
    return null;
  }

  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
  };
};

export const mixHex = (baseHex: string, targetHex: string, targetWeight: number) => {
  const base = hexToRgb(baseHex);
  const target = hexToRgb(targetHex);

  if (!base || !target) {
    return baseHex;
  }

  return rgbToHex({
    r: base.r * (1 - targetWeight) + target.r * targetWeight,
    g: base.g * (1 - targetWeight) + target.g * targetWeight,
    b: base.b * (1 - targetWeight) + target.b * targetWeight,
  });
};

const getLinearChannel = (channel: number) => {
  const normalized = channel / 255;

  return normalized <= 0.03928
    ? normalized / 12.92
    : Math.pow((normalized + 0.055) / 1.055, 2.4);
};

const getRelativeLuminance = (hex: string) => {
  const color = hexToRgb(hex);

  if (!color) {
    return 1;
  }

  return (
    0.2126 * getLinearChannel(color.r) +
    0.7152 * getLinearChannel(color.g) +
    0.0722 * getLinearChannel(color.b)
  );
};

const getContrastRatio = (firstHex: string, secondHex: string) => {
  const firstLuminance = getRelativeLuminance(firstHex);
  const secondLuminance = getRelativeLuminance(secondHex);
  const lighter = Math.max(firstLuminance, secondLuminance);
  const darker = Math.min(firstLuminance, secondLuminance);

  return (lighter + 0.05) / (darker + 0.05);
};

export const getReadableTextColor = (backgroundHex: string) => {
  const lightContrast = getContrastRatio(backgroundHex, fallbackLightText);
  const darkContrast = getContrastRatio(backgroundHex, fallbackDarkText);

  return darkContrast >= lightContrast ? fallbackDarkText : fallbackLightText;
};

export const getReadableBrandColor = (brandHex: string, surfaceHex: string) => {
  const targetTextColor = getReadableTextColor(surfaceHex);

  if (getContrastRatio(brandHex, surfaceHex) >= 4.5) {
    return brandHex;
  }

  const candidates = [0.22, 0.36, 0.5, 0.64, 0.78, 0.9, 1].map((weight) =>
    mixHex(brandHex, targetTextColor, weight),
  );

  return candidates.find((candidate) => getContrastRatio(candidate, surfaceHex) >= 4.5) || targetTextColor;
};

export const deriveStoreThemeColors = (
  primaryColor: string,
  secondaryColor: string,
): DerivedStoreThemeColors => {
  const safePrimary = hexToRgb(primaryColor) ? primaryColor : "#181818";
  const safeSecondary = hexToRgb(secondaryColor) ? secondaryColor : "#f5f5f2";
  const backgroundColor = mixHex(safePrimary, "#ffffff", 0.9);
  const textColor = getReadableTextColor(backgroundColor);

  return {
    accentColor: mixHex(safeSecondary, safePrimary, 0.24),
    backgroundColor,
    surfaceColor: mixHex(backgroundColor, "#ffffff", 0.78),
    textColor,
    mutedTextColor: mixHex(textColor, backgroundColor, 0.44),
    borderColor: mixHex(safePrimary, "#ffffff", 0.78),
  };
};
