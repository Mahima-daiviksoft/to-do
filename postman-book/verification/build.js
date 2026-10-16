// Builds verify.postman_collection.json from book snippets
const fs = require("fs");
const B = "{{baseUrl}}";
const items = [];
function req(name, method, url, { pre, test, body, headers, urlencoded, auth } = {}) {
  const r = { method, header: Object.entries(headers || {}).map(([key, value]) => ({ key, value })), url };
  if (body !== undefined) r.body = { mode: "raw", raw: typeof body === "string" ? body : JSON.stringify(body), options: { raw: { language: "json" } } };
  if (urlencoded) r.body = { mode: "urlencoded", urlencoded: Object.entries(urlencoded).map(([key, value]) => ({ key, value })) };
  if (auth) r.auth = auth;
  const event = [];
  if (pre) event.push({ listen: "prerequest", script: { type: "text/javascript", exec: pre.split("\n") } });
  if (test) event.push({ listen: "test", script: { type: "text/javascript", exec: test.split("\n") } });
  items.push({ name, event, request: r });
}

// ---------- Ch8 response assertions ----------
req("ch8 response assertions", "GET", `${B}/users/1`, { test: `
pm.test("status 200", () => pm.response.to.have.status(200));
pm.test("status reason OK", () => pm.response.to.have.status("OK"));
pm.test("to.be.ok", () => pm.response.to.be.ok);
pm.test("to.be.success", () => pm.response.to.be.success);
pm.test("to.not.be.error", () => pm.response.to.not.be.error);
pm.test("header exists", () => pm.response.to.have.header("Content-Type"));
pm.test("ct include json", () => pm.expect(pm.response.headers.get("content-type")).to.include("application/json"));
pm.test("jsonBody()", () => pm.response.to.have.jsonBody());
pm.test("jsonBody path", () => pm.response.to.have.jsonBody("address.city"));
pm.test("jsonBody path value", () => pm.response.to.have.jsonBody("address.city", "Pune"));
pm.test("to.be.json", () => pm.response.to.be.json);
pm.test("to.be.withBody", () => pm.response.to.be.withBody);
pm.test("responseTime number", () => pm.expect(pm.response.responseTime).to.be.a("number"));
pm.test("responseSize number", () => pm.expect(pm.response.responseSize).to.be.a("number"));
pm.test("jsonSchema", () => pm.response.to.have.jsonSchema({ type: "object", required: ["id","email"], properties: { id: {type:"integer"}, email: {type:"string"} } }));
pm.test("jsonSchema fails on wrong schema (expected FAIL check)", () => {
  let failed = false; try { pm.response.to.have.jsonSchema({ type: "object", required: ["nope"] }); } catch (e) { failed = true; }
  pm.expect(failed).to.be.true;
});
`});

req("ch8 status helpers", "GET", `${B}/status/404`, { test: `
pm.test("notFound", () => pm.response.to.be.notFound);
pm.test("clientError", () => pm.response.to.be.clientError);
pm.test("error", () => pm.response.to.be.error);
pm.test("ok is 200 only", () => { let f=false; try { pm.response.to.be.ok; } catch(e){ f=true; } pm.expect(f).to.be.true; });
`});
req("ch8 401/429/202 helpers", "GET", `${B}/status/429`, { test: `
pm.test("rateLimited", () => pm.response.to.be.rateLimited);
`});
req("ch8 accepted", "GET", `${B}/status/202`, { test: `
pm.test("accepted", () => pm.response.to.be.accepted);
pm.test("success covers 202", () => pm.response.to.be.success);
pm.test("ok fails on 202", () => { let f=false; try { pm.response.to.be.ok; } catch(e){ f=true; } pm.expect(f).to.be.true; });
`});

req("ch8 chai toolkit", "GET", `${B}/users`, { test: `
const users = pm.response.json(); const u = users[0];
pm.test("eql deep", () => pm.expect({a:1}).to.eql({a:1}));
pm.test("equal on objects fails", () => { let f=false; try { pm.expect({a:1}).to.equal({a:1}); } catch(e){ f=true; } pm.expect(f).to.be.true; });
pm.test("string vs number strict", () => pm.expect("1").to.not.equal(1));
pm.test("types", () => { pm.expect(u.id).to.be.a("number"); pm.expect(users).to.be.an("array"); pm.expect(u.address).to.be.an("object"); });
pm.test("nested.property", () => pm.expect(u).to.have.nested.property("address.city", "Pune"));
pm.test("include.all.keys", () => pm.expect(u).to.include.all.keys("id","name"));
pm.test("have.all.keys exact", () => pm.expect({id:1,name:2}).to.have.all.keys("id","name"));
pm.test("any.keys", () => pm.expect(u).to.have.any.keys("phone","email"));
pm.test("not any keys", () => pm.expect(u).to.not.have.any.keys("password","ssn"));
pm.test("deep.include obj", () => pm.expect(u).to.deep.include({ id: 1 }));
pm.test("array deep.include", () => pm.expect(users).to.deep.include(users[1]));
pm.test("lengthOf", () => pm.expect(users).to.have.lengthOf(10));
pm.test("lengthOf.at.least", () => pm.expect(users).to.have.lengthOf.at.least(1));
pm.test("lengthOf.at.most", () => pm.expect(users).to.have.lengthOf.at.most(10));
pm.test("members", () => pm.expect(["sale","new"]).to.have.members(["new","sale"]));
pm.test("include.members", () => pm.expect(["sale","new"]).to.include.members(["sale"]));
pm.test("oneOf", () => pm.expect("PAID").to.be.oneOf(["PENDING","PAID"]));
pm.test("closeTo", () => pm.expect(0.1+0.2).to.be.closeTo(0.3, 0.0001));
pm.test("within", () => pm.expect(3).to.be.within(1,5));
pm.test("satisfy", () => pm.expect([1,2,3]).to.satisfy(a => a.every(n => n > 0)));
pm.test("match", () => pm.expect(u.email).to.match(/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/));
pm.test("empty", () => { pm.expect([]).to.be.empty; pm.expect([1]).to.not.be.empty; });
pm.test("chai ok truthy", () => pm.expect("x").to.be.ok);
pm.test("exist", () => pm.expect(u.id).to.exist);
pm.test("custom message", () => pm.expect(1, "my msg").to.eql(1));
pm.test("unique ids via Set", () => pm.expect(new Set(users.map(x=>x.id)).size).to.eql(users.length));
pm.test("find Clementine id 3", () => pm.expect(users.find(x => x.name === "Clementine Bauch").id).to.eql(3));
pm.test.skip("skipped test example", () => {});
`});

// ---------- Ch7 sandbox libraries ----------
req("ch7 libraries", "GET", `${B}/users/1`, { test: `
const lodash = require("lodash"); const moment = require("moment"); const uuid = require("uuid");
const Ajv = require("ajv"); const cheerioR = require("cheerio"); const xml2js = require("xml2js");
const parse = require("csv-parse/lib/sync"); const CryptoJSr = require("crypto-js");
pm.test("lodash _.get", () => pm.expect(lodash.get(pm.response.json(), "address.geo.lat")).to.eql("18.5"));
pm.test("global _", () => pm.expect(typeof _ ).to.eql("function"));
pm.test("moment", () => pm.expect(moment("2026-01-01").add(7, "days").format("YYYY-MM-DD")).to.eql("2026-01-08"));
pm.test("uuid v4", () => pm.expect(uuid.v4()).to.match(/^[0-9a-f-]{36}$/));
pm.test("csv parse", () => pm.expect(parse("a,b\\n1,2\\n", { columns: true, skip_empty_lines: true })).to.eql([{a:"1",b:"2"}]));
pm.test("CryptoJS global sha256", () => pm.expect(CryptoJS.SHA256("hello").toString(CryptoJS.enc.Hex)).to.eql("2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824"));
pm.test("CryptoJS base64", () => pm.expect(CryptoJS.enc.Base64.stringify(CryptoJS.enc.Utf8.parse("hello"))).to.eql("aGVsbG8="));
pm.test("btoa/atob", () => { pm.expect(btoa("asha:secret")).to.eql("YXNoYTpzZWNyZXQ="); pm.expect(atob("aGVsbG8=")).to.eql("hello"); });
pm.test("Buffer via require", () => pm.expect(require("buffer").Buffer.from("hi").toString("base64")).to.eql("aGk="));
pm.test("ajv compile", () => { const v = new Ajv({ allErrors: true }).compile({ type:"object", required:["id"] }); pm.expect(v(pm.response.json()), JSON.stringify(v.errors)).to.be.true; pm.expect(v({})).to.be.false; pm.expect(v.errors).to.be.an("array"); });
pm.test("ajv format email enforced?", () => { const v = new Ajv().compile({ type:"string", format:"email" }); console.log("AJV_FORMAT_EMAIL_REJECTS_BAD=", !v("not-an-email")); });
pm.test("tv4 global exists", () => pm.expect(typeof tv4).to.eql("object"));
pm.test("node url module", () => pm.expect(require("url")).to.exist);
`});

req("ch7 html cheerio", "GET", `${B}/html`, { test: `
const $ = cheerio.load(pm.response.text());
pm.test("title", () => pm.expect($("title").text()).to.include("Dashboard"));
pm.test("csrf hidden input", () => pm.expect($('input[name="_token"]').val()).to.eql("csrf123"));
pm.test("json() throws JSONError on HTML", () => { try { pm.response.json(); pm.expect.fail("no throw"); } catch (e) { console.log("HTML_JSON_ERROR=", e.name, "|", e.message); pm.expect(e.name).to.match(/JSONError|SyntaxError/); } });
`});

req("ch7/13 xml", "GET", `${B}/xml`, { test: `
const json = xml2Json(pm.response.text());
const result = json["soap:Envelope"]["soap:Body"]["AddResponse"]["AddResult"];
pm.test("xml2Json 5+7=12", () => pm.expect(Number(result)).to.eql(12));
const $ = cheerio.load(pm.response.text(), { xmlMode: true });
pm.test("cheerio xmlMode", () => pm.expect($("AddResult").text()).to.eql("12"));
require("xml2js").parseString(pm.response.text(), { explicitArray: false }, (err, r) => {
  pm.test("xml2js async parse", () => pm.expect(r["soap:Envelope"]["soap:Body"].AddResponse.AddResult).to.eql("12"));
});
`});

req("ch16 empty 204 json()", "GET", `${B}/empty`, { test: `
pm.test("text empty", () => pm.expect(pm.response.text()).to.eql(""));
try { pm.response.json(); } catch (e) { console.log("EMPTY_JSON_ERROR=", e.name, "|", e.message); }
`});

// ---------- Ch5 variables ----------
req("ch5 variables & precedence", "GET", `${B}/anything?x={{baseUrl}}`, {
  pre: `
pm.collectionVariables.set("scopeTest", "collection");
pm.globals.set("scopeTest", "global");
pm.environment.set("scopeTest", "environment");
pm.variables.set("localOnly", "local");
const email = pm.variables.replaceIn("{{$randomExampleEmail}}");
pm.collectionVariables.set("newUserEmail", email);
pm.environment.set("objVar", JSON.stringify({ id: 7, roles: ["admin"] }));
pm.environment.set("numVar", 5);
`, test: `
pm.test("env beats collection & global", () => pm.expect(pm.variables.get("scopeTest")).to.eql("environment"));
pm.variables.set("scopeTest", "local");
pm.test("local beats env", () => pm.expect(pm.variables.get("scopeTest")).to.eql("local"));
pm.test("local var visible", () => pm.expect(pm.variables.get("localOnly")).to.eql("local"));
pm.test("environment.name", () => pm.expect(pm.environment.name).to.eql("Verify ENV"));
pm.test("replaceIn email", () => pm.expect(pm.collectionVariables.get("newUserEmail")).to.include("@"));
pm.test("dynamic var differs each call", () => pm.expect(pm.variables.replaceIn("{{$guid}}")).to.not.eql(pm.variables.replaceIn("{{$guid}}")));
pm.test("JSON stringify round trip", () => pm.expect(JSON.parse(pm.environment.get("objVar")).roles).to.include("admin"));
console.log("NUMVAR_TYPE=", typeof pm.environment.get("numVar"));
pm.test("has/unset", () => { pm.environment.unset("objVar"); pm.expect(pm.environment.has("objVar")).to.be.false; });
pm.test("toObject", () => pm.expect(pm.environment.toObject()).to.have.property("baseUrl"));
pm.test("dynamic vars resolve", () => {
  ["$guid","$randomUUID","$timestamp","$isoTimestamp","$randomInt","$randomEmail","$randomExampleEmail","$randomFirstName","$randomLastName","$randomFullName","$randomPhoneNumber","$randomCity","$randomCountry","$randomPrice","$randomCurrencyCode","$randomDateFuture","$randomDatePast","$randomUserName","$randomPassword","$randomIP","$randomIPV6","$randomMACAddress","$randomBoolean","$randomAlphaNumeric","$randomColor","$randomHexColor","$randomAbbreviation","$randomLoremSentence","$randomProductName","$randomCompanyName","$randomJobTitle","$randomStreetAddress","$randomLatitude","$randomLongitude","$randomBankAccountIban","$randomCreditCardMask","$randomFileName","$randomMimeType","$randomImageUrl","$randomSemver","$randomUserAgent","$randomLocale","$randomWeekday","$randomMonth","$randomUrl","$randomDomainName","$randomNamePrefix","$randomProtocol"].forEach(v => {
    const r = pm.variables.replaceIn("{{" + v + "}}");
    pm.expect(r, v).to.not.eql("{{" + v + "}}");
  });
  const ri = Number(pm.variables.replaceIn("{{$randomInt}}"));
  pm.expect(ri).to.be.within(0, 1000);
  pm.expect(pm.variables.replaceIn("{{$randomPassword}}")).to.have.lengthOf(15);
  pm.expect(pm.variables.replaceIn("{{$randomAlphaNumeric}}")).to.have.lengthOf(1);
  pm.expect(pm.variables.replaceIn("{{$timestamp}}")).to.match(/^\\d{10}$/);
});
`});

req("ch5 data var beats env", "GET", `${B}/anything?who={{who}}`, { test: `
pm.test("data overrides env 'who'", () => pm.expect(pm.response.json().args.who).to.eql(pm.iterationData.get("who")));
pm.test("CSV number-like value arrives as number in Newman", () => pm.expect(pm.iterationData.get("expectedStatus")).to.be.a("number"));
console.log("ITER", pm.info.iteration, "of", pm.info.iterationCount, "who=", pm.iterationData.get("who"));
`});

// ---------- Ch7 pm.request modification ----------
req("ch7 modify request", "POST", `${B}/anything?debug=1&page=1`, {
  body: '{"name":"Asha","age": {{age}} }',
  headers: { "X-Debug": "yes" },
  pre: `
pm.variables.set("age", 30);
pm.request.headers.upsert({ key: "X-Correlation-ID", value: pm.variables.replaceIn("{{$guid}}") });
pm.request.headers.upsert({ key: "Accept-Language", value: "en-IN" });
pm.request.headers.remove("X-Debug");
pm.request.url.query.add({ key: "ts", value: "123" });
pm.request.url.query.upsert({ key: "page", value: "2" });
pm.request.url.query.remove("debug");
let rawParseFailed = false; try { JSON.parse(pm.request.body.raw); } catch (e) { rawParseFailed = true; }
pm.variables.set("_rawParseFailed", rawParseFailed);
const body = JSON.parse(pm.variables.replaceIn(pm.request.body.raw));
body.requestedAt = "now";
pm.request.body.raw = JSON.stringify(body);
pm.variables.set("_pathWithQuery", pm.request.url.getPathWithQuery());
pm.variables.set("_host", pm.request.url.getHost());
`, test: `
const r = pm.response.json();
pm.test("unresolved raw body fails JSON.parse", () => pm.expect(pm.variables.get("_rawParseFailed")).to.be.true);
pm.test("header added", () => pm.expect(r.headers["x-correlation-id"]).to.match(/^[0-9a-f-]{36}$/));
pm.test("header upserted", () => pm.expect(r.headers["accept-language"]).to.eql("en-IN"));
pm.test("header removed", () => pm.expect(r.headers).to.not.have.property("x-debug"));
pm.test("query ops", () => { pm.expect(r.args.ts).to.eql("123"); pm.expect(r.args.page).to.eql("2"); pm.expect(r.args).to.not.have.property("debug"); });
pm.test("body modified", () => pm.expect(r.json).to.eql({ name: "Asha", age: 30, requestedAt: "now" }));
console.log("PATHWITHQUERY=", pm.variables.get("_pathWithQuery"), "HOST=", pm.variables.get("_host"));
pm.test("request method readable", () => pm.expect(pm.request.method).to.eql("POST"));
pm.test("pm.info", () => { pm.expect(pm.info.eventName).to.eql("test"); pm.expect(pm.info.requestName).to.eql("ch7 modify request"); pm.expect(pm.info.requestId).to.be.a("string"); });
console.log("LOCATION=", JSON.stringify(pm.execution.location), "CURRENT=", pm.execution.location.current);
`});

req("ch7 body.update + method change + url set", "GET", `${B}/nothing`, {
  pre: `
pm.request.method = "PUT";
pm.request.url = pm.variables.replaceIn("{{baseUrl}}/anything");
pm.request.body = { mode: "raw", raw: JSON.stringify({ hello: "world" }), options: { raw: { language: "json" } } };
pm.request.headers.upsert({ key: "Content-Type", value: "application/json" });
`, test: `
pm.test("method changed to PUT", () => pm.expect(pm.response.json().method).to.eql("PUT"));
pm.test("url changed", () => pm.response.to.have.status(200));
pm.test("body.update", () => pm.expect(pm.response.json().json).to.eql({ hello: "world" }));
`});

// ---------- Ch7 HMAC signing & JWT decode ----------
req("ch7 HMAC signing", "POST", `${B}/anything`, {
  body: { amount: 100 },
  pre: `
const secret = "secret";
const ts = Math.floor(Date.now() / 1000).toString();
const body = pm.variables.replaceIn(pm.request.body.raw || "");
const payload = ts + "\\n" + pm.request.method + "\\n" + pm.request.url.getPathWithQuery() + "\\n" + body;
const signature = CryptoJS.HmacSHA256(payload, secret).toString(CryptoJS.enc.Hex);
pm.request.headers.upsert({ key: "X-Timestamp", value: ts });
pm.request.headers.upsert({ key: "X-Signature", value: signature });
pm.variables.set("_sig", signature);
`, test: `
pm.test("signature echoed", () => pm.expect(pm.response.json().headers["x-signature"]).to.eql(pm.variables.get("_sig")));
function decodeJwt(token) {
  const part = token.split(".")[1];
  const base64 = part.replace(/-/g, "+").replace(/_/g, "/").padEnd(part.length + (4 - part.length % 4) % 4, "=");
  return JSON.parse(atob(base64));
}
const hdr = btoa(JSON.stringify({alg:"HS256",typ:"JWT"})).replace(/=+$/,"").replace(/\\+/g,"-").replace(/\\//g,"_");
const pl = btoa(JSON.stringify({sub:"user-42",roles:["admin"],exp:4102444800,n:"ü?>"})).replace(/=+$/,"").replace(/\\+/g,"-").replace(/\\//g,"_");
pm.test("decodeJwt", () => { const c = decodeJwt(hdr + "." + pl + ".sig"); pm.expect(c.roles).to.include("admin"); pm.expect(c.exp*1000).to.be.above(Date.now()); });
`});

// ---------- Ch6/7 token caching via collection-level style pre-request (put on folder-less request) ----------
req("Get access token", "POST", `${B}/oauth/token`, { urlencoded: { grant_type: "client_credentials", client_id: "c", client_secret: "{{clientSecret}}" }, test: `
pm.test("token issued", () => pm.response.to.have.status(200));
` });
req("ch6 token cache pre-request + sendRequest", "GET", `${B}/secure`, {
  auth: { type: "bearer", bearer: [{ key: "token", value: "{{accessToken}}", type: "string" }] },
  pre: `
if (pm.info.requestName === "Get access token") return;
const expiresAt = Number(pm.environment.get("accessTokenExpiresAt") || 0);
const token = pm.environment.get("accessToken");
if (token && Date.now() < expiresAt) { console.log("TOKEN_CACHED"); return; }
pm.sendRequest({
  url: pm.variables.replaceIn("{{baseUrl}}/oauth/token"),
  method: "POST",
  header: { "Content-Type": "application/x-www-form-urlencoded" },
  body: { mode: "urlencoded", urlencoded: [
    { key: "grant_type", value: "client_credentials" },
    { key: "client_id", value: "c" },
    { key: "client_secret", value: pm.environment.get("clientSecret") } ] }
}, (err, res) => {
  if (err) { console.error(err); return; }
  const b = res.json();
  pm.environment.set("accessToken", b.access_token);
  pm.environment.set("accessTokenExpiresAt", Date.now() + (b.expires_in - 30) * 1000);
  console.log("TOKEN_FETCHED");
});
`, test: `
pm.test("authorized with fetched token", () => pm.response.to.have.status(200));
`});
req("ch6 token cache second call", "GET", `${B}/secure`, {
  auth: { type: "bearer", bearer: [{ key: "token", value: "{{accessToken}}", type: "string" }] },
  pre: `
const expiresAt = Number(pm.environment.get("accessTokenExpiresAt") || 0);
if (pm.environment.get("accessToken") && Date.now() < expiresAt) { console.log("TOKEN_CACHED_SECOND"); return; }
throw new Error("should have been cached");
`, test: `pm.test("still 200", () => pm.response.to.have.status(200));` });

req("ch7 sendRequest await + string form", "GET", `${B}/users/2`, { test: `
const sendRequestAsync = (req) => new Promise((resolve, reject) => pm.sendRequest(req, (err, res) => err ? reject(err) : resolve(res)));
(async () => { const res = await sendRequestAsync(pm.variables.replaceIn("{{baseUrl}}/users/3")); pm.test("promise-wrapped sendRequest works", () => pm.expect(res.json().name).to.eql("Clementine Bauch")); })().catch(e => pm.test("async failed", () => { throw e; }));
pm.sendRequest(pm.variables.replaceIn("{{baseUrl}}/users/1"), (err, r) => {
  pm.test("string-url sendRequest", () => pm.expect(r.code).to.eql(200));
});
pm.sendRequest("{{baseUrl}}/users/1", (err, r) => {
  console.log("UNRESOLVED_SENDREQUEST err=", err && err.message, "code=", r && r.code);
});
[1,2,3].forEach(id => pm.sendRequest(pm.variables.replaceIn("{{baseUrl}}/users/" + id), (e, r) => pm.test("parallel user " + id, () => pm.expect(r.code).to.eql(200))));
`});

req("ch7 setTimeout waits", "GET", `${B}/users/1`, { test: `
const start = Date.now();
setTimeout(() => { pm.test("timer fired after ~500ms", () => pm.expect(Date.now() - start).to.be.at.least(450)); }, 500);
`});

// ---------- Cookies ----------
req("ch7 cookies", "GET", `${B}/cookies/set`, { test: `
pm.test("pm.cookies.get", () => pm.expect(pm.cookies.get("csrftoken")).to.eql("csrfval"));
pm.test("pm.cookies.has", () => pm.expect(pm.cookies.has("sessionId")).to.be.true);
const sc = pm.response.headers.all().filter(h => h.key.toLowerCase() === "set-cookie").map(h => h.value).find(v => v.startsWith("sessionId="));
pm.test("response cookie flags via Set-Cookie", () => { pm.expect(sc).to.match(/;\\s*HttpOnly/i); pm.expect(sc).to.match(/;\\s*Secure/i); });
pm.test("pm.cookies.jar is function", () => pm.expect(typeof pm.cookies.jar).to.eql("function"));
`});

// ---------- Visualizer ----------
req("ch7 visualizer", "GET", `${B}/users`, { test: `
pm.visualizer.set("<table>{{#each users}}<tr><td>{{id}}</td></tr>{{/each}}</table>", { users: pm.response.json() });
pm.test("visualizer.set did not throw", () => pm.expect(true).to.be.true);
`});

// ---------- Ch9 workflows ----------
req("ch9 list posts", "GET", `${B}/posts?userId=1`, { test: `
pm.collectionVariables.set("productIds", JSON.stringify(pm.response.json().map(p => p.id)));
pm.collectionVariables.set("_loopCount", 0);
`});
req("ch9 loop over ids", "GET", `${B}/posts/{{postId}}/comments`, {
  pre: `
let ids = JSON.parse(pm.collectionVariables.get("productIds") || "[]");
if (ids.length === 0) { pm.execution.skipRequest(); return; }
const current = ids.shift();
pm.collectionVariables.set("postId", current);
pm.collectionVariables.set("productIds", JSON.stringify(ids));
`, test: `
pm.collectionVariables.set("_loopCount", Number(pm.collectionVariables.get("_loopCount")) + 1);
pm.test("post " + pm.collectionVariables.get("postId") + " has 5 comments", () => pm.expect(pm.response.json()).to.have.lengthOf(5));
const remaining = JSON.parse(pm.collectionVariables.get("productIds"));
if (remaining.length > 0) pm.execution.setNextRequest(pm.info.requestId);
else pm.collectionVariables.unset("productIds");
`});
req("ch9 loop check", "GET", `${B}/users/1`, { test: `
pm.test("loop ran 10 times", () => pm.expect(Number(pm.collectionVariables.get("_loopCount"))).to.eql(10));
`});

req("ch9 pagination", "GET", `${B}/orders?page={{page}}&limit=10`, {
  pre: `if (!pm.collectionVariables.get("page")) pm.collectionVariables.set("page", 1);`,
  test: `
const body = pm.response.json();
let all = JSON.parse(pm.collectionVariables.get("_allOrders") || "[]");
all = all.concat(body.data);
pm.collectionVariables.set("_allOrders", JSON.stringify(all));
if (body.hasMore) {
  pm.collectionVariables.set("page", Number(pm.collectionVariables.get("page")) + 1);
  pm.execution.setNextRequest(pm.info.requestId);
} else {
  pm.test("Collected all orders", () => pm.expect(all.length).to.eql(body.total));
  pm.test("sorted desc by price", () => { const p = all.map(o => o.price); pm.expect(p).to.eql([...p].sort((a,b) => b - a)); });
  pm.test("createdAt desc", () => { const t = all.map(d => Date.parse(d.createdAt)); t.slice(1).forEach((v, i) => pm.expect(v).to.be.at.most(t[i])); });
  pm.collectionVariables.unset("page");
  pm.collectionVariables.unset("_allOrders");
}
`});

req("ch9 polling", "GET", `${B}/jobs/1`, { test: `
const MAX = 20;
const attempt = Number(pm.variables.get("_pollAttempt") || 0) + 1;
pm.variables.set("_pollAttempt", attempt);
const status = pm.response.json().status;
if (status === "COMPLETED") {
  pm.test("Report completed after 3 polls", () => pm.expect(attempt).to.eql(3));
  pm.variables.set("_pollAttempt", 0);
} else if (attempt >= MAX) {
  pm.test("timed out", () => { throw new Error("timeout"); });
} else {
  setTimeout(() => {}, 100);
  pm.execution.setNextRequest(pm.info.requestId);
}
`});

req("ch9 retry 503", "GET", `${B}/flaky`, { test: `
const retriable = [429, 502, 503, 504];
const tries = Number(pm.variables.get("_tries") || 0);
if (retriable.includes(pm.response.code) && tries < 3) {
  pm.variables.set("_tries", tries + 1);
  const retryAfter = Number(pm.response.headers.get("Retry-After") || 0);
  const wait = retryAfter ? retryAfter * 1000 : 100 * Math.pow(2, tries);
  setTimeout(() => {}, wait);
  pm.execution.setNextRequest(pm.info.requestId);
} else {
  pm.test("Final status is 2xx after " + tries + " retries", () => { pm.response.to.be.success; pm.expect(tries).to.eql(2); });
  pm.variables.set("_tries", 0);
}
`});

req("ch9 skipRequest", "GET", `${B}/status/500`, { pre: `pm.execution.skipRequest();`, test: `pm.test("SHOULD NOT RUN", () => { throw new Error("post-response ran after skip"); });` });

req("ch7 skipRequest in post-response", "GET", `${B}/users/1`, { test: `
try { pm.execution.skipRequest(); console.log("SKIP_IN_POST no error"); } catch (e) { console.log("SKIP_IN_POST_ERROR=", e.name, "|", e.message); }
`});



req("ch6 Restful-Booker chain auth", "POST", `${B}/auth`, { body: { username: "admin", password: "password123" }, test: `
pm.environment.set("rbToken", pm.response.json().token);
pm.test("token", () => pm.expect(pm.environment.get("rbToken")).to.eql("rbtoken"));
`});
req("rb create", "POST", `${B}/booking`, { headers: { Accept: "application/json" }, body: '{"firstname":"{{$randomFirstName}}","lastname":"{{$randomLastName}}","totalprice":{{$randomInt}},"depositpaid":true}', test: `
const b = pm.response.json();
pm.collectionVariables.set("bookingId", b.bookingid);
pm.collectionVariables.set("firstname", b.booking.firstname);
pm.test("totalprice numeric from unquoted var", () => pm.expect(b.booking.totalprice).to.be.a("number"));
`});
req("rb patch", "PATCH", `${B}/booking/{{bookingId}}`, { headers: { Cookie: "token={{rbToken}}" }, body: { firstname: "Asha" }, test: `pm.test("patched", () => pm.expect(pm.response.json().firstname).to.eql("Asha"));` });
req("rb delete", "DELETE", `${B}/booking/{{bookingId}}`, { headers: { Cookie: "token={{rbToken}}" }, test: `pm.test("201 on delete", () => pm.response.to.have.status(201));` });
req("rb get deleted", "GET", `${B}/booking/{{bookingId}}`, { test: `pm.test("404", () => pm.response.to.have.status(404));` });

// ---------- vault / require / last: stop run ----------
req("vault & pm.require in newman", "GET", `${B}/users/1`, { test: `
console.log("HAS_PM_VAULT=", typeof pm.vault, "HAS_PM_REQUIRE=", typeof pm.require);
pm.test("pm.vault & pm.require unavailable in Newman", () => { pm.expect(pm.vault).to.be.undefined; pm.expect(pm.require).to.be.undefined; });
console.log("AFTER_VAULT_CALL_RAN");
`});
req("ch9 stop run", "GET", `${B}/users/1`, { test: `pm.execution.setNextRequest(null);` });
req("SHOULD NOT RUN after null", "GET", `${B}/users/1`, { test: `pm.test("should not run", () => { throw new Error("ran after setNextRequest(null)"); });` });

const collection = {
  info: { name: "Book Verification", schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json" },
  item: items,
  event: [{ listen: "prerequest", script: { type: "text/javascript", exec: [
    'pm.request.headers.upsert({ key: "X-Correlation-ID", value: pm.variables.replaceIn("{{$guid}}") });'
  ] } }, { listen: "test", script: { type: "text/javascript", exec: [
    'if (!pm.variables.get("_tries") && pm.info.requestName !== "ch9 retry 503") pm.test(`[${pm.info.requestName}] no 5xx`, () => pm.expect(pm.response.code).to.be.below(500));'
  ] } }],
  variable: [{ key: "baseUrl", value: "http://example.invalid" }]
};
fs.writeFileSync("verify.postman_collection.json", JSON.stringify(collection, null, 2));
fs.writeFileSync("verify.postman_environment.json", JSON.stringify({ name: "Verify ENV", values: [
  { key: "baseUrl", value: "http://127.0.0.1:3555", enabled: true },
  { key: "clientSecret", value: "", enabled: true },
  { key: "who", value: "from-env", enabled: true }
] }, null, 2));
fs.writeFileSync("data.csv", "who,expectedStatus\nrow1,200\nrow2,200\n");
console.log("built", items.length, "requests");
