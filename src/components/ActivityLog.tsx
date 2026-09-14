import { CodeOutlined } from "@ant-design/icons";

export function ActivityLog({ logs }: { logs: string[] }) {
  return (
    <section className="panel log-panel">
      <div className="log-heading"><span><CodeOutlined /> 活动日志</span><small>最多保留 200 行</small></div>
      <pre>{logs.length > 0 ? logs.join("\n") : "日志会显示在这里。"}</pre>
    </section>
  );
}
