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

function queryTarget(item: Record<string, unknown>, inherited?: Pick<QueryTarget, "locale" | "storeNumber">): QueryTarget {
  if (item.companionPart !== undefined) {
    throw new RequestError(400, "apple_watch_not_supported", "不再支持 Apple Watch 组合型号");
  }
  const locale = inherited?.locale ?? text(item.locale, "locale", 10);
  const storeNumber = inherited?.storeNumber ?? text(item.storeNumber, "storeNumber", 10);
  const partNumber = text(item.partNumber, "partNumber", 32).toUpperCase();
  if (!knownLocale(locale) || !storePattern.test(storeNumber) || !partPattern.test(partNumber)) {
    throw new RequestError(400, "invalid_target", "地区、门店或零件号不合法");
  }
  return { locale, storeNumber, partNumber };
}

function assertUniqueTargets(targets: QueryTarget[]): void {
  const uniqueKeys = new Set(targets.map((item) => `${item.locale}|${item.storeNumber}|${item.partNumber}`));
  if (uniqueKeys.size !== targets.length) {
    throw new RequestError(400, "duplicate_targets", "监控目标中存在重复项");
  }
}

export function validateGroups(value: unknown): QueryTarget[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 6) {
    throw new RequestError(400, "invalid_groups", "门店分组数量须为 1 到 6 组");
  }
  const targets: QueryTarget[] = [];
  const groupKeys = new Set<string>();
  for (const rawGroup of value) {
    if (typeof rawGroup !== "object" || rawGroup === null || Array.isArray(rawGroup)) {
      throw new RequestError(400, "invalid_group", "门店分组格式不正确");
    }
    const group = rawGroup as Record<string, unknown>;
    const locale = text(group.locale, "locale", 10);
    const storeNumber = text(group.storeNumber, "storeNumber", 10);
    if (!knownLocale(locale) || !storePattern.test(storeNumber)) {
      throw new RequestError(400, "invalid_group", "地区或门店不合法");
    }
    const groupKey = `${locale}|${storeNumber}`;
    if (groupKeys.has(groupKey)) {
      throw new RequestError(400, "duplicate_groups", "门店分组中存在重复项");
    }
    groupKeys.add(groupKey);
    if (!Array.isArray(group.items) || group.items.length === 0) {
      throw new RequestError(400, "invalid_items", "每个门店分组至少包含一个型号");
    }
    for (const rawItem of group.items) {
      if (typeof rawItem !== "object" || rawItem === null || Array.isArray(rawItem)) {
        throw new RequestError(400, "invalid_item", "型号格式不正确");
      }
      targets.push(queryTarget(rawItem as Record<string, unknown>, { locale, storeNumber }));
      if (targets.length > 24) {
        throw new RequestError(400, "invalid_targets", "监控目标数量须为 1 到 24 项");
      }
    }
  }
  assertUniqueTargets(targets);
  return targets;
}
