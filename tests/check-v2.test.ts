import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const accessToken = "correct-horse-battery";

function context(body: unknown, clientIp = "check-v2-test-client") {
  return {
    clientIp,
    env: { APW_ACCESS_TOKEN: accessToken },
    request: new Request("https://example.invalid/api/check", {
      method: "POST",
      headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  };
}

function inventory(parts: Record<string, string>) {
  return Response.json({
    head: { status: 200 },
    body: {
      stores: [{
        storeNumber: "R683",
        partsAvailability: Object.fromEntries(
          Object.entries(parts).map(([partNumber, pickupDisplay]) => [partNumber, { partNumber, pickupDisplay }]),
        ),
      }],
    },
  });
}

beforeEach(() => vi.resetModules());
afterEach(() => vi.unstubAllGlobals());

describe("/api/check v2", () => {
  it("返回精简分组结果，并把同门店型号合并为一次库存查询", async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("bag", { headers: { "set-cookie": "geo=CN; Path=/" } }))
      .mockResolvedValueOnce(inventory({ "AAA/A": "available", "BBB/A": "unavailable" }));
    vi.stubGlobal("fetch", fetchMock);
    const { onRequestPost } = await import("../cloud-functions/api/check");

    const response = await onRequestPost(context({
      version: 2,
      groups: [{
        locale: "zh_CN",
        storeNumber: "R683",
        items: [{ partNumber: "AAA/A" }, { partNumber: "BBB/A" }],
      }],
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      version: 2,
      healthy: true,
      requestCount: 2,
      groups: [{
        locale: "zh_CN",
        storeNumber: "R683",
        items: [
          { partNumber: "AAA/A", availability: { kind: "in_stock" } },
          { partNumber: "BBB/A", availability: { kind: "out_of_stock" } },
        ],
      }],
    });
    expect(body).not.toHaveProperty("rows");
    expect(JSON.stringify(body)).not.toContain("productName");
    expect(String(fetchMock.mock.calls[1]![0])).toContain("parts.1=BBB%2FA");
  });

  it("拒绝缺少 v2 版本号的旧协议请求", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
    const { onRequestPost } = await import("../cloud-functions/api/check");

    const response = await onRequestPost(context({
      targets: [{ locale: "zh_CN", storeNumber: "R683", partNumber: "AAA/A" }],
    }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toMatchObject({
      error: "unsupported_version",
      message: "库存查询接口仅支持 v2 协议",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("拒绝未知协议版本和 Apple Watch 组合字段", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const { onRequestPost } = await import("../cloud-functions/api/check");

    const unsupported = await onRequestPost(context({ version: 3, groups: [] }, "unsupported-version-client"));
    expect(unsupported.status).toBe(400);
    expect(await unsupported.json()).toMatchObject({ error: "unsupported_version" });

    const watch = await onRequestPost(context({
      version: 2,
      groups: [{
        locale: "zh_CN",
        storeNumber: "R683",
        items: [{ partNumber: "CASE/A", companionPart: "BAND/A" }],
      }],
    }, "watch-client"));
    expect(watch.status).toBe(400);
    expect(await watch.json()).toMatchObject({ error: "apple_watch_not_supported" });
    expect(fetch).not.toHaveBeenCalled();

    const duplicateGroups = await onRequestPost(context({
      version: 2,
      groups: [
        { locale: "zh_CN", storeNumber: "R683", items: [{ partNumber: "AAA/A" }] },
        { locale: "zh_CN", storeNumber: "R683", items: [{ partNumber: "BBB/A" }] },
      ],
    }, "duplicate-group-client"));
    expect(duplicateGroups.status).toBe(400);
    expect(await duplicateGroups.json()).toMatchObject({ error: "duplicate_groups" });
    expect(fetch).not.toHaveBeenCalled();
  });
});
