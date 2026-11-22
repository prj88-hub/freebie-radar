import { useMemo, useState } from "react";
import { Flame, Loader2, Newspaper, Radar, RefreshCw, Sparkles, TrendingDown, TrendingUp } from "lucide-react";
import { KIND_LABEL, categoryLabelForKind, timeAgo } from "../lib/sources.ts";
import type { HotReport, HotScope } from "../types.ts";

const WINDOWS = [
  { hours: 24, label: "24 giờ" },
  { hours: 72, label: "3 ngày" },
  { hours: 168, label: "7 ngày" },
];

const SCOPES: { key: HotScope; label: string }[] = [
  { key: "all", label: "Tất cả" },
  { key: "deals", label: "freebie/giá tốt" },
  { key: "news", label: "tin quan trọng" },
  { key: "info", label: "tin ngành" },
];

function Delta({ delta }: { delta: number }) {
  if (delta === 0) return <span className="font-mono text-[11px] text-ink-400">ngang nhau</span>;
  const up = delta > 0;
  return (
    <span className={"inline-flex items-center gap-0.5 font-mono text-[11px] " + (up ? "text-deal" : "text-ink-400")}>
      {up ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
      {up ? "+" : ""}
      {delta}
    </span>
  );
}

/**
 * 今日热点：同事件去重后的热词云 + 可点击分类热度 + 「最值得抢」与「重要新闻/资讯」严格分栏。
 */
export function HotPanel({
  report,
  loading,
  error,
  hours,
  scope,
  onHours,
  onScope,
  onReload,
  onSearchWord,
  onJumpCategory,
  onOpenItem,
  sourceName,
}: {
  report: HotReport | null;
  loading: boolean;
  error: string | null;
  hours: number;
  scope: HotScope;
  onHours: (h: number) => void;
  onScope: (s: HotScope) => void;
  onReload: () => void;
  onSearchWord: (word: string) => void;
  onJumpCategory: (category: string) => void;
  onOpenItem: (id: number) => void;
  sourceName: (id: string) => string;
}) {
  const [hovered, setHovered] = useState<string | null>(null);

  const words = report?.words ?? [];
  const max = words[0]?.n ?? 1;
  const min = words[words.length - 1]?.n ?? 1;
  const scale = (n: number) => {
    if (max === min) return 20;
    return Math.round(13 + ((n - min) / (max - min)) * 17);
  };
  const catMax = Math.max(1, ...(report?.categories ?? []).map((c) => c.n));

  const windowLabel = useMemo(() => WINDOWS.find((w) => w.hours === hours)?.label ?? hours + " giờ", [hours]);
  const totalDelta = report ? report.scanned - report.prevScanned : 0;
  const topNews = report?.topNews ?? [];

  return (
    <div className="space-y-4">
      <div className="panel flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="flex items-center gap-2">
          <Flame size={15} className="text-brand" />
          <span className="text-[14px] font-semibold text-ink-950">điểm nóng hôm nay</span>
          <span className="text-[11.5px] text-ink-500">đã khử trùng sự kiện liên nguồn, bấm từ hoặc phân loại để về dòng tài nguyên</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-0.5 rounded-md border border-ink-200 bg-surface p-0.5">
            {SCOPES.map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => onScope(s.key)}
                className={
                  "rounded px-2.5 py-1 text-[11.5px] font-medium transition-colors active:scale-[0.98] " +
                  (scope === s.key ? "bg-ink-950 text-white" : "text-ink-500 hover:text-ink-950")
                }
              >
                {s.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-0.5 rounded-md border border-ink-200 bg-surface p-0.5">
            {WINDOWS.map((w) => (
              <button
                key={w.hours}
                type="button"
                onClick={() => onHours(w.hours)}
                className={
                  "rounded px-2.5 py-1 text-[11.5px] font-medium transition-colors active:scale-[0.98] " +
                  (hours === w.hours ? "bg-ink-950 text-white" : "text-ink-500 hover:text-ink-950")
                }
              >
                {w.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={onReload}
            className="inline-flex h-7 items-center gap-1 rounded-md border border-ink-200 px-2 text-[11.5px] font-medium text-ink-600 transition-colors hover:bg-ink-100 active:scale-[0.98]"
            title="Tính lại"
          >
            <RefreshCw size={11} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {error && <div className="panel border-alert-border bg-alert-subtle p-4 text-[13px] text-alert">{error}</div>}

      {loading && !report && (
        <div className="panel flex items-center gap-2 p-6 text-[13px] text-ink-500">
          <Loader2 size={13} className="animate-spin" /> đang thống kê từ hot {windowLabel}…
        </div>
      )}

      {report && (
        <div key={`${report.windowHours}-${report.scope}`} className="list-enter space-y-4">
          <div className="panel grid grid-cols-2 gap-3 p-4 sm:grid-cols-4">
            {[
              {
                label: "số sự kiện riêng",
                value: report.scanned,
                note: report.rawScanned && report.rawScanned > report.scanned
                  ? `${windowLabel}（gốc ${report.rawScanned} tin đã khử trùng）`
                  : windowLabel,
              },
              { label: "khung trước", value: report.prevScanned, note: "so sánh cùng độ dài" },
              { label: "số từ hot", value: report.words.length, note: "đã lọc hư từ" },
              { label: "đáng săn nhất", value: report.top.length, note: "chỉ freebie thật & giá tốt" },
            ].map((m) => (
              <div key={m.label}>
                <div className="text-[11.5px] text-ink-500">{m.label}</div>
                <div className="mt-0.5 font-mono text-[19px] font-semibold tabular-nums text-ink-950">{m.value}</div>
                <div className="text-[11px] text-ink-400">{m.note}</div>
              </div>
            ))}
          </div>

          <div className="panel p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <span className="text-[13.5px] font-semibold text-ink-950">mây từ hot</span>
              <span className="text-[11.5px] text-ink-500">
                cỡ chữ = số lần nhắc sự kiện riêng · <Delta delta={totalDelta} /> là mức tăng giảm sự kiện so với khung trước
              </span>
            </div>
            {words.length === 0 ? (
              <div className="py-10 text-center text-[12.5px] text-ink-500">khung này chưa đủ dữ liệu</div>
            ) : (
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1.5 leading-none">
                {words.map((w) => {
                  const size = scale(w.n);
                  const hot = w.delta >= 2;
                  return (
                    <button
                      key={w.w}
                      type="button"
                      onMouseEnter={() => setHovered(w.w)}
                      onMouseLeave={() => setHovered(null)}
                      onClick={() => onSearchWord(w.w)}
                      title={`${w.w}: khung này ${w.n} lần, khung trước ${w.prev} lần (bấm để tìm)`}
                      className={
                        "rounded px-1.5 py-0.5 transition-all duration-150 hover:-translate-y-0.5 active:scale-95 " +
                        (hovered === w.w
                          ? "bg-brand-subtle text-accent"
                          : hot
                            ? "font-semibold text-ink-950"
                            : w.delta > 0
                              ? "text-ink-800"
                              : "text-ink-500")
                      }
                      style={{ fontSize: size + "px", fontWeight: size >= 22 ? 600 : 500 }}
                    >
                      {w.w}
                      {hot && <span className="ml-0.5 text-[10px] font-semibold text-deal">↑</span>}
                      <span className="ml-1 align-super font-mono text-[10px] font-normal text-ink-400">{w.n}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="grid min-w-0 gap-4 lg:grid-cols-2">
            <div className="panel min-w-0 p-5">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-[13.5px] font-semibold text-ink-950">độ hot theo loại</span>
                <span className="text-[11px] text-ink-400">bấm để tới phân loại tương ứng</span>
              </div>
              <div className="space-y-2">
                {report.categories.slice(0, 10).map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => onJumpCategory(c.key)}
                    className="group block w-full rounded-md px-1.5 py-1 text-left transition-colors hover:bg-surface-hover"
                  >
                    <div className="mb-1 flex items-center justify-between text-[12px]">
                      <span className="text-ink-700 transition-colors group-hover:text-accent">
                        {categoryLabelForKind(c.key, scope === "news" ? "news" : scope === "info" ? "info" : null)}
                      </span>
                      <span className="flex items-center gap-2">
                        <span className="font-mono tabular-nums text-ink-900">{c.n}</span>
                        <Delta delta={c.delta} />
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-ink-100">
                      <div
                        className="h-full rounded-full bg-brand transition-all duration-500 ease-out group-hover:bg-accent"
                        style={{ width: Math.round((c.n / catMax) * 100) + "%" }}
                      />
                    </div>
                  </button>
                ))}
                {!report.categories.length && <div className="text-[12.5px] text-ink-500">chưa có dữ liệu phân loại</div>}
              </div>
            </div>

            <div className="panel min-w-0 p-5">
              <div className="mb-3 flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-[13.5px] font-semibold text-ink-950">
                  <Sparkles size={13} className="text-deal" />
                  đáng săn nhất khung này
                </span>
                <span className="text-[11px] text-ink-500">chỉ hàng free & giá tốt · đã khử trùng</span>
              </div>
              <div className="divide-y divide-ink-100">
                {report.top.map((it, i) => (
                  <button
                    key={it.id}
                    type="button"
                    onClick={() => onOpenItem(it.id)}
                    className="flex w-full items-start gap-2.5 px-1 py-2 text-left transition-colors hover:bg-surface-hover"
                  >
                    <span className={"mt-0.5 w-4 shrink-0 font-mono text-[11px] " + (i < 3 ? "font-semibold text-deal" : "text-ink-400")}>
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium text-ink-900">{it.title}</span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-ink-500">
                        <span>{sourceName(it.source_id)}</span>
                        {it.category && <span>· {categoryLabelForKind(it.category, it.kind)}</span>}
                        {it.kind && it.kind !== "freebie" && <span>· {KIND_LABEL[it.kind] ?? it.kind}</span>}
                        {it.quality ? <span className="text-deal">· chất lượng {it.quality}</span> : null}
                        {(it.dupCount ?? 1) > 1 ? (
                          <span className="rounded bg-brand-subtle px-1 py-0.2 text-[10.5px] text-accent">
                            {it.dupCount} nguồn cùng đăng
                          </span>
                        ) : null}
                      </span>
                    </span>
                    <span className={"mt-0.5 shrink-0 font-mono text-[11px] tabular-nums " + (it.score >= 80 ? "font-semibold text-deal" : "text-ink-400")}>
                      {it.score}
                    </span>
                  </button>
                ))}
                {!report.top.length && (
                  <div className="flex flex-col items-center gap-2 py-8 text-center">
                    <Radar size={22} className="text-ink-300" />
                    <span className="text-[12.5px] text-ink-500">khung này chưa có freebie thật hay giá tốt</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {topNews.length > 0 && (
            <div className="panel min-w-0 p-5">
              <div className="mb-3 flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-[13.5px] font-semibold text-ink-950">
                  <Newspaper size={14} className="text-accent" />
                  tuyển chọn tin quan trọng & tin ngành
                </span>
                <span className="text-[11px] text-ink-500">đã gập theo cùng sự kiện, không trộn vào「đáng săn nhất」</span>
              </div>
              <div className="divide-y divide-ink-100">
                {topNews.map((it, i) => (
                  <button
                    key={it.id}
                    type="button"
                    onClick={() => onOpenItem(it.id)}
                    className="flex w-full items-start gap-2.5 px-1 py-2 text-left transition-colors hover:bg-surface-hover"
                  >
                    <span className="mt-0.5 w-4 shrink-0 font-mono text-[11px] text-ink-400">{i + 1}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium text-ink-900">{it.title}</span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-ink-500">
                        <span>{sourceName(it.source_id)}</span>
                        {it.kind && <span>· {KIND_LABEL[it.kind] ?? it.kind}</span>}
                        {it.category && <span>· {categoryLabelForKind(it.category, it.kind)}</span>}
                        {it.quality ? <span className="text-accent">· chất lượng {it.quality}</span> : null}
                        {(it.dupCount ?? 1) > 1 ? (
                          <span className="rounded bg-brand-subtle px-1 py-0.2 text-[10.5px] text-accent">
                            {it.dupCount} bài cùng sự kiện
                          </span>
                        ) : null}
                      </span>
                    </span>
                    <span className="mt-0.5 shrink-0 font-mono text-[11px] tabular-nums text-ink-400">{it.score}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="px-1 text-[11px] text-ink-400">
            phạm vi thống kê: mục status=active trong {windowLabel} chưa bị AI đánh giá nhiễu · cập nhật {timeAgo(report.to)}
          </div>
        </div>
      )}
    </div>
  );
}