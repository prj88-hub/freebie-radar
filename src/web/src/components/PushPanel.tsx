import { useEffect, useState } from "react";
import {
  BellRing,
  Bot,
  Check,
  Clock,
  Eye,
  Filter,
  Languages,
  ListOrdered,
  Loader2,
  Moon,
  RotateCcw,
  Send,
  Settings2,
  SlidersHorizontal,
  Sparkles,
  Zap,
} from "lucide-react";
import {
  CATEGORY_DESC,
  CATEGORY_GROUPS,
  CATEGORY_LABEL,
  CHANNELS,
  KIND_LABEL,
  KIND_ORDER,
  OBTAIN_LABEL,
  OBTAIN_ORDER,
  categoryLabel,
} from "../lib/sources.ts";
import type {
  AiFallbackMode,
  PushLogItem,
  PushPayload,
  PushPreview,
  PushSettings,
  PushRoute,
  PushSourceMode,
  Source,
} from "../types.ts";

function Toggle({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      onClick={() => onChange(!value)}
      className="flex w-full items-center justify-between gap-3 rounded-lg border border-ink-200 bg-surface-hover px-3.5 py-2.5 text-left transition-colors hover:border-ink-300"
    >
      <div className="min-w-0">
        <div className="text-[13px] font-medium text-ink-900">{label}</div>
        {hint && <div className="mt-0.5 text-[11px] leading-snug text-ink-500">{hint}</div>}
      </div>
      <span
        className={
          "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors " +
          (value ? "bg-brand" : "bg-ink-300")
        }
      >
        <span
          className={
            "inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform " +
            (value ? "translate-x-4.5" : "translate-x-0.5")
          }
        />
      </span>
    </button>
  );
}

/** 支持拖动滑杆（松手提交）与直接输入精确数值（失焦/回车提交）。 */
function NumberField({
  label,
  hint,
  value,
  min,
  max,
  step = 1,
  suffix = "",
  onCommit,
}: {
  label: string;
  hint?: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  onCommit: (v: number) => void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => {
    setDraft(value);
  }, [value]);

  const clampAndCommit = (raw: number) => {
    const clamped = Math.min(Math.max(Number.isFinite(raw) ? Math.round(raw) : value, min), max);
    setDraft(clamped);
    if (clamped !== value) onCommit(clamped);
  };

  return (
    <div className="rounded-lg border border-ink-200 bg-surface-hover px-3.5 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-medium text-ink-900">{label}</span>
        <div className="flex items-center gap-1">
          <input
            type="number"
            min={min}
            max={max}
            step={step}
            value={draft}
            onChange={(e) => setDraft(Number(e.target.value))}
            onBlur={(e) => clampAndCommit(Number(e.target.value))}
            onKeyDown={(e) => {
              if (e.key === "Enter") clampAndCommit(Number((e.target as HTMLInputElement).value));
            }}
            className="w-16 rounded-md border border-ink-200 bg-surface px-1.5 py-0.5 text-right font-mono text-[12.5px] font-semibold tabular-nums text-brand outline-none focus:border-brand"
          />
          {suffix && <span className="text-[12px] text-ink-500">{suffix}</span>}
        </div>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={Math.min(Math.max(draft, min), max)}
        onChange={(e) => setDraft(Number(e.target.value))}
        onPointerUp={() => clampAndCommit(draft)}
        onKeyUp={() => clampAndCommit(draft)}
        className="mt-2 w-full accent-brand"
      />
      {hint && <div className="mt-1 text-[11px] leading-snug text-ink-500">{hint}</div>}
    </div>
  );
}

const PRICE_CAPS: { label: string; value: number | null }[] = [
  { label: "mọi mức giá", value: null },
  { label: "chỉ push hàng free", value: 0 },
  { label: "≤ 5 tệ", value: 5 },
  { label: "≤ 10 tệ", value: 10 },
  { label: "≤ 30 tệ", value: 30 },
  { label: "≤ 100 tệ", value: 100 },
];

const AGE_OPTIONS: { label: string; hours: number }[] = [
  { label: "trong 24 giờ", hours: 24 },
  { label: "trong 72 giờ (mặc định)", hours: 72 },
  { label: "trong 7 ngày", hours: 168 },
  { label: "trong 30 ngày", hours: 720 },
  { label: "mọi thời gian", hours: 0 },
];

const REJECT_LABELS: { key: string; label: string }[] = [
  { key: "hidden", label: "cá nhân đã đóng" },
  { key: "blocked", label: "từ chặn" },
  { key: "duplicate", label: "khử trùng liên nguồn" },
  { key: "stale", label: "quá hạn bài mới" },
  { key: "source", label: "giới hạn nguồn dữ liệu" },
  { key: "lang", label: "sai ngôn ngữ" },
  { key: "kind", label: "dạng nội dung" },
  { key: "category", label: "sai phân loại" },
  { key: "price", label: "vượt giá tối đa" },
  { key: "ai", label: "AI duyệt chặn" },
  { key: "obtain", label: "cách lấy" },
  { key: "route", label: "không khớp route" },
  { key: "lowScore", label: "dưới điểm push" },
];

type PushSubTab = "filters" | "timing" | "logs";

export function PushPanel({
  payload,
  preview,
  logs,
  sources,
  onSave,
  onPreview,
  onFlush,
  onTest,
}: {
  payload: PushPayload | null;
  preview: PushPreview | null;
  logs: PushLogItem[];
  sources: Source[];
  onSave: (patch: Partial<PushSettings>) => Promise<void>;
  onPreview: () => Promise<void>;
  onFlush: () => Promise<void>;
  onTest: () => Promise<void>;
}) {
  const [subTab, setSubTab] = useState<PushSubTab>("filters");
  const [busy, setBusy] = useState<string | null>(null);
  const [operationError, setOperationError] = useState<string | null>(null);
  const s = payload?.settings;
  const stats = payload?.stats;

  const [quietFrom, setQuietFrom] = useState("23:30");
  const [quietTo, setQuietTo] = useState("08:00");
  const [customHeaderDraft, setCustomHeaderDraft] = useState("");
  const [customPriceDraft, setCustomPriceDraft] = useState("");
  const [editingRouteId, setEditingRouteId] = useState<string | null>(null);
  const [routeDraft, setRouteDraft] = useState<PushRoute | null>(null);
  const [routeKeywordsInput, setRouteKeywordsInput] = useState("");
  const [routePriceInput, setRoutePriceInput] = useState("");

  useEffect(() => {
    if (!s) return;
    if (s.quietHours) {
      const [a, b] = s.quietHours.split("-");
      if (a) setQuietFrom(a);
      if (b) setQuietTo(b);
    }
    setCustomHeaderDraft(s.customHeader ?? "");
    setCustomPriceDraft(s.maxPrice !== null && ![0, 5, 10, 30, 100].includes(s.maxPrice) ? String(s.maxPrice) : "");
  }, [s?.quietHours, s?.customHeader, s?.maxPrice]);

  const save = async (patch: Partial<PushSettings>) => {
    setBusy("save");
    setOperationError(null);
    try {
      await onSave(patch);
    } catch (error) {
      setOperationError(error instanceof Error ? error.message : "lưu thất bại, thử lại");
    } finally {
      setBusy(null);
    }
  };

  if (!s) return <div className="panel p-6 text-[13px] text-ink-500">Đang tải rule push…</div>;

  const toggleCategory = (cat: string) => {
    const exists = s.categories.includes(cat);
    const next = exists ? s.categories.filter((c) => c !== cat) : [...s.categories, cat];
    void save({ categories: next });
  };

  const toggleSourceId = (id: string) => {
    const exists = s.sourceIds.includes(id);
    const next = exists ? s.sourceIds.filter((x) => x !== id) : [...s.sourceIds, id];
    void save({ sourceIds: next });
  };

  const enabledSources = sources.filter((src) => src.enabled);

  return (
    <fieldset disabled={busy !== null} className="min-w-0 space-y-4">
      {operationError && <p role="alert" className="panel border-alert-border p-3 text-[12px] text-alert">{operationError}</p>}
      {/* 总开关 + 实时状态条 */}
      <section className="panel flex flex-wrap items-center justify-between gap-4 p-4">
        <div className="flex flex-wrap items-center gap-6">
          <div className="flex items-center gap-3">
            <div className={`grid h-10 w-10 place-items-center rounded-lg ${s.enabled ? "bg-deal-subtle text-deal" : "bg-ink-100 text-ink-500"}`}>
              <BellRing size={18} />
            </div>
            <div>
              <div className="text-[14px] font-semibold text-ink-950">{s.deliverVia === "webhook" ? "Webhook" : "Telegram"} push tự động</div>
              <div className="text-[12px] text-ink-500">
                {s.enabled
                  ? payload?.quiet
                    ? `đang bật · trong giờ không làm phiền (${s.quietAction === "drop" ? "bỏ qua hẳn" : "chuyển sang hàng đợi gộp tin"})`
                    : `đang giám sát thời gian thực · ${s.pushTiming === "wait_ai" ? "qua AI rồi push" : "cướp mã tốc độ push trước duyệt sau"}`
                  : "đã tạm dừng push, chỉ thu về kho nội bộ"}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-5 border-l border-ink-200 pl-6 text-[12px]">
            <div>
              <span className="block font-mono text-[15px] font-semibold tabular-nums text-ink-950">
                {stats?.pushedLastHour ?? 0}/{s.maxPerHour}
              </span>
              <span className="text-ink-500">hạn mức giờ này</span>
            </div>
            <div>
              <span className="block font-mono text-[15px] font-semibold tabular-nums text-ink-950">
                {stats?.pushedLast24h ?? 0}
              </span>
              <span className="text-ink-500">đã push trong 24h</span>
            </div>
            <div>
              <span className="block font-mono text-[15px] font-semibold tabular-nums text-brand">
                {stats?.queued ?? 0}
              </span>
              <span className="text-ink-500">hàng đợi gộp tin</span>
            </div>
            {(stats?.failures ?? 0) > 0 && (
              <div>
                <span className="block font-mono text-[15px] font-semibold tabular-nums text-alert">
                  {stats?.failures ?? 0}
                </span>
                <span className="text-ink-500">Push thất bại</span>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {payload?.defaults && (
            <button
              type="button"
              onClick={() => { if (window.confirm("khôi phục mặc định sẽ reset toàn bộ rule push và tắt push, tiếp tục?")) void save({ ...payload.defaults, enabled: false }); }}
              className="inline-flex items-center gap-1 rounded-lg border border-ink-200 bg-surface px-3 py-2 text-[12px] font-medium text-ink-600 hover:bg-ink-100"
              title="khôi phục toàn bộ rule push về mặc định"
            >
              <RotateCcw size={13} /> khôi phục mặc định
            </button>
          )}
          <button
            type="button"
            onClick={() => save({ enabled: !s.enabled })}
            className={
              "inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-[13px] font-medium transition-colors " +
              (s.enabled
                ? "border-deal-border bg-deal-subtle text-deal hover:bg-emerald-100"
                : "border-ink-200 bg-ink-100 text-ink-600 hover:bg-ink-200")
            }
          >
            <Settings2 size={14} /> {s.enabled ? "push đang bật (bấm để tạm dừng)" : "push đang tắt (bấm để bật)"}
          </button>
        </div>
      </section>

      {!payload?.ready && (
        <div className="rounded-lg border border-code-border bg-code-subtle p-3.5 text-[12.5px] text-amber-900">
          kênh hiện tại chưa sẵn sàng. user cá nhân hãy lưu thông tin kênh trong「của tôi」trước; site tự host hãy kiểm tra cấu hình push phía server. rule lưu trước được nhưng sẽ chưa gửi tin.
        </div>
      )}

      {/* 子页签导航 */}
      <div className="panel flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-1.5">
          {[
            { key: "filters" as PushSubTab, label: "thời điểm push & lọc", icon: Filter },
            { key: "timing" as PushSubTab, label: "ngưỡng, định dạng & không làm phiền", icon: Clock },
            { key: "logs" as PushSubTab, label: `xem trước chạy thử & bản ghi (${logs.length})`, icon: Sparkles },
          ].map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setSubTab(t.key)}
              className={
                "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-medium transition-colors " +
                (subTab === t.key ? "bg-brand text-white" : "text-ink-600 hover:bg-ink-100")
              }
            >
              <t.icon size={13} />
              {t.label}
            </button>
          ))}
        </div>
        <span className="text-[11.5px] text-ink-500">
          {busy === "save" ? "Đang lưu…" : "thay đổi áp dụng nóng ngay (không cần restart)"}
        </span>
      </div>

      {subTab === "filters" && (
        <div className="space-y-4">
          {/* 1. AI 协同与推送时机（统一归属到推送规则中） */}
          <section className="panel space-y-4 p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-[14px] font-semibold text-ink-950">
                <Bot size={15} className="text-brand" /> thời điểm push & chiến lược phối hợp AI
              </div>
              <span className="text-[11.5px] text-ink-500">
                kết nối model, lọc sơ bằng rule & prompt cấu hình trong trang「engine AI」
              </span>
            </div>

            {/* 当前这套设置下，一条新条目会怎么走：把「阈值 / 上限 / 时间窗 / 兜底」四件事讲清楚 */}
            <div className="rounded-lg border border-ink-200 bg-surface-hover p-3.5">
              <div className="mb-2 text-[12px] font-medium text-ink-900">theo cài đặt hiện tại, một mục mới sẽ đi như sau</div>
              <ol className="space-y-1.5 text-[11.5px] leading-relaxed text-ink-600">
                <li>
                  <span className="font-mono text-ink-400">1</span> sau khi thu vào kho qua lọc sơ bằng rule trước (bài cầu cứu/thông báo update/từ nhiễu tuỳ chọn vứt thẳng, không gửi AI).
                </li>
                <li>
                  <span className="font-mono text-ink-400">2</span>{" "}
                  {s.pushTiming === "wait_ai"
                    ? `mỗi lượt tối đa ${s.syncPrePushLimit} tin chờ kết luận AI tại chỗ, phần còn lại vào hàng đợi nền${s.pushAfterBackfill ? ", duyệt qua thì push bù" : ", duyệt xong không push bù"}.`
                    : "theo rule quyết push ngay, mục cần duyệt vào hàng đợi nền, kết luận AI bổ sung sau."}
                </li>
                <li>
                  <span className="font-mono text-ink-400">3</span>{" "}
                  <span className="font-medium text-ink-900">ngưỡng chất lượng</span>: điểm ≥ {s.instantScore} đi tức thì; ≥ {s.batchScore} đi gộp tin.
                  {s.instantOnCodes ? "có mã đổi quà," : ""}
                  {s.instantOnUrgent ? "tiêu đề có giới hạn số lượng/thời gian," : ""}
                  {s.prioritizeSubscribed ? "trúng từ theo dõi" : "không điều kiện push thẳng thêm"}có thể tức thì ngay.
                </li>
                <li>
                  <span className="font-mono text-ink-400">4</span>{" "}
                  <span className="font-medium text-ink-900">giới hạn số lượng</span>: mỗi giờ tối đa {s.maxPerHour} tin (dùng chung tức thì+gộp tin),
                  mỗi lượt tức thì tối đa {s.maxPerInstant} tin; phần vượt tự chuyển sang hàng đợi gộp tin, không mất.
                </li>
                <li>
                  <span className="font-mono text-ink-400">5</span>{" "}
                  <span className="font-medium text-ink-900">khung thời gian</span>：
                  {s.batchIntervalMin === 0 ? "gộp tin đã tắt, hàng đợi chỉ gửi khi bấm「gửi gộp tin ngay」thủ công." : `gộp tin gửi mỗi ${s.batchIntervalMin} phút một lần, mỗi đợt tối đa ${s.maxPerBatch} tin.`}
                  {s.quietEnabled ? ` ${s.quietHours} không làm phiền, ${s.quietAction === "drop" ? "trong giờ đó không push cũng không gom" : "trong giờ đó chỉ gom không gửi"}.` : " chưa bật không làm phiền."}
                </li>
                <li>
                  <span className="font-mono text-ink-400">6</span>{" "}
                  <span className="font-medium text-ink-900">dự phòng</span>：
                  {s.aiFallbackMode === "strict"
                    ? "chỉ push khi AI chắc chắn đánh giá freebie thật, AI chưa kết luận thì không push."
                    : s.aiFallbackMode === "rule_fallback"
                      ? "AI từ chối rõ thì chặn; AI chưa kết luận thì chỉ cho qua mục có mã đổi hoặc tín hiệu điểm cao."
                      : "bỏ qua hoàn toàn kết luận AI, chỉ lọc theo từ chặn/điểm/giá/cách lấy."}
                </li>
              </ol>
            </div>

            <div className="grid gap-2.5 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => save({ pushTiming: "wait_ai" })}
                className={
                  "rounded-lg border px-3.5 py-2.5 text-left transition-colors " +
                  (s.pushTiming === "wait_ai"
                    ? "border-brand bg-brand-subtle text-brand"
                    : "border-ink-200 bg-surface-hover text-ink-700 hover:bg-ink-100")
                }
              >
                <div className="text-[13px] font-semibold">qua AI trước khi push (khuyên dùng)</div>
                <div className="mt-0.5 text-[11.5px] font-normal text-ink-500">
                  mục mới chờ đồng bộ AI xác thực rồi mới gửi Telegram, chậm thêm 1~3 giây, chặn chuẩn bài tin/thông báo update
                </div>
              </button>
              <button
                type="button"
                onClick={() => save({ pushTiming: "instant_first" })}
                className={
                  "rounded-lg border px-3.5 py-2.5 text-left transition-colors " +
                  (s.pushTiming === "instant_first"
                    ? "border-brand bg-brand-subtle text-brand"
                    : "border-ink-200 bg-surface-hover text-ink-700 hover:bg-ink-100")
                }
              >
                <div className="text-[13px] font-semibold">cướp mã tốc độ: push trước duyệt sau</div>
                <div className="mt-0.5 text-[11.5px] font-normal text-ink-500">
                  điểm cao/mã đổi gửi ngay 0 độ trễ, AI sau đó bổ sung kết luận & phân loại trong nền
                </div>
              </button>
            </div>

            {s.pushTiming === "wait_ai" && (
              <NumberField
                label="giới hạn số tin chờ duyệt đồng bộ trước push"
                hint="mỗi lượt thu đồng bộ chờ tối đa bao nhiêu tin qua AI rồi quyết push ngay; phần vượt chuyển sang hàng đợi nền, duyệt xong tuỳ công tắc dưới quyết có push bù không"
                value={s.syncPrePushLimit}
                min={5}
                max={60}
                step={1}
                suffix=" tin/lượt"
                onCommit={(v) => void save({ syncPrePushLimit: v })}
              />
            )}

            <div>
              <div className="mb-1.5 text-[12px] font-medium text-ink-700">chế độ dự phòng & lọc AI (khi một mục chưa có kết luận AI hoặc bị AI từ chối)</div>
              <div className="grid gap-2 sm:grid-cols-3">
                {[
                  {
                    key: "strict" as AiFallbackMode,
                    title: "chế độ chặt (thà thiếu còn hơn sai)",
                    desc: "khi bật AI phải được đánh giá rõ freebie thật mới push; timeout/chưa duyệt tới thì không push (AI chưa bật thì theo rule cho qua)",
                  },
                  {
                    key: "rule_fallback" as AiFallbackMode,
                    title: "dự phòng cân bằng (khuyên dùng)",
                    desc: "AI từ chối rõ thì chặn; chưa có kết quả thì chỉ cho qua mục có mã đổi hoặc tín hiệu freebie điểm cao",
                  },
                  {
                    key: "ignore_ai" as AiFallbackMode,
                    title: "chỉ dùng rule (bỏ qua AI)",
                    desc: "không chặn push theo kết luận AI, chỉ lọc theo từ chặn, điểm, giá & cách lấy",
                  },
                ].map((opt) => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => save({ aiFallbackMode: opt.key })}
                    className={
                      "rounded-lg border px-3 py-2 text-left transition-colors " +
                      (s.aiFallbackMode === opt.key
                        ? "border-brand bg-brand-subtle text-brand"
                        : "border-ink-200 bg-surface-hover text-ink-700 hover:bg-ink-100")
                    }
                  >
                    <div className="text-[12.5px] font-semibold">{opt.title}</div>
                    <div className="mt-0.5 text-[11px] leading-snug text-ink-500">{opt.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-2.5 sm:grid-cols-3">
              <Toggle
                label="tự push bù sau khi duyệt bổ sung qua"
                hint="vượt giới hạn đồng bộ hoặc chế độ tốc độ duyệt bổ sung xác nhận freebie thật thì tự bổ sung vào đường push (không push lại mục đã gửi)"
                value={s.pushAfterBackfill}
                onChange={(v) => save({ pushAfterBackfill: v })}
              />
              <Toggle
                label="trúng đăng ký ưu tiên push thẳng"
                hint="trúng từ khoá「đăng ký của tôi」gửi riêng ngay"
                value={s.prioritizeSubscribed}
                onChange={(v) => save({ prioritizeSubscribed: v })}
              />
              <Toggle
                label="đồng bộ áp dụng vào tuyển chọn ngày"
                hint="bản tin sáng cũng theo điều kiện giá, phân loại, nguồn & AI"
                value={s.applyToDigest}
                onChange={(v) => save({ applyToDigest: v })}
              />
            </div>
          </section>

          {/* 2. 多维推送筛选条件 */}
          <section className="panel space-y-4 p-5">
            <div className="flex items-center gap-2 text-[14px] font-semibold text-ink-950">
              <SlidersHorizontal size={15} className="text-brand" /> điều kiện lọc nội dung push
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              {/* 最高价格上限 */}
              <div className="rounded-lg border border-ink-200 bg-surface-hover p-3.5">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[13px] font-medium text-ink-900">giá push tối đa</span>
                  <span className="font-mono text-[12px] text-brand">
                    {s.maxPrice === null ? "không giới hạn" : s.maxPrice === 0 ? "hoàn toàn free" : `≤ ${s.maxPrice} tệ`}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  {PRICE_CAPS.map((p) => {
                    const active = s.maxPrice === p.value;
                    return (
                      <button
                        key={String(p.value)}
                        type="button"
                        onClick={() => save({ maxPrice: p.value })}
                        className={
                          "rounded-lg border px-2 py-1.5 text-[11.5px] font-medium transition-colors " +
                          (active
                            ? "border-brand bg-brand text-white"
                            : "border-ink-200 bg-surface text-ink-700 hover:bg-ink-100")
                        }
                      >
                        {p.label}
                      </button>
                    );
                  })}
                </div>
                <div className="mt-2 flex items-center gap-1.5">
                  <input
                    type="number"
                    min={0}
                    max={10000}
                    step={1}
                    value={customPriceDraft}
                    onChange={(e) => setCustomPriceDraft(e.target.value)}
                    placeholder="số tiền tuỳ chọn (tệ)"
                    className="min-w-0 flex-1 rounded-lg border border-ink-200 bg-surface px-2 py-1 font-mono text-[11.5px] text-ink-900 outline-none focus:border-brand"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const n = Number(customPriceDraft);
                      if (customPriceDraft.trim() !== "" && Number.isFinite(n) && n >= 0) {
                        void save({ maxPrice: n });
                      }
                    }}
                    className="rounded-lg border border-ink-200 bg-surface px-2.5 py-1 text-[11.5px] font-medium text-ink-700 hover:bg-ink-100"
                  >
                    áp dụng
                  </button>
                </div>
              </div>

              {/* 语言过滤 */}
              <div className="rounded-lg border border-ink-200 bg-surface-hover p-3.5">
                <div className="mb-2 flex items-center gap-1.5 text-[13px] font-medium text-ink-900">
                  <Languages size={14} className="text-ink-500" /> lọc ngôn ngữ
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  {[
                    { key: "all" as const, label: "push cả Trung lẫn Anh" },
                    { key: "zh" as const, label: "chỉ nguồn Trung" },
                    { key: "en" as const, label: "chỉ nguồn Anh" },
                  ].map((o) => (
                    <button
                      key={o.key}
                      type="button"
                      onClick={() => save({ langMode: o.key })}
                      className={
                        "rounded-lg border px-2 py-1.5 text-[12px] font-medium transition-colors " +
                        (s.langMode === o.key
                          ? "border-brand bg-brand text-white"
                          : "border-ink-200 bg-surface text-ink-700 hover:bg-ink-100")
                      }
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-[11px] leading-snug text-ink-500">
                  tự nhận diện theo tỉ lệ chữ Trung trong tiêu đề; mục tiếng Anh có thể kèm tag EN và quy đổi giá tệ.
                </p>
              </div>

              {/* 新帖时效上限 */}
              <div className="rounded-lg border border-ink-200 bg-surface-hover p-3.5">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[13px] font-medium text-ink-900">cổng thời hạn bài mới</span>
                  <span className="font-mono text-[12px] text-brand">
                    {s.maxAgeHours <= 0 ? "không giới hạn" : `${s.maxAgeHours}h`}
                  </span>
                </div>
                <select
                  value={AGE_OPTIONS.some((o) => o.hours === s.maxAgeHours) ? s.maxAgeHours : "custom"}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (Number.isFinite(v)) void save({ maxAgeHours: v });
                  }}
                  className="w-full rounded-lg border border-ink-200 bg-surface px-2.5 py-1.5 text-[12.5px] text-ink-900 outline-none focus:border-brand"
                >
                  {AGE_OPTIONS.map((o) => (
                    <option key={o.hours} value={o.hours}>
                      {o.label}
                    </option>
                  ))}
                  {!AGE_OPTIONS.some((o) => o.hours === s.maxAgeHours) && (
                    <option value="custom">tuỳ chọn: trong {s.maxAgeHours} giờ</option>
                  )}
                </select>
                <p className="mt-2 text-[11px] leading-snug text-ink-500">
                  chặn bài cũ đăng quá lâu bị đào lên push như hàng mới, tránh top bài forum cũ spam.
                </p>
              </div>
            </div>

            {/* 内容形态白名单 */}
            <div className="rounded-lg border border-ink-200 bg-surface-hover p-3.5">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <span className="text-[13px] font-medium text-ink-900">chỉ push các dạng nội dung nào (không tick = mọi dạng hợp lệ)</span>
                {(s.kinds?.length ?? 0) > 0 && (
                  <button
                    type="button"
                    onClick={() => save({ kinds: [] })}
                    className="text-[12px] font-medium text-brand hover:underline"
                  >
                    khôi phục tất cả dạng
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {KIND_ORDER.map((key) => {
                  const checked = (s.kinds ?? []).includes(key);
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() =>
                        save({
                          kinds: checked ? (s.kinds ?? []).filter((x) => x !== key) : [...(s.kinds ?? []), key],
                        })
                      }
                      className={
                        "inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[12px] transition-colors " +
                        (checked
                          ? "border-brand bg-brand-subtle font-medium text-brand"
                          : "border-ink-200 bg-surface text-ink-700 hover:bg-ink-100")
                      }
                    >
                      {checked && <Check size={12} />}
                      {KIND_LABEL[key]}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 分类白名单：分组与主页频道一致，可直接套用频道默认集合 */}
            <div className="rounded-lg border border-ink-200 bg-surface-hover p-3.5">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <span className="text-[13px] font-medium text-ink-900">chỉ push các phân loại nào (không tick = push tất cả)</span>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[11.5px] text-ink-500">Áp dụng kênh trang chủ:</span>
                  {CHANNELS.map((ch) => {
                    const same =
                      s.categories.length === ch.categories.length &&
                      ch.categories.every((c) => s.categories.includes(c));
                    return (
                      <button
                        key={ch.key}
                        type="button"
                        onClick={() => save({ categories: [...ch.categories] })}
                        className={
                          "rounded border px-2 py-0.5 text-[11.5px] transition-colors " +
                          (same
                            ? "border-brand bg-brand text-white"
                            : "border-ink-200 bg-surface text-ink-600 hover:border-brand-border hover:text-brand")
                        }
                      >
                        {ch.label}
                      </button>
                    );
                  })}
                  {s.categories.length > 0 && (
                    <button
                      type="button"
                      onClick={() => save({ categories: [] })}
                      className="text-[12px] font-medium text-brand hover:underline"
                    >
                      khôi phục tất cả phân loại
                    </button>
                  )}
                </div>
              </div>
              <div className="space-y-1.5">
                {CATEGORY_GROUPS.map((group) => (
                  <div key={group.key} className="flex flex-wrap items-center gap-1.5">
                    <span className="w-[62px] shrink-0 text-[11px] text-ink-400">{group.label}</span>
                    {group.categories.map((key) => {
                      const checked = s.categories.includes(key);
                      return (
                        <button
                          key={key}
                          type="button"
                          title={CATEGORY_DESC[key]}
                          onClick={() => toggleCategory(key)}
                          className={
                            "inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[12px] transition-colors " +
                            (checked
                              ? "border-brand bg-brand-subtle font-medium text-brand"
                              : "border-ink-200 bg-surface text-ink-700 hover:bg-ink-100")
                          }
                        >
                          {checked && <Check size={12} />}
                          {CATEGORY_LABEL[key]}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>

            {/* 获取方式白名单 */}
            <div className="rounded-lg border border-ink-200 bg-surface-hover p-3.5">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <span className="text-[13px] font-medium text-ink-900">chỉ push các cách lấy này (bỏ trống = không giới hạn)</span>
                {s.obtainModes.length > 0 && (
                  <button
                    type="button"
                    onClick={() => save({ obtainModes: [] })}
                    className="text-[12px] font-medium text-brand hover:underline"
                  >
                    mọi cách lấy
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {(["free", "conditional", "paid", "lottery", "trial", "promo"] as const).map((key) => {
                  const checked = s.obtainModes.includes(key);
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() =>
                        save({
                          obtainModes: checked ? s.obtainModes.filter((x) => x !== key) : [...s.obtainModes, key],
                        })
                      }
                      className={
                        "inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[12px] transition-colors " +
                        (checked
                          ? "border-brand bg-brand-subtle font-medium text-brand"
                          : "border-ink-200 bg-surface text-ink-700 hover:bg-ink-100")
                      }
                    >
                      {checked && <Check size={12} />}
                      {OBTAIN_LABEL[key]}
                    </button>
                  );
                })}
              </div>
              <p className="mt-1.5 text-[11px] text-ink-500">
                quay thưởng, dùng thử, quảng bá dễ lẫn nội dung marketing, mặc định chỉ push「free trực tiếp」.
              </p>
            </div>

            {/* 多频道推送路由 */}
            <div className="rounded-lg border border-ink-200 bg-surface-hover p-3.5">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="text-[13px] font-medium text-ink-900">route chuyên đề đa kênh (tuỳ chọn)</span>
                  <p className="mt-0.5 text-[11px] text-ink-500">
                    sau khi bật route bất kỳ sẽ phân luồng khớp theo điều kiện route (có thể đồng thời push「VPS Black Friday」lẫn「dự án mã nguồn mở」, chưa bật route thì theo lọc toàn cục)
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      const next: PushRoute = {
                        id: `free-${Date.now()}`,
                        name: "push thẳng freebie thật",
                        enabled: true,
                        kinds: ["freebie"],
                        categories: [],
                        obtainModes: ["free", "conditional"],
                        keywords: [],
                        maxPrice: 0,
                        minScore: 65,
                        instant: true,
                        header: "🎁 Freebie thật tuyển chọn",
                      };
                      void save({ routes: [...(s.routes ?? []), next] });
                    }}
                    className="rounded-lg border border-ink-200 bg-surface px-2.5 py-1 text-[11.5px] font-medium text-ink-700 hover:bg-ink-100"
                  >
                    + route freebie thật
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      save({
                        routes: [
                          ...(s.routes ?? []),
                          {
                            id: `vps-${Date.now()}`,
                            name: "Black Friday/VPS giá tốt",
                            enabled: true,
                            kinds: ["deal", "freebie"],
                            categories: ["vps", "cloud", "domain"],
                            obtainModes: ["free", "conditional", "paid"],
                            keywords: ["Black Friday", "vps", "kvm", "trả theo năm"],
                            maxPrice: null,
                            minScore: 55,
                            instant: true,
                            header: "🖥 VPS giá tốt",
                          },
                        ],
                      })
                    }
                    className="rounded-lg border border-ink-200 bg-surface px-2.5 py-1 text-[11.5px] font-medium text-ink-700 hover:bg-ink-100"
                  >
                    + route Black Friday/VPS
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      save({
                        routes: [
                          ...(s.routes ?? []),
                          {
                            id: `os-${Date.now()}`,
                            name: "tuyển chọn dự án mã nguồn mở",
                            enabled: true,
                            kinds: ["opensource"],
                            categories: [],
                            obtainModes: [],
                            keywords: [],
                            maxPrice: null,
                            minScore: 60,
                            instant: false,
                            header: "📦 Radar mã nguồn mở",
                          },
                        ],
                      })
                    }
                    className="rounded-lg border border-ink-200 bg-surface px-2.5 py-1 text-[11.5px] font-medium text-ink-700 hover:bg-ink-100"
                  >
                    + route mã nguồn mở
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      save({
                        routes: [
                          ...(s.routes ?? []),
                          {
                            id: `news-${Date.now()}`,
                            name: "bản tin sáng",
                            enabled: true,
                            kinds: ["info"],
                            categories: ["headline", "finance", "ai", "dev", "opensource", "security", "hardware", "news"],
                            obtainModes: [],
                            keywords: [],
                            maxPrice: null,
                            minScore: 55,
                            instant: false,
                            header: "📰 Tin tức",
                          },
                        ],
                      })
                    }
                    className="rounded-lg border border-ink-200 bg-surface px-2.5 py-1 text-[11.5px] font-medium text-ink-700 hover:bg-ink-100"
                  >
                    + route tin tức
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const next: PushRoute = {
                        id: `custom-${Date.now()}`,
                        name: "route chuyên đề tuỳ chọn",
                        enabled: true,
                        kinds: [],
                        categories: [],
                        obtainModes: [],
                        keywords: [],
                        maxPrice: null,
                        minScore: 60,
                        instant: false,
                        header: "",
                      };
                      void save({ routes: [...(s.routes ?? []), next] }).then(() => {
                        setEditingRouteId(next.id);
                        setRouteDraft(next);
                        setRouteKeywordsInput("");
                        setRoutePriceInput("");
                      });
                    }}
                    className="rounded-lg border border-brand bg-brand-subtle px-2.5 py-1 text-[11.5px] font-medium text-brand hover:bg-brand/10"
                  >
                    + route tuỳ chọn mới
                  </button>
                </div>
              </div>
              {(s.routes?.length ?? 0) > 0 && (
                <div className="mt-2 space-y-2">
                  {(s.routes ?? []).map((rt, idx) => {
                    const isEditing = editingRouteId === rt.id && routeDraft;
                    return (
                      <div
                        key={rt.id}
                        className="rounded-lg border border-ink-200 bg-surface px-3 py-2 text-[12px]"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-1.5 font-medium text-ink-900">
                              <span>{rt.name}</span>
                              <span className="rounded bg-ink-100 px-1.5 py-0.5 text-[10.5px] text-ink-600">
                                {rt.instant ? "có thể tức thì" : "chỉ gộp tin"}
                              </span>
                              <span className="rounded bg-ink-100 px-1.5 py-0.5 font-mono text-[10.5px] text-ink-600">
                                ≥{rt.minScore} điểm
                              </span>
                              {rt.kinds.length > 0 && (
                                <span className="text-[11px] font-normal text-ink-500">
                                  dạng: {rt.kinds.map((k) => KIND_LABEL[k] ?? k).join("/")}
                                </span>
                              )}
                              {rt.categories.length > 0 && (
                                <span className="text-[11px] font-normal text-ink-500">
                                  phân loại: {rt.categories.map((c) => categoryLabel(c)).join("/")}
                                </span>
                              )}
                              {rt.keywords.length > 0 && (
                                <span className="text-[11px] font-normal text-ink-500">
                                  từ: {rt.keywords.join("/")}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                if (isEditing) {
                                  setEditingRouteId(null);
                                  setRouteDraft(null);
                                } else {
                                  setEditingRouteId(rt.id);
                                  setRouteDraft({ ...rt });
                                  setRouteKeywordsInput(rt.keywords.join(", "));
                                  setRoutePriceInput(rt.maxPrice === null ? "" : String(rt.maxPrice));
                                }
                              }}
                              className="rounded border border-ink-200 px-2 py-0.5 text-[11px] text-ink-700 hover:bg-ink-100"
                            >
                              {isEditing ? "Thu gọn" : "Sửa"}
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                save({
                                  routes: (s.routes ?? []).map((x, i) => (i === idx ? { ...x, enabled: !x.enabled } : x)),
                                })
                              }
                              className={
                                "rounded border px-2 py-0.5 text-[11px] font-medium " +
                                (rt.enabled
                                  ? "border-deal-border bg-deal-subtle text-deal"
                                  : "border-ink-200 bg-ink-100 text-ink-500")
                              }
                            >
                              {rt.enabled ? "đã bật" : "đã ngừng"}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                if (isEditing) {
                                  setEditingRouteId(null);
                                  setRouteDraft(null);
                                }
                                void save({
                                  routes: (s.routes ?? []).filter((_, i) => i !== idx),
                                });
                              }}
                              className="rounded border border-ink-200 px-2 py-0.5 text-[11px] text-ink-500 hover:text-alert"
                            >
                              xoá
                            </button>
                          </div>
                        </div>

                        {isEditing && routeDraft && (
                          <div className="mt-3 space-y-2.5 border-t border-ink-100 pt-3">
                            <div className="grid gap-2.5 sm:grid-cols-4">
                              <label className="block">
                                <span className="text-[11px] text-ink-500">tên route</span>
                                <input
                                  value={routeDraft.name}
                                  onChange={(e) => setRouteDraft({ ...routeDraft, name: e.target.value })}
                                  className="mt-1 w-full rounded border border-ink-200 bg-surface px-2 py-1 text-[12px] outline-none focus:border-brand"
                                />
                              </label>
                              <label className="block">
                                <span className="text-[11px] text-ink-500">tiền tố tin (tuỳ chọn)</span>
                                <input
                                  value={routeDraft.header ?? ""}
                                  onChange={(e) => setRouteDraft({ ...routeDraft, header: e.target.value })}
                                  placeholder="vd: 🖥 VPS giá tốt"
                                  className="mt-1 w-full rounded border border-ink-200 bg-surface px-2 py-1 text-[12px] outline-none focus:border-brand"
                                />
                              </label>
                              <label className="block">
                                <span className="text-[11px] text-ink-500">điểm tối thiểu (0-100)</span>
                                <input
                                  type="number"
                                  min={0}
                                  max={100}
                                  value={routeDraft.minScore}
                                  onChange={(e) =>
                                    setRouteDraft({ ...routeDraft, minScore: Number(e.target.value) || 0 })
                                  }
                                  className="mt-1 w-full rounded border border-ink-200 bg-surface px-2 py-1 font-mono text-[12px] outline-none focus:border-brand"
                                />
                              </label>
                              <label className="block">
                                <span className="text-[11px] text-ink-500">giá tối đa (tệ, trống=không giới hạn, 0=chỉ free)</span>
                                <input
                                  value={routePriceInput}
                                  onChange={(e) => setRoutePriceInput(e.target.value)}
                                  placeholder="để trống = không giới hạn"
                                  className="mt-1 w-full rounded border border-ink-200 bg-surface px-2 py-1 font-mono text-[12px] outline-none focus:border-brand"
                                />
                              </label>
                            </div>

                            <div className="grid gap-2.5 sm:grid-cols-2">
                              <label className="block">
                                <span className="text-[11px] text-ink-500">từ khoá chủ đề (phẩy, trống=không giới hạn, trúng một là khớp)</span>
                                <input
                                  value={routeKeywordsInput}
                                  onChange={(e) => setRouteKeywordsInput(e.target.value)}
                                  placeholder="vd: black friday, vps, kvm, claude"
                                  className="mt-1 w-full rounded border border-ink-200 bg-surface px-2 py-1 text-[12px] outline-none focus:border-brand"
                                />
                              </label>
                              <div className="flex items-end gap-2">
                                <button
                                  type="button"
                                  onClick={() => setRouteDraft({ ...routeDraft, instant: !routeDraft.instant })}
                                  className={
                                    "rounded border px-2.5 py-1 text-[11.5px] font-medium " +
                                    (routeDraft.instant
                                      ? "border-brand bg-brand-subtle text-brand"
                                      : "border-ink-200 bg-surface text-ink-700")
                                  }
                                >
                                  {routeDraft.instant ? "cách: đủ điều kiện thì push tức thì" : "cách: chỉ vào tổng hợp gộp tin định kỳ"}
                                </button>
                              </div>
                            </div>

                            <div>
                              <span className="text-[11px] text-ink-500">dạng cho phép (bỏ trống = mọi dạng hợp lệ)</span>
                              <div className="mt-1 flex flex-wrap gap-1">
                                {KIND_ORDER.map((k) => {
                                  const on = routeDraft.kinds.includes(k);
                                  return (
                                    <button
                                      key={k}
                                      type="button"
                                      onClick={() =>
                                        setRouteDraft({
                                          ...routeDraft,
                                          kinds: on
                                            ? routeDraft.kinds.filter((x) => x !== k)
                                            : [...routeDraft.kinds, k],
                                        })
                                      }
                                      className={
                                        "rounded border px-2 py-0.5 text-[11px] " +
                                        (on
                                          ? "border-brand bg-brand-subtle font-medium text-brand"
                                          : "border-ink-200 bg-surface text-ink-600")
                                      }
                                    >
                                      {KIND_LABEL[k]}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>

                            <div>
                              <span className="text-[11px] text-ink-500">cách lấy cho phép (bỏ trống = không giới hạn)</span>
                              <div className="mt-1 flex flex-wrap gap-1">
                                {OBTAIN_ORDER.map((o) => {
                                  const on = routeDraft.obtainModes.includes(o);
                                  return (
                                    <button
                                      key={o}
                                      type="button"
                                      onClick={() =>
                                        setRouteDraft({
                                          ...routeDraft,
                                          obtainModes: on
                                            ? routeDraft.obtainModes.filter((x) => x !== o)
                                            : [...routeDraft.obtainModes, o],
                                        })
                                      }
                                      className={
                                        "rounded border px-2 py-0.5 text-[11px] " +
                                        (on
                                          ? "border-brand bg-brand-subtle font-medium text-brand"
                                          : "border-ink-200 bg-surface text-ink-600")
                                      }
                                    >
                                      {OBTAIN_LABEL[o]}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>

                            <div>
                              <div className="flex flex-wrap items-center justify-between gap-1">
                                <span className="text-[11px] text-ink-500">phân loại cho phép (bỏ trống = tất cả)</span>
                                <div className="flex flex-wrap items-center gap-1">
                                  <span className="text-[10.5px] text-ink-400">Áp dụng kênh:</span>
                                  {CHANNELS.map((ch) => (
                                    <button
                                      key={ch.key}
                                      type="button"
                                      onClick={() => setRouteDraft({ ...routeDraft, categories: [...ch.categories] })}
                                      className="rounded border border-ink-200 bg-surface px-1.5 py-0.5 text-[10.5px] text-ink-600 hover:border-brand-border hover:text-brand"
                                    >
                                      {ch.label}
                                    </button>
                                  ))}
                                  {routeDraft.categories.length > 0 && (
                                    <button
                                      type="button"
                                      onClick={() => setRouteDraft({ ...routeDraft, categories: [] })}
                                      className="text-[10.5px] font-medium text-brand hover:underline"
                                    >
                                      xoá hết
                                    </button>
                                  )}
                                </div>
                              </div>
                              <div className="mt-1 space-y-1">
                                {CATEGORY_GROUPS.map((group) => (
                                  <div key={group.key} className="flex flex-wrap items-center gap-1">
                                    <span className="w-[52px] shrink-0 text-[10.5px] text-ink-400">{group.label}</span>
                                    {group.categories.map((ck) => {
                                      const on = routeDraft.categories.includes(ck);
                                      return (
                                        <button
                                          key={ck}
                                          type="button"
                                          title={CATEGORY_DESC[ck]}
                                          onClick={() =>
                                            setRouteDraft({
                                              ...routeDraft,
                                              categories: on
                                                ? routeDraft.categories.filter((x) => x !== ck)
                                                : [...routeDraft.categories, ck],
                                            })
                                          }
                                          className={
                                            "rounded border px-2 py-0.5 text-[11px] " +
                                            (on
                                              ? "border-brand bg-brand-subtle font-medium text-brand"
                                              : "border-ink-200 bg-surface text-ink-600")
                                          }
                                        >
                                          {CATEGORY_LABEL[ck]}
                                        </button>
                                      );
                                    })}
                                  </div>
                                ))}
                              </div>
                            </div>

                            <div className="flex items-center justify-end gap-2 pt-1">
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingRouteId(null);
                                  setRouteDraft(null);
                                }}
                                className="rounded border border-ink-200 px-3 py-1 text-[11.5px] text-ink-600 hover:bg-ink-100"
                              >
                                huỷ
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  const kws = routeKeywordsInput
                                    .split(/[,，]/)
                                    .map((x) => x.trim())
                                    .filter(Boolean);
                                  const pNum = routePriceInput.trim() === "" ? null : Number(routePriceInput.trim());
                                  const updated: PushRoute = {
                                    ...routeDraft,
                                    name: routeDraft.name.trim() || "route chưa đặt tên",
                                    keywords: kws,
                                    maxPrice: pNum !== null && Number.isFinite(pNum) && pNum >= 0 ? pNum : null,
                                  };
                                  void save({
                                    routes: (s.routes ?? []).map((x, i) => (i === idx ? updated : x)),
                                  }).then(() => {
                                    setEditingRouteId(null);
                                    setRouteDraft(null);
                                  });
                                }}
                                className="rounded bg-brand px-3 py-1 text-[11.5px] font-medium text-white hover:bg-brand-hover"
                              >
                                lưu route
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 数据源范围控制 */}
            <div className="rounded-lg border border-ink-200 bg-surface-hover p-3.5">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <span className="text-[13px] font-medium text-ink-900">phạm vi nguồn được push</span>
                <div className="flex items-center gap-1.5">
                  {[
                    { key: "all" as PushSourceMode, label: "tất cả nguồn đang bật" },
                    { key: "include" as PushSourceMode, label: "chỉ push nguồn chọn" },
                    { key: "exclude" as PushSourceMode, label: "loại trừ nguồn chọn" },
                  ].map((m) => (
                    <button
                      key={m.key}
                      type="button"
                      onClick={() => save({ sourceMode: m.key })}
                      className={
                        "rounded-lg border px-2.5 py-1 text-[11.5px] font-medium transition-colors " +
                        (s.sourceMode === m.key
                          ? "border-brand bg-brand text-white"
                          : "border-ink-200 bg-surface text-ink-700 hover:bg-ink-100")
                      }
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>
              {s.sourceMode !== "all" && (
                <div className="mt-2.5 space-y-2">
                  <div className="flex items-center justify-between text-[11.5px] text-ink-500">
                    <span>
                      {s.sourceMode === "include"
                        ? `chỉ push ${s.sourceIds.length} nguồn dữ liệu đã chọn`
                        : `bỏ qua ${s.sourceIds.length} nguồn đã chọn (vẫn thu vào trang web)`}
                    </span>
                    {s.sourceIds.length > 0 && (
                      <button
                        type="button"
                        onClick={() => save({ sourceIds: [] })}
                        className="font-medium text-brand hover:underline"
                      >
                        xoá chọn
                      </button>
                    )}
                  </div>
                  <div className="flex max-h-[160px] flex-wrap gap-1.5 overflow-auto rounded-lg border border-ink-200 bg-surface p-2">
                    {enabledSources.map((src) => {
                      const active = s.sourceIds.includes(src.id);
                      return (
                        <button
                          key={src.id}
                          type="button"
                          onClick={() => toggleSourceId(src.id)}
                          className={
                            "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11.5px] transition-colors " +
                            (active
                              ? "border-brand bg-brand-subtle font-medium text-brand"
                              : "border-ink-200 bg-surface-hover text-ink-700 hover:bg-ink-100")
                          }
                        >
                          {active && <Check size={11} />}
                          {src.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>
      )}

      {subTab === "timing" && (
        <div className="grid gap-5 lg:grid-cols-2">
          {/* 评分阈值与消息内容自定义 */}
          <section className="panel space-y-3 p-5">
            <div className="flex items-center gap-2 text-[14px] font-semibold text-ink-950">
              <Zap size={15} className="text-brand" /> ngưỡng kích hoạt & format tin
            </div>
            <NumberField
              label="ngưỡng gửi riêng tức thì ≥"
              hint="đạt điểm này gửi riêng ngay, không chờ gộp tin (thả tay hoặc Enter có hiệu lực)"
              value={s.instantScore}
              min={0}
              max={100}
              step={5}
              suffix=" điểm"
              onCommit={(v) => save({ instantScore: v })}
            />
            <NumberField
              label="ngưỡng gộp gửi chung ≥"
              hint={`dưới ngưỡng tức thì vào hàng đợi gộp tin gửi chung định kỳ trước (tự động ≤ ngưỡng tức thì ${s.instantScore} điểm)`}
              value={s.batchScore}
              min={0}
              max={s.instantScore}
              step={5}
              suffix=" điểm"
              onCommit={(v) => save({ batchScore: v })}
            />
            <div className="grid grid-cols-2 gap-2">
              <Toggle
                label="push thẳng mục có mã đổi"
                value={s.instantOnCodes}
                onChange={(v) => save({ instantOnCodes: v })}
              />
              <Toggle
                label="push thẳng số lượng/suất giới hạn"
                value={s.instantOnUrgent}
                onChange={(v) => save({ instantOnUrgent: v })}
              />
            </div>

            <div className="pt-1">
              <div className="mb-1.5 text-[12px] font-medium text-ink-700">thành phần tin & công tắc khử trùng</div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                <Toggle label="có giá" value={s.includePrice} onChange={(v) => save({ includePrice: v })} />
                <Toggle label="có ngày hết hạn" value={s.includeDeadline} onChange={(v) => save({ includeDeadline: v })} />
                <Toggle label="có điểm" value={s.includeScore} onChange={(v) => save({ includeScore: v })} />
                <Toggle label="có cách lấy" value={s.includeObtain} onChange={(v) => save({ includeObtain: v })} />
                <Toggle label="kèm lý do AI" value={s.includeAiReason} onChange={(v) => save({ includeAiReason: v })} />
                <Toggle label="khử trùng liên nguồn" value={s.dedupeByTitle} onChange={(v) => save({ dedupeByTitle: v })} />
              </div>
            </div>

            <label className="block rounded-lg border border-ink-200 bg-surface-hover px-3.5 py-2.5">
              <span className="text-[12.5px] font-medium text-ink-900">tiền tố đầu tin tuỳ chọn (lưu khi mất focus, trống=mặc định)</span>
              <input
                value={customHeaderDraft}
                onChange={(e) => setCustomHeaderDraft(e.target.value)}
                onBlur={() => {
                  if (customHeaderDraft.trim() !== s.customHeader) {
                    void save({ customHeader: customHeaderDraft.trim() });
                  }
                }}
                placeholder="vd: 🛰 Freebie Radar · tuyển chọn"
                maxLength={60}
                className="mt-1.5 w-full rounded-lg border border-ink-200 bg-surface px-2.5 py-1.5 text-[12.5px] text-ink-900 outline-none focus:border-brand"
              />
            </label>
          </section>

          {/* 频率限制与夜间免打扰 */}
          <section className="panel space-y-3 p-5">
            <div className="flex items-center gap-2 text-[14px] font-semibold text-ink-950">
              <Clock size={15} className="text-brand" /> kiểm soát tần suất & không làm phiền ban đêm
            </div>
            <NumberField
              label="giới hạn push mỗi giờ"
              hint="tổng số tin gửi riêng + gộp tin (1~200)"
              value={s.maxPerHour}
              min={1}
              max={200}
              suffix=" tin"
              onCommit={(v) => save({ maxPerHour: v })}
            />
            <div className="grid grid-cols-2 gap-2">
              <NumberField
                label="tối đa gửi tức thì mỗi lượt"
                value={s.maxPerInstant}
                min={1}
                max={10}
                suffix=" tin"
                onCommit={(v) => save({ maxPerInstant: v })}
              />
              <NumberField
                label="tối đa mỗi đợt gộp"
                value={s.maxPerBatch}
                min={1}
                max={20}
                suffix=" tin"
                onCommit={(v) => save({ maxPerBatch: v })}
              />
            </div>

            <label className="block rounded-lg border border-ink-200 bg-surface-hover px-3.5 py-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[13px] font-medium text-ink-900">chu kỳ gộp tin (sửa xong dựng lại timer ngay)</span>
                <span className="font-mono text-[12px] text-brand">
                  {s.batchIntervalMin === 0 ? "đã đóng" : `mỗi ${s.batchIntervalMin} phút`}
                </span>
              </div>
              <select
                value={s.batchIntervalMin}
                onChange={(e) => save({ batchIntervalMin: Number(e.target.value) })}
                className="mt-2 w-full rounded-lg border border-ink-200 bg-surface px-2.5 py-1.5 text-[12.5px] text-ink-900 outline-none focus:border-brand"
              >
                <option value={0}>tắt gộp tin</option>
                <option value={5}>mỗi 5 phút</option>
                <option value={10}>mỗi 10 phút</option>
                <option value={15}>mỗi 15 phút</option>
                <option value={30}>mỗi 30 phút</option>
                <option value={60}>mỗi 1 giờ</option>
                <option value={120}>mỗi 2 giờ</option>
              </select>
            </label>

            <div className="space-y-2.5 rounded-lg border border-ink-200 bg-surface-hover p-3.5">
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-900">
                  <Moon size={13} className="text-ink-500" /> khung giờ không làm phiền ban đêm
                </span>
                <div className="flex items-center gap-2">
                  <span className={`text-[11.5px] font-medium ${payload?.quiet ? "text-amber-700" : "text-ink-500"}`}>
                    {!s.quietEnabled ? "chưa bật" : payload?.quiet ? "đang không làm phiền" : "khung giờ push bình thường"}
                  </span>
                  <button
                    type="button"
                    onClick={() => save({ quietEnabled: !s.quietEnabled })}
                    className={
                      "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors " +
                      (s.quietEnabled ? "bg-brand" : "bg-ink-300")
                    }
                    title={s.quietEnabled ? "bấm để tắt không làm phiền ban đêm" : "bấm để bật không làm phiền ban đêm"}
                  >
                    <span
                      className={
                        "inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform " +
                        (s.quietEnabled ? "translate-x-4.5" : "translate-x-0.5")
                      }
                    />
                  </button>
                </div>
              </div>

              {s.quietEnabled && (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="time"
                      value={quietFrom}
                      onChange={(e) => setQuietFrom(e.target.value)}
                      onBlur={() => {
                        const next = `${quietFrom}-${quietTo}`;
                        if (next !== s.quietHours) void save({ quietHours: next });
                      }}
                      className="rounded-lg border border-ink-200 bg-surface px-2.5 py-1.5 font-mono text-[12.5px] text-ink-900 outline-none focus:border-brand"
                    />
                    <span className="text-ink-400">đến</span>
                    <input
                      type="time"
                      value={quietTo}
                      onChange={(e) => setQuietTo(e.target.value)}
                      onBlur={() => {
                        const next = `${quietFrom}-${quietTo}`;
                        if (next !== s.quietHours) void save({ quietHours: next });
                      }}
                      className="rounded-lg border border-ink-200 bg-surface px-2.5 py-1.5 font-mono text-[12.5px] text-ink-900 outline-none focus:border-brand"
                    />
                    <select
                      value={s.timezone}
                      onChange={(e) => save({ timezone: e.target.value })}
                      className="ml-auto rounded-lg border border-ink-200 bg-surface px-2.5 py-1.5 text-[12px] text-ink-800 outline-none focus:border-brand"
                    >
                      <option value="Asia/Shanghai">giờ Bắc Kinh (UTC+8)</option>
                      <option value="Asia/Tokyo">giờ Tokyo (UTC+9)</option>
                      <option value="UTC">UTC</option>
                      <option value="America/New_York">giờ miền Đông Mỹ</option>
                      <option value="Europe/London">giờ London</option>
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { key: "batch" as const, label: "chuyển vào gộp tin gửi sáng" },
                      { key: "drop" as const, label: "bỏ qua trong thời gian im lặng" },
                    ].map((opt) => (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() => save({ quietAction: opt.key })}
                        className={
                          "rounded-lg border px-2.5 py-1.5 text-[12px] font-medium transition-colors " +
                          (s.quietAction === opt.key
                            ? "border-brand bg-brand-subtle text-brand"
                            : "border-ink-200 bg-surface text-ink-700 hover:bg-ink-100")
                        }
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </section>
        </div>
      )}

      {subTab === "logs" && (
        <div className="space-y-4">
          {/* 预览与测试 */}
          <section className="panel space-y-3.5 p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="flex items-center gap-2 text-[14px] font-semibold text-ink-950">
                  <Sparkles size={15} className="text-brand" /> xem trước hiệu quả thực tế (không gửi thật)
                </div>
                <p className="mt-0.5 text-[12px] text-ink-500">
                  dùng 180 tin mới nhất chưa push trong DB chạy thử theo toàn bộ điều kiện lọc trên, kiểm tra ngay phân bố trúng và lý do bị chặn.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    setBusy("preview");
                    try {
                      await onPreview();
                    } catch {
                      setOperationError("lỗi mạng, chạy thử thất bại, thử lại");
                    } finally {
                      setBusy(null);
                    }
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3.5 py-2 text-[12.5px] font-medium text-white transition-colors hover:bg-brand-hover"
                >
                  {busy === "preview" ? <Loader2 size={13} className="animate-spin" /> : <Eye size={13} />} xem trước chạy thử push
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    setBusy("flush");
                    try {
                      if (payload?.quiet && !window.confirm("đang trong giờ không làm phiền, vẫn muốn gửi gộp tin thủ công?")) return;
                      await onFlush();
                    } catch {
                      setOperationError("lỗi mạng, không xác nhận được kết quả gửi, xem bản ghi");
                    } finally {
                      setBusy(null);
                    }
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 bg-surface px-3 py-2 text-[12.5px] font-medium text-ink-700 hover:bg-ink-100"
                >
                  {busy === "flush" ? <Loader2 size={13} className="animate-spin" /> : <ListOrdered size={13} />} gửi gộp tin ngay
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    setBusy("test");
                    try {
                      await onTest();
                    } catch {
                      setOperationError("lỗi mạng, không xác nhận được kết quả test, xem bản ghi");
                    } finally {
                      setBusy(null);
                    }
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 bg-surface px-3 py-2 text-[12.5px] font-medium text-ink-700 hover:bg-ink-100"
                >
                  {busy === "test" ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />} gửi tin test
                </button>
              </div>
            </div>

            {preview && (
              <div className="space-y-3 pt-1">
                {preview.rejectedBy && (
                  <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-ink-200 bg-surface-hover px-3 py-2 text-[11.5px]">
                    <span className="font-medium text-ink-700">
                      quét {preview.scanned} tin · qua lọc {preview.matched} tin · phân bố chặn:
                    </span>
                    {REJECT_LABELS.filter((r) => (preview.rejectedBy?.[r.key] ?? 0) > 0).map((r) => (
                      <span key={r.key} className="rounded bg-ink-100 px-2 py-0.5 text-ink-600">
                        {r.label} <span className="font-mono font-medium">{preview.rejectedBy?.[r.key]}</span>
                      </span>
                    ))}
                  </div>
                )}

                <div className="grid gap-3 lg:grid-cols-2">
                  <div className="rounded-lg border border-ink-200 bg-surface-hover p-3">
                    <div className="mb-1.5 flex items-center justify-between text-[12px] font-medium text-deal">
                      <span>⚡ push ngay (đủ điều kiện {preview.instantTotal ?? preview.instant.length})</span>
                      <span className="font-mono text-[11px] text-ink-500">
                        đợt này gửi thật {preview.sendableInstant ?? preview.instant.length} tin
                      </span>
                    </div>
                    <pre className="max-h-[220px] overflow-auto font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-ink-700">
                      {preview.instant.length ? preview.instant.join("\n\n") : "（không có mục nào kích push tức thì theo điều kiện hiện tại）"}
                    </pre>
                  </div>
                  <div className="rounded-lg border border-ink-200 bg-surface-hover p-3">
                    <div className="mb-1.5 text-[12px] font-medium text-brand">
                      📦 hàng đợi gộp tin (đủ điều kiện {preview.batchTotal ?? preview.batch.length}, đã xếp trong bộ nhớ {preview.queued})
                    </div>
                    <pre className="max-h-[220px] overflow-auto font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-ink-700">
                      {preview.batch.length ? preview.batch.join("\n\n") : "（không có mục đạt ngưỡng gộp tin theo điều kiện hiện tại）"}
                    </pre>
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* 历史推送记录 */}
          <section className="panel overflow-hidden">
            <div className="border-b border-ink-100 px-5 py-3.5 text-[13.5px] font-semibold text-ink-950">
              lịch sử push gần đây ({logs.length})
            </div>
            <div className="max-h-[420px] divide-y divide-ink-100 overflow-auto">
              {logs.length === 0 && (
                <div className="px-5 py-10 text-center text-[12.5px] text-ink-500">chưa có lịch sử push</div>
              )}
              {logs.map((l) => (
                <div key={l.id} className="px-5 py-3">
                  <div className="mb-1 flex flex-wrap items-center gap-2 text-[12px]">
                    <span
                      className={
                        "rounded-md px-2 py-0.5 font-medium " +
                        (l.kind === "instant"
                          ? "bg-code-subtle text-amber-800"
                          : l.kind === "batch"
                            ? "bg-brand-subtle text-brand"
                            : "bg-ink-100 text-ink-700")
                      }
                    >
                      {l.kind === "instant" ? "push tức thì" : l.kind === "batch" ? "push gộp tin" : l.kind}
                    </span>
                    <span className="font-mono text-ink-500">{l.created_at.replace("T", " ").slice(5, 19)}</span>
                    <span className="text-ink-600">{l.count} tin</span>
                    {l.ok === 0 && <span className="rounded bg-alert-subtle px-1.5 py-0.5 text-alert">Gửi thất bại</span>}
                    {l.reason && <span className="truncate text-ink-500">· vì {l.reason}</span>}
                  </div>
                  <pre className="max-h-[72px] overflow-hidden font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-ink-600">
                    {(l.text ?? "").slice(0, 240)}
                    {(l.text ?? "").length > 240 ? "…" : ""}
                  </pre>
                  {l.error && <div className="mt-1 font-mono text-[11px] text-alert">{l.error}</div>}
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </fieldset>
  );
}
