import type { CsvTable, DecodedText } from "@/domain/importing/csv";
import type { AccountDraft, resolveName } from "@/domain/importing/pipeline";

/** Archivo ya leído y convertido en tabla. */
export interface ImportSource {
  readonly fileName: string;
  readonly table: CsvTable & DecodedText;
}

/** Cuenta del CSV de Notion, con su casilla de inclusión. */
export interface AccountDraftRow extends AccountDraft {
  readonly include: boolean;
}

/** Nombre del archivo que se asigna a una cuenta o categoría de MyPocket. */
export type ResolveTarget = Parameters<typeof resolveName>[1];

export type ImportResult =
  | {
      readonly kind: "transactions";
      readonly batchId: string;
      readonly count: number;
      readonly fileName: string;
    }
  | { readonly kind: "accounts"; readonly created: number; readonly updated: number };
