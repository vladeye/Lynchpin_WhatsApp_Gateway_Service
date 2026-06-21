import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import type { ChatSummary } from "@lynchpin-whatsapp-gateway/shared-types";
import { api } from "../lib/api";

function phoneOf(chatId: string): string {
  return chatId.split("@")[0] ?? chatId;
}

/** Friendly label: self-chat, known contact name, phone, or generic. */
function chatTitle(c: ChatSummary): string {
  if (c.is_self) return "You (self-chat)";
  if (c.contact_name) return c.contact_name;
  if (c.chat_id.endsWith("@s.whatsapp.net")) return phoneOf(c.chat_id);
  if (c.chat_id.endsWith("@g.us")) return "Group chat";
  return "WhatsApp user";
}

function chatSubtitle(c: ChatSummary): string {
  if (c.chat_id.endsWith("@s.whatsapp.net")) return `+${phoneOf(c.chat_id)}`;
  if (c.is_self) return "Messages to yourself";
  return "";
}

function time(ts: string | null): string {
  if (!ts) return "";
  return new Date(ts).toLocaleString();
}

export function ConversationsPage() {
  const { id = "" } = useParams();
  const qc = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);
  const [text, setText] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  const account = useQuery({
    queryKey: ["account-status", id],
    queryFn: () => api.accountStatus(id),
    refetchInterval: 10_000,
  });
  const chats = useQuery({
    queryKey: ["chats", id],
    queryFn: () => api.listChats(id),
    refetchInterval: 5000,
  });
  const messages = useQuery({
    queryKey: ["messages", id, selected],
    queryFn: () => api.listMessages(id, selected!),
    enabled: Boolean(selected),
    refetchInterval: 3000,
  });

  // Default to the first chat once loaded.
  useEffect(() => {
    if (!selected && chats.data && chats.data.length > 0) {
      setSelected(chats.data[0]!.chat_id);
    }
  }, [chats.data, selected]);

  // Keep the thread scrolled to the newest message.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.data]);

  const send = useMutation({
    mutationFn: () => api.sendChatMessage(id, selected!, text.trim()),
    onSuccess: () => {
      setText("");
      void qc.invalidateQueries({ queryKey: ["messages", id, selected] });
      void qc.invalidateQueries({ queryKey: ["chats", id] });
    },
  });

  const connected = account.data?.state === "connected";
  const selectedChat = chats.data?.find((c) => c.chat_id === selected) ?? null;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            {account.data?.name ?? "Conversations"}
          </h1>
          <p className="text-slate-500">
            {connected ? "Connected" : (account.data?.state ?? "—")}
            {account.data?.phone_number ? ` · ${account.data.phone_number}` : ""}
          </p>
        </div>
        <Link to="/accounts" className="text-sm text-brand-600 hover:underline">
          ← Back to accounts
        </Link>
      </div>

      <div className="grid grid-cols-[300px_1fr] overflow-hidden rounded-xl border border-slate-200 bg-white h-[70vh]">
        {/* Chat list */}
        <div className="border-r border-slate-100 overflow-y-auto">
          {chats.data?.length === 0 && (
            <div className="p-4 text-sm text-slate-400">
              No conversations yet. Incoming and sent messages appear here.
            </div>
          )}
          {chats.data?.map((c) => (
            <button
              key={c.chat_id}
              onClick={() => setSelected(c.chat_id)}
              className={`block w-full border-b border-slate-50 px-4 py-3 text-left hover:bg-slate-50 ${
                selected === c.chat_id ? "bg-brand-50" : ""
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-medium text-slate-800">
                  {chatTitle(c)}
                </span>
              </div>
              <div className="truncate text-xs text-slate-500">
                {c.last_direction === "outbound" ? "You: " : ""}
                {c.last_body ?? "—"}
              </div>
            </button>
          ))}
        </div>

        {/* Thread + composer */}
        <div className="flex flex-col">
          {selected ? (
            <>
              <div className="border-b border-slate-100 px-5 py-3">
                <div className="font-medium text-slate-800">
                  {selectedChat ? chatTitle(selectedChat) : phoneOf(selected)}
                </div>
                {selectedChat && chatSubtitle(selectedChat) && (
                  <div className="text-xs text-slate-400">
                    {chatSubtitle(selectedChat)}
                  </div>
                )}
              </div>
              <div className="flex-1 space-y-2 overflow-y-auto bg-slate-50 px-5 py-4">
                {messages.data?.map((m) => (
                  <div
                    key={m.id}
                    className={`flex ${m.direction === "outbound" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[70%] rounded-2xl px-3 py-2 text-sm shadow-sm ${
                        m.direction === "outbound"
                          ? "bg-brand-500 text-white"
                          : "bg-white text-slate-800"
                      }`}
                    >
                      <div>{m.body ?? `(${m.type})`}</div>
                      <div
                        className={`mt-1 text-[10px] ${m.direction === "outbound" ? "text-brand-50" : "text-slate-400"}`}
                      >
                        {time(m.created_at)}
                      </div>
                    </div>
                  </div>
                ))}
                <div ref={endRef} />
              </div>
              <form
                className="flex items-center gap-2 border-t border-slate-100 p-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (text.trim()) send.mutate();
                }}
              >
                <input
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder={
                    connected ? "Type a message" : "Account not connected"
                  }
                  disabled={!connected || send.isPending}
                  className="flex-1 rounded-lg border border-slate-300 px-3 py-2 disabled:bg-slate-50"
                />
                <button
                  type="submit"
                  disabled={!connected || send.isPending || !text.trim()}
                  className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
                >
                  Send
                </button>
              </form>
              {send.isError && (
                <div className="px-3 pb-2 text-xs text-red-600">
                  {String(send.error)}
                </div>
              )}
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center text-slate-400">
              Select a conversation
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
