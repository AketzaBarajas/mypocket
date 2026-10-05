import { z } from "zod";

import type { SettingRow } from "./queries";

/** Minutos en segundo plano antes de bloquear. */
export const AUTO_LOCK_OPTIONS = [1, 5, 15] as const;
export type AutoLockMinutes = (typeof AUTO_LOCK_OPTIONS)[number];

const nullableId = z.string().min(1).nullable();

/** Esquema de cada ajuste. Lo que no valida se sustituye por su valor por defecto. */
const settingSchemas = {
  profileName: z.string().trim().min(1).max(40),
  profileInitials: z.string().trim().min(1).max(3),
  defaultAccountId: nullableId,
  lastAccountId: nullableId,
  lastExpenseCategoryId: nullableId,
  lastIncomeCategoryId: nullableId,
  theme: z.enum(["system", "light", "dark"]),
  autoLockMinutes: z.union([z.literal(1), z.literal(5), z.literal(15)]),
} as const;

export type SettingKey = keyof typeof settingSchemas;
export type Settings = { readonly [K in SettingKey]: z.infer<(typeof settingSchemas)[K]> };

export const DEFAULT_SETTINGS: Settings = {
  profileName: "Ake",
  profileInitials: "AK",
  defaultAccountId: null,
  lastAccountId: null,
  lastExpenseCategoryId: null,
  lastIncomeCategoryId: null,
  theme: "system",
  autoLockMinutes: 5,
};

export const SETTING_KEYS = Object.keys(settingSchemas) as ReadonlyArray<SettingKey>;

const isSettingKey = (key: string): key is SettingKey => key in settingSchemas;

/** Valida el valor de un ajuste antes de guardarlo. Lanza si no es válido. */
export const encodeSetting = <K extends SettingKey>(key: K, value: Settings[K]): string =>
  JSON.stringify(settingSchemas[key].parse(value));

/** Construye los ajustes a partir de las filas, con valores por defecto. */
export const toSettings = (rows: ReadonlyArray<SettingRow>): Settings => {
  const settings: Settings = { ...DEFAULT_SETTINGS };
  const assign = (key: SettingKey, raw: unknown) => {
    const parsed = settingSchemas[key].safeParse(raw);
    if (parsed.success) Object.assign(settings, { [key]: parsed.data });
  };

  // Si dos dispositivos crearon la misma clave, gana la editada más tarde.
  const ordered = [...rows].sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
  for (const row of ordered) {
    if (row.key === null || row.value === null || !isSettingKey(row.key)) continue;
    try {
      assign(row.key, JSON.parse(row.value));
    } catch {
      // Valor corrupto: se conserva el valor por defecto.
    }
  }
  return settings;
};
