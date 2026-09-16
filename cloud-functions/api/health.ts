import { authConfigured } from "./_shared/auth";
import { json, type MakersContext } from "./_shared/context";
import { notificationProvider } from "./_shared/notification";

export function onRequestGet(context: MakersContext): Response {
  return json({
    ok: true,
    authConfigured: authConfigured(context),
    notificationProvider: notificationProvider(context.env),
    runtime: process.version,
  });
}
