import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { onRequestPost } from "../cloud-functions/api/notify";
let client = 0;
function context() {
  return {
    clientIp: `test-client-${client++}`,
    env: { APW_ACCESS_TOKEN: "fixture-access-token", BARK_URL: "https://bark.example.invalid/fixture-key" },
    request: new Request("https://example.invalid/api/notify", { method: "POST", headers: { authorization: "Bearer fixture-access-token", "content-type": "application/json" }, body: JSON.stringify({ title: "库存提醒", body: "测试消息", url: "https://www.apple.com.cn/shop/product/AAA/A" }) }),
  };
}
beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
afterEach(() => vi.unstubAllGlobals());

describe("Bark 推送确认", () => {
  it("HTTP 和业务响应都成功才记录成功，禁止跳转", async () => {
    vi.mocked(fetch).mockResolvedValue(Response.json({ code: 200 }));
    expect((await onRequestPost(context())).status).toBe(200);
    expect(vi.mocked(fetch).mock.calls[0]![1]?.redirect).toBe("error");
  });
  it.each(["<html>gateway page</html>", '{"code":500}']) ("拒绝 HTTP 200 中的无效确认 %s", async (body) => {
    vi.mocked(fetch).mockResolvedValue(new Response(body));
    const response = await onRequestPost(context());
    expect(response.status).toBe(502); expect(await response.json()).toMatchObject({ error: "bark_failed" });
  });
});
