import { clsx, type ClassValue } from "clsx";

/** Une clases condicionales. */
export const cn = (...inputs: ClassValue[]): string => clsx(inputs);
