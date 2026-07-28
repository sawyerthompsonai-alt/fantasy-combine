import { Redis } from '@upstash/redis';
import type { Room } from './types';

export const ROOM_TTL_MS = 48 * 60 * 60 * 1000;
export const PRESENCE_WINDOW_MS = 10_000;

export interface RoomStore {
  getRoom(id: string, now: number): Promise<Room | null>;
  putRoom(room: Room): Promise<void>;
  touchPresence(roomId: string, viewerId: string, now: number): Promise<void>;
  presenceCount(roomId: string, now: number): Promise<number>;
}

class MemoryStore implements RoomStore {
  rooms = new Map<string, Room>();
  presence = new Map<string, Map<string, number>>();

  async getRoom(id: string, now: number): Promise<Room | null> {
    const room = this.rooms.get(id);
    if (!room) return null;
    if (now > room.createdAt + ROOM_TTL_MS) {
      this.rooms.delete(id);
      return null;
    }
    return structuredClone(room);
  }
  async putRoom(room: Room): Promise<void> {
    this.rooms.set(room.id, structuredClone(room));
  }
  async touchPresence(roomId: string, viewerId: string, now: number): Promise<void> {
    const m = this.presence.get(roomId) ?? new Map<string, number>();
    m.set(viewerId, now);
    this.presence.set(roomId, m);
  }
  async presenceCount(roomId: string, now: number): Promise<number> {
    const m = this.presence.get(roomId);
    if (!m) return 0;
    let count = 0;
    for (const [viewer, ts] of m) {
      if (now - ts <= PRESENCE_WINDOW_MS) count++;
      else m.delete(viewer);
    }
    return count;
  }
}

class RedisStore implements RoomStore {
  constructor(private redis: Redis) {}

  async getRoom(id: string, _now: number): Promise<Room | null> {
    void _now;
    return ((await this.redis.get<Room>(`room:${id}`)) as Room | null) ?? null;
  }
  async putRoom(room: Room): Promise<void> {
    const ttlSec = Math.max(60, Math.ceil((room.createdAt + ROOM_TTL_MS - Date.now()) / 1000));
    await this.redis.set(`room:${room.id}`, room, { ex: ttlSec });
  }
  async touchPresence(roomId: string, viewerId: string, now: number): Promise<void> {
    await this.redis.hset(`presence:${roomId}`, { [viewerId]: now });
    await this.redis.expire(`presence:${roomId}`, 60);
  }
  async presenceCount(roomId: string, now: number): Promise<number> {
    const all = (await this.redis.hgetall<Record<string, number>>(`presence:${roomId}`)) ?? {};
    return Object.values(all).filter(ts => now - Number(ts) <= PRESENCE_WINDOW_MS).length;
  }
}

// globalThis keeps one store across Next dev hot reloads
const g = globalThis as unknown as { __combineStore?: MemoryStore; __combineRedis?: RedisStore };

export function getStore(): RoomStore {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) {
    g.__combineRedis ??= new RedisStore(new Redis({ url, token }));
    return g.__combineRedis;
  }
  g.__combineStore ??= new MemoryStore();
  return g.__combineStore;
}

export function __resetStoreForTests(): void {
  g.__combineStore = new MemoryStore();
}
