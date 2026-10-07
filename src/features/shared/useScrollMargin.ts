import { useLayoutEffect, useState, type RefObject } from "react";

/** Mide la distancia de un elemento al inicio del documento, para el virtualizador. */
export const useScrollMargin = (ref: RefObject<HTMLElement | null>): number => {
  const [margin, setMargin] = useState(0);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => setMargin(element.getBoundingClientRect().top + window.scrollY);
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [ref]);
  return margin;
};
