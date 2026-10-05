import { z } from "zod";

import { isIsoDate } from "@/domain/dates";
import { parseSearchQuery, type TransactionFilter } from "@/domain/transactions";
import { type IsoDate, TRANSACTION_TYPES } from "@/domain/types";

const isoDate = z.custom<IsoDate>((value) => typeof value === "string" && isIsoDate(value));
const ids = z.array(z.string().min(1));

/** Parámetros de búsqueda tipados de /movimientos. Lo que no valida se descarta. */
export const transactionsSearchSchema = z.object({
  q: z.string().optional().catch(undefined),
  estado: z.enum(["pendientes"]).optional().catch(undefined),
  cuentas: ids.optional().catch(undefined),
  tipos: z.array(z.enum(TRANSACTION_TYPES)).optional().catch(undefined),
  categorias: ids.optional().catch(undefined),
  etiquetas: ids.optional().catch(undefined),
  desde: isoDate.optional().catch(undefined),
  hasta: isoDate.optional().catch(undefined),
});

export type TransactionsSearch = z.infer<typeof transactionsSearchSchema>;

/** Convierte los parámetros de la URL en un filtro de dominio. */
export const toFilter = (search: TransactionsSearch): TransactionFilter => ({
  query: search.q === undefined || search.q.trim() === "" ? undefined : parseSearchQuery(search.q),
  status: search.estado === "pendientes" ? "pending" : "all",
  accountIds: search.cuentas,
  types: search.tipos,
  categoryIds: search.categorias,
  tagIds: search.etiquetas,
  from: search.desde ?? null,
  to: search.hasta ?? null,
});

/** Número de filtros avanzados activos (los de la hoja «Filtros»). */
export const advancedFilterCount = (search: TransactionsSearch): number =>
  [
    search.desde !== undefined || search.hasta !== undefined,
    (search.tipos?.length ?? 0) > 0,
    (search.categorias?.length ?? 0) > 0,
    (search.etiquetas?.length ?? 0) > 0,
    (search.cuentas?.length ?? 0) > 1,
  ].filter(Boolean).length;

export const hasAnyFilter = (search: TransactionsSearch): boolean =>
  (search.q ?? "").trim() !== "" ||
  search.estado !== undefined ||
  (search.cuentas?.length ?? 0) > 0 ||
  advancedFilterCount(search) > 0;
