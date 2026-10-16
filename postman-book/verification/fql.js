const jsonata = require("jsonata");
const data = {
  customer: { name: "Asha Rao", email: "asha@example.com" },
  payments: [
    { id: 1, description: "recurring subscription", amount: 499, status: "PAID", date: "2026-10-01" },
    { id: 2, description: "one-time", amount: 1200, status: "FAILED", date: "2026-10-03" },
    { id: 3, description: "recurring subscription", amount: 499, status: "PAID", date: "2026-10-08" }
  ]
};
const exprs = {
  "filter": 'payments[description="recurring subscription"]',
  "filter then field": 'payments[description="recurring subscription"].amount',
  "single match not array": 'payments[id=2].status',
  "sum": '$sum(payments[status="PAID"].amount)',
  "count": '$count(payments)',
  "map": '$map(payments, function($p){ $p.amount * 2 })',
  "filter fn": '$filter(payments, function($v, $i, $a){ $v.amount > 500 }).id',
  "reduce": '$reduce(payments.amount, function($acc, $v){ $acc + $v }, 0)',
  "reshape": 'payments.{ "paymentId": id, "rupees": amount, "ok": status = "PAID" }',
  "object build": '{ "name": customer.name, "total": $sum(payments.amount), "failed": $count(payments[status="FAILED"]) }',
  "vars": '( $paid := payments[status="PAID"]; $total := $sum($paid.amount); { "paidCount": $count($paid), "withGst": $total * 1.18 } )',
  "conditional": '$count(payments[status="FAILED"]) > 0 ? "ALERT" : "OK"',
  "string fns": '$uppercase($substring(customer.name, 0, 4)) & "-" & $join(["a","b"], "-")',
  "lookup": '$lookup(customer, "email")',
  "comment": '/* total paid */ $sum(payments.amount)',
  "sort": '$sort(payments, function($l, $r){ $l.amount > $r.amount }).id',
  "now format": '$fromMillis($toMillis($now()), "[Y0001]-[M01]-[D01]")',
  "distinct": '$distinct(payments.description)',
};
(async () => { for (const [k, e] of Object.entries(exprs)) { try { console.log(k.padEnd(22), "=>", JSON.stringify(await jsonata(e).evaluate(data))); } catch (err) { console.log(k.padEnd(22), "ERR", err.message); } } })();
