/**
 * Routine templates (product constants, not mock data). Applying one creates
 * real routine items for every day of the week; everything stays editable.
 */
import type { Category } from "@/types";

export const ROUTINE_TEMPLATES: Record<
  string,
  { name: string; category: Category }[]
> = {
  Student: [
    { name: "Wake up", category: "morning" },
    { name: "Study block", category: "work_study" },
    { name: "Read", category: "work_study" },
    { name: "Review notes", category: "work_study" },
    { name: "Sleep before 23:00", category: "night" },
  ],
  Athlete: [
    { name: "Morning Run", category: "morning" },
    { name: "Gym", category: "body" },
    { name: "Stretch", category: "body" },
    { name: "Drink 3L Water", category: "body" },
    { name: "Sleep before 23:00", category: "night" },
  ],
  Builder: [
    { name: "Deep work", category: "work_study" },
    { name: "Work on project", category: "work_study" },
    { name: "Read", category: "work_study" },
    { name: "Prepare tomorrow", category: "night" },
  ],
};
