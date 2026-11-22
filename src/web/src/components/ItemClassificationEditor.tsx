import { useEffect, useState } from "react";
import { Loader2, Pencil, RotateCcw } from "lucide-react";
import { CATEGORY_LABEL, KIND_LABEL } from "../lib/sources.ts";
import { categoryOptionGroups } from "../../../shared/taxonomy.ts";
import type { Item } from "../types.ts";

export type ClassificationPatch = { category: string | null; kind: string | null; note?: string } | { clear: true };
export function ItemClassificationEditor({ item, onSave }: { item: Item; onSave: (id: number, patch: ClassificationPatch) => Promise<void> }) {
  const [category, setCategory] = useState("");
  const [kind, setKind] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const manual = item.manualClassification;
  useEffect(() => {
    setCategory(manual?.category ?? ""); setKind(manual?.kind ?? ""); setNote(manual?.note ?? "");
    setError(""); setNotice("");
  }, [item.id, manual?.category, manual?.kind, manual?.note]);
  const perform = async (patch: ClassificationPatch) => {
    setBusy(true); setError(""); setNotice("");
    try { await onSave(item.id, patch); setNotice("clear" in patch ? "đã khôi phục phân loại tự động (vẫn theo rule cố định của nguồn)" : "đã lưu phân loại thủ công, các lần thu và duyệt lại sau sẽ không ghi đè"); }
    catch (e) { setError(e instanceof Error ? e.message : "Lưu phân loại thất bại"); }
    finally { setBusy(false); }
  };
  return <details className="rounded-lg border border-brand-border bg-brand-subtle/30 p-3">
    <summary className="cursor-pointer text-[12.5px] font-medium text-accent"><Pencil size={12} className="mr-1 inline" /> chỉnh phân loại (quản trị){manual ? " · phân loại thủ công đã khoá" : ""}</summary>
    <fieldset disabled={busy} className="mt-3 min-w-0 space-y-3">
      <p className="text-[11.5px] leading-relaxed text-ink-600">đây là phân loại toàn site. đặt thủ công ưu tiên hơn rule cố định của nguồn, từ khoá và AI; không kích push, cũng không mở lại nội dung AI đã từ chối.“cloud drive”chỉ cần đổi phân loại;“giá tốt → tin tức”cần đổi cả dạng nội dung.</p>
      <div className="grid grid-cols-2 gap-2">
        <label className="block text-[12px] text-ink-700">phân loại thủ công<select aria-label="phân loại thủ công" value={category} onChange={(e) => setCategory(e.target.value)} className="mt-1 block w-full rounded-md border border-ink-200 bg-surface px-2 py-2">
          <option value="">giữ phân loại tự động</option>
          {categoryOptionGroups().map((group) => <optgroup key={group.label} label={group.label}>{group.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</optgroup>)}
        </select></label>
        <label className="block text-[12px] text-ink-700">dạng nội dung thủ công<select aria-label="dạng nội dung thủ công" value={kind} onChange={(e) => setKind(e.target.value)} className="mt-1 block w-full rounded-md border border-ink-200 bg-surface px-2 py-2">
          <option value="">giữ dạng tự động</option>
          {Object.entries(KIND_LABEL).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select></label>
      </div>
      <p className="text-[11px] text-ink-500">hiện tại:{KIND_LABEL[item.kind ?? ""] ?? "chưa nhận diện"} / {CATEGORY_LABEL[item.category ?? "other"] ?? item.category}</p>
      <label className="block text-[12px] text-ink-700">ghi chú sửa (tuỳ chọn)<input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="vd: trải nghiệm du lịch, không phải khuyến mãi" className="mt-1 block w-full rounded-md border border-ink-200 bg-surface px-3 py-2" /></label>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={!category && !kind} onClick={() => void perform({ category: category || null, kind: kind || null, note })} className="inline-flex items-center gap-1 rounded-md bg-brand px-3 py-2 text-[12px] font-medium text-white disabled:opacity-40">{busy && <Loader2 size={12} className="animate-spin" />} lưu phân loại thủ công</button>
        {manual && <button type="button" onClick={() => {
          if (window.confirm("huỷ phân loại thủ công của mục này và khôi phục rule tự động hiện tại? phân loại cố định của nguồn vẫn có hiệu lực.")) void perform({ clear: true });
        }} className="inline-flex items-center gap-1 rounded-md border border-ink-200 bg-surface px-3 py-2 text-[12px] text-ink-700"><RotateCcw size={12} /> khôi phục phân loại tự động</button>}
      </div>
      {(error || notice) && <p role={error ? "alert" : "status"} className={"text-[12px] " + (error ? "text-alert" : "text-deal")}>{error || notice}</p>}
    </fieldset>
  </details>;
}
