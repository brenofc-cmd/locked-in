"use client";

import type { ReactNode } from "react";
import { useApp } from "@/components/app-state";
import {
  ChallengeSheet,
  DaySheet,
  FocusSheet,
  ReactSheet,
  StreakSheet,
  TemplateSheet,
} from "@/components/sheets/MiscSheets";
import { Sheet } from "@/components/sheets/Sheet";
import {
  TaskFormSheet,
  TaskOptionsSheet,
} from "@/components/sheets/TaskSheets";

const LABEL = {
  add: "Add task",
  edit: "Edit task",
  editRoutine: "Edit task",
  options: "Task options",
  react: "React",
  focus: "Start focus",
  streak: "Streak",
  day: "Day detail",
  template: "Use a template",
  challenge: "New challenge",
} as const;

export function SheetHost() {
  const { sheet, closeSheet, tasks, routines } = useApp();
  if (!sheet) return null;

  let body: ReactNode = null;
  switch (sheet.kind) {
    case "add":
      body = <TaskFormSheet repeatByDefault={sheet.repeat} />;
      break;
    case "edit":
    case "options": {
      const task = tasks.find((t) => t.id === sheet.taskId);
      if (!task) return null;
      body =
        sheet.kind === "edit" ? (
          <TaskFormSheet editing={task} />
        ) : (
          <TaskOptionsSheet task={task} />
        );
      break;
    }
    case "editRoutine": {
      const routine = routines.find((r) => r.id === sheet.routineId);
      if (!routine) return null;
      body = <TaskFormSheet routine={routine} />;
      break;
    }
    case "react":
      body = <ReactSheet eventId={sheet.eventId} title={sheet.title} />;
      break;
    case "focus":
      body = <FocusSheet />;
      break;
    case "streak":
      body = <StreakSheet />;
      break;
    case "day":
      body = <DaySheet date={sheet.date} />;
      break;
    case "template":
      body = <TemplateSheet />;
      break;
    case "challenge":
      body = <ChallengeSheet />;
      break;
  }

  // key: switching between sheets (options → edit) remounts the content.
  return (
    <Sheet
      key={JSON.stringify(sheet)}
      label={LABEL[sheet.kind]}
      onClose={closeSheet}
    >
      {body}
    </Sheet>
  );
}
