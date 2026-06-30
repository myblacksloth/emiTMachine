import type { Countdown } from "./types";

const COUNTDOWN_NOTIFICATION_ICON = "/icons/icon-placeholder.svg";
const COUNTDOWN_NOTIFICATION_BADGE = "/icons/icon-maskable-placeholder.svg";

export type CountdownNotificationPermission = NotificationPermission | "unsupported";

export function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((error: unknown) => {
      console.error("Service worker registration failed", error);
    });
  });
}

export function getCountdownNotificationPermission(): CountdownNotificationPermission {
  if (!("Notification" in window)) {
    return "unsupported";
  }

  return Notification.permission;
}

export async function requestCountdownNotificationPermission(): Promise<CountdownNotificationPermission> {
  if (!("Notification" in window)) {
    return "unsupported";
  }

  return Notification.requestPermission();
}

export async function notifyCountdownExpired(countdown: Countdown) {
  if (!("Notification" in window) || Notification.permission !== "granted") {
    return false;
  }

  const title = "Countdown expired";
  const options: NotificationOptions = {
    body: `${countdown.title} reached its target time.`,
    tag: `countdown-${countdown.id}`,
    icon: COUNTDOWN_NOTIFICATION_ICON,
    badge: COUNTDOWN_NOTIFICATION_BADGE,
    data: {
      countdownId: countdown.id,
      url: "/?view=countdowns"
    },
    requireInteraction: true
  };

  if ("serviceWorker" in navigator) {
    const registration = await navigator.serviceWorker.ready;
    await registration.showNotification(title, options);
    return true;
  }

  new Notification(title, options);
  return true;
}
