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
  onRemove(key: string): void;
}

export function TargetList({ rows, checking, onRemove }: Props) {
  const [mobile, setMobile] = useState(() => window.matchMedia("(max-width: 720px)").matches);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 720px)");
    const change = () => setMobile(media.matches);
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);

  return (
    <section className="panel targets-panel">
      <div className="section-heading">
        <div><span className="eyebrow">LIVE WATCHLIST</span><h2>监控列表</h2></div>
        <span className="section-note">持续有货不会重复提醒</span>
      </div>
      {rows.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="选择门店和型号后添加监控目标" />
      ) : (
        <>
          {!mobile ? <div className="desktop-targets">
            <Suspense fallback={<Skeleton active paragraph={{ rows: 2 }} />}>
              <DesktopTargetTable rows={rows} checking={checking} onRemove={onRemove} />
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
