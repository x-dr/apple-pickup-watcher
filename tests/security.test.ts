import { describe, expect, it } from "vitest";

import { authorize } from "../cloud-functions/api/_shared/auth";
import { validateGroups } from "../cloud-functions/api/_shared/targets";

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

  it("v2 查询边界只保留查询所需字段", () => {
    expect(validateGroups([{
      locale: "zh_CN",
      storeNumber: "R683",
      items: [{
        partNumber: "mjtf4ch/a",
        storeTitle: "上海-环球港",
        productName: "iPhone",
        productUrl: "https://example.com/not-sent-upstream",
      }],
    }])).toEqual([{
      locale: "zh_CN",
      storeNumber: "R683",
      partNumber: "MJTF4CH/A",
    }]);
  });
});
