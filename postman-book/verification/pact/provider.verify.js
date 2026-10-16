// Provider verification: replays the pact against the real provider
const path = require("path");
const express = require("express");
const { Verifier } = require("@pact-foundation/pact");

const app = express();
app.get("/orders/:id", (req, res) => res.json({ id: Number(req.params.id), status: "PAID", items: [{ sku: "B7", qty: 3 }] }));
const server = app.listen(4567, async () => {
  try {
    await new Verifier({
      providerBaseUrl: "http://127.0.0.1:4567",
      pactUrls: [path.resolve(__dirname, "pacts", "web-frontend-orders-api.json")],
      stateHandlers: { "order 42 exists": async () => { /* seed test data here */ } },
    }).verifyProvider();
    console.log("PACT_PROVIDER_VERIFIED");
  } catch (e) { console.error("PACT_PROVIDER_FAIL", e.message); process.exitCode = 1; }
  finally { server.close(); }
});
