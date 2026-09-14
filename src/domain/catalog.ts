import type { CatalogPayload, Category, Product } from "./types";

const cache = new Map<string, Promise<CatalogPayload>>();

export function loadCatalog(locale: string): Promise<CatalogPayload> {
  const existing = cache.get(locale);
  if (existing) return existing;

  const request = fetch(`/catalog/${locale}.json`, { cache: "force-cache" }).then(
    async (response) => {
      if (!response.ok) {
        throw new Error(`目录载入失败（HTTP ${response.status}）`);
      }
      return (await response.json()) as CatalogPayload;
    },
  );
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
