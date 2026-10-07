import { sqliteFalse, sqliteTrue } from "@evolu/common";
import { z } from "zod";

import { Schema, TABLE_NAMES, type TableName } from "./schema";

/**
 * Instantánea de todas las tablas de negocio, para las copias de seguridad.
 * Incluye los borrados lógicos: restaurar una copia no resucita lo borrado.
 *
 * Este módulo es puro (solo depende del schema); leer y escribir la base de
 * datos está en `snapshotDb.ts`.
 */

export type SnapshotRow = Readonly<Record<string, unknown>>;

export interface Snapshot {
  readonly schemaVersion: number;
  /** Marca ISO 8601 del momento de la exportación. */
  readonly exportedAt: string;
  readonly tables: Readonly<Partial<Record<TableName, ReadonlyArray<SnapshotRow>>>>;
}

const snapshotSchema = z.object({
  schemaVersion: z.number().int().positive(),
  exportedAt: z.string(),
  tables: z.record(z.string(), z.array(z.record(z.string(), z.unknown()))),
});

/** Valida la forma de una instantánea leída de un archivo. `null` si no lo es. */
export const parseSnapshot = (value: unknown): Snapshot | null => {
  const parsed = snapshotSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
};

/** Validador de una columna: los tipos del schema de Evolu, vistos sin su tipo estático. */
interface ColumnType {
  readonly fromUnknown: (value: unknown) => { readonly ok: boolean; readonly value?: unknown };
}

// El schema es un mapa de tipos de Evolu; aquí solo interesa su validación en ejecución.
export const columnsOf = (table: TableName): ReadonlyArray<readonly [string, ColumnType]> =>
  Object.entries(Schema[table] as Readonly<Record<string, ColumnType>>);

export interface RestoreResult {
  readonly restored: number;
  /** Filas que no pasaron la validación del schema y se dejaron fuera. */
  readonly skipped: number;
}

/**
 * Valida una fila de una copia contra el schema. Devuelve los valores listos
 * para escribir, o `null` si algún dato no es válido.
 */
export const validateSnapshotRow = (
  table: TableName,
  row: SnapshotRow,
): Readonly<Record<string, unknown>> | null => {
  const values: Record<string, unknown> = {};
  for (const [column, type] of columnsOf(table)) {
    const raw = row[column] ?? null;
    const parsed = type.fromUnknown(raw);
    if (parsed.ok) values[column] = parsed.value;
    // Un nulo en una columna obligatoria se omite (fila incompleta de origen);
    // cualquier otro valor inválido descarta la fila.
    else if (raw !== null) return null;
  }
  if (values.id === undefined) return null;
  values.isDeleted = row.isDeleted === 1 ? sqliteTrue : sqliteFalse;
  return values;
};

/** Número de filas de una instantánea, para mostrarlo antes de restaurar. */
export const snapshotRowCount = (snapshot: Snapshot, table?: TableName): number => {
  const names: ReadonlyArray<TableName> = table === undefined ? TABLE_NAMES : [table];
  let total = 0;
  for (const name of names) total += snapshot.tables[name]?.length ?? 0;
  return total;
};
