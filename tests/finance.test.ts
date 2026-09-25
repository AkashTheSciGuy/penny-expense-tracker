import assert from "node:assert/strict";
import { test } from "node:test";
import { cents, totals, csv, demoRows } from "../lib/finance.ts";
test("currency is parsed into exact integer minor units", () => {
  assert.equal(cents("0.29"), 29);
  assert.equal(cents("123.4"), 12340);
  assert.equal(cents("999999999.99"), 99999999999);
});
test("invalid, negative, zero, infinite, and excessive precision are rejected", () => {
  for (const value of [
    "0",
    "0.00",
    "-1",
    "1.001",
    "NaN",
    "Infinity",
    "1e3",
    "",
    " 2",
    "1000000000",
  ])
    assert.throws(() => cents(value));
});
test("monthly totals preserve income and expense signs", () => {
  const rows = demoRows("2026-09");
  const result = totals(rows);
  assert.equal(result.income, 545000);
  assert.equal(result.expense, 170080);
  assert.equal(result.balance, 374920);
  assert.deepEqual(totals([]), { income: 0, expense: 0, balance: 0 });
});
test("CSV quotes commas and newlines and neutralizes formula injection", () => {
  const item = {
    ...demoRows("2026-09")[0],
    title: "=SUM(A1)",
    notes: 'a,"b"\nc',
  };
  const output = csv([item]);
  assert.ok(output.includes('"\'=SUM(A1)"'));
  assert.ok(output.includes('"a,""b""\nc"'));
});
test("100 years of daily transactions aggregate without losing precision", () => {
  const rows = Array.from({ length: 36500 }, (_, i) => ({
    ...demoRows("2026-09")[0],
    id: String(i),
    amount: 29,
  }));
  assert.equal(totals(rows).income, 1058500);
});

test("month selection excludes other months, sorts latest first, and does not mutate data", async () => {
  const { transactionsForMonth } = await import("../lib/finance.ts");
  const rows = [...demoRows("2026-09"), ...demoRows("2026-08")];
  const original = [...rows];
  const september = transactionsForMonth(rows, "2026-09");
  assert.equal(september.length, 12);
  assert.equal(september[0].title, "Bookshop");
  assert.ok(september.every((row) => row.date.startsWith("2026-09-")));
  assert.deepEqual(rows, original);
  assert.equal(transactionsForMonth(rows, "2026-07").length, 0);
});

test("new entries default to selected month while current month uses today", async () => {
  const { entryDate } = await import("../lib/finance.ts");
  assert.equal(entryDate("2026-08", "2026-09-20"), "2026-08-01");
  assert.equal(entryDate("2026-09", "2026-09-20"), "2026-09-20");
  assert.equal(entryDate("2027-01", "2026-12-31"), "2027-01-01");
});
