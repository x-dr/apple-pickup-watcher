import { beforeEach, describe, expect, it, vi } from "vitest";

function target(locale = "zh_CN") {
  return {
    locale,
    storeNumber: "R683",
    storeTitle: "上海-环球港",
    partNumber: "MJTF4CH/A",
    productName: "iPhone 18 Pro 512GB 冰川蓝色",
    productUrl: "https://www.apple.com.cn/shop/buy-iphone",
  };
}

function appleResponse(pickupDisplay: string) {
  return JSON.stringify({
    head: { status: "200" },
    body: {
      stores: [
        {
          storeNumber: "R683",
          storeName: "环球港",
          partsAvailability: {
            "MJTF4CH/A": { partNumber: "MJTF4CH/A", pickupDisplay },
          },
        },
      ],
    },
  });
}

describe("Apple 三态库存解析", () => {
  beforeEach(() => vi.resetModules());

  it("只把明确的 available 判为有货", async () => {
    const { checkAppleTargets } = await import("../cloud-functions/api/_shared/apple");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("bag", { status: 200, headers: { "set-cookie": "geo=CN; Path=/" } }))
      .mockResolvedValueOnce(new Response(appleResponse("available"), { status: 200, headers: { "content-type": "application/json" } }));

    const result = await checkAppleTargets([target()], {}, fetchMock as typeof fetch);

    expect(result.healthy).toBe(true);
    expect(result.rows[0]?.availability).toEqual({ kind: "in_stock" });
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain("parts.0=MJTF4CH%2FA");
  });

  it("把未知 pickupDisplay 保留为结构异常，不伪装成无货", async () => {
    const { checkAppleTargets } = await import("../cloud-functions/api/_shared/apple");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("bag", { status: 200 }))
      .mockResolvedValueOnce(new Response(appleResponse("maybe"), { status: 200, headers: { "content-type": "application/json" } }));

    const result = await checkAppleTargets([target("zh_HK")], {}, fetchMock as typeof fetch);

    expect(result.healthy).toBe(false);
    expect(result.rows[0]?.availability).toMatchObject({
      kind: "unknown",
      reason: "schema_drift",
      field: "pickupDisplay",
      raw: "maybe",
    });
  });

  it("把 HTTP 541 判为被拦截，而不是无货", async () => {
    const { checkAppleTargets } = await import("../cloud-functions/api/_shared/apple");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("bag", { status: 200 }))
      .mockResolvedValueOnce(new Response("blocked", { status: 541 }));

    const result = await checkAppleTargets([target("zh_TW")], {}, fetchMock as typeof fetch);

    expect(result.rows[0]?.availability).toMatchObject({ kind: "unknown", reason: "blocked" });
    expect(result.rows[0]?.availability.kind).not.toBe("out_of_stock");
  });

  it("响应缺少目标型号时保持未知", async () => {
    const { checkAppleTargets } = await import("../cloud-functions/api/_shared/apple");
    const body = JSON.stringify({
      head: { status: 200 },
      body: { stores: [{ storeNumber: "R683", partsAvailability: { "OTHER/A": { pickupDisplay: "available" } } }] },
    });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("bag", { status: 200 }))
      .mockResolvedValueOnce(new Response(body, { status: 200, headers: { "content-type": "application/json" } }));

    const result = await checkAppleTargets([target("ja_JP")], {}, fetchMock as typeof fetch);

    expect(result.rows[0]?.availability).toMatchObject({ kind: "unknown", reason: "schema_drift" });
  });
});
