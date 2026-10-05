import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "@tanstack/react-router";
import { Check, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { z } from "zod";

import { useAccounts, useLedger, useRepo } from "@/data";
import { childrenOfCategory, topLevelCategories } from "@/domain/categories";
import { formatLongDate, formatShortDate, isIsoDate, todayFrom } from "@/domain/dates";
import { cents } from "@/domain/money";
import {
  hasErrors,
  type TransactionField,
  type TransactionInput,
  validateTransaction,
} from "@/domain/transactions";
import { type Cents, type IsoDate, type Transaction, TRANSACTION_TYPES } from "@/domain/types";
import { useToday } from "@/features/shell/useToday";
import {
  Button,
  Card,
  Chip,
  ConfirmDialog,
  DatePicker,
  EmptyState,
  Field,
  Input,
  MoneyInput,
  PageHeader,
  SegmentedControl,
  Select,
  type SelectGroup,
  Switch,
  Textarea,
  toast,
} from "@/ui";

import { TagPicker } from "./pickers";
import { TYPE_LABELS } from "./view";

const formSchema = z.object({
  type: z.enum(TRANSACTION_TYPES),
  pending: z.boolean(),
  date: z.custom<IsoDate>((value) => typeof value === "string" && isIsoDate(value)),
  amount: z.number().int().nullable(),
  accountId: z.string().nullable(),
  toAccountId: z.string().nullable(),
  categoryId: z.string().nullable(),
  concept: z.string().max(300, "El concepto admite 300 caracteres como máximo."),
  notes: z.string().max(2000, "Las notas admiten 2000 caracteres como máximo."),
  originalAmount: z.number().int().nullable(),
  originalCurrency: z.string().max(3),
  goalId: z.string().nullable(),
  tagIds: z.array(z.string()),
});
type FormValues = z.infer<typeof formSchema>;

const asCents = (value: number | null): Cents | null => (value === null ? null : cents(value));

const toInput = (values: FormValues): TransactionInput => ({
  type: values.type,
  status: values.pending ? "pending" : "confirmed",
  date: values.date,
  amount: asCents(values.amount),
  accountId: values.accountId,
  toAccountId: values.toAccountId,
  categoryId: values.categoryId,
  concept: values.concept,
  notes: values.notes.trim() === "" ? null : values.notes,
  originalAmount: asCents(values.originalAmount),
  originalCurrency:
    values.originalAmount === null ? null : values.originalCurrency.trim().toUpperCase(),
  goalId: values.goalId,
});

const Editor = ({ transaction }: { readonly transaction: Transaction }) => {
  const ledger = useLedger();
  const accounts = useAccounts({ includeArchived: true });
  const repo = useRepo();
  const navigate = useNavigate();
  const today = useToday();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const currentTagIds = useMemo(
    () => (ledger.tagsOf.get(transaction.id) ?? []).map((tag) => tag.id),
    [ledger.tagsOf, transaction.id],
  );

  const {
    control,
    register,
    handleSubmit,
    setError,
    setValue,
    formState: { errors, isDirty },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      type: transaction.type,
      pending: transaction.status === "pending",
      date: transaction.date,
      amount: transaction.amount,
      accountId: transaction.accountId,
      toAccountId: transaction.toAccountId,
      categoryId: transaction.categoryId,
      concept: transaction.concept,
      notes: transaction.notes ?? "",
      originalAmount: transaction.originalAmount,
      originalCurrency: transaction.originalCurrency ?? "",
      goalId: transaction.goalId,
      tagIds: currentTagIds,
    },
  });
  const type = useWatch({ control, name: "type" });
  const pending = useWatch({ control, name: "pending" });

  const categoryGroups = useMemo((): ReadonlyArray<SelectGroup<string>> => {
    if (type === "transfer") return [];
    return topLevelCategories(ledger.index, type).map((top) => {
      const children = childrenOfCategory(ledger.index, top.id).filter((child) => !child.archived);
      return {
        label: `${top.emoji} ${top.name}`,
        options: (children.length === 0 ? [top] : children).map((category) => ({
          value: category.id,
          label: category.name,
          emoji: category.emoji,
        })),
      };
    });
  }, [ledger.index, type]);

  const accountOptions = accounts.map((account) => ({
    value: account.id,
    label: account.archived ? `${account.name} (archivada)` : account.name,
    emoji: account.emoji,
  }));
  const goals = ledger.goals.filter(
    (goal) => goal.status === "active" || goal.id === transaction.goalId,
  );
  const back = () => void navigate({ to: "/movimientos" });

  const save = handleSubmit((values) => {
    const input = toInput(values);
    const found = validateTransaction(
      input,
      ledger.index,
      new Set(accounts.map((account) => account.id)),
    );
    if (hasErrors(found)) {
      for (const [field, message] of Object.entries(found) as Array<
        [TransactionField, string | undefined]
      >) {
        if (message !== undefined) setError(field, { message });
      }
      return;
    }
    repo.updateTransaction(transaction.id, input, values.tagIds, currentTagIds);
    toast("Cambios guardados");
    back();
  });

  const remove = () => {
    repo.deleteTransaction(transaction.id);
    toast({
      message: "Movimiento borrado",
      action: { label: "Deshacer", onClick: () => repo.restoreTransaction(transaction.id) },
    });
    back();
  };

  const batch = ledger.importBatches.find((item) => item.id === transaction.importBatchId);
  const recurrence = ledger.recurrences.find((item) => item.id === transaction.recurrenceId);

  return (
    <form
      noValidate
      onSubmit={(event) => void save(event)}
      className="mx-auto flex max-w-xl flex-col gap-4 pb-8"
    >
      <Controller
        control={control}
        name="type"
        render={({ field }) => (
          <SegmentedControl
            ariaLabel="Tipo de movimiento"
            value={field.value}
            onValueChange={(next) => {
              field.onChange(next);
              // La categoría anterior no vale para otro tipo.
              setValue("categoryId", null);
              if (next !== "transfer") {
                setValue("toAccountId", null);
                setValue("goalId", null);
              }
            }}
            options={TRANSACTION_TYPES.map((value) => ({ value, label: TYPE_LABELS[value] }))}
          />
        )}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Importe" error={errors.amount?.message}>
          {(aria) => (
            <Controller
              control={control}
              name="amount"
              render={({ field }) => (
                <MoneyInput
                  value={asCents(field.value)}
                  onValueChange={field.onChange}
                  onBlur={field.onBlur}
                  {...aria}
                />
              )}
            />
          )}
        </Field>
        <Field label="Fecha">
          {(aria) => (
            <Controller
              control={control}
              name="date"
              render={({ field }) => (
                <DatePicker value={field.value} onChange={field.onChange} today={today}>
                  <Chip id={aria.id} className="h-11 justify-start">
                    {formatLongDate(field.value)}
                  </Chip>
                </DatePicker>
              )}
            />
          )}
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label={type === "transfer" ? "Cuenta de origen" : "Cuenta"}
          error={errors.accountId?.message}
        >
          {(aria) => (
            <Controller
              control={control}
              name="accountId"
              render={({ field }) => (
                <Select
                  value={field.value}
                  onValueChange={field.onChange}
                  options={accountOptions}
                  {...aria}
                />
              )}
            />
          )}
        </Field>
        {type === "transfer" ? (
          <Field label="Cuenta de destino" error={errors.toAccountId?.message}>
            {(aria) => (
              <Controller
                control={control}
                name="toAccountId"
                render={({ field }) => (
                  <Select
                    value={field.value}
                    onValueChange={field.onChange}
                    options={accountOptions}
                    {...aria}
                  />
                )}
              />
            )}
          </Field>
        ) : (
          <Field label="Categoría" error={errors.categoryId?.message}>
            {(aria) => (
              <Controller
                control={control}
                name="categoryId"
                render={({ field }) => (
                  <Select
                    value={field.value}
                    onValueChange={field.onChange}
                    groups={categoryGroups}
                    {...aria}
                  />
                )}
              />
            )}
          </Field>
        )}
      </div>

      <Field label="Concepto" error={errors.concept?.message}>
        {(aria) => <Input maxLength={300} {...register("concept")} {...aria} />}
      </Field>

      <Field label="Notas" error={errors.notes?.message}>
        {(aria) => <Textarea maxLength={2000} {...register("notes")} {...aria} />}
      </Field>

      <div className="flex flex-col gap-1.5">
        <span className="text-caption text-fg-2">Etiquetas</span>
        <Controller
          control={control}
          name="tagIds"
          render={({ field }) => <TagPicker value={field.value} onChange={field.onChange} />}
        />
      </div>

      {type === "transfer" && goals.length > 0 && (
        <Field label="Meta">
          {(aria) => (
            <Controller
              control={control}
              name="goalId"
              render={({ field }) => (
                <Select
                  value={field.value ?? "none"}
                  onValueChange={(value) => field.onChange(value === "none" ? null : value)}
                  options={[
                    { value: "none", label: "Sin meta" },
                    ...goals.map((goal) => ({
                      value: goal.id,
                      label: goal.name,
                      emoji: goal.emoji,
                    })),
                  ]}
                  {...aria}
                />
              )}
            />
          )}
        </Field>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Importe en otra divisa" hint="Opcional y solo informativo.">
          {(aria) => (
            <Controller
              control={control}
              name="originalAmount"
              render={({ field }) => (
                <MoneyInput
                  value={asCents(field.value)}
                  onValueChange={field.onChange}
                  onBlur={field.onBlur}
                  placeholder="—"
                  {...aria}
                />
              )}
            />
          )}
        </Field>
        <Field label="Divisa" error={errors.originalCurrency?.message}>
          {(aria) => (
            <Input
              placeholder="USD"
              maxLength={3}
              className="num uppercase"
              {...register("originalCurrency")}
              {...aria}
            />
          )}
        </Field>
      </div>

      <Card padding="sm" className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-body text-fg">Pendiente de aprobar</div>
          <div className="text-caption text-fg-2">
            Un pendiente no cuenta en saldos ni totales hasta que se aprueba.
          </div>
        </div>
        <Controller
          control={control}
          name="pending"
          render={({ field }) => (
            <Switch
              checked={field.value}
              onCheckedChange={field.onChange}
              label="Pendiente de aprobar"
            />
          )}
        />
      </Card>

      {(batch ?? recurrence) && (
        <p className="text-caption text-fg-2">
          {batch &&
            `Importado de «${batch.fileName}» el ${formatShortDate(todayFrom(new Date(batch.importedAt)))}.`}
          {recurrence && `Generado por la recurrencia «${recurrence.name}».`}
        </p>
      )}

      <div className="flex flex-col gap-2 pt-2 sm:flex-row-reverse">
        <Button
          type="submit"
          variant="primary"
          size="lg"
          className="sm:flex-1"
          disabled={!isDirty && !pending}
        >
          Guardar
        </Button>
        {transaction.status === "pending" && (
          <Button
            variant="secondary"
            size="lg"
            className="sm:flex-1"
            leading={<Check aria-hidden="true" size={18} strokeWidth={1.75} />}
            onClick={() => {
              repo.approveTransaction(transaction.id);
              toast("Aprobado");
              back();
            }}
          >
            Aprobar
          </Button>
        )}
        <Button
          variant="danger"
          size="lg"
          leading={<Trash2 aria-hidden="true" size={18} strokeWidth={1.75} />}
          onClick={() => setConfirmDelete(true)}
        >
          Borrar
        </Button>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        tone="danger"
        title="¿Borrar este movimiento?"
        description="Dejará de contar en saldos, presupuestos y gráficas."
        confirmLabel="Borrar"
        onConfirm={remove}
      />
    </form>
  );
};

/** Edición completa de un movimiento. */
export const TransactionEditPage = ({ id }: { readonly id: string }) => {
  const { transactions } = useLedger();
  const transaction = transactions.find((item) => item.id === id && !item.isDeleted);

  return (
    <>
      <PageHeader
        title={transaction ? TYPE_LABELS[transaction.type] : "Movimiento"}
        backTo="/movimientos"
      />
      {transaction ? (
        // `key`: si llega un cambio por sincronización, el formulario parte de los datos nuevos.
        <Editor key={`${transaction.id}-${transaction.status}`} transaction={transaction} />
      ) : (
        <EmptyState
          icon="🧾"
          title="Este movimiento ya no existe"
          description="Puede que lo hayas borrado desde otro dispositivo."
        />
      )}
    </>
  );
};
