import { useCallback, useEffect, useRef, useState } from "react";
import {
  Bot,
  Check,
  ChevronRight,
  Clock,
  Eye,
  KeyRound,
  ListOrdered,
  Loader2,
  Moon,
  Send,
  Sparkles,
  Wand2,
} from "lucide-react";
import type { Bootstrap } from "../lib/session.ts";
import { PageHeading } from "./PageHeading.tsx";

type MePushConfig = {
  enabled: boolean;
  hasToken: boolean;
  botTokenMask: string;
  chatId: string;
  useGlobalBlocks: boolean;
  dailyEnabled: boolean;
  consecutiveFails: number;
  lastError: string | null;
  lastFlushAt: string | null;
  lastPushedAt: string | null;
  settings: Record<string, unknown>;
};

type MePushPayload = {
  config: MePushConfig;
  settings: Record<string, unknown>;
  stats: { queued: number; sentLast24h: number; sentLastHour: number; failures: number; lastError: string | null };
  quiet: boolean;
  ready: boolean;
  caps: { maxPerHour: number; maxPerInstant: number };
};

type Preview = {
  instant: string[];
  batch: string[];
  scanned: number;
  matched: number;
  rejectedBy: Record<string, number>;
  queued: number;
};

const num = (v: unknown, fallback: number): number => (Number.isFinite(Number(v)) ? Number(v) : fallback);
const str = (v: unknown, fallback: string): string => (typeof v === "string" ? v : fallback);
const bool = (v: unknown, fallback: boolean): boolean => (typeof v === "boolean" ? v : fallback);
const REJECTION_LABEL: Record<string, string> = {
  hidden: "đã đóng", blocked: "từ chặn", duplicate: "nội dung trùng", stale: "quá hạn",
  source: "giới hạn nguồn", lang: "sai ngôn ngữ", kind: "sai dạng nội dung", category: "sai phân loại",
  price: "vượt giá", ai: "AI chặn", obtain: "cách lấy", route: "không khớp route",
  lowScore: "điểm chưa đủ", disabled: "push đã tắt", other: "điều kiện khác",
};

function Toast2({ msg }: { msg: string | null }) {
  if (!msg) return null;
  return (
    <div role="status" aria-live="polite" className="toast-enter fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-lg border border-ink-800 bg-ink-950 px-3.5 py-2 text-[12.5px] font-medium text-white">
      {msg}
    </div>
  );
}

export function UserPushPanel({ boot }: { boot: Bootstrap }) {
  const [payload, setPayload] = useState<MePushPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [tokenInput, setTokenInput] = useState("");
  const [chatInput, setChatInput] = useState("");
  const [webhookInput, setWebhookInput] = useState("");
  const [secretInput, setSecretInput] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const alive = useRef(true);
  const [detected, setDetected] = useState<{ chatId: string; title: string; type: string }[]>([]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [logsLoading, setLogsLoading] = useState(true);
  const [tested, setTested] = useState(false);
  const credentialsRef = useRef<HTMLElement | null>(null);
  const testButtonRef = useRef<HTMLButtonElement | null>(null);
  const enableRef = useRef<HTMLButtonElement | null>(null);
  const [logs, setLogs] = useState<
    { id: number; kind: string; count: number; ok: number; error: string | null; reason: string | null; created_at: string; text: string }[]
  >([]);

  const notify = useCallback((m: string) => {
    if (!alive.current) return;
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(m);
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  }, []);
  const loadLogs = useCallback(async () => {
    setLogsLoading(true);
    try {
      const res = await fetch("/api/me/push/log?limit=30");
      if (!res.ok) throw new Error("tải lịch sử push thất bại");
      const data = await res.json() as { logs: typeof logs };
      if (alive.current) setLogs(data.logs);
    } catch { notify("tải lịch sử push thất bại, bấm làm mới để thử lại"); }
    finally { if (alive.current) setLogsLoading(false); }
  }, [notify]);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/me/push");
      if (!res.ok) throw new Error(((await res.json()) as { error?: string }).error ?? "Tải cấu hình thất bại");
      if (alive.current) {
        const data = (await res.json()) as MePushPayload;
        setPayload(data);
        setLoadError(null);
        setChatInput(data.config.chatId);
        setWebhookInput(str(data.settings.webhookUrl, ""));
        setSecretInput(str(data.settings.webhookSecret, ""));
      }
    } catch (e) {
      if (alive.current) setLoadError(e instanceof Error ? e.message : "không kết nối được server");
    } finally {
      if (alive.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    void load();
    void loadLogs();
    return () => { alive.current = false; if (toastTimer.current) clearTimeout(toastTimer.current); };
  }, [load, loadLogs]);

  const save = useCallback(
    async (patch: Record<string, unknown>) => {
      setSaving(true);
      try {
        const res = await fetch("/api/me/push", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(patch),
        });
        const data = (await res.json().catch(() => ({}))) as Partial<MePushPayload> & { error?: string };
        if (!res.ok) {
          notify(data.error ?? "Lưu thất bại");
          return false;
        }
        if (alive.current) {
          setPayload((prev) => prev ? { ...prev, ...data } : prev);
          setPreview(null);
        }
        return true;
      } catch {
        notify("lỗi mạng, cấu hình chưa lưu, thử lại");
        return false;
      } finally { if (alive.current) setSaving(false); }
    },
    [notify],
  );

  const s = (payload?.settings ?? {}) as Record<string, unknown>;
  const cfg = payload?.config;
  useEffect(() => { setTested(false); }, [cfg?.botTokenMask, cfg?.chatId, cfg?.settings.webhookUrl, cfg?.settings.webhookSecret, cfg?.settings.deliverVia]);

  if (loading) return <div className="panel p-6 text-[13px] text-ink-500">Đang tải cấu hình push cá nhân…</div>;
  if (!payload || !cfg) return <div role="alert" className="panel p-6 text-[13px] text-alert">{loadError ?? "không đọc được cấu hình push cá nhân"} <button type="button" onClick={() => void load()} className="ml-2 underline">Thử lại</button></div>;
  const viaWebhook = cfg.settings.deliverVia === "webhook";
  const ready = viaWebhook ? Boolean(cfg.settings.webhookUrl) : cfg.hasToken && Boolean(cfg.chatId);
  const credentialsDirty = viaWebhook
    ? webhookInput.trim() !== str(cfg.settings.webhookUrl, "") || secretInput !== str(cfg.settings.webhookSecret, "")
    : Boolean(tokenInput.trim()) || chatInput.trim() !== cfg.chatId;

  return (
    <fieldset disabled={busy !== null || saving} className="min-w-0 space-y-4">
      <Toast2 msg={toast} />
      <PageHeading eyebrow="không gian cá nhân" title="push cá nhân" description="đưa tài nguyên bạn quan tâm tới kênh riêng. hoàn tất kết nối trước rồi chỉnh tần suất; mọi cài đặt chỉ ảnh hưởng bạn."
        actions={!boot.isAdmin && <a href="#push" className="inline-flex min-h-9 items-center gap-1 rounded-md border border-ink-200 px-3 text-[12px] font-medium text-ink-700 hover:bg-surface-hover">rule push đầy đủ <ChevronRight size={13} /></a>} />

      <div className="panel overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-100 px-4 py-3">
        <div>
          <div className="flex items-center gap-2 text-[14px] font-semibold text-ink-950">
            <Bot size={15} className="text-accent" /> {viaWebhook ? "Webhook" : "Telegram"} kênh
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-[11.5px] font-medium ${cfg.enabled ? "text-deal" : "text-ink-500"}`}>
            {cfg.enabled ? "đã bật" : "chưa bật"}
          </span>
          <button
            type="button"
            ref={enableRef}
            role="switch"
            aria-checked={cfg.enabled}
            aria-label="bật push cá nhân"
            disabled={!cfg.enabled && (!ready || credentialsDirty)}
            onClick={async () => { if (await save({ enabled: !cfg.enabled })) notify(cfg.enabled ? "push cá nhân đã tắt" : "push cá nhân đã bật"); }}
            className={
              "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors " +
              (cfg.enabled ? "bg-brand" : "bg-ink-300") + " disabled:opacity-40"
            }
            title={cfg.enabled ? "bấm để tắt push cá nhân" : "bấm để bật push cá nhân"}
          >
            <span
              className={
                "inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform " +
                (cfg.enabled ? "translate-x-4.5" : "translate-x-0.5")
              }
            />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-1 p-2">
        {[
          { title: "Cấu hình kênh", note: ready && !credentialsDirty ? "đã lưu thông tin" : "điền và lưu thông tin", done: ready && !credentialsDirty, current: !ready || credentialsDirty, run: () => { credentialsRef.current?.scrollIntoView({ block: "center", behavior: "smooth" }); credentialsRef.current?.querySelector<HTMLInputElement>("input")?.focus({ preventScroll: true }); } },
          { title: "test gửi", note: tested ? "test lần này thành công" : "khuyên gửi tin test trước", done: tested, current: ready && !credentialsDirty && !tested && !cfg.enabled, run: () => testButtonRef.current?.focus() },
          { title: "Bật push", note: cfg.enabled ? "push tự động đã bật" : "bật/tạm dừng bất cứ lúc nào", done: cfg.enabled, current: ready && !credentialsDirty && (tested || cfg.enabled), run: () => enableRef.current?.focus() },
        ].map((step, index) => <button type="button" key={step.title} className="setup-step" data-current={step.current} data-done={step.done} onClick={step.run}>
          <span className="setup-step-number">{step.done ? <Check size={13} /> : index + 1}</span>
          <span><span className="block text-[12px] font-semibold">{step.title}</span><span className="step-note mt-0.5 block text-[11px] text-ink-500">{step.note}</span></span>
        </button>)}
      </div>
      <div role="status" aria-live="polite" className="border-t border-ink-100 bg-surface-hover px-4 py-2.5 text-[12px] leading-relaxed text-ink-500">
        {saving ? "Đang lưu…" : credentialsDirty ? "thông tin có thay đổi chưa lưu, hãy lưu rồi test hoặc bật." : !ready ? "hãy cấu hình kênh hiện tại trước; trước khi xong sẽ không gửi tin." : payload.quiet && cfg.enabled ? "đang trong giờ không làm phiền; gửi thủ công vẫn tính hạn mức giờ." : "cấu hình đã đồng bộ, chạy thử sẽ không gửi thật."}
      </div>
      </div>
      <div className="grid grid-cols-3 gap-3 px-1 py-1">
        {[{ label: "đã push trong 24 giờ qua", value: payload.stats.sentLast24h }, { label: "chờ gộp tin", value: payload.stats.queued }, { label: "hạn mức còn lại giờ này", value: Math.max(0, num(s.maxPerHour, 24) - payload.stats.sentLastHour) }].map((metric) => <div key={metric.label} className="border-l-2 border-ink-200 pl-3">
          <span className="block font-mono text-[20px] font-semibold tabular-nums text-ink-900">{metric.value}</span>
          <span className="text-[11.5px] text-ink-500">{metric.label}</span>
        </div>)}
      </div>

      {cfg.lastError && (
        <div className="panel border-alert-border bg-alert-subtle p-3.5 text-[12px] text-alert">
          lỗi gần nhất: {cfg.lastError}
          {cfg.consecutiveFails > 0 ? `（thất bại liên tiếp ${cfg.consecutiveFails} lần, đủ 3 lần tự ngừng）` : ""}
        </div>
      )}

      <div className="settings-layout grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <section ref={credentialsRef} className="panel space-y-4 p-5">
          <div className="settings-section-title">
            <KeyRound size={14} className="text-accent" /> {viaWebhook ? "thông tin webhook" : "thông tin Bot"}
            <span className="ml-auto rounded-full bg-canvas-subtle px-2 py-0.5 text-[10.5px] font-medium text-ink-600">
              {cfg.settings.deliverVia === "webhook" ? "Webhook" : "Telegram"}
            </span>
          </div>
          <div className="flex gap-1.5">
            {(["telegram", "webhook"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={async () => {
                  if (credentialsDirty && !window.confirm("đổi kênh sẽ bỏ thay đổi thông tin chưa lưu, tiếp tục?")) return;
                  if (await save({ deliverVia: v, enabled: false })) {
                    setTokenInput(""); setChatInput(cfg.chatId);
                    setWebhookInput(str(cfg.settings.webhookUrl, "")); setSecretInput(str(cfg.settings.webhookSecret, ""));
                    setDetected([]);
                    notify("đã đổi kênh, push vẫn tắt; lưu thông tin và test xong mới bật");
                  }
                }}
                className={
                  "flex-1 rounded-lg border px-3 py-1.5 text-[12px] font-medium transition-colors " +
                  (cfg.settings.deliverVia === v
                    ? "border-ink-950 bg-ink-950 text-white"
                    : "border-ink-200 bg-surface text-ink-700 hover:bg-ink-100")
                }
              >
                {v === "telegram" ? "Telegram Bot" : "Webhook"}
              </button>
            ))}
          </div>
          {cfg.settings.deliverVia === "webhook" ? (
            <>
              <label className="block">
                <span className="text-[12px] font-medium text-ink-700">địa chỉ webhook</span>
                <input
                  value={webhookInput}
                  onChange={(e) => setWebhookInput(e.target.value)}
                  placeholder="https://dich-vu-push-cong-khai-cua-ban/webhook"
                  className="mt-1 w-full rounded-lg border border-ink-200 bg-surface px-2.5 py-1.5 font-mono text-[12px] text-ink-950 outline-none focus:border-accent"
                />
                <span className="mt-1 block text-[11px] text-ink-500">
                  nhận POST JSON: source / text / sentAt. site công khai không cho địa chỉ loopback/nội mạng hay redirect, hãy điền địa chỉ cuối.
                </span>
              </label>
              <label className="block">
                <span className="text-[12px] font-medium text-ink-700">khoá xác thực (tuỳ chọn)</span>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={secretInput}
                  onChange={(e) => setSecretInput(e.target.value)}
                  placeholder="sẽ gửi kèm header X-Radar-Secret"
                  className="mt-1 w-full rounded-lg border border-ink-200 bg-surface px-2.5 py-1.5 font-mono text-[12px] text-ink-950 outline-none focus:border-accent"
                />
              </label>
              <button type="button" onClick={async () => {
                if (await save({ webhookUrl: webhookInput.trim(), webhookSecret: secretInput.trim() })) {
                  setWebhookInput(webhookInput.trim()); setSecretInput(secretInput.trim()); notify("đã lưu thông tin webhook");
                }
              }} className="rounded-lg bg-ink-950 px-3 py-1.5 text-[12px] font-medium text-white">Lưu webhook</button>
            </>
          ) : null}
          {!viaWebhook && <>
          <label className="block">
            <span className="text-[12px] font-medium text-ink-700">Bot Token</span>
            <input
              value={tokenInput}
              type="password"
              autoComplete="new-password"
              onChange={(e) => setTokenInput(e.target.value)}
              placeholder={cfg.hasToken ? `đã lưu: ${cfg.botTokenMask}` : "123456789:AA..."}
              className="mt-1 w-full rounded-lg border border-ink-200 bg-surface px-2.5 py-1.5 font-mono text-[12px] text-ink-950 outline-none focus:border-accent"
            />
            <span className="mt-1 block text-[11px] text-ink-500">
              tạo bot ở @BotFather lấy token; server lưu dạng mã hoá, API chỉ trả giá trị che.
            </span>
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={async () => {
                if (!tokenInput.trim()) return notify("dán Bot Token trước");
                setBusy("token");
                try {
                  const ok = await save({ botToken: tokenInput.trim() });
                  if (ok) {
                    setTokenInput("");
                    notify("đã lưu token");
                  }
                } finally {
                  setBusy(null);
                }
              }}
              disabled={busy !== null}
              className="inline-flex items-center gap-1.5 rounded-lg bg-ink-950 px-3 py-1.5 text-[12px] font-medium text-white hover:bg-brand-hover disabled:opacity-60"
            >
              {busy === "token" ? <Loader2 size={12} className="animate-spin" /> : null}
              lưu token
            </button>
            <button
              type="button"
              onClick={async () => {
                setBusy("detect");
                try {
                  const res = await fetch("/api/me/push/detect-chat", {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ botToken: tokenInput.trim() || undefined }),
                  });
                  const data = (await res.json().catch(() => ({}))) as { error?: string; chats?: typeof detected };
                  if (!res.ok) notify(data.error ?? "Dò thất bại");
                  else {
                    setDetected(data.chats ?? []);
                    notify((data.chats?.length ?? 0) ? `dò được ${data.chats!.length} phiên chat` : "chưa dò được phiên chat, gửi /start cho bot trước");
                  }
                } catch {
                  notify("lỗi mạng, dò thất bại, thử lại");
                } finally {
                  setBusy(null);
                }
              }}
              disabled={busy !== null}
              className="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 bg-surface px-3 py-1.5 text-[12px] font-medium text-ink-700 hover:bg-ink-100 disabled:opacity-60"
            >
              {busy === "detect" ? <Loader2 size={12} className="animate-spin" /> : <Wand2 size={12} />}
              dò Chat ID
            </button>
            {cfg.hasToken && (
              <button
                type="button"
                onClick={async () => {
                  if (!window.confirm("xoá token sẽ tắt push Telegram, tiếp tục?")) return;
                  if (await save({ clearToken: true, enabled: false })) notify("đã xoá token, push đã tắt");
                }}
                className="rounded-lg border border-ink-200 px-3 py-1.5 text-[12px] font-medium text-alert hover:bg-ink-100"
              >
                xoá token
              </button>
            )}
          </div>

          {detected.length > 0 && (
            <div className="rounded-lg border border-ink-200 bg-surface-hover p-2.5">
              <div className="mb-1.5 text-[11.5px] font-medium text-ink-700">bấm để điền Chat ID</div>
              <div className="flex flex-wrap gap-1.5">
                {detected.map((c) => (
                  <button
                    key={c.chatId}
                    type="button"
                    onClick={() => setChatInput(c.chatId)}
                    className="rounded-md border border-ink-200 bg-surface px-2 py-1 text-[11.5px] text-ink-700 hover:bg-ink-100"
                  >
                    {c.title} · {c.chatId}
                  </button>
                ))}
              </div>
            </div>
          )}

          <label className="block">
            <span className="text-[12px] font-medium text-ink-700">Chat ID</span>
            <div className="mt-1 flex gap-2">
              <input
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="ID chat riêng hoặc kênh của bạn"
                className="w-full rounded-lg border border-ink-200 bg-surface px-2.5 py-1.5 font-mono text-[12px] text-ink-950 outline-none focus:border-accent"
              />
              <button
                type="button"
                onClick={async () => {
                  const ok = await save({ chatId: chatInput.trim() });
                  if (ok) notify("đã lưu Chat ID");
                }}
                className="shrink-0 rounded-lg border border-ink-200 bg-surface px-3 py-1.5 text-[12px] font-medium text-ink-700 hover:bg-ink-100"
              >
                lưu
              </button>
            </div>
          </label>

          </>}
          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="button"
              ref={testButtonRef}
              onClick={async () => {
                setBusy("test");
                try {
                  const res = await fetch("/api/me/push/test", { method: "POST" });
                  const data = (await res.json().catch(() => ({}))) as { error?: string };
                  notify(res.ok ? "đã gửi tin test" : (data.error ?? "Gửi thất bại"));
                  if (res.ok) setTested(true);
                  void loadLogs();
                } catch {
                  notify("lỗi mạng, không xác nhận được kết quả gửi, xem lịch sử push");
                } finally {
                  setBusy(null);
                }
              }}
              disabled={busy !== null || !ready || credentialsDirty}
              className="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 bg-surface px-3 py-1.5 text-[12px] font-medium text-ink-700 hover:bg-ink-100 disabled:opacity-50"
            >
              {busy === "test" ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />} gửi tin test
            </button>
            <button
              type="button"
              onClick={async () => {
                setBusy("flush");
                try {
                  if (payload.quiet && !window.confirm("đang trong giờ không làm phiền, vẫn muốn gửi hàng đợi gộp tin của mình?")) return;
                  const res = await fetch("/api/me/push/flush", { method: "POST" });
                  const data = (await res.json().catch(() => ({}))) as { sent?: number; queued?: number; error?: string };
                  notify(res.ok ? `đã gửi ${data.sent ?? 0} tin, hàng đợi còn ${data.queued ?? 0}` : (data.error ?? "Gửi thất bại"));
                  await load();
                  void loadLogs();
                } catch {
                  notify("lỗi mạng, không xác nhận được kết quả gửi, xem lịch sử push");
                } finally {
                  setBusy(null);
                }
              }}
              disabled={busy !== null || !cfg.enabled || credentialsDirty || !payload.stats.queued}
              className="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 bg-surface px-3 py-1.5 text-[12px] font-medium text-ink-700 hover:bg-ink-100 disabled:opacity-50"
            >
              {busy === "flush" ? <Loader2 size={12} className="animate-spin" /> : <ListOrdered size={12} />} gửi gộp tin ngay
            </button>
          </div>
        </section>

        <section className="panel space-y-4 p-5">
          <div className="settings-section-title">
            <Clock size={14} className="text-accent" /> nhịp push
          </div>
          <p className="text-[12px] leading-relaxed text-ink-500">đạt điểm gửi riêng thì gửi ngay, phần còn lại đủ điểm gộp tin tổng hợp định kỳ. điểm càng cao push càng ít.</p>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="text-[12px] text-ink-700">ngưỡng gửi riêng tức thì</span>
              <input
                type="number"
                min={0}
                max={100}
                defaultValue={num(s.instantScore, 70)}
                key={`instant-${num(s.instantScore, 70)}`}
                onBlur={(e) => void save({ instantScore: Number(e.target.value) })}
                className="mt-1 w-full rounded-lg border border-ink-200 bg-surface px-2.5 py-1.5 text-[12.5px] text-ink-950 outline-none focus:border-accent"
              />
            </label>
            <label className="block">
              <span className="text-[12px] text-ink-700">ngưỡng gộp tin</span>
              <input
                type="number"
                min={0}
                max={100}
                defaultValue={num(s.batchScore, 60)}
                key={`batch-${num(s.batchScore, 60)}`}
                onBlur={(e) => void save({ batchScore: Number(e.target.value) })}
                className="mt-1 w-full rounded-lg border border-ink-200 bg-surface px-2.5 py-1.5 text-[12.5px] text-ink-950 outline-none focus:border-accent"
              />
            </label>
          </div>
          <div className="grid grid-cols-2 overflow-hidden rounded-md border border-ink-200 text-[11.5px]">
            <div className="bg-brand-subtle px-3 py-2 text-accent">≥ {num(s.instantScore, 70)} điểm · gửi đơn ngay</div>
            <div className="bg-surface-hover px-3 py-2 text-ink-600">{num(s.batchScore, 60) < num(s.instantScore, 70) ? `${num(s.batchScore, 60)}–${num(s.instantScore, 70) - 1} điểm · gộp tin` : "ngưỡng cùng điểm · vượt thì chuyển gộp tin"}</div>
          </div>
          <label className="block">
            <span className="text-[12px] text-ink-700">giới hạn push mỗi giờ</span>
            <input
              type="number"
              min={1}
              max={payload.caps.maxPerHour}
              defaultValue={num(s.maxPerHour, 24)}
              key={`hourly-${num(s.maxPerHour, 24)}`}
              onBlur={(e) => void save({ maxPerHour: Number(e.target.value) })}
              className="mt-1 w-full rounded-lg border border-ink-200 bg-surface px-2.5 py-1.5 text-[12.5px] text-ink-950 outline-none focus:border-accent"
            />
            <span className="mt-1 block text-[11px] text-ink-500">giới hạn site {payload.caps.maxPerHour} tin/giờ</span>
          </label>
          <label className="block">
            <span className="text-[12px] text-ink-700">chu kỳ gộp tin</span>
            <select
              value={num(s.batchIntervalMin, 30)}
              onChange={(e) => void save({ batchIntervalMin: Number(e.target.value) })}
              className="mt-1 w-full rounded-lg border border-ink-200 bg-surface px-2.5 py-1.5 text-[12.5px] text-ink-950 outline-none focus:border-accent"
            >
              <option value={0}>tắt gộp tin</option>
              <option value={5}>mỗi 5 phút</option>
              <option value={10}>mỗi 10 phút</option>
              <option value={30}>mỗi 30 phút</option>
              <option value={60}>mỗi 1 giờ</option>
              <option value={120}>mỗi 2 giờ</option>
            </select>
          </label>
          <details className="border-t border-ink-100 pt-3">
          <summary className="cursor-pointer text-[12.5px] font-medium text-ink-700">không làm phiền & tuỳ chọn khác <span className="ml-1 text-[11px] font-normal text-ink-500">{bool(s.quietEnabled, true) ? str(s.quietHours, "23:30-08:00") : "chưa bật không làm phiền"}</span></summary>
          <div className="mt-3 space-y-1.5 rounded-lg border border-ink-200 bg-surface-hover p-3">
            <label className="flex items-center justify-between gap-2 text-[12px] text-ink-700">
              <span className="inline-flex items-center gap-1.5">
                <Moon size={12} className="text-ink-500" /> không làm phiền ban đêm
              </span>
              <input
                type="checkbox"
                checked={bool(s.quietEnabled, true)}
                onChange={(e) => void save({ quietEnabled: e.target.checked })}
                className="h-3.5 w-3.5 accent-[#111318]"
              />
            </label>
            <label className="flex items-center justify-between gap-2 text-[12px] text-ink-700">
              <span>khung giờ</span>
              <input
                defaultValue={str(s.quietHours, "23:30-08:00")}
                onBlur={(e) => void save({ quietHours: e.target.value })}
                className="w-[130px] rounded border border-ink-200 bg-surface px-2 py-1 font-mono text-[11.5px] text-ink-900 outline-none focus:border-accent"
              />
            </label>
            <label className="flex items-center justify-between gap-2 text-[12px] text-ink-700">
              <span>Múi giờ</span>
              <select
                value={str(s.timezone, "Asia/Shanghai")}
                onChange={(e) => void save({ timezone: e.target.value })}
                className="rounded border border-ink-200 bg-surface px-2 py-1 text-[11.5px] text-ink-900 outline-none focus:border-accent"
              >
                <option value="Asia/Shanghai">giờ Bắc Kinh</option>
                <option value="Asia/Tokyo">giờ Tokyo</option>
                <option value="UTC">UTC</option>
                <option value="America/New_York">giờ miền Đông Mỹ</option>
                <option value="Europe/London">giờ London</option>
              </select>
            </label>
          </div>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 pt-1 text-[12px] text-ink-700">
            <label className="inline-flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={cfg.useGlobalBlocks}
                onChange={(e) => void save({ useGlobalBlocks: e.target.checked })}
                className="h-3.5 w-3.5 accent-[#111318]"
              />
              kế thừa từ chặn nhiễu toàn site
            </label>
            <label className="inline-flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={cfg.dailyEnabled}
                onChange={(e) => void save({ dailyEnabled: e.target.checked })}
                className="h-3.5 w-3.5 accent-[#111318]"
              />
              mỗi ngày gửi một bản tin cá nhân
            </label>
          </div>
          </details>
        </section>
      </div>

      <section className="panel space-y-3 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2 text-[13.5px] font-semibold text-ink-950">
              <Sparkles size={14} className="text-accent" /> xem trước hiệu quả thực tế (không gửi thật)
            </div>
            <p className="mt-0.5 text-[12px] text-ink-500">dùng 180 tin gần nhất chạy thử theo rule của bạn, xem phân bố trúng và lý do bị chặn.</p>
          </div>
          <button
            type="button"
            onClick={async () => {
              setBusy("preview");
              try {
                const res = await fetch("/api/me/push/preview");
                if (res.ok) setPreview((await res.json()) as Preview);
                else notify(((await res.json()) as { error?: string }).error ?? "Chạy thử thất bại");
              } catch {
                notify("lỗi mạng, chạy thử thất bại, thử lại");
              } finally {
                setBusy(null);
              }
            }}
            disabled={busy !== null || credentialsDirty}
            className="inline-flex items-center gap-1.5 rounded-lg bg-ink-950 px-3.5 py-2 text-[12.5px] font-medium text-white hover:bg-brand-hover disabled:opacity-50"
          >
            {busy === "preview" ? <Loader2 size={13} className="animate-spin" /> : <Eye size={13} />} chạy thử
          </button>
        </div>

        {preview && (
          <div className="space-y-2.5">
            <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-ink-200 bg-surface-hover px-3 py-2 text-[11.5px]">
              <span className="font-medium text-ink-700">
                quét {preview.scanned} tin · qua {preview.matched} tin · trong hàng đợi {preview.queued} tin
              </span>
              {Object.entries(preview.rejectedBy).map(([k, v]) => (
                <span key={k} className="rounded bg-ink-100 px-2 py-0.5 text-ink-600">
                  {REJECTION_LABEL[k] ?? k} <span className="font-mono font-medium">{v}</span>
                </span>
              ))}
            </div>
            <div className="grid gap-3 lg:grid-cols-2">
              <div className="rounded-lg border border-ink-200 bg-surface-hover p-3">
                <div className="mb-1.5 text-[12px] font-medium text-deal">⚡ sẽ push ngay</div>
                <pre className="max-h-[200px] overflow-auto font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-ink-700">
                  {preview.instant.length ? preview.instant.join("\n") : "（không có mục push ngay theo điều kiện hiện tại）"}
                </pre>
              </div>
              <div className="rounded-lg border border-ink-200 bg-surface-hover p-3">
                <div className="mb-1.5 text-[12px] font-medium text-brand">📦 sẽ vào gộp tin</div>
                <pre className="max-h-[200px] overflow-auto font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-ink-700">
                  {preview.batch.length ? preview.batch.join("\n") : "（không có mục gộp tin theo điều kiện hiện tại）"}
                </pre>
              </div>
            </div>
          </div>
        )}
      </section>

      <section className="panel overflow-hidden">
        <div className="flex items-center justify-between border-b border-ink-100 px-5 py-3">
          <span className="text-[13.5px] font-semibold text-ink-950">lịch sử push của tôi</span>
          <div className="flex items-center gap-3 text-[11.5px] text-ink-500">
            <span>đã gửi trong 24h qua {payload.stats.sentLast24h}</span>
            <span>hàng đợi {payload.stats.queued}</span>
            <button
              type="button"
              onClick={() => void loadLogs()}
              className="font-medium text-accent hover:underline"
            >
              làm mới
            </button>
          </div>
        </div>
        <div className="max-h-[360px] divide-y divide-ink-100 overflow-auto">
          {logs.length === 0 && <div className="px-5 py-8 text-center text-[12.5px] text-ink-500">{logsLoading ? "Đang tải bản ghi…" : "chưa có lịch sử push"}</div>}
          {logs.map((l) => (
            <div key={l.id} className="px-5 py-2.5">
              <div className="flex flex-wrap items-center gap-2 text-[11.5px]">
                <span className="rounded-md bg-ink-100 px-2 py-0.5 font-medium text-ink-700">
                  {l.kind === "instant" ? "tức thì" : l.kind === "batch" ? "gộp tin" : l.kind}
                </span>
                <span className="font-mono text-ink-500">{l.created_at.replace("T", " ").slice(5, 19)}</span>
                <span className="text-ink-600">{l.count} tin</span>
                {l.ok === 0 && <span className="rounded bg-alert-subtle px-1.5 py-0.5 text-alert">thất bại</span>}
                {l.reason && <span className="truncate text-ink-500">· {l.reason}</span>}
              </div>
              <pre className="mt-1 max-h-[64px] overflow-hidden font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-ink-600">
                {(l.text ?? "").slice(0, 200)}
              </pre>
              {l.error && <div className="mt-1 font-mono text-[11px] text-alert">{l.error}</div>}
            </div>
          ))}
        </div>
      </section>

      {boot.siteMode === "public" && !boot.isAdmin && (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-ink-200 pt-4 text-[12px]">
          <span className="text-ink-500">Muốn chỉnh thêm?</span>
          <a href="#push" className="inline-flex items-center gap-1 font-medium text-accent hover:underline">phân loại, giá & rule route <ChevronRight size={12} /></a>
          <a href="#rules" className="inline-flex items-center gap-1 font-medium text-accent hover:underline">từ theo dõi & từ chặn <ChevronRight size={12} /></a>
        </div>
      )}
    </fieldset>
  );
}
