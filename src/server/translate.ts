import { createHash } from "node:crypto";
import { get, run } from "./db.ts";
import { aiReady, getAiSettings, type AiSettings } from "./enrich/ai.ts";

const TARGET_LANG = "vi";

export type ItemTranslation = {
  title: string;
  summary: string;
  content: string;
  model: string;
  cached: boolean;
  createdAt: string;
};

type TranslationRow = {
  src_hash: string;
  title: string;
  summary: string;
  content: string;
  model: string;
  created_at: string;
};

function srcHash(title: string, summary: string, content: string): string {
  return createHash("sha256").update(title + "\n" + summary + "\n" + content).digest("hex").slice(0, 16);
}

export function getCachedTranslation(itemId: number, lang = TARGET_LANG): ItemTranslation | null {
  const row = get<TranslationRow>(
    "SELECT src_hash, title, summary, content, model, created_at FROM item_translations WHERE item_id = ? AND lang = ?",
    itemId,
    lang,
  );
  return row
    ? { title: row.title, summary: row.summary, content: row.content, model: row.model, cached: true, createdAt: row.created_at }
    : null;
}

/** 复用管理后台配好的 OpenAI 兼容端点，把条目标题/摘要/正文翻成越南语；src_hash 命中直接回缓存，不再花 AI 额度。 */
export async function translateItem(
  item: { id: number; title: string; summary?: string | null; content?: string | null },
  lang = TARGET_LANG,
): Promise<ItemTranslation> {
  const title = item.title ?? "";
  const summary = item.summary ?? "";
  const content = item.content ?? "";
  const hash = srcHash(title, summary, content);
  const cached = get<TranslationRow>(
    "SELECT src_hash, title, summary, content, model, created_at FROM item_translations WHERE item_id = ? AND lang = ?",
    item.id,
    lang,
  );
  if (cached && cached.src_hash === hash) {
    return { title: cached.title, summary: cached.summary, content: cached.content, model: cached.model, cached: true, createdAt: cached.created_at };
  }

  const s = getAiSettings();
  if (!aiReady(s)) throw new Error("AI chưa cấu hình — vào trang「engine AI」đặt model trước");

  const payload = { title: title.slice(0, 300), summary: summary.slice(0, 2000), content: content.slice(0, 4000) };
  const out = await chatTranslate(payload, s);
  const now = new Date().toISOString();
  run(
    `INSERT INTO item_translations(item_id, lang, src_hash, title, summary, content, model, created_at)
     VALUES(?,?,?,?,?,?,?,?)
     ON CONFLICT(item_id, lang) DO UPDATE SET
       src_hash=excluded.src_hash, title=excluded.title, summary=excluded.summary,
       content=excluded.content, model=excluded.model, created_at=excluded.created_at`,
    item.id, lang, hash, out.title, out.summary, out.content, s.model, now,
  );
  return { ...out, model: s.model, cached: false, createdAt: now };
}

async function chatTranslate(
  payload: { title: string; summary: string; content: string },
  s: AiSettings,
): Promise<{ title: string; summary: string; content: string }> {
  const endpoint = s.baseUrl.replace(/\/+$/, "") + "/chat/completions";
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), s.timeoutSec * 1000);
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(s.apiKey ? { authorization: "Bearer " + s.apiKey } : {}),
      },
      body: JSON.stringify({
        model: s.model,
        temperature: 0,
        messages: [
          {
            role: "system",
            content:
              "Bạn là dịch giả công nghệ. Dịch các trường trong JSON đầu vào sang tiếng Việt tự nhiên, dễ hiểu. " +
              'Chỉ trả về đúng một object JSON {"title":"...","summary":"...","content":"..."}, không thêm lời dẫn hay giải thích. ' +
              "Giữ nguyên mã code, coupon code, link, tên riêng, tên sản phẩm. Trường nào rỗng thì trả chuỗi rỗng.",
          },
          { role: "user", content: JSON.stringify(payload) },
        ],
      }),
      signal: ac.signal,
    });
    if (!res.ok) throw new Error("AI HTTP " + res.status + " " + (await res.text()).slice(0, 120));
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const text = data.choices?.[0]?.message?.content ?? "";
    const jsonText = /\{[\s\S]*\}/.exec(text)?.[0];
    if (!jsonText) throw new Error("AI không trả về JSON");
    const obj = JSON.parse(jsonText) as Record<string, unknown>;
    return {
      title: typeof obj.title === "string" ? obj.title : "",
      summary: typeof obj.summary === "string" ? obj.summary : "",
      content: typeof obj.content === "string" ? obj.content : "",
    };
  } finally {
    clearTimeout(timer);
  }
}
