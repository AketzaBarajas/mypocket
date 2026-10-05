import { PALETTE_COLORS, type PaletteColor } from "@/domain/types";
import { cn } from "@/ui";

/** Clases estáticas por color: Tailwind necesita verlas escritas enteras. */
export const PALETTE_BG: Record<PaletteColor, string> = {
  slate: "bg-pal-slate",
  blue: "bg-pal-blue",
  teal: "bg-pal-teal",
  olive: "bg-pal-olive",
  amber: "bg-pal-amber",
  coral: "bg-pal-coral",
  rose: "bg-pal-rose",
  violet: "bg-pal-violet",
};

export const PALETTE_TEXT: Record<PaletteColor, string> = {
  slate: "text-pal-slate",
  blue: "text-pal-blue",
  teal: "text-pal-teal",
  olive: "text-pal-olive",
  amber: "text-pal-amber",
  coral: "text-pal-coral",
  rose: "text-pal-rose",
  violet: "text-pal-violet",
};

const LABELS: Record<PaletteColor, string> = {
  slate: "Pizarra",
  blue: "Azul",
  teal: "Turquesa",
  olive: "Oliva",
  amber: "Ámbar",
  coral: "Coral",
  rose: "Rosa",
  violet: "Violeta",
};

/** Punto de color que identifica una cuenta, etiqueta o meta. */
export const ColorDot = ({
  color,
  className,
}: {
  readonly color: PaletteColor;
  readonly className?: string;
}) => (
  <span
    aria-hidden="true"
    className={cn("inline-block size-2 shrink-0 rounded-full", PALETTE_BG[color], className)}
  />
);

export interface ColorPickerProps {
  readonly value: PaletteColor;
  readonly onChange: (color: PaletteColor) => void;
  readonly label?: string;
}

/** Selector de los 8 colores sobrios de la paleta. */
export const ColorPicker = ({ value, onChange, label = "Color" }: ColorPickerProps) => (
  <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1">
    {PALETTE_COLORS.map((color) => (
      <button
        key={color}
        type="button"
        role="radio"
        aria-checked={color === value}
        aria-label={LABELS[color]}
        title={LABELS[color]}
        onClick={() => onChange(color)}
        className={cn(
          "inline-flex size-11 items-center justify-center rounded-full border transition-colors",
          color === value ? "border-border-strong bg-chip" : "border-transparent hover:bg-chip",
        )}
      >
        <span className={cn("size-5 rounded-full", PALETTE_BG[color])} />
      </button>
    ))}
  </div>
);
