import type { ReactNode } from "react";

/** Tipografía de ejes: Geist Mono 11 px en --text-3. */
export const AXIS_TICK = {
  fill: "var(--text-3)",
  fontFamily: "var(--font-mono)",
  fontSize: 11,
  fontWeight: 500,
} as const;

/** Ancho del margen derecho necesario para las etiquetas del eje Y. */
export const axisMargin = (labels: ReadonlyArray<string>): number =>
  Math.ceil(Math.max(0, ...labels.map((label) => label.length)) * 6.7) + 12;

/** Ancla la primera etiqueta al inicio y la última al final para que no se corten. */
export const edgeAnchor = (index: number, count: number): "start" | "middle" | "end" =>
  index === 0 ? "start" : index === count - 1 ? "end" : "middle";

export const GRID_STROKE = "var(--border)";
export const GRID_OPACITY = 0.5;

/** Rectángulo con las esquinas superiores redondeadas (barras con radio 4). */
export const topRoundedRect = (
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): string => {
  if (height <= 0 || width <= 0) return "";
  const r = Math.min(radius, width / 2, height);
  return [
    `M${x},${y + height}`,
    `V${y + r}`,
    `Q${x},${y} ${x + r},${y}`,
    `H${x + width - r}`,
    `Q${x + width},${y} ${x + width},${y + r}`,
    `V${y + height}`,
    "Z",
  ].join(" ");
};

export interface ChartTableProps {
  readonly caption: string;
  readonly headers: ReadonlyArray<string>;
  readonly rows: ReadonlyArray<ReadonlyArray<string>>;
}

/** Alternativa textual de una gráfica, visible solo para lectores de pantalla. */
export const ChartTable = ({ caption, headers, rows }: ChartTableProps) => (
  <table className="sr-only">
    <caption>{caption}</caption>
    <thead>
      <tr>
        {headers.map((header) => (
          <th key={header} scope="col">
            {header}
          </th>
        ))}
      </tr>
    </thead>
    <tbody>
      {rows.map((row, rowIndex) => (
        <tr key={rowIndex}>
          {row.map((cell, cellIndex) =>
            cellIndex === 0 ? (
              <th key={cellIndex} scope="row">
                {cell}
              </th>
            ) : (
              <td key={cellIndex}>{cell}</td>
            ),
          )}
        </tr>
      ))}
    </tbody>
  </table>
);

/** Tarjeta flotante de tooltip: --surface-raised con borde. */
export const ChartTooltip = ({
  left,
  top,
  align = "center",
  children,
}: {
  readonly left: number;
  readonly top: number;
  readonly align?: "start" | "center" | "end";
  readonly children: ReactNode;
}) => (
  <div
    role="presentation"
    className="pointer-events-none absolute z-10 rounded-[10px] border border-border bg-raised px-2.5 py-1.5 whitespace-nowrap shadow-(--shadow-raised)"
    style={{
      left,
      top,
      transform:
        align === "center"
          ? "translate(-50%, -100%)"
          : align === "start"
            ? "translate(0, -100%)"
            : "translate(-100%, -100%)",
    }}
  >
    {children}
  </div>
);
