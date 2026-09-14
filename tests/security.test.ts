import { describe, expect, it } from "vitest";

import { authorize } from "../cloud-functions/api/_shared/auth";
import { validateTargets } from "../cloud-functions/api/_shared/targets";

function context(token?: string, expected = "correct-horse-battery") {
  return {
    request: new Request("https://example.com/api/verify", {
      headers: token ? { authorization: `Bearer ${token}` } : {},
    }),
    env: { APW_ACCESS_TOKEN: expected },
  };
}

describe("云函数边界", () => {
  it("拒绝缺失和错误访问口令", () => {
    expect(authorize(context())?.status).toBe(401);
    expect(authorize(context("wrong"))?.status).toBe(401);
    expect(authorize(context("correct-horse-battery"))).toBeNull();
  });

  it("生产环境未配置口令时失败关闭", () => {
    const result = authorize({ request: new Request("https://example.com/api/check"), env: {} });
    expect(result?.status).toBe(503);
  });

  it("拒绝非 Apple 商品链接", () => {
    expect(() => validateTargets([{
      locale: "zh_CN",
      storeNumber: "R683",
      storeTitle: "上海-环球港",
      partNumber: "MJTF4CH/A",
      productName: "iPhone",
      productUrl: "https://example.com/not-apple",
    }])).toThrow("Apple HTTPS");
  });
});
