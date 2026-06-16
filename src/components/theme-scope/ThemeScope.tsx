"use client";

import type { CSSProperties, ReactNode } from "react";
import type { StoreTheme } from "@/types/menu";
import "./theme-scope.scss";

interface ThemeScopeProps {
  theme: StoreTheme;
  children: ReactNode;
}

type ThemeStyle = CSSProperties & Record<`--${string}`, string>;

export function ThemeScope({ theme, children }: ThemeScopeProps) {
  const style: ThemeStyle = {
    "--color-primary": theme.primaryColor,
    "--color-secondary": theme.secondaryColor,
    "--color-accent": theme.accentColor,
    "--color-background": theme.backgroundColor,
    "--color-surface": theme.surfaceColor,
    "--color-surface-strong": theme.surfaceColor,
    "--color-text": theme.textColor,
    "--color-text-muted": theme.mutedTextColor,
    "--color-border": theme.borderColor,
    "--radius-md": `${theme.borderRadius}px`,
    "--radius-sm": `${Math.max(4, theme.borderRadius - 2)}px`,
    "--radius-lg": `${theme.borderRadius + 6}px`,
    "--font-sans": theme.fontFamily,
  };

  return (
    <div className="theme-scope" style={style}>
      <div className="theme-scope__content">{children}</div>
    </div>
  );
}
