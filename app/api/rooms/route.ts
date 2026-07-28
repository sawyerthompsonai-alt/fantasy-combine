import { getStore } from '@/lib/store';
import { createRoom, validateNames } from '@/lib/rooms';

export async function POST(req: Request) {
  let names: string[];
  try {
    const body = await req.json();
    names = validateNames(body?.names);
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : 'invalid request' }, { status: 400 });
  }
  const room = createRoom(names, Date.now());
  await getStore().putRoom(room);
  return Response.json(
    { id: room.id, adminToken: room.adminToken, seedHash: room.seedHash },
    { status: 201 },
  );
}
