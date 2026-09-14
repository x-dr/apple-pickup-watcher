import { RequestError } from "./context";
import { knownLocale, type QueryTarget } from "./apple";

const partPattern = /^[A-Z0-9]+\/[A-Z0-9]+$/;
const storePattern = /^R[0-9]{3,4}$/;

function text(value: unknown, name: string, max: number): string {
  if (typeof value !== "string" || !value.trim() || value.length > max) {
    throw new RequestError(400, "invalid_target", `${name} 不合法`);
  }
  return value.trim();
}

export function validateTargets(value: unknown): QueryTarget[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 24) {
    throw new RequestError(400, "invalid_targets", "监控目标数量须为 1 到 24 项");
  }
  const targets = value.map((raw): QueryTarget => {
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
      throw new RequestError(400, "invalid_target", "监控目标格式不正确");
    }
    const item = raw as Record<string, unknown>;
    const locale = text(item.locale, "locale", 10);
    const storeNumber = text(item.storeNumber, "storeNumber", 10);
    const partNumber = text(item.partNumber, "partNumber", 32).toUpperCase();
    if (!knownLocale(locale) || !storePattern.test(storeNumber) || !partPattern.test(partNumber)) {
      throw new RequestError(400, "invalid_target", "地区、门店或零件号不合法");
    }
    const productUrl = text(item.productUrl, "productUrl", 300);
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(productUrl);
    } catch {
      throw new RequestError(400, "invalid_target", "商品地址不合法");
    }
    const appleHost = parsedUrl.hostname === "apple.com" || parsedUrl.hostname.endsWith(".apple.com") || parsedUrl.hostname === "apple.com.cn" || parsedUrl.hostname.endsWith(".apple.com.cn");
    if (parsedUrl.protocol !== "https:" || !appleHost) {
      throw new RequestError(400, "invalid_target", "商品地址必须是 Apple HTTPS 地址");
    }
    const companion = typeof item.companionPart === "string" ? item.companionPart.trim().toUpperCase() : "";
    if (companion && !partPattern.test(companion)) {
      throw new RequestError(400, "invalid_target", "companionPart 不合法");
    }
    return {
      locale,
      storeNumber,
      storeTitle: text(item.storeTitle, "storeTitle", 120),
      partNumber,
      productName: text(item.productName, "productName", 240),
      productUrl: parsedUrl.toString(),
      ...(companion ? { companionPart: companion } : {}),
    };
  });
  const uniqueKeys = new Set(targets.map((item) => `${item.locale}|${item.storeNumber}|${item.partNumber}`));
  if (uniqueKeys.size !== targets.length) {
    throw new RequestError(400, "duplicate_targets", "监控目标中存在重复项");
  }
  const groups = new Set(targets.map((item) => `${item.locale}|${item.storeNumber}`));
  if (groups.size > 6) {
    throw new RequestError(400, "too_many_stores", "一次最多查询 6 家不同门店");
  }
  return targets;
}
