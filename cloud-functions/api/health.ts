import { authConfigured } from "./_shared/auth";
import { json, type MakersContext } from "./_shared/context";

export function onRequestGet(context: MakersContext): Response {
  return json({
    ok: true,
    authConfigured: authConfigured(context),
    barkConfigured: Boolean(context.env.BARK_URL?.trim()),
    runtime: process.version,
  });
}
