import { DeleteOutlined, ExportOutlined } from "@ant-design/icons";
import { Button, Empty, Skeleton } from "antd";
import { lazy, Suspense, useEffect, useState } from "react";
import { StatusTag, historyDetail } from "./TargetStatus";

import {
  availabilityDetail,
  formatCheckedTime,
  targetKey,
  type TargetState,
} from "@/domain/types";

const DesktopTargetTable = lazy(() => import("./DesktopTargetTable"));
interface Props {
  rows: TargetState[];
  checking: boolean;
  nextCheckAt: number | null;
  onRemove(key: string): void;
}

export function TargetList({ rows, checking, nextCheckAt, onRemove }: Props) {
  const [mobile, setMobile] = useState(() => window.matchMedia("(max-width: 720px)").matches);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 720px)");
    const change = () => setMobile(media.matches);
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);
  useEffect(() => {
    if (nextCheckAt === null) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [nextCheckAt]);

  const secondsUntilNextCheck = nextCheckAt === null
    ? null
    : Math.max(0, Math.ceil((nextCheckAt - now) / 1_000));

  return (
    <section className="panel targets-panel">
      <div className="section-heading">
        <div>
          <span className="eyebrow">LIVE WATCHLIST</span>
          <div className="target-list-title">
            <h2>监控列表</h2>
            {checking ? (
              <span className="next-check-time" role="status">正在查询</span>
            ) : secondsUntilNextCheck !== null ? (
              <span className="next-check-time" role="timer">下次查询：{secondsUntilNextCheck} 秒后</span>
            ) : null}
          </div>
        </div>
        <span className="section-note">持续有货不会重复提醒</span>
      </div>
      {rows.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="选择门店和型号后添加监控目标" />
      ) : (
        <>
          {!mobile ? <div className="desktop-targets">
            <Suspense fallback={<Skeleton active paragraph={{ rows: 2 }} />}>
              <DesktopTargetTable rows={rows} onRemove={onRemove} />
            </Suspense>
          </div> :
          <div className="mobile-targets" aria-busy={checking}>
            {checking && <span role="status">正在查询…</span>}
            {rows.map((row) => (
              <article className="target-card" key={targetKey(row.target)}>
                <div className="target-card-top">
                  <StatusTag availability={row.availability} />
                  <span className="tabular">{formatCheckedTime(row.lastCheckedMs)}</span>
                </div>
                {historyDetail(row) && <span>{historyDetail(row)}</span>}
                <strong>{row.target.productName}</strong>
                <span>{row.target.storeTitle}</span>
                {availabilityDetail(row.availability) && (
                  <p className="target-detail">{availabilityDetail(row.availability)}</p>
                )}
                <div className="target-card-actions">
                  <Button type="link" href={row.target.productUrl} target="_blank" icon={<ExportOutlined />}>前往 Apple</Button>
                  <Button danger type="text" icon={<DeleteOutlined />} onClick={() => onRemove(targetKey(row.target))}>删除</Button>
                </div>
              </article>
            ))}
          </div>}
        </>
      )}
    </section>
  );
}
