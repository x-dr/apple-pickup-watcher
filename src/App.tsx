import { Alert, App as AntApp, Button, ConfigProvider, theme } from "antd";
import zhCN from "antd/locale/zh_CN";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";

import { ActivityLog } from "@/components/ActivityLog";
import { AppHeader } from "@/components/AppHeader";
import { SettingsPanel } from "@/components/SettingsPanel";
import { SummaryCards } from "@/components/SummaryCards";
import { TargetBuilder } from "@/components/TargetBuilder";
import { TargetList } from "@/components/TargetList";
import { useWatcher } from "@/hooks/useWatcher";

const AccessTokenModal = lazy(() => import("@/components/AccessTokenModal").then((module) => ({ default: module.AccessTokenModal })));

function Dashboard() {
  const watcher = useWatcher();
  const canCheck = watcher.rows.length > 0 && Boolean(watcher.health && !watcher.healthError && (watcher.accessToken || !watcher.health.authConfigured));
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
            canStart={canCheck}
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
            <Alert type="error" showIcon title="无法连接监控服务" description={watcher.healthError}
              action={<Button onClick={watcher.retryHealth}>重试连接</Button>} />
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
            <Alert type="error" showIcon title="型号目录载入失败" description={watcher.catalogError}
              action={<Button loading={watcher.catalogLoading} onClick={watcher.retryCatalog}>重新加载</Button>} />
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
                onAddMany={watcher.addTargets}
              />
              <TargetList
                rows={watcher.rows}
                checking={watcher.checking}
                nextCheckAt={watcher.nextCheckAt}
                onRemove={watcher.removeTarget}
              />
            </div>
            <aside className="side-column">
              <SettingsPanel
                settings={watcher.settings}
                health={watcher.health}
                checking={watcher.checking}
                canCheck={canCheck}
                testing={watcher.notificationTesting}
                onChange={watcher.updateSettings}
                onCheck={() => void watcher.runCheck()}
                onTest={() => void watcher.testNotifications()}
              />
              <ActivityLog logs={watcher.logs} />
            </aside>
          </main>

          <footer className="page-footer">
            <span>目录快照：{catalogFreshness || (watcher.catalogLoading ? "载入中" : "暂不可用")}</span>
            <span>页面关闭后监控会停止</span>
            <a href="https://github.com/ENCHIGO/apple-pickup-watcher" target="_blank" rel="noreferrer">原项目与许可</a>
          </footer>
        </div>

        <Suspense fallback={<span role="status">正在打开口令窗口…</span>}>
        {watcher.authOpen && <AccessTokenModal
          open={watcher.authOpen}
          checking={watcher.authChecking}
          error={watcher.authError}
          hasToken={Boolean(watcher.accessToken)}
          onCancel={() => watcher.setAuthOpen(false)}
          onSubmit={watcher.submitAccessToken}
        />}
        </Suspense>
      </AntApp>
    </ConfigProvider>
  );
}

export default Dashboard;
