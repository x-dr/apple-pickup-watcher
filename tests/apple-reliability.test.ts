import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readResponseText, withResponse } from "../cloud-functions/api/_shared/http";

const target = { locale: "zh_CN", storeNumber: "R683", storeTitle: "测试门店", partNumber: "CASE/A", companionPart: "BAND/A", productName: "Apple Watch", productUrl: "https://www.apple.com.cn/shop/buy-watch" };
function inventory(main: string, band?: string) {
  return Response.json({ head: { status: 200 }, body: { stores: [{ storeNumber: target.storeNumber,
    partsAvailability: { "CASE/A": { pickupDisplay: main }, ...(band ? { "BAND/A": { pickupDisplay: band } } : {}) } }] } });
}
function warm() { return new Response("bag", { headers: { "set-cookie": "test_session=fixture; Path=/" } }); }
beforeEach(() => vi.resetModules());
afterEach(() => vi.useRealTimers());

describe("Apple 组合库存与退避", () => {
  it.each([
    ["available", "available", "in_stock"],
    ["available", "unavailable", "out_of_stock"],
    ["unavailable", "available", "out_of_stock"],
    ["available", undefined, "unknown"],
    ["available", "new_status", "unknown"],
    ["unavailable", undefined, "unknown"],
  ])("表壳 %s / 表带 %s => %s", async (main, band, expected) => {
    const { checkAppleTargets } = await import("../cloud-functions/api/_shared/apple");
    const mock = vi.fn<typeof fetch>().mockResolvedValueOnce(warm()).mockResolvedValueOnce(inventory(main!, band));
    const value = await checkAppleTargets([target], {}, mock);
    expect(value.rows[0]?.availability.kind).toBe(expected);
    expect(String(mock.mock.calls[1]![0])).toContain("parts.1=BAND%2FA");
    expect(value.requestCount).toBe(2);
  });

  it("HTML 拦截进入冷却，冷却期间不发起请求", async () => {
    const { checkAppleTargets } = await import("../cloud-functions/api/_shared/apple");
    const mock = vi.fn<typeof fetch>().mockResolvedValueOnce(warm()).mockResolvedValueOnce(new Response("<html>blocked</html>"));
    const first = await checkAppleTargets([target], {}, mock);
    const second = await checkAppleTargets([target], {}, mock);
    expect(first.rows[0]?.availability).toMatchObject({ kind: "unknown", reason: "blocked" });
    expect(first.retryAfterSeconds).toBeGreaterThanOrEqual(299);
    expect(second.requestCount).toBe(0);
    expect(mock).toHaveBeenCalledTimes(2);
  });

  it("429 遵守 Retry-After，重试仍失败时延长退避", async () => {
    vi.useFakeTimers();
    const { checkAppleTargets } = await import("../cloud-functions/api/_shared/apple");
    const mock = vi.fn<typeof fetch>().mockResolvedValueOnce(warm())
      .mockResolvedValueOnce(new Response("limited", { status: 429, headers: { "retry-after": "90" } }))
      .mockResolvedValueOnce(new Response("limited", { status: 429 }));
    expect((await checkAppleTargets([target], {}, mock)).retryAfterSeconds).toBe(90);
    await vi.advanceTimersByTimeAsync(90_000);
    expect((await checkAppleTargets([target], {}, mock)).retryAfterSeconds).toBe(120);
    expect(mock).toHaveBeenCalledTimes(3);
  });

  it("预热和错误响应的响应体被取消", async () => {
    const { checkAppleTargets } = await import("../cloud-functions/api/_shared/apple");
    const cancelWarm = vi.fn(), cancelError = vi.fn();
    const mock = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response(new ReadableStream({ cancel: cancelWarm })))
      .mockResolvedValueOnce(new Response(new ReadableStream({ cancel: cancelError }), { status: 541 }));
    await checkAppleTargets([target], {}, mock);
    expect(cancelWarm).toHaveBeenCalledTimes(1); expect(cancelError).toHaveBeenCalledTimes(1);
  });

  it("已取消的轮询不会继续访问 Apple", async () => {
    const { checkAppleTargets } = await import("../cloud-functions/api/_shared/apple");
    const controller = new AbortController(); controller.abort(); const mock = vi.fn<typeof fetch>();
    const result = await checkAppleTargets([target], {}, mock, controller.signal);
    expect(result.rows[0]?.availability.kind).toBe("unknown"); expect(mock).not.toHaveBeenCalled();
  });
});

describe("完整响应读取", () => {
  it("收到响应头后，响应体停滞仍会超时并取消读取", async () => {
    vi.useFakeTimers(); const cancel = vi.fn();
    const mock = vi.fn<typeof fetch>().mockResolvedValue(new Response(new ReadableStream({ cancel })));
    const pending = withResponse("https://example.invalid", {}, 100, (res, signal) => readResponseText(res, 1024, signal), mock);
    const assertion = expect(pending).rejects.toMatchObject({ name: "TimeoutError" });
    await vi.advanceTimersByTimeAsync(100); await assertion;
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it("超过体积上限时取消响应体", async () => {
    const cancel = vi.fn();
    const response = new Response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(5)); }, cancel }));
    await expect(readResponseText(response, 4, new AbortController().signal)).rejects.toThrow("大小上限");
    expect(cancel).toHaveBeenCalledTimes(1);
  });
});
