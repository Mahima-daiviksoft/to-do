# Chapter 13 — Beyond REST: GraphQL, gRPC, WebSocket, Socket.IO, MQTT, SOAP, SSE, JSON-RPC, MCP & AI Requests

Postman's **New** menu offers dedicated request types: **HTTP**, **GraphQL**, **gRPC**, **WebSocket**, **Socket.IO**, **MQTT**, and in recent versions **AI** and **MCP** requests. Each can be saved into collections.

---

## 13.1 GraphQL

> 🧒 REST is a **set menu**: you get the whole plate even if you only want the fries. GraphQL is a **buffet**: you pick exactly what goes on your plate.

### Core concepts
| Concept | Meaning |
|---|---|
| **Schema (SDL)** | Typed description of everything you can ask for |
| **Query** | Read data |
| **Mutation** | Change data |
| **Subscription** | Real-time updates (usually over WebSocket) |
| **Variables** | Parameters passed separately from the query |
| **Fragments** | Reusable field sets |
| **Introspection** | Query the schema itself (`__schema`) — used for autocomplete |
| **Resolvers** | Server functions that fetch each field |

### Example
```graphql
query GetUser($id: ID!) {
  user(id: $id) {
    id
    name
    posts(first: 3) { title }
  }
}
```
Variables:
```json
{ "id": "1" }
```
Mutation:
```graphql
mutation CreatePost($input: CreatePostInput!) {
  createPost(input: $input) { id title }
}
```

### In Postman — two ways
1. **GraphQL request type** (New → GraphQL): enter URL → Postman fetches schema via **introspection** → **schema explorer / query builder** (tick fields to build query), Query + Variables panes, auth, headers, scripts, **subscriptions** support over WebSocket transports in recent versions.
2. **HTTP request → Body → GraphQL**: Query + GraphQL variables editors; can import schema for autocomplete. Postman sends `POST` with JSON `{ "query": "...", "variables": {...} }`.

Use `{{variables}}` inside the GraphQL **variables JSON**, not by string-concatenating into the query.

### Testing GraphQL — key differences from REST
- **Errors usually come with HTTP 200!** Always check the `errors` array:
```javascript
const body = pm.response.json();
pm.test("HTTP 200", () => pm.response.to.have.status(200));
pm.test("No GraphQL errors", () => pm.expect(body.errors, JSON.stringify(body.errors)).to.be.undefined);
pm.test("User returned", () => {
    pm.expect(body.data.user).to.include.keys("id", "name");
    pm.expect(body.data.user.posts).to.have.lengthOf.at.most(3);
});
```
- **Partial success**: `data` can be present with `errors` for some fields.
- Negative tests: invalid field (`Cannot query field "x"`), wrong variable type, missing required variable, unauthorized field-level access.
- **Security tests**: introspection disabled in prod? query **depth limits** (deeply nested queries), **complexity/cost limits**, batching abuse (array of queries), aliases abuse (`a1: user(id:1) a2: user(id:2) ...` for brute force), field suggestions leaking schema.
- **Performance**: N+1 resolver problems show as slow responses for list queries.

---

## 13.2 gRPC

> 🧒 gRPC is like two robots talking in a **secret, super-fast code language** (Protocol Buffers) that both robots learned from the **same dictionary** (`.proto` file).

### Concepts
- **Protocol Buffers (protobuf)**: binary, strongly typed message format defined in `.proto` files.
- **Service** with **methods**; runs over **HTTP/2**.
```proto
syntax = "proto3";
package orders.v1;
service OrderService {
  rpc GetOrder (GetOrderRequest) returns (Order);                        // unary
  rpc ListOrders (ListOrdersRequest) returns (stream Order);             // server streaming
  rpc UploadItems (stream Item) returns (UploadSummary);                 // client streaming
  rpc Chat (stream ChatMessage) returns (stream ChatMessage);            // bidirectional
}
message GetOrderRequest { int64 id = 1; }
message Order { int64 id = 1; string status = 2; double total = 3; }
```

### Four method types
| Type | Request | Response |
|---|---|---|
| Unary | one | one |
| Server streaming | one | many |
| Client streaming | many | one |
| Bidirectional streaming | many | many |

### In Postman
1. New → **gRPC**.
2. **Server URL** (e.g. `localhost:50051` or `grpc.example.com:443`); toggle **TLS** (lock icon) for secure servers.
3. **Service definition**: use **server reflection** (if server enables it), **import a `.proto` file** (add import paths for dependencies), or use a definition from **Spec Hub/APIs**.
4. Select **method** → compose message in JSON (Postman converts to protobuf) → **Use example message** to auto-generate a template.
5. **Metadata** = gRPC's equivalent of headers (e.g. `authorization: Bearer ...`).
6. **Invoke**. For streaming: send multiple messages, **End streaming**, view message timeline.
7. **Scripts** (Before invoke / After response) and tests are supported for gRPC; the response exposes status code, metadata/trailers and messages — e.g.:
```javascript
pm.test("gRPC OK", () => pm.response.to.have.statusCode(0));
```
(Check the gRPC scripting reference for your version for the full assertion list.)

### gRPC status codes (memorise top ones)
| Code | Name | HTTP-ish analogy |
|---|---|---|
| 0 | OK | 200 |
| 1 | CANCELLED | client cancelled |
| 2 | UNKNOWN | 500 |
| 3 | INVALID_ARGUMENT | 400 |
| 4 | DEADLINE_EXCEEDED | 504 |
| 5 | NOT_FOUND | 404 |
| 6 | ALREADY_EXISTS | 409 |
| 7 | PERMISSION_DENIED | 403 |
| 8 | RESOURCE_EXHAUSTED | 429 |
| 9 | FAILED_PRECONDITION | 400/412 |
| 10 | ABORTED | 409 |
| 11 | OUT_OF_RANGE | 400 |
| 12 | UNIMPLEMENTED | 501 |
| 13 | INTERNAL | 500 |
| 14 | UNAVAILABLE | 503 |
| 15 | DATA_LOSS | 500 |
| 16 | UNAUTHENTICATED | 401 |

### Common gRPC problems
| Problem | Fix |
|---|---|
| "Could not load server reflection" | Server doesn't enable reflection → import `.proto` |
| Import errors in `.proto` | Add import paths (e.g. for `google/protobuf/timestamp.proto`) |
| `14 UNAVAILABLE` / connection failed | Wrong host/port, TLS toggle mismatch (TLS on a plaintext server or vice versa), server down |
| `16 UNAUTHENTICATED` | Missing `authorization` metadata |
| `12 UNIMPLEMENTED` | Wrong package/service/method name or version |
| int64 values look like strings | Protobuf JSON mapping represents 64-bit ints as **strings** — expected |
| `4 DEADLINE_EXCEEDED` | Increase deadline/timeout in settings |

---

## 13.3 WebSocket

> 🧒 HTTP is **sending letters**: you send one, wait for a reply. WebSocket is a **phone call**: once connected, both sides can talk anytime.

### Concepts
- Starts with an HTTP **Upgrade** handshake (`101 Switching Protocols`), then a persistent full-duplex connection.
- `ws://` (plain) and `wss://` (TLS).
- Frames: text, binary, ping/pong, close (close codes: 1000 normal, 1001 going away, 1006 abnormal, 1008 policy violation, 1011 server error).

### In Postman
1. New → **WebSocket** → URL `wss://echo.websocket.org` (public echo server; availability can change) or your server.
2. **Headers/Params** for the handshake (auth tokens are often passed as a query param or header, or in the first message).
3. **Connect** → message composer (Text/JSON/Binary), **Send**; **Saved messages** for reuse.
4. **Messages log**: sent/received with timestamps; search/filter; connection events.
5. **Settings**: handshake timeout, reconnect attempts/intervals, max message size.
6. Raw WebSocket scripting/test support is limited compared with HTTP — verify in your version; for automated WS tests use code-based tools (Node `ws`, k6 websockets, Playwright) if needed.

### What to test
- Handshake auth (no token → rejected with 401/403 during upgrade).
- Message format & schema, error messages.
- Ordering, heartbeats (ping/pong), reconnect behaviour, idle timeouts.
- Broadcast correctness (two connections: one sends, other receives).
- Limits: max message size, rate limiting.

---

## 13.4 Socket.IO
- A library **on top of** WebSocket (with long-polling fallback), using **events** and **acknowledgements**, rooms and namespaces. A plain WebSocket client **can't** talk to a Socket.IO server properly → use Postman's **Socket.IO** request type.
- In Postman: URL, **client version** (v2/v3/v4), **handshake path** (default `/socket.io`), **Events** tab to add **listeners** (event names to listen to), compose messages with **event name** + arguments, optionally **Ack**.
- Test: event names, payloads, auth middleware rejection, room join/leave behaviour.

---

## 13.5 MQTT (IoT)
- **Publish/subscribe** via a **broker** (Mosquitto, EMQX, HiveMQ, AWS IoT Core).
- **Topics** like `factory/line1/temperature`; wildcards `+` (single level), `#` (multi-level).
- **QoS**: 0 = at most once, 1 = at least once, 2 = exactly once.
- **Retain** flag (broker keeps last message), **Last Will and Testament**, **clean session**, keep-alive.
- MQTT 3.1.1 and **5.0** (user properties, reason codes, message expiry, topic aliases).

In Postman: New → **MQTT** → broker URL (`mqtt://broker.hivemq.com:1883`, `mqtts://...:8883`, or WebSocket transport), client ID, auth (username/password, certificates), version, **Topics** to subscribe (with QoS), compose & **publish** messages with QoS/retain; view message timeline.

---

## 13.6 SOAP
SOAP = XML **envelope** over (usually) HTTP POST.

### SOAP 1.1 request in Postman
- Method: **POST**
- URL: `http://www.dneonline.com/calculator.asmx` (public demo calculator service; availability can change)
- Headers:
  - `Content-Type: text/xml; charset=utf-8`
  - `SOAPAction: "http://tempuri.org/Add"`
- Body → raw → XML:
```xml
<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <Add xmlns="http://tempuri.org/">
      <intA>5</intA>
      <intB>7</intB>
    </Add>
  </soap:Body>
</soap:Envelope>
```
### SOAP 1.2 difference
- `Content-Type: application/soap+xml; charset=utf-8; action="http://tempuri.org/Add"` (no separate SOAPAction header), envelope namespace `http://www.w3.org/2003/05/soap-envelope`.

### Import WSDL
**Import** a WSDL URL/file → Postman generates a collection with a request per operation (sample envelopes).

### Testing SOAP responses
```javascript
const json = xml2Json(pm.response.text());
const result = json["soap:Envelope"]["soap:Body"]["AddResponse"]["AddResult"];
pm.test("5 + 7 = 12", () => pm.expect(Number(result)).to.eql(12));
```
Or with cheerio in XML mode:
```javascript
const $ = cheerio.load(pm.response.text(), { xmlMode: true });
pm.test("Result is 12", () => pm.expect($("AddResult").text()).to.eql("12"));
```
- **SOAP Faults**: `<soap:Fault><faultcode>...</faultcode><faultstring>...</faultstring></soap:Fault>` typically with HTTP **500** (SOAP 1.1). Test for faults explicitly.
- WS-Security (UsernameToken, signatures) must be built manually into the header (or via scripts generating nonce/timestamps/digests with CryptoJS).

---

## 13.7 Server-Sent Events (SSE)
- `GET` with `Accept: text/event-stream`; server streams `event:`/`data:`/`id:` lines; one-way server → client. Common for **LLM streaming APIs** and live dashboards.
- Postman HTTP requests display SSE streams **event by event** in recent versions (the response view shows the stream, with option to view each event).
- For testing assertions on streamed data, the post-response script sees the final body text — parse lines:
```javascript
const events = pm.response.text().split("\n").filter(l => l.startsWith("data:")).map(l => l.slice(5).trim());
pm.test("Stream ended with [DONE]", () => pm.expect(events[events.length - 1]).to.eql("[DONE]"));
```

---

## 13.8 JSON-RPC
Plain HTTP POST with body:
```json
{ "jsonrpc": "2.0", "method": "getBalance", "params": { "account": "0xabc" }, "id": 1 }
```
Errors come as `{ "error": { "code": -32601, "message": "Method not found" }, "id": 1 }` (often HTTP 200). Codes: -32700 parse error, -32600 invalid request, -32601 method not found, -32602 invalid params, -32603 internal error. (Blockchain node APIs like Ethereum use JSON-RPC.)

---

## 13.9 MCP (Model Context Protocol) requests
- **MCP** is an open protocol (introduced by Anthropic, 2024) for connecting AI applications to tools and data. Servers expose **tools**, **resources**, and **prompts** over **JSON-RPC 2.0**, via transports like **stdio** (local process) or **Streamable HTTP** (older: HTTP+SSE).
- Recent Postman versions provide an **MCP request** type: connect to a server (stdio command or HTTP URL), list its **tools/prompts/resources**, call tools with arguments, and inspect responses.
- What to test: tool discovery (names, descriptions, input schemas), valid & invalid arguments (schema validation errors), auth (OAuth for remote MCP servers), timeouts and large outputs, error shape (`isError: true` in tool results vs JSON-RPC errors), idempotency of tools that change data, prompt-injection resilience of tool outputs.

## 13.10 AI (LLM) requests
- Recent versions provide an **AI request** type to send prompts to LLM providers (OpenAI, Anthropic, Google, and others), compare models/parameters, and save them in collections — useful for testing AI features and prompts like any other API.
- You can of course also call LLM APIs as normal HTTP requests (e.g. `POST https://api.anthropic.com/v1/messages` with headers `x-api-key`, `anthropic-version`, `content-type: application/json`).
- Testing LLM outputs: assert **structure** (JSON schema of tool calls/structured outputs), **latency**, **token usage**, safety; avoid asserting exact wording (non-deterministic) — use contains/regex or an evaluator.

---

## 13.11 Chapter 13 Quick Revision
- GraphQL: one endpoint, POST `{query, variables}`, errors often with **200** → check `errors`. Security: depth/complexity limits, introspection.
- gRPC: protobuf over HTTP/2, 4 method types, reflection or `.proto`, metadata = headers, status codes 0–16 (0 OK, 3 INVALID_ARGUMENT, 5 NOT_FOUND, 7 PERMISSION_DENIED, 14 UNAVAILABLE, 16 UNAUTHENTICATED).
- WebSocket: upgrade (101), full-duplex, close codes; Socket.IO needs its own client.
- MQTT: broker, topics, QoS 0/1/2, retain, LWT.
- SOAP: POST XML envelope; 1.1 `text/xml` + `SOAPAction`; 1.2 `application/soap+xml; action=`; Faults; WSDL import.
- SSE streams; JSON-RPC error codes; MCP (tools/resources/prompts over JSON-RPC); AI requests.

➡️ Next: **Chapter 14 — Collaboration, Version Control & Organising Large Projects**.
