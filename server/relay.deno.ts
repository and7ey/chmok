/**
 * Запасной ретранслятор: Deno (бесплатно, без всякой настройки).
 * Тот же протокол, что и у Cloudflare Worker, но комнаты живут в памяти одного процесса —
 * годится для локальных тестов и для игры двух устройств в одной Wi-Fi сети.
 * В облаке Deno Deploy может посадить клиентов на разные инстансы, поэтому для публичного
 * запуска основной вариант — worker.ts (комната = Durable Object, бесплатный тариф).
 *
 * Локально: deno run --allow-net --allow-env server/relay.deno.ts   → ws://localhost:8000
 */

type Peer = { socket: WebSocket; role: string };

const rooms = new Map<string, Peer[]>();

const normCode = (raw: string | null) => (raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);

const drop = (room: string, socket: WebSocket) => {
  const peers = rooms.get(room);
  if (!peers) return;
  const rest = peers.filter((p) => p.socket !== socket);
  if (rest.length === 0) rooms.delete(room);
  else rooms.set(room, rest);
};

export function handler(req: Request): Response {
  const url = new URL(req.url);

  if (!url.searchParams.has('room')) {
    return new Response(JSON.stringify({ ok: true, service: 'chmok-relay-deno', rooms: rooms.size }), {
      headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' },
    });
  }

  const room = normCode(url.searchParams.get('room'));
  const role = url.searchParams.get('role') === 'guest' ? 'guest' : 'host';
  if (room.length < 3) return new Response('bad room', { status: 400 });

  const peers = rooms.get(room) || [];
  if (role === 'guest' && peers.some((p) => p.role === 'guest')) {
    return new Response(JSON.stringify({ t: 'full', reason: 'в комнате уже есть гость' }), { status: 409 });
  }
  for (const stale of peers.filter((p) => p.role === role)) {
    try {
      stale.socket.close(1000, 'replaced');
    } catch {
      /* уже закрыт */
    }
  }

  const { socket: server, response } = Deno.upgradeWebSocket(req);

  rooms.set(room, [...peers.filter((p) => p.role !== role), { socket: server, role }]);
  server.onMessage = (ev) => {
    for (const peer of rooms.get(room) || []) {
      if (peer.socket !== server) {
        try {
          peer.socket.send(ev.data);
        } catch {
          /* соперник отвалился — очистит onClose */
        }
      }
    }
  };
  server.onClose = () => drop(room, server);
  return response;
}

Deno.serve(handler);
