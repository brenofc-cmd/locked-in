/**
 * Routine templates (product constants, not stored). Picking one shows its
 * items, lets the user untick or add items, then creates real routine items
 * for every day of the week through add_routine_items() (existing items are
 * skipped, a double click adds nothing twice). Everything stays editable.
 */
import type { Category } from "@/types";

export type TemplateItem = { name: string; category: Category };

export const ROUTINE_TEMPLATES: Record<string, TemplateItem[]> = {
  "Morning Routine": [
    { name: "Wake up at 06:30", category: "morning" },
    { name: "Make bed", category: "morning" },
    { name: "Drink water", category: "morning" },
    { name: "Plan the day", category: "morning" },
  ],
  "Study Routine": [
    { name: "Study block", category: "work_study" },
    { name: "Read", category: "work_study" },
    { name: "Review notes", category: "work_study" },
    { name: "Practice problems", category: "work_study" },
  ],
  "Night Routine": [
    { name: "No screens after 22:30", category: "night" },
    { name: "Prepare tomorrow", category: "night" },
    { name: "Sleep before 23:00", category: "night" },
  ],
  Training: [
    { name: "Morning Run", category: "body" },
    { name: "Gym", category: "body" },
    { name: "Stretch", category: "body" },
  ],
};

export const TEMPLATE_NAMES = Object.keys(ROUTINE_TEMPLATES);

/** Category of a chosen item: from the template, or custom for added ones. */
export function templateCategory(template: string, name: string): Category {
  return (
    ROUTINE_TEMPLATES[template]?.find((i) => i.name === name)?.category ??
    "custom"
  );
}
