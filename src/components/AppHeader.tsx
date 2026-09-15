import {
  ApiOutlined,
  GlobalOutlined,
  KeyOutlined,
  MoonOutlined,
  PauseCircleOutlined,
  PlayCircleOutlined,
  SunOutlined,
} from "@ant-design/icons";
import { Badge, Button, Tooltip } from "antd";

interface Props {
  dark: boolean;
  running: boolean;
  canStart: boolean;
  backendReady: boolean;
  hasToken: boolean;
  onToggleTheme(): void;
  onToggleRunning(): void;
  onOpenAuth(): void;
  onOpenNetwork(): void;
}

export function AppHeader({
  dark,
  running,
  canStart,
  backendReady,
  hasToken,
  onToggleTheme,
  onToggleRunning,
  onOpenAuth,
  onOpenNetwork,
}: Props) {
  return (
    <header className="app-header">
      <div className="brand-block">
        <div className="brand-mark" aria-hidden="true"><ApiOutlined /></div>
        <div>
          <h1>Apple Pickup Watcher</h1>
          <p>Apple 直营店到店取货库存监控</p>
        </div>
      </div>
      <div className="header-actions">
        <Badge
          status={backendReady ? "success" : "default"}
          text={backendReady ? (hasToken ? "服务已连接" : "等待口令") : "服务未连接"}
        />
        <Tooltip title="访问口令">
          <Button
            aria-label="配置访问口令"
            icon={<KeyOutlined />}
            onClick={onOpenAuth}
          />
        </Tooltip>
        <Tooltip title="查看客户与函数出口 IP">
          <Button
            aria-label="查看网络 IP"
            icon={<GlobalOutlined />}
            onClick={onOpenNetwork}
          />
        </Tooltip>
        <Tooltip title={dark ? "切换浅色" : "切换深色"}>
          <Button
            aria-label={dark ? "切换浅色主题" : "切换深色主题"}
            icon={dark ? <SunOutlined /> : <MoonOutlined />}
            onClick={onToggleTheme}
          />
        </Tooltip>
        <Button
          type={running ? "default" : "primary"}
          icon={running ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
          disabled={!running && !canStart}
          onClick={onToggleRunning}
        >
          {running ? "暂停" : "开始监控"}
        </Button>
      </div>
    </header>
  );
}
