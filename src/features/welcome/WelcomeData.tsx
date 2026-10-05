import { Calendar, Cloud, FileUp, Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import { nextSortOrder, seedAccountId, useLedger, useRepo } from "@/data";
import {
  ACCOUNT_TYPE_LABELS,
  defaultIsLiquid,
  SEED_ACCOUNTS,
  SEED_CATEGORIES,
  type SeedAccount,
} from "@/domain/catalog";
import { formatShortDate } from "@/domain/dates";
import { GROUP_LABELS } from "@/domain/groups";
import { ZERO_CENTS } from "@/domain/money";
import { ACCOUNT_TYPES, type AccountType, type Cents, type IsoDate } from "@/domain/types";
import { useToday } from "@/features/shell/useToday";
import {
  Button,
  Card,
  Chip,
  DatePicker,
  EmojiChip,
  IconButton,
  Input,
  MoneyInput,
  Notice,
  Select,
} from "@/ui";

/* ───────────────────────── Paso 5: cuentas ───────────────────────── */

interface AccountDraftRow {
  readonly id: string;
  readonly seed: SeedAccount | null;
  readonly name: string;
  readonly emoji: string;
  readonly type: AccountType;
  readonly balance: Cents;
  readonly date: IsoDate;
}

const TYPE_EMOJI: Record<AccountType, string> = {
  checking: "💳",
  prepaid: "🪪",
  cash: "💶",
  savings: "🏦",
  investment: "📈",
  receivable: "🤝",
};

export const AccountsStep = ({ onNext }: { readonly onNext: () => void }) => {
  const { accountById, accounts } = useLedger();
  const repo = useRepo();
  const today = useToday();

  // Si la bienvenida se retoma tras recargar, parte de lo que ya se guardó.
  const [rows, setRows] = useState<ReadonlyArray<AccountDraftRow>>(() =>
    SEED_ACCOUNTS.map((seed) => {
      const existing = accountById.get(seedAccountId(seed.key));
      return {
        id: seed.key,
        seed,
        name: seed.name,
        emoji: seed.emoji,
        type: seed.type,
        balance: existing?.openingBalance ?? ZERO_CENTS,
        date: existing?.openingDate ?? today,
      };
    }),
  );
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<AccountType>("checking");

  const patch = (id: string, changes: Partial<AccountDraftRow>) => {
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...changes } : row)));
  };

  const addAccount = () => {
    const name = newName.trim();
    if (name === "") return;
    setRows((current) => [
      ...current,
      {
        id: `custom-${current.length}-${name}`,
        seed: null,
        name,
        emoji: TYPE_EMOJI[newType],
        type: newType,
        balance: ZERO_CENTS,
        date: today,
      },
    ]);
    setNewName("");
    setAdding(false);
  };

  const save = () => {
    repo.seedAccounts(
      rows.flatMap((row) =>
        row.seed === null
          ? []
          : [{ ...row.seed, openingBalance: row.balance, openingDate: row.date }],
      ),
    );
    let sortOrder = Math.max(nextSortOrder(accounts), SEED_ACCOUNTS.length);
    for (const row of rows) {
      if (row.seed !== null) continue;
      repo.createAccount(
        {
          name: row.name,
          emoji: row.emoji,
          color: "slate",
          type: row.type,
          openingBalance: row.balance,
          openingDate: row.date,
          isLiquid: defaultIsLiquid(row.type),
          includeInNetWorth: true,
        },
        sortOrder,
      );
      sortOrder += 1;
    }
    onNext();
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-h1 text-fg">Tus cuentas</h1>
        <p className="mt-2 text-body text-fg-2">
          Indica el saldo que tiene hoy cada una. Podrás cambiarlo después en Cuentas.
        </p>
      </div>

      <ul className="flex flex-col gap-2">
        {rows.map((row) => (
          <li key={row.id}>
            <Card padding="sm" className="flex flex-col gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <EmojiChip emoji={row.emoji} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-body text-fg">{row.name}</div>
                  <div className="truncate text-caption text-fg-2">
                    {ACCOUNT_TYPE_LABELS[row.type]}
                  </div>
                </div>
                {row.seed === null && (
                  <IconButton
                    label={`Quitar ${row.name}`}
                    size="sm"
                    onClick={() =>
                      setRows((current) => current.filter((item) => item.id !== row.id))
                    }
                  >
                    <Trash2 aria-hidden="true" size={16} strokeWidth={1.75} />
                  </IconButton>
                )}
              </div>
              <div className="flex items-center gap-2">
                <MoneyInput
                  aria-label={`Saldo inicial de ${row.name}`}
                  value={row.balance}
                  onValueChange={(value) => patch(row.id, { balance: value ?? ZERO_CENTS })}
                  className="min-w-0 flex-1"
                />
                <DatePicker
                  value={row.date}
                  today={today}
                  max={today}
                  align="end"
                  onChange={(date) => patch(row.id, { date })}
                >
                  <Chip
                    aria-label={`Fecha de apertura de ${row.name}: ${formatShortDate(row.date)}`}
                    className="h-11"
                    leading={<Calendar aria-hidden="true" size={14} strokeWidth={1.75} />}
                  >
                    {row.date === today ? "Hoy" : formatShortDate(row.date)}
                  </Chip>
                </DatePicker>
              </div>
            </Card>
          </li>
        ))}
      </ul>

      {adding ? (
        <Card padding="sm">
          <form
            className="flex flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              addAccount();
            }}
          >
            <label className="flex flex-col gap-1.5">
              <span className="text-caption text-fg-2">Nombre</span>
              <Input
                value={newName}
                onChange={(event) => setNewName(event.currentTarget.value)}
                maxLength={60}
                placeholder="Cuenta de ahorro"
                // El formulario aparece al pulsar «Añadir cuenta»: el foco continúa la acción.
                autoFocus
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-caption text-fg-2">Tipo</span>
              <Select
                ariaLabel="Tipo de cuenta"
                value={newType}
                onValueChange={setNewType}
                options={ACCOUNT_TYPES.map((type) => ({
                  value: type,
                  label: ACCOUNT_TYPE_LABELS[type],
                  emoji: TYPE_EMOJI[type],
                }))}
              />
            </label>
            <div className="flex gap-2">
              <Button
                type="submit"
                variant="secondary"
                className="flex-1"
                disabled={newName.trim() === ""}
              >
                Añadir
              </Button>
              <Button variant="ghost" className="flex-1" onClick={() => setAdding(false)}>
                Cancelar
              </Button>
            </div>
          </form>
        </Card>
      ) : (
        <Button
          variant="ghost"
          leading={<Plus aria-hidden="true" size={16} strokeWidth={1.75} />}
          onClick={() => setAdding(true)}
        >
          Añadir cuenta
        </Button>
      )}

      <Button variant="primary" size="lg" fullWidth onClick={save}>
        Continuar
      </Button>
    </div>
  );
};

/* ───────────────────────── Paso 6: categorías ───────────────────────── */

const CATEGORY_SECTIONS = [
  {
    title: `${GROUP_LABELS.needs.emoji} ${GROUP_LABELS.needs.name}`,
    items: SEED_CATEGORIES.filter((category) => category.budgetGroup === "needs"),
  },
  {
    title: `${GROUP_LABELS.wants.emoji} ${GROUP_LABELS.wants.name}`,
    items: SEED_CATEGORIES.filter((category) => category.budgetGroup === "wants"),
  },
  {
    title: "💰 Ingresos",
    items: SEED_CATEGORIES.filter((category) => category.kind === "income"),
  },
] as const;

export const CategoriesStep = ({ onNext }: { readonly onNext: () => void }) => {
  const repo = useRepo();
  const [reviewing, setReviewing] = useState(false);

  const save = () => {
    repo.seedCategories();
    onNext();
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-h1 text-fg">Categorías listas</h1>
        <p className="mt-2 text-body text-fg-2">
          Hemos preparado {SEED_CATEGORIES.length} categorías repartidas en necesidades, deseos e
          ingresos. Podrás editarlas en Ajustes.
        </p>
      </div>

      {reviewing ? (
        <div className="flex flex-col gap-4">
          {CATEGORY_SECTIONS.map((section) => (
            <section key={section.title} className="flex flex-col gap-2">
              <h2 className="text-title text-fg">{section.title}</h2>
              <Card padding="none">
                <ul>
                  {section.items.map((category, index) => (
                    <li
                      key={category.key}
                      className={
                        index === 0
                          ? "flex items-center gap-3 px-3 py-2.5"
                          : "flex items-center gap-3 border-t border-border px-3 py-2.5"
                      }
                    >
                      <EmojiChip emoji={category.emoji} size="sm" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-body text-fg">{category.name}</div>
                        {category.children.length > 0 && (
                          <div className="text-caption text-fg-2">
                            {category.children.join(" · ")}
                          </div>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </Card>
            </section>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {CATEGORY_SECTIONS.map((section) => (
            <Card key={section.title} padding="sm" className="flex flex-col gap-1">
              <span className="truncate text-caption text-fg-2">{section.title}</span>
              <span className="num text-h2 text-fg">{section.items.length}</span>
            </Card>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <Button variant="primary" size="lg" fullWidth onClick={save}>
          Continuar
        </Button>
        {!reviewing && (
          <Button variant="ghost" fullWidth onClick={() => setReviewing(true)}>
            Revisar el catálogo
          </Button>
        )}
      </div>
    </div>
  );
};

/* ───────────────────────── Paso 7: Google Drive ───────────────────────── */

export const DriveStep = ({
  available,
  onConnect,
  onSkip,
  busy,
}: {
  /** Hay un ID de cliente de Google configurado en esta compilación. */
  readonly available: boolean;
  readonly onConnect: () => void;
  readonly onSkip: () => void;
  readonly busy: boolean;
}) => (
  <div className="flex flex-col gap-6">
    <div>
      <h1 className="text-h1 text-fg">Copias en Google Drive</h1>
      <p className="mt-2 text-body text-fg-2">
        Opcional. La copia se cifra en este dispositivo con tu frase antes de subirse: Google solo
        guarda un archivo ilegible en una carpeta oculta de la app.
      </p>
    </div>
    <Notice icon={<Cloud size={18} strokeWidth={1.75} />}>
      En el navegador, Google no permite renovar el permiso en segundo plano, así que cada copia
      necesita un toque. MyPocket te avisará cuando la última tenga más de 7 días.
    </Notice>
    {!available && (
      <p className="text-caption text-fg-2">
        Esta compilación no tiene configurado el acceso a Google. Podrás activarlo más adelante
        siguiendo docs/SETUP.md.
      </p>
    )}
    <div className="flex flex-col gap-2">
      <Button
        variant="primary"
        size="lg"
        fullWidth
        disabled={!available}
        pending={busy}
        onClick={onConnect}
      >
        Conectar y hacer la primera copia
      </Button>
      <Button variant="ghost" fullWidth onClick={onSkip}>
        Ahora no
      </Button>
    </div>
  </div>
);

/* ───────────────────────── Paso 8: migrar desde Notion ───────────────────────── */

export const ImportStep = ({
  onImport,
  onFinish,
}: {
  readonly onImport: () => void;
  readonly onFinish: () => void;
}) => (
  <div className="flex flex-col gap-6">
    <div>
      <h1 className="text-h1 text-fg">¿Traes datos de Notion?</h1>
      <p className="mt-2 text-body text-fg-2">
        Exporta cada base de datos de tu cuaderno como CSV e impórtalas con el asistente. Podrás
        revisar cada fila y deshacer el lote entero.
      </p>
    </div>
    <div className="flex flex-col gap-2">
      <Button variant="primary" size="lg" fullWidth onClick={onFinish}>
        Ir a Inicio
      </Button>
      <Button
        variant="secondary"
        fullWidth
        leading={<FileUp aria-hidden="true" size={16} strokeWidth={1.75} />}
        onClick={onImport}
      >
        Importar desde Notion
      </Button>
    </div>
  </div>
);
