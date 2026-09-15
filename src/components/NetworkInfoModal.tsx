import { ReloadOutlined } from "@ant-design/icons";
import { Alert, Button, Descriptions, Modal } from "antd";
import { useCallback, useEffect, useState } from "react";

import type { NetworkInfoResponse } from "@/domain/types";
import { fetchNetworkInfo } from "@/services/api";

interface Props {
  open: boolean;
  accessToken: string;
  onCancel(): void;
}

function display(values: string[]): string {
  return values.filter((value) => value.trim()).join(" / ") || "—";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "网络 IP 获取失败";
}

export function NetworkInfoModal({ open, accessToken, onCancel }: Props) {
  const [info, setInfo] = useState<NetworkInfoResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const refresh = useCallback(() => setAttempt((value) => value + 1), []);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    void fetchNetworkInfo(accessToken, controller.signal)
      .then(setInfo)
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setError(errorMessage(reason));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [accessToken, attempt, open]);

  const runtime = info?.runtimeIp;
  const networkTypes = runtime
    ? [runtime.mobile ? "移动网络" : "", runtime.proxy ? "代理" : "", runtime.hosting ? "托管网络" : ""]
      .filter(Boolean).join("、") || "普通网络"
    : "—";

  return (
    <Modal
      open={open}
      title="网络 IP 信息"
      width={680}
      onCancel={onCancel}
      footer={[
        <Button key="refresh" icon={<ReloadOutlined />} loading={loading} onClick={refresh}>重新获取</Button>,
        <Button key="close" type="primary" onClick={onCancel}>关闭</Button>,
      ]}
    >
      <p className="network-info-copy">
        客户 IP 来自本次 EdgeOne 请求；函数出口 IP 由运行实例主动访问 IP-API 获取，可能随部署区域或实例变化。
      </p>
      {error && <Alert className="network-info-alert" type="error" showIcon title="获取失败" description={error} />}
      {!info && loading && <p className="network-info-loading" role="status">正在获取网络信息…</p>}
      {info && runtime && (
        <Descriptions
          bordered
          size="small"
          column={{ xs: 1, sm: 2 }}
          items={[
            { key: "client", label: "客户 IP", children: <code className="network-info-value">{info.clientIp ?? "本地环境不可用"}</code>, span: "filled" },
            { key: "runtime", label: "函数出口 IP", children: <code className="network-info-value">{runtime.query}</code>, span: "filled" },
            { key: "location", label: "出口位置", children: display([runtime.continent, runtime.country, runtime.regionName, runtime.city]) },
            { key: "timezone", label: "时区", children: display([runtime.timezone, `UTC ${runtime.offset >= 0 ? "+" : ""}${runtime.offset / 3600}`]) },
            { key: "isp", label: "ISP", children: runtime.isp || "—" },
            { key: "org", label: "组织", children: runtime.org || "—" },
            { key: "as", label: "AS", children: display([runtime.as, runtime.asname]) },
            { key: "reverse", label: "反向解析", children: runtime.reverse || "—" },
            { key: "network", label: "网络属性", children: networkTypes },
            { key: "checked", label: "获取时间", children: new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "medium" }).format(info.checkedAt) },
          ]}
        />
      )}
    </Modal>
  );
}
