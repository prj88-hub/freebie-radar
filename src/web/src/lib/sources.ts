import type { Source } from "../types.ts";

/**
 * 分类 / 形态 / 获取方式 / 频道的定义全部来自 shared/taxonomy.ts（服务端同一份），
 * 前端只做转发，避免主页、推送规则、数据源运维三处的分类表各写各的。
 */
export {
  CATEGORY_KEYS,
  CATEGORY_LABEL,
  CATEGORY_DESC,
  CATEGORY_GROUPS,
  NEWS_CATEGORY_LABEL,
  FREEBIE_CATEGORY_KEYS,
  CHANNELS,
  KIND_LABEL,
  KIND_ORDER,
  OBTAIN_LABEL,
  OBTAIN_HINT,
  OBTAIN_ORDER,
  categoriesForPreset,
  channelExcluded,
  categoryLabel,
  categoryLabelForPreset,
  categoryLabelForKind,
  categoryOptionGroups,
  isCategory,
} from "../../../shared/taxonomy.ts";

export type SourceGroupKey = "news" | "community" | "game" | "software" | "deals";

export const SOURCE_GROUPS: { key: SourceGroupKey; label: string }[] = [
  { key: "community", label: "cộng đồng & tin rò nội địa" },
  { key: "news", label: "tin quan trọng & tin ngành" },
  { key: "game", label: "game tặng free & giá thấp nhất" },
  { key: "software", label: "phần mềm · AI · mã nguồn mở" },
  { key: "deals", label: "tổng hợp freebie & ưu đãi" },
];

export function groupOfSource(s: Source): SourceGroupKey {
  const id = s.id;
  if (
    id.startsWith("cctv-") ||
    id.startsWith("rss-chinanews-") ||
    id.startsWith("rss-gnews-") ||
    id === "rss-bbc-zh" ||
    id === "rss-dw-cn" ||
    id === "rss-rfi-cn" ||
    id === "rss-nikkei-cn" ||
    id === "rss-voa-cn" ||
    id === "rss-wallstreetcn" ||
    id === "rss-qbitai" ||
    id === "rss-leiphone" ||
    id === "rss-tmtpost" ||
    id === "rss-ifanr" ||
    id === "rss-openai-blog" ||
    id === "rss-cloudflare-blog" ||
    id === "rss-ithome" ||
    id === "rss-sspai" ||
    id === "rss-ruanyifeng" ||
    id === "rss-hnrss" ||
    id === "rss-solidot" ||
    id === "rss-producthunt"
  ) {
    return "news";
  }
  if (
    id.startsWith("linuxdo-") ||
    id.startsWith("v2ex-") ||
    id.includes("nodeseek") ||
    id === "rss-deepflood" ||
    id === "rss-nodeloc" ||
    id === "rss-meta-appinn" ||
    id.endsWith("-search") ||
    id.startsWith("nga-") ||
    id === "tg-cn-deals"
  ) {
    return "community";
  }
  if (
    id === "epic-free" ||
    id === "steam-free" ||
    id.startsWith("gamerpower") ||
    id === "cheapshark-free" ||
    id === "gog-free" ||
    id === "tg-freegames" ||
    id === "bsky-gamedeals" ||
    /itad|isthereanydeal|indiegame|ggdeals|keylol|freegame|gamedeal|itch-free|freesteamkeys/i.test(id)
  ) {
    return "game";
  }
  if (
    id.startsWith("github-") ||
    id === "openrouter-free" ||
    id === "bsky-plugins" ||
    /shareware|tickcoupon|giveawayoftheday|ghxi|yxssp|freegroup|appinn|iplaysoft|iapps|apphookup|googleplay|freeebooks/i.test(
      id,
    )
  ) {
    return "software";
  }
  return "deals";
}

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "—";
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 1) return "vừa xong";
  if (m < 60) return m + " phút trước";
  const h = Math.round(m / 60);
  if (h < 24) return h + " giờ trước";
  const d = Math.round(h / 24);
  if (d < 30) return d + " ngày trước";
  return new Date(iso).toLocaleDateString("zh-CN");
}

export function expiresLabel(iso: string | null | undefined): { text: string; urgent: boolean } | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  const days = Math.ceil((t - Date.now()) / 86_400_000);
  if (days < 0) return { text: "đã hết hạn", urgent: true };
  if (days === 0) return { text: "hết hạn hôm nay", urgent: true };
  return { text: days + " ngày nữa hết hạn", urgent: days <= 3 };
}

/** 从标题里拆出方便点击快速屏蔽的候选词片段（中英分词的轻量替代）。 */
export function extractBlockCandidates(title: string): string[] {
  const parts = title
    .replace(/【[^】]+】|[[^]]+]/g, " ")
    .split(/[s|,，。：:；;!?！？/()（）·—-]+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 2 && s.length <= 16 && !/^d+$/.test(s));
  return [...new Set(parts)].slice(0, 8);
}

export function formatInterval(sec: number): string {
  if (sec < 120) return sec + " giây";
  if (sec < 3600) return Math.round(sec / 60) + " phút";
  return (sec / 3600).toFixed(sec % 3600 === 0 ? 0 : 1) + " giờ";
}
