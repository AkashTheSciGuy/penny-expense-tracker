import type { Budget, Transaction } from "@/lib/finance";

export type PennyUser = { id: string; email: string };

type ApiError = { error?: string };

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...init,
    credentials: "same-origin",
    headers: {
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...init?.headers,
    },
  });

  const body = (await response.json().catch(() => ({}))) as T & ApiError;
  if (!response.ok) {
    throw new Error(body.error || "Request failed. Please try again.");
  }
  return body;
}

export const api = {
  session: () => request<{ user: PennyUser | null }>("/auth/session"),
  register: (email: string, password: string) =>
    request<{ user: PennyUser }>("/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  login: (email: string, password: string) =>
    request<{ user: PennyUser }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  logout: () => request<{ ok: true }>("/auth/logout", { method: "POST" }),

  transactions: () => request<{ data: Transaction[] }>("/transactions"),
  createTransaction: (value: Omit<Transaction, "id">) =>
    request<{ data: Transaction }>("/transactions", {
      method: "POST",
      body: JSON.stringify(value),
    }),
  updateTransaction: (id: string, value: Omit<Transaction, "id">) =>
    request<{ data: Transaction }>(`/transactions/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify(value),
    }),
  deleteTransaction: (id: string) =>
    request<{ ok: true }>(`/transactions/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),

  budgets: (month: string) =>
    request<{ data: Budget[] }>(`/budgets?month=${encodeURIComponent(month)}`),
  saveBudget: (value: Omit<Budget, "id">) =>
    request<{ data: Budget }>("/budgets", {
      method: "POST",
      body: JSON.stringify(value),
    }),
  deleteBudget: (id: string) =>
    request<{ ok: true }>(`/budgets/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),
};
