import type { TargetState } from "@/domain/types";

export async function ensureNotificationPermission(): Promise<NotificationPermission> {
  if (!("Notification" in window)) return "denied";
  if (Notification.permission !== "default") return Notification.permission;
  return Notification.requestPermission();
}

export function showStockNotification(rows: TargetState[]): boolean {
  if (!("Notification" in window) || Notification.permission !== "granted") return false;
  const first = rows[0];
  if (!first) return false;
  const body = rows.length === 1
    ? `${first.target.storeTitle} · ${first.target.productName}`
    : `${first.target.storeTitle} 等 ${rows.length} 项确认有货`;
  const notification = new Notification("Apple 到店取货有货了", {
    body,
    tag: "apple-pickup-watcher-in-stock",
    requireInteraction: true,
  });
  notification.onclick = () => {
    window.focus();
    window.open(first.target.productUrl, "_blank", "noopener,noreferrer");
    notification.close();
  };
  return true;
}

export async function playAlertTone(): Promise<void> {
  const AudioContextClass = window.AudioContext;
  if (!AudioContextClass) return;
  const context = new AudioContextClass();
  const gain = context.createGain();
  gain.gain.setValueAtTime(0.0001, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.18, context.currentTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.65);
  gain.connect(context.destination);
  for (const [offset, frequency] of [[0, 880], [0.2, 1174]] as const) {
    const oscillator = context.createOscillator();
    oscillator.type = "sine";
    oscillator.frequency.value = frequency;
    oscillator.connect(gain);
    oscillator.start(context.currentTime + offset);
    oscillator.stop(context.currentTime + offset + 0.45);
  }
  await new Promise((resolve) => setTimeout(resolve, 750));
  await context.close();
}
