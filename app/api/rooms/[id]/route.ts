import { getStore } from '@/lib/store';
import { maybeComplete, publicRoom } from '@/lib/rooms';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const now = Date.now();
  const store = getStore();
  let room = await store.getRoom(id, now);
  if (!room) return Response.json({ error: 'room not found or expired' }, { status: 404 });

  const completed = maybeComplete(room, now);
  if (completed !== room) {
    await store.putRoom(completed);
    room = completed;
  }

  const viewer = new URL(req.url).searchParams.get('viewer');
  if (viewer) await store.touchPresence(id, viewer, now);
  const viewerCount = await store.presenceCount(id, now);

  return Response.json(publicRoom(room, now, viewerCount));
}
