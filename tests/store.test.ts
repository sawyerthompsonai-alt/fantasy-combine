import { describe, it, expect, beforeEach } from 'vitest';
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
