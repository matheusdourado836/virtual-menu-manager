"use client";

import { useEffect, type RefObject } from "react";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "area[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

const getFocusable = (container: HTMLElement) =>
  Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) => element.getClientRects().length > 0,
  );

/**
 * Traps Tab/Shift+Tab focus inside the dialog panel, moves focus onto the panel
 * when it opens (so screen readers announce it via aria-labelledby), and restores
 * focus to the previously focused element when it closes. Existing Escape/backdrop
 * handling in each dialog is left untouched.
 */
export function useFocusTrap<T extends HTMLElement>(panelRef: RefObject<T | null>) {
  useEffect(() => {
    const panel = panelRef.current;

    if (!panel) {
      return undefined;
    }

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const hadTabIndex = panel.hasAttribute("tabindex");

    if (!hadTabIndex) {
      panel.setAttribute("tabindex", "-1");
    }

    const focusFrame = window.requestAnimationFrame(() => panel.focus());

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab") {
        return;
      }

      const focusable = getFocusable(panel);

      if (!focusable.length) {
        event.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (event.shiftKey) {
        if (active === first || active === panel || !panel.contains(active)) {
          event.preventDefault();
          last.focus();
        }
      } else if (active === last || !panel.contains(active)) {
        event.preventDefault();
        first.focus();
      }
    };

    panel.addEventListener("keydown", handleKeyDown);

    return () => {
      window.cancelAnimationFrame(focusFrame);
      panel.removeEventListener("keydown", handleKeyDown);

      if (!hadTabIndex) {
        panel.removeAttribute("tabindex");
      }

      previouslyFocused?.focus?.();
    };
  }, [panelRef]);
}
