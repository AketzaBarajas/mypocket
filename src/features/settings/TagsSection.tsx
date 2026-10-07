import { Merge, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

import { useLedger, useRepo } from "@/data";
import { normalizeTagName } from "@/domain/compare";
import type { PaletteColor, Tag } from "@/domain/types";
import { ColorDot, ColorPicker } from "@/features/shared/ColorPicker";
import { BottomSheet, Button, ConfirmDialog, EmptyState, Field, Input, Select, toast } from "@/ui";

import { SettingsCard, SettingsSection } from "./shared";

const ICON = { size: 16, strokeWidth: 1.75 } as const;

const TagForm = ({
  tag,
  uses,
  onDone,
}: {
  readonly tag: Tag;
  readonly uses: number;
  readonly onDone: () => void;
}) => {
  const ledger = useLedger();
  const repo = useRepo();
  const [name, setName] = useState(tag.name);
  const [color, setColor] = useState<PaletteColor>(tag.color);
  const [error, setError] = useState<string | null>(null);
  const [mergeInto, setMergeInto] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<"merge" | "delete" | null>(null);

  const others = ledger.tags.filter((item) => item.id !== tag.id);
  const target = others.find((item) => item.id === mergeInto);
  const clean = normalizeTagName(name);

  const save = () => {
    if (clean === "") {
      setError("Ponle un nombre.");
      return;
    }
    if (others.some((item) => item.name === clean)) {
      setError(`Ya existe #${clean}. Si son la misma, fusiónalas.`);
      return;
    }
    repo.updateTag(tag.id, { name: clean, color });
    toast("Etiqueta guardada");
    onDone();
  };

  return (
    <form
      noValidate
      className="flex flex-col gap-4 pt-2"
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      <Field
        label="Nombre"
        error={error ?? undefined}
        hint={
          clean !== "" && clean !== name ? `Se guardará como #${clean}` : "Sin espacios ni «#»."
        }
      >
        {(aria) => (
          <Input
            maxLength={40}
            autoComplete="off"
            autoCapitalize="none"
            value={name}
            onChange={(event) => {
              setName(event.currentTarget.value);
              setError(null);
            }}
            {...aria}
          />
        )}
      </Field>
      <ColorPicker value={color} onChange={setColor} />
      <Button type="submit" variant="primary" size="lg" fullWidth>
        Guardar
      </Button>

      {others.length > 0 && (
        <div className="flex flex-col gap-2 border-t border-border pt-4">
          <Field
            label="Fusionar con otra etiqueta"
            hint="Sus movimientos pasan a la otra y esta desaparece."
          >
            {(aria) => (
              <Select
                value={mergeInto}
                onValueChange={setMergeInto}
                placeholder="Elegir etiqueta"
                options={others.map((item) => ({ value: item.id, label: `#${item.name}` }))}
                {...aria}
              />
            )}
          </Field>
          <Button
            variant="secondary"
            fullWidth
            disabled={target === undefined}
            leading={<Merge aria-hidden="true" {...ICON} />}
            onClick={() => setConfirm("merge")}
          >
            Fusionar
          </Button>
        </div>
      )}
      <Button
        variant="danger"
        fullWidth
        leading={<Trash2 aria-hidden="true" {...ICON} />}
        onClick={() => setConfirm("delete")}
      >
        Borrar etiqueta
      </Button>

      <ConfirmDialog
        open={confirm === "merge" && target !== undefined}
        onOpenChange={(open) => {
          if (!open) setConfirm(null);
        }}
        tone="danger"
        title={`¿Fusionar #${tag.name} con #${target?.name ?? ""}?`}
        description={`${uses === 1 ? "Su movimiento pasa" : `Sus ${uses} movimientos pasan`} a #${
          target?.name ?? ""
        }. No se puede deshacer.`}
        confirmLabel="Fusionar"
        onConfirm={() => {
          if (target === undefined) return;
          repo.mergeTag(tag.id, target.id, ledger);
          toast(`#${tag.name} fusionada con #${target.name}`);
          onDone();
        }}
      />
      <ConfirmDialog
        open={confirm === "delete"}
        onOpenChange={(open) => {
          if (!open) setConfirm(null);
        }}
        tone="danger"
        title={`¿Borrar #${tag.name}?`}
        description={
          uses === 0
            ? "No la usa ningún movimiento."
            : `Se quita de ${uses === 1 ? "su movimiento" : `sus ${uses} movimientos`}. Los movimientos no se borran.`
        }
        confirmLabel="Borrar"
        onConfirm={() => {
          repo.deleteTag(tag.id, ledger);
          toast("Etiqueta borrada");
          onDone();
        }}
      />
    </form>
  );
};

export const TagsSection = () => {
  const { tags, transactionTags, transactions } = useLedger();
  const [editing, setEditing] = useState<Tag | null>(null);

  const usage = useMemo(() => {
    const alive = new Set(
      transactions
        .filter((transaction) => !transaction.isDeleted)
        .map((transaction) => transaction.id),
    );
    const counts = new Map<string, number>();
    for (const link of transactionTags) {
      if (alive.has(link.transactionId)) counts.set(link.tagId, (counts.get(link.tagId) ?? 0) + 1);
    }
    return counts;
  }, [transactions, transactionTags]);

  return (
    <SettingsSection
      title="Etiquetas"
      description="Agrupan movimientos de distintas categorías: un viaje, una reforma, un proyecto."
    >
      {tags.length === 0 ? (
        <SettingsCard>
          <EmptyState
            compact
            icon="#️⃣"
            title="Aún no hay etiquetas"
            description="Se crean al apuntar un movimiento, desde «+ Más»."
          />
        </SettingsCard>
      ) : (
        <SettingsCard>
          {tags.map((tag) => {
            const uses = usage.get(tag.id) ?? 0;
            return (
              <button
                key={tag.id}
                type="button"
                onClick={() => setEditing(tag)}
                className="flex min-h-13 w-full items-center gap-3 px-4 py-2 text-left transition-colors hover:bg-chip"
              >
                <ColorDot color={tag.color} className="size-2.5" />
                <span className="min-w-0 flex-1 truncate text-body text-fg">#{tag.name}</span>
                <span className="shrink-0 text-caption text-fg-3">
                  <span className="num">{uses}</span> {uses === 1 ? "movimiento" : "movimientos"}
                </span>
              </button>
            );
          })}
        </SettingsCard>
      )}

      <BottomSheet
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
        title="Editar etiqueta"
        size="sm"
      >
        {editing && (
          <TagForm
            key={editing.id}
            tag={editing}
            uses={usage.get(editing.id) ?? 0}
            onDone={() => setEditing(null)}
          />
        )}
      </BottomSheet>
    </SettingsSection>
  );
};
