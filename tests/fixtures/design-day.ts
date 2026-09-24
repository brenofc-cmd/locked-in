/**
 * TEST FIXTURE (not app data): the approved design's Today — 12 tasks, 8 done
 * (67%), plus "Long run" that is not scheduled today. Unit tests build Task
 * objects from it; the Playwright setup creates it as real routine items for
 * the DEV test users.
 */
import type { Category } from "@/types";

export type DesignItem = {
  name: string;
  category: Category;
  time: string;
  notes: string;
  done: boolean;
  /** Scheduled every day unless false ("Long run" rests today). */
  today?: false;
};

export const DESIGN_DAY: DesignItem[] = [
  {
    name: "Wake up",
    category: "morning",
    time: "06:00",
    notes: "",
    done: true,
  },
  {
    name: "Drink water",
    category: "morning",
    time: "06:10",
    notes: "500 ML",
    done: true,
  },
  {
    name: "Make bed",
    category: "morning",
    time: "06:05",
    notes: "",
    done: true,
  },
  {
    name: "Morning Run",
    category: "morning",
    time: "06:30",
    notes: "5 KM",
    done: false,
  },
  {
    name: "Study Physics",
    category: "work_study",
    time: "07:40",
    notes: "45 MIN",
    done: true,
  },
  {
    name: "Work on project",
    category: "work_study",
    time: "09:00",
    notes: "1 H",
    done: true,
  },
  {
    name: "Read",
    category: "work_study",
    time: "07:15",
    notes: "30 MIN",
    done: true,
  },
  {
    name: "Gym",
    category: "body",
    time: "08:00",
    notes: "PUSH DAY",
    done: true,
  },
  {
    name: "Drink 3L Water",
    category: "body",
    time: "",
    notes: "3 L",
    done: false,
  },
  { name: "Follow diet", category: "body", time: "", notes: "", done: true },
  {
    name: "Prepare tomorrow",
    category: "night",
    time: "22:00",
    notes: "",
    done: false,
  },
  {
    name: "Sleep before 23:00",
    category: "night",
    time: "22:45",
    notes: "",
    done: false,
  },
  {
    name: "Long run",
    category: "body",
    time: "07:00",
    notes: "12 KM",
    done: false,
    today: false,
  },
];
