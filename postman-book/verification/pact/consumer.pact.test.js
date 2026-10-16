// Consumer-side contract test (Pact JS v12+ API: PactV3 / MatchersV3)
const path = require("path");
const assert = require("assert");
const axios = require("axios");
const { PactV3, MatchersV3 } = require("@pact-foundation/pact");
const { like, integer, eachLike, regex } = MatchersV3;

const provider = new PactV3({
  consumer: "web-frontend",
  provider: "orders-api",
  dir: path.resolve(__dirname, "pacts"),
});

(async () => {
  provider
    .given("order 42 exists")
    .uponReceiving("a request for order 42")
    .withRequest({ method: "GET", path: "/orders/42", headers: { Accept: "application/json" } })
    .willRespondWith({
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: {
        id: integer(42),
        status: regex("PENDING|PAID|SHIPPED", "PAID"),
        items: eachLike({ sku: like("A1"), qty: integer(1) }),
      },
    });

  await provider.executeTest(async (mockServer) => {
    const res = await axios.get(`${mockServer.url}/orders/42`, { headers: { Accept: "application/json" } });
    assert.strictEqual(res.data.id, 42);
    assert.ok(["PENDING", "PAID", "SHIPPED"].includes(res.data.status));
  });
  console.log("PACT_CONSUMER_OK; pact file written to pact/pacts/");
})().catch((e) => { console.error("PACT_FAIL", e); process.exit(1); });
