import { FileSpreadsheet, Upload } from "lucide-react";
import { useRef, useState, type DragEvent } from "react";

import { useLedger } from "@/data";
import { PROFILE_PRESETS, type ProfilePreset } from "@/domain/importing/profiles";
import { savedProfileFor } from "@/domain/importing/session";
import { Badge, Button, Card, cn, Notice } from "@/ui";

import type { ImportSource } from "./types";

const DELIMITER_NAMES: Record<string, string> = {
  ";": "punto y coma",
  ",": "coma",
  "\t": "tabulador",
  "|": "barra vertical",
};

const describeSource = (source: ImportSource): string => {
  const rows = source.table.records.length;
  const columns = source.table.headers.length;
  return [
    `${rows} ${rows === 1 ? "fila" : "filas"}`,
    `${columns} ${columns === 1 ? "columna" : "columnas"}`,
    `separador: ${DELIMITER_NAMES[source.table.delimiter] ?? source.table.delimiter}`,
    source.table.encoding === "utf-8" ? "UTF-8" : "Windows-1252",
  ].join(" · ");
};

const Dropzone = ({
  source,
  error,
  onFile,
}: {
  readonly source: ImportSource | null;
  readonly error: string | null;
  readonly onFile: (file: File) => void;
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (file) onFile(file);
  };

  return (
    <div className="flex flex-col gap-2">
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          "flex flex-col items-center gap-3 rounded-hero border border-dashed px-5 py-8 text-center transition-colors",
          dragging ? "border-accent bg-accent-soft" : "border-border-strong bg-surface",
        )}
      >
        <span
          aria-hidden="true"
          className="inline-flex size-12 items-center justify-center rounded-card border border-border bg-chip text-fg-2"
        >
          {source ? (
            <FileSpreadsheet size={22} strokeWidth={1.75} />
          ) : (
            <Upload size={22} strokeWidth={1.75} />
          )}
        </span>
        {source ? (
          <div className="max-w-full min-w-0">
            <p className="truncate text-title text-fg">{source.fileName}</p>
            <p className="mt-1 text-caption text-fg-2">{describeSource(source)}</p>
          </div>
        ) : (
          <div>
            <p className="text-title text-fg">Arrastra aquí tu CSV</p>
            <p className="mt-1 text-body text-fg-2">
              El archivo se lee en este dispositivo. No sale de él.
            </p>
          </div>
        )}
        <Button variant="secondary" onClick={() => inputRef.current?.click()}>
          {source ? "Cambiar archivo" : "Elegir archivo"}
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.txt,.tsv,text/csv,text/plain"
          aria-label="Archivo CSV"
          tabIndex={-1}
          className="sr-only"
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            // Vaciar el campo permite volver a elegir el mismo archivo.
            event.currentTarget.value = "";
            if (file) onFile(file);
          }}
        />
      </div>
      {error !== null && (
        <p role="alert" className="text-caption text-danger">
          {error}
        </p>
      )}
    </div>
  );
};

const PresetCard = ({
  preset,
  selected,
  remembered,
  onSelect,
}: {
  readonly preset: ProfilePreset;
  readonly selected: boolean;
  readonly remembered: boolean;
  readonly onSelect: () => void;
}) => (
  <button
    type="button"
    role="radio"
    aria-checked={selected}
    onClick={onSelect}
    className={cn(
      "flex min-h-18 min-w-0 flex-col gap-1 rounded-card border bg-surface p-3 text-left transition-colors",
      selected ? "border-accent" : "border-border hover:border-border-strong active:bg-chip",
    )}
  >
    <span className="flex min-w-0 items-center gap-2">
      <span className="min-w-0 flex-1 truncate text-title text-fg">{preset.name}</span>
      {remembered && <Badge>Mapeo guardado</Badge>}
    </span>
    <span className="text-caption text-fg-2">{preset.description}</span>
  </button>
);

export interface UploadStepProps {
  readonly source: ImportSource | null;
  readonly error: string | null;
  readonly presetKey: string;
  readonly onPresetChange: (key: string) => void;
  readonly onFile: (file: File) => void;
  readonly onContinue: () => void;
}

/** Paso 1: subir el CSV y elegir el perfil con el que se interpreta. */
export const UploadStep = ({
  source,
  error,
  presetKey,
  onPresetChange,
  onFile,
  onContinue,
}: UploadStepProps) => {
  const { importProfiles } = useLedger();
  const isNotion = presetKey.startsWith("notion");

  return (
    <div className="flex flex-col gap-4">
      <Dropzone source={source} error={error} onFile={onFile} />

      <section className="flex flex-col gap-2">
        <h2 id="import-profile" className="px-1 text-title text-fg">
          ¿De dónde viene?
        </h2>
        <div
          role="radiogroup"
          aria-labelledby="import-profile"
          className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3"
        >
          {PROFILE_PRESETS.map((preset) => (
            <PresetCard
              key={preset.key}
              preset={preset}
              selected={preset.key === presetKey}
              remembered={savedProfileFor(importProfiles, preset) !== undefined}
              onSelect={() => onPresetChange(preset.key)}
            />
          ))}
        </div>
      </section>

      {isNotion && (
        <Card padding="sm" className="text-body text-fg-2">
          En Notion, abre cada base de datos y elige «Exportar» en formato CSV. Importa primero
          Cuentas y después Pagos, Ingresos y Transferencias: así los movimientos encuentran su
          cuenta por el nombre.
        </Card>
      )}
      {presetKey === "bbva" && (
        <Notice>
          El extracto de BBVA cambia según de dónde lo descargues. En el siguiente paso puedes
          corregir cualquier columna.
        </Notice>
      )}

      <div className="flex justify-end">
        <Button variant="primary" disabled={source === null} onClick={onContinue}>
          Continuar
        </Button>
      </div>
    </div>
  );
};
