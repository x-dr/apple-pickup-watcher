import { Alert, App as AntApp, ConfigProvider, theme } from "antd";
import zhCN from "antd/locale/zh_CN";
import { useEffect, useMemo, useState } from "react";

import { AccessTokenModal } from "@/components/AccessTokenModal";
import { ActivityLog } from "@/components/ActivityLog";
import { AppHeader } from "@/components/AppHeader";
import { SettingsPanel } from "@/components/SettingsPanel";
import { SummaryCards } from "@/components/SummaryCards";
import { TargetBuilder } from "@/components/TargetBuilder";
import { TargetList } from "@/components/TargetList";
import { useWatcher } from "@/hooks/useWatcher";

function Dashboard() {
  const watcher = useWatcher();
  const [dark, setDark] = useState(() => window.matchMedia("(prefers-color-scheme: dark)").matches);

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
  }, [dark]);

  const catalogFreshness = useMemo(() => {
    if (!watcher.catalog) return "";
    return new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium" }).format(
      new Date(watcher.catalog.generatedAt),
    );
  }, [watcher.catalog]);

  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        algorithm: dark ? theme.darkAlgorithm : theme.defaultAlgorithm,
        token: {
          colorPrimary: "#2563eb",
          colorSuccess: "#16a34a",
          colorWarning: "#ea580c",
          borderRadius: 12,
          fontFamily: 'Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        },
        components: {
          Button: { controlHeight: 38 },
          Select: { controlHeight: 40 },
          Input: { controlHeight: 40 },
          Table: { headerBg: dark ? "#18202f" : "#f7f9fc", rowHoverBg: dark ? "#18202f" : "#f8fbff" },
        },
      }}
    >
      <AntApp>
        <div className="page-shell">
          <AppHeader
            dark={dark}
            running={watcher.running}
            canStart={watcher.rows.length > 0 && Boolean(watcher.accessToken || !watcher.health?.authConfigured)}
            backendReady={Boolean(watcher.health && !watcher.healthError)}
            hasToken={Boolean(watcher.accessToken)}
            onToggleTheme={() => setDark((value) => !value)}
            onToggleRunning={() => watcher.setRunning(!watcher.running)}
            onOpenAuth={() => watcher.setAuthOpen(true)}
          />

          {watcher.health && !watcher.health.authConfigured && (
            <Alert
              type="warning"
              showIcon
              title="服务端尚未配置访问口令"
              description="请在 EdgeOne Makers 环境变量中设置至少 16 位的 APW_ACCESS_TOKEN 后重新部署。公网环境不应开启匿名模式。"
            />
          )}
          {watcher.healthError && (
            <Alert type="error" showIcon title="无法连接 Node 云函数" description={watcher.healthError} />
          )}
          {watcher.trouble && (
            <Alert
              type="error"
              showIcon
              title="监控当前不可信"
              description={`${watcher.trouble}。此时不能把列表状态当作门店真实库存。`}
            />
          )}
          {watcher.catalogError && (
            <Alert type="error" showIcon title="型号目录载入失败" description={watcher.catalogError} />
          )}

          <SummaryCards rows={watcher.rows} />

          <main className="dashboard-grid">
            <div className="primary-column">
              <TargetBuilder
                locale={watcher.settings.locale}
                catalog={watcher.catalog}
                loading={watcher.catalogLoading}
                rows={watcher.rows}
                onLocaleChange={(locale) => watcher.updateSettings({ locale })}
                onAdd={watcher.addTarget}
              />
              <TargetList rows={watcher.rows} checking={watcher.checking} onRemove={watcher.removeTarget} />
            </div>
            <aside className="side-column">
              <SettingsPanel
                settings={watcher.settings}
                health={watcher.health}
                checking={watcher.checking}
                onChange={watcher.updateSettings}
                onCheck={() => void watcher.runCheck()}
                onTest={() => void watcher.testNotifications()}
              />
              <ActivityLog logs={watcher.logs} />
            </aside>
          </main>

          <footer className="page-footer">
            <span>目录快照：{catalogFreshness || "载入中"}</span>
            {watcher.running && watcher.nextCheckAt && (
              <span>下一轮约 {new Date(watcher.nextCheckAt).toLocaleTimeString("zh-CN", { hour12: false })}</span>
            )}
            <span>页面关闭后监控会停止</span>
            <a href="https://github.com/ENCHIGO/apple-pickup-watcher" target="_blank" rel="noreferrer">原项目与许可</a>
          </footer>
        </div>

        <AccessTokenModal
          open={watcher.authOpen}
          checking={watcher.authChecking}
          error={watcher.authError}
          hasToken={Boolean(watcher.accessToken)}
          onCancel={() => watcher.setAuthOpen(false)}
          onSubmit={watcher.submitAccessToken}
        />
      </AntApp>
    </ConfigProvider>
  );
}

export default Dashboard;
