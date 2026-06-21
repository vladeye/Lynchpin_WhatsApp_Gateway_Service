import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import "./index.css";
import { Layout } from "./components/Layout";
import { LoginPage } from "./pages/Login";
import { DashboardPage } from "./pages/Dashboard";
import { AccountsPage } from "./pages/Accounts";
import { ConversationsPage } from "./pages/Conversations";
import { LogsPage } from "./pages/Logs";
import { ParametersPage } from "./pages/Parameters";
import { SecurityPage } from "./pages/Security";

const queryClient = new QueryClient();

const router = createBrowserRouter([
  { path: "/", element: <LoginPage /> },
  {
    element: <Layout />,
    children: [
      { path: "/dashboard", element: <DashboardPage /> },
      { path: "/accounts", element: <AccountsPage /> },
      { path: "/accounts/:id/conversations", element: <ConversationsPage /> },
      { path: "/logs", element: <LogsPage /> },
      { path: "/parameters", element: <ParametersPage /> },
      { path: "/security", element: <SecurityPage /> },
    ],
  },
]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
