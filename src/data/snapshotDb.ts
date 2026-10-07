import { sqliteTrue } from "@evolu/common";

import { createQuery, type Db } from "./evolu";
import { SCHEMA_VERSION, TABLE_NAMES, type TableName } from "./schema";
import {
  columnsOf,
  type RestoreResult,
  type Snapshot,
  type SnapshotRow,
  validateSnapshotRow,
} from "./snapshot";

/** Lee todas las filas de todas las tablas, borradas incluidas. */
export const exportSnapshot = async (db: Db, exportedAt: string): Promise<Snapshot> => {
  const tables: Partial<Record<TableName, SnapshotRow[]>> = {};
  for (const table of TABLE_NAMES) {
    const rows = await db.loadQuery(createQuery((query) => query.selectFrom(table).selectAll()));
    const columns = columnsOf(table).map(([column]) => column);
    tables[table] = rows.map((row) => {
      // Solo las columnas del schema: las marcas de tiempo las vuelve a generar Evolu.
      const source = row as Readonly<Record<string, unknown>>;
      const copy: Record<string, unknown> = {
        isDeleted: source.isDeleted === sqliteTrue ? 1 : 0,
      };
      for (const column of columns) copy[column] = source[column] ?? null;
      return copy;
    });
  }
  return { schemaVersion: SCHEMA_VERSION, exportedAt, tables };
};

/**
 * Escribe una instantánea en la base de datos. Cada fila conserva su id, así
 * que restaurar dos veces no duplica nada: las filas de la copia sustituyen a
 * las actuales con el mismo id y lo creado después de la copia se conserva.
 */
export const restoreSnapshot = (db: Db, snapshot: Snapshot): RestoreResult => {
  let restored = 0;
  let skipped = 0;
  for (const table of TABLE_NAMES) {
    for (const row of snapshot.tables[table] ?? []) {
      const values = validateSnapshotRow(table, row);
      if (values === null) {
        skipped += 1;
        continue;
      }
      // Los valores ya están validados con los tipos del schema, columna a columna.
      db.upsert(table, values as never);
      restored += 1;
    }
  }
  return { restored, skipped };
};
