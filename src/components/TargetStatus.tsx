import { Tag, Tooltip } from "antd";
import { availabilityDetail, availabilityLabel, formatCheckedTime, type Availability, type TargetState } from "@/domain/types";

export function StatusTag({ availability, history }: { availability: Availability; history?: string | null }) {
  const label = availabilityLabel(availability);
  const color = availability.kind === "in_stock"
    ? "success"
    : availability.kind === "out_of_stock"
      ? "default"
      : availability.reason === "not_yet_checked"
        ? "processing"
        : "error";
  const tag = <Tag color={color}>{label}</Tag>;
  const detail = [availabilityDetail(availability), history].filter(Boolean).join("；");
  return detail ? <Tooltip title={detail}>{tag}</Tooltip> : tag;
}

export function historyDetail(row: TargetState): string | null {
  if (row.availability.kind !== "unknown" || !row.lastConfirmed) return null;
  return `上次确认${row.lastConfirmed.kind === "in_stock" ? "有货" : "无货"}：${formatCheckedTime(row.lastConfirmed.checkedAt)}`;
}
