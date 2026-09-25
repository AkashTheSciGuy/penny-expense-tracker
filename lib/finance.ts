export type Transaction = {
  id: string;
  user_id?: string;
  title: string;
  amount: number;
  type: "expense" | "income";
  category: string;
  account: string;
  date: string;
  notes: string;
};
export type Budget = {
  id: string;
  user_id?: string;
  category: string;
  amount: number;
  month: string;
};
export const categories = [
  "Food & drinks",
  "Shopping",
  "Transport",
  "Housing",
  "Health",
  "Entertainment",
  "Travel",
  "Education",
  "Salary",
  "Other",
];
export const colors = [
  "#7558d9",
  "#eeaa47",
  "#53a9a1",
  "#5984dd",
  "#e17a99",
  "#9275de",
  "#56a5c1",
  "#c39a57",
  "#62a581",
  "#9296a5",
];
export function money(value: number, currency = "USD") {
  return new Intl.NumberFormat("en", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value / 100);
}
export function cents(value: string) {
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(value))
    throw new Error("Enter a positive amount with up to two decimal places.");
  const [whole, fraction = ""] = value.split(".");
  const amount = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (amount <= 0) throw new Error("Amount must be greater than zero.");
  return amount;
}
export function totals(rows: Transaction[]) {
  const income = rows
    .filter((x) => x.type === "income")
    .reduce((s, x) => s + x.amount, 0);
  const expense = rows
    .filter((x) => x.type === "expense")
    .reduce((s, x) => s + x.amount, 0);
  return { income, expense, balance: income - expense };
}
export function csv(rows: Transaction[]) {
  const escape = (v: unknown) =>
    '"' +
    String(v)
      .replace(/^[=+@\-\t\r]/, "'$&")
      .replaceAll('"', '""') +
    '"';
  return [
    "Date,Description,Type,Category,Account,Amount,Notes",
    ...rows.map((x) =>
      [
        x.date,
        x.title,
        x.type,
        x.category,
        x.account,
        (x.amount / 100).toFixed(2),
        x.notes,
      ]
        .map(escape)
        .join(","),
    ),
  ].join("\r\n");
}
export function demoRows(month: string): Transaction[] {
  return [
    ["Monthly salary", 480000, "income", "Salary", "Bank", 1],
    ["Apartment rent", 125000, "expense", "Housing", "Bank", 2],
    ["Weekly groceries", 8640, "expense", "Food & drinks", "Debit card", 4],
    ["Coffee with friends", 1850, "expense", "Food & drinks", "Debit card", 6],
    ["Running shoes", 9500, "expense", "Shopping", "Credit card", 8],
    ["Metro pass", 4500, "expense", "Transport", "Debit card", 9],
    ["Freelance project", 65000, "income", "Other", "Bank", 10],
    ["Movie night", 3200, "expense", "Entertainment", "Credit card", 12],
    ["Fresh market", 6240, "expense", "Food & drinks", "Cash", 14],
    ["Internet bill", 5900, "expense", "Housing", "Bank", 15],
    ["Lunch at Olive", 2850, "expense", "Food & drinks", "Debit card", 17],
    ["Bookshop", 2400, "expense", "Shopping", "Debit card", 18],
  ].map((x, i) => ({
    id: String(i),
    title: String(x[0]),
    amount: Number(x[1]),
    type: x[2] as Transaction["type"],
    category: String(x[3]),
    account: String(x[4]),
    date: `${month}-${String(x[5]).padStart(2, "0")}`,
    notes: "",
  }));
}

export function transactionsForMonth(rows: Transaction[], month: string) {
  return rows
    .filter((row) => row.date.startsWith(month + "-"))
    .sort((a, b) => b.date.localeCompare(a.date));
}

export function entryDate(month: string, today: string) {
  return today.startsWith(month + "-") ? today : `${month}-01`;
}
