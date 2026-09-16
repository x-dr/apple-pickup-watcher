// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useWatcher, type WatcherModel } from "../src/hooks/useWatcher";
import { ApiError, checkTargets, fetchHealth, sendNotification } from "../src/services/api";
import { showStockNotification } from "../src/services/notifications";
import { targetKey, type Availability, type CheckResponse, type Target } from "../src/domain/types";

vi.mock("../src/domain/catalog", () => ({ loadCatalog: vi.fn(async (locale: string) => ({ locale, generatedAt: "2026-09-15", sourceCommit: "test", stores: [], products: [] })) }));
vi.mock("../src/services/api", async (original) => ({ ...await original<typeof import("../src/services/api")>(), checkTargets: vi.fn(), fetchHealth: vi.fn(), sendNotification: vi.fn() }));
vi.mock("../src/services/notifications", () => ({ ensureNotificationPermission: vi.fn(async () => "granted"), prepareAudio: vi.fn(async () => true), playAlertTone: vi.fn(async () => true), showStockNotification: vi.fn(() => true) }));

const target = (partNumber = "AAA/A"): Target => ({ locale: "zh_CN", storeNumber: "R683", storeTitle: "测试门店", partNumber, productName: partNumber, productUrl: `https://www.apple.com.cn/shop/product/${partNumber}` });
function response(targets: Target[], availability: Availability = { kind: "in_stock" }, retryAfterSeconds = 0): CheckResponse {
  return { healthy: availability.kind !== "unknown", checkedAt: Date.now(), requestCount: 1, retryAfterSeconds,
    rows: targets.map((target) => ({ target: { ...target }, availability, lastCheckedMs: Date.now() })) };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
let model: WatcherModel;
let root: Root;
let container: HTMLDivElement;
async function mount() {
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  await act(async () => { root.render(createElement(function Probe() { model = useWatcher(); return null; })); });
}
async function add(part = "AAA/A") { await act(async () => model.addTarget(target(part))); }
async function check() { await act(async () => model.runCheck()); }

beforeEach(async () => {
  vi.clearAllMocks();
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  localStorage.clear(); sessionStorage.clear();
  localStorage.setItem("apw:web:settings:v1", JSON.stringify({ browserNotifications: true, soundEnabled: false, notificationEnabled: true }));
  vi.mocked(fetchHealth).mockResolvedValue({ ok: true, authConfigured: false, notificationProvider: "bark", runtime: "test" });
  vi.mocked(sendNotification).mockResolvedValue({ ok: true });
  vi.mocked(checkTargets).mockImplementation(async (targets) => response(targets));
  await mount();
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.useRealTimers(); });

describe("监控状态与通知", () => {
  it("批量添加目标时跳过重复项并一次保存全部新目标", async () => {
    await add();
    await act(async () => model.addTargets([target(), target("BBB/A"), target("CCC/A")]));

    expect(model.rows.map((row) => row.target.partNumber)).toEqual(["AAA/A", "BBB/A", "CCC/A"]);
    expect(JSON.parse(localStorage.getItem("apw:web:targets:v1")!)).toHaveLength(3);
    expect(model.logs.at(-1)).toContain("已批量添加 2 项");
  });

  it("查询期间增删目标不会被旧响应覆盖，也不发送已删除目标的提醒", async () => {
    await add(); const pending = deferred<CheckResponse>();
    vi.mocked(checkTargets).mockReturnValueOnce(pending.promise);
    let checking!: Promise<void>;
    await act(async () => { checking = model.runCheck(); });
    await act(async () => { model.removeTarget(targetKey(target())); model.addTarget(target("BBB/A")); });
    await act(async () => { pending.resolve(response([target()])); await checking; });
    expect(model.rows.map((row) => row.target.partNumber)).toEqual(["BBB/A"]);
    expect(model.rows[0]?.availability).toMatchObject({ reason: "not_yet_checked" });
    expect(sendNotification).not.toHaveBeenCalled();
    expect(JSON.parse(localStorage.getItem("apw:web:targets:v1")!)[0].partNumber).toBe("BBB/A");
  });

  it("删除后重新添加相同型号也不接收旧结果", async () => {
    await add(); await add("BBB/A"); const pending = deferred<CheckResponse>();
    vi.mocked(checkTargets).mockReturnValueOnce(pending.promise);
    let checking!: Promise<void>; await act(async () => { checking = model.runCheck(); });
    await act(async () => { model.removeTarget(targetKey(target())); model.addTarget(target()); });
    await act(async () => { pending.resolve(response([target(), target("BBB/A")])); await checking; });
    expect(model.rows.find((row) => row.target.partNumber === "AAA/A")?.availability).toMatchObject({ reason: "not_yet_checked" });
    expect(model.rows.find((row) => row.target.partNumber === "BBB/A")?.availability.kind).toBe("in_stock");
  });

  it("失败的服务端通知会重试，成功的浏览器通知不会跟着重复", async () => {
    await add(); vi.mocked(sendNotification).mockRejectedValueOnce(new Error("模拟推送失败"));
    await check(); await check(); await check();
    expect(sendNotification).toHaveBeenCalledTimes(2);
    expect(vi.mocked(sendNotification).mock.calls[1]![0].eventId).toBe(vi.mocked(sendNotification).mock.calls[0]![0].eventId);
    expect(vi.mocked(sendNotification).mock.calls[1]![0].occurredAt).toBe(vi.mocked(sendNotification).mock.calls[0]![0].occurredAt);
    expect(showStockNotification).toHaveBeenCalledTimes(1);
  });

  it("未知不重置通知，明确无货后再次有货才重新提醒", async () => {
    await add(); await check();
    vi.mocked(checkTargets).mockImplementationOnce(async (targets) => response(targets, { kind: "unknown", reason: "transport", detail: "模拟故障" }));
    await check(); await check();
    expect(sendNotification).toHaveBeenCalledTimes(1);
    vi.mocked(checkTargets).mockImplementationOnce(async (targets) => response(targets, { kind: "out_of_stock" }));
    await check(); await check();
    expect(sendNotification).toHaveBeenCalledTimes(2);
  });

  it("API 失败标记本轮未知并保留上次确认库存", async () => {
    await add(); await check();
    vi.mocked(checkTargets).mockRejectedValueOnce(new ApiError(502, "request_failed", "模拟服务故障"));
    await check();
    expect(model.rows[0]?.availability).toMatchObject({ kind: "unknown", reason: "transport" });
    expect(model.rows[0]?.lastConfirmed?.kind).toBe("in_stock");
    expect(model.trouble).toBe("模拟服务故障");
  });

  it("暂停取消请求，旧响应不能干扰重启后的请求", async () => {
    await add(); const old = deferred<CheckResponse>(); const fresh = deferred<CheckResponse>();
    vi.mocked(checkTargets).mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise);
    await act(async () => model.setRunning(true));
    const oldSignal = vi.mocked(checkTargets).mock.calls[0]![2]!;
    await act(async () => { model.setRunning(false); model.setRunning(true); });
    expect(oldSignal.aborted).toBe(true);
    await act(async () => { old.resolve(response([target()])); });
    expect(model.checking).toBe(true);
    expect(model.rows[0]?.availability).toMatchObject({ reason: "not_yet_checked" });
    await act(async () => { fresh.resolve(response([target()], { kind: "out_of_stock" })); });
    expect(model.rows[0]?.availability.kind).toBe("out_of_stock");
    expect(model.checking).toBe(false);
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it("从本轮完成后计时，慢请求不重叠，下一轮时间与实际触发一致", async () => {
    vi.useFakeTimers(); await add(); const pending = deferred<CheckResponse>();
    vi.mocked(checkTargets).mockReturnValueOnce(pending.promise);
    await act(async () => model.setRunning(true));
    await act(async () => vi.advanceTimersByTimeAsync(90_000));
    expect(checkTargets).toHaveBeenCalledTimes(1);
    expect(model.nextCheckAt).toBeNull();
    await act(async () => { pending.resolve(response([target()])); });
    expect(model.nextCheckAt).toBe(Date.now() + 60_000);
    await act(async () => vi.advanceTimersByTimeAsync(60_000));
    expect(checkTargets).toHaveBeenCalledTimes(2);
  });

  it("支持每 5 秒自动查询", async () => {
    vi.useFakeTimers(); await add();
    await act(async () => model.updateSettings({ intervalSeconds: 5 }));
    await act(async () => model.setRunning(true));
    expect(model.nextCheckAt).toBe(Date.now() + 5_000);
    await act(async () => vi.advanceTimersByTimeAsync(4_999));
    expect(checkTargets).toHaveBeenCalledTimes(1);
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(checkTargets).toHaveBeenCalledTimes(2);
  });

  it("遵守 Retry-After，手动查询不能越过冷却时间", async () => {
    vi.useFakeTimers(); await add();
    vi.mocked(checkTargets).mockRejectedValueOnce(new ApiError(429, "too_many_requests", "稍后重试", 300));
    await act(async () => model.setRunning(true));
    expect(model.nextCheckAt).toBe(Date.now() + 300_000);
    await check(); expect(checkTargets).toHaveBeenCalledTimes(1);
    await act(async () => vi.advanceTimersByTimeAsync(300_000));
    expect(checkTargets).toHaveBeenCalledTimes(2);
  });

  it("未授权后停止自动轮询并打开口令窗口", async () => {
    await add(); vi.mocked(checkTargets).mockRejectedValueOnce(new ApiError(401, "unauthorized", "口令无效"));
    await act(async () => model.setRunning(true));
    expect(model.running).toBe(false); expect(model.authOpen).toBe(true); expect(model.nextCheckAt).toBeNull();
    expect(sessionStorage.getItem("apw:web:running")).toBeNull();
  });

  it("刷新页面后恢复监控并立即继续查询", async () => {
    await add();
    await act(async () => model.setRunning(true));
    expect(sessionStorage.getItem("apw:web:running")).toBe("1");
    expect(checkTargets).toHaveBeenCalledTimes(1);

    await act(async () => root.unmount()); container.remove();
    await mount();

    expect(model.running).toBe(true);
    expect(checkTargets).toHaveBeenCalledTimes(2);
  });
});
