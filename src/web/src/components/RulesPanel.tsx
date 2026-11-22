import { useState } from "react";
import { Bell, Eye, Plus, ShieldBan, Sparkles, Trash2 } from "lucide-react";
import type { BlockPreset, BlockRule, Item, Source, Subscription } from "../types.ts";
import { PageHeading } from "./PageHeading.tsx";

export function RulesPanel({
  subscriptions,
  rules,
  presets,
  totalBlocked,
  sources,
  blockedPreview,
  onAddSub,
  onRemoveSub,
  onJumpToSubscribed,
  onAddRule,
  onImportPresets,
  onToggleRule,
  onDeleteRule,
  onLoadBlockedPreview,
  sourceName,
  allowRegex = true,
}: {
  subscriptions: Subscription[];
  rules: BlockRule[];
  presets: BlockPreset[];
  totalBlocked: number;
  sources: Source[];
  blockedPreview: Item[] | null;
  onAddSub: (kw: string) => Promise<void>;
  onRemoveSub: (id: number) => Promise<void>;
  onJumpToSubscribed: (kw: string) => void;
  onAddRule: (pattern: string, mode: "keyword" | "regex", scope: string) => Promise<void>;
  onImportPresets: () => Promise<void>;
  onToggleRule: (id: number, enabled: boolean) => Promise<void>;
  onDeleteRule: (id: number) => Promise<void>;
  onLoadBlockedPreview: () => void;
  sourceName: (id: string) => string;
  allowRegex?: boolean;
}) {
  const [kw, setKw] = useState("");
  const [pattern, setPattern] = useState("");
  const [mode, setMode] = useState<"keyword" | "regex">("keyword");
  const [scope, setScope] = useState("all");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const addKeyword = async () => {
    if (busy || !kw.trim()) return;
    setBusy(true); setError("");
    try { await onAddSub(kw.trim()); setKw(""); }
    catch (e) { setError(e instanceof Error ? e.message : "thêm thất bại, thử lại"); }
    finally { setBusy(false); }
  };

  return (
    <div>
      <PageHeading eyebrow={allowRegex ? "bàn làm việc quản trị · cài đặt toàn site" : "không gian cá nhân · chỉ áp dụng cho bạn"} title="theo dõi & chặn" description="từ theo dõi đánh dấu nội dung muốn xem, từ chặn lọc nội dung không muốn xem. đặt riêng, không ghi đè nhau." />
    <div className="settings-layout grid items-start gap-5 lg:grid-cols-12">
      {/* 左栏：关键词订阅 */}
      <section className="panel space-y-4 p-5 lg:col-span-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-[14.5px] font-semibold text-ink-950">
            <Bell size={16} className="text-accent" /> {allowRegex ? "từ khoá theo dõi toàn site" : "từ khoá theo dõi của tôi"}
          </div>
          <span className="rounded-md bg-ink-100 px-2 py-0.5 font-mono text-[11px] font-medium text-ink-700">
            {subscriptions.length} mục
          </span>
        </div>

        <p className="text-[12.5px] leading-relaxed text-ink-500">
          khi tiêu đề hoặc tóm tắt trúng từ theo dõi, danh sách tự sáng nhắc, và trong trang push có thể bật「trúng đăng ký ưu tiên push thẳng」.
        </p>

        <div className="flex gap-2">
          <input
            value={kw}
            onChange={(e) => setKw(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void addKeyword(); }}
            placeholder="vd: epic / Claude / tên miền…"
            className="min-w-0 flex-1 rounded-lg border border-ink-200 bg-surface px-3 py-2 text-[13px] text-ink-950 outline-none focus:border-brand"
          />
          <button
            type="button"
            disabled={busy || !kw.trim()}
            onClick={() => void addKeyword()}
            className="inline-flex items-center gap-1 rounded-lg bg-brand px-3.5 py-2 text-[13px] font-medium text-white transition-colors hover:bg-brand-hover"
          >
            <Plus size={14} /> thêm
          </button>
        </div>

        <div className="divide-y divide-ink-100 rounded-lg border border-ink-200 bg-surface">
          {subscriptions.map((s) => (
            <div key={s.id} className="flex items-center justify-between px-3.5 py-2.5 text-[13px]">
              <button
                type="button"
                onClick={() => onJumpToSubscribed(s.keyword)}
                className="font-medium text-ink-900 hover:text-brand"
                title="bấm để tìm trong dòng tài nguyên"
              >
                {s.keyword}
              </button>
              <button
                type="button"
                onClick={() => onRemoveSub(s.id)}
                className="rounded-lg p-1 text-ink-400 hover:bg-alert-subtle hover:text-alert"
                title="xoá từ theo dõi"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          {!subscriptions.length && (
            <div className="p-6 text-center text-[12.5px] text-ink-500">
              chưa có từ theo dõi, thử thêm「epic」hoặc「hội viên」
            </div>
          )}
        </div>
      </section>

      {/* 右栏：屏蔽词防火墙 */}
      <section className="panel space-y-4 p-5 lg:col-span-7">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-[14.5px] font-semibold text-ink-950">
            <ShieldBan size={16} className="text-alert" /> tường lửa từ chặn
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-md bg-alert-subtle px-2.5 py-1 font-mono text-[12px] font-medium text-alert">
              đang chặn {totalBlocked} tin
            </span>
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await onImportPresets();
                } finally {
                  setBusy(false);
                }
              }}
              className="inline-flex items-center gap-1 rounded-lg border border-brand-border bg-brand-subtle px-3 py-1.5 text-[12px] font-medium text-brand hover:bg-ink-200/70 disabled:opacity-50"
              title={"Bao gồm:" + presets.map((p) => p.pattern).join("、")}
            >
              <Sparkles size={12} /> import từ chặn nhiễu phổ biến ({presets.length} mục)
            </button>
          </div>
        </div>

        <p className="text-[12.5px] leading-relaxed text-ink-500">
          mục trúng sẽ ẩn trong dòng tài nguyên, và<strong className="font-medium text-ink-800">không vào tuyển chọn ngày và push Telegram</strong>；
          dữ liệu gốc vẫn trong kho, xoá rule là phục hồi ngay.
        </p>

        <div className="grid gap-2 sm:grid-cols-12">
          <input
            value={pattern}
            onChange={(e) => setPattern(e.target.value)}
            placeholder={mode === "regex" ? "regex, vd ^(xin hỏi|xin gợi ý)" : "từ chặn, vd ô tô / review / né hố"}
            className="rounded-lg border border-ink-200 bg-surface px-3 py-2 text-[13px] text-ink-950 outline-none focus:border-brand sm:col-span-5"
          />
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as "keyword" | "regex")}
            className="rounded-lg border border-ink-200 bg-surface px-2.5 py-2 text-[12.5px] text-ink-800 outline-none focus:border-brand sm:col-span-2"
          >
            <option value="keyword">từ khoá</option>
            {allowRegex && <option value="regex">regex an toàn</option>}
          </select>
          <select
            value={scope}
            onChange={(e) => setScope(e.target.value)}
            className="rounded-lg border border-ink-200 bg-surface px-2.5 py-2 text-[12.5px] text-ink-800 outline-none focus:border-brand sm:col-span-3"
          >
            <option value="all">tất cả nguồn</option>
            {sources.map((s) => (
              <option key={s.id} value={s.id}>
                chỉ {s.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={!pattern.trim() || busy}
            onClick={async () => {
              if (!pattern.trim()) return;
              setBusy(true);
              setError("");
              try {
                await onAddRule(pattern.trim(), allowRegex ? mode : "keyword", scope);
                setPattern("");
              } catch (e) {
                setError(e instanceof Error ? e.message : "thêm thất bại, thử lại");
              } finally {
                setBusy(false);
              }
            }}
            className="rounded-lg bg-brand px-3 py-2 text-[12.5px] font-medium text-white transition-colors hover:bg-brand-hover disabled:opacity-40 sm:col-span-2"
          >
            thêm chặn
          </button>
        </div>
        {!allowRegex && <p className="text-[11.5px] text-ink-500">rule cá nhân chỉ hỗ trợ từ khoá, tối đa 100 mục; chỉ ảnh hưởng nội dung & push của bạn.</p>}
        {error && <p role="alert" className="text-[12px] text-alert">{error}</p>}

        <div className="max-h-[420px] divide-y divide-ink-100 overflow-auto rounded-lg border border-ink-200 bg-surface">
          {rules.map((r) => (
            <div
              key={r.id}
              className={
                "flex items-center justify-between gap-2 px-3.5 py-2.5 text-[12.5px] " +
                (r.enabled ? "" : "bg-surface-hover opacity-55")
              }
            >
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <span className="truncate font-mono font-medium text-ink-950">{r.pattern}</span>
                <span className="shrink-0 rounded bg-ink-100 px-1.5 py-0.5 text-[11px] text-ink-600">
                  {r.mode === "regex" ? "Regex" : "từ"}
                </span>
                <span className="shrink-0 truncate rounded bg-ink-100 px-1.5 py-0.5 text-[11px] text-ink-600">
                  {r.scope === "all" ? "tất cả nguồn" : sourceName(r.scope)}
                </span>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <span className="font-mono text-[11px] tabular-nums text-ink-500">chặn {r.hits}</span>
                <button
                  type="button"
                  onClick={() => onToggleRule(r.id, !r.enabled)}
                  className={
                    "rounded-lg px-2.5 py-1 text-[11px] font-medium transition-colors " +
                    (r.enabled ? "bg-deal-subtle text-deal" : "bg-ink-100 text-ink-500")
                  }
                >
                  {r.enabled ? "đang bật" : "đã ngừng"}
                </button>
                <button
                  type="button"
                  onClick={() => onDeleteRule(r.id)}
                  className="rounded-lg p-1 text-ink-400 hover:bg-alert-subtle hover:text-alert"
                  title="Xoá rule"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
          {!rules.length && (
            <div className="p-6 text-center text-[12.5px] text-ink-500">
              chưa có từ chặn, thêm thủ công hoặc bấm góc phải trên import từ chặn nhiễu phổ biến
            </div>
          )}
        </div>

        <div className="border-t border-ink-100 pt-3">
          <div className="flex items-center justify-between">
            <span className="text-[12px] text-ink-500">sợ chặn nhầm hàng ngon? đối chiếu nội dung bị chặn gần đây bất cứ lúc nào:</span>
            <button
              type="button"
              onClick={onLoadBlockedPreview}
              className="inline-flex items-center gap-1 rounded-lg border border-ink-200 bg-surface px-2.5 py-1 text-[12px] font-medium text-ink-700 hover:bg-ink-100"
            >
              <Eye size={12} /> xem thử mục bị chặn
            </button>
          </div>
          {blockedPreview && (
            <div className="mt-2.5 max-h-[220px] space-y-1.5 overflow-auto rounded-lg border border-ink-200 bg-surface-hover p-3">
              {blockedPreview.filter((it) => it.blockedBy).length === 0 ? (
                <div className="py-2 text-center text-[12px] text-ink-500">trong 80 tin đầu không có mục trúng rule chặn</div>
              ) : (
                blockedPreview
                  .filter((it) => it.blockedBy)
                  .slice(0, 20)
                  .map((it) => (
                    <div key={it.id} className="flex items-center justify-between gap-2 text-[12px]">
                      <a href={it.url} target="_blank" rel="noreferrer noopener" className="truncate text-ink-700 hover:text-accent">
                        {it.title}
                      </a>
                      <span className="shrink-0 rounded bg-alert-subtle px-1.5 py-0.5 font-mono text-[11px] text-alert">
                        {it.blockedBy}
                      </span>
                    </div>
                  ))
              )}
            </div>
          )}
        </div>
      </section>
    </div>
    </div>
  );
}
