/**
 * Routine templates (product constants, not stored). Picking one shows its
 * items, lets the user untick or add items, then creates real routine items
 * for every day of the week through add_routine_items() (existing items are
 * skipped, a double click adds nothing twice). Everything stays editable.
 */
import { t } from "@/i18n/pt-BR";
import type { Category } from "@/types";

export type TemplateItem = { name: string; category: Category };

export const ROUTINE_TEMPLATES: Record<string, readonly TemplateItem[]> =
  t.routineTemplates;

export const TEMPLATE_NAMES = Object.keys(ROUTINE_TEMPLATES);

/** Category of a chosen item: from the template, or custom for added ones. */
export function templateCategory(template: string, name: string): Category {
  return (
    ROUTINE_TEMPLATES[template]?.find((i) => i.name === name)?.category ??
    "custom"
  );
}
