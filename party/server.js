export default class Server {
  onRequest(request) {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return new Response("ok", {
        headers: { "content-type": "text/plain; charset=utf-8" }
      });
    }

    return new Response("MPCards PartyKit room endpoint", {
      headers: { "content-type": "text/plain; charset=utf-8" }
    });
  }

  onMessage(message, websocket) {
    websocket.send(message);
  }
}
