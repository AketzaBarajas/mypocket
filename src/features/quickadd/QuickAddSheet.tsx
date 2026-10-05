import { useNavigate, useSearch } from "@tanstack/react-router";
import { ArrowRight, Calendar, Plus } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useMemo, useRef, useState } from "react";

import { useAccounts, useLedger, useRepo } from "@/data";
import { isLeaf } from "@/domain/categories";
import { addDaysIso, formatShortDate } from "@/domain/dates";
import { centsToInputValue, parseMoney } from "@/domain/money";
import { findRule, suggestRule } from "@/domain/rules";
import {
  convertWithRate,
  hasErrors,
  type TransactionErrors,
  type TransactionInput,
  validateTransaction,
} from "@/domain/transactions";
import type { IsoDate, TransactionType } from "@/domain/types";
import { useToday } from "@/features/shell/useToday";
import { AccountChip, CategoryChipRow, TagPicker } from "@/features/transactions/pickers";
import {
  applyKeypadKey,
  BottomSheet,
  Button,
  Chip,
  cn,
  DatePicker,
  haptic,
  Input,
  NumericKeypad,
  sanitizeAmountText,
  SegmentedControl,
  Select,
  Textarea,
  toast,
  useIsTouch,
} from "@/ui";

const KIND_TO_TYPE = { gasto: "expense", ingreso: "income", transferencia: "transfer" } as const;

const TYPE_OPTIONS = [
  { value: "expense", label: "Gasto" },
  { value: "income", label: "Ingreso" },
  { value: "transfer", label: "Transferir" },
] as const;

const SIGN: Record<TransactionType, string> = { expense: "−", income: "+", transfer: "" };

/** Check que se dibuja al guardar. */
const DrawnCheck = () => {
  const reduceMotion = useReducedMotion();
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" aria-hidden="true">
      <motion.path
        d="M5 12.5l4.5 4.5L19 7.5"
        stroke="currentColor"
        strokeWidth="2.25"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={reduceMotion ? false : { pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      />
    </svg>
  );
};

interface FormProps {
  readonly initialType: TransactionType;
  readonly amountRef: React.RefObject<HTMLInputElement | null>;
  readonly onDone: () => void;
}

const QuickAddForm = ({ initialType, amountRef, onDone }: FormProps) => {
  const ledger = useLedger();
  const { index, rules, settings, goals } = ledger;
  const accounts = useAccounts();
  const repo = useRepo();
  const today = useToday();
  const isTouch = useIsTouch();

  const defaultAccount =
    accounts.find((account) => account.id === settings.lastAccountId) ??
    accounts.find((account) => account.id === settings.defaultAccountId) ??
    accounts.find((account) => account.type !== "investment" && account.type !== "receivable") ??
    accounts[0];

  const [type, setType] = useState<TransactionType>(initialType);
  const [amountText, setAmountText] = useState("");
  const [accountId, setAccountId] = useState<string | null>(defaultAccount?.id ?? null);
  const [toAccountId, setToAccountId] = useState<string | null>(null);
  const [date, setDate] = useState<IsoDate>(today);
  const [manualCategoryId, setManualCategoryId] = useState<string | null>(null);
  const [concept, setConcept] = useState("");
  const [showMore, setShowMore] = useState(false);
  const [notes, setNotes] = useState("");
  const [tagIds, setTagIds] = useState<ReadonlyArray<string>>([]);
  const [goalId, setGoalId] = useState<string | null>(null);
  const [originalText, setOriginalText] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [rateText, setRateText] = useState("");
  const [errors, setErrors] = useState<TransactionErrors>({});
  const [saved, setSaved] = useState(false);

  // Una regla que coincide con el concepto preselecciona la categoría.
  const ruleCategoryId = useMemo(() => {
    if (type === "transfer") return null;
    const rule = findRule(rules, concept);
    const category = rule ? index.byId.get(rule.categoryId) : undefined;
    return category?.kind === type && isLeaf(index, category.id) ? category.id : null;
  }, [rules, concept, type, index]);
  const categoryId = type === "transfer" ? null : (manualCategoryId ?? ruleCategoryId);
  const byRule = manualCategoryId === null && ruleCategoryId !== null;

  const amount = parseMoney(amountText);
  const original = parseMoney(originalText);
  const rate = Number(rateText.replace(",", "."));
  const converted = original !== null && original > 0 ? convertWithRate(original, rate) : null;
  const activeGoals = goals.filter((goal) => goal.status === "active");

  const changeType = (next: TransactionType) => {
    setType(next);
    setManualCategoryId(null);
    setErrors({});
  };

  const save = () => {
    if (saved) return;
    const hasOriginal = original !== null && original > 0;
    const input: TransactionInput = {
      type,
      status: "confirmed",
      date,
      amount,
      accountId,
      toAccountId: type === "transfer" ? toAccountId : null,
      categoryId,
      concept,
      notes: notes.trim() === "" ? null : notes,
      originalAmount: hasOriginal ? original : null,
      originalCurrency: hasOriginal ? currency.trim().toUpperCase() : null,
      goalId: type === "transfer" ? goalId : null,
    };
    const found = validateTransaction(input, index, new Set(accounts.map((account) => account.id)));
    if (hasErrors(found)) {
      setErrors(found);
      if (found.toAccountId !== undefined || found.originalCurrency !== undefined)
        setShowMore(true);
      return;
    }

    const id = repo.createTransaction(input, tagIds);
    if (accountId !== null) repo.setSetting("lastAccountId", accountId);
    if (type === "expense") repo.setSetting("lastExpenseCategoryId", categoryId);
    if (type === "income") repo.setSetting("lastIncomeCategoryId", categoryId);

    haptic();
    setSaved(true);
    toast({
      message: "Guardado",
      action: { label: "Deshacer", onClick: () => repo.deleteTransaction(id) },
      duration: 5000,
    });

    // Categoría elegida a mano para un concepto sin regla: se ofrece crear la regla.
    const suggestion = byRule ? null : suggestRule(rules, concept, categoryId);
    const category = suggestion ? index.byId.get(suggestion.categoryId) : undefined;
    if (suggestion && category) {
      toast({
        message: `¿Categorizar siempre «${suggestion.pattern}» como ${category.name}?`,
        action: { label: "Crear regla", onClick: () => repo.createRule(suggestion, rules) },
        duration: 8000,
      });
    }
    window.setTimeout(onDone, 380);
  };

  const dateLabel =
    date === today ? "Hoy" : date === addDaysIso(today, -1) ? "Ayer" : formatShortDate(date);

  return (
    <form
      noValidate
      className="flex flex-col gap-3 pt-1"
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      <SegmentedControl
        ariaLabel="Tipo de movimiento"
        value={type}
        onValueChange={changeType}
        options={TYPE_OPTIONS}
      />

      <div className="flex flex-col items-center py-2">
        <label
          className={cn(
            "flex w-full items-baseline justify-center gap-1 num text-display",
            type === "income" ? "text-accent" : "text-fg",
          )}
        >
          <span className="sr-only">Importe en euros</span>
          <span aria-hidden="true" className={cn(amountText === "" && "text-fg-3")}>
            {SIGN[type]}
          </span>
          <input
            ref={amountRef}
            type="text"
            // En táctil se usa el teclado propio: se evita abrir el del sistema.
            inputMode={isTouch ? "none" : "decimal"}
            autoComplete="off"
            enterKeyHint="done"
            placeholder="0"
            value={amountText}
            onChange={(event) => {
              setAmountText(sanitizeAmountText(event.currentTarget.value));
              setErrors((current) => ({ ...current, amount: undefined }));
            }}
            aria-invalid={errors.amount !== undefined || undefined}
            aria-describedby={errors.amount !== undefined ? "quickadd-amount-error" : undefined}
            style={{ width: `${Math.max(1, amountText.length)}ch` }}
            className="min-w-0 bg-transparent p-0 text-center num text-[2.375rem] font-semibold tracking-[-0.02em] outline-none placeholder:text-fg-3"
          />
          <span aria-hidden="true" className="text-fg-2">
            €
          </span>
        </label>
        <p id="quickadd-amount-error" role="alert" className="min-h-4 text-caption text-danger">
          {errors.amount}
        </p>
      </div>

      <div className="-mx-4 no-scrollbar flex gap-2 overflow-x-auto px-4 py-1 sm:-mx-5 sm:px-5">
        <AccountChip
          label={type === "transfer" ? "Cuenta de origen" : "Cuenta"}
          accounts={accounts}
          value={accountId}
          onChange={setAccountId}
          invalid={errors.accountId !== undefined}
        />
        {type === "transfer" && (
          <AccountChip
            label="Cuenta de destino"
            placeholder="Destino"
            prefix={<ArrowRight aria-hidden="true" size={14} strokeWidth={1.75} />}
            accounts={accounts.filter((account) => account.id !== accountId)}
            value={toAccountId}
            onChange={(id) => {
              setToAccountId(id);
              setErrors((current) => ({ ...current, toAccountId: undefined }));
            }}
            invalid={errors.toAccountId !== undefined}
          />
        )}
        <DatePicker value={date} onChange={setDate} today={today}>
          <Chip
            aria-label={`Fecha: ${dateLabel}`}
            leading={<Calendar aria-hidden="true" size={14} strokeWidth={1.75} />}
          >
            {dateLabel}
          </Chip>
        </DatePicker>
        <Chip
          selected={showMore}
          leading={<Plus aria-hidden="true" size={14} strokeWidth={1.75} />}
          onClick={() => setShowMore((current) => !current)}
        >
          Más
        </Chip>
      </div>
      {errors.toAccountId !== undefined && (
        <p role="alert" className="-mt-2 text-caption text-danger">
          {errors.toAccountId}
        </p>
      )}

      {showMore && (
        <div className="flex flex-col gap-3 rounded-[12px] border border-border p-3">
          <TagPicker value={tagIds} onChange={setTagIds} />
          <label className="flex flex-col gap-1.5">
            <span className="text-caption text-fg-2">Notas</span>
            <Textarea
              rows={2}
              value={notes}
              onChange={(event) => setNotes(event.currentTarget.value)}
              maxLength={2000}
              className="min-h-0"
            />
          </label>
          {type === "transfer" && activeGoals.length > 0 && (
            <label className="flex flex-col gap-1.5">
              <span className="text-caption text-fg-2">Meta</span>
              <Select
                ariaLabel="Meta a la que aporta"
                placeholder="Sin meta"
                value={goalId}
                onValueChange={(value) => setGoalId(value === "none" ? null : value)}
                options={[
                  { value: "none", label: "Sin meta" },
                  ...activeGoals.map((goal) => ({
                    value: goal.id,
                    label: goal.name,
                    emoji: goal.emoji,
                  })),
                ]}
              />
            </label>
          )}
          <fieldset className="flex flex-col gap-1.5">
            <legend className="mb-1.5 text-caption text-fg-2">Otra divisa</legend>
            <div className="grid grid-cols-[1fr_5rem_1fr] gap-2">
              <Input
                aria-label="Importe original"
                inputMode="decimal"
                placeholder="Importe"
                className="num"
                value={originalText}
                onChange={(event) => setOriginalText(sanitizeAmountText(event.currentTarget.value))}
              />
              <Input
                aria-label="Código de divisa"
                placeholder="USD"
                maxLength={3}
                className="num uppercase"
                value={currency}
                onChange={(event) => setCurrency(event.currentTarget.value.toUpperCase())}
                aria-invalid={errors.originalCurrency !== undefined || undefined}
              />
              <Input
                aria-label="Tipo de cambio a euros"
                inputMode="decimal"
                placeholder="Cambio"
                className="num"
                value={rateText}
                onChange={(event) => setRateText(event.currentTarget.value.replace(/[^\d.,]/g, ""))}
              />
            </div>
            {converted !== null && (
              <Button
                size="sm"
                variant="secondary"
                className="self-start"
                onClick={() => setAmountText(centsToInputValue(converted).replace(/,00$/, ""))}
              >
                Usar {centsToInputValue(converted)} €
              </Button>
            )}
            <p className="text-caption text-fg-2">
              {errors.originalCurrency ?? "Solo el importe en euros cuenta en los cálculos."}
            </p>
          </fieldset>
        </div>
      )}

      {type !== "transfer" && (
        <div>
          <CategoryChipRow
            kind={type}
            value={categoryId}
            byRule={byRule}
            invalid={errors.categoryId !== undefined}
            onChange={(id) => {
              setManualCategoryId(id);
              setErrors((current) => ({ ...current, categoryId: undefined }));
            }}
          />
          {errors.categoryId !== undefined && (
            <p role="alert" className="mt-1 text-caption text-danger">
              {errors.categoryId}
            </p>
          )}
        </div>
      )}

      <div className="relative">
        <Input
          aria-label="Concepto"
          placeholder="Concepto"
          value={concept}
          maxLength={300}
          autoCapitalize="sentences"
          enterKeyHint="done"
          onChange={(event) => setConcept(event.currentTarget.value)}
          className={cn(byRule && "pr-24")}
        />
        {byRule && categoryId !== null && (
          <span className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 rounded-[6px] bg-accent-soft px-2 py-0.5 text-caption font-semibold text-accent">
            regla: {index.byId.get(categoryId)?.emoji}
          </span>
        )}
      </div>

      {isTouch && (
        <NumericKeypad
          onKey={(key) => {
            setAmountText((current) => applyKeypadKey(current, key));
            setErrors((current) => ({ ...current, amount: undefined }));
          }}
        />
      )}

      <Button type="submit" variant="primary" size="lg" fullWidth aria-live="polite">
        {saved ? (
          <>
            <DrawnCheck />
            <span className="sr-only">Guardado</span>
          </>
        ) : (
          "Guardar"
        )}
      </Button>
    </form>
  );
};

/**
 * Alta rápida global. Se abre desde ＋, la tecla N o `?nuevo=` en cualquier
 * ruta. Es capa de escritura: entra en 150 ms y con el teclado listo.
 */
export const QuickAddSheet = () => {
  const navigate = useNavigate();
  const kind = useSearch({ strict: false, select: (search) => search.nuevo });
  const amountRef = useRef<HTMLInputElement>(null);
  const open = kind !== undefined;

  const close = () =>
    void navigate({ to: ".", search: (prev) => ({ ...prev, nuevo: undefined }), replace: true });

  return (
    <BottomSheet
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
      }}
      title="Nuevo movimiento"
      hideTitle
      speed="fast"
      initialFocus={amountRef}
    >
      {kind !== undefined && (
        <QuickAddForm initialType={KIND_TO_TYPE[kind]} amountRef={amountRef} onDone={close} />
      )}
    </BottomSheet>
  );
};
