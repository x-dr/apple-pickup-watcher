import { REGIONS, type CatalogPayload, type Category, type Product } from "./types";

const cache = new Map<string, Promise<CatalogPayload>>();

export function loadCatalog(locale: string): Promise<CatalogPayload> {
  if (!REGIONS.some((region) => region.locale === locale)) return Promise.reject(new Error("不支持的地区"));
  const existing = cache.get(locale);
  if (existing) return existing;

  const request = fetch(`/catalog/${locale}.json`, { cache: "no-cache", signal: AbortSignal.timeout(15_000) }).then(
    async (response) => {
      if (!response.ok) {
        throw new Error(`目录载入失败（HTTP ${response.status}）`);
      }
      const value = (await response.json()) as CatalogPayload;
      if (!value || value.locale !== locale || !Array.isArray(value.stores) || !Array.isArray(value.products) ||
        !Number.isFinite(Date.parse(value.generatedAt)) || typeof value.sourceCommit !== "string" ||
        !value.stores.every((store) => store && [store.number, store.name, store.title].every((field) => typeof field === "string")) ||
        !value.products.every((product) => product && [product.partNumber, product.family, product.capacity, product.color, product.title].every((field) => typeof field === "string") &&
          ["iphone", "ipad", "mac"].includes(product.category))) {
        throw new Error("目录数据格式或地区不正确");
      }
      return value;
    },
  ).catch((error: unknown) => {
    cache.delete(locale);
    throw error;
  });
  cache.set(locale, request);
  return request;
}

export function productsInCategory(products: Product[], category: Category): Product[] {
  return products.filter((product) => product.category === category);
}

export function uniqueOptions(
  values: Array<{ value: string; label: string }>,
): Array<{ value: string; label: string }> {
  const seen = new Set<string>();
  return values.filter((item) => {
    if (seen.has(item.value)) return false;
    seen.add(item.value);
    return true;
  });
}

export function familyOptions(products: Product[], category: Category) {
  return uniqueOptions(
    productsInCategory(products, category).map((product) => ({
      value: product.family,
      label:
        product.title
          .replace(product.capacity, "")
          .replace(product.color, "")
          .replace(/\s+/g, " ")
          .trim() || product.family,
    })),
  );
}

export function capacityOptions(products: Product[], category: Category, family: string) {
  return uniqueOptions(
    products
      .filter(
        (product) =>
          product.category === category &&
          product.family === family &&
          product.capacity !== "",
      )
      .map((product) => ({ value: product.capacity, label: product.capacity })),
  );
}

export function colorOptions(
  products: Product[],
  category: Category,
  family: string,
  capacity: string,
) {
  return uniqueOptions(
    products
      .filter(
        (product) =>
          product.category === category &&
          product.family === family &&
          product.capacity === capacity &&
          product.color !== "",
      )
      .map((product) => ({ value: product.color, label: product.color })),
  );
}
