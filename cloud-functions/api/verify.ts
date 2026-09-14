import { authorize } from "./_shared/auth";
import { json, type MakersContext } from "./_shared/context";

export function onRequestGet(context: MakersContext): Response {
  const denied = authorize(context);
  return denied ?? json({ ok: true });
}
