import { SERIES_RANGES, type SeriesRange } from "@/domain/networthSeries";
import { SegmentedControl } from "@/ui";

const OPTIONS = SERIES_RANGES.map((range) => ({ value: range, label: range }));

/** Selector de rango de las gráficas de patrimonio: 1M · 3M · 6M · 1A · Todo. */
export const RangeTabs = ({
  value,
  onChange,
  className,
}: {
  readonly value: SeriesRange;
  readonly onChange: (range: SeriesRange) => void;
  readonly className?: string;
}) => (
  <SegmentedControl
    ariaLabel="Rango de la gráfica"
    size="sm"
    fullWidth={false}
    value={value}
    onValueChange={onChange}
    options={OPTIONS}
    {...(className === undefined ? {} : { className })}
  />
);
