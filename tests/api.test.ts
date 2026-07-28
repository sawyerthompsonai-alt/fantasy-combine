import { describe, it, expect, beforeEach } from 'vitest';
import { __resetStoreForTests } from '@/lib/store';
import { POST as createPost } from '@/app/api/rooms/route';
import { GET as roomGet } from '@/app/api/rooms/[id]/route';
import { POST as startPost } from '@/app/api/rooms/[id]/start/route';
import { POST as resetPost } from '@/app/api/rooms/[id]/reset/route';
import { buildTimeline } from '@/lib/timeline';

const jsonReq = (url: string, body?: unknown, headers: Record<string, string> = {}) =>
  new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const names = ['Alpha', 'Bravo', 'Charlie', 'Delta'];

async function makeRoom() {
  const res = await createPost(jsonReq('http://t/api/rooms', { names }));
  expect(res.status).toBe(201);
  return res.json() as Promise<{ id: string; adminToken: string; seedHash: string }>;
}

beforeEach(() => __resetStoreForTests());

describe('POST /api/rooms', () => {
  it('creates a room and returns credentials', async () => {
    const { id, adminToken, seedHash } = await makeRoom();
    expect(id).toMatch(/^[a-z0-9]{8}$/);
    expect(adminToken).toMatch(/^[a-f0-9]{48}$/);
    expect(seedHash).toMatch(/^[a-f0-9]{64}$/);
  });
  it('rejects bad rosters', async () => {
    for (const bad of [undefined, [], ['Solo'], Array(21).fill('x'), ['A', 'A'], ['A', '']]) {
      const res = await createPost(jsonReq('http://t/api/rooms', { names: bad }));
      expect(res.status).toBe(400);
    }
  });
});

describe('GET /api/rooms/:id', () => {
  it('returns public state without secrets, counts viewers', async () => {
    const { id } = await makeRoom();
    const res = await roomGet(new Request(`http://t/api/rooms/${id}?viewer=v-1`), ctx(id));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('lobby');
    expect(body.seed).toBeUndefined();
    expect(body.adminToken).toBeUndefined();
    expect(body.outcomes).toBeUndefined();
    expect(body.viewerCount).toBe(1);
    expect(typeof body.serverNow).toBe('number');
  });
  it('404s unknown rooms', async () => {
    const res = await roomGet(new Request('http://t/api/rooms/zzzzzzzz'), ctx('zzzzzzzz'));
    expect(res.status).toBe(404);
  });
});

describe('POST /api/rooms/:id/start', () => {
  it('requires the admin token', async () => {
    const { id } = await makeRoom();
    const res = await startPost(jsonReq(`http://t/api/rooms/${id}/start`, undefined, { 'x-admin-token': 'wrong' }), ctx(id));
    expect(res.status).toBe(403);
  });
  it('starts the reveal, exposes outcomes but not seed, and is idempotent', async () => {
    const { id, adminToken } = await makeRoom();
    const h = { 'x-admin-token': adminToken };
    const r1 = await (await startPost(jsonReq(`http://t/r/${id}/s`, undefined, h), ctx(id))).json();
    expect(r1.status).toBe('revealing');
    expect(r1.outcomes.order).toHaveLength(4);
    expect(r1.seed).toBeUndefined();
    const r2 = await (await startPost(jsonReq(`http://t/r/${id}/s`, undefined, h), ctx(id))).json();
    expect(r2.startTime).toBe(r1.startTime);
  });
  it('flips to complete and reveals seed after the timeline ends', async () => {
    const { id, adminToken } = await makeRoom();
    const started = await (await startPost(
      jsonReq(`http://t/s`, undefined, { 'x-admin-token': adminToken }), ctx(id))).json();
    const { totalMs } = buildTimeline(started.outcomes);
    // simulate time passing by rewinding startTime in the store
    const { getStore } = await import('@/lib/store');
    const raw = await getStore().getRoom(id, Date.now());
    raw!.startTime = Date.now() - totalMs - 1000;
    await getStore().putRoom(raw!);
    const done = await (await roomGet(new Request(`http://t/api/rooms/${id}`), ctx(id))).json();
    expect(done.status).toBe('complete');
    expect(done.seed).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe('POST /api/rooms/:id/reset', () => {
  it('returns to lobby with a fresh commitment', async () => {
    const { id, adminToken } = await makeRoom();
    const h = { 'x-admin-token': adminToken };
    const before = await (await roomGet(new Request(`http://t/api/rooms/${id}`), ctx(id))).json();
    await startPost(jsonReq('http://t/s', undefined, h), ctx(id));
    const after = await (await resetPost(jsonReq('http://t/r', undefined, h), ctx(id))).json();
    expect(after.status).toBe('lobby');
    expect(after.resetCount).toBe(1);
    expect(after.seedHash).not.toBe(before.seedHash);
    expect(after.outcomes).toBeUndefined();
  });
});
