import { createHash, timingSafeEqual } from "node:crypto";
import type { MakersContext } from "./context";
import { json } from "./context";

export function configuredToken(context: MakersContext): string {
  return context.env.APW_ACCESS_TOKEN?.trim() ?? "";
}

export function authConfigured(context: MakersContext): boolean {
  return configuredToken(context).length >= 16;
}

export function authorize(context: MakersContext): Response | null {
  const expected = configuredToken(context);
  if (expected.length < 16) {
    if (context.env.APW_ALLOW_UNAUTHENTICATED === "true") return null;
    return json(
      {
        error: "auth_not_configured",
        message: "服务端尚未配置 APW_ACCESS_TOKEN",
      },
      503,
    );
  }

  const header = context.request.headers.get("authorization") ?? "";
  const supplied = header.startsWith("Bearer ") ? header.slice(7) : "";
  const expectedHash = createHash("sha256").update(expected).digest();
  const suppliedHash = createHash("sha256").update(supplied).digest();
  if (!timingSafeEqual(expectedHash, suppliedHash)) {
    return json({ error: "unauthorized", message: "访问口令不正确" }, 401, {
      "www-authenticate": "Bearer",
    });
  }
  return null;
}
