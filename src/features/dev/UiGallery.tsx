import { Check, Cloud, Pencil, Plus, Search, SkipForward, Trash2 } from "lucide-react";
import { useState, type ReactNode } from "react";

import { addDaysIso, addMonthsYm, formatShortDate, monthOf, todayFrom } from "@/domain/dates";
import { cents } from "@/domain/money";
import type { Cents, IsoDate } from "@/domain/types";
import { sideItems, tabItems } from "@/features/shell/nav";
import {
  AnimatedNumber,
  applyKeypadKey,
  Badge,
  BottomSheet,
  Button,
  Card,
  Checkbox,
  Chip,
  Combobox,
  ConfirmDialog,
  DatePicker,
  EmojiChip,
  EmptyState,
  Fab,
  Field,
  getStoredTheme,
  HeroCard,
  IconButton,
  Input,
  Logo,
  Menu,
  Money,
  MoneyInput,
  Notice,
  NumericKeypad,
  PageHeader,
  PendingRow,
  ProgressBar,
  Rail,
  SegmentedControl,
  Select,
  setTheme,
  Sidebar,
  Skeleton,
  SkeletonGroup,
  StatTile,
  SwipeRow,
  Switch,
  TabBar,
  Textarea,
  THEME_PREFERENCES,
  Tip,
  toast,
  TransactionRow,
  type ThemePreference,
} from "@/ui";
import {
  AreaLineChart,
  BarCompare,
  CashflowBars,
  CashflowLegend,
  HBarList,
  Sparkline,
} from "@/ui/charts";

const THEME_LABELS: Record<ThemePreference, string> = {
  system: "Sistema",
  light: "Claro",
  dark: "Oscuro",
};

/** Pinta el mismo contenido en oscuro y en claro, lado a lado. */
const Both = ({ children }: { readonly children: ReactNode }) => (
  <div className="grid gap-3 lg:grid-cols-2">
    {(["dark", "light"] as const).map((theme) => (
      <div
        key={theme}
        data-theme={theme}
        className="min-w-0 rounded-hero border border-border bg-bg p-4 text-fg"
      >
        <div className="mb-3 text-micro text-fg-2 uppercase">{THEME_LABELS[theme]}</div>
        {children}
      </div>
    ))}
  </div>
);

const Section = ({ title, children }: { readonly title: string; readonly children: ReactNode }) => (
  <section className="flex flex-col gap-3">
    <h2 className="text-h2">{title}</h2>
    {children}
  </section>
);

const Row = ({ children }: { readonly children: ReactNode }) => (
  <div className="flex flex-wrap items-center gap-2">{children}</div>
);

const CATEGORY_OPTIONS = [
  { value: "super", label: "Supermercado", emoji: "🛒", hint: "Alimentación" },
  { value: "rest", label: "Restaurantes", emoji: "🍜", hint: "Restaurantes" },
  { value: "cafe", label: "Cafeterías", emoji: "☕", hint: "Restaurantes" },
  { value: "bus", label: "Transporte público", emoji: "🚇", hint: "Transporte" },
  { value: "gym", label: "Gimnasio", emoji: "🏋️", hint: "Deporte" },
];

const Controls = () => {
  const [segment, setSegment] = useState<"gasto" | "ingreso" | "transferir">("gasto");
  const [amount, setAmount] = useState<Cents | null>(cents(1250));
  const [keypad, setKeypad] = useState("12,5");
  const [account, setAccount] = useState<string | null>("bbva");
  const [category, setCategory] = useState<ReadonlyArray<string>>(["super"]);
  const [checked, setChecked] = useState(true);
  const today = todayFrom(new Date());
  const [date, setDate] = useState<IsoDate>(today);

  return (
    <div className="flex flex-col gap-4">
      <SegmentedControl
        ariaLabel="Tipo de movimiento"
        value={segment}
        onValueChange={setSegment}
        options={[
          { value: "gasto", label: "Gasto" },
          { value: "ingreso", label: "Ingreso" },
          { value: "transferir", label: "Transferir" },
        ]}
      />
      <Row>
        <Chip leading={<span aria-hidden="true">💳</span>}>BBVA débito</Chip>
        <DatePicker value={date} onChange={setDate} today={today}>
          <Chip>{date === today ? "Hoy" : formatShortDate(date)}</Chip>
        </DatePicker>
        <Chip selected>Pendientes</Chip>
        <Chip leading={<Plus aria-hidden="true" size={14} strokeWidth={1.75} />}>Más</Chip>
        <Badge>Pendiente</Badge>
        <Badge tone="warning">Vencido</Badge>
        <Badge tone="accent">regla: 🛒</Badge>
        <EmojiChip emoji="🛒" size="sm" />
        <EmojiChip emoji="🍜" />
        <EmojiChip emoji="✈️" size="lg" />
      </Row>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Concepto" hint="Las reglas se aplican sobre este texto.">
          {(control) => <Input placeholder="Mercadona" {...control} />}
        </Field>
        <Field
          label="Importe"
          error={amount === null ? "Escribe un importe mayor que cero." : undefined}
        >
          {(control) => <MoneyInput value={amount} onValueChange={setAmount} {...control} />}
        </Field>
        <Field label="Cuenta">
          {(control) => (
            <Select
              value={account}
              onValueChange={setAccount}
              options={[
                { value: "bbva", label: "BBVA débito", emoji: "💳" },
                { value: "cash", label: "Efectivo", emoji: "💶" },
                { value: "tr", label: "Trade Republic", emoji: "📈" },
              ]}
              {...control}
            />
          )}
        </Field>
        <Field label="Buscar">
          {(control) => (
            <Input
              type="search"
              placeholder="Concepto, #etiqueta o >50"
              leading={<Search aria-hidden="true" size={16} strokeWidth={1.75} />}
              {...control}
            />
          )}
        </Field>
        <Field label="Notas" className="sm:col-span-2">
          {(control) => <Textarea placeholder="Opcional" {...control} />}
        </Field>
      </div>
      <div className="flex items-center gap-3">
        <Switch checked={checked} onCheckedChange={setChecked} label="Incluir en el patrimonio" />
        <span className="text-body text-fg-2">Incluir en el patrimonio</span>
      </div>
      <div className="flex items-center gap-3">
        <Checkbox checked={checked} onCheckedChange={setChecked} label="Importar la fila" />
        <Checkbox checked="indeterminate" onCheckedChange={setChecked} label="Selección parcial" />
        <Checkbox checked={false} disabled onCheckedChange={setChecked} label="Fila con error" />
        <span className="text-body text-fg-2">Casilla: marcada, parcial y desactivada</span>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <div className="mb-3 text-center num text-display">{keypad === "" ? "0" : keypad} €</div>
          <NumericKeypad onKey={(key) => setKeypad((current) => applyKeypadKey(current, key))} />
        </div>
        <Card padding="sm" className="flex h-72 flex-col">
          <Combobox
            ariaLabel="Buscar categoría"
            placeholder="Buscar categoría"
            options={CATEGORY_OPTIONS}
            selected={category}
            onSelect={(value) => setCategory([value])}
            onCreate={(label) => toast(`Crear «${label}»`)}
          />
        </Card>
      </div>
    </div>
  );
};

const Overlays = () => {
  const [sheet, setSheet] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [danger, setDanger] = useState(false);
  return (
    <Row>
      <Button onClick={() => setSheet(true)}>Abrir hoja</Button>
      <Button onClick={() => setConfirm(true)}>Confirmación</Button>
      <Button variant="danger" onClick={() => setDanger(true)}>
        Doble confirmación
      </Button>
      <Button
        onClick={() =>
          toast({
            message: "Guardado",
            action: { label: "Deshacer", onClick: () => toast("Movimiento eliminado") },
          })
        }
      >
        Toast con acción
      </Button>
      <Button
        onClick={() =>
          toast({ message: "No se pudo leer el archivo. Comprueba que es un CSV.", tone: "danger" })
        }
      >
        Toast de error
      </Button>
      <Menu
        actions={[
          {
            label: "Editar",
            icon: <Pencil size={16} strokeWidth={1.75} />,
            onSelect: () => toast("Editar"),
          },
          {
            label: "Borrar",
            icon: <Trash2 size={16} strokeWidth={1.75} />,
            tone: "danger",
            onSelect: () => toast("Borrar"),
          },
        ]}
      >
        <Button>Menú</Button>
      </Menu>
      <Tip label="Atajo: N">
        <Button variant="ghost">Tooltip</Button>
      </Tip>
      <BottomSheet
        open={sheet}
        onOpenChange={setSheet}
        title="Actualizar valor"
        description="Crea una valoración nueva; no modifica los movimientos."
        footer={
          <Button variant="primary" size="lg" fullWidth onClick={() => setSheet(false)}>
            Guardar
          </Button>
        }
      >
        <div className="flex flex-col gap-3 pt-2">
          <Field label="Valor actual">
            {(control) => (
              <MoneyInput value={cents(1245000)} onValueChange={() => undefined} {...control} />
            )}
          </Field>
          <Field label="Nota">{(control) => <Input placeholder="Opcional" {...control} />}</Field>
        </div>
      </BottomSheet>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="¿Deshacer este lote?"
        description="Se borrarán los 42 movimientos importados. Puedes volver a importar el archivo."
        confirmLabel="Deshacer lote"
        onConfirm={() => toast("Lote deshecho")}
      />
      <ConfirmDialog
        open={danger}
        onOpenChange={setDanger}
        tone="danger"
        title="Borrar los datos de este dispositivo"
        description="Tus datos seguirán en el relay y en tus otros dispositivos. Para recuperarlos aquí necesitarás tu frase de 12 palabras."
        confirmLabel="Borrar datos"
        requireText="BORRAR"
        onConfirm={() => toast("Datos borrados")}
      />
    </Row>
  );
};

const useDemoSeries = () => {
  const today = todayFrom(new Date());
  const month = monthOf(today);
  const networth = Array.from({ length: 30 }, (_, index) => ({
    date: addDaysIso(today, index - 29),
    value: cents(2_380_000 + Math.round(Math.sin(index / 4) * 42_000) + index * 2_100),
  }));
  const cashflow = Array.from({ length: 12 }, (_, index) => ({
    month: addMonthsYm(month, index - 11),
    income: cents(245_000 + (index % 3) * 18_000),
    expense: cents(162_000 + ((index * 7) % 5) * 21_000),
  }));
  return { networth, cashflow };
};

const Charts = () => {
  const { networth, cashflow } = useDemoSeries();
  return (
    <div className="flex flex-col gap-4">
      <HeroCard>
        <div className="text-caption text-fg-2">Patrimonio neto</div>
        <AnimatedNumber value={cents(2_443_218)} dimFraction className="text-display" />
        <AreaLineChart
          data={networth}
          ariaLabel="Evolución del patrimonio neto en los últimos 30 días"
          height={180}
          className="mt-3"
        />
      </HeroCard>
      <Card>
        <div className="mb-2 flex items-center justify-between">
          <div className="text-title">Flujo de caja</div>
          <CashflowLegend />
        </div>
        <CashflowBars
          data={cashflow}
          ariaLabel="Ingresos y gastos de los últimos 12 meses"
          height={200}
        />
      </Card>
      <div className="grid gap-3 sm:grid-cols-2">
        <Card>
          <HBarList
            ariaLabel="Gasto por categoría"
            total={cents(98_000)}
            onSelect={(id) => toast(id)}
            items={[
              { id: "vivienda", emoji: "🏠", label: "Vivienda", value: cents(62_000) },
              { id: "alimentacion", emoji: "🛒", label: "Alimentación", value: cents(24_500) },
              { id: "restaurantes", emoji: "🍜", label: "Restaurantes", value: cents(11_500) },
            ]}
          />
        </Card>
        <Card>
          <BarCompare
            ariaLabel="Comparativa de gasto por categoría"
            currentLabel="Octubre"
            previousLabel="Septiembre"
            items={[
              {
                id: "alimentacion",
                emoji: "🛒",
                label: "Alimentación",
                current: cents(24_500),
                previous: cents(21_000),
                delta: "+16,7 %",
                trend: "up",
              },
              {
                id: "ocio",
                emoji: "🎟️",
                label: "Ocio",
                current: cents(6_000),
                previous: cents(11_000),
                delta: "−45,5 %",
                trend: "down",
              },
            ]}
          />
        </Card>
      </div>
      <Row>
        <Sparkline
          values={[3, 4, 3.6, 5, 5.4, 6.2, 6]}
          tone="accent"
          ariaLabel="Tendencia al alza"
        />
        <Sparkline values={[6, 5.5, 5.8, 5, 4.2, 4.4, 4]} tone="muted" />
        <Sparkline values={[6, 5.5, 5.8, 5, 4.2, 3.4, 3]} tone="danger" />
      </Row>
    </div>
  );
};

/** Galería interna del design system. Solo existe en desarrollo. */
export const UiGallery = () => {
  const [theme, setThemeState] = useState<ThemePreference>(getStoredTheme);
  const [number, setNumber] = useState(cents(48_250));

  return (
    <main className="mx-auto flex w-full max-w-[1280px] flex-col gap-10 overflow-x-clip px-safe pb-24 sm:px-6 lg:px-8">
      <PageHeader
        leading={<Logo size={36} />}
        eyebrow="Solo en desarrollo"
        title="Design system «Obsidian»"
        actions={
          <SegmentedControl
            ariaLabel="Tema de la página"
            size="sm"
            fullWidth={false}
            value={theme}
            onValueChange={(next) => {
              setThemeState(next);
              setTheme(next);
            }}
            options={THEME_PREFERENCES.map((value) => ({ value, label: THEME_LABELS[value] }))}
          />
        }
      />

      <Section title="Tipografía y cifras">
        <Both>
          <div className="flex flex-col gap-2">
            <Money value={cents(2_443_218)} dimFraction className="text-display" />
            <div className="text-h1">Hola, Ake</div>
            <div className="text-h2">Flujo de octubre</div>
            <div className="text-title">Por aprobar</div>
            <div className="text-body">Cuerpo 14/500 para el texto de la interfaz.</div>
            <div className="text-caption text-fg-2">Caption 12/500 · texto secundario</div>
            <div className="text-micro text-fg-2">Micro 11/500 · etiquetas</div>
            <div className="grid w-40 justify-items-end num text-body">
              <span>1.234,56 €</span>
              <span>12,00 €</span>
              <span>987.654,30 €</span>
            </div>
          </div>
        </Both>
      </Section>

      <Section title="Superficies">
        <Both>
          <div className="grid grid-cols-2 gap-3">
            <StatTile
              leading={<span aria-hidden="true">🏠</span>}
              label="Necesidades"
              trailing={<span className="num text-caption text-fg-2">62 %</span>}
              value={<Money value={cents(62_000)} />}
              hint="de 1.000,00 €"
            >
              <ProgressBar value={0.62} state="ok" marker={0.5} label="Necesidades: 62 %" />
            </StatTile>
            <StatTile
              tone="warning"
              leading={<span aria-hidden="true">🎟️</span>}
              label="Deseos"
              trailing={<span className="num text-caption text-warning">91 %</span>}
              value={<Money value={cents(54_600)} />}
              hint="de 600,00 €"
            >
              <ProgressBar value={0.91} state="warning" label="Deseos: 91 %" />
            </StatTile>
            <StatTile
              tone="danger"
              leading={<span aria-hidden="true">🍜</span>}
              label="Restaurantes"
              trailing={<span className="num text-caption text-danger">118 %</span>}
              value={<Money value={cents(17_700)} />}
              hint={<span className="text-danger">Te has pasado 27,00 €</span>}
            >
              <ProgressBar value={1.18} state="danger" label="Restaurantes: 118 %" />
            </StatTile>
            <Card tone="accent" className="flex flex-col gap-1">
              <span className="text-caption text-fg-2">Hoy puedes gastar</span>
              <AnimatedNumber value={number} className="text-h1 text-accent" />
              <span className="text-caption text-fg-2">quedan 482,50 € · 10 días</span>
              <Button
                size="sm"
                variant="ghost"
                className="mt-1 self-start"
                onClick={() => setNumber(cents(Math.round(Math.random() * 90_000)))}
              >
                Rodar cifra
              </Button>
            </Card>
          </div>
        </Both>
      </Section>

      <Section title="Botones">
        <Both>
          <div className="flex flex-col gap-3">
            <Row>
              <Button variant="primary" kbd="N">
                Nuevo movimiento
              </Button>
              <Button variant="secondary">Importar CSV</Button>
              <Button variant="ghost">Cancelar</Button>
              <Button variant="danger">Borrar</Button>
            </Row>
            <Row>
              <Button variant="primary" size="sm">
                Aprobar
              </Button>
              <Button size="sm">Omitir</Button>
              <Button variant="primary" disabled>
                Desactivado
              </Button>
              <Button variant="primary" pending>
                Guardando
              </Button>
              <IconButton label="Editar">
                <Pencil aria-hidden="true" size={18} strokeWidth={1.75} />
              </IconButton>
              <Fab label="Nuevo movimiento">
                <Plus aria-hidden="true" size={26} strokeWidth={2} />
              </Fab>
            </Row>
            <Button variant="primary" size="lg" fullWidth>
              Guardar
            </Button>
          </div>
        </Both>
      </Section>

      <Section title="Entradas">
        <Both>
          <Controls />
        </Both>
      </Section>

      <Section title="Datos">
        <Both>
          <Card padding="none" className="overflow-hidden">
            <SwipeRow
              leading={{
                label: "Editar",
                icon: <Pencil size={16} strokeWidth={1.75} />,
                tone: "neutral",
                onTrigger: () => toast("Editar"),
              }}
              trailing={{
                label: "Borrar",
                icon: <Trash2 size={16} strokeWidth={1.75} />,
                onTrigger: () => toast("Borrar"),
              }}
            >
              <TransactionRow
                emoji="🛒"
                title="Mercadona"
                subtitle="Supermercado · #semana · BBVA débito"
                amount={cents(4_385)}
                kind="expense"
              />
            </SwipeRow>
            <TransactionRow
              className="border-t border-border"
              emoji="💼"
              title="Nómina de octubre"
              subtitle="Nómina · BBVA débito"
              amount={cents(245_000)}
              kind="income"
            />
            <TransactionRow
              className="border-t border-border"
              emoji="📈"
              title="Aportación mensual"
              subtitle="BBVA débito → MyInvestor"
              amount={cents(30_000)}
              kind="transfer"
            />
            <TransactionRow
              className="border-t border-border"
              emoji="🎬"
              title="Netflix"
              subtitle="Streaming · BBVA débito"
              amount={cents(1_399)}
              kind="expense"
              status="overdue"
            />
            <SwipeRow
              className="border-t border-border"
              leading={{
                label: "Aprobar",
                icon: <Check size={16} strokeWidth={1.75} />,
                onTrigger: () => toast("Aprobado"),
              }}
              trailing={{
                label: "Omitir",
                icon: <SkipForward size={16} strokeWidth={1.75} />,
                tone: "neutral",
                onTrigger: () => toast("Omitido"),
              }}
            >
              <PendingRow
                emoji="🏠"
                name="Alquiler"
                when="en 2 días"
                account="BBVA débito"
                amount={cents(62_000)}
                kind="expense"
                onApprove={() => toast("Aprobado")}
                onSkip={() => toast("Omitido")}
              />
            </SwipeRow>
          </Card>
        </Both>
      </Section>

      <Section title="Feedback">
        <Both>
          <div className="flex flex-col gap-3">
            <Notice
              icon={<Cloud size={18} strokeWidth={1.75} />}
              action={
                <Button size="sm" variant="secondary">
                  Hacer copia
                </Button>
              }
            >
              Copia de seguridad pendiente
            </Notice>
            <SkeletonGroup className="flex flex-col gap-2">
              <Skeleton className="h-9 w-48" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </SkeletonGroup>
            <Card>
              <EmptyState
                compact
                icon="🧾"
                title="Apunta tu primer gasto"
                description="Tardas tres segundos: importe, categoría y guardar."
                actions={
                  <>
                    <Button variant="primary">Nuevo movimiento</Button>
                    <Button variant="ghost">Importar CSV</Button>
                  </>
                }
              />
            </Card>
          </div>
        </Both>
      </Section>

      <Section title="Capas">
        <Card>
          <Overlays />
        </Card>
      </Section>

      <Section title="Gráficas">
        <Both>
          <Charts />
        </Both>
      </Section>

      <Section title="Navegación">
        <Both>
          <div className="flex flex-col gap-3">
            {/* `transform` confina los elementos `fixed` a cada panel de la galería. */}
            <div className="relative h-40 transform-gpu overflow-hidden rounded-[12px] border border-border">
              <TabBar items={tabItems(2)} onAdd={() => toast("Nuevo")} className="sm:block!" />
            </div>
            <div className="grid grid-cols-[72px_1fr] gap-3">
              <div className="relative h-[26rem] transform-gpu overflow-hidden rounded-[12px] border border-border">
                <Rail
                  items={sideItems(2)}
                  onAdd={() => toast("Nuevo")}
                  className="flex! lg:flex!"
                />
              </div>
              <div className="relative h-[26rem] transform-gpu overflow-hidden rounded-[12px] border border-border">
                <Sidebar
                  items={sideItems(2)}
                  className="flex!"
                  footer={
                    <p className="text-micro text-fg-2">
                      Cifrado de extremo a extremo · Sincronizado hace 2 min · Copia en Drive hace 3
                      días
                    </p>
                  }
                />
              </div>
            </div>
          </div>
        </Both>
      </Section>
    </main>
  );
};
