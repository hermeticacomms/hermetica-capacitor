// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCapacitorClient, type CapacitorPush } from './index.ts';

afterEach(() => vi.unstubAllGlobals());

function fakePush(receive: string) {
  const listeners: Record<string, (x: never) => void> = {};
  const push = {
    checkPermissions: vi.fn(async () => ({ receive })),
    requestPermissions: vi.fn(async () => ({ receive: 'granted' })),
    register: vi.fn(async () => { listeners['registration']?.({ value: 'tok-1' } as never); }),
    addListener: vi.fn((event: string, cb: (x: never) => void) => { listeners[event] = cb; return Promise.resolve({}); }),
  };
  return { push: push as unknown as CapacitorPush, raw: push, fire: (event: string, x: unknown) => listeners[event]?.(x as never) };
}

describe('createCapacitorClient', () => {
  it('asks for permission, registers, and sends the APNs token on iOS', async () => {
    const f = vi.fn(async (url: string) => new Response(url.includes('in-app-messages') ? '{"items":[]}' : '{}'));
    vi.stubGlobal('fetch', f);
    const { push, raw } = fakePush('prompt');
    const hm = createCapacitorClient({ siteKey: 'pk', endpoint: 'https://api.test', platform: 'ios', consentMode: 'none', inApp: false, push });
    expect(await hm.enablePush()).toBe('AUTHORIZED');
    expect(raw.requestPermissions).toHaveBeenCalled();
    await vi.waitFor(() => expect(f.mock.calls.some(([u]) => String(u).includes('/client/push-tokens'))).toBe(true));
    const [, init] = (f.mock.calls as unknown as [string, RequestInit][]).find(([u]) => u.includes('/client/push-tokens'))!;
    expect(JSON.parse(init.body as string).data.attributes).toMatchObject({ token: 'tok-1', vendor: 'apns', platform: 'ios', enablement_status: 'AUTHORIZED' });
  });

  it('tracks a tapped notification and routes its deep link', () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}')));
    const { push, fire } = fakePush('denied');
    const links: string[] = [];
    const hm = createCapacitorClient({ siteKey: 'pk', endpoint: 'https://api.test', platform: 'android', consentMode: 'none', inApp: false, push, onDeepLink: (l) => links.push(l) });
    fire('pushNotificationActionPerformed', { notification: { data: { hermetica_message_id: 'm1', deep_link: 'app://sale' } } });
    expect(links).toEqual(['app://sale']);
    expect(hm.debug.events().map((e) => e.name)).toEqual(['$opened_push']);
  });
});
