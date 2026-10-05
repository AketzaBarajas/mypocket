import {
  AppName,
  createAppOwner,
  createEvolu,
  createQueryBuilder,
  type Evolu,
  type OwnerSecret,
} from "@evolu/common";
import { createEvoluBinding } from "@evolu/react";
import { createEvoluDeps } from "@evolu/react-web";
import { createRun } from "@evolu/web";

import { Schema } from "./schema";

/** Instancia de Evolu tipada con el schema de MyPocket. */
export type Db = Evolu<typeof Schema>;

/** Relay gratuito oficial de Evolu (valor por defecto de `transports`). */
export const DEFAULT_RELAY_URL = "wss://free.evoluhq.com";

/**
 * Dependencias de plataforma compartidas por todas las instancias. Se crean
 * de forma diferida: arrancan el SharedWorker de Evolu, y eso no debe ocurrir
 * hasta que haya que abrir la base de datos.
 */
let sharedRun: ReturnType<typeof createSharedRun> | null = null;
const createSharedRun = () => createRun(createEvoluDeps());
const getRun = () => (sharedRun ??= createSharedRun());

export interface OpenDbOptions {
  readonly ownerSecret: OwnerSecret;
  /** URL `wss://` del relay. `null` desactiva la sincronización. */
  readonly relayUrl: string | null;
  /** Nombre de la base local. Cambia solo para el perfil demo aislado. */
  readonly appName?: string;
}

/**
 * Abre la base de datos local. El `AppOwner` deriva del secreto y es quien
 * controla el acceso al SQLite cifrado: sin él, los datos son ilegibles.
 */
export const openDb = (options: OpenDbOptions): Promise<Db> =>
  getRun().ok(
    createEvolu(Schema, {
      appName: AppName.orThrow(options.appName ?? "mypocket"),
      appOwner: createAppOwner(options.ownerSecret),
      transports: options.relayUrl === null ? [] : [{ type: "WebSocket", url: options.relayUrl }],
      indexes: (create) => [
        create("transactionDate").on("transaction").column("date"),
        create("transactionAccount").on("transaction").column("accountId"),
        create("transactionRecurrence").on("transaction").column("recurrenceId"),
        create("transactionImportHash").on("transaction").column("importHash"),
        create("transactionTagTransaction").on("transactionTag").column("transactionId"),
        create("valuationAccount").on("accountValuation").column("accountId"),
      ],
    }),
  );

/** Cierra la instancia: detiene la sincronización y libera la base de datos. */
export const closeDb = async (db: Db): Promise<void> => {
  await db[Symbol.asyncDispose]();
};

/** Estado de sincronización compartido (lo sirve el SharedWorker). */
export const getSyncStateStore = () => getRun().deps.syncState;
/** Errores de Evolu a nivel de app. */
export const getEvoluErrorStore = () => getRun().deps.evoluError;

export const createQuery = createQueryBuilder(Schema);

export const { EvoluContext, useEvolu, useQueries, useQuery, useOwnerSyncStatus } =
  createEvoluBinding<typeof Schema>();
