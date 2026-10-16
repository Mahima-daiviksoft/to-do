# The WebSocket + STOMP Book

### From "what is a network?" to running real-time messaging at company scale, plus interview prep

> **Who is this for?** Everyone. If you have never heard the word "socket", start at Chapter 1.
> If you already ship Spring/STOMP to production, jump to Chapters 6–10. If your interview is
> tomorrow, read Chapter 12 (Interview Questions, both parts) and Chapter 13 (Cheat Sheet).

---

## How this book is organised

| # | Chapter | What you will be able to do after reading it |
|---|---------|----------------------------------------------|
| 1 | [Foundations: How computers talk](01-foundations.md) | Explain TCP, HTTP, request/response, polling, long polling, SSE, and *why* WebSocket was invented |
| 2 | [The WebSocket Protocol (RFC 6455), deep dive](02-websocket-protocol.md) | Draw the handshake, decode a frame byte by byte, explain masking, fragmentation, ping/pong, close codes, extensions, subprotocols, WebSocket over HTTP/2 and HTTP/3 |
| 3 | [The Browser & JavaScript WebSocket API](03-websocket-browser-api.md) | Use `new WebSocket()` correctly, know its limits (no headers, no ping), handle reconnects and backpressure |
| 4 | [The STOMP Protocol (1.0 / 1.1 / 1.2), deep dive](04-stomp-protocol.md) | Write STOMP frames by hand, explain every command and header, heart-beats, ack modes, receipts, transactions, escaping |
| 5 | [Spring WebSocket + STOMP: Server side](05-spring-stomp-server.md) | Build a production Spring Boot STOMP server; understand channels, annotations, `SimpMessagingTemplate`, user destinations, events, configuration |
| 6 | [Clients: JavaScript, React, React Native, Angular, Java, Python, SockJS](06-clients.md) | Connect any client correctly, including the React Native gotchas |
| 7 | [Message Brokers, Clustering & Scaling](07-brokers-and-scaling.md) | Choose simple broker vs relay, configure RabbitMQ/ActiveMQ, scale horizontally, load balancers, Kubernetes |
| 8 | [Security](08-security.md) | Authenticate (JWT, cookies), authorise destinations, stop CSWSH, CSRF, DoS, data leaks |
| 9 | [Reliability, Performance & Tuning](09-reliability-performance.md) | Heart-beats, timeouts, backpressure, thread pools, ordering, delivery guarantees, idempotency, monitoring |
| 10 | [Testing, Debugging & the Bug Encyclopedia](10-testing-debugging-troubleshooting.md) | Test everything, debug with tools, and fix 60+ real-world bugs by symptom |
| 11 | [Architecture, Design Patterns & Organisational Best Practices](11-architecture-best-practices.md) | Design chat, notifications, dashboards, collaboration; run it in a big company; runbooks |
| 12 | [Interview Questions & Answers, Part 1](12-interview-questions.md): fundamentals, WebSocket, browser, STOMP, Spring | Answer the core technical questions with confidence |
| 12b | [Interview Questions & Answers, Part 2](12-interview-questions-part2.md): security, scaling, reliability, debugging scenarios, system design, coding, rapid-fire, gotchas | Handle senior-level, scenario and design rounds |
| 13 | [Cheat Sheet & Glossary](13-cheatsheet-glossary.md) | Look anything up in seconds |
| A | [Appendix A: Beyond Spring STOMP](14-appendix-other-stacks.md): Jakarta WebSocket, raw Spring handlers, WebFlux, RSocket, Spring Session, Kafka gateway, HTTP/2, Node, Socket.IO, SignalR, Go, GraphQL subscriptions, Yjs, MQTT | Compare and integrate other stacks |
| B | [Appendix B: Runnable sample project](../../examples/stomp-todo/README.md): Spring Boot 4 server + TypeScript/React Native client, 11 passing integration tests | Run, read and adapt working code |
| C | [Appendix C: Verification notes & sources](15-verification-notes.md) | See what was checked, against what |

---

## The whole story in one paragraph (the "5-year-old" version)

Imagine you and your friend live in two houses. **HTTP** is like sending a letter: you write
a question, post it, and wait for a reply. If you want to know whether your friend has news,
you must keep sending letters ("Any news? Any news? Any news?"). That is slow and wasteful.

**WebSocket** is like installing a **telephone line** between the two houses. You call once
(the *handshake*), and after that either of you can talk at any moment, as long as the line stays open.

But a telephone line only carries *sounds*. You still need to agree on *a language*, for example
"When I say *SUBSCRIBE kitchen*, tell me every time something happens in the kitchen."
**STOMP** is that language. It is a small, simple set of words (`CONNECT`, `SUBSCRIBE`, `SEND`, `MESSAGE`...)
spoken over the WebSocket telephone line.

Finally, if lots of people want to hear about the kitchen, you need a **post office** that copies
each kitchen message to everyone who asked. That is the **message broker** (Spring's simple broker,
RabbitMQ, ActiveMQ...).

```
 Telephone line   = WebSocket  (transport: moves bytes both ways, any time)
 Language         = STOMP      (protocol: what the bytes mean - commands, destinations)
 Post office      = Broker     (routing: who gets which message)
 Your house       = Client     (browser, mobile app, Java service)
 Friend's house   = Server     (Spring Boot app, etc.)
```

Keep this picture in your head. Every chapter adds detail to one of these five boxes.

---

## Conventions used in this book

* **ELI5** boxes: a child-friendly explanation before the technical one.
* **Deep dive** boxes: the exact details (byte layouts, spec rules, framework internals).
* **Pitfall** boxes: things that bite people in production.
* **Interview tip** boxes: how this shows up in interviews.
* Code is mostly **Java 17+ / Spring Boot 3.x–4.x / Spring Framework 6.x–7.x** on the server and
  **TypeScript / `@stomp/stompjs` v7** on the client, because that is the most common enterprise stack.
  Concepts apply to any language.
* "Spec" means the official STOMP 1.2 specification (stomp.github.io) or RFC 6455 (WebSocket).

## Sources this book is checked against

* RFC 6455: *The WebSocket Protocol* (IETF, December 2011)
* RFC 7692: *Compression Extensions for WebSocket* (permessage-deflate)
* RFC 8441: *Bootstrapping WebSockets with HTTP/2*; RFC 9220: *Bootstrapping WebSockets with HTTP/3*
* WHATWG *WebSockets Standard* (the browser API)
* *STOMP Protocol Specification, Version 1.2* (and 1.1, 1.0), stomp.github.io
* Spring Framework Reference: "WebSockets" chapter (WebSocket API, SockJS, STOMP)
* Spring Security Reference: "WebSocket Security"
* `@stomp/stompjs` documentation (stomp-js.github.io)
* RabbitMQ STOMP and Web STOMP plugin documentation
* OWASP WebSocket Security Cheat Sheet

Library APIs change over time. Where something differs between versions, the book says which version.
Before you rely on an exact default value in production, confirm it against the version you run.
