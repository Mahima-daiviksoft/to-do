# The Socket.IO Book — From Zero to Expert (and Interview-Ready)

> A complete, beginner-to-advanced guide to Socket.IO, written so a beginner can follow it
> ("explain it like I'm 5") while going deep enough for senior engineers working on large
> production systems. It ends with a very large interview question bank.

**Version covered:** Socket.IO **v4.x** (verified against `socket.io@4.8.4`,
`socket.io-client@4.8.4`, `engine.io@6.6.x`, `@socket.io/redis-adapter@8.3.x`).
Differences with older versions (v2, v3) are called out where they matter, because
interviewers love asking about them and old code bases still use them.

Every protocol example in this book (handshake packets, wire format) was captured from a
real running Socket.IO 4.8.4 server, and every default value was checked against the
library's source code.

---

## How to read this book

| If you are…                         | Read                                                    |
|-------------------------------------|---------------------------------------------------------|
| A complete beginner                 | Chapters 1 → 5 in order, then Chapter 13 (projects)     |
| A developer preparing for interview | Chapters 1–8 skim, then Chapter 14 (questions) fully    |
| Working on a big production system  | Chapters 5, 6, 8, 10, 11, 12, 13                        |
| Debugging something right now       | Chapter 12 (Troubleshooting) first                      |
| Want a quick reference              | Chapter 15 (Cheat sheet & API reference)                |

## Table of contents

1. [Foundations — what "real-time" means and why Socket.IO exists](01-foundations.md)
2. [Getting started — your first server and client](02-getting-started.md)
3. [Events, emitting, listening and acknowledgements](03-events-and-acknowledgements.md)
4. [Rooms, namespaces and broadcasting](04-rooms-namespaces-broadcasting.md)
5. [Connection lifecycle — connect, disconnect, reconnect, heartbeats, recovery, delivery guarantees](05-connection-lifecycle.md)
6. [Middleware, authentication and security](06-middleware-auth-security.md)
7. [Under the hood — Engine.IO, transports, the protocol, parsers, adapters](07-under-the-hood.md)
8. [Scaling — multiple servers, sticky sessions, adapters, Redis, load balancers, Kubernetes](08-scaling.md)
9. [TypeScript, frontend frameworks, mobile and other languages](09-typescript-frameworks-clients.md)
10. [Testing, debugging and monitoring](10-testing-debugging-monitoring.md)
11. [Performance tuning and running in production](11-performance-production.md)
12. [Troubleshooting — common bugs, symptoms, causes and fixes](12-troubleshooting.md)
13. [Architecture, patterns, organisational best practices and full projects](13-architecture-patterns-projects.md)
14. [Interview question bank — entry level to senior/architect (with detailed answers)](14-interview-questions.md)
15. [Cheat sheet, full API reference and glossary](15-cheatsheet-api-reference.md)

## The one-paragraph summary (if you remember nothing else)

Socket.IO is a library that gives you **a two-way, event-based, real-time channel between a
client (usually a browser or mobile app) and a server**. Under the hood it uses a lower
layer called **Engine.IO**, which opens a connection using **HTTP long-polling** or
**WebSocket** (or **WebTransport**), keeps it alive with **heartbeats**, and **upgrades** to
the best transport available. On top of that, Socket.IO adds **named events**,
**acknowledgements** (request/response), **automatic reconnection**, **rooms** and
**namespaces** (grouping), **broadcasting**, **middleware**, **binary support** and
**multi-server scaling via adapters** (e.g. Redis). It is **not** a plain WebSocket library:
a plain WebSocket client cannot talk to a Socket.IO server and vice-versa.
