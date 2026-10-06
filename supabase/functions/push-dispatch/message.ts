/**
 * What a push says and where it opens (V2 Phase 10, docs/WEB_PUSH.md). Pure
 * and unit-tested. The text is built here, at send time, from the few
 * fields `private.push_claim` returns — never a goal, vision, mirror,
 * reflection or anything private of the partner. With "Ocultar detalhes"
 * only generic text is sent.
 *
 * The copy lives here (not in src/i18n/pt-BR.ts) because this module is
 * deployed on its own with the Edge Function (ADR-097). pt-BR only.
 */
import { isPushService, type PushRoute } from "./routes.ts";
import { sendPush, type Vapid } from "./webpush.ts";

export { PUSH_ROUTES, isPushService, type PushRoute } from "./routes.ts";

export type DeliveryKind =
  "planner" | "nudge" | "review_day" | "review_week" | "plan_week" | "test";

export type ClaimedSubscription = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

export type Claimed = {
  delivery_id: string;
  kind: DeliveryKind;
  hide_details: boolean;
  data: Record<string, unknown> | null;
  subscriptions: ClaimedSubscription[];
};

export type PushMessage = {
  title: string;
  body: string;
  route: PushRoute;
  tag: string;
};

const TYPES: Record<string, string> = {
  exam: "Prova",
  assignment: "Trabalho",
  homework: "Lição",
  deadline: "Entrega",
  school_event: "Evento",
};

const str = (v: unknown, max: number) =>
  typeof v === "string" ? v.trim().slice(0, max) : "";

/** "hoje às 14:00" / "amanhã" / "em 3 dias". */
export function whenText(days: number, time: string | null): string {
  if (days <= 0) return time ? `hoje às ${time}` : "hoje";
  if (days === 1) return time ? `amanhã às ${time}` : "amanhã";
  return `em ${days} dias`;
}

/** The message of a claimed delivery, or null when its source is gone. */
export function buildMessage(
  c: Pick<Claimed, "kind" | "hide_details" | "data">,
): PushMessage | null {
  const d = c.data ?? {};
  switch (c.kind) {
    case "planner": {
      const title = str(d.title, 80);
      if (!title) return null;
      if (c.hide_details)
        return {
          title: "Lembrete do Planner",
          body: "Abra o LOCKED IN para ver.",
          route: "planner",
          tag: "planner",
        };
      const type = TYPES[str(d.type, 20)] ?? "Evento";
      const days = typeof d.days === "number" ? d.days : 0;
      const time =
        typeof d.time === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(d.time)
          ? d.time
          : null;
      return {
        title: `${type} ${whenText(days, time)}`,
        body: title,
        route: "planner",
        tag: "planner",
      };
    }
    case "nudge": {
      const from = str(d.from, 40);
      if (!from) return null;
      if (c.hide_details)
        return {
          title: "Você recebeu um toque",
          body: "Abra o LOCKED IN para ver.",
          route: "partner",
          tag: "nudge",
        };
      const commitment = str(d.commitment, 80);
      return {
        title: `${from} deu um toque`,
        body: commitment
          ? `Compromisso: ${commitment}`
          : "Seu compromisso de hoje ainda está aberto.",
        route: "partner",
        tag: "nudge",
      };
    }
    case "review_day":
      return {
        title: "Review do dia",
        body: "Seu dia ainda não tem revisão.",
        route: "today",
        tag: "review-day",
      };
    case "review_week":
      return {
        title: "Review semanal",
        body: "A semana fecha hoje. Revise antes.",
        route: "progress",
        tag: "review-week",
      };
    case "plan_week":
      return {
        title: "Planejamento semanal",
        body: "Nenhuma prioridade definida para esta semana.",
        route: "plan-week",
        tag: "plan-week",
      };
    case "test":
      return {
        title: "LOCKED IN",
        body: "Notificação de teste. Está funcionando.",
        route: "settings",
        tag: "test",
      };
    default:
      return null;
  }
}

export type DeliveryResult = { sub: string; status: number };

/** Urgent kinds reach a sleeping phone sooner; reminders keep a short life. */
function sendOptions(kind: DeliveryKind) {
  const urgent = kind === "nudge" || kind === "test";
  // No Topic: two reminders for two events must both arrive.
  return {
    ttl: urgent ? 3600 : 4 * 3600,
    urgency: urgent ? ("high" as const) : ("normal" as const),
  };
}

/**
 * Sends one claimed delivery to every device of its user. The payload is the
 * small JSON the service worker reads: k(ind), t(itle), b(ody), r(oute key), g (tag).
 */
export async function deliver(
  c: Claimed,
  vapid: Vapid,
  fetchImpl: typeof fetch = fetch,
): Promise<{ results: DeliveryResult[]; reason: string | null }> {
  const message = buildMessage(c);
  if (!message) return { results: [], reason: "source_gone" };
  const targets = c.subscriptions.filter((s) => isPushService(s.endpoint));
  if (targets.length === 0) return { results: [], reason: "no_device" };
  const payload = new TextEncoder().encode(
    // One tag per delivery: two reminders never replace each other on screen.
    JSON.stringify({
      k: c.kind,
      t: message.title,
      b: message.body,
      r: message.route,
      g: `${message.tag}-${c.delivery_id.slice(0, 8)}`,
    }),
  );
  const opts = sendOptions(c.kind);
  const results = await Promise.all(
    targets.map(async (s) => ({
      sub: s.id,
      status: await sendPush(s, payload, vapid, opts, fetchImpl),
    })),
  );
  return { results, reason: null };
}
