import type { CategorizationRule, CategoryId, MatchType } from "./types";

/** Normaliza un texto: minúsculas, sin tildes y con los espacios colapsados. */
export const normalizeText = (text: string): string =>
  text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

/** Compila una regex de regla. Devuelve `null` si el patrón no es válido. */
export const compileRegex = (pattern: string): RegExp | null => {
  if (pattern.trim() === "") return null;
  try {
    return new RegExp(pattern, "iu");
  } catch {
    return null;
  }
};

/** Una regla regex con patrón inválido se ignora y se marca en Ajustes. */
export const isRuleValid = (rule: Pick<CategorizationRule, "pattern" | "matchType">): boolean =>
  rule.matchType === "regex"
    ? compileRegex(rule.pattern) !== null
    : normalizeText(rule.pattern) !== "";

/** Comprueba una regla contra un concepto ya normalizado. */
export const ruleMatches = (
  rule: Pick<CategorizationRule, "pattern" | "matchType">,
  normalizedConcept: string,
): boolean => {
  if (normalizedConcept === "") return false;
  if (rule.matchType === "regex")
    return compileRegex(rule.pattern)?.test(normalizedConcept) ?? false;

  const pattern = normalizeText(rule.pattern);
  if (pattern === "") return false;
  if (rule.matchType === "equals") return normalizedConcept === pattern;
  if (rule.matchType === "startsWith") return normalizedConcept.startsWith(pattern);
  return normalizedConcept.includes(pattern);
};

/** Especificidad: equals > startsWith > contains > regex. */
const SPECIFICITY: Record<MatchType, number> = { equals: 3, startsWith: 2, contains: 1, regex: 0 };

/**
 * Regla aplicable a un concepto: la de mayor prioridad que coincida; a
 * igualdad, la más específica y después la más reciente.
 */
export const findRule = (
  rules: ReadonlyArray<CategorizationRule>,
  concept: string,
): CategorizationRule | null => {
  const normalized = normalizeText(concept);
  if (normalized === "") return null;

  let best: CategorizationRule | null = null;
  for (const rule of rules) {
    if (!ruleMatches(rule, normalized)) continue;
    if (
      best === null ||
      rule.priority > best.priority ||
      (rule.priority === best.priority &&
        (SPECIFICITY[rule.matchType] > SPECIFICITY[best.matchType] ||
          (SPECIFICITY[rule.matchType] === SPECIFICITY[best.matchType] &&
            rule.createdAt > best.createdAt)))
    ) {
      best = rule;
    }
  }
  return best;
};

export const categorize = (
  rules: ReadonlyArray<CategorizationRule>,
  concept: string,
): CategoryId | null => findRule(rules, concept)?.categoryId ?? null;

export interface RuleSuggestion {
  readonly pattern: string;
  readonly matchType: "contains";
  readonly categoryId: CategoryId;
}

/**
 * Propuesta de regla tras guardar un movimiento: solo si el concepto no tiene
 * ninguna regla y la categoría se eligió a mano.
 */
export const suggestRule = (
  rules: ReadonlyArray<CategorizationRule>,
  concept: string,
  categoryId: CategoryId | null,
): RuleSuggestion | null => {
  const pattern = normalizeText(concept);
  if (pattern === "" || categoryId === null) return null;
  if (findRule(rules, concept) !== null) return null;
  return { pattern, matchType: "contains", categoryId };
};

/** Prioridad para una regla nueva: una por encima de la más alta. */
export const nextPriority = (rules: ReadonlyArray<CategorizationRule>): number =>
  rules.reduce((max, rule) => Math.max(max, rule.priority), 0) + 1;

export const MATCH_TYPE_LABELS: Record<MatchType, string> = {
  contains: "Contiene",
  startsWith: "Empieza por",
  equals: "Es igual a",
  regex: "Expresión regular",
};
