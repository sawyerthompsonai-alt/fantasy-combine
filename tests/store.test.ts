import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getStore, __resetStoreForTests, ROOM_TTL_MS, PRESENCE_WINDOW_MS } from '@/lib/store';
import type { Room } from '@/lib/types';

const room = (over: Partial<Room> = {}): Room => ({
  id: 'r1', adminToken: 't', names: ['A', 'B'], colors: ['#f00', '#00f'],
  status: 'lobby', seedHash: 'h', seed: 's', resetCount: 0, createdAt: 1000, ...over,
});

describe('memory RoomStore', () => {
  beforeEach(() => __resetStoreForTests());

  it('round-trips a room', async () => {
    const store = getStore();
    await store.putRoom(room());
    expect(await store.getRoom('r1', 2000)).toEqual(room());
  });

  it('returns null for missing and for expired rooms', async () => {
    const store = getStore();
    expect(await store.getRoom('nope', 0)).toBeNull();
    await store.putRoom(room());
    expect(await store.getRoom('r1', 1000 + ROOM_TTL_MS + 1)).toBeNull();
  });

  it('counts only fresh presence', async () => {
    const store = getStore();
    await store.touchPresence('r1', 'v1', 1000);
    await store.touchPresence('r1', 'v2', 5000);
    await store.touchPresence('r1', 'v2', 8000); // same viewer, refreshed
    expect(await store.presenceCount('r1', 9000)).toBe(2);
    expect(await store.presenceCount('r1', 1000 + PRESENCE_WINDOW_MS + 1)).toBe(1);
  });
});

describe('getStore on Vercel without KV credentials', () => {
  const savedVercel = process.env.VERCEL;
  const savedKvUrl = process.env.KV_REST_API_URL;
  const savedKvToken = process.env.KV_REST_API_TOKEN;
  const savedUpstashUrl = process.env.UPSTASH_REDIS_REST_URL;
  const savedUpstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;

  beforeEach(() => {
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    process.env.VERCEL = '1';
  });

  afterEach(() => {
    const restore = (key: string, value: string | undefined) => {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    };
    restore('VERCEL', savedVercel);
    restore('KV_REST_API_URL', savedKvUrl);
    restore('KV_REST_API_TOKEN', savedKvToken);
    restore('UPSTASH_REDIS_REST_URL', savedUpstashUrl);
    restore('UPSTASH_REDIS_REST_TOKEN', savedUpstashToken);
  });

  it('throws a clear error instead of silently falling back to memory', () => {
    expect(() => getStore()).toThrow(/KV store not configured/);
  });
});
