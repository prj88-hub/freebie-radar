import { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  Ban,
  Check,
  ChevronDown,
  ChevronUp,
  Clock3,
  Copy,
  Eye,
  EyeOff,
  Languages,
  Loader2,
  ShieldAlert,
  Sparkles,
  Star,
  X,
} from "lucide-react";
import { KIND_LABEL, OBTAIN_HINT, OBTAIN_LABEL, categoryLabelForKind, expiresLabel, extractBlockCandidates, timeAgo } from "../lib/sources.ts";
import type { Item } from "../types.ts";
import { ItemClassificationEditor, type ClassificationPatch } from "./ItemClassificationEditor.tsx";

export function CodeChip({ code, onCopy }: { code: string; onCopy: (code: string) => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onCopy(code);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1400);
      }}
      className={
        "inline-flex max-w-[46vw] items-center gap-1 truncate rounded px-2 py-1 font-mono text-[11px] font-semibold transition-colors sm:max-w-none sm:py-0.5 " +
        (copied
          ? "bg-deal-subtle text-deal"
          : "bg-code-subtle text-code hover:bg-amber-200/70")
      }
      title="bấm để sao chép mã đổi quà"
    >
      {copied ? <Check size={11} /> : <Copy size={11} />}
      {code}
    </button>
  );
}

function PriceBadge({ item, inline = false }: { item: Item; inline?: boolean }) {
  if (item.is_free === 1 || item.price === 0) {
    return inline ? (
      <span className="shrink-0 text-[11.5px] font-semibold text-deal">miễn phí</span>
    ) : (
      <span className="inline-flex items-center rounded bg-deal-subtle px-1.5 py-0.5 text-[11px] font-semibold text-deal">
        miễn phí
      </span>
    );
  }
  if (typeof item.price === "number" && item.price > 0) {
    const label = item.price < 1 ? "<1 tệ" : Math.round(item.price) + " tệ trở xuống";
    return inline ? (
      <span className="shrink-0 text-[11.5px] font-semibold text-accent">{label}</span>
    ) : (
      <span className="inline-flex items-center rounded bg-brand-subtle px-1.5 py-0.5 text-[11px] font-semibold text-accent">
        {label}
      </span>
    );
  }
  return null;
}

const OBTAIN_STYLE: Record<string, string> = {
  conditional: "bg-code-subtle text-code",
  lottery: "bg-purple-50 text-purple-700",
  trial: "bg-sky-50 text-sky-700",
  promo: "bg-ink-100 text-ink-600",
  paid: "bg-ink-100 text-ink-600",
};

const OBTAIN_TEXT: Record<string, string> = {
  conditional: "text-code",
  lottery: "text-purple-700",
  trial: "text-sky-700",
  promo: "text-ink-500",
  paid: "text-ink-500",
};

/** 获取方式徽章：非 free 的一律标出来，避免抽奖/试用/推广混进「完全白嫖」。 */
const KIND_STYLE: Record<string, string> = {
  deal: "bg-amber-50 text-amber-700",
  opensource: "bg-emerald-50 text-emerald-700",
  news: "bg-rose-50 text-rose-700",
  info: "bg-sky-50 text-sky-700",
};

function KindBadge({ kind, category, inline = false }: { kind: string | null | undefined; category?: string | null; inline?: boolean }) {
  if (!kind || kind === "freebie" || kind === "noise") return null;
  // 网盘/网课资源本身是「资源分享」，分类标签已经说清内容性质；
  // kind 五类里没有资源形态，AI 只能落 info，再挂「行业资讯」就和「网盘资源」自相矛盾了
  if ((category === "pan" || category === "course") && (kind === "info" || kind === "news")) return null;
  const label = KIND_LABEL[kind];
  if (!label) return null;
  if (inline) {
    return (
      <span className={"shrink-0 rounded px-1.5 py-0.5 text-[10.5px] font-medium " + (KIND_STYLE[kind] ?? "bg-ink-100 text-ink-600")}>
        {label}
      </span>
    );
  }
  return (
    <span className={"inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium " + (KIND_STYLE[kind] ?? "bg-ink-100 text-ink-600")}>
      {label}
    </span>
  );
}

function ObtainBadge({ obtain, inline = false }: { obtain: string | null | undefined; inline?: boolean }) {
  const mode = obtain ?? "free";
  if (mode === "free") return null;
  if (inline) {
    return (
      <span
        className={"shrink-0 text-[11.5px] font-semibold " + (OBTAIN_TEXT[mode] ?? OBTAIN_TEXT.promo)}
        title={OBTAIN_HINT[mode] ?? ""}
      >
        {OBTAIN_LABEL[mode] ?? mode}
      </span>
    );
  }
  return (
    <span
      className={"inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium " + (OBTAIN_STYLE[mode] ?? OBTAIN_STYLE.promo)}
      title={OBTAIN_HINT[mode] ?? ""}
    >
      {OBTAIN_LABEL[mode] ?? mode}
    </span>
  );
}

/** 默认的精致紧凑列表行：在纯白面板里用 1px 细线分隔，扫货效率最高。 */
export function CompactRow({
  item,
  sourceName,
  selected,
  onPatch,
  onOpen,
  onQuickBlock,
  onToggleRelated,
  expanded,
  onCopyCode,
  showSummary = false,
}: {
  item: Item;
  sourceName: (id: string) => string;
  selected?: boolean;
  onPatch: (id: number, body: Record<string, unknown>) => void;
  onOpen: (item: Item) => void;
  onQuickBlock: (item: Item) => void;
  onCopyCode: (code: string) => void;
  /** 合并组：展开/收起同福利的其他来源 */
  onToggleRelated?: (id: number) => void;
  expanded?: boolean;
  showSummary?: boolean;
}) {
  const exp = expiresLabel(item.expires_at);
  const codes = Array.isArray(item.codes) ? item.codes : [];
  const matched = Array.isArray(item.matched) ? item.matched : [];
  const aiRejected = item.ai?.keep === false;
  const showPrice = item.kind !== "news" && item.kind !== "info";
  const topPick = !item.read && !aiRejected && ((item.ai?.quality ?? item.ai_quality ?? 0) >= 5 || item.score >= 88);

  return (
    <div
      onClick={() => onOpen(item)}
      data-read={item.read}
      className={
        "resource-row group grid cursor-pointer grid-cols-[auto_minmax(0,1fr)] items-start gap-x-2.5 gap-y-1.5 border-b border-ink-100 px-3.5 py-3 transition-colors last:border-b-0 sm:flex sm:items-center sm:gap-x-3 sm:gap-y-0 sm:px-6 sm:py-3 " +
        (selected ? "bg-surface-hover " : "hover:bg-surface-hover ") +
        (topPick ? "border-l-2 border-l-deal " : "")
      }
    >
      {/* 未读圆点 + 纯数字评分 */}
      <div className="flex shrink-0 items-center gap-2 pt-0.5 sm:pt-0">
        <span
          className={
            "h-[7px] w-[7px] rounded-full " +
            (item.read ? "border border-ink-300 bg-transparent" : "bg-accent")
          }
          title={item.read ? "đã đọc" : "chưa đọc"}
        />
        <span
          className={
            "w-7 text-right font-mono text-[12.5px] font-semibold tabular-nums " +
            (item.score >= 70
              ? "text-deal"
              : item.score >= 45
                ? "text-ink-700"
                : "text-ink-400")
          }
          title="điểm tổng hợp"
        >
          {Math.round(item.score)}
        </span>
      </div>

      {/* 主信息 */}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <button
            type="button"
            onClick={(event) => { event.stopPropagation(); onOpen(item); }}
            className={
              "row-title text-left [overflow-wrap:anywhere] text-[14px] leading-snug font-medium text-ink-950 transition-colors group-hover:text-accent " +
              (aiRejected ? "line-through decoration-ink-300 text-ink-500" : "")
            }
          >
            {item.title}
          </button>
          <KindBadge kind={item.kind} category={item.category} inline />
          {showPrice && <PriceBadge item={item} inline />}
          {showPrice && <ObtainBadge obtain={item.obtain} inline />}
          {matched.length > 0 && (
            <span className="rounded bg-code-subtle px-1.5 py-0.5 text-[11px] font-medium text-code">
              trúng: {matched.join("/")}
            </span>
          )}
          {(item.dupCount ?? 1) > 1 && (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onToggleRelated?.(item.id);
              }}
              title="cùng một freebie được nhiều nguồn đăng, bấm xem tất cả nguồn"
              className="rounded bg-brand-subtle px-1.5 py-0.5 text-[11px] font-medium text-accent hover:bg-ink-200/70"
            >
              {expanded ? "Thu gọn" : `${item.dupCount} nguồn`}
            </button>
          )}
          {item.blockedBy && (
            <span className="rounded bg-alert-subtle px-1.5 py-0.5 text-[11px] text-alert">
              chặn: {item.blockedBy}
            </span>
          )}
        </div>

        <div className="row-meta mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[12px] text-ink-500">
          <span className="font-medium text-ink-700">{sourceName(item.source_id)}</span>
          <span aria-hidden="true">·</span>
          <span>{categoryLabelForKind(item.category, item.kind)}</span>
          {exp && (
            <>
              <span aria-hidden="true">·</span>
              <span className={exp.urgent ? "font-medium text-code" : "text-ink-500"}>
                {exp.text}
              </span>
            </>
          )}
          <span aria-hidden="true" className="sm:hidden">·</span>
          <span className="tabular-nums text-ink-400 sm:hidden">
            {timeAgo(item.published_at ?? item.first_seen_at)}
          </span>
        </div>
        {showSummary && item.ai?.reason && <p title={item.ai.reason} className="row-summary mt-1 text-[12px] leading-relaxed text-ink-500">{item.ai.reason}</p>}
      </div>

      {/* 右端：兑换码 & 快捷操作 & 相对时间 */}
      <div
        className="col-span-2 flex w-full items-center justify-between gap-2 sm:col-span-1 sm:w-auto sm:shrink-0 sm:justify-end"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-1.5">
          {codes.slice(0, 2).map((code) => (
            <CodeChip key={code} code={code} onCopy={onCopyCode} />
          ))}
        </div>
        <div className="row-actions flex items-center gap-0.5 transition-opacity sm:opacity-70 sm:group-hover:opacity-100 sm:focus-within:opacity-100">
          <a
            href={item.url}
            target="_blank"
            rel="noreferrer noopener"
            onClick={() => {
              if (!item.read) onPatch(item.id, { read: true });
            }}
            className="rounded-md p-2 text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-950 sm:p-1.5"
            title="mở bài gốc trong tab mới"
          >
            <ArrowUpRight size={15} />
          </a>
          <button
            type="button"
            onClick={() => onPatch(item.id, { starred: !item.starred })}
            className={
              "rounded-md p-2 transition-colors hover:bg-ink-100 sm:p-1.5 " +
              (item.starred ? "text-code" : "text-ink-400 hover:text-ink-800")
            }
            title={item.starred ? "Bỏ lưu" : "Lưu"}
          >
            <Star size={14} fill={item.starred ? "currentColor" : "none"} />
          </button>
          <button
            type="button"
            onClick={() => onQuickBlock(item)}
            className="rounded-md p-2 text-ink-400 transition-colors hover:bg-alert-subtle hover:text-alert sm:p-1.5"
            title="thêm vào từ chặn / chặn"
          >
            <Ban size={14} />
          </button>
          <button
            type="button"
            onClick={() => onPatch(item.id, { status: item.status === "ignored" ? "active" : "ignored" })}
            className="rounded-md p-2 text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-800 sm:p-1.5"
            title={item.status === "ignored" ? "khôi phục về danh sách" : "không muốn xem, xoá khỏi danh sách (có thể tìm lại ở「đã đóng」)"}
          >
            {item.status === "ignored" ? <Eye size={14} /> : <EyeOff size={14} />}
          </button>
        </div>
        <span className="hidden w-14 text-right font-mono text-[11.5px] tabular-nums text-ink-400 sm:inline-block">
          {timeAgo(item.published_at ?? item.first_seen_at)}
        </span>
      </div>
    </div>
  );
}

function CoverImage({
  src,
  className = "",
  children,
}: {
  src: string | null | undefined;
  className?: string;
  children?: React.ReactNode;
}) {
  const [broken, setBroken] = useState(false);
  useEffect(() => {
    setBroken(false);
  }, [src]);

  if (!src || broken) return null;
  return (
    <div className={"relative overflow-hidden bg-ink-100 " + className}>
      <img
        src={src}
        alt=""
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setBroken(true)}
        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
      />
      {children}
    </div>
  );
}

/** 网格卡片视图（支持 2列 / 3列与封面图，无图条目保持紧凑纯文字卡片） */
export function ItemCard({
  item,
  sourceName,
  onPatch,
  onOpen,
  onQuickBlock,
  onCopyCode,
  onToggleRelated,
  expanded,
  relatedItems,
}: {
  item: Item;
  sourceName: (id: string) => string;
  onPatch: (id: number, body: Record<string, unknown>) => void;
  onOpen: (item: Item) => void;
  onQuickBlock: (item: Item) => void;
  onCopyCode: (code: string) => void;
  onToggleRelated?: (id: number) => void;
  expanded?: boolean;
  relatedItems?: (Item & { sourceName?: string })[];
}) {
  const exp = expiresLabel(item.expires_at);
  const codes = Array.isArray(item.codes) ? item.codes : [];
  const matched = Array.isArray(item.matched) ? item.matched : [];
  const aiRejected = item.ai?.keep === false;
  const [imgBroken, setImgBroken] = useState(false);
  useEffect(() => {
    setImgBroken(false);
  }, [item.image_url]);
  const hasImage = Boolean(item.image_url && !imgBroken);

  return (
    <article
      onClick={() => onOpen(item)}
      className={
        "panel group flex h-full cursor-pointer flex-col overflow-hidden transition-all hover:border-ink-300 hover:shadow-sm " +
        (item.read ? "opacity-65 hover:opacity-100" : "")
      }
    >
      {hasImage && (
        <div className="relative aspect-[16/9] w-full overflow-hidden border-b border-ink-100 bg-ink-100">
          <img
            src={item.image_url!}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setImgBroken(true)}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
          <span
            className={
              "absolute top-2.5 right-2.5 rounded-md px-2 py-0.5 font-mono text-[11.5px] font-semibold tabular-nums backdrop-blur-sm " +
              (item.score >= 70 ? "bg-deal/90 text-white" : "bg-ink-950/75 text-white")
            }
          >
            {Math.round(item.score)}
          </span>
        </div>
      )}

      <div className="flex flex-1 flex-col p-3.5 sm:p-4">
        <div className="mb-1.5 flex items-start justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-[11.5px] text-ink-500">
            <span
              className={
                "h-[6px] w-[6px] shrink-0 rounded-full " +
                (item.read ? "border border-ink-300 bg-transparent" : "bg-accent")
              }
              title={item.read ? "đã đọc" : "chưa đọc"}
            />
            <span className="truncate font-medium text-ink-700">{sourceName(item.source_id)}</span>
            {item.category && (
              <>
                <span aria-hidden="true">·</span>
                <span>{categoryLabelForKind(item.category, item.kind)}</span>
              </>
            )}
            <KindBadge kind={item.kind} category={item.category} />
            {item.kind !== "news" && item.kind !== "info" && <PriceBadge item={item} />}
            {item.kind !== "news" && item.kind !== "info" && <ObtainBadge obtain={item.obtain} />}
          </div>
          {!hasImage && (
            <span
              className={
                "shrink-0 rounded bg-ink-100 px-1.5 py-0.5 font-mono text-[12px] font-semibold tabular-nums " +
                (item.score >= 70 ? "text-deal" : "text-ink-600")
              }
            >
              {Math.round(item.score)}
            </span>
          )}
        </div>

        <h3
          className={
            "line-clamp-2 text-[14.5px] leading-snug font-semibold text-ink-950 transition-colors group-hover:text-accent " +
            (aiRejected ? "line-through decoration-ink-300 text-ink-500" : "")
          }
        >
          {item.title}
        </h3>

        {item.summary && (
          <p className="mt-1.5 line-clamp-2 text-[12.5px] leading-relaxed text-ink-600">{item.summary}</p>
        )}

        {(matched.length > 0 || codes.length > 0 || item.ai?.reason || (item.dupCount ?? 1) > 1) && (
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-[11px]" onClick={(e) => e.stopPropagation()}>
            {matched.length > 0 && (
              <span className="rounded bg-code-subtle px-1.5 py-0.5 font-medium text-code">
                trúng: {matched.join("/")}
              </span>
            )}
            {codes.slice(0, 2).map((code) => (
              <CodeChip key={code} code={code} onCopy={onCopyCode} />
            ))}
            {(item.dupCount ?? 1) > 1 && (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onToggleRelated?.(item.id);
                }}
                title="cùng một freebie được nhiều nguồn đăng, bấm xem tất cả nguồn"
                className="rounded bg-brand-subtle px-1.5 py-0.5 font-medium text-accent hover:bg-ink-200/70"
              >
                {expanded ? "Thu gọn" : `${item.dupCount} nguồn`}
              </button>
            )}
            {item.ai?.reason && (
              <span className={"line-clamp-1 " + (item.ai.keep === false ? "text-ink-400" : "text-deal")}>
                {item.ai.reason}
              </span>
            )}
          </div>
        )}

        <div
          className="mt-auto flex items-center justify-between gap-2 border-t border-ink-100 pt-2.5 text-[11.5px] text-ink-400"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex min-w-0 items-center gap-2">
            <span className="tabular-nums">{timeAgo(item.published_at ?? item.first_seen_at)}</span>
            {exp && (
              <span className={"inline-flex items-center gap-1 truncate " + (exp.urgent ? "font-medium text-code" : "")}>
                <Clock3 size={11} /> {exp.text}
              </span>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            <a
              href={item.url}
              target="_blank"
              rel="noreferrer noopener"
              onClick={() => {
                if (!item.read) onPatch(item.id, { read: true });
              }}
              className="rounded-md p-1.5 text-ink-400 hover:bg-ink-100 hover:text-ink-950"
              title="Mở bài gốc"
            >
              <ArrowUpRight size={14} />
            </a>
            <button
              type="button"
              onClick={() => onPatch(item.id, { starred: !item.starred })}
              className={
                "rounded-md p-1.5 hover:bg-ink-100 " +
                (item.starred ? "text-amber-500" : "text-ink-400 hover:text-ink-800")
              }
              title={item.starred ? "Bỏ lưu" : "Lưu"}
            >
              <Star size={14} fill={item.starred ? "currentColor" : "none"} />
            </button>
            <button
              type="button"
              onClick={() => onQuickBlock(item)}
              className="rounded-md p-1.5 text-ink-400 hover:bg-alert-subtle hover:text-alert"
              title="chặn"
            >
              <Ban size={14} />
            </button>
            <button
              type="button"
              onClick={() => onPatch(item.id, { status: item.status === "ignored" ? "active" : "ignored" })}
              className="rounded-md p-1.5 text-ink-400 hover:bg-ink-100 hover:text-ink-800"
              title={item.status === "ignored" ? "khôi phục về danh sách" : "không muốn xem, xoá khỏi danh sách (có thể tìm lại ở「đã đóng」)"}
            >
              <EyeOff size={14} />
            </button>
          </div>
        </div>

        {expanded && relatedItems && relatedItems.length > 0 && (
          <div
            className="pop-enter mt-2.5 rounded-lg border border-ink-100 bg-surface-hover p-2.5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-1 text-[11px] font-medium text-ink-500">
              {relatedItems.length} nguồn khác cùng đăng
            </div>
            <ul className="space-y-1">
              {relatedItems.map((r) => (
                <li key={r.id} className="flex items-center gap-2 text-[11.5px]">
                  <span className="w-20 shrink-0 truncate text-ink-500">{r.sourceName ?? r.source_id}</span>
                  <a
                    href={r.url}
                    target="_blank"
                    rel="noreferrer"
                    className="truncate text-ink-700 hover:text-accent hover:underline"
                  >
                    {r.title}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </article>
  );
}

/** 右侧滑出详情抽屉（按 Esc 关闭，↑/↓ 可在列表上下切换） */
export function ItemDetailDrawer({
  item,
  sourceName,
  hasPrev,
  hasNext,
  onPrev,
  onNext,
  onClose,
  onPatch,
  onQuickBlock,
  onCopyCode,
  loading = false,
  error = null,
  onRetry,
  onClassificationSave,
}: {
  item: Item;
  sourceName: (id: string) => string;
  hasPrev: boolean;
  hasNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
  onPatch: (id: number, body: Record<string, unknown>) => void;
  onQuickBlock: (item: Item) => void;
  onCopyCode: (code: string) => void;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  onClassificationSave?: (id: number, patch: ClassificationPatch) => Promise<void>;
}) {
  const exp = expiresLabel(item.expires_at);
  const codes = Array.isArray(item.codes) ? item.codes : [];
  const [translation, setTranslation] = useState<{ title: string; summary: string; content: string; model: string; cached: boolean } | null>(null);
  const [trBusy, setTrBusy] = useState(false);
  const [trError, setTrError] = useState<string | null>(null);
  const [showTr, setShowTr] = useState(false);
  useEffect(() => {
    setTranslation(null); setTrError(null); setShowTr(false); setTrBusy(false);
  }, [item.id]);
  const doTranslate = async () => {
    if (translation) { setShowTr((v) => !v); return; }
    setTrBusy(true); setTrError(null);
    try {
      const res = await fetch(`/api/items/${item.id}/translate`, { method: "POST" });
      const data = (await res.json().catch(() => null)) as { title?: string; summary?: string; content?: string; model?: string; cached?: boolean; error?: string } | null;
      if (!res.ok || !data || data.error) { setTrError(data?.error ?? `dịch thất bại (HTTP ${res.status})`); return; }
      setTranslation({ title: data.title ?? "", summary: data.summary ?? "", content: data.content ?? "", model: data.model ?? "", cached: Boolean(data.cached) });
      setShowTr(true);
    } catch {
      setTrError("không gọi được máy chủ");
    } finally {
      setTrBusy(false);
    }
  };
  const dialogRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus();
    return () => { document.body.style.overflow = overflow; previous?.focus(); };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (e.key === "Tab" && dialogRef.current) {
        const controls = Array.from(dialogRef.current.querySelectorAll<HTMLElement>("button:not(:disabled), a[href], input, select, textarea, [tabindex='0']"));
        const first = controls[0], last = controls[controls.length - 1];
        if (e.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowUp" && hasPrev) {
        e.preventDefault();
        onPrev();
      }
      if (e.key === "ArrowDown" && hasNext) {
        e.preventDefault();
        onNext();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, hasPrev, hasNext, onPrev, onNext]);

  return (
    <div className="backdrop-enter fixed inset-0 z-50 flex justify-end bg-ink-950/25 backdrop-blur-[1px]" onClick={onClose}>
      <aside
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Chi tiết tài nguyên"
        tabIndex={-1}
        className="drawer-enter drawer-shadow flex h-full w-full flex-col border-ink-200 bg-surface sm:max-w-[500px] sm:border-l"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 顶栏 */}
        <div className="flex items-center justify-between border-b border-ink-100 px-4 py-3 sm:px-5 sm:py-3.5">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={!hasPrev}
              onClick={onPrev}
              className="rounded-lg border border-ink-200 p-1.5 text-ink-600 hover:bg-ink-100 disabled:opacity-30"
              title="tin trước (↑)"
            >
              <ChevronUp size={14} />
            </button>
            <button
              type="button"
              disabled={!hasNext}
              onClick={onNext}
              className="rounded-lg border border-ink-200 p-1.5 text-ink-600 hover:bg-ink-100 disabled:opacity-30"
              title="tin sau (↓)"
            >
              <ChevronDown size={14} />
            </button>
            <span className="ml-2 text-[12px] text-ink-500">{sourceName(item.source_id)}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-ink-500 hover:bg-ink-100 hover:text-ink-900"
            title="đóng (Esc)"
          >
            <X size={16} />
          </button>
        </div>

        {/* 内容区 */}
        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-5 sm:py-5">
          {loading && <p role="status" className="text-[12px] text-ink-500">Đang tải toàn văn…</p>}
          {error && <div role="alert" className="rounded-lg border border-alert-border bg-alert-subtle p-3 text-[12px] text-alert">{error} <button type="button" onClick={onRetry} className="ml-2 underline">Thử lại</button></div>}
          <CoverImage src={item.image_url} className="aspect-[16/9] w-full rounded-lg border border-ink-100" />
          <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
            <KindBadge kind={item.kind} category={item.category} />
            {item.category && (
              <span className="rounded bg-brand-subtle px-2 py-0.5 font-medium text-accent">
                {categoryLabelForKind(item.category, item.kind)}
              </span>
            )}
            {item.kind !== "news" && item.kind !== "info" && <PriceBadge item={item} />}
            {item.kind !== "news" && item.kind !== "info" && <ObtainBadge obtain={item.obtain} />}
            <span className="rounded bg-ink-100 px-2 py-0.5 font-mono text-ink-700">
              điểm {Math.round(item.score)}
            </span>
            {exp && (
              <span className={"inline-flex items-center gap-1 " + (exp.urgent ? "font-medium text-amber-700" : "text-ink-500")}>
                <Clock3 size={11} /> {exp.text}
              </span>
            )}
          </div>

          <h2 className="text-[17px] leading-snug font-semibold text-ink-950">{item.title}</h2>
          {onClassificationSave && item.manualClassification !== undefined && !loading && !error && <ItemClassificationEditor key={item.id} item={item} onSave={onClassificationSave} />}

          {showTr && translation && (
            <div className="rounded-lg border border-brand/40 bg-brand-subtle/60 p-3.5">
              <div className="mb-2 flex items-center justify-between gap-2 text-[12px] font-medium text-accent">
                <span className="inline-flex items-center gap-1"><Languages size={12} /> bản dịch tiếng Việt · AI {translation.model}{translation.cached ? " · cache" : ""}</span>
                <button type="button" onClick={() => setShowTr(false)} className="shrink-0 text-ink-500 hover:text-ink-800">ẩn</button>
              </div>
              {translation.title && <p className="text-[14px] font-semibold leading-snug text-ink-950">{translation.title}</p>}
              {translation.summary && <p className="mt-2 text-[13px] leading-relaxed whitespace-pre-wrap text-ink-700">{translation.summary}</p>}
              {translation.content && translation.content !== translation.summary && (
                <p className="mt-2 max-h-[220px] overflow-auto text-[12.5px] leading-relaxed whitespace-pre-wrap text-ink-600">{translation.content}</p>
              )}
            </div>
          )}
          {trError && <div role="alert" className="rounded-lg border border-alert-border bg-alert-subtle p-3 text-[12px] text-alert">{trError}</div>}

          {item.ai?.reason && (
            <div
              className={
                "flex items-center gap-2 rounded-lg border px-3.5 py-2.5 text-[12.5px] " +
                (item.ai.keep === false
                  ? "border-ink-200 bg-ink-100/70 text-ink-600"
                  : "border-deal-border bg-deal-subtle/70 text-emerald-900")
              }
            >
              <Sparkles size={14} className={item.ai.keep === false ? "text-ink-500" : "text-deal"} />
              <span>
                <strong>{item.manualClassification ? "giải thích AI gốc:" : "AI đánh giá:"}</strong>
                {!item.manualClassification && (item.ai.keep === false
                  ? "giá trị thấp/bài rác · "
                  : item.kind === "news"
                    ? "tin quan trọng · "
                    : item.kind === "info"
                      ? "tin ngành · "
                      : item.kind === "opensource"
                        ? "dự án mã nguồn mở · "
                        : item.kind === "deal"
                          ? "giá tốt · "
                          : "freebie có thể nhận · ")}
                {item.ai.reason}
              </span>
            </div>
          )}

          {codes.length > 0 && (
            <div className="rounded-lg border border-code-border bg-code-subtle/70 p-3.5">
              <div className="mb-2 text-[12px] font-medium text-amber-900">mã đổi quà trích được (bấm để sao chép)</div>
              <div className="flex flex-wrap gap-2">
                {codes.map((code) => (
                  <CodeChip key={code} code={code} onCopy={onCopyCode} />
                ))}
              </div>
            </div>
          )}

          {item.summary && (
            <div>
              <div className="mb-1 text-[12px] font-medium text-ink-500">tóm tắt</div>
              <p className="text-[13.5px] leading-relaxed whitespace-pre-wrap text-ink-700">{item.summary}</p>
            </div>
          )}

          {item.content && item.content !== item.summary && (
            <div className="rounded-lg border border-ink-200 bg-surface-hover p-3.5">
              <div className="mb-1.5 text-[12px] font-medium text-ink-500">snapshot nội dung (bài gốc bị xoá vẫn còn lưu)</div>
              <p className="max-h-[260px] overflow-auto text-[12.5px] leading-relaxed whitespace-pre-wrap text-ink-700">
                {item.content}
              </p>
            </div>
          )}

          <dl className="grid grid-cols-2 gap-3 rounded-lg border border-ink-200 bg-surface-hover p-3.5 text-[12px]">
            <div>
              <dt className="text-ink-500">thời gian đăng</dt>
              <dd className="mt-0.5 font-mono text-ink-900">
                {item.published_at ? item.published_at.replace("T", " ").slice(0, 19) : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-ink-500">thời hạn</dt>
              <dd className="mt-0.5 font-mono text-ink-900">
                {item.expires_at ? item.expires_at.replace("T", " ").slice(0, 19) : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-ink-500">thời gian thu</dt>
              <dd className="mt-0.5 font-mono text-ink-900">{item.first_seen_at.replace("T", " ").slice(0, 19)}</dd>
            </div>
            <div>
              <dt className="text-ink-500">ID nguồn</dt>
              <dd className="mt-0.5 truncate font-mono text-ink-700">{item.source_id}</dd>
            </div>
          </dl>

          {item.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {item.tags.map((t) => (
                <span key={t} className="rounded-md bg-ink-100 px-2 py-0.5 font-mono text-[11px] text-ink-600">
                  #{t}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* 底部动作栏 */}
        <div className="flex flex-wrap items-center gap-2 border-t border-ink-100 bg-surface-hover px-4 py-3 sm:px-5 sm:py-3.5">
          <a
            href={item.url}
            target="_blank"
            rel="noreferrer noopener"
            onClick={() => {
              if (!item.read) onPatch(item.id, { read: true });
            }}
            className="inline-flex min-w-full flex-1 items-center justify-center gap-1.5 rounded-lg bg-brand px-4 py-2.5 text-[13px] font-medium text-white transition-colors hover:bg-brand-hover sm:min-w-0 sm:py-2"
          >
            {item.kind === "news" || item.kind === "info" ? "xem chi tiết bài gốc" : "mở bài gốc để nhận"} <ArrowUpRight size={14} />
          </a>
          <button
            type="button"
            onClick={() => onPatch(item.id, { starred: !item.starred })}
            className={
              "inline-flex grow basis-[calc(50%-0.25rem)] items-center justify-center gap-1 rounded-lg border px-3 py-2.5 text-[13px] transition-colors sm:grow-0 sm:basis-auto sm:py-2 " +
              (item.starred
                ? "border-amber-300 bg-code-subtle text-amber-800"
                : "border-ink-200 bg-surface text-ink-700 hover:bg-ink-100")
            }
          >
            <Star size={14} fill={item.starred ? "currentColor" : "none"} /> {item.starred ? "đã lưu" : "Lưu"}
          </button>
          <button
            type="button"
            onClick={() => onPatch(item.id, { read: !item.read })}
            className="inline-flex grow basis-[calc(50%-0.25rem)] items-center justify-center gap-1 rounded-lg border border-ink-200 bg-surface px-3 py-2.5 text-[13px] text-ink-700 hover:bg-ink-100 sm:grow-0 sm:basis-auto sm:py-2"
          >
            <Eye size={14} /> {item.read ? "đánh dấu chưa đọc" : "đánh dấu đã đọc"}
          </button>
          <button
            type="button"
            onClick={() => void doTranslate()}
            disabled={trBusy}
            className="inline-flex grow basis-[calc(50%-0.25rem)] items-center justify-center gap-1 rounded-lg border border-ink-200 bg-surface px-3 py-2.5 text-[13px] text-ink-700 hover:bg-ink-100 disabled:opacity-50 sm:grow-0 sm:basis-auto sm:py-2"
            title="dịch bài này sang tiếng Việt bằng engine AI đã cấu hình"
          >
            {trBusy ? <Loader2 size={14} className="animate-spin" /> : <Languages size={14} />}
            {trBusy ? "đang dịch…" : translation ? (showTr ? "ẩn bản dịch" : "xem bản dịch") : "Dịch"}
          </button>
          <button
            type="button"
            onClick={() => {
              onClose();
              onQuickBlock(item);
            }}
            className="inline-flex grow basis-[calc(50%-0.25rem)] items-center justify-center gap-1 rounded-lg border border-alert-border bg-alert-subtle px-3 py-2.5 text-[13px] text-alert hover:bg-red-100/80 sm:grow-0 sm:basis-auto sm:py-2"
          >
            <ShieldAlert size={14} /> chặn
          </button>
          <button
            type="button"
            onClick={() => {
              onPatch(item.id, { status: "ignored" });
              onClose();
            }}
            className="inline-flex grow basis-[calc(50%-0.25rem)] items-center justify-center gap-1 rounded-lg border border-ink-200 bg-surface px-3 py-2.5 text-[13px] text-ink-700 hover:bg-ink-100 sm:grow-0 sm:basis-auto sm:py-2"
            title="chỉ là không muốn xem, không thêm từ chặn"
          >
            <EyeOff size={14} /> đóng
          </button>
        </div>
      </aside>
    </div>
  );
}

/** 快捷屏蔽弹窗 */
export function QuickBlockModal({
  item,
  sourceName,
  onClose,
  onIgnoreOne,
  onAddRule,
}: {
  item: Item;
  sourceName: (id: string) => string;
  onClose: () => void;
  onIgnoreOne: (id: number) => void;
  onAddRule: (pattern: string, scope: string) => Promise<void>;
}) {
  const candidates = extractBlockCandidates(item.title);
  const [pattern, setPattern] = useState(candidates[0] ?? "");
  const [scope, setScope] = useState("all");
  const [busy, setBusy] = useState(false);

  return (
    <div
      className="backdrop-enter fixed inset-0 z-50 flex items-end justify-center bg-ink-950/30 backdrop-blur-[1px] sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="sheet-enter sm:pop-enter panel max-h-[90vh] w-full max-w-md overflow-y-auto rounded-b-none rounded-t-xl p-4 sm:rounded-xl sm:p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-[14.5px] font-semibold text-ink-950">
            <ShieldAlert size={16} className="text-alert" /> xử lý chặn
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-ink-500 hover:bg-ink-100">
            <X size={15} />
          </button>
        </div>

        <p className="mb-3 line-clamp-2 rounded-lg border border-ink-200 bg-surface-hover p-2.5 text-[12.5px] text-ink-700">
          {item.title}
        </p>

        <div className="space-y-3">
          <div>
            <div className="mb-1.5 text-[12px] text-ink-500">chọn từ khoá trong tiêu đề để chặn nhanh:</div>
            <div className="flex flex-wrap gap-1.5">
              {candidates.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setPattern(c)}
                  className={
                    "rounded-lg border px-2 py-1 text-[12px] transition-colors " +
                    (pattern === c
                      ? "border-alert-border bg-alert-subtle font-medium text-alert"
                      : "border-ink-200 bg-surface text-ink-700 hover:bg-ink-100")
                  }
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-[12px] text-ink-500">
              từ khoá chặn (mục cũ lẫn mới trúng từ này đều ẩn, và không push Telegram)
            </label>
            <input
              value={pattern}
              onChange={(e) => setPattern(e.target.value)}
              placeholder="nhập từ khoá cần chặn…"
              className="w-full rounded-lg border border-ink-200 bg-surface px-3 py-2 text-[13px] text-ink-950 outline-none focus:border-brand"
            />
          </div>

          <div className="flex flex-col gap-2 text-[12px] sm:flex-row">
            {[
              { key: "all", label: "chặn tất cả nguồn" },
              { key: item.source_id, label: "Chỉ áp dụng cho「" + sourceName(item.source_id) + "」có hiệu lực" },
            ].map((o) => (
              <button
                key={o.key}
                type="button"
                onClick={() => setScope(o.key)}
                className={
                  "flex-1 truncate rounded-lg border px-2.5 py-2.5 text-left transition-colors sm:py-2 " +
                  (scope === o.key
                    ? "border-alert-border bg-alert-subtle font-medium text-alert"
                    : "border-ink-200 text-ink-600 hover:bg-ink-100")
                }
              >
                {o.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 pb-[env(safe-area-inset-bottom)]">
            <button
              type="button"
              onClick={() => {
                onIgnoreOne(item.id);
                onClose();
              }}
              className="rounded-lg border border-ink-200 px-3 py-2 text-[12.5px] text-ink-600 hover:bg-ink-100"
            >
              chỉ ẩn mục này
            </button>
            <button
              type="button"
              disabled={!pattern.trim() || busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await onAddRule(pattern.trim(), scope);
                  onClose();
                } finally {
                  setBusy(false);
                }
              }}
              className="rounded-lg bg-alert px-4 py-2 text-[12.5px] font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-40"
            >
              thêm vào rule chặn
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
