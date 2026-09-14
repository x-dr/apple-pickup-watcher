import { DeleteOutlined, ExportOutlined } from "@ant-design/icons";
import { Button, Empty, Table, Tag, Tooltip, type TableProps } from "antd";

import {
  availabilityDetail,
  availabilityLabel,
  formatCheckedTime,
  targetKey,
  type Availability,
  type TargetState,
} from "@/domain/types";

function StatusTag({ availability }: { availability: Availability }) {
  const label = availabilityLabel(availability);
  const color = availability.kind === "in_stock"
    ? "success"
    : availability.kind === "out_of_stock"
      ? "default"
      : availability.reason === "not_yet_checked"
        ? "processing"
        : "error";
  const tag = <Tag color={color}>{label}</Tag>;
  const detail = availabilityDetail(availability);
  return detail ? <Tooltip title={detail}>{tag}</Tooltip> : tag;
}

interface Props {
  rows: TargetState[];
  checking: boolean;
  onRemove(key: string): void;
}

export function TargetList({ rows, checking, onRemove }: Props) {
  const columns: TableProps<TargetState>["columns"] = [
    {
      title: "状态",
      key: "status",
      width: 92,
      render: (_, row) => <StatusTag availability={row.availability} />,
    },
    {
      title: "门店",
      dataIndex: ["target", "storeTitle"],
      key: "store",
      width: 190,
    },
    {
      title: "型号",
      dataIndex: ["target", "productName"],
      key: "product",
      ellipsis: true,
    },
    {
      title: "最后检查",
      key: "checkedAt",
      width: 112,
      render: (_, row) => <span className="tabular">{formatCheckedTime(row.lastCheckedMs)}</span>,
    },
    {
      title: "操作",
      key: "actions",
      width: 130,
      render: (_, row) => (
        <div className="row-actions">
          <Button type="link" size="small" href={row.target.productUrl} target="_blank" icon={<ExportOutlined />}>Apple</Button>
          <Button
            type="text"
            danger
            size="small"
            aria-label={`删除 ${row.target.productName}`}
            icon={<DeleteOutlined />}
            onClick={() => onRemove(targetKey(row.target))}
          />
        </div>
      ),
    },
  ];

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
          <div className="desktop-targets">
            <Table<TargetState>
              rowKey={(row) => targetKey(row.target)}
              columns={columns}
              dataSource={rows}
              pagination={false}
              loading={checking}
              tableLayout="fixed"
              size="middle"
            />
          </div>
          <div className="mobile-targets">
            {rows.map((row) => (
              <article className="target-card" key={targetKey(row.target)}>
                <div className="target-card-top">
                  <StatusTag availability={row.availability} />
                  <span className="tabular">{formatCheckedTime(row.lastCheckedMs)}</span>
                </div>
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
          </div>
        </>
      )}
    </section>
  );
}
