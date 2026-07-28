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

// globalThis keeps one store across Next dev hot reloads
const g = globalThis as unknown as { __combineStore?: MemoryStore };

export function getStore(): RoomStore {
  g.__combineStore ??= new MemoryStore();
  return g.__combineStore;
}

export function __resetStoreForTests(): void {
  g.__combineStore = new MemoryStore();
}
