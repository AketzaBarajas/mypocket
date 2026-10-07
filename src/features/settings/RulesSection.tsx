import { Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

import { useLedger, useRepo } from "@/data";
import { categoryPath, isLeaf } from "@/domain/categories";
import { findRule, isRuleValid, MATCH_TYPE_LABELS, nextPriority } from "@/domain/rules";
import { type CategorizationRule, MATCH_TYPES, type MatchType } from "@/domain/types";
import { useCategoryGroups } from "@/features/transactions/pickers";
import {
  Badge,
  BottomSheet,
  Button,
  ConfirmDialog,
  EmptyState,
  Field,
  Input,
  Select,
  toast,
} from "@/ui";

import { SettingsCard, SettingsSection } from "./shared";

const ICON = { size: 16, strokeWidth: 1.75 } as const;

/* ───────────────────────── Probador ───────────────────────── */

const RuleTester = () => {
  const { rules, index } = useLedger();
  const [concept, setConcept] = useState("");
  const rule = useMemo(() => findRule(rules, concept), [rules, concept]);
  const category = rule ? index.byId.get(rule.categoryId) : undefined;

  return (
    <SettingsCard>
      <div className="flex flex-col gap-2 p-4">
        <Field label="Probar un concepto">
          {(aria) => (
            <Input
              placeholder="Escribe un concepto: «Mercadona Madrid»"
              autoComplete="off"
              value={concept}
              onChange={(event) => setConcept(event.currentTarget.value)}
              {...aria}
            />
          )}
        </Field>
        <p role="status" aria-live="polite" className="min-h-5 text-body text-fg-2">
          {concept.trim() === "" ? (
            "Verás qué regla lo categoriza."
          ) : rule ? (
            <>
              <span className="text-fg">
                {category
                  ? `${category.emoji} ${categoryPath(index, category.id)}`
                  : "Categoría eliminada"}
              </span>{" "}
              · regla «{rule.pattern}» ({MATCH_TYPE_LABELS[rule.matchType].toLowerCase()})
            </>
          ) : (
            "Ninguna regla coincide."
          )}
        </p>
      </div>
    </SettingsCard>
  );
};

/* ───────────────────────── Formulario ───────────────────────── */

const RuleForm = ({
  rule,
  onDone,
}: {
  readonly rule: CategorizationRule | null;
  readonly onDone: () => void;
}) => {
  const { rules, index } = useLedger();
  const repo = useRepo();
  const expenseGroups = useCategoryGroups("expense");
  const incomeGroups = useCategoryGroups("income");
  const [pattern, setPattern] = useState(rule?.pattern ?? "");
  const [matchType, setMatchType] = useState<MatchType>(rule?.matchType ?? "contains");
  const [categoryId, setCategoryId] = useState<string | null>(rule?.categoryId ?? null);
  const [priority, setPriority] = useState(String(rule?.priority ?? nextPriority(rules)));
  const [errors, setErrors] = useState<{ pattern?: string; category?: string; priority?: string }>(
    {},
  );
  const [confirmDelete, setConfirmDelete] = useState(false);

  const save = () => {
    const next: typeof errors = {};
    const clean = pattern.trim();
    const level = Number(priority);
    if (!isRuleValid({ pattern: clean, matchType })) {
      next.pattern =
        matchType === "regex" ? "La expresión regular no es válida." : "Escribe el texto a buscar.";
    }
    if (categoryId === null || !isLeaf(index, categoryId)) next.category = "Elige una categoría.";
    if (!Number.isInteger(level)) next.priority = "Debe ser un número entero.";
    setErrors(next);
    if (Object.keys(next).length > 0 || categoryId === null) return;

    if (rule) {
      repo.updateRule(rule.id, { pattern: clean, matchType, categoryId, priority: level });
    } else {
      const id = repo.createRule({ pattern: clean, matchType, categoryId }, rules);
      // `createRule` asigna la siguiente prioridad; si se pidió otra, se corrige.
      if (level !== nextPriority(rules)) {
        repo.updateRule(id, { pattern: clean, matchType, categoryId, priority: level });
      }
    }
    toast(rule ? "Regla guardada" : "Regla creada");
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
      <Field label="Cuando el concepto" error={errors.pattern}>
        {(aria) => (
          <div className="grid gap-2 sm:grid-cols-[11rem_1fr]">
            <Select
              ariaLabel="Tipo de coincidencia"
              value={matchType}
              onValueChange={setMatchType}
              options={MATCH_TYPES.map((value) => ({ value, label: MATCH_TYPE_LABELS[value] }))}
            />
            <Input
              placeholder={matchType === "regex" ? "^bizum .*" : "mercadona"}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              maxLength={200}
              value={pattern}
              onChange={(event) => setPattern(event.currentTarget.value)}
              {...aria}
            />
          </div>
        )}
      </Field>
      <Field label="Categorizar como" error={errors.category}>
        {(aria) => (
          <Select
            value={categoryId}
            onValueChange={setCategoryId}
            groups={[...expenseGroups, ...incomeGroups]}
            placeholder="Elegir categoría"
            {...aria}
          />
        )}
      </Field>
      <Field
        label="Prioridad"
        error={errors.priority}
        hint="Si varias reglas coinciden gana la de mayor prioridad; a igualdad, la más específica."
      >
        {(aria) => (
          <Input
            type="number"
            inputMode="numeric"
            className="num"
            value={priority}
            onChange={(event) => setPriority(event.currentTarget.value)}
            {...aria}
          />
        )}
      </Field>

      <div className="flex flex-col gap-2">
        <Button type="submit" variant="primary" size="lg" fullWidth>
          {rule ? "Guardar" : "Crear regla"}
        </Button>
        {rule && (
          <Button
            variant="danger"
            fullWidth
            leading={<Trash2 aria-hidden="true" {...ICON} />}
            onClick={() => setConfirmDelete(true)}
          >
            Borrar
          </Button>
        )}
      </div>
      {rule && (
        <ConfirmDialog
          open={confirmDelete}
          onOpenChange={setConfirmDelete}
          tone="danger"
          title={`¿Borrar la regla «${rule.pattern}»?`}
          description="Los movimientos ya categorizados no cambian."
          confirmLabel="Borrar"
          onConfirm={() => {
            repo.deleteRule(rule.id);
            toast("Regla borrada");
            onDone();
          }}
        />
      )}
    </form>
  );
};

/* ───────────────────────── Sección ───────────────────────── */

export const RulesSection = () => {
  const { rules, index } = useLedger();
  const [form, setForm] = useState<{ readonly rule: CategorizationRule | null } | null>(null);
  const sorted = useMemo(
    () =>
      [...rules].sort((a, b) => b.priority - a.priority || b.createdAt.localeCompare(a.createdAt)),
    [rules],
  );

  return (
    <SettingsSection
      title="Reglas"
      description="Categorizan solas lo que apuntas e importas, según el concepto. No distinguen mayúsculas ni tildes."
      actions={
        <Button
          variant="secondary"
          leading={<Plus aria-hidden="true" {...ICON} />}
          onClick={() => setForm({ rule: null })}
        >
          Nueva
        </Button>
      }
    >
      <RuleTester />

      {sorted.length === 0 ? (
        <SettingsCard>
          <EmptyState
            compact
            icon="🪄"
            title="Aún no hay reglas"
            description="Al guardar un movimiento con una categoría elegida a mano, MyPocket te propone crear la regla."
          />
        </SettingsCard>
      ) : (
        <SettingsCard>
          {sorted.map((rule) => {
            const category = index.byId.get(rule.categoryId);
            const valid = isRuleValid(rule);
            const usable =
              category !== undefined && isLeaf(index, category.id) && !category.archived;
            return (
              <button
                key={rule.id}
                type="button"
                onClick={() => setForm({ rule })}
                className="flex min-h-15 w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-chip"
              >
                <span className="w-7 shrink-0 text-center num text-caption text-fg-3">
                  {rule.priority}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate num text-body text-fg">{rule.pattern}</span>
                    {!valid && <Badge tone="danger">No válida</Badge>}
                    {valid && !usable && <Badge tone="warning">Sin categoría</Badge>}
                  </span>
                  <span className="block truncate text-caption text-fg-2">
                    {MATCH_TYPE_LABELS[rule.matchType]} ·{" "}
                    {category
                      ? `${category.emoji} ${categoryPath(index, category.id)}`
                      : "Categoría eliminada"}
                  </span>
                </span>
                <span className="shrink-0 text-caption text-fg-3">
                  <span className="num">{rule.hitCount}</span>{" "}
                  {rule.hitCount === 1 ? "acierto" : "aciertos"}
                </span>
              </button>
            );
          })}
        </SettingsCard>
      )}

      <BottomSheet
        open={form !== null}
        onOpenChange={(open) => {
          if (!open) setForm(null);
        }}
        title={form?.rule ? "Editar regla" : "Nueva regla"}
        size="md"
      >
        {form && (
          <RuleForm key={form.rule?.id ?? "new"} rule={form.rule} onDone={() => setForm(null)} />
        )}
      </BottomSheet>
    </SettingsSection>
  );
};
