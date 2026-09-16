import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { onRequestGet as getHealth } from "../cloud-functions/api/health";
import { onRequestPost } from "../cloud-functions/api/notify";

const NOTIFYHUB_URL = "https://notifyhub.example.invalid/api/v1/hooks/01ARZ3NDEKTSV4RRFFQ69G5FAV";
let client = 0;

function context(env: Record<string, string | undefined> = {}) {
  return {
    clientIp: `test-client-${client++}`,
    env: {
      APW_ACCESS_TOKEN: "fixture-access-token",
      BARK_URL: "https://bark.example.invalid/fixture-key",
      NOTIFYHUB_WEBHOOK_URL: NOTIFYHUB_URL,
      NOTIFYHUB_TOKEN: "fixture-notifyhub-token",
      ...env,
    },
    request: new Request("https://example.invalid/api/notify", {
      method: "POST",
      headers: { authorization: "Bearer fixture-access-token", "content-type": "application/json" },
      body: JSON.stringify({
        title: "库存提醒",
        body: "测试消息",
        url: "https://www.apple.com.cn/shop/product/AAA/A",
        eventId: "apple-pickup-0123456789abcdef0123456789abcdef",
        occurredAt: "2026-09-16T12:00:00.000Z",
      }),
    }),
  };
}

beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
afterEach(() => vi.unstubAllGlobals());

describe("服务端推送确认", () => {
  it("Bark 的 HTTP 和业务响应都成功才记录成功，禁止跳转", async () => {
    vi.mocked(fetch).mockResolvedValue(Response.json({ code: 200 }));
    const response = await onRequestPost(context({ NOTIFYHUB_WEBHOOK_URL: undefined, NOTIFYHUB_TOKEN: undefined }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, provider: "bark" });
    expect(String(vi.mocked(fetch).mock.calls[0]![0])).toContain("bark.example.invalid");
    expect(vi.mocked(fetch).mock.calls[0]![1]?.redirect).toBe("error");
  });

  it.each(["<html>gateway page</html>", '{"code":500}'])("拒绝 Bark HTTP 200 中的无效确认 %s", async (body) => {
    vi.mocked(fetch).mockResolvedValue(new Response(body));
    const response = await onRequestPost(context({ NOTIFYHUB_WEBHOOK_URL: undefined, NOTIFYHUB_TOKEN: undefined }));
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({ error: "bark_failed" });
  });

  it("按 NotifyHub ingress 契约发送 warning 事件并接受 202 确认", async () => {
    vi.mocked(fetch).mockResolvedValue(Response.json({ code: 0, data: { eventId: "accepted-event" } }, { status: 202 }));
    const response = await onRequestPost(context({ BARK_URL: undefined }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, provider: "notifyhub" });

    const [url, init] = vi.mocked(fetch).mock.calls[0]!;
    const headers = new Headers(init?.headers);
    const payload = JSON.parse(String(init?.body));
    expect(String(url)).toBe(NOTIFYHUB_URL);
    expect(init?.redirect).toBe("error");
    expect(headers.get("authorization")).toBe("Bearer fixture-notifyhub-token");
    expect(headers.get("x-notifyhub-event-id")).toBe("apple-pickup-0123456789abcdef0123456789abcdef");
    expect(payload).toMatchObject({
      title: "库存提醒",
      content: "测试消息",
      level: "warning",
      url: "https://www.apple.com.cn/shop/product/AAA/A",
      tags: ["apple", "pickup-watcher"],
      metadata: { source: "apple-pickup-watcher" },
    });
    expect(payload.occurredAt).toBe("2026-09-16T12:00:00.000Z");
    expect(JSON.stringify(payload)).not.toContain("fixture-notifyhub-token");
  });

  it.each([
    [200, { code: 0, data: { eventId: "accepted-event" } }],
    [202, { code: 1, data: {} }],
  ])("拒绝 NotifyHub 的无效确认 HTTP %d", async (status, body) => {
    vi.mocked(fetch).mockResolvedValue(Response.json(body, { status }));
    const response = await onRequestPost(context({ BARK_URL: undefined }));
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({ error: "notifyhub_failed" });
  });

  it("NotifyHub 配置不完整时失败关闭", async () => {
    const response = await onRequestPost(context({ BARK_URL: undefined, NOTIFYHUB_TOKEN: undefined }));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: "invalid_notifyhub_config" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("Bark 与 NotifyHub 同时配置时失败关闭，避免重复推送", async () => {
    const response = await onRequestPost(context());
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: "multiple_notification_providers" });
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("推送配置状态", () => {
  it("只公开当前有效渠道，不下发具体地址或密钥", async () => {
    const source = context({ BARK_URL: undefined });
    const response = getHealth({ request: source.request, env: source.env });
    const text = await response.text();
    expect(JSON.parse(text)).toMatchObject({ notificationProvider: "notifyhub" });
    expect(text).not.toContain("fixture-key");
    expect(text).not.toContain("fixture-notifyhub-token");
  });

  it("两种渠道同时配置时不选择任何渠道", async () => {
    const source = context();
    const response = getHealth({ request: source.request, env: source.env });
    expect(await response.json()).toMatchObject({ notificationProvider: null });
  });
});
