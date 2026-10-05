// Utilidad de formato del design system. La implementación vive en el dominio
// para que la lógica y la interfaz formateen exactamente igual.
export {
  formatMoney,
  formatPercent,
  splitMoney,
  type FormatMoneyOptions,
  type MoneyParts,
} from "@/domain/money";
