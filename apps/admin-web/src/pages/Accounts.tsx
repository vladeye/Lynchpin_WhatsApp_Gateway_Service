import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { QRCodeSVG } from "qrcode.react";
import type { Account } from "@lynchpin-whatsapp-gateway/shared-types";
import { api } from "../lib/api";
import { StateBadge } from "../components/Layout";

function AddAccountForm({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [externalId, setExternalId] = useState("");
  const create = useMutation({
    mutationFn: () =>
      api.createAccount({ name, external_account_id: externalId }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["accounts"] });
      onDone();
    },
  });

  return (
    <form
      className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-100 bg-white p-4"
      onSubmit={(e) => {
        e.preventDefault();
        create.mutate();
      }}
    >
      <label className="text-sm">
        <span className="block text-slate-600">Name</span>
        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Sales Support"
          className="mt-1 rounded-lg border border-slate-300 px-3 py-2"
        />
      </label>
      <label className="text-sm">
        <span className="block text-slate-600">External account id</span>
        <input
          required
          value={externalId}
          onChange={(e) => setExternalId(e.target.value)}
          placeholder="odoo-whatsapp-15"
          className="mt-1 rounded-lg border border-slate-300 px-3 py-2"
        />
      </label>
      <button
        type="submit"
        disabled={create.isPending}
        className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
      >
        {create.isPending ? "Adding…" : "Add account"}
      </button>
      {create.isError && (
        <span className="text-sm text-red-600">{String(create.error)}</span>
      )}
    </form>
  );
}

function ConnectDialog({
  account,
  onClose,
}: {
  account: Account;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"qr" | "code">("qr");
  const [phone, setPhone] = useState("");

  // Trigger QR connect once when opening the QR tab.
  const qrConnect = useMutation({ mutationFn: () => api.connectQr(account.id) });
  const codeConnect = useMutation({
    mutationFn: () => api.connectCode(account.id, phone),
  });

  // Poll status so the QR string and connection result stay live.
  const status = useQuery({
    queryKey: ["account-status", account.id],
    queryFn: () => api.accountStatus(account.id),
    refetchInterval: 2000,
  });

  const connected = status.data?.state === "connected";

  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-slate-900">
            Connect “{account.name}”
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            ✕
          </button>
        </div>

        <div className="mt-4 flex gap-2 text-sm">
          <button
            onClick={() => setTab("qr")}
            className={`rounded-lg px-3 py-1.5 ${tab === "qr" ? "bg-brand-50 text-brand-700" : "text-slate-500"}`}
          >
            QR code
          </button>
          <button
            onClick={() => setTab("code")}
            className={`rounded-lg px-3 py-1.5 ${tab === "code" ? "bg-brand-50 text-brand-700" : "text-slate-500"}`}
          >
            Pairing code
          </button>
        </div>

        <div className="mt-5 min-h-[16rem] flex flex-col items-center justify-center text-center">
          {connected ? (
            <div className="text-brand-700">
              <div className="text-4xl">✓</div>
              <p className="mt-2 font-medium">Connected</p>
              <p className="text-sm text-slate-500">
                {status.data?.phone_number}
              </p>
            </div>
          ) : tab === "qr" ? (
            <>
              {qrConnect.isIdle && (
                <button
                  onClick={() => qrConnect.mutate()}
                  className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
                >
                  Start QR connect
                </button>
              )}
              {!qrConnect.isIdle && status.data?.last_qr ? (
                <>
                  <QRCodeSVG value={status.data.last_qr} size={220} />
                  <p className="mt-3 text-sm text-slate-500">
                    Scan with WhatsApp → Linked devices
                  </p>
                </>
              ) : (
                !qrConnect.isIdle && (
                  <p className="text-sm text-slate-500">
                    Waiting for QR code…
                  </p>
                )
              )}
            </>
          ) : (
            <div className="w-full">
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="573001112233"
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              />
              <button
                onClick={() => codeConnect.mutate()}
                disabled={codeConnect.isPending || phone.length < 5}
                className="mt-3 w-full rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
              >
                Request pairing code
              </button>
              {codeConnect.data?.pairing_code && (
                <p className="mt-4 text-2xl font-bold tracking-widest text-slate-900">
                  {codeConnect.data.pairing_code}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function AccountsPage() {
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [connecting, setConnecting] = useState<Account | null>(null);

  const accounts = useQuery({
    queryKey: ["accounts"],
    queryFn: api.listAccounts,
    refetchInterval: 5000,
  });

  const action = useMutation({
    mutationFn: ({ fn }: { fn: () => Promise<unknown> }) => fn(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["accounts"] }),
  });

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Accounts</h1>
          <p className="text-slate-500">WhatsApp sessions managed by the gateway.</p>
        </div>
        <button
          onClick={() => setShowAdd((v) => !v)}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
        >
          {showAdd ? "Close" : "Add account"}
        </button>
      </div>

      {showAdd && (
        <div className="mt-4">
          <AddAccountForm onDone={() => setShowAdd(false)} />
        </div>
      )}

      <div className="mt-6 overflow-hidden rounded-xl border border-slate-100 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Phone</th>
              <th className="px-4 py-3 font-medium">State</th>
              <th className="px-4 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {accounts.data?.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-slate-400">
                  No accounts yet. Add one to get started.
                </td>
              </tr>
            )}
            {accounts.data?.map((a) => (
              <tr key={a.id}>
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-900">{a.name}</div>
                  <div className="text-xs text-slate-400">
                    {a.external_account_id}
                  </div>
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {a.phone_number ?? "—"}
                </td>
                <td className="px-4 py-3">
                  <StateBadge state={a.state} />
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-2 text-xs">
                    <button
                      onClick={() => setConnecting(a)}
                      className="rounded-md border border-slate-200 px-2 py-1 hover:bg-slate-50"
                    >
                      Connect
                    </button>
                    <button
                      onClick={() =>
                        action.mutate({ fn: () => api.disconnect(a.id, false) })
                      }
                      className="rounded-md border border-slate-200 px-2 py-1 hover:bg-slate-50"
                    >
                      Disconnect
                    </button>
                    <button
                      onClick={() =>
                        action.mutate({ fn: () => api.disconnect(a.id, true) })
                      }
                      className="rounded-md border border-slate-200 px-2 py-1 hover:bg-slate-50"
                    >
                      Logout
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(`Delete ${a.name}?`))
                          action.mutate({ fn: () => api.deleteAccount(a.id) });
                      }}
                      className="rounded-md border border-red-200 px-2 py-1 text-red-600 hover:bg-red-50"
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {connecting && (
        <ConnectDialog
          account={connecting}
          onClose={() => {
            setConnecting(null);
            void qc.invalidateQueries({ queryKey: ["accounts"] });
          }}
        />
      )}
    </div>
  );
}
