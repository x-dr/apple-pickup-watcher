import { CheckCircleFilled, ClockCircleOutlined, ExclamationCircleFilled, ShopOutlined } from "@ant-design/icons";
import type { TargetState } from "@/domain/types";

export function SummaryCards({ rows }: { rows: TargetState[] }) {
  const inStock = rows.filter((row) => row.availability.kind === "in_stock").length;
  const unknown = rows.filter(
    (row) => row.availability.kind === "unknown" && row.availability.reason !== "not_yet_checked",
  ).length;
  const checked = rows.filter((row) => row.lastCheckedMs !== null).length;
  const items = [
    { label: "监控目标", value: rows.length, icon: <ShopOutlined />, tone: "neutral" },
    { label: "确认有货", value: inStock, icon: <CheckCircleFilled />, tone: "positive" },
    { label: "状态未知", value: unknown, icon: <ExclamationCircleFilled />, tone: "warning" },
    { label: "已完成查询", value: checked, icon: <ClockCircleOutlined />, tone: "info" },
  ];
  return (
    <section className="summary-grid" aria-label="监控摘要">
      {items.map((item) => (
        <article className={`summary-card ${item.tone}`} key={item.label}>
          <span className="summary-icon">{item.icon}</span>
          <div><strong>{item.value}</strong><span>{item.label}</span></div>
        </article>
      ))}
    </section>
  );
}
