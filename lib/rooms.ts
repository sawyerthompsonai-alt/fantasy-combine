import { randomBytes } from 'node:crypto';
import { sha256Hex } from './hash';
import { deriveOutcomes } from './outcomes';
import { buildTimeline } from './timeline';
import type { Outcomes, Room, RoomStatus } from './types';

export const COLORS = [
  '#e6194b', '#3cb44b', '#ffe119', '#4363d8', '#f58231',
  '#911eb4', '#46f0f0', '#f032e6', '#bcf60c', '#fabebe',
  '#008080', '#e6beff', '#9a6324', '#fffac8', '#800000',
  '#aaffc3', '#808000', '#ffd8b1', '#000075', '#808080',
];

export interface PublicRoom {
  id: string; names: string[]; colors: string[]; status: RoomStatus;
  seedHash: string; resetCount: number; serverNow: number; viewerCount: number;
  startTime?: number; outcomes?: Outcomes; seed?: string;
}

export function validateNames(input: unknown): string[] {
  if (!Array.isArray(input)) throw new Error('names must be a list');
  const names = input.map(n => String(n ?? '').trim());
  if (names.some(n => n.length === 0)) throw new Error('every manager needs a name');
  if (names.some(n => n.length > 24)) throw new Error('names must be 24 characters or fewer');
  if (names.length < 2 || names.length > 20) throw new Error('rooms need 2-20 managers');
  const lower = names.map(n => n.toLowerCase());
  if (new Set(lower).size !== lower.length) throw new Error('names must be unique');
  return names;
}

export function createRoom(names: string[], now: number): Room {
  const seed = randomBytes(32).toString('hex');
  return {
    id: randomBytes(6).toString('base64url').toLowerCase().replace(/[^a-z0-9]/g, 'x').slice(0, 8),
    adminToken: randomBytes(24).toString('hex'),
    names,
    colors: names.map((_, i) => COLORS[i % COLORS.length]),
    status: 'lobby',
    seed,
    seedHash: sha256Hex(seed),
    resetCount: 0,
    createdAt: now,
  };
}

export function startRoom(room: Room, now: number): Room {
  if (room.status !== 'lobby') return room; // idempotent
  return { ...room, status: 'revealing', startTime: now, outcomes: deriveOutcomes(room.seed, room.names) };
}

export function resetRoom(room: Room): Room {
  const seed = randomBytes(32).toString('hex');
  return {
    ...room, seed, seedHash: sha256Hex(seed), status: 'lobby',
    outcomes: undefined, startTime: undefined, resetCount: room.resetCount + 1,
  };
}

export function maybeComplete(room: Room, now: number): Room {
  if (room.status !== 'revealing' || !room.outcomes || room.startTime === undefined) return room;
  const { totalMs } = buildTimeline(room.outcomes);
  if (now >= room.startTime + totalMs) return { ...room, status: 'complete' };
  return room;
}

export function publicRoom(room: Room, serverNow: number, viewerCount: number): PublicRoom {
  return {
    id: room.id, names: room.names, colors: room.colors, status: room.status,
    seedHash: room.seedHash, resetCount: room.resetCount, serverNow, viewerCount,
    ...(room.status !== 'lobby' ? { startTime: room.startTime, outcomes: room.outcomes } : {}),
    ...(room.status === 'complete' ? { seed: room.seed } : {}),
  };
}
