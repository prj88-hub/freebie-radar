import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Bot,
  Check,
  ChevronDown,
  ChevronUp,
  CircleCheck,
  CircleX,
  Clock,
  ExternalLink,
  FlaskConical,
  Loader2,
  RefreshCw,
  Save,
  Search,
  Filter,
  Sparkles,
  Zap,
} from "lucide-react";
import { KIND_LABEL, OBTAIN_LABEL, categoryLabel, timeAgo } from "../lib/sources.ts";
import type { AiPayload, AiSettings, AiSourceMode, AiStage, AiStats, Source } from "../types.ts";

const STAGE_META: Record<AiStage, { label: string; cls: string }> = {
  sync: { label: "đồng bộ trước khi push", cls: "bg-brand-subtle text-accent border-brand-border" },
  queue: { label: "hàng đợi async", cls: "bg-ink-100 text-ink-700 border-ink-200" },
  backfill: { label: "duyệt bổ sung lịch sử", cls: "bg-code-subtle text-code border-code-border" },
  test: { label: "test kết nối", cls: "bg-deal-subtle text-deal border-deal-border" },
};

function fmtDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

type TestResult = {
  ok: boolean;
  ms: number;
  model: string;
  results: {
    title: string;
    keep: boolean;
    category: string;
    kind?: string;
    obtain?: string;
    quality?: number | null;
    reason: string;
  }[];
  error?: string;
};

type BackfillMode = "pending" | "recent" | "rejected";

function SwitchRow({
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
      onClick={() => onChange(!value)}
      className="flex w-full min-w-0 items-center justify-between gap-3 rounded-lg border border-ink-200 bg-surface-hover px-3.5 py-2.5 text-left transition-colors hover:border-ink-300"
    >
      <div className="min-w-0">
        <div className="text-[13px] font-medium text-ink-900">{label}</div>
        {hint && <div className="mt-0.5 text-[11px] leading-snug break-words text-ink-500">{hint}</div>}
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

export function AiPanel({
  data,
  sources,
  reload,
  onNotify,
  sourceName = (id: string) => id,
  onOpenItem,
}: {
  data: AiPayload | null;
  sources: Source[];
  reload: () => void;
  onNotify?: (msg: string) => void;
  sourceName?: (id: string) => string;
  onOpenItem?: (id: number) => void;
}) {
  const [form, setForm] = useState<AiSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [test, setTest] = useState<TestResult | null>(null);
  const [backfilling, setBackfilling] = useState(false);
  const [reclassifying, setReclassifying] = useState(false);
  const [deduping, setDeduping] = useState(false);
  const [dedupResult, setDedupResult] = useState<{ scanned: number; merged: number; clusters: number; skippedReason?: string } | null>(null);
  const [backfillMode, setBackfillMode] = useState<BackfillMode>("pending");
  const [backfillLimit, setBackfillLimit] = useState(200);
  const [backfill, setBackfill] = useState<{
    reviewed: number;
    rejected: number;
    skippedBlocked?: number;
    scanned: number;
    mode?: BackfillMode;
    error?: string;
  } | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [showSamples, setShowSamples] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [liveStats, setLiveStats] = useState<AiStats | null>(null);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [sampleFilter, setSampleFilter] = useState<"all" | "kept" | "rejected">("all");
  const [sampleQuery, setSampleQuery] = useState("");

  useEffect(() => {
    if (data?.settings && !form) setForm({ ...data.settings });
  }, [data, form]);

  useEffect(() => {
    if (data?.stats) setLiveStats(data.stats);
  }, [data?.stats]);

  useEffect(() => {
    if (!data?.settings) return;
    setForm((prev) =>
      prev
        ? {
            ...prev,
            enabled: data.settings.enabled,
            learnFromFeedback: data.settings.learnFromFeedback,
            preFilterEnabled: data.settings.preFilterEnabled,
            aiDedupEnabled: data.settings.aiDedupEnabled,
            aiDedupWindowHours: data.settings.aiDedupWindowHours,
            skipFreebieSources: data.settings.skipFreebieSources,
            sourceMode: data.settings.sourceMode,
            sourceIds: data.settings.sourceIds,
            customNoiseKeywords: data.settings.customNoiseKeywords,
          }
        : prev,
    );
  }, [
    data?.settings?.enabled,
    data?.settings?.learnFromFeedback,
    data?.settings?.preFilterEnabled,
    data?.settings?.skipFreebieSources,
    data?.settings?.sourceMode,
    data?.settings?.sourceIds,
    data?.settings?.customNoiseKeywords,
  ]);

  const st = liveStats ?? data?.stats;
  const activeJobs = st?.telemetry?.active ?? [];
  const isLiveActive = Boolean(backfilling || testing || st?.queue?.running || activeJobs.length > 0);

  // 有任务运行时 750ms 高频刷新进度与实时判定流；空闲时 5s 静默同步后台采集结果
  useEffect(() => {
    if (!data) return;
    let alive = true;
    const poll = async () => {
      try {
        const r = await fetch("/api/ai/live");
        if (!r.ok || !alive) return;
        const j = (await r.json()) as { stats?: AiStats };
        if (j.stats && alive) setLiveStats(j.stats);
      } catch {
        /* ignore */
      }
    };
    if (isLiveActive) void poll();
    const timer = window.setInterval(() => void poll(), isLiveActive ? 750 : 5000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [Boolean(data), isLiveActive]);

  // 活动任务计时器：每秒平滑更新已运行秒数
  useEffect(() => {
    if (!isLiveActive) return;
    const t = window.setInterval(() => setNowTick(Date.now()), 250);
    return () => window.clearInterval(t);
  }, [isLiveActive]);

  const recentFiltered = useMemo(() => {
    const list = st?.recent ?? [];
    const q = sampleQuery.trim().toLowerCase();
    return list.filter((r) => {
      if (sampleFilter === "kept" && !r.keep) return false;
      if (sampleFilter === "rejected" && r.keep !== false) return false;
      if (!q) return true;
      const src = r.sourceId ? sourceName(r.sourceId).toLowerCase() : "";
      return (
        r.title.toLowerCase().includes(q) ||
        r.reason.toLowerCase().includes(q) ||
        src.includes(q)
      );
    });
  }, [st?.recent, sampleFilter, sampleQuery, sourceName]);

  if (!data || !form || !st) {
    return <div className="panel p-6 text-[13px] text-ink-500">Đang đọc cấu hình AI…</div>;
  }

  const s = data.settings;
  const total = st.kept + st.rejected + st.pending;
  const keptPct = total ? Math.round((st.kept / total) * 100) : 0;
  const enabledSources = sources.filter((src) => src.enabled);

  async function save(patch: Partial<AiSettings>, toastText = "đã lưu cấu hình AI") {
    setSaving(true);
    try {
      const r = await fetch("/api/ai", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (r.ok) {
        const j = (await r.json()) as AiPayload;
        const saved = j.settings as unknown as Record<string, unknown>;
        setForm((prev) => {
          if (!prev) return { ...j.settings };
          const next: Record<string, unknown> = { ...prev };
          // 只回写本次 patch 提交的字段，其余未保存草稿（端点/模型/Key/提示词）保持用户输入。
          // 之前整块 setForm({ ...j.settings }) 会把草稿冲成服务端旧值——点任意一个自动保存开关就丢 Key。
          for (const key of Object.keys(patch)) {
            if (key in saved) next[key] = saved[key];
          }
          // 本次提交的明文 Key 已经落库：清空输入框，让 keyHint 占位提示接手
          if (typeof patch.apiKey === "string" && patch.apiKey.trim() && !patch.apiKey.startsWith("••••")) {
            next.apiKey = "";
          }
          return next as unknown as AiSettings;
        });
        reload();
        onNotify?.(toastText);
      } else {
        onNotify?.("Lưu thất bại");
      }
    } finally {
      setSaving(false);
    }
  }

  async function runTest() {
    setTesting(true);
    setTest(null);
    try {
      const draft: Partial<AiSettings> = {
        baseUrl: form?.baseUrl ?? "",
        model: form?.model ?? "",
        apiKey: (form?.apiKey ?? "").startsWith("••••") ? "" : (form?.apiKey ?? ""),
        timeoutSec: form?.timeoutSec,
        extraPrompt: form?.extraPrompt,
        systemPrompt: form?.systemPrompt,
        learnFromFeedback: form?.learnFromFeedback,
        feedbackLimit: form?.feedbackLimit,
      };
      const r = await fetch("/api/ai/test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(draft),
      });
      setTest((await r.json()) as TestResult);
      // 不再 reload()：重新拉 /api/ai 只会把未保存的草稿覆盖成服务端旧值；
      // 测试不需要改配置，统计由 /api/ai/live 轮询（活动时 750ms）自行刷新。
    } finally {
      setTesting(false);
    }
  }

  async function runBackfill() {
    setBackfilling(true);
    setBackfill(null);
    try {
      const r = await fetch("/api/ai/backfill", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ limit: backfillLimit, mode: backfillMode }),
      });
      setBackfill((await r.json()) as typeof backfill);
      reload();
    } finally {
      setBackfilling(false);
    }
  }

  async function runReclassify() {
    setReclassifying(true);
    try {
      const r = await fetch("/api/ai/reclassify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scope: "other" }),
      });
      const j = (await r.json()) as { scanned: number; updated: number; movedFromOther: number };
      reload();
      onNotify?.(`đã quét ${j.scanned} tin「khác」, xếp loại được ${j.movedFromOther} tin (0 token)`);
    } finally {
      setReclassifying(false);
    }
  }

  async function runDedup() {
    setDeduping(true);
    setDedupResult(null);
    try {
      const r = await fetch("/api/ai/dedup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ limit: 80 }),
      });
      const j = (await r.json()) as { scanned: number; merged: number; clusters: number; skippedReason?: string };
      setDedupResult(j);
      reload();
      onNotify?.(
        j.skippedReason
          ? j.skippedReason
          : `đã đối chiếu ${j.scanned} tin, gộp ${j.merged} tin trùng (hiện tổng ${j.clusters} cụm)`,
      );
    } finally {
      setDeduping(false);
    }
  }

  const toggleSourceId = (id: string) => {
    const next = form.sourceIds.includes(id)
      ? form.sourceIds.filter((x) => x !== id)
      : [...form.sourceIds, id];
    setForm({ ...form, sourceIds: next });
    void save({ sourceIds: next });
  };

  const canTest = Boolean(form.baseUrl.trim() && form.model.trim());

  return (
    <div className="space-y-4">
      {/* 1. 状态与测试/补审工具 */}
      <div className="panel space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-subtle text-brand">
            <Bot size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-[15px] font-semibold text-ink-900">engine duyệt ngữ nghĩa AI</h2>
              {s.ready ? (
                <span className="inline-flex items-center gap-1 rounded-md bg-deal-subtle px-1.5 py-0.5 text-[11px] font-medium text-deal">
                  <CircleCheck size={11} /> đang chạy
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-700">
                  <AlertTriangle size={11} /> chưa bật
                </span>
              )}
              {st.queue && (
                <span className="rounded-md bg-ink-100 px-2 py-0.5 font-mono text-[11px] text-ink-600">
                  hàng đợi async: {st.queue.queued} chờ duyệt{st.queue.running ? "（đang chạy）" : ""} · đã xử lý {st.queue.processed}
                  {st.queue.dropped > 0 ? ` · bỏ ${st.queue.dropped}` : ""}
                </span>
              )}
            </div>
            <p className="mt-0.5 text-[12px] text-ink-500">
              {s.baseUrl ? s.model + " @ " + s.baseUrl.replace(/^https?:\/\//, "") : "chưa cấu hình endpoint"}
              {s.hasKey ? " · Key " + s.keyHint : " · chưa đặt key"}
              {" · thời điểm chờ/cướp mã tốc độ trước push vào「rule push」để đặt"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={runTest}
              disabled={testing || !canTest}
              title="dùng thẳng endpoint, model & bản nháp prompt trong form dưới để test"
              className="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 bg-surface px-3 py-1.5 text-[12.5px] font-medium text-ink-700 hover:bg-ink-100 disabled:opacity-50"
            >
              {testing ? <Loader2 size={13} className="animate-spin" /> : <FlaskConical size={13} />}
              test cấu hình nháp
            </button>
          </div>
        </div>

        {/* 补审 / 重审工具条 */}
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-ink-200 bg-surface-hover px-3.5 py-2.5">
          <div className="text-[12px] text-ink-700">
            <span className="font-medium text-ink-900">duyệt bổ sung / duyệt lại kho cũ:</span>
            sau khi sửa rule/prompt bổ sung, có thể duyệt lại mục lịch sử để kiểm chứng ngay
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={backfillMode}
              onChange={(e) => setBackfillMode(e.target.value as BackfillMode)}
              className="rounded-lg border border-ink-200 bg-surface px-2.5 py-1 text-[12px] text-ink-800 outline-none focus:border-brand"
            >
              <option value="pending">chỉ duyệt mục chưa duyệt (pending)</option>
              <option value="recent">duyệt lại mục đã vào kho gần đây (chuẩn lại phân loại/điểm)</option>
              <option value="rejected">rà soát mục bị AI chặn (chống giết nhầm)</option>
            </select>
            <select
              value={backfillLimit}
              onChange={(e) => setBackfillLimit(Number(e.target.value))}
              className="rounded-lg border border-ink-200 bg-surface px-2 py-1 font-mono text-[12px] text-ink-800 outline-none focus:border-brand"
            >
              <option value={50}>50 tin</option>
              <option value={200}>200 tin</option>
              <option value={500}>500 tin</option>
            </select>
            <button
              type="button"
              onClick={runBackfill}
              disabled={backfilling || !s.ready}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1 text-[12px] font-medium text-white hover:bg-brand-hover disabled:opacity-50"
            >
              {backfilling ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
              chạy ngay
            </button>

            <button
              type="button"
              onClick={runReclassify}
              disabled={reclassifying}
              title="tính lại phân loại「khác」lịch sử bằng rule từ khoá mới nhất, 0 token"
              className="inline-flex items-center gap-1 rounded-lg border border-ink-200 bg-surface px-2.5 py-1 text-[12px] font-medium text-ink-700 hover:bg-ink-100 disabled:opacity-50"
            >
              {reclassifying ? <Loader2 size={12} className="animate-spin" /> : null}
              xếp lại phân loại (0 token)
            </button>
          </div>
        </div>

        {test && (
          <div
            className={
              "rounded-lg border p-3 text-[12.5px] " +
              (test.ok ? "border-deal-border bg-deal-subtle" : "border-red-200 bg-red-50")
            }
          >
            <div className="mb-2 flex items-center gap-2 font-medium">
              {test.ok ? <CircleCheck size={13} className="text-deal" /> : <CircleX size={13} className="text-red-600" />}
              {test.ok ? "kết nối bình thường" : "Gọi API thất bại"} · {test.model} · {test.ms} ms
              {test.error && <span className="font-normal text-red-700">{test.error}</span>}
            </div>
            {test.results.map((r) => (
              <div key={r.title} className="flex flex-wrap items-center gap-2 py-1 text-[12px]">
                <span className={"shrink-0 " + (r.keep ? "text-deal" : "text-red-600")}>
                  {r.keep ? <Check size={12} /> : <CircleX size={12} />}
                </span>
                <span className="min-w-0 flex-1 truncate font-medium text-ink-800">{r.title}</span>
                {r.kind && r.kind !== "noise" && (
                  <span className="rounded bg-surface px-1.5 py-0.5 text-[11px] font-medium text-brand">
                    {KIND_LABEL[r.kind] ?? r.kind}
                  </span>
                )}
                <span className="rounded bg-surface px-1.5 py-0.5 text-[11px] text-ink-600">
                  {categoryLabel(r.category)}
                </span>
                {r.obtain && (
                  <span className="rounded bg-surface px-1.5 py-0.5 text-[11px] text-ink-600">
                    {OBTAIN_LABEL[r.obtain] ?? r.obtain}
                  </span>
                )}
                {typeof r.quality === "number" && (
                  <span className="rounded bg-surface px-1.5 py-0.5 font-mono text-[11px] text-brand">
                    ★{r.quality}
                  </span>
                )}
                <span className="shrink-0 text-ink-500">{r.reason}</span>
              </div>
            ))}
          </div>
        )}

        {backfill && (
          <div className="rounded-lg border border-ink-200 bg-surface p-3 text-[12.5px] text-ink-700">
            chạy xong ({backfill.mode ?? "pending"}): quét {backfill.scanned} tin, đánh giá {backfill.reviewed} tin (qua{" "}
            {backfill.reviewed - backfill.rejected} / chặn {backfill.rejected})
            {backfill.skippedBlocked ? (
              <span className="text-ink-500">
                {" "}
                · đã bỏ qua {backfill.skippedBlocked} tin trúng từ chặn toàn cục (tiết kiệm hạn mức)
              </span>
            ) : null}
            {backfill.reviewed === 0 && (backfill.skippedBlocked ?? 0) > 0 && !backfill.error ? (
              <span className="ml-1 text-ink-500">— hiện không có mục chờ duyệt chưa bị chặn</span>
            ) : null}
            {backfill.error && <span className="text-red-700"> · {backfill.error}</span>}
          </div>
        )}
      </div>

      {/* 2. 实时审核台与执行流水 */}
      <div className="panel space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {isLiveActive ? (
              <span className="relative flex h-2.5 w-2.5 items-center justify-center">
                <span className="ai-pulse-ring absolute inline-flex h-full w-full rounded-full bg-accent" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
              </span>
            ) : (
              <span className="inline-flex h-2 w-2 rounded-full bg-deal" />
            )}
            <h3 className="text-[13.5px] font-semibold text-ink-900">
              {isLiveActive ? "AI đang duyệt thời gian thực" : "giám sát chạy AI"}
            </h3>
            <span className="text-[11.5px] text-ink-500">
              {isLiveActive
                ? "tự làm mới kết quả & tiến độ sau mỗi batch"
                : st.telemetry?.history?.length
                  ? `bản ghi gần đây ${st.telemetry.history.length} lượt chạy`
                  : "chờ lần thu sau hoặc kích duyệt bổ sung thủ công"}
            </span>
          </div>
          {(st.telemetry?.history?.length ?? 0) > 0 && (
            <button
              type="button"
              onClick={() => setShowHistory((v) => !v)}
              className="inline-flex items-center gap-1 rounded-md border border-ink-200 bg-surface px-2 py-1 text-[11.5px] text-ink-600 hover:bg-ink-100"
            >
              {showHistory ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              {showHistory ? "thu gọn toàn bộ log" : `log chạy gần đây (${st.telemetry?.history?.length ?? 0})`}
            </button>
          )}
        </div>

        {activeJobs.length > 0 && (
          <div className="space-y-3">
            {activeJobs.map((job) => {
              const pct = job.total > 0 ? Math.min(100, Math.round(((job.done + job.failed) / job.total) * 100)) : 0;
              const elapsed = Math.max(0, nowTick - new Date(job.startedAt).getTime());
              const meta = STAGE_META[job.stage];
              return (
                <div
                  key={job.id}
                  className="ai-enter space-y-2.5 rounded-lg border border-brand-border bg-brand-subtle/40 p-3.5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={"rounded border px-1.5 py-0.5 text-[11px] font-medium " + meta.cls}>
                        {meta.label}
                      </span>
                      <span className="text-[13px] font-medium text-ink-950">
                        {job.sourceId ? `${sourceName(job.sourceId)} · ${job.label.replace(job.sourceId + " · ", "")}` : job.label}
                      </span>
                      <span className="font-mono text-[11px] text-ink-500">{job.model}</span>
                    </div>
                    <div className="flex items-center gap-2 font-mono text-[11.5px] tabular-nums text-ink-600">
                      <span>
                        đợt {Math.min(job.completedBatches + 1, job.totalBatches)}/{job.totalBatches}
                      </span>
                      <span>·</span>
                      <span className="inline-flex items-center gap-1">
                        <Clock size={11} /> {fmtDuration(elapsed)}
                      </span>
                    </div>
                  </div>

                  {/* 柔和流光进度条 */}
                  <div className="relative h-2 overflow-hidden rounded-full bg-white/80 ring-1 ring-brand-border/60">
                    <div
                      className="relative h-full overflow-hidden rounded-full bg-accent transition-[width] duration-300 ease-out"
                      style={{ width: Math.max(6, pct) + "%" }}
                    >
                      <span className="ai-shimmer absolute inset-y-0 left-0 w-1/2 bg-gradient-to-r from-transparent via-white/45 to-transparent" />
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 text-[12px]">
                    <div className="flex flex-wrap items-center gap-3 font-mono tabular-nums">
                      <span className="text-ink-900">
                        tiến độ {job.done}/{job.total} ({pct}%)
                      </span>
                      <span className="text-deal">qua {job.kept}</span>
                      <span className="text-alert">chặn {job.rejected}</span>
                      {job.failed > 0 && <span className="text-code">thất bại {job.failed}</span>}
                    </div>
                  </div>

                  {job.recentEvents.length > 0 && (
                    <div className="space-y-1 border-t border-brand-border/50 pt-2">
                      <div className="text-[11px] font-medium text-ink-500">đánh giá vừa ghi DB</div>
                      {job.recentEvents.slice(0, 4).map((ev, idx) => (
                        <div
                          key={ev.title + idx}
                          className="ai-enter flex items-center gap-2 rounded bg-white/85 px-2.5 py-1 text-[12px]"
                        >
                          <span className={"shrink-0 " + (ev.keep ? "text-deal" : "text-alert")}>
                            {ev.keep ? <Check size={12} /> : <CircleX size={12} />}
                          </span>
                          <span className="min-w-0 flex-1 truncate font-medium text-ink-800">{ev.title}</span>
                          {typeof ev.quality === "number" && (
                            <span className="shrink-0 rounded bg-brand-subtle px-1 py-0.5 font-mono text-[10.5px] text-accent">
                              ★{ev.quality}
                            </span>
                          )}
                          <span className="max-w-[220px] shrink-0 truncate text-[11px] text-ink-500">{ev.reason}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {(st.telemetry?.history?.length ?? 0) > 0 && (
          <div className="space-y-1.5">
            {(st.telemetry?.history ?? []).slice(0, showHistory ? 25 : 4).map((run) => {
              const meta = STAGE_META[run.stage];
              const passRatio = run.reviewed > 0 ? Math.round((run.kept / run.reviewed) * 100) : 0;
              return (
                <div
                  key={run.id}
                  className="flex flex-wrap items-center gap-2.5 rounded-lg border border-ink-200 bg-surface-hover px-3 py-2 text-[12px]"
                >
                  <span className={"shrink-0 rounded border px-1.5 py-0.5 text-[10.5px] font-medium " + meta.cls}>
                    {meta.label}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-medium text-ink-800">
                    {run.sourceId ? sourceName(run.sourceId) : run.label}
                  </span>
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-14 overflow-hidden rounded-full bg-ink-200" title={`giữ ${run.kept} / chặn ${run.rejected}`}>
                      <div className="h-full bg-deal" style={{ width: passRatio + "%" }} />
                    </div>
                    <span className="font-mono text-[11.5px] tabular-nums text-ink-700">
                      {run.reviewed} tin (<span className="text-deal">{run.kept}</span>/<span className="text-ink-500">{run.rejected}</span>）
                    </span>
                  </div>
                  {run.skippedBlocked ? (
                    <span className="font-mono text-[11px] text-ink-400">bỏ qua theo chặn {run.skippedBlocked}</span>
                  ) : null}
                  {run.error ? (
                    <span className="max-w-[180px] truncate rounded bg-alert-subtle px-1.5 py-0.5 text-[11px] text-alert">
                      {run.error}
                    </span>
                  ) : (
                    <span className="font-mono text-[11px] tabular-nums text-ink-500">
                      {fmtDuration(run.durationMs)}
                      {run.ttfbAvgMs !== null ? ` · byte đầu ${run.ttfbAvgMs}ms` : ""}
                    </span>
                  )}
                  <span className="font-mono text-[11px] text-ink-400">{timeAgo(run.finishedAt)}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 3. 判定分布 */}
      <div className="panel p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Activity size={14} className="text-ink-500" />
            <h3 className="text-[13.5px] font-semibold text-ink-900">phân bố đánh giá</h3>
            <span className="text-[11.5px] text-ink-500">tổng {total} tin chờ/đã duyệt đang hoạt động</span>
          </div>
          {(st.blockedSkipped ?? 0) > 0 && (
            <span className="text-[11.5px] text-ink-500">
              ngoài ra <span className="font-mono text-ink-700">{st.blockedSkipped}</span> tin trúng từ chặn toàn cục, đã miễn gửi AI tiết kiệm hạn mức
            </span>
          )}
        </div>
        <div className="mb-3 h-2 overflow-hidden rounded-full bg-ink-100">
          <div className="h-full bg-deal transition-[width] duration-500" style={{ width: keptPct + "%" }} />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div>
            <div className="font-mono text-[18px] font-semibold tabular-nums text-deal">{st.kept}</div>
            <div className="text-[11.5px] text-ink-500">đánh giá hợp lệ</div>
          </div>
          <div>
            <div className="font-mono text-[18px] font-semibold tabular-nums text-ink-700">{st.rejected}</div>
            <div className="text-[11.5px] text-ink-500">đánh giá nhiễu</div>
          </div>
          <div>
            <div className="font-mono text-[18px] font-semibold tabular-nums text-ink-900">{st.pending}</div>
            <div className="text-[11.5px] text-ink-500">thực sự chờ duyệt</div>
          </div>
          <div>
            <div className="font-mono text-[18px] font-semibold tabular-nums text-ink-400">{st.blockedSkipped ?? 0}</div>
            <div className="text-[11.5px] text-ink-500">bỏ qua theo từ chặn (tiết kiệm hạn mức)</div>
          </div>
        </div>
        {st.byCategory.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {st.byCategory.map((c) => (
              <span key={c.category} className="rounded-md bg-ink-100 px-2 py-0.5 text-[11.5px] text-ink-700">
                {categoryLabel(c.category)} <span className="font-mono">{c.n}</span>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* 3. 第一道规则初筛与送审范围控制 */}
      <div className="panel space-y-4 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Filter size={15} className="text-brand" />
            <h3 className="text-[13.5px] font-semibold text-ink-900">lọc sơ bằng rule & phạm vi gửi duyệt (tiết kiệm hạn mức · tăng tốc)</h3>
          </div>
          <span className="text-[11.5px] text-ink-500">sau khi thu vào kho, qua lọc sơ bằng rule trước rồi mới quyết gửi AI</span>
        </div>

        <div className="grid gap-2.5 sm:grid-cols-2">
          <SwitchRow
            label="bật chặn trước nhiễu đầu vào (lọc sơ bằng rule)"
            hint="tự bỏ qua bài cầu cứu/hỏi giá/patch game rõ ràng không phải freebie, không gửi AI cũng không chủ động push thẳng"
            value={form.preFilterEnabled}
            onChange={(v) => {
              setForm({ ...form, preFilterEnabled: v });
              void save({ preFilterEnabled: v }, v ? "đã bật lọc sơ bằng rule" : "đã tắt lọc sơ bằng rule (toàn bộ thẳng vào AI)");
            }}
          />
          <SwitchRow
            label="nguồn chuyên free miễn gửi AI, thông hành"
            hint="nguồn chuyên free như Epic/Steam/GamerPower/CheapShark/ITAD/SharewareOnSale đánh thẳng freebie thật để tiết kiệm hạn mức"
            value={form.skipFreebieSources}
            onChange={(v) => {
              setForm({ ...form, skipFreebieSources: v });
              void save({ skipFreebieSources: v }, v ? "nguồn chuyên free đã đặt thông hành miễn duyệt" : "nguồn chuyên free đã khôi phục gửi AI");
            }}
          />
        </div>

        <div className="rounded-lg border border-ink-200 bg-surface-hover p-3.5">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-[12.5px] font-medium text-ink-900">khử trùng ngữ nghĩa AI (tự động)</div>
              <div className="mt-0.5 text-[11px] leading-snug text-ink-500">
sau khi bật chạy hoàn toàn tự động: đối chiếu một lần khi duyệt vào kho qua, lại đối chiếu một lần trước khi push Telegram. cùng hoạt động/sự kiện dù mỗi nơi diễn đạt khác hẳn cũng chỉ giữ 1 tin, chỉ push 1 lần.
                {st?.dedup ? ` đã gộp ${st.dedup.mergedItems} tin, ${st.dedup.clusterCount} cụm.` : ""}
                {st?.dedup?.degraded && st.dedup.degraded.count > 0
                  ? ` ⚠ đã hạ cấp ${st.dedup.degraded.count} lần (gần nhất: ${st.dedup.degraded.lastReason ?? "không rõ"}), trong lúc đó chỉ khử trùng bằng rule có hiệu lực.`
                  : ""}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <label className="flex items-center gap-1 text-[11.5px] text-ink-600">
                khung đối chiếu
                <input
                  type="number"
                  min={6}
                  max={168}
                  value={form.aiDedupWindowHours}
                  onChange={(e) => setForm({ ...form, aiDedupWindowHours: Number(e.target.value) })}
                  onBlur={() => void save({ aiDedupWindowHours: form.aiDedupWindowHours })}
                  className="w-14 rounded border border-ink-200 bg-surface px-1.5 py-0.5 text-center font-mono text-[12px]"
                />
                giờ
              </label>
              <button
                type="button"
                onClick={() => {
                  const next = !form.aiDedupEnabled;
                  setForm({ ...form, aiDedupEnabled: next });
                  void save({ aiDedupEnabled: next }, next ? "đã bật khử trùng ngữ nghĩa AI" : "đã tắt khử trùng ngữ nghĩa AI");
                }}
                className={
                  "rounded-lg border px-3 py-1 text-[12px] font-medium transition-colors " +
                  (form.aiDedupEnabled
                    ? "border-deal-border bg-deal-subtle text-deal"
                    : "border-ink-200 bg-ink-100 text-ink-600")
                }
              >
                {form.aiDedupEnabled ? "đã bật" : "đã đóng"}
              </button>
              <button
                type="button"
                onClick={() => void runDedup()}
                disabled={deduping || !s.ready}
                title="chạy một lượt gom cụm ngữ nghĩa cho mục đã vào kho trong N giờ qua, trùng lịch sử cũng bị gập"
                className="inline-flex items-center gap-1 rounded-lg border border-ink-200 bg-surface px-2.5 py-1 text-[12px] font-medium text-ink-700 hover:bg-ink-100 disabled:opacity-50"
              >
                {deduping ? <Loader2 size={12} className="animate-spin" /> : <Zap size={12} />}
                gom cụm khử trùng ngay
              </button>
            </div>
          </div>
          {dedupResult && (
            <div className="mt-1 text-[11.5px] text-ink-600">
              {dedupResult.skippedReason
                ? dedupResult.skippedReason
                : `đã đối chiếu ${dedupResult.scanned} tin, gộp ${dedupResult.merged} tin trùng, hiện tổng ${dedupResult.clusters} cụm.`}
            </div>
          )}
        </div>

<div className="rounded-lg border border-ink-200 bg-surface-hover px-3.5 py-2.5 text-[12px] leading-relaxed text-ink-600">
          từ chặn tuỳ chọn đã gộp với「<span className="font-medium text-ink-900">theo dõi & chặn</span>」thành rule thống nhất: mục trúng từ chặn toàn cục hoặc regex cũng bị bỏ qua thẳng trước khi vào kho gửi AI, tiết kiệm hạn mức duyệt.
        </div>

        <div className="rounded-lg border border-ink-200 bg-surface-hover p-3.5">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <span className="text-[12.5px] font-medium text-ink-900">phạm vi nguồn gửi duyệt</span>
            <div className="flex items-center gap-1.5">
              {[
                { key: "all" as AiSourceMode, label: "tất cả nguồn đang bật" },
                { key: "exclude" as AiSourceMode, label: "loại trừ nguồn chọn" },
                { key: "only" as AiSourceMode, label: "chỉ duyệt nguồn chọn" },
              ].map((m) => (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => {
                    setForm({ ...form, sourceMode: m.key });
                    void save({ sourceMode: m.key });
                  }}
                  className={
                    "rounded-lg border px-2.5 py-1 text-[11.5px] font-medium transition-colors " +
                    (form.sourceMode === m.key
                      ? "border-brand bg-brand text-white"
                      : "border-ink-200 bg-surface text-ink-700 hover:bg-ink-100")
                  }
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>
          {form.sourceMode !== "all" && (
            <div className="mt-2 flex max-h-[150px] flex-wrap gap-1.5 overflow-auto rounded-lg border border-ink-200 bg-surface p-2">
              {enabledSources.map((src) => {
                const active = form.sourceIds.includes(src.id);
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
          )}
        </div>
      </div>

      {/* 4. 模型连接、性能并发与提示词自定义 */}
      <div className="panel space-y-4 p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-[13.5px] font-semibold text-ink-900">kết nối model, hiệu năng song song & chuẩn duyệt</h3>
          <label className="flex items-center gap-2 text-[12.5px] font-medium text-ink-800">
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(e) => {
                setForm({ ...form, enabled: e.target.checked });
                void save({ enabled: e.target.checked }, e.target.checked ? "đã bật duyệt ngữ nghĩa AI" : "đã tắt duyệt ngữ nghĩa AI");
              }}
              className="h-3.5 w-3.5 accent-brand"
            />
            bật duyệt ngữ nghĩa AI
          </label>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block">
            <span className="mb-1 block text-[12px] font-medium text-ink-700">endpoint API (tương thích OpenAI)</span>
            <input
              value={form.baseUrl}
              onChange={(e) => setForm({ ...form, baseUrl: e.target.value })}
              placeholder="https://api.openai.com/v1"
              className="w-full rounded-lg border border-ink-200 bg-surface px-2.5 py-1.5 font-mono text-[12.5px] text-ink-900 outline-none focus:border-brand"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[12px] font-medium text-ink-700">Tên model</span>
            <input
              value={form.model}
              onChange={(e) => setForm({ ...form, model: e.target.value })}
              placeholder="mercury-3"
              className="w-full rounded-lg border border-ink-200 bg-surface px-2.5 py-1.5 font-mono text-[12.5px] text-ink-900 outline-none focus:border-brand"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[12px] font-medium text-ink-700">
              API Key {s.hasKey && <span className="font-normal text-ink-500">（hiện tại {s.keyHint}）</span>}
            </span>
            <input
              type="password"
              value={(form.apiKey ?? "").startsWith("••••") ? "" : (form.apiKey ?? "")}
              onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
              placeholder={s.hasKey ? "đã cấu hình, để trống = giữ nguyên" : "sk-..."}
              className="w-full rounded-lg border border-ink-200 bg-surface px-2.5 py-1.5 font-mono text-[12.5px] text-ink-900 outline-none focus:border-brand"
            />
          </label>
        </div>

        {/* 性能参数 */}
        <div className="grid gap-3 sm:grid-cols-4">
          <label className="block rounded-lg border border-ink-200 bg-surface-hover p-3">
            <span className="mb-1 block text-[12px] font-medium text-ink-700">giới hạn mỗi lần gọi (20~500)</span>
            <input
              type="number"
              min={20}
              max={500}
              step={10}
              value={form.maxItems}
              onChange={(e) => setForm({ ...form, maxItems: Number(e.target.value) })}
              className="w-full rounded-lg border border-ink-200 bg-surface px-2.5 py-1 font-mono text-[12.5px] text-ink-900 outline-none focus:border-brand"
            />
          </label>
          <label className="block rounded-lg border border-ink-200 bg-surface-hover p-3">
            <span className="mb-1 block text-[12px] font-medium text-ink-700">số tin mỗi batch (2~20)</span>
            <input
              type="number"
              min={2}
              max={20}
              value={form.batchSize}
              onChange={(e) => setForm({ ...form, batchSize: Number(e.target.value) })}
              className="w-full rounded-lg border border-ink-200 bg-surface px-2.5 py-1 font-mono text-[12.5px] text-ink-900 outline-none focus:border-brand"
            />
          </label>
          <label className="block rounded-lg border border-ink-200 bg-surface-hover p-3">
            <span className="mb-1 block text-[12px] font-medium text-ink-700">số batch song song (1~8)</span>
            <input
              type="number"
              min={1}
              max={8}
              value={form.concurrency}
              onChange={(e) => setForm({ ...form, concurrency: Number(e.target.value) })}
              className="w-full rounded-lg border border-ink-200 bg-surface px-2.5 py-1 font-mono text-[12.5px] text-ink-900 outline-none focus:border-brand"
            />
          </label>
          <label className="block rounded-lg border border-ink-200 bg-surface-hover p-3">
            <span className="mb-1 block text-[12px] font-medium text-ink-700">timeout mỗi batch, giây (5~60)</span>
            <input
              type="number"
              min={5}
              max={60}
              value={form.timeoutSec}
              onChange={(e) => setForm({ ...form, timeoutSec: Number(e.target.value) })}
              className="w-full rounded-lg border border-ink-200 bg-surface px-2.5 py-1 font-mono text-[12.5px] text-ink-900 outline-none focus:border-brand"
            />
          </label>
        </div>

        <div className="rounded-lg border border-ink-200 bg-surface-hover px-3.5 py-2 text-[11.5px] leading-relaxed text-ink-600">
          nhịp từng đợt hiện tại: mỗi HTTP request gói <span className="font-mono font-medium text-ink-900">{form.batchSize}</span> tin ×{" "}
          <span className="font-mono font-medium text-ink-900">{form.concurrency}</span> song song = mỗi đợt{" "}
          <span className="font-mono font-medium text-ink-900">{form.batchSize * form.concurrency}</span> tin · sau thu duyệt đồng bộ trước{" "}
          <span className="font-mono font-medium text-ink-900">{s.syncPrePushLimit ?? 20}</span> tin rồi push (chỉnh được trong「rule push」), phần vượt vào hàng đợi async tối đa mỗi đợt{" "}
          <span className="font-mono font-medium text-ink-900">{Math.min(Math.max(form.batchSize * form.concurrency, 12), 48)}</span> tin ·「giới hạn mỗi lần gọi」trên chỉ giới hạn gọi batch trực tiếp,「lịch sử duyệt bù 50/200/500」do dropdown bên phải điều khiển riêng.
        </div>

        {/* 偏好自适应 */}
        <div className="rounded-lg border border-ink-200 bg-surface-hover p-3.5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-[12.5px] font-medium text-ink-900">tự học sở thích từ lưu & đóng</div>
              <div className="mt-0.5 text-[11px] text-ink-500">
                tự lấy mục lưu gần đây (mẫu dương {data.feedback?.positive ?? 0} tin) và đóng thủ công (mẫu âm {data.feedback?.negative ?? 0} tin) làm tham chiếu duyệt
              </div>
            </div>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1 text-[11.5px] text-ink-600">
                mỗi loại lấy gần đây
                <input
                  type="number"
                  min={1}
                  max={15}
                  value={form.feedbackLimit}
                  onChange={(e) => setForm({ ...form, feedbackLimit: Number(e.target.value) })}
                  className="w-12 rounded border border-ink-200 bg-surface px-1.5 py-0.5 text-center font-mono text-[12px]"
                />
                tin
              </label>
              <button
                type="button"
                onClick={() => setShowSamples((v) => !v)}
                className="inline-flex items-center gap-1 rounded-lg border border-ink-200 bg-surface px-2.5 py-1 text-[11.5px] text-ink-700 hover:bg-ink-100"
              >
                {showSamples ? <ChevronUp size={12} /> : <ChevronDown size={12} />} xem mẫu
              </button>
              <button
                type="button"
                onClick={() => {
                  const next = !form.learnFromFeedback;
                  setForm({ ...form, learnFromFeedback: next });
                  void save({ learnFromFeedback: next }, next ? "đã bật tự thích ứng sở thích" : "đã tắt tự thích ứng sở thích");
                }}
                className={
                  "rounded-lg border px-3 py-1 text-[12px] font-medium transition-colors " +
                  (form.learnFromFeedback
                    ? "border-deal-border bg-deal-subtle text-deal"
                    : "border-ink-200 bg-ink-100 text-ink-600")
                }
              >
                {form.learnFromFeedback ? "đang tự học" : "đã đóng"}
              </button>
            </div>
          </div>

          {showSamples && (
            <div className="mt-3 grid gap-2.5 border-t border-ink-200 pt-2.5 sm:grid-cols-2">
              <div>
                <div className="mb-1 text-[11px] font-medium text-deal">mẫu dương đã nạp (lưu gần đây)</div>
                <ul className="space-y-1 text-[11.5px] text-ink-700">
                  {(data.feedback?.positiveSamples ?? []).map((t, idx) => (
                    <li key={idx} className="truncate">
                      · {t}
                    </li>
                  ))}
                  {!(data.feedback?.positiveSamples?.length) && <li className="text-ink-400">chưa có mẫu đã lưu</li>}
                </ul>
              </div>
              <div>
                <div className="mb-1 text-[11px] font-medium text-alert">mẫu âm đã nạp (đóng gần đây)</div>
                <ul className="space-y-1 text-[11.5px] text-ink-700">
                  {(data.feedback?.negativeSamples ?? []).map((t, idx) => (
                    <li key={idx} className="truncate">
                      · {t}
                    </li>
                  ))}
                  {!(data.feedback?.negativeSamples?.length) && <li className="text-ink-400">chưa có mẫu đã đóng</li>}
                </ul>
              </div>
            </div>
          )}
        </div>

        {/* 补充审核规则（推荐） */}
        <label className="block">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[12px] font-medium text-ink-800">
              rule duyệt bổ sung (khuyên dùng · tự nối sau chuẩn mặc định hệ thống, không phá format JSON)
            </span>
            <span className="text-[11px] text-ink-500">thêm sở thích bất cứ lúc nào, vd「bắt buộc gắn thẻ tín dụng thì đánh false」「quota free của model AI thì giữ hết」</span>
          </div>
          <textarea
            value={form.extraPrompt}
            onChange={(e) => setForm({ ...form, extraPrompt: e.target.value })}
            rows={3}
            placeholder="vd: 1. hoạt động cần xác thực doanh nghiệp/giấy phép kinh doanh thì đánh keep=false; 2. API AI nguồn mở free/voucher sức mạnh tính toán thì ưu tiên quality=5..."
            className="w-full rounded-lg border border-ink-200 bg-surface px-2.5 py-2 text-[12px] leading-relaxed text-ink-800 outline-none focus:border-brand"
          />
        </label>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() =>
              save({
                enabled: form.enabled,
                baseUrl: form.baseUrl,
                model: form.model,
                apiKey: (form.apiKey ?? "").startsWith("••••") ? "" : (form.apiKey ?? ""),
                maxItems: form.maxItems,
                batchSize: form.batchSize,
                concurrency: form.concurrency,
                timeoutSec: form.timeoutSec,
                feedbackLimit: form.feedbackLimit,
                extraPrompt: form.extraPrompt,
                systemPrompt: form.systemPrompt,
              })
            }
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3.5 py-1.5 text-[12.5px] font-medium text-white hover:bg-brand-hover disabled:opacity-60"
          >
            {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
            lưu cấu hình
          </button>
          <button
            type="button"
            onClick={() => setShowPrompt((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 bg-surface px-3 py-1.5 text-[12.5px] font-medium text-ink-700 hover:bg-ink-100"
          >
            <Zap size={13} />
            {showPrompt ? "thu gọn prompt chính đầy đủ" : "nâng cao: tuỳ chỉnh prompt chính đầy đủ"}
          </button>
          <button
            type="button"
            onClick={reload}
            className="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 bg-surface px-3 py-1.5 text-[12.5px] font-medium text-ink-700 hover:bg-ink-100"
          >
            <RefreshCw size={13} /> làm mới
          </button>
        </div>

        {showPrompt && (
          <div className="border-t border-ink-100 pt-3">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-[12px] font-medium text-ink-700">
                prompt chính hệ thống đầy đủ
                {s.promptIsDefault ? (
                  <span className="ml-1 font-normal text-ink-500">（đang dùng mặc định tích hợp, để trống = luôn theo bản cập nhật）</span>
                ) : (
                  <span className="ml-1 font-normal text-brand">（đã tuỳ chỉnh ghi đè hoàn toàn）</span>
                )}
              </span>
              {!s.promptIsDefault && (
                <button
                  type="button"
                  onClick={() => {
                    setForm({ ...form, systemPrompt: "" });
                    void save({ systemPrompt: "" }, "đã khôi phục prompt chính mặc định");
                  }}
                  className="text-[11.5px] font-medium text-brand hover:underline"
                >
                  khôi phục prompt chính mặc định
                </button>
              )}
            </div>
            <textarea
              value={form.systemPrompt || (s.promptIsDefault ? s.defaultPrompt : "")}
              onChange={(e) => setForm({ ...form, systemPrompt: e.target.value })}
              rows={11}
              className="w-full rounded-lg border border-ink-200 bg-surface px-2.5 py-2 font-mono text-[11.5px] leading-relaxed text-ink-800 outline-none focus:border-brand"
            />
          </div>
        )}
      </div>

      {/* 5. 最近判定样本 */}
      <div className="panel p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <h3 className="text-[13.5px] font-semibold text-ink-900">mẫu đánh giá gần đây</h3>
            <span className="text-[11.5px] text-ink-500">xếp ngược theo thời điểm AI đánh giá thực, hiện {st.recent.length} tin gần nhất</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-0.5 rounded-md border border-ink-200 bg-surface p-0.5 text-[11.5px]">
              {[
                { key: "all" as const, label: `tất cả ${st.recent.length}` },
                { key: "kept" as const, label: `qua ${st.recent.filter((r) => r.keep).length}` },
                { key: "rejected" as const, label: `chặn ${st.recent.filter((r) => r.keep === false).length}` },
              ].map((tabItem) => (
                <button
                  key={tabItem.key}
                  type="button"
                  onClick={() => setSampleFilter(tabItem.key)}
                  className={
                    "rounded px-2 py-0.5 font-medium transition-colors " +
                    (sampleFilter === tabItem.key ? "bg-ink-950 text-white" : "text-ink-500 hover:text-ink-950")
                  }
                >
                  {tabItem.label}
                </button>
              ))}
            </div>
            <div className="relative">
              <Search size={12} className="pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 text-ink-400" />
              <input
                value={sampleQuery}
                onChange={(e) => setSampleQuery(e.target.value)}
                placeholder="tìm tiêu đề / lý do / nguồn"
                className="w-40 rounded-md border border-ink-200 bg-surface py-1 pr-2 pl-6 text-[11.5px] text-ink-800 outline-none focus:border-brand"
              />
            </div>
          </div>
        </div>

        <div className="divide-y divide-ink-100">
          {recentFiltered.map((r) => (
            <div key={r.id} className="py-2.5 first:pt-1 last:pb-1">
              <div className="flex items-start gap-2">
                <span className={"mt-0.5 shrink-0 " + (r.keep ? "text-deal" : "text-alert")}>
                  {r.keep ? <Check size={13} /> : <CircleX size={13} />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    {onOpenItem ? (
                      <button
                        type="button"
                        onClick={() => onOpenItem(r.id)}
                        className="group inline-flex min-w-0 flex-1 items-center gap-1 text-left text-[13px] font-medium text-ink-900 hover:text-accent hover:underline"
                      >
                        <span className="truncate">{r.title}</span>
                        <ExternalLink size={11} className="shrink-0 opacity-0 transition-opacity group-hover:opacity-70" />
                      </button>
                    ) : (
                      <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink-900">{r.title}</span>
                    )}
                    <span className="shrink-0 font-mono text-[11px] text-ink-400">
                      {r.reviewedAt ? timeAgo(r.reviewedAt) : ""}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
                    {r.sourceId && (
                      <span className="rounded bg-ink-100 px-1.5 py-0.5 text-ink-600">{sourceName(r.sourceId)}</span>
                    )}
                    {r.kind && r.kind !== "noise" && (
                      <span className="rounded bg-brand-subtle px-1.5 py-0.5 font-medium text-accent">
                        {KIND_LABEL[r.kind] ?? r.kind}
                      </span>
                    )}
                    {r.category && (
                      <span className="rounded bg-ink-100 px-1.5 py-0.5 text-ink-600">
                        {categoryLabel(r.category)}
                      </span>
                    )}
                    {r.obtain && r.obtain !== "free" && (
                      <span className="rounded bg-code-subtle px-1.5 py-0.5 text-code">
                        {OBTAIN_LABEL[r.obtain] ?? r.obtain}
                      </span>
                    )}
                    {typeof r.quality === "number" && (
                      <span className="rounded bg-brand-subtle px-1.5 py-0.5 font-mono text-accent">★{r.quality}</span>
                    )}
                    <span className="font-mono text-ink-400">{Math.round(r.score)} điểm</span>
                    {r.reason && (
                      <span className={"ml-0.5 " + (r.keep ? "text-ink-600" : "text-alert/90")}>
                        · {r.reason}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
          {!recentFiltered.length && (
            <div className="py-6 text-center text-[12.5px] text-ink-500">
              {st.recent.length ? "không có mẫu khớp" : "chưa có bản ghi đánh giá"}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
