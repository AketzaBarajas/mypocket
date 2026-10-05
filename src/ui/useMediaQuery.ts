import { useCallback, useSyncExternalStore } from "react";

/** Suscribe un componente a una media query. */
export const useMediaQuery = (query: string): boolean => {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
};

/** ≥ 640 px: tablet y escritorio. */
export const useIsTabletUp = (): boolean => useMediaQuery("(min-width: 40rem)");
/** ≥ 1024 px: escritorio. */
export const useIsDesktop = (): boolean => useMediaQuery("(min-width: 64rem)");
/** Dispositivo cuyo puntero principal es táctil. */
export const useIsTouch = (): boolean => useMediaQuery("(pointer: coarse)");
