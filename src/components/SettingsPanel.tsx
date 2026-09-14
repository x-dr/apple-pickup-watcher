import { BellOutlined, SafetyCertificateOutlined } from "@ant-design/icons";
import { Button, InputNumber, Switch, Tooltip } from "antd";

import type { HealthResponse, Settings } from "@/domain/types";

interface Props {
  settings: Settings;
  health: HealthResponse | null;
  checking: boolean;
  onChange(patch: Partial<Settings>): void;
  onCheck(): void;
  onTest(): void;
}

export function SettingsPanel({ settings, health, checking, onChange, onCheck, onTest }: Props) {
  return (
    <section className="panel settings-panel">
      <div className="section-heading compact">
        <div><span className="eyebrow">STEP 02</span><h2>查询与提醒</h2></div>
        <Tooltip title={health?.barkConfigured ? "Bark 已在服务端配置" : "未配置 BARK_URL"}>
          <SafetyCertificateOutlined className={health?.barkConfigured ? "configured" : "muted-icon"} />
        </Tooltip>
      </div>
      <div className="setting-row">
        <div><strong>查询间隔</strong><span>建议 60 秒以上，降低被 Apple 拦截的概率</span></div>
        <InputNumber
          min={30}
          max={3600}
          step={10}
          value={settings.intervalSeconds}
          suffix="秒"
          onChange={(value) => onChange({ intervalSeconds: typeof value === "number" ? value : 60 })}
        />
      </div>
      <div className="setting-row">
        <div><strong>浏览器通知</strong><span>首次测试时浏览器会请求授权</span></div>
        <Switch checked={settings.browserNotifications} onChange={(checked) => onChange({ browserNotifications: checked })} />
      </div>
      <div className="setting-row">
        <div><strong>提示音</strong><span>到货时播放两段提示音</span></div>
        <Switch checked={settings.soundEnabled} onChange={(checked) => onChange({ soundEnabled: checked })} />
      </div>
      <div className="setting-row">
        <div><strong>Bark 推送</strong><span>地址仅从云端环境变量读取</span></div>
        <Switch
          checked={settings.barkEnabled}
          disabled={!health?.barkConfigured}
          onChange={(checked) => onChange({ barkEnabled: checked })}
        />
      </div>
      <div className="setting-row">
        <div><strong>有货时打开 Apple</strong><span>可能被浏览器的弹窗策略拦截</span></div>
        <Switch checked={settings.openProductOnHit} onChange={(checked) => onChange({ openProductOnHit: checked })} />
      </div>
      <div className="settings-actions">
        <Button loading={checking} onClick={onCheck}>立即查询</Button>
        <Button icon={<BellOutlined />} onClick={onTest}>测试提醒</Button>
      </div>
    </section>
  );
}
