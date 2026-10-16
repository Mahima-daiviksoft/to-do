// Local stand-in for the public APIs used in the book (httpbin / jsonplaceholder / restful-booker style)
const express = require("express");
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const users = Array.from({ length: 10 }, (_, i) => ({
  id: i + 1, name: `User ${i + 1}`, username: `user${i + 1}`, email: `user${i + 1}@example.com`,
  address: { city: "Pune", geo: { lat: "18.5", lng: "73.8" } }
}));
users[2].name = "Clementine Bauch";
const posts = [];
for (let u = 1; u <= 10; u++) for (let p = 1; p <= 10; p++) posts.push({ userId: u, id: (u - 1) * 10 + p, title: `t${p}` });

let tokenExpires = 0;
let pollCount = 0;
let retryCount = 0;
const bookings = {};
let nextBooking = 1;

app.get("/users", (req, res) => res.json(users));
app.get("/users/:id", (req, res) => res.json(users[req.params.id - 1]));
app.get("/posts", (req, res) => res.json(req.query.userId ? posts.filter(p => p.userId == req.query.userId) : posts));
app.get("/posts/:id/comments", (req, res) => res.json(Array.from({ length: 5 }, (_, i) => ({ postId: +req.params.id, id: i }))));

// paginated orders
const orders = Array.from({ length: 23 }, (_, i) => ({ id: i + 1, price: 100 - i, createdAt: new Date(Date.now() - i * 1000).toISOString() }));
app.get("/orders", (req, res) => {
  const page = +req.query.page || 1, limit = +req.query.limit || 10;
  const data = orders.slice((page - 1) * limit, page * limit);
  res.json({ data, page, total: orders.length, hasMore: page * limit < orders.length });
});

// OAuth-style client credentials token endpoint
app.post("/oauth/token", (req, res) => {
  if (req.body.grant_type !== "client_credentials" || req.body.client_secret !== "s3cret") return res.status(401).json({ error: "invalid_client" });
  tokenExpires = Date.now() + 60000;
  res.json({ access_token: "tok-" + Date.now(), token_type: "Bearer", expires_in: 60 });
});
app.get("/secure", (req, res) => {
  const h = req.headers.authorization || "";
  if (!h.startsWith("Bearer tok-")) return res.status(401).set("WWW-Authenticate", "Bearer").json({ code: "UNAUTHORIZED", message: "missing token" });
  res.json({ ok: true });
});

// echo
app.all("/anything", (req, res) => res.json({ method: req.method, headers: req.headers, args: req.query, json: req.body }));
app.get("/status/:code", (req, res) => res.status(+req.params.code).json({ code: +req.params.code }));
app.get("/html", (req, res) => res.type("html").send("<html><head><title>Dashboard</title></head><body><input name='_token' value='csrf123'></body></html>"));
app.get("/xml", (req, res) => res.type("xml").send(`<?xml version="1.0"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><AddResponse xmlns="http://tempuri.org/"><AddResult>12</AddResult></AddResponse></soap:Body></soap:Envelope>`));
app.get("/cookies/set", (req, res) => { res.cookie("sessionId", "abc123", { httpOnly: true, secure: true }); res.cookie("csrftoken", "csrfval"); res.json({ set: true }); });
app.get("/empty", (req, res) => res.status(204).end());

// async job polling
app.get("/jobs/1", (req, res) => { pollCount++; res.json({ status: pollCount >= 3 ? "COMPLETED" : "RUNNING", attempt: pollCount }); });
// flaky endpoint: 503 twice then 200
app.get("/flaky", (req, res) => { retryCount++; if (retryCount <= 2) return res.status(503).set("Retry-After", "0").json({}); res.json({ ok: true }); });

// restful-booker-like
app.post("/auth", (req, res) => {
  if (req.body.username === "admin" && req.body.password === "password123") return res.json({ token: "rbtoken" });
  res.json({ reason: "Bad credentials" });
});
app.post("/booking", (req, res) => { const id = nextBooking++; bookings[id] = req.body; res.json({ bookingid: id, booking: req.body }); });
app.get("/booking/:id", (req, res) => bookings[req.params.id] ? res.json(bookings[req.params.id]) : res.status(404).send("Not Found"));
app.patch("/booking/:id", (req, res) => {
  if ((req.headers.cookie || "").indexOf("token=rbtoken") < 0) return res.sendStatus(403);
  Object.assign(bookings[req.params.id], req.body); res.json(bookings[req.params.id]);
});
app.delete("/booking/:id", (req, res) => {
  if ((req.headers.cookie || "").indexOf("token=rbtoken") < 0) return res.sendStatus(403);
  delete bookings[req.params.id]; res.status(201).send("Created");
});

app.listen(3555, "127.0.0.1", () => console.log("listening 3555"));
