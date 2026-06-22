import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LoginPage } from "../src/pages/Login";

describe("LoginPage", () => {
  it("renders the console title and sign-in control", () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <LoginPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(
      screen.getByText("WhatsApp Gateway Console"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Sign In" }),
    ).toBeInTheDocument();
  });
});
