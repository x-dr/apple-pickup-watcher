import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const upstream = resolve(process.argv[2] ?? process.env.APW_UPSTREAM_DIR ?? "../apple-pickup-watcher-upstream");
const dataDir = resolve(upstream, "crates/apw-core/data");
const outputDir = resolve("public/catalog");
const locales = ["zh_CN", "zh_HK", "zh_TW", "ja_JP", "en_SG", "en_AU", "en_MY"];
const supportedCategories = new Set(["iphone", "ipad", "mac"]);

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function firstText(html) {
  if (typeof html !== "string") return "";
  const withBoundaries = html
    .replace(/<([a-z][\w-]*)[^>]*class=["'][^"']*\bbadge\b[^"']*["'][^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<(div|p|br|li|section|article|h\d)\b[^>]*>/gi, "\n")
    .replace(/<span\b[^>]*class=["'][^"']*(?:form-label-small|as-subheading)[^"']*["'][^>]*>/gi, "\n")
    .replace(/<(?:as-footnote|sup)\b[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, value) => String.fromCodePoint(Number(value)))
    .replace(/&#x([0-9a-f]+);/gi, (_, value) => String.fromCodePoint(Number.parseInt(value, 16)));
  return (
    withBoundaries
      .split(/[\r\n]+/)
      .map((part) => part.replace(/[\u200b-\u200d\u2060\ufeff]/g, "").replace(/\s+/g, " ").trim())
      .find(Boolean) ?? ""
  );
}

function normalizeCapacity(value) {
  const match = String(value ?? "").trim().match(/^(.*?)\s*(tb|gb|mb)$/i);
  return match ? `${match[1].trim()}${match[2].toUpperCase()}` : String(value ?? "").trim();
}

const familyWords = [
  ["pro", "Pro"],
  ["max", "Max"],
  ["plus", "Plus"],
  ["mini", "mini"],
  ["air", "Air"],
  ["duo", "Duo"],
  ["se", "SE"],
  ["e", "e"],
];

function familyDisplayName(raw) {
  const input = String(raw ?? "").trim().toLowerCase().split("_")[0];
  const prefix = input.startsWith("iphone")
    ? ["iphone", "iPhone"]
    : input.startsWith("ipad")
      ? ["ipad", "iPad"]
      : null;
  if (!prefix) return null;
  const rest = input.slice(prefix[0].length);
  const tokens = [prefix[1]];
  for (let index = 0; index < rest.length; ) {
    const number = rest.slice(index).match(/^\d+/)?.[0];
    if (number) {
      tokens.push(number);
      index += number.length;
      continue;
    }
    const word = familyWords.find(([value]) => rest.startsWith(value, index));
    if (word) {
      if (word[0] === "e" && /^\d/.test(tokens.at(-1) ?? "")) tokens[tokens.length - 1] += word[1];
      else tokens.push(word[1]);
      index += word[0].length;
      continue;
    }
    const unknown = rest.slice(index).match(/^[^\d]+/)?.[0] ?? rest[index];
    tokens.push(unknown.charAt(0).toUpperCase() + unknown.slice(1));
    index += unknown.length;
  }
  return tokens.join(" ");
}

const slugWords = new Map([
  ["iphone", "iPhone"], ["ipad", "iPad"], ["imac", "iMac"], ["macbook", "MacBook"],
  ["mac", "Mac"], ["apple", "Apple"], ["air", "Air"],
  ["pro", "Pro"], ["max", "Max"], ["mini", "mini"], ["se", "SE"],
  ["ultra", "Ultra"], ["studio", "Studio"], ["xdr", "XDR"],
]);

function slugDisplayName(slug) {
  return slug
    .split("-")
    .filter(Boolean)
    .map((word) => slugWords.get(word.toLowerCase()) ?? word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

const dimensionRank = new Map([
  ["dimensionScreensize", 10], ["dimensionChip", 40], ["dimensionCapacity", 60], ["dimensionConnection", 70],
  ["dimensionFinish", 80], ["dimensionColor", 90],
]);

function dimensions(product) {
  const source = product.dimensions && typeof product.dimensions === "object"
    ? product.dimensions
    : Object.fromEntries(
        Object.entries(product).filter(([key, value]) =>
          key.startsWith("dimension") && key !== "dimensionSteporder" && typeof value === "string"),
      );
  return Object.entries(source)
    .filter(([, value]) => typeof value === "string" && value.trim())
    .map(([key, value]) => ({
      key,
      name: key.includes("-dimension") ? key.slice(key.indexOf("-dimension") + 1) : key,
      value: value.trim(),
    }))
    .sort((a, b) => (dimensionRank.get(a.name) ?? 50) - (dimensionRank.get(b.name) ?? 50) || a.key.localeCompare(b.key));
}

function partNumber(product) {
  const direct = [product.partNumber, product.btrOrFdPartNumber].find(
    (value) => typeof value === "string" && value.trim(),
  );
  return direct ? direct.trim() : "";
}

function displayName(data, key, value) {
  for (const group of [data.displayValues, data.mainDisplayValues]) {
    const entry = group?.[key]?.[value];
    if (!entry) continue;
    for (const field of ["value", "header", "text"]) {
      const text = firstText(entry[field]);
      if (text) return text;
    }
  }
  return "";
}

function productsFromPage(page) {
  const data = page.data ?? {};
  const rawProducts = Array.isArray(data.products) ? data.products : [];
  const variants = new Map();
  for (const product of rawProducts) {
    for (const dimension of dimensions(product)) {
      const values = variants.get(dimension.key) ?? new Set();
      values.add(dimension.value);
      variants.set(dimension.key, values);
    }
  }

  const seen = new Set();
  const products = [];
  for (const raw of rawProducts) {
    const part = partNumber(raw);
    if (!part || seen.has(part)) continue;
    seen.add(part);
    const decodedFamily = familyDisplayName(raw.familyType);
    const labels = [];
    let capacity = "";
    let color = "";
    for (const dimension of dimensions(raw)) {
      if (dimension.name === "dimensionScreensize" && decodedFamily) continue;
      let label = "";
      if (dimension.name === "dimensionCapacity") {
        capacity = normalizeCapacity(dimension.value);
        label = capacity;
      } else {
        label = displayName(data, dimension.key, dimension.value);
        if (!label && (variants.get(dimension.key)?.size ?? 0) > 1 && !/\d/.test(dimension.value)) {
          label = dimension.value;
        }
        if (dimension.name === "dimensionColor") color = label;
      }
      if (label) labels.push(label);
    }
    products.push({
      partNumber: part,
      category: page.category,
      family: String(raw.familyType ?? "").trim() || page.family,
      capacity,
      color,
      title: [decodedFamily ?? slugDisplayName(page.family), ...labels].filter(Boolean).join(" "),
    });
  }

  const titleCounts = new Map();
  for (const product of products) titleCounts.set(product.title, (titleCounts.get(product.title) ?? 0) + 1);
  for (const product of products) {
    if ((titleCounts.get(product.title) ?? 0) > 1) product.title += ` ${product.partNumber}`;
  }
  return products;
}

function normalizeStores(regions, locale) {
  const region = regions.find((item) => item.locale === locale);
  if (!region) return [];
  const stores = [];
  const seen = new Set();
  const push = (raw, stateName = "") => {
    const number = String(raw.id ?? "").trim();
    if (!number || seen.has(number)) return;
    seen.add(number);
    const name = String(raw.name ?? "").trim();
    const city = region.hasStates
      ? String(raw.address?.stateName ?? stateName).trim()
      : String(raw.address?.city ?? "").trim();
    stores.push({ number, name, title: city ? `${city}-${name}` : name });
  };
  for (const state of region.state ?? []) for (const store of state.store ?? []) push(store, state.name);
  for (const store of region.store ?? []) push(store);
  return stores;
}

const stores = readJson(resolve(dataDir, "stores.json"));
const sourceCommit = execFileSync("git", ["-C", upstream, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const generatedAt = execFileSync("git", ["-C", upstream, "log", "-1", "--format=%cI"], { encoding: "utf8" }).trim();
mkdirSync(outputDir, { recursive: true });

for (const locale of locales) {
  const pages = readJson(resolve(dataDir, `products_${locale}.json`));
  const byPart = new Map();
  for (const page of pages) {
    if (!supportedCategories.has(page.category)) continue;
    for (const product of productsFromPage(page)) {
      if (!byPart.has(product.partNumber)) byPart.set(product.partNumber, product);
    }
  }
  const payload = {
    locale,
    generatedAt,
    sourceCommit,
    stores: normalizeStores(stores, locale),
    products: [...byPart.values()],
  };
  writeFileSync(resolve(outputDir, `${locale}.json`), `${JSON.stringify(payload)}\n`);
  console.log(`${locale}: ${payload.stores.length} stores, ${payload.products.length} products`);
}
