import { describe, expect, it } from "vitest";

import { productUrl } from "../src/domain/types";

describe("Apple 商品链接", () => {
  it("按 SKU 打开对应的 iPhone、iPad 或 Mac 配置", () => {
    expect(productUrl("zh_CN", "MJT74CH/A")).toBe(
      "https://www.apple.com.cn/shop/product/MJT74CH/A",
    );
    expect(productUrl("zh_TW", "MDWK4TA/A")).toBe(
      "https://www.apple.com/tw/shop/product/MDWK4TA/A",
    );
  });
});
