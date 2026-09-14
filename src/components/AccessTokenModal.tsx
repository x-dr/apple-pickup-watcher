import { KeyOutlined } from "@ant-design/icons";
import { Alert, Input, Modal } from "antd";
import { useEffect, useState } from "react";

interface Props {
  open: boolean;
  checking: boolean;
  error: string | null;
  hasToken: boolean;
  onCancel(): void;
  onSubmit(token: string): Promise<boolean>;
}

export function AccessTokenModal({ open, checking, error, hasToken, onCancel, onSubmit }: Props) {
  const [value, setValue] = useState("");

  useEffect(() => {
    if (open) setValue("");
  }, [open]);

  const submit = async () => {
    if (value.trim().length < 1) return;
    if (await onSubmit(value)) setValue("");
  };

  return (
    <Modal
      title="连接监控服务"
      open={open}
      confirmLoading={checking}
      okText="验证并连接"
      cancelText="稍后"
      okButtonProps={{ disabled: value.trim().length === 0 }}
      destroyOnHidden
      onOk={() => void submit()}
      onCancel={onCancel}
    >
      <div className="token-modal-content">
        <p className="muted-copy">
          输入部署时配置的 <code>APW_ACCESS_TOKEN</code>。口令只保存在当前浏览器标签页，
          不会写入目录或静态资源。
        </p>
        {hasToken && <Alert type="info" showIcon title="输入新口令将替换当前会话中的口令。" />}
        {error && <Alert type="error" showIcon title={error} />}
        <Input.Password
          autoFocus
          prefix={<KeyOutlined />}
          placeholder="访问口令"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onPressEnter={() => void submit()}
        />
      </div>
    </Modal>
  );
}
