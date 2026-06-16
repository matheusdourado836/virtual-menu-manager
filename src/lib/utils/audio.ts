export const UI_SOUNDS = {
  orderComplete: "/sounds/order-complete.mp3",
  newOrder: "/sounds/new-order.mp3",
} as const;

export const playUiSound = (source: string) => {
  if (typeof window === "undefined") {
    return;
  }

  const audio = new Audio(source);
  audio.volume = 0.82;
  void audio.play().catch(() => {
    // Browsers may block playback until the current tab has user interaction.
  });
};
