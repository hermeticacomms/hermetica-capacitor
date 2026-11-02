# @hermeticacomms/sdk-capacitor

Hermetica for Capacitor and Ionic apps. The browser SDK runs unchanged in the WebView (consent gate, batching, retries with one
`Idempotency-Key` per batch); this package adds native push tokens from `@capacitor/push-notifications`, push open tracking, and
in-app messages targeted at the app's platform.

```ts
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { createCapacitorClient } from '@hermeticacomms/sdk-capacitor';

const hm = createCapacitorClient({
  siteKey: 'hm_pk_...', endpoint: 'https://api.example.com',
  platform: Capacitor.getPlatform() === 'ios' ? 'ios' : 'android',
  push: PushNotifications, pushEnvironment: import.meta.env.DEV ? 'debug' : 'release',
  onDeepLink: (link) => router.push(link),
});
hm.consent.update({ analytics: true, marketing: true });
hm.identify('user-42', { email: 'ada@example.com' });
hm.screen('Cart');
hm.track('add_to_cart', { sku: 'A1' }, { value: 1999, currency: 'USD' });
await hm.enablePush(); // asks for permission if needed, then registers the APNs (iOS) or FCM (Android) token
```

- The token follows the profile: `identify`, `setProfile` and `reset` re-register it. `hm.unregisterPushToken()` on logout.
- Coming back from system settings re-sends the token when the notification permission changed there.
- Tapped notifications track `$opened_push` and go to `onDeepLink`; received ones track `$received_push`.
- In-app messages show on start, on `screen` and on `track` (`inApp: false` turns them off). Link buttons go to `onDeepLink`.
- Consent and suppression are enforced by the server too; opening a notification is an event and needs analytics consent.

On iOS, `@capacitor/push-notifications` hands over the APNs token; enable the Push Notifications capability. On Android it hands
over the FCM token; add `google-services.json`.
