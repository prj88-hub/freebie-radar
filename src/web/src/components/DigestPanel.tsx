import { useState } from "react";
import { CalendarDays, Loader2, Play, Sparkles } from "lucide-react";
import type { Item } from "../types.ts";
import { CompactRow } from "./ItemView.tsx";

export function DigestPanel({
  digests,
  detail,
  pickedDate,
  onPickDate,
  onRunDaily,
  onRunWeekly,
  canAdmin = true,
  sourceName,
  onPatch,
  onOpen,
  onQuickBlock,
  onCopyCode,
}: {
  digests: { date: string; created_at: string; pushed_at: string | null; kind: string; count: number }[];
  detail: {
    data: { date: string; text: string; count: number; created_at: string; pushed_at: string | null; items: Item[] } | null;
    loading: boolean;
    error: string | null;
  };
  pickedDate: string | null;
  onPickDate: (d: string) => void;
  onRunDaily: () => Promise<void>;
  onRunWeekly: () => Promise<void>;
  canAdmin?: boolean;
  sourceName: (id: string) => string;
  onPatch: (id: number, body: Record<string, unknown>) => void;
  onOpen: (item: Item) => void;
  onQuickBlock: (item: Item) => void;
  onCopyCode: (code: string) => void;
}) {
  const [running, setRunning] = useState(false);
  const [weeklyRunning, setWeeklyRunning] = useState(false);
  const active = pickedDate ?? digests[0]?.date ?? null;

  return (
    <div className="space-y-4">
      <div className="panel flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="flex flex-wrap items-center gap-1.5">
          {digests.map((d) => (
            <button
              key={d.date}
              type="button"
              onClick={() => onPickDate(d.date)}
              className={
                "rounded-lg border px-3 py-1.5 text-[12px] font-medium transition-colors " +
                (d.date === active
                  ? "border-brand bg-brand text-white"
                  : "border-ink-200 bg-surface text-ink-700 hover:bg-ink-100")
              }
            >
              {d.kind === "weekly" ? <span className="mr-1 text-[10.5px] opacity-80">tổng hợp tuần</span> : null}
              {d.date}
              {d.pushed_at ? <span className="ml-1.5 text-[11px] opacity-80">· đã push</span> : null}
            </button>
          ))}
          {!digests.length && <span className="text-[13px] text-ink-500">chưa từng tạo tuyển chọn ngày</span>}
        </div>

        {canAdmin && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={running}
              onClick={async () => {
                setRunning(true);
                try {
                  await onRunDaily();
                } finally {
                  setRunning(false);
                }
              }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3.5 py-2 text-[12.5px] font-medium text-white transition-colors hover:bg-brand-hover disabled:opacity-50"
            >
              {running ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
              tạo tuyển chọn hôm nay ngay
            </button>
            <button
              type="button"
              disabled={weeklyRunning}
              onClick={async () => {
                setWeeklyRunning(true);
                try {
                  await onRunWeekly();
                } finally {
                  setWeeklyRunning(false);
                }
              }}
              title="tổng hợp mục AI đánh giá freebie thật chưa hết hạn trong 7 ngày qua, kèm từ hot tuần & phân bố phân loại"
              className="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 bg-surface px-3 py-2 text-[12.5px] font-medium text-ink-700 transition-colors hover:bg-ink-100 disabled:opacity-50"
            >
              {weeklyRunning ? <Loader2 size={13} className="animate-spin" /> : <CalendarDays size={13} />}
              tạo tổng hợp tuần này
            </button>
          </div>
        )}
      </div>

      {!digests.length && (
        <div className="panel flex flex-col items-center gap-3 px-6 py-16 text-center">
          <Sparkles size={26} className="text-ink-400" />
          <div className="text-[14.5px] font-medium text-ink-900">chưa có bản tin ngày</div>
          <p className="max-w-md text-[12.5px] leading-relaxed text-ink-500">
            bấm「tạo tuyển chọn hôm nay ngay」góc phải trên, sẽ tạo tuyển chọn hôm nay theo giá, phân loại & điều kiện AI bạn đặt trong「rule push」và tự ghi lại.
          </p>
        </div>
      )}

      {detail.loading && <div className="panel p-6 text-[13px] text-ink-500">Đang tải bản tin ngày…</div>}
      {detail.error && (
        <div className="panel border-alert-border bg-alert-subtle p-4 text-[13px] text-alert">{detail.error}</div>
      )}

      {detail.data && (
        <>
          <div className="panel p-5">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-[13.5px]">
              <span className="font-semibold text-ink-950">{detail.data.date} tóm tắt tuyển chọn</span>
              <span className="text-[12px] text-ink-500">
                tổng {detail.data.count} tin · tạo lúc {detail.data.created_at.replace("T", " ").slice(5, 16)}
                {detail.data.pushed_at ? " · đã gửi Telegram" : " · chỉ ghi DB"}
              </span>
            </div>
            <pre className="mt-2 max-h-[240px] overflow-auto rounded-lg border border-ink-200 bg-surface-hover p-3.5 font-mono text-[12px] leading-relaxed whitespace-pre-wrap text-ink-700">
              {detail.data.text}
            </pre>
          </div>

          <div className="panel overflow-hidden">
            {detail.data.items.map((item) => (
              <CompactRow
                key={item.id}
                item={item}
                sourceName={sourceName}
                onPatch={onPatch}
                onOpen={onOpen}
                onQuickBlock={onQuickBlock}
                onCopyCode={onCopyCode}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
