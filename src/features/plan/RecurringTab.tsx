import { zodResolver } from "@hookform/resolvers/zod";
import { Pause, Play, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { z } from "zod";

import { useAccounts, useLedger, useRepo } from "@/data";
import { isLeaf } from "@/domain/categories";
import { formatLongDate, formatShortDate, isIsoDate } from "@/domain/dates";
import { cents, formatMoney } from "@/domain/money";
import {
  describeFrequency,
  firstOccurrenceOnOrAfter,
  monthlyEquivalent,
  subscriptionsMonthlyTotal,
} from "@/domain/recurrences";
import { FREQUENCIES, type IsoDate, type Recurrence, TRANSACTION_TYPES } from "@/domain/types";
import { useToday } from "@/features/shell/useToday";
import { useCategoryGroups } from "@/features/transactions/pickers";
import { TRANSFER_EMOJI, TYPE_LABELS } from "@/features/transactions/view";
import {
  Badge,
  BottomSheet,
  Button,
  Card,
  Chip,
  cn,
  ConfirmDialog,
  DatePicker,
  EmojiChip,
  EmptyState,
  Field,
  IconButton,
  Input,
  Money,
  MoneyInput,
  RowAmount,
  SegmentedControl,
  Select,
  Switch,
  toast,
} from "@/ui";

const FREQUENCY_LABELS = { weekly: "Semanas", monthly: "Meses", yearly: "Años" } as const;

const isoDate = z.custom<IsoDate>((value) => typeof value === "string" && isIsoDate(value));

const recurrenceSchema = z.object({
  name: z.string().trim().min(1, "Ponle un nombre.").max(60),
  type: z.enum(TRANSACTION_TYPES),
  amount: z
    .number({ error: "Escribe un importe mayor que cero." })
    .int()
    .positive("Escribe un importe mayor que cero."),
  accountId: z.string().min(1, "Elige una cuenta."),
  toAccountId: z.string().nullable(),
  categoryId: z.string().nullable(),
  frequency: z.enum(FREQUENCIES),
  interval: z
    .number({ error: "Indica cada cuánto se repite." })
    .int()
    .min(1, "El mínimo es 1.")
    .max(99),
  anchorDate: isoDate,
  endDate: isoDate.nullable(),
  leadDays: z.number({ error: "Indica los días de aviso." }).int().min(0).max(60),
  isSubscription: z.boolean(),
  active: z.boolean(),
});
type RecurrenceValues = z.infer<typeof recurrenceSchema>;

const RecurrenceForm = ({
  recurrence,
  onDone,
}: {
  readonly recurrence: Recurrence | null;
  readonly onDone: () => void;
}) => {
  const { index, settings } = useLedger();
  const accounts = useAccounts();
  const repo = useRepo();
  const today = useToday();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const {
    control,
    register,
    handleSubmit,
    setError,
    setValue,
    formState: { errors },
  } = useForm<RecurrenceValues>({
    resolver: zodResolver(recurrenceSchema),
    defaultValues: recurrence
      ? {
          name: recurrence.name,
          type: recurrence.type,
          amount: recurrence.amount,
          accountId: recurrence.accountId,
          toAccountId: recurrence.toAccountId,
          categoryId: recurrence.categoryId,
          frequency: recurrence.frequency,
          interval: recurrence.interval,
          anchorDate: recurrence.anchorDate,
          endDate: recurrence.endDate,
          leadDays: recurrence.leadDays,
          isSubscription: recurrence.isSubscription,
          active: recurrence.active,
        }
      : {
          name: "",
          type: "expense",
          accountId: settings.defaultAccountId ?? settings.lastAccountId ?? accounts[0]?.id ?? "",
          toAccountId: null,
          categoryId: null,
          frequency: "monthly",
          interval: 1,
          anchorDate: today,
          endDate: null,
          leadDays: 3,
          isSubscription: false,
          active: true,
        },
  });
  const type = useWatch({ control, name: "type" });
  const categoryGroups = useCategoryGroups(type === "transfer" ? null : type);
  const accountOptions = accounts.map((account) => ({
    value: account.id,
    label: account.name,
    emoji: account.emoji,
  }));

  const save = handleSubmit((values) => {
    if (values.type === "transfer") {
      if (values.toAccountId === null) {
        setError("toAccountId", { message: "Elige la cuenta de destino." });
        return;
      }
      if (values.toAccountId === values.accountId) {
        setError("toAccountId", {
          message: "La cuenta de destino debe ser distinta de la de origen.",
        });
        return;
      }
    } else if (values.categoryId === null || !isLeaf(index, values.categoryId)) {
      setError("categoryId", { message: "Elige una categoría." });
      return;
    }

    const schedule = {
      frequency: values.frequency,
      interval: values.interval,
      anchorDate: values.anchorDate,
    };
    const scheduleChanged =
      recurrence?.frequency !== values.frequency ||
      recurrence.interval !== values.interval ||
      recurrence.anchorDate !== values.anchorDate;

    const input = {
      ...values,
      amount: cents(values.amount),
      concept: values.name.trim(),
      // La próxima ocurrencia es la primera del calendario a partir de hoy.
      nextDueDate: scheduleChanged
        ? firstOccurrenceOnOrAfter(schedule, today)
        : recurrence.nextDueDate,
    };
    if (recurrence) repo.updateRecurrence(recurrence.id, input);
    else repo.createRecurrence(input);
    toast(recurrence ? "Recurrente actualizado" : "Recurrente creado");
    onDone();
  });

  return (
    <form noValidate onSubmit={(event) => void save(event)} className="flex flex-col gap-4 pt-2">
      <Controller
        control={control}
        name="type"
        render={({ field }) => (
          <SegmentedControl
            ariaLabel="Tipo de movimiento"
            value={field.value}
            onValueChange={(next) => {
              field.onChange(next);
              setValue("categoryId", null);
              if (next !== "transfer") setValue("toAccountId", null);
            }}
            options={TRANSACTION_TYPES.map((value) => ({ value, label: TYPE_LABELS[value] }))}
          />
        )}
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nombre" error={errors.name?.message}>
          {(aria) => (
            <Input maxLength={60} placeholder="Alquiler" {...register("name")} {...aria} />
          )}
        </Field>
        <Field label="Importe" error={errors.amount?.message}>
          {(aria) => (
            <Controller
              control={control}
              name="amount"
              render={({ field }) => (
                <MoneyInput
                  value={typeof field.value === "number" ? cents(field.value) : null}
                  onValueChange={(value) => field.onChange(value ?? undefined)}
                  onBlur={field.onBlur}
                  {...aria}
                />
              )}
            />
          )}
        </Field>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
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
                  value={field.value === "" ? null : field.value}
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

      <div className="grid grid-cols-[5.5rem_1fr] gap-3">
        <Field label="Cada" error={errors.interval?.message}>
          {(aria) => (
            <Input
              type="number"
              inputMode="numeric"
              min={1}
              max={99}
              className="num"
              {...register("interval", { valueAsNumber: true })}
              {...aria}
            />
          )}
        </Field>
        <Field label="Frecuencia">
          {(aria) => (
            <Controller
              control={control}
              name="frequency"
              render={({ field }) => (
                <Select
                  value={field.value}
                  onValueChange={field.onChange}
                  options={FREQUENCIES.map((value) => ({ value, label: FREQUENCY_LABELS[value] }))}
                  {...aria}
                />
              )}
            />
          )}
        </Field>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Primer cargo" hint="Marca el día en que se repite.">
          {(aria) => (
            <Controller
              control={control}
              name="anchorDate"
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
        <Field label="Termina" hint="Opcional.">
          {(aria) => (
            <Controller
              control={control}
              name="endDate"
              render={({ field }) => (
                <div className="flex items-center gap-2">
                  <DatePicker value={field.value ?? today} onChange={field.onChange} today={today}>
                    <Chip id={aria.id} className="h-11 min-w-0 flex-1 justify-start">
                      {field.value === null ? "Sin fin" : formatShortDate(field.value)}
                    </Chip>
                  </DatePicker>
                  {field.value !== null && (
                    <Button variant="ghost" onClick={() => field.onChange(null)}>
                      Quitar
                    </Button>
                  )}
                </div>
              )}
            />
          )}
        </Field>
      </div>

      <Field label="Avisar con antelación (días)" error={errors.leadDays?.message}>
        {(aria) => (
          <Input
            type="number"
            inputMode="numeric"
            min={0}
            max={60}
            className="num"
            {...register("leadDays", { valueAsNumber: true })}
            {...aria}
          />
        )}
      </Field>

      <div className="divide-y divide-border rounded-[12px] border border-border">
        <Controller
          control={control}
          name="isSubscription"
          render={({ field }) => (
            <div className="flex items-center gap-3 p-3">
              <div className="min-w-0 flex-1">
                <div className="text-body text-fg">Es una suscripción</div>
                <div className="text-caption text-fg-2">
                  Suma en el total mensual de suscripciones.
                </div>
              </div>
              <Switch
                checked={field.value}
                onCheckedChange={field.onChange}
                label="Es una suscripción"
              />
            </div>
          )}
        />
        <Controller
          control={control}
          name="active"
          render={({ field }) => (
            <div className="flex items-center gap-3 p-3">
              <div className="min-w-0 flex-1">
                <div className="text-body text-fg">Activo</div>
                <div className="text-caption text-fg-2">En pausa no genera cargos por aprobar.</div>
              </div>
              <Switch checked={field.value} onCheckedChange={field.onChange} label="Activo" />
            </div>
          )}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Button type="submit" variant="primary" size="lg" fullWidth>
          {recurrence ? "Guardar" : "Crear recurrente"}
        </Button>
        {recurrence && (
          <Button
            variant="danger"
            fullWidth
            leading={<Trash2 aria-hidden="true" size={16} strokeWidth={1.75} />}
            onClick={() => setConfirmDelete(true)}
          >
            Borrar
          </Button>
        )}
      </div>

      {recurrence && (
        <ConfirmDialog
          open={confirmDelete}
          onOpenChange={setConfirmDelete}
          tone="danger"
          title={`¿Borrar «${recurrence.name}»?`}
          description="Dejará de generar cargos. Los movimientos ya creados no se borran."
          confirmLabel="Borrar"
          onConfirm={() => {
            repo.deleteRecurrence(recurrence.id);
            toast("Recurrente borrado");
            onDone();
          }}
        />
      )}
    </form>
  );
};

const RecurrenceRow = ({
  recurrence,
  onEdit,
}: {
  readonly recurrence: Recurrence;
  readonly onEdit: () => void;
}) => {
  const { index } = useLedger();
  const repo = useRepo();
  const category =
    recurrence.categoryId === null ? undefined : index.byId.get(recurrence.categoryId);
  const emoji = recurrence.type === "transfer" ? TRANSFER_EMOJI : (category?.emoji ?? "🔁");

  return (
    <div
      className={cn("flex min-h-15 items-center gap-1 pr-2", !recurrence.active && "opacity-60")}
    >
      <button
        type="button"
        onClick={onEdit}
        className="flex min-w-0 flex-1 items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-chip"
      >
        <EmojiChip emoji={emoji} />
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate text-body text-fg">{recurrence.name}</span>
            {!recurrence.active && <Badge>En pausa</Badge>}
          </span>
          <span className="block truncate text-caption text-fg-2">
            {describeFrequency(recurrence.frequency, recurrence.interval)} · próximo{" "}
            {formatShortDate(recurrence.nextDueDate)}
          </span>
        </span>
        <RowAmount amount={recurrence.amount} kind={recurrence.type} />
      </button>
      <IconButton
        label={recurrence.active ? `Pausar ${recurrence.name}` : `Activar ${recurrence.name}`}
        size="sm"
        onClick={() => {
          repo.setRecurrenceActive(recurrence.id, !recurrence.active);
          toast(recurrence.active ? "En pausa" : "Activado");
        }}
      >
        {recurrence.active ? (
          <Pause aria-hidden="true" size={16} strokeWidth={1.75} />
        ) : (
          <Play aria-hidden="true" size={16} strokeWidth={1.75} />
        )}
      </IconButton>
    </div>
  );
};

export const RecurringTab = () => {
  const { recurrences } = useLedger();
  const [form, setForm] = useState<{ readonly recurrence: Recurrence | null } | null>(null);

  const sorted = [...recurrences].sort(
    (a, b) => Number(b.active) - Number(a.active) || a.nextDueDate.localeCompare(b.nextDueDate),
  );
  const subscriptions = sorted.filter((recurrence) => recurrence.isSubscription);
  const fixed = sorted.filter((recurrence) => !recurrence.isSubscription);
  const monthlyTotal = subscriptionsMonthlyTotal(recurrences);

  const section = (title: string, items: ReadonlyArray<Recurrence>, aside?: React.ReactNode) =>
    items.length > 0 && (
      <section className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-3 px-1">
          <h2 className="text-title text-fg">{title}</h2>
          {aside}
        </div>
        <Card padding="none" className="divide-y divide-border overflow-hidden">
          {items.map((recurrence) => (
            <RecurrenceRow
              key={recurrence.id}
              recurrence={recurrence}
              onEdit={() => setForm({ recurrence })}
            />
          ))}
        </Card>
      </section>
    );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button
          variant="secondary"
          leading={<Plus aria-hidden="true" size={16} strokeWidth={1.75} />}
          onClick={() => setForm({ recurrence: null })}
        >
          Nueva
        </Button>
      </div>

      {recurrences.length === 0 ? (
        <EmptyState
          icon="🔁"
          title="Automatiza lo que se repite"
          description="Alquiler, suscripciones o tu aportación mensual: MyPocket te los propondrá para aprobar con un toque."
          actions={
            <Button variant="primary" onClick={() => setForm({ recurrence: null })}>
              Nueva recurrencia
            </Button>
          }
        />
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-2">
          {section(
            "Suscripciones",
            subscriptions,
            <span className="text-caption text-fg-2">
              <Money value={monthlyTotal} className="font-semibold text-fg" /> al mes
            </span>,
          )}
          {section("Fijos", fixed)}
        </div>
      )}

      {subscriptions.length > 0 && (
        <p className="px-1 text-caption text-fg-2">
          El total mensual reparte las anuales entre 12 y convierte las semanales (× 52 / 12). Por
          ejemplo, una anual de {formatMoney(cents(12000), { whole: true })} cuenta como{" "}
          {formatMoney(
            monthlyEquivalent({ amount: cents(12000), frequency: "yearly", interval: 1 }),
            {
              whole: true,
            },
          )}{" "}
          al mes.
        </p>
      )}

      <BottomSheet
        open={form !== null}
        onOpenChange={(open) => {
          if (!open) setForm(null);
        }}
        title={form?.recurrence ? "Editar recurrente" : "Nuevo recurrente"}
      >
        {form && (
          <RecurrenceForm
            key={form.recurrence?.id ?? "new"}
            recurrence={form.recurrence}
            onDone={() => setForm(null)}
          />
        )}
      </BottomSheet>
    </div>
  );
};
