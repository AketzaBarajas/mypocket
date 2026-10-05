/** Duraciones (en segundos) y curva del sistema de movimiento. */
export const DURATION = {
  micro: 0.12,
  base: 0.22,
  bento: 0.42,
  chart: 0.6,
  number: 0.9,
} as const;

/** Escalonado de la entrada del bento, en segundos. */
export const STAGGER = 0.04;

/** cubic-bezier(.22, 1, .36, 1) */
export const EASE = [0.22, 1, 0.36, 1] as const;

/** Vibración corta de confirmación. Solo existe en Android. */
export const haptic = (): void => {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    navigator.vibrate(10);
  }
};
