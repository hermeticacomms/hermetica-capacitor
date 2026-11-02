/// <reference lib="dom" />
import { createHybridClient, type AppPushToken, type HybridClient, type HybridOptions } from '@hermeticacomms/sdk-browser';

export type { AppDevice, HybridClient, ProfileIds } from '@hermeticacomms/sdk-browser';

type Permission = { receive: string };
type Handle = Promise<unknown> | unknown;
/** The slice of `@capacitor/push-notifications`' `PushNotifications` used here (pass the plugin object itself). */
export interface CapacitorPush {
  checkPermissions(): Promise<Permission>;
  requestPermissions(): Promise<Permission>;
  register(): Promise<void>;
  addListener(event: 'registration', cb: (token: { value: string }) => void): Handle;
  addListener(event: 'registrationError', cb: (error: unknown) => void): Handle;
  addListener(event: 'pushNotificationReceived', cb: (notification: unknown) => void): Handle;
  addListener(event: 'pushNotificationActionPerformed', cb: (action: { notification: unknown }) => void): Handle;
}

export interface CapacitorOptions extends HybridOptions {
  /** `PushNotifications` from @capacitor/push-notifications. Without it, push is off (call `setPushToken` yourself). */
  push?: CapacitorPush;
  /** Show the notification prompt on start when the user has not decided (default false: call `enablePush()` when it fits). */
  requestPushPermission?: boolean;
  /** APNs environment of this build; debug for development-signed iOS builds. */
  pushEnvironment?: 'debug' | 'release';
}

export type CapacitorClient = HybridClient & {
  /** Asks for notification permission if needed, registers with APNs/FCM, and sends the token. Resolves the permission. */
  enablePush(): Promise<AppPushToken['enablementStatus']>;
};

const status = (p: Permission): NonNullable<AppPushToken['enablementStatus']> =>
  p.receive === 'granted' ? 'AUTHORIZED' : p.receive === 'denied' ? 'DENIED' : 'NOT_DETERMINED';

/**
 * Hermetica for Capacitor (and Ionic): the browser SDK runs as is in the WebView (consent gate, batching, retries with one
 * Idempotency-Key per batch); this adds the native push token from @capacitor/push-notifications, push open tracking, and in-app
 * messages for ios / android. Tapped notifications go to `onDeepLink`.
 */
export function createCapacitorClient(o: CapacitorOptions): CapacitorClient {
  const { push, requestPushPermission = false, pushEnvironment = 'release', ...rest } = o;
  const hm = createHybridClient(rest);
  const vendor = o.platform === 'ios' ? 'apns' : 'fcm';
  let last: AppPushToken | null = null;
  let enablement: NonNullable<AppPushToken['enablementStatus']> = 'NOT_DETERMINED';

  if (push) {
    void push.addListener('registration', (t) => {
      last = { token: t.value, vendor, environment: pushEnvironment, enablementStatus: enablement };
      void hm.setPushToken(last);
    });
    void push.addListener('pushNotificationReceived', (n) => hm.handlePushReceived(n));
    void push.addListener('pushNotificationActionPerformed', (a) => hm.handlePushOpened(a.notification));
    // Back from system settings: re-send the token when the permission changed there.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible' || !last) return;
      void push.checkPermissions().then((p) => {
        const s = status(p);
        if (!last || s === last.enablementStatus) return;
        enablement = s;
        last = { ...last, enablementStatus: s };
        void hm.setPushToken(last);
      });
    });
  }

  async function enablePush(): Promise<AppPushToken['enablementStatus']> {
    if (!push) return 'UNAUTHORIZED';
    let p = await push.checkPermissions();
    if (p.receive !== 'granted' && p.receive !== 'denied') p = await push.requestPermissions();
    enablement = status(p);
    // Register even when denied: the server then knows this device exists but cannot be pushed to.
    await push.register();
    return enablement;
  }
  if (push && requestPushPermission) void enablePush();
  else if (push) void push.checkPermissions().then((p) => { if (p.receive === 'granted') { enablement = 'AUTHORIZED'; void push.register(); } });

  return { ...hm, enablePush };
}
