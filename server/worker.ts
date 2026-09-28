/**
 * Ретранслятор для двух клиентов: Cloudflare Workers + Durable Object, бесплатный тариф.
 * Комната = один DO, идентификатор выводится из кода комнаты. Ничего не храним и не разбираем —
 * только пересылаем JSON-сообщение второму сокету той же комнаты.
 */

type Env = { CHMOK_ROOM: DurableObjectNamespace };

const normCode = (raw: string | null): string => (raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json',
      'access-control-allow-origin': '*',
    },
  });

export class RoomDO {
  private state: DurableObjectState;

  constructor(state: DurableObjectState) {
    this.state = state;
  }

  private sockets(role: string) {
    return this.state.getWebSockets().filter((s) => this.state.getTags(s).includes(role));
  }

  fetch(request: Request): Response {
    const url = new URL(request.url);
    const role = url.searchParams.get('role') === 'guest' ? 'guest' : 'host';

    if (role === 'host') {
      // Хост всегда один: новый перезаезжает прежний сокет той же роли.
      for (const stale of this.sockets('host')) stale.close(1000, 'replaced');
    } else if (this.sockets('guest').length > 0) {
      return json({ t: 'full', reason: 'в комнате уже есть гость' }, 409);
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.state.acceptWebSocket(server, [role]);
    return new Response(null, { status: 101, webSocket: client });
  }

  webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    for (const other of this.state.getWebSockets()) {
      if (other !== ws) other.send(message);
    }
  }

  webSocketClose(ws: WebSocket) {
    // Без явного закрытия хибернированный сокет висит в комнате и не пускает нового гостя.
    ws.close();
  }

  webSocketError() {
    /* сокет мёртв — хибернация сама его уберёт */
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const room = normCode(url.searchParams.get('room'));

    if (!url.searchParams.has('room') && url.pathname !== '/ws') {
      return json({ ok: true, service: 'chmok-relay', usage: '/ws?room=CODE&role=host|guest' });
    }
    if (room.length < 3) return json({ t: 'error', reason: 'нужен код комнаты от 3 символов' }, 400);

    const id = env.CHMOK_ROOM.idFromName(room);
    const stub = env.CHMOK_ROOM.get(id);
    // Пробрасываем заголовок Upgrade — так DO получает рукопожатие целиком.
    return stub.fetch(new Request(url.toString(), { method: 'GET', headers: request.headers }));
  },
};
