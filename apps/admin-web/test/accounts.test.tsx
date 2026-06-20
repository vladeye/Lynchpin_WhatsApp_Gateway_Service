import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AccountsPage } from "../src/pages/Accounts";

function renderWithClient() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <AccountsPage />
    </QueryClientProvider>,
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("AccountsPage", () => {
  it("shows the empty state when there are no accounts", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ accounts: [] }),
      })) as unknown as typeof fetch,
    );

    renderWithClient();

    expect(
      screen.getByRole("heading", { name: "Accounts" }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.getByText("No accounts yet. Add one to get started."),
      ).toBeInTheDocument(),
    );
  });

  it("renders an account row", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          accounts: [
            {
              id: "a1",
              external_account_id: "x1",
              name: "Sales Support",
              state: "connected",
              phone_number: "573001112233",
              display_name: null,
              last_error: null,
              created_at: "2026-06-20T00:00:00.000Z",
              updated_at: "2026-06-20T00:00:00.000Z",
              last_connected_at: null,
            },
          ],
        }),
      })) as unknown as typeof fetch,
    );

    renderWithClient();
    await waitFor(() =>
      expect(screen.getByText("Sales Support")).toBeInTheDocument(),
    );
    expect(screen.getByText("573001112233")).toBeInTheDocument();
  });
});
