import { BellOutlined, SafetyCertificateOutlined } from "@ant-design/icons";
import { Button, Select, Switch, Tooltip } from "antd";

import { QUERY_INTERVAL_OPTIONS, type HealthResponse, type Settings } from "@/domain/types";

interface Props {
  settings: Settings;
  health: HealthResponse | null;
  checking: boolean;
  canCheck: boolean;
  testing: boolean;
  onChange(patch: Partial<Settings>): void;
  onCheck(): void;
  onTest(): void;
}

export function SettingsPanel({ settings, health, checking, canCheck, testing, onChange, onCheck, onTest }: Props) {
  const notificationName = health?.notificationProvider === "bark" ? "Bark" : health?.notificationProvider === "notifyhub" ? "NotifyHub" : null;
  return (
    <section className="panel settings-panel">
      <div className="section-heading compact">
        <div><span className="eyebrow">STEP 02</span><h2>查询与提醒</h2></div>
        <Tooltip title={notificationName ? `${notificationName} 已在服务端配置` : "通知未配置，或 Bark / NotifyHub 配置冲突"}>
          <SafetyCertificateOutlined className={notificationName ? "configured" : "muted-icon"} />
        </Tooltip>
      </div>
      <div className="setting-row">
        <div><strong>查询间隔</strong><span>建议 60 秒以上，降低被 Apple 拦截的概率</span></div>
        <Select
          className="interval-select"
          value={settings.intervalSeconds}
          options={QUERY_INTERVAL_OPTIONS.map((seconds) => ({ value: seconds, label: `${seconds} 秒` }))}
          onChange={(intervalSeconds) => onChange({ intervalSeconds })}
        />
      </div>
      <div className="setting-row">
        <div><strong>浏览器通知</strong><span>开始监控或测试提醒时请求授权</span></div>
        <Switch checked={settings.browserNotifications} onChange={(checked) => onChange({ browserNotifications: checked })} />
      </div>
      <div className="setting-row">
        <div><strong>提示音</strong><span>到货时播放两段提示音</span></div>
        <Switch checked={settings.soundEnabled} onChange={(checked) => onChange({ soundEnabled: checked })} />
      </div>
      <div className="setting-row">
        <div><strong>是否开启通知</strong><span>{notificationName ? `当前使用 ${notificationName}` : "服务端需配置 Bark 或 NotifyHub（二选一）"}</span></div>
        <Switch
          checked={settings.notificationEnabled}
          disabled={!notificationName}
          onChange={(notificationEnabled) => onChange({ notificationEnabled })}
        />
      </div>
      <div className="setting-row">
        <div><strong>有货时打开 Apple</strong><span>可能被浏览器的弹窗策略拦截</span></div>
        <Switch checked={settings.openProductOnHit} onChange={(checked) => onChange({ openProductOnHit: checked })} />
      </div>
      <div className="settings-actions">
        <Button loading={checking} disabled={!canCheck} onClick={onCheck}>立即查询</Button>
        <Button loading={testing} icon={<BellOutlined />} onClick={onTest}>测试提醒</Button>
      </div>
    </section>
  );
}
