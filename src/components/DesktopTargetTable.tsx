import { DeleteOutlined, ExportOutlined } from "@ant-design/icons";
import { Button, Table, type TableProps } from "antd";
import { formatCheckedTime, targetKey, type TargetState } from "@/domain/types";
import { StatusTag, historyDetail } from "./TargetStatus";

interface Props { rows: TargetState[]; checking: boolean; onRemove(key: string): void }

export default function DesktopTargetTable({ rows, checking, onRemove }: Props) {
  const columns: TableProps<TargetState>["columns"] = [
    {
      title: "状态",
      key: "status",
      width: 92,
      render: (_, row) => <StatusTag availability={row.availability} history={historyDetail(row)} />,
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

  return <Table<TargetState> rowKey={(row) => targetKey(row.target)} columns={columns} dataSource={rows}
    pagination={false} loading={checking} tableLayout="fixed" size="middle" />;
}
