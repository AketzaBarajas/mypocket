import { TriangleAlert } from "lucide-react";
import { useMemo } from "react";

import { useAccounts, useLedger } from "@/data";
import { ACCOUNT_TYPE_LABELS } from "@/domain/catalog";
import { formatShortDate } from "@/domain/dates";
import { buildAccountDrafts, buildRows } from "@/domain/importing/pipeline";
import { IMPORT_FIELD_LABELS, type ProfilePreset } from "@/domain/importing/profiles";
import {
  DATE_FORMAT_LABELS,
  mappableFields,
  type Mapping,
  mappingIssues,
  remapColumn,
  SIGN_MODE_LABELS,
} from "@/domain/importing/session";
import { DATE_FORMATS, type ImportField, SIGN_MODES, TRANSACTION_TYPES } from "@/domain/types";
import { TYPE_LABELS } from "@/features/transactions/view";
import { Badge, Button, Card, Field, Money, Notice, RowAmount, Select } from "@/ui";

import type { ImportSource } from "./types";

/** Radix Select no admite el valor vacío: «sin asignar» necesita uno propio. */
const NONE = "__none__";
const SAMPLE_SIZE = 5;

/** En el CSV de cuentas los mismos campos significan otra cosa. */
const ACCOUNT_FIELD_LABELS: Partial<Record<ImportField, string>> = {
  concept: "Nombre",
  amount: "Saldo inicial",
  type: "Tipo de cuenta",
  date: "Fecha de apertura",
};

const DECIMAL_OPTIONS = [
  { value: ",", label: "Coma · 1.234,56" },
  { value: ".", label: "Punto · 1,234.56" },
] as const;

export interface MappingStepProps {
  readonly source: ImportSource;
  readonly preset: ProfilePreset;
  readonly mapping: Mapping;
  readonly onChange: (mapping: Mapping) => void;
  readonly onBack: () => void;
  readonly onContinue: () => void;
}

/** Paso 2: qué columna del archivo alimenta cada campo y cómo se leen fechas e importes. */
export const MappingStep = ({
  source,
  preset,
  mapping,
  onChange,
  onBack,
  onContinue,
}: MappingStepProps) => {
  const ledger = useLedger();
  const accounts = useAccounts();
  const { table } = source;
  const forAccounts = preset.kind === "accounts";
  const fields = mappableFields(preset.kind, mapping.signMode);
  const issues = mappingIssues(mapping, preset.kind);
  const label = (field: ImportField): string =>
    (forAccounts ? ACCOUNT_FIELD_LABELS[field] : undefined) ?? IMPORT_FIELD_LABELS[field];

  const columnOptions = [
    { value: NONE, label: "Sin asignar" },
    ...table.headers.map((header) => ({ value: header, label: header })),
  ];
  const fieldOfColumn = new Map(
    fields.flatMap((field): Array<[string, ImportField]> => {
      const column = mapping.columnMap[field];
      return column === undefined ? [] : [[column, field]];
    }),
  );

  const sampleRecords = useMemo(() => table.records.slice(0, SAMPLE_SIZE), [table.records]);
  const sampleRows = useMemo(
    () =>
      forAccounts
        ? []
        : buildRows(sampleRecords, mapping, {
            accounts: ledger.accounts,
            index: ledger.index,
            rules: ledger.rules,
          }),
    [forAccounts, sampleRecords, mapping, ledger.accounts, ledger.index, ledger.rules],
  );
  const sampleAccounts = useMemo(
    () => (forAccounts ? buildAccountDrafts(sampleRecords, mapping, ledger.accounts) : []),
    [forAccounts, sampleRecords, mapping, ledger.accounts],
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card className="flex flex-col gap-4">
          <div>
            <h2 className="text-title text-fg">Columnas</h2>
            <p className="mt-1 text-body text-fg-2">
              Hemos reconocido las que hemos podido. Corrige las que no cuadren.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {fields.map((field) => (
              <Field key={field} label={label(field)}>
                {(aria) => (
                  <Select
                    value={mapping.columnMap[field] ?? NONE}
                    onValueChange={(column) =>
                      onChange(remapColumn(mapping, table, field, column === NONE ? null : column))
                    }
                    options={columnOptions}
                    {...aria}
                  />
                )}
              </Field>
            ))}
          </div>
        </Card>

        <Card className="flex flex-col gap-3">
          <h2 className="text-title text-fg">Cómo se lee</h2>
          {!forAccounts && (
            <>
              <Field label="Signo del importe">
                {(aria) => (
                  <Select
                    value={mapping.signMode}
                    onValueChange={(signMode) => onChange({ ...mapping, signMode })}
                    options={SIGN_MODES.map((value) => ({
                      value,
                      label: SIGN_MODE_LABELS[value],
                    }))}
                    {...aria}
                  />
                )}
              </Field>
              {mapping.signMode === "byType" && (
                <Field
                  label="Tipo si el archivo no lo dice"
                  hint="Se aplica a las filas sin columna de tipo o con el tipo vacío."
                >
                  {(aria) => (
                    <Select
                      value={mapping.defaultType}
                      onValueChange={(defaultType) => onChange({ ...mapping, defaultType })}
                      options={TRANSACTION_TYPES.map((value) => ({
                        value,
                        label: TYPE_LABELS[value],
                      }))}
                      {...aria}
                    />
                  )}
                </Field>
              )}
              <Field
                label="Cuenta por defecto"
                hint={
                  mapping.columnMap.account === undefined
                    ? "Todos los movimientos van a esta cuenta."
                    : "Para las filas que no indican cuenta."
                }
              >
                {(aria) => (
                  <Select
                    value={mapping.defaultAccountId ?? NONE}
                    onValueChange={(id) =>
                      onChange({ ...mapping, defaultAccountId: id === NONE ? null : id })
                    }
                    options={[
                      { value: NONE, label: "Ninguna" },
                      ...accounts.map((account) => ({
                        value: account.id,
                        label: account.name,
                        emoji: account.emoji,
                      })),
                    ]}
                    {...aria}
                  />
                )}
              </Field>
            </>
          )}
          <Field label="Formato de fecha">
            {(aria) => (
              <Select
                value={mapping.dateFormat}
                onValueChange={(dateFormat) => onChange({ ...mapping, dateFormat })}
                options={DATE_FORMATS.map((value) => ({
                  value,
                  label: DATE_FORMAT_LABELS[value],
                }))}
                {...aria}
              />
            )}
          </Field>
          {mapping.dateAmbiguous && mapping.dateFormat === "auto" && (
            <Notice
              tone="warning"
              icon={<TriangleAlert size={16} strokeWidth={1.75} />}
              className="items-start text-caption"
            >
              Estas fechas se pueden leer como día/mes o como mes/día. Si no eliges un formato, se
              leen como día/mes.
            </Notice>
          )}
          <Field label="Separador decimal">
            {(aria) => (
              <Select
                value={mapping.decimalSeparator}
                onValueChange={(decimalSeparator) => onChange({ ...mapping, decimalSeparator })}
                options={DECIMAL_OPTIONS}
                {...aria}
              />
            )}
          </Field>
        </Card>
      </div>

      <Card padding="none" className="overflow-hidden">
        <div className="px-4 pt-4 pb-3">
          <h2 className="text-title text-fg">Primeras filas del archivo</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-max border-collapse text-left">
            <thead>
              <tr className="border-y border-border">
                {table.headers.map((header) => {
                  const field = fieldOfColumn.get(header);
                  return (
                    <th key={header} scope="col" className="px-4 py-2 align-top font-medium">
                      <span className="block max-w-56 truncate text-caption text-fg-2">
                        {header}
                      </span>
                      <span className="mt-1 flex h-5 items-center">
                        {field === undefined ? (
                          <span className="text-micro text-fg-3">No se usa</span>
                        ) : (
                          <Badge tone="accent">{label(field)}</Badge>
                        )}
                      </span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {sampleRecords.map((record, rowIndex) => (
                <tr key={rowIndex} className="border-b border-border last:border-b-0">
                  {table.headers.map((header) => (
                    <td key={header} className="px-4 py-2 text-caption text-fg">
                      <span className="block max-w-56 truncate">{record[header] ?? ""}</span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card padding="none" className="overflow-hidden">
        <div className="px-4 pt-4 pb-3">
          <h2 className="text-title text-fg">Así se van a leer</h2>
        </div>
        <ul className="divide-y divide-border border-t border-border">
          {sampleRows.map((row) => (
            <li key={row.index} className="flex min-h-11 items-center gap-3 px-4 py-2">
              <span className="w-24 shrink-0 num text-caption text-fg-2">
                {row.date === null ? "—" : formatShortDate(row.date)}
              </span>
              <span className="min-w-0 flex-1 truncate text-body text-fg">
                {row.concept === "" ? "Sin concepto" : row.concept}
              </span>
              {row.error !== null && <Badge tone="danger">{row.error}</Badge>}
              {row.amount === null ? (
                <span className="num text-body text-fg-3">—</span>
              ) : (
                <RowAmount amount={row.amount} kind={row.type} />
              )}
            </li>
          ))}
          {sampleAccounts.map((draft) => (
            <li key={draft.name} className="flex min-h-11 items-center gap-3 px-4 py-2">
              <span className="min-w-0 flex-1 truncate text-body text-fg">{draft.name}</span>
              <span className="shrink-0 text-caption text-fg-2">
                {ACCOUNT_TYPE_LABELS[draft.type]}
                {draft.openingDate !== null && ` · ${formatShortDate(draft.openingDate)}`}
              </span>
              {draft.openingBalance === null ? (
                <span className="num text-body text-fg-3">—</span>
              ) : (
                <Money value={draft.openingBalance} className="text-body text-fg" />
              )}
            </li>
          ))}
          {sampleRows.length === 0 && sampleAccounts.length === 0 && (
            <li className="px-4 py-6 text-center text-caption text-fg-2">
              Asigna las columnas para ver el resultado.
            </li>
          )}
        </ul>
      </Card>

      {issues.length > 0 && (
        <Notice tone="warning" icon={<TriangleAlert size={16} strokeWidth={1.75} />}>
          <ul className="flex flex-col gap-0.5">
            {issues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        </Notice>
      )}

      <div className="flex justify-between gap-2">
        <Button variant="ghost" onClick={onBack}>
          Atrás
        </Button>
        <Button variant="primary" disabled={issues.length > 0} onClick={onContinue}>
          Continuar
        </Button>
      </div>
    </div>
  );
};
