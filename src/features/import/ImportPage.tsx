import { Link } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { nextSortOrder, useLedger, useRepo } from "@/data";
import { readCsv } from "@/domain/importing/csv";
import {
  buildAccountDrafts,
  buildRows,
  patchRow,
  type PreviewRow,
  resolveDuplicates,
  resolveName,
  type RowPatch,
  toDrafts,
} from "@/domain/importing/pipeline";
import { presetByKey } from "@/domain/importing/profiles";
import {
  existingImportHashes,
  initialMapping,
  type Mapping,
  needsHashing,
  savedProfileFor,
  suggestPresetKey,
} from "@/domain/importing/session";
import { useToday } from "@/features/shell/useToday";
import { Button, Card, cn, ConfirmDialog, EmptyState, HeroCard, PageHeader, toast } from "@/ui";

import { AccountsPreview } from "./AccountsPreview";
import { ConfirmStep } from "./ConfirmStep";
import { ImportHistory } from "./ImportHistory";
import { MappingStep } from "./MappingStep";
import { PreviewStep } from "./PreviewStep";
import type { AccountDraftRow, ImportResult, ImportSource, ResolveTarget } from "./types";
import { UploadStep } from "./UploadStep";

const STEPS = [
  { key: "upload", label: "Archivo" },
  { key: "mapping", label: "Columnas" },
  { key: "preview", label: "Vista previa" },
  { key: "confirm", label: "Confirmar" },
] as const;
type Step = (typeof STEPS)[number]["key"];

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const READ_ERROR = "No se pudo leer el archivo. Comprueba que es un CSV.";

const plural = (count: number, one: string, many: string): string =>
  `${count} ${count === 1 ? one : many}`;

const StepIndicator = ({ current }: { readonly current: number }) => (
  <ol aria-label="Pasos de la importación" className="flex items-center gap-2">
    {STEPS.map((step, index) => {
      const done = index < current;
      const active = index === current;
      return (
        <li
          key={step.key}
          aria-current={active ? "step" : undefined}
          className={cn("flex min-w-0 items-center gap-2", index < STEPS.length - 1 && "flex-auto")}
        >
          <span
            className={cn(
              "inline-flex size-6 shrink-0 items-center justify-center rounded-full border num text-micro font-semibold transition-colors",
              done && "border-accent bg-accent text-on-accent",
              active && "border-fg text-fg",
              !done && !active && "border-border text-fg-3",
            )}
          >
            {done ? <Check aria-hidden="true" size={12} strokeWidth={2.5} /> : index + 1}
          </span>
          <span
            className={cn(
              "text-caption whitespace-nowrap",
              active ? "text-fg" : "hidden text-fg-2 sm:inline",
              !done && !active && "sm:text-fg-3",
            )}
          >
            {step.label}
          </span>
          {index < STEPS.length - 1 && (
            <span aria-hidden="true" className="h-px min-w-3 flex-1 bg-border" />
          )}
        </li>
      );
    })}
  </ol>
);

export interface ImportPageProps {
  /** Perfil preseleccionado al llegar desde la bienvenida. */
  readonly initialPreset: string | undefined;
}

/** Asistente de importación de CSV en cuatro pasos, con el historial de lotes. */
export const ImportPage = ({ initialPreset }: ImportPageProps) => {
  const ledger = useLedger();
  const repo = useRepo();
  const today = useToday();

  const [step, setStep] = useState<Step>("upload");
  const [presetKey, setPresetKey] = useState(initialPreset ?? "bbva");
  const [presetPicked, setPresetPicked] = useState(initialPreset !== undefined);
  const [source, setSource] = useState<ImportSource | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [mapping, setMapping] = useState<Mapping | null>(null);
  /** Mapeo con el que se construyó la vista previa: si no cambia, no se rehace. */
  const [builtFrom, setBuiltFrom] = useState<Mapping | null>(null);
  const [rows, setRows] = useState<ReadonlyArray<PreviewRow> | null>(null);
  const [accountDrafts, setAccountDrafts] = useState<ReadonlyArray<AccountDraftRow> | null>(null);
  const [hashedWith, setHashedWith] = useState<ReadonlySet<string> | null>(null);
  const [remember, setRemember] = useState(true);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [confirmUndo, setConfirmUndo] = useState(false);

  const preset = presetByKey(presetKey);
  const saved = savedProfileFor(ledger.importProfiles, preset);

  /* ── Duplicados: se recalculan al editar filas y cuando cambian los movimientos ── */

  const existingHashes = useMemo(
    () => existingImportHashes(ledger.transactions),
    [ledger.transactions],
  );
  const hashing = rows !== null && (needsHashing(rows) || hashedWith !== existingHashes);
  useEffect(() => {
    if (rows === null || !hashing) return;
    let cancelled = false;
    void resolveDuplicates(rows, existingHashes).then((resolved) => {
      if (cancelled) return;
      setRows(resolved);
      setHashedWith(existingHashes);
    });
    return () => {
      cancelled = true;
    };
  }, [rows, hashing, existingHashes]);

  /* ── Paso 1 ── */

  const clearWork = () => {
    setMapping(null);
    setBuiltFrom(null);
    setRows(null);
    setAccountDrafts(null);
  };

  const loadFile = async (file: File) => {
    setFileError(null);
    if (file.size > MAX_FILE_BYTES) {
      setFileError("El archivo pesa más de 10 MB. Divídelo en varios e impórtalos por separado.");
      return;
    }
    try {
      const table = readCsv(new Uint8Array(await file.arrayBuffer()));
      if (table.records.length === 0) {
        setFileError("El archivo solo tiene cabeceras. No hay filas que importar.");
        return;
      }
      setSource({ fileName: file.name, table });
      clearWork();
      const suggestion = suggestPresetKey(file.name);
      if (!presetPicked && suggestion !== null) setPresetKey(suggestion);
    } catch {
      setFileError(READ_ERROR);
    }
  };

  const choosePreset = (key: string) => {
    setPresetKey(key);
    setPresetPicked(true);
    clearWork();
  };

  const toMapping = () => {
    if (source === null) return;
    if (mapping === null) {
      const defaultAccount =
        ledger.settings.defaultAccountId ??
        ledger.accounts.find((account) => account.type === "checking" && !account.archived)?.id ??
        null;
      setMapping(initialMapping(source.table, preset, saved, defaultAccount));
    }
    setStep("mapping");
  };

  /* ── Paso 2 → 3 ── */

  const toPreview = () => {
    if (source === null || mapping === null) return;
    if (builtFrom !== mapping) {
      if (preset.kind === "accounts") {
        setAccountDrafts(
          buildAccountDrafts(source.table.records, mapping, ledger.accounts).map((draft) => ({
            ...draft,
            include: true,
          })),
        );
      } else {
        setRows(
          buildRows(source.table.records, mapping, {
            accounts: ledger.accounts,
            index: ledger.index,
            rules: ledger.rules,
          }),
        );
        setHashedWith(null);
      }
      setBuiltFrom(mapping);
    }
    setStep("preview");
  };

  /* ── Paso 3 ── */

  const patchRows = (indices: ReadonlyArray<number>, patch: RowPatch) => {
    const targets = new Set(indices);
    // Marcar o desmarcar no cambia el hash: no hace falta recalcular duplicados.
    const keepHash = Object.keys(patch).every((key) => key === "include");
    setRows(
      (current) =>
        current?.map((row) => {
          if (!targets.has(row.index)) return row;
          const next = patchRow(row, patch);
          return keepHash ? { ...next, importHash: row.importHash } : next;
        }) ?? null,
    );
  };

  const resolve = (target: ResolveTarget) =>
    setRows((current) => (current === null ? null : resolveName(current, target)));

  /* ── Paso 4 ── */

  const drafts = useMemo(() => (rows === null ? [] : toDrafts(rows)), [rows]);
  const includedAccounts = accountDrafts?.filter((draft) => draft.include) ?? [];

  const rememberMapping = () => {
    if (!remember || source === null || mapping === null) return;
    repo.saveImportProfile(
      {
        name: preset.name,
        source: preset.source,
        delimiter: source.table.delimiter,
        encoding: source.table.encoding,
        dateFormat: mapping.dateFormat,
        decimalSeparator: mapping.decimalSeparator,
        columnMap: mapping.columnMap,
        signMode: mapping.signMode,
      },
      saved?.id ?? null,
    );
  };

  const finish = (next: ImportResult) => {
    rememberMapping();
    setResult(next);
    setSource(null);
    clearWork();
    setStep("upload");
    window.scrollTo({ top: 0 });
  };

  const commitTransactions = () => {
    if (source === null || drafts.length === 0) return;
    const batchId = repo.commitImport(
      drafts,
      { source: preset.source, fileName: source.fileName, importedAt: new Date() },
      ledger.rules,
    );
    finish({ kind: "transactions", batchId, count: drafts.length, fileName: source.fileName });
  };

  const commitAccounts = () => {
    if (includedAccounts.length === 0) return;
    repo.importAccounts(includedAccounts, today, nextSortOrder(ledger.accounts));
    const created = includedAccounts.filter((draft) => draft.existingId === null).length;
    finish({ kind: "accounts", created, updated: includedAccounts.length - created });
  };

  /* ── Resultado ── */

  if (result !== null) {
    const isBatch = result.kind === "transactions";
    return (
      <>
        <PageHeader title="Importar" />
        <HeroCard className="mx-auto max-w-2xl">
          <EmptyState
            icon={<Check aria-hidden="true" size={22} strokeWidth={2} className="text-accent" />}
            title={
              isBatch
                ? plural(result.count, "movimiento importado", "movimientos importados")
                : `${plural(result.created, "cuenta creada", "cuentas creadas")} · ${plural(result.updated, "actualizada", "actualizadas")}`
            }
            description={
              isBatch
                ? `De «${result.fileName}». Ya cuentan en tus saldos, presupuestos y gráficas.`
                : "Ya puedes importar los pagos, ingresos y transferencias de Notion."
            }
            actions={
              <>
                <Button variant="primary" onClick={() => setResult(null)}>
                  Importar otro archivo
                </Button>
                <Button variant="secondary" asChild>
                  <Link to={isBatch ? "/movimientos" : "/cuentas"}>
                    {isBatch ? "Ver movimientos" : "Ver cuentas"}
                  </Link>
                </Button>
                {isBatch && (
                  <Button variant="ghost" onClick={() => setConfirmUndo(true)}>
                    Deshacer
                  </Button>
                )}
              </>
            }
          />
        </HeroCard>
        {isBatch && (
          <ConfirmDialog
            open={confirmUndo}
            onOpenChange={setConfirmUndo}
            tone="danger"
            title={`¿Deshacer «${result.fileName}»?`}
            description={`Se borrarán los ${result.count} movimientos importados. Puedes volver a importar el archivo.`}
            confirmLabel="Deshacer lote"
            onConfirm={() => {
              const count = repo.undoImportBatch(result.batchId, ledger.transactions);
              toast(
                `Lote deshecho · ${plural(count, "movimiento borrado", "movimientos borrados")}`,
              );
              setResult(null);
            }}
          />
        )}
      </>
    );
  }

  /* ── Asistente ── */

  const current = STEPS.findIndex((item) => item.key === step);

  return (
    <>
      <PageHeader
        title="Importar"
        subtitle={source === null ? "Trae movimientos de tu banco o de Notion" : source.fileName}
      />
      <div className="flex flex-col gap-5">
        <StepIndicator current={current} />

        {step === "upload" && (
          <>
            <UploadStep
              source={source}
              error={fileError}
              presetKey={presetKey}
              onPresetChange={choosePreset}
              onFile={(file) => void loadFile(file)}
              onContinue={toMapping}
            />
            <ImportHistory />
          </>
        )}

        {step === "mapping" && source !== null && mapping !== null && (
          <MappingStep
            source={source}
            preset={preset}
            mapping={mapping}
            onChange={setMapping}
            onBack={() => setStep("upload")}
            onContinue={toPreview}
          />
        )}

        {step === "preview" && rows !== null && preset.kind === "transactions" && (
          <PreviewStep
            rows={rows}
            hashing={hashing}
            onPatch={patchRows}
            onResolve={resolve}
            onBack={() => setStep("mapping")}
            onContinue={() => setStep("confirm")}
          />
        )}
        {step === "preview" && accountDrafts !== null && preset.kind === "accounts" && (
          <AccountsPreview
            drafts={accountDrafts}
            onChange={setAccountDrafts}
            onBack={() => setStep("mapping")}
            onContinue={() => setStep("confirm")}
          />
        )}

        {step === "confirm" &&
          source !== null &&
          rows !== null &&
          preset.kind === "transactions" && (
            <ConfirmStep
              fileName={source.fileName}
              profileName={preset.name}
              drafts={drafts}
              leftOut={rows.length - drafts.length}
              remember={remember}
              onRememberChange={setRemember}
              onBack={() => setStep("preview")}
              onConfirm={commitTransactions}
            />
          )}
        {step === "confirm" && source !== null && preset.kind === "accounts" && (
          <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
            <Card className="flex flex-col gap-1">
              <h2 className="text-h2 text-fg">
                Vas a importar {plural(includedAccounts.length, "cuenta", "cuentas")}
              </h2>
              <p className="text-body text-fg-2">
                De «{source.fileName}». Las nuevas se crean con su saldo inicial; en las que ya
                existen se actualizan el saldo inicial y la fecha de apertura.
              </p>
            </Card>
            <div className="flex justify-between gap-2">
              <Button variant="ghost" onClick={() => setStep("preview")}>
                Atrás
              </Button>
              <Button
                variant="primary"
                disabled={includedAccounts.length === 0}
                onClick={commitAccounts}
              >
                Importar {plural(includedAccounts.length, "cuenta", "cuentas")}
              </Button>
            </div>
          </div>
        )}
      </div>
    </>
  );
};
