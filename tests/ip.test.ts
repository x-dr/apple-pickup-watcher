import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { onRequestGet, onRequestOptions } from "../cloud-functions/api/ip";
import { fetchNetworkInfo } from "../src/services/api";

const upstreamResponse = {
  status: "success",
  message: null,
  continent: "亚洲",
  continentCode: "AS",
  country: "新加坡",
  countryCode: "SG",
  region: "01",
  regionName: "Singapore",
  city: "Singapore",
  district: "",
  zip: "",
  lat: 1.29,
  lon: 103.85,
  timezone: "Asia/Singapore",
  offset: 28800,
  currency: "SGD",
  isp: "Fixture ISP",
  org: "Fixture Org",
  as: "AS64500 Fixture",
  asname: "FIXTURE-AS",
  reverse: "fixture.example",
  mobile: false,
  proxy: false,
  hosting: true,
  query: "203.0.113.10",
};

let client = 0;
function context(env: Record<string, string | undefined> = { APW_ACCESS_TOKEN: "fixture-access-token", APW_IP_API_KEY: "fixture-api-key" }) {
  return {
    clientIp: `198.51.100.${++client}`,
    env,
    request: new Request("https://example.invalid/api/ip", {
      headers: { authorization: "Bearer fixture-access-token" },
    }),
  };
}

beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
afterEach(() => vi.unstubAllGlobals());

describe("网络 IP 云函数", () => {
  it("返回可信客户 IP 和函数出口信息，且不泄露 API Key", async () => {
    vi.mocked(fetch).mockResolvedValue(Response.json(upstreamResponse));
    const response = await onRequestGet(context());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(payload).toMatchObject({
      clientIp: expect.stringMatching(/^198\.51\.100\./),
      runtimeIp: { query: "203.0.113.10", hosting: true },
    });
    expect(JSON.stringify(payload)).not.toContain("fixture-api-key");

    const url = new URL(String(vi.mocked(fetch).mock.calls[0]![0]));
    expect(`${url.origin}${url.pathname}`).toBe("https://pro.ip-api.com/json/");
    expect(url.searchParams.get("lang")).toBe("zh-CN");
    expect(url.searchParams.get("key")).toBe("fixture-api-key");
    expect(url.searchParams.get("fields")?.split(",")).toContain("query");
  });

  it("未配置 Key 时失败关闭且不请求上游", async () => {
    const response = await onRequestGet(context({ APW_ACCESS_TOKEN: "fixture-access-token" }));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: "ip_api_not_configured" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("兼容从 EdgeOne request.eo 读取客户 IP", async () => {
    vi.mocked(fetch).mockResolvedValue(Response.json(upstreamResponse));
    const value = context();
    delete (value as { clientIp?: string }).clientIp;
    Object.defineProperty(value.request, "eo", { value: { clientIp: "198.51.100.88" } });
    const response = await onRequestGet(value);
    expect(await response.json()).toMatchObject({ clientIp: "198.51.100.88" });
  });

  it("拒绝上游失败响应", async () => {
    vi.mocked(fetch).mockResolvedValue(Response.json({ status: "fail", message: "invalid query" }));
    const response = await onRequestGet(context());
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({ error: "ip_api_failed" });
  });

  it("响应 CORS 预检", () => {
    const response = onRequestOptions();
    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-methods")).toBe("GET, OPTIONS");
  });
});

describe("网络 IP 前端边界", () => {
  it("携带访问口令并读取响应", async () => {
    vi.mocked(fetch).mockResolvedValue(Response.json({
      clientIp: "198.51.100.20",
      runtimeIp: upstreamResponse,
      checkedAt: 1_789_520_000_000,
    }));
    const result = await fetchNetworkInfo("fixture-access-token");
    expect(result.runtimeIp.query).toBe("203.0.113.10");
    expect(vi.mocked(fetch).mock.calls[0]![1]?.headers).toMatchObject({
      authorization: "Bearer fixture-access-token",
    });
  });
});
