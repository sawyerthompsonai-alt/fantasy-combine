import { getStore } from '@/lib/store';
import { publicRoom, startRoom } from '@/lib/rooms';

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const now = Date.now();
  const store = getStore();
  const room = await store.getRoom(id, now);
  if (!room) return Response.json({ error: 'room not found or expired' }, { status: 404 });
  if (req.headers.get('x-admin-token') !== room.adminToken) {
    return Response.json({ error: 'invalid admin token' }, { status: 403 });
  }
  const started = startRoom(room, now);
  if (started !== room) await store.putRoom(started);
  return Response.json(publicRoom(started, now, await store.presenceCount(id, now)));
}
