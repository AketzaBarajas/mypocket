import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { z } from "zod";

import { nextSortOrder, useAccounts, useLedger, useRepo } from "@/data";
import { ACCOUNT_TYPE_LABELS, defaultIsLiquid } from "@/domain/catalog";
import { formatLongDate, isIsoDate } from "@/domain/dates";
import { cents, ZERO_CENTS } from "@/domain/money";
import {
  type Account,
  ACCOUNT_TYPES,
  type Cents,
  type IsoDate,
  PALETTE_COLORS,
} from "@/domain/types";
import { ColorPicker } from "@/features/shared/ColorPicker";
import { useToday } from "@/features/shell/useToday";
import {
  BottomSheet,
  Button,
  Chip,
  DatePicker,
  Field,
  Input,
  MoneyInput,
  Select,
  Switch,
  toast,
} from "@/ui";

/* ───────────────────────── Crear o editar una cuenta ───────────────────────── */

const accountSchema = z.object({
  name: z.string().trim().min(1, "Ponle un nombre a la cuenta.").max(60),
  emoji: z.string().trim().min(1, "Elige un emoji.").max(16),
  color: z.enum(PALETTE_COLORS),
  type: z.enum(ACCOUNT_TYPES),
  openingBalance: z.number().int().min(0, "El saldo inicial no puede ser negativo."),
  openingDate: z.custom<IsoDate>((value) => typeof value === "string" && isIsoDate(value)),
  isLiquid: z.boolean(),
  includeInNetWorth: z.boolean(),
});
type AccountValues = z.infer<typeof accountSchema>;

const AccountForm = ({
  account,
  onDone,
}: {
  readonly account: Account | null;
  readonly onDone: () => void;
}) => {
  const { accounts } = useLedger();
  const repo = useRepo();
  const today = useToday();
  const {
    control,
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<AccountValues>({
    resolver: zodResolver(accountSchema),
    defaultValues: account
      ? {
          name: account.name,
          emoji: account.emoji,
          color: account.color,
          type: account.type,
          openingBalance: account.openingBalance,
          openingDate: account.openingDate,
          isLiquid: account.isLiquid,
          includeInNetWorth: account.includeInNetWorth,
        }
      : {
          name: "",
          emoji: "💳",
          color: "blue",
          type: "checking",
          openingBalance: 0,
          openingDate: today,
          isLiquid: true,
          includeInNetWorth: true,
        },
  });

  const save = handleSubmit((values) => {
    const input = { ...values, openingBalance: cents(values.openingBalance) };
    if (account) {
      repo.updateAccount(account.id, input);
      toast("Cuenta actualizada");
    } else {
      repo.createAccount(input, nextSortOrder(accounts));
      toast("Cuenta creada");
    }
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
            <Input maxLength={60} placeholder="Cuenta de ahorro" {...register("name")} {...aria} />
          )}
        </Field>
      </div>

      <Field label="Tipo">
        {(aria) => (
          <Controller
            control={control}
            name="type"
            render={({ field }) => (
              <Select
                value={field.value}
                onValueChange={(type) => {
                  field.onChange(type);
                  // El tipo propone si es líquida; se puede cambiar después.
                  setValue("isLiquid", defaultIsLiquid(type));
                }}
                options={ACCOUNT_TYPES.map((type) => ({
                  value: type,
                  label: ACCOUNT_TYPE_LABELS[type],
                }))}
                {...aria}
              />
            )}
          />
        )}
      </Field>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Saldo inicial" error={errors.openingBalance?.message}>
          {(aria) => (
            <Controller
              control={control}
              name="openingBalance"
              render={({ field }) => (
                <MoneyInput
                  value={cents(field.value)}
                  onValueChange={(value) => field.onChange(value ?? 0)}
                  onBlur={field.onBlur}
                  {...aria}
                />
              )}
            />
          )}
        </Field>
        <Field label="Fecha de apertura">
          {(aria) => (
            <Controller
              control={control}
              name="openingDate"
              render={({ field }) => (
                <DatePicker value={field.value} onChange={field.onChange} today={today} max={today}>
                  <Chip id={aria.id} className="h-11 justify-start">
                    {formatLongDate(field.value)}
                  </Chip>
                </DatePicker>
              )}
            />
          )}
        </Field>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-caption text-fg-2">Color</span>
        <Controller
          control={control}
          name="color"
          render={({ field }) => <ColorPicker value={field.value} onChange={field.onChange} />}
        />
      </div>

      <div className="divide-y divide-border rounded-[12px] border border-border">
        <Controller
          control={control}
          name="isLiquid"
          render={({ field }) => (
            <div className="flex items-center gap-3 p-3">
              <div className="min-w-0 flex-1">
                <div className="text-body text-fg">Dinero disponible</div>
                <div className="text-caption text-fg-2">Cuenta para el colchón de emergencia.</div>
              </div>
              <Switch
                checked={field.value}
                onCheckedChange={field.onChange}
                label="Dinero disponible"
              />
            </div>
          )}
        />
        <Controller
          control={control}
          name="includeInNetWorth"
          render={({ field }) => (
            <div className="flex items-center gap-3 p-3">
              <div className="min-w-0 flex-1">
                <div className="text-body text-fg">Incluir en el patrimonio</div>
                <div className="text-caption text-fg-2">Su saldo suma en el patrimonio neto.</div>
              </div>
              <Switch
                checked={field.value}
                onCheckedChange={field.onChange}
                label="Incluir en el patrimonio"
              />
            </div>
          )}
        />
      </div>

      <Button type="submit" variant="primary" size="lg" fullWidth>
        {account ? "Guardar" : "Crear cuenta"}
      </Button>
    </form>
  );
};

export const AccountFormSheet = ({
  open,
  onOpenChange,
  account,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** Cuenta a editar, o `null` para crear una nueva. */
  readonly account: Account | null;
}) => (
  <BottomSheet
    open={open}
    onOpenChange={onOpenChange}
    title={account ? "Editar cuenta" : "Nueva cuenta"}
  >
    <AccountForm account={account} onDone={() => onOpenChange(false)} />
  </BottomSheet>
);

/* ───────────────────────── Actualizar valor (inversión) ───────────────────────── */

const ValuationForm = ({
  account,
  currentValue,
  onDone,
}: {
  readonly account: Account;
  readonly currentValue: Cents;
  readonly onDone: () => void;
}) => {
  const repo = useRepo();
  const today = useToday();
  const [value, setValue] = useState<Cents | null>(currentValue);
  const [date, setDate] = useState<IsoDate>(today);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | undefined>(undefined);

  const save = () => {
    if (value === null || value < 0) {
      setError("Escribe el valor actual de la cuenta.");
      return;
    }
    repo.addValuation(account.id, date, value, note);
    toast("Valor actualizado");
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
      <Field label="Valor actual" error={error} hint="Lo que marca hoy tu bróker o gestora.">
        {(aria) => (
          <MoneyInput
            value={value}
            onValueChange={(next) => {
              setValue(next);
              setError(undefined);
            }}
            autoFocus
            {...aria}
          />
        )}
      </Field>
      <Field label="Fecha">
        {(aria) => (
          <DatePicker value={date} onChange={setDate} today={today} max={today}>
            <Chip id={aria.id} className="h-11 justify-start">
              {formatLongDate(date)}
            </Chip>
          </DatePicker>
        )}
      </Field>
      <Field label="Nota">
        {(aria) => (
          <Input
            value={note}
            maxLength={300}
            placeholder="Opcional"
            onChange={(event) => setNote(event.currentTarget.value)}
            {...aria}
          />
        )}
      </Field>
      <Button type="submit" variant="primary" size="lg" fullWidth>
        Guardar valor
      </Button>
    </form>
  );
};

export const ValuationSheet = ({
  open,
  onOpenChange,
  account,
  currentValue,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly account: Account;
  readonly currentValue: Cents;
}) => (
  <BottomSheet
    open={open}
    onOpenChange={onOpenChange}
    title="Actualizar valor"
    description={`${account.emoji} ${account.name}. Crea una valoración nueva; no modifica los movimientos.`}
    size="sm"
  >
    <ValuationForm
      account={account}
      currentValue={currentValue}
      onDone={() => onOpenChange(false)}
    />
  </BottomSheet>
);

/* ───────────────────────── Registrar cobro (por cobrar) ───────────────────────── */

const collectSchema = z.object({
  amount: z.number().int().positive("Escribe un importe mayor que cero."),
  toAccountId: z.string().min(1, "Elige la cuenta donde lo has cobrado."),
});

const CollectForm = ({
  account,
  balance,
  onDone,
}: {
  readonly account: Account;
  readonly balance: Cents;
  readonly onDone: () => void;
}) => {
  const repo = useRepo();
  const today = useToday();
  const { settings } = useLedger();
  const destinations = useAccounts().filter(
    (item) => item.id !== account.id && item.type !== "receivable" && item.type !== "investment",
  );
  const [date, setDate] = useState<IsoDate>(today);
  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<z.infer<typeof collectSchema>>({
    resolver: zodResolver(collectSchema),
    defaultValues: {
      amount: Math.max(0, balance),
      toAccountId:
        destinations.find((item) => item.id === settings.defaultAccountId)?.id ??
        destinations[0]?.id ??
        "",
    },
  });
  const amount = useWatch({ control, name: "amount" });

  const save = handleSubmit((values) => {
    // Un cobro es una transferencia desde «por cobrar» a la cuenta donde entra el dinero.
    repo.createTransaction({
      type: "transfer",
      status: "confirmed",
      date,
      amount: cents(values.amount),
      accountId: account.id,
      toAccountId: values.toAccountId,
      categoryId: null,
      concept: "Cobro",
      notes: null,
      originalAmount: null,
      originalCurrency: null,
      goalId: null,
    });
    toast("Cobro registrado");
    onDone();
  });

  return (
    <form noValidate onSubmit={(event) => void save(event)} className="flex flex-col gap-4 pt-2">
      <Field label="Importe cobrado" error={errors.amount?.message}>
        {(aria) => (
          <Controller
            control={control}
            name="amount"
            render={({ field }) => (
              <MoneyInput
                value={cents(Number.isFinite(field.value) ? field.value : 0)}
                onValueChange={(value) => field.onChange(value ?? ZERO_CENTS)}
                onBlur={field.onBlur}
                autoFocus
                {...aria}
              />
            )}
          />
        )}
      </Field>
      <Field label="Cobrado en" error={errors.toAccountId?.message}>
        {(aria) => (
          <Controller
            control={control}
            name="toAccountId"
            render={({ field }) => (
              <Select
                value={field.value === "" ? null : field.value}
                onValueChange={field.onChange}
                options={destinations.map((item) => ({
                  value: item.id,
                  label: item.name,
                  emoji: item.emoji,
                }))}
                {...aria}
              />
            )}
          />
        )}
      </Field>
      <Field label="Fecha">
        {(aria) => (
          <DatePicker value={date} onChange={setDate} today={today} max={today}>
            <Chip id={aria.id} className="h-11 justify-start">
              {formatLongDate(date)}
            </Chip>
          </DatePicker>
        )}
      </Field>
      <Button type="submit" variant="primary" size="lg" fullWidth disabled={amount <= 0}>
        Registrar cobro
      </Button>
    </form>
  );
};

export const CollectSheet = ({
  open,
  onOpenChange,
  account,
  balance,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly account: Account;
  readonly balance: Cents;
}) => (
  <BottomSheet
    open={open}
    onOpenChange={onOpenChange}
    title="Registrar cobro"
    description="Mueve el dinero de lo que te deben a la cuenta donde lo has recibido."
    size="sm"
  >
    <CollectForm account={account} balance={balance} onDone={() => onOpenChange(false)} />
  </BottomSheet>
);
