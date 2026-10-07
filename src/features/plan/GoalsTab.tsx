import { zodResolver } from "@hookform/resolvers/zod";
import { Archive, Pencil, Plus, Trash2 } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";

import { useLedger, useRepo } from "@/data";
import { formatShortDate, isIsoDate } from "@/domain/dates";
import { type GoalProgress, goalProgress } from "@/domain/goals";
import { cents, formatMoney, formatPercent } from "@/domain/money";
import { type Goal, type IsoDate, PALETTE_COLORS } from "@/domain/types";
import { ColorDot, ColorPicker } from "@/features/shared/ColorPicker";
import { useToday } from "@/features/shell/useToday";
import {
  Badge,
  BottomSheet,
  Button,
  Card,
  Chip,
  ConfirmDialog,
  DatePicker,
  EmojiChip,
  EmptyState,
  Field,
  IconButton,
  Input,
  Money,
  MoneyInput,
  Notice,
  ProgressBar,
  RowAmount,
  toast,
} from "@/ui";

const goalSchema = z.object({
  name: z.string().trim().min(1, "Ponle un nombre a la meta.").max(60),
  emoji: z.string().trim().min(1, "Elige un emoji.").max(16),
  color: z.enum(PALETTE_COLORS),
  targetAmount: z
    .number({ error: "Escribe cuánto quieres reunir." })
    .int()
    .positive("Escribe cuánto quieres reunir."),
  targetDate: z
    .custom<IsoDate>((value) => typeof value === "string" && isIsoDate(value))
    .nullable(),
});
type GoalValues = z.infer<typeof goalSchema>;

const GoalForm = ({
  goal,
  onDone,
}: {
  readonly goal: Goal | null;
  readonly onDone: () => void;
}) => {
  const repo = useRepo();
  const today = useToday();
  const {
    control,
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<GoalValues>({
    resolver: zodResolver(goalSchema),
    defaultValues: goal
      ? {
          name: goal.name,
          emoji: goal.emoji,
          color: goal.color,
          targetAmount: goal.targetAmount,
          targetDate: goal.targetDate,
        }
      : { name: "", emoji: "🎯", color: "teal", targetDate: null },
  });

  const save = handleSubmit((values) => {
    const input = { ...values, targetAmount: cents(values.targetAmount) };
    if (goal) repo.updateGoal(goal.id, input);
    else repo.createGoal(input);
    toast(goal ? "Meta actualizada" : "Meta creada");
    onDone();
  });

  return (
    <form noValidate onSubmit={(event) => void save(event)} className="flex flex-col gap-4 pt-2">
      <div className="grid grid-cols-[4.5rem_1fr] gap-3">
        <Field label="Emoji" error={errors.emoji?.message}>
          {(aria) => (
            <Input className="text-center" maxLength={16} {...register("emoji")} {...aria} />
          )}
        </Field>
        <Field label="Nombre" error={errors.name?.message}>
          {(aria) => (
            <Input
              maxLength={60}
              placeholder="Fondo de emergencia"
              {...register("name")}
              {...aria}
            />
          )}
        </Field>
      </div>
      <Field label="Objetivo" error={errors.targetAmount?.message}>
        {(aria) => (
          <Controller
            control={control}
            name="targetAmount"
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
      <Field
        label="Fecha objetivo"
        hint="Opcional. Con fecha, verás cuánto necesitas aportar al mes."
      >
        {(aria) => (
          <Controller
            control={control}
            name="targetDate"
            render={({ field }) => (
              <div className="flex items-center gap-2">
                <DatePicker
                  value={field.value ?? today}
                  onChange={field.onChange}
                  today={today}
                  min={today}
                >
                  <Chip id={aria.id} className="h-11 flex-1 justify-start">
                    {field.value === null ? "Sin fecha" : formatShortDate(field.value)}
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
      <div className="flex flex-col gap-1.5">
        <span className="text-caption text-fg-2">Color</span>
        <Controller
          control={control}
          name="color"
          render={({ field }) => <ColorPicker value={field.value} onChange={field.onChange} />}
        />
      </div>
      <Button type="submit" variant="primary" size="lg" fullWidth>
        {goal ? "Guardar" : "Crear meta"}
      </Button>
    </form>
  );
};

const GoalCard = ({
  progress,
  onOpen,
}: {
  readonly progress: GoalProgress;
  readonly onOpen: () => void;
}) => {
  const { goal } = progress;
  return (
    <Card asChild interactive>
      <button type="button" onClick={onOpen} className="flex w-full min-w-0 flex-col gap-3">
        <span className="flex min-w-0 items-center gap-3">
          <EmojiChip emoji={goal.emoji} />
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2 text-body text-fg">
              <span className="truncate">{goal.name}</span>
              <ColorDot color={goal.color} />
            </span>
            <span className="block truncate text-caption text-fg-2">
              {goal.targetDate === null
                ? "Sin fecha objetivo"
                : `Para el ${formatShortDate(goal.targetDate)}`}
            </span>
          </span>
          {goal.status === "achieved" ? (
            <Badge tone="accent">Conseguida</Badge>
          ) : (
            <span className="shrink-0 num text-title text-fg">
              {formatPercent(Math.max(0, progress.ratio))}
            </span>
          )}
        </span>
        <ProgressBar
          value={progress.ratio}
          state="ok"
          label={`${goal.name}: ${formatMoney(progress.progress)} de ${formatMoney(goal.targetAmount)}`}
        />
        <span className="flex items-baseline justify-between gap-3">
          <span className="num text-caption text-fg-2">
            {formatMoney(progress.progress)} de {formatMoney(goal.targetAmount)}
          </span>
          {progress.monthlyNeeded !== null && (
            <span className="shrink-0 num text-caption text-fg">
              necesitas {formatMoney(progress.monthlyNeeded, { whole: true })}/mes
            </span>
          )}
        </span>
      </button>
    </Card>
  );
};

/** Celebración sutil al alcanzar una meta: el emoji entra con un pequeño rebote. */
const Celebration = ({ emoji }: { readonly emoji: string }) => {
  const reduceMotion = useReducedMotion();
  return (
    <motion.span
      aria-hidden="true"
      className="inline-block text-[28px]"
      initial={reduceMotion ? false : { scale: 0.6, rotate: -12, opacity: 0 }}
      animate={{ scale: 1, rotate: 0, opacity: 1 }}
      transition={{ type: "spring", stiffness: 320, damping: 16 }}
    >
      {emoji}
    </motion.span>
  );
};

const GoalDetail = ({
  progress,
  onEdit,
  onClose,
}: {
  readonly progress: GoalProgress;
  readonly onEdit: () => void;
  readonly onClose: () => void;
}) => {
  const { accountById } = useLedger();
  const repo = useRepo();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { goal } = progress;

  return (
    <div className="flex flex-col gap-4 pt-2">
      <div className="flex items-center gap-3">
        <EmojiChip emoji={goal.emoji} size="lg" />
        <div className="min-w-0 flex-1">
          <Money value={progress.progress} className="text-h2 text-fg" />
          <div className="num text-caption text-fg-2">
            de {formatMoney(goal.targetAmount)} · {formatPercent(Math.max(0, progress.ratio))}
          </div>
        </div>
        <IconButton label="Editar meta" variant="secondary" onClick={onEdit}>
          <Pencil aria-hidden="true" size={16} strokeWidth={1.75} />
        </IconButton>
      </div>
      <ProgressBar value={progress.ratio} state="ok" label={`Progreso de ${goal.name}`} />

      {progress.reached && goal.status === "active" && (
        <Notice
          tone="accent"
          icon={<Celebration emoji="🎉" />}
          action={
            <Button
              size="sm"
              variant="primary"
              onClick={() => {
                repo.setGoalStatus(goal.id, "achieved");
                toast(`Meta conseguida: ${goal.name}`);
              }}
            >
              Marcar conseguida
            </Button>
          }
        >
          Has alcanzado esta meta.
        </Notice>
      )}

      <section className="flex flex-col gap-2">
        <h3 className="text-caption text-fg-2">Aportaciones</h3>
        {progress.contributions.length === 0 ? (
          <p className="text-body text-fg-2">
            Para aportar, haz una transferencia a una cuenta de ahorro o inversión y elige esta meta
            en «Más».
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-[12px] border border-border">
            {progress.contributions.map(({ transaction, amount }) => (
              <li key={transaction.id} className="flex min-h-12 items-center gap-3 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="num text-body text-fg">{formatShortDate(transaction.date)}</div>
                  <div className="truncate text-caption text-fg-2">
                    {accountById.get(transaction.accountId)?.name ?? "Cuenta"} →{" "}
                    {accountById.get(transaction.toAccountId ?? "")?.name ?? "Cuenta"}
                  </div>
                </div>
                <RowAmount
                  amount={cents(Math.abs(amount))}
                  kind={amount >= 0 ? "income" : "expense"}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="flex gap-2">
        {goal.status !== "archived" ? (
          <Button
            variant="ghost"
            className="flex-1"
            leading={<Archive aria-hidden="true" size={16} strokeWidth={1.75} />}
            onClick={() => {
              repo.setGoalStatus(goal.id, "archived");
              toast("Meta archivada");
              onClose();
            }}
          >
            Archivar
          </Button>
        ) : (
          <Button
            variant="ghost"
            className="flex-1"
            onClick={() => {
              repo.setGoalStatus(goal.id, "active");
              toast("Meta reactivada");
            }}
          >
            Reactivar
          </Button>
        )}
        <Button
          variant="danger"
          className="flex-1"
          leading={<Trash2 aria-hidden="true" size={16} strokeWidth={1.75} />}
          onClick={() => setConfirmDelete(true)}
        >
          Borrar
        </Button>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        tone="danger"
        title="¿Borrar esta meta?"
        description="Las transferencias que aportaron a ella no se borran."
        confirmLabel="Borrar meta"
        onConfirm={() => {
          repo.deleteGoal(goal.id);
          toast("Meta borrada");
          onClose();
        }}
      />
    </div>
  );
};

export const GoalsTab = () => {
  const ledger = useLedger();
  const today = useToday();
  const [openId, setOpenId] = useState<string | null>(null);
  const [form, setForm] = useState<{ readonly goal: Goal | null } | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const all = useMemo(
    () =>
      ledger.goals.map((goal) => goalProgress(goal, ledger.transactions, ledger.accounts, today)),
    [ledger.goals, ledger.transactions, ledger.accounts, today],
  );
  const visible = all.filter((item) => item.goal.status !== "archived");
  const archived = all.filter((item) => item.goal.status === "archived");
  const open = all.find((item) => item.goal.id === openId);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button
          variant="secondary"
          leading={<Plus aria-hidden="true" size={16} strokeWidth={1.75} />}
          onClick={() => setForm({ goal: null })}
        >
          Nueva meta
        </Button>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon="🎯"
          title="Ponle nombre a lo que ahorras"
          description="Crea una meta y asígnale tus transferencias a ahorro o inversión."
          actions={
            <Button variant="primary" onClick={() => setForm({ goal: null })}>
              Nueva meta
            </Button>
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {visible.map((progress) => (
            <GoalCard
              key={progress.goal.id}
              progress={progress}
              onOpen={() => setOpenId(progress.goal.id)}
            />
          ))}
        </div>
      )}

      {archived.length > 0 && (
        <section className="flex flex-col gap-3">
          <Button
            variant="ghost"
            className="self-start"
            aria-expanded={showArchived}
            onClick={() => setShowArchived((current) => !current)}
          >
            {showArchived ? "Ocultar archivadas" : `Ver archivadas (${archived.length})`}
          </Button>
          {showArchived && (
            <div className="grid gap-3 sm:grid-cols-2">
              {archived.map((progress) => (
                <GoalCard
                  key={progress.goal.id}
                  progress={progress}
                  onOpen={() => setOpenId(progress.goal.id)}
                />
              ))}
            </div>
          )}
        </section>
      )}

      <BottomSheet
        open={open !== undefined && form === null}
        onOpenChange={(next) => {
          if (!next) setOpenId(null);
        }}
        title={open?.goal.name ?? "Meta"}
      >
        {open && (
          <GoalDetail
            progress={open}
            onEdit={() => setForm({ goal: open.goal })}
            onClose={() => setOpenId(null)}
          />
        )}
      </BottomSheet>

      <BottomSheet
        open={form !== null}
        onOpenChange={(next) => {
          if (!next) setForm(null);
        }}
        title={form?.goal ? "Editar meta" : "Nueva meta"}
      >
        {form && <GoalForm goal={form.goal} onDone={() => setForm(null)} />}
      </BottomSheet>
    </div>
  );
};
