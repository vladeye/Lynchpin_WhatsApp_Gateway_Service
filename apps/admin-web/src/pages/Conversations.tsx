import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import type {
  ChatMessage,
  ChatSummary,
} from "@lynchpin-whatsapp-gateway/shared-types";
import { api } from "../lib/api";

function phoneOf(chatId: string): string {
  return chatId.split("@")[0] ?? chatId;
}

/** Emoji label for a media message type (used when there's no caption). */
const TYPE_LABEL: Record<string, string> = {
  image: "📷 Photo",
  video: "🎞️ Video",
  audio: "🎧 Audio",
  document: "📄 Document",
  sticker: "🌟 Sticker",
};

/** Preview line for the chat list: caption, or a media label, or a dash. */
function previewText(c: ChatSummary): string {
  if (c.last_body) return c.last_body;
  if (c.last_type && TYPE_LABEL[c.last_type]) return TYPE_LABEL[c.last_type]!;
  return "—";
}

/** Renders a message's content: media (image/video/audio/file) or text. */
function MessageBody({
  accountId,
  m,
  outbound,
}: {
  accountId: string;
  m: ChatMessage;
  outbound: boolean;
}) {
  const caption = m.body ? <div className="mt-1">{m.body}</div> : null;

  // media_mime is only set when the binary downloaded and can be served.
  if (m.media_mime) {
    const url = api.mediaUrl(accountId, m.id);
    if (m.media_mime.startsWith("image/")) {
      return (
        <a href={url} target="_blank" rel="noreferrer" className="block">
          <img
            src={url}
            alt={m.media_filename ?? "image"}
            loading="lazy"
            className="max-h-64 max-w-full rounded-lg"
          />
          {caption}
        </a>
      );
    }
    if (m.media_mime.startsWith("video/")) {
      return (
        <div>
          <video src={url} controls className="max-h-64 max-w-full rounded-lg" />
          {caption}
        </div>
      );
    }
    if (m.media_mime.startsWith("audio/")) {
      return <audio src={url} controls className="w-56 max-w-full" />;
    }
    return (
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className={`flex items-center gap-2 underline ${
          outbound ? "text-white" : "text-brand-700"
        }`}
      >
        <span>📎</span>
        <span className="truncate">{m.media_filename ?? "Download file"}</span>
      </a>
    );
  }

  // Media type but the file isn't available (download failed / not synced yet).
  if (TYPE_LABEL[m.type]) {
    return (
      <div>
        <span className="opacity-80">{TYPE_LABEL[m.type]}</span>
        {caption}
      </div>
    );
  }

  return <div>{m.body ?? `(${m.type})`}</div>;
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
  const fileRef = useRef<HTMLInputElement>(null);

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

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["messages", id, selected] });
    void qc.invalidateQueries({ queryKey: ["chats", id] });
  };

  const send = useMutation({
    mutationFn: () => api.sendChatMessage(id, selected!, text.trim()),
    onSuccess: () => {
      setText("");
      refresh();
    },
  });

  const upload = useMutation({
    mutationFn: (file: File) =>
      api.sendChatMedia(id, selected!, file, text.trim() || undefined),
    onSuccess: () => {
      setText("");
      refresh();
    },
  });

  function onPickFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file
    if (file) upload.mutate(file);
  }

  const connected = account.data?.state === "connected";
  const busy = send.isPending || upload.isPending;
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
                {previewText(c)}
              </div>
            </button>
          ))}
        </div>

        {/* Thread + composer */}
        <div className="flex min-h-0 flex-col">
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
              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto bg-slate-50 px-5 py-4">
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
                      <MessageBody
                        accountId={id}
                        m={m}
                        outbound={m.direction === "outbound"}
                      />
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
                  ref={fileRef}
                  type="file"
                  className="hidden"
                  onChange={onPickFile}
                />
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={!connected || busy}
                  title="Attach a file"
                  aria-label="Attach a file"
                  className="rounded-lg border border-slate-300 px-3 py-2 text-lg text-slate-500 hover:bg-slate-50 disabled:opacity-60"
                >
                  📎
                </button>
                <input
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder={
                    connected
                      ? upload.isPending
                        ? "Uploading…"
                        : "Type a message or caption"
                      : "Account not connected"
                  }
                  disabled={!connected || busy}
                  className="flex-1 rounded-lg border border-slate-300 px-3 py-2 disabled:bg-slate-50"
                />
                <button
                  type="submit"
                  disabled={!connected || busy || !text.trim()}
                  className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
                >
                  Send
                </button>
              </form>
              {(send.isError || upload.isError) && (
                <div className="px-3 pb-2 text-xs text-red-600">
                  {String(send.error ?? upload.error)}
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
