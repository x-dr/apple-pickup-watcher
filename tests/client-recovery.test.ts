import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadAccessToken, loadRunning, loadSettings, loadTargetStates, saveAccessToken, saveRunning, saveSettings, DEFAULT_SETTINGS } from "../src/services/storage";
import { checkTargets, fetchHealth } from "../src/services/api";

const target = { locale: "zh_CN", storeNumber: "R683", storeTitle: "测试门店", partNumber: "AAA/A", productName: "iPhone", productUrl: "https://www.apple.com.cn/shop/product/AAA/A" };
let saved: Map<string, string>;
beforeEach(() => {
  vi.resetModules(); saved = new Map();
  const storage = { getItem: (key: string) => saved.get(key) ?? null, setItem: (key: string, value: string) => saved.set(key, value), removeItem: (key: string) => saved.delete(key) };
  vi.stubGlobal("localStorage", storage); vi.stubGlobal("sessionStorage", storage);
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("缓存和存储恢复", () => {
  it("目录失败后重新请求并复用成功结果", async () => {
    const payload = { locale: "zh_CN", generatedAt: "2026-09-15", sourceCommit: "test", products: [], stores: [] };
    const mock = vi.fn().mockResolvedValueOnce(new Response("failed", { status: 503 })).mockResolvedValueOnce(Response.json(payload));
    vi.stubGlobal("fetch", mock); const { loadCatalog } = await import("../src/domain/catalog");
    await expect(loadCatalog("zh_CN")).rejects.toThrow("503");
    expect(await loadCatalog("zh_CN")).toEqual(payload); await loadCatalog("zh_CN");
    expect(mock).toHaveBeenCalledTimes(2);
  });

  it("拒绝地区不符的目录", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ locale: "en_MY", generatedAt: "2026-09-15", sourceCommit: "test", products: [], stores: [] })));
    const { loadCatalog } = await import("../src/domain/catalog");
    await expect(loadCatalog("zh_CN")).rejects.toThrow("地区不正确");
  });

  it.each(["null", "[]", "false", "{invalid"]) ("损坏设置 %s 回退默认值", (value) => {
    saved.set("apw:web:settings:v1", value); expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it.each([5, 10, 15, 30, 60])("保留可选的 %d 秒查询间隔", (intervalSeconds) => {
    saved.set("apw:web:settings:v1", JSON.stringify({ intervalSeconds }));
    expect(loadSettings().intervalSeconds).toBe(intervalSeconds);
  });

  it("清理无效字段、重复目标和过多门店，保留有效数据", () => {
    saved.set("apw:web:settings:v1", JSON.stringify({ locale: "invalid", intervalSeconds: 1, barkEnabled: "true" }));
    expect(loadSettings()).toMatchObject({ locale: "zh_CN", intervalSeconds: 60, barkEnabled: false });
    saved.set("apw:web:targets:v1", JSON.stringify([
      {},
      null,
      target,
      target,
      { ...target, partNumber: "CASE/A", productName: "Apple Watch", companionPart: "BAND/A" },
      ...Array.from({ length: 8 }, (_, index) => ({ ...target, storeNumber: `R10${index}` })),
    ]));
    expect(loadTargetStates()).toHaveLength(6);
    expect(loadTargetStates()[0]?.target).toEqual(target);
    expect(loadTargetStates().some((row) => row.target.partNumber === "CASE/A")).toBe(false);
  });

  it("浏览器禁用存储时返回失败信息，不使页面崩溃", () => {
    const blocked = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); }, removeItem() { throw new Error("blocked"); } };
    vi.stubGlobal("localStorage", blocked); vi.stubGlobal("sessionStorage", blocked);
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS); expect(loadAccessToken()).toBe(""); expect(loadRunning()).toBe(false);
    expect(saveSettings(DEFAULT_SETTINGS)).toBe(false); expect(saveAccessToken("fixture")).toBe(false); expect(saveRunning(true)).toBe(false);
  });

  it("在当前标签页保存并恢复监控状态", () => {
    expect(loadRunning()).toBe(false);
    expect(saveRunning(true)).toBe(true); expect(loadRunning()).toBe(true);
    expect(saveRunning(false)).toBe(true); expect(loadRunning()).toBe(false);
  });
});

describe("前端 API 边界", () => {
  it("发送精简分组请求，并把结果重新关联到本地展示数据", async () => {
    const mock = vi.fn().mockResolvedValue(Response.json({
      version: 2,
      healthy: true,
      checkedAt: 1_789_520_000_000,
      requestCount: 1,
      retryAfterSeconds: 0,
      groups: [{
        locale: "zh_CN",
        storeNumber: "R683",
        items: [{ partNumber: "AAA/A", availability: { kind: "in_stock" } }],
      }],
    }));
    vi.stubGlobal("fetch", mock);

    const result = await checkTargets([target], "");
    const body = JSON.parse(String(mock.mock.calls[0]![1]!.body));

    expect(body).toEqual({
      version: 2,
      groups: [{ locale: "zh_CN", storeNumber: "R683", items: [{ partNumber: "AAA/A" }] }],
    });
    expect(JSON.stringify(body)).not.toContain("productName");
    expect(result.rows[0]?.target).toBe(target);
    expect(result.rows[0]?.lastCheckedMs).toBe(1_789_520_000_000);
  });

  it("拒绝库存成功响应中的缺失或非法条目", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({
      version: 2, healthy: true, checkedAt: Date.now(), requestCount: 1, retryAfterSeconds: 0, groups: [],
    })));
    await expect(checkTargets([target], "")).rejects.toThrow("不完整");
  });

  it("拒绝 v2 响应中的重复结果", async () => {
    const item = { partNumber: "AAA/A", availability: { kind: "in_stock" } };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({
      version: 2,
      healthy: true,
      checkedAt: Date.now(),
      requestCount: 1,
      retryAfterSeconds: 0,
      groups: [{ locale: "zh_CN", storeNumber: "R683", items: [item, item] }],
    })));
    await expect(checkTargets([target], "")).rejects.toThrow("无效条目");
  });

  it("读取 429 的 Retry-After", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ message: "retry" }, { status: 429, headers: { "retry-after": "120" } })));
    await expect(checkTargets([target], "")).rejects.toMatchObject({ status: 429, retryAfterSeconds: 120 });
  });

  it("健康检查收到响应头后仍受超时保护", async () => {
    vi.useFakeTimers(); let aborted = false;
    vi.stubGlobal("fetch", vi.fn(async (_url, init: RequestInit) => new Response(new ReadableStream({
      start(controller) { init.signal!.addEventListener("abort", () => { aborted = true; controller.error(init.signal!.reason); }); },
    }))));
    const assertion = expect(fetchHealth()).rejects.toMatchObject({ name: "TimeoutError" });
    await vi.advanceTimersByTimeAsync(15_000); await assertion; expect(aborted).toBe(true);
  });
});
