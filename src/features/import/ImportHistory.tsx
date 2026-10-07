import { Undo2 } from "lucide-react";
import { useMemo, useState } from "react";

import { useLedger, useRepo } from "@/data";
import { formatShortDate, fromDate } from "@/domain/dates";
import type { ImportBatch, ImportSource } from "@/domain/types";
import { Button, Card, ConfirmDialog, EmojiChip, toast } from "@/ui";

const SOURCE_LABELS: Record<ImportSource, string> = {
  bbva: "BBVA",
  notion: "Notion",
  generic: "CSV",
};

const movements = (count: number): string =>
  `${count} ${count === 1 ? "movimiento" : "movimientos"}`;

/** Lotes importados, del más reciente al más antiguo, con «Deshacer lote». */
export const ImportHistory = () => {
  const { importBatches, transactions } = useLedger();
  const repo = useRepo();
  const [undoing, setUndoing] = useState<ImportBatch | null>(null);

  // Movimientos de cada lote que siguen vivos: los borrados a mano ya no cuentan.
  const alive = useMemo(() => {
    const counts = new Map<string, number>();
    for (const transaction of transactions) {
      if (transaction.importBatchId !== null && !transaction.isDeleted) {
        counts.set(transaction.importBatchId, (counts.get(transaction.importBatchId) ?? 0) + 1);
      }
    }
    return counts;
  }, [transactions]);

  if (importBatches.length === 0) return null;
  const undoingCount = undoing === null ? 0 : (alive.get(undoing.id) ?? 0);

  return (
    <section className="flex flex-col gap-2">
      <h2 className="px-1 text-title text-fg">Importaciones anteriores</h2>
      <Card padding="none" className="overflow-hidden">
        <ul className="divide-y divide-border">
          {importBatches.map((batch) => (
            <li key={batch.id} className="flex min-h-15 items-center gap-3 py-2 pr-2 pl-4">
              <EmojiChip emoji="📥" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-body text-fg">
                  {batch.fileName === "" ? "Archivo sin nombre" : batch.fileName}
                </div>
                <div className="truncate text-caption text-fg-2">
                  {SOURCE_LABELS[batch.source]} ·{" "}
                  {formatShortDate(fromDate(new Date(batch.importedAt)))} ·{" "}
                  {movements(alive.get(batch.id) ?? 0)}
                </div>
              </div>
              <Button
                size="sm"
                variant="ghost"
                leading={<Undo2 aria-hidden="true" size={14} strokeWidth={1.75} />}
                onClick={() => setUndoing(batch)}
              >
                Deshacer
              </Button>
            </li>
          ))}
        </ul>
      </Card>

      <ConfirmDialog
        open={undoing !== null}
        onOpenChange={(open) => {
          if (!open) setUndoing(null);
        }}
        tone="danger"
        title={`¿Deshacer «${undoing?.fileName ?? ""}»?`}
        description={`Se ${undoingCount === 1 ? "borrará" : "borrarán"} ${
          undoingCount === 1
            ? "el movimiento importado"
            : `los ${undoingCount} movimientos importados`
        }. Puedes volver a importar el archivo.`}
        confirmLabel="Deshacer lote"
        onConfirm={() => {
          if (undoing === null) return;
          const count = repo.undoImportBatch(undoing.id, transactions);
          toast(`Lote deshecho · ${movements(count)} ${count === 1 ? "borrado" : "borrados"}`);
          setUndoing(null);
        }}
      />
    </section>
  );
};
