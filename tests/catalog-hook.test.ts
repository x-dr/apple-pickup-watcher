// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { useCatalog } from "../src/hooks/useCatalog";
import { loadCatalog } from "../src/domain/catalog";
vi.mock("../src/domain/catalog", () => ({ loadCatalog: vi.fn() }));

it("切换地区失败时不暴露旧目录，重试可以恢复新目录", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const fixture = (locale: string) => ({ locale, generatedAt: "2026-09-15", sourceCommit: "test", stores: [], products: [] });
  vi.mocked(loadCatalog).mockResolvedValueOnce(fixture("zh_CN")).mockRejectedValueOnce(new Error("模拟目录故障")).mockResolvedValueOnce(fixture("en_MY"));
  const container = document.createElement("div"); const root = createRoot(container);
  let model!: ReturnType<typeof useCatalog>;
  function Probe({ locale }: { locale: string }) { model = useCatalog(locale); return null; }
  try {
    await act(async () => root.render(createElement(Probe, { locale: "zh_CN" })));
    expect(model.catalog?.locale).toBe("zh_CN");
    await act(async () => root.render(createElement(Probe, { locale: "en_MY" })));
    expect(model.catalog).toBeNull(); expect(model.catalogError).toBe("模拟目录故障");
    await act(async () => model.retryCatalog());
    expect(model.catalog?.locale).toBe("en_MY"); expect(model.catalogError).toBeNull();
  } finally { await act(async () => root.unmount()); }
});
