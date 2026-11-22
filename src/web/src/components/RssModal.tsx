import { useState } from "react";
import { Check, Copy, Globe2, Lock, X } from "lucide-react";
import type { Bootstrap } from "../lib/session.ts";

function CopyRow({ label, hint, url }: { label: string; hint: string; url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="rounded-lg border border-ink-200 bg-surface-hover p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12.5px] font-medium text-ink-900">{label}</span>
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(url);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            } catch {
              /* 剪贴板不可用时用户可手动选中 */
            }
          }}
          className="inline-flex items-center gap-1 rounded-md border border-ink-200 bg-surface px-2 py-1 text-[11.5px] font-medium text-ink-700 hover:bg-ink-100"
        >
          {copied ? <Check size={12} className="text-deal" /> : <Copy size={12} />}
          {copied ? "Đã sao chép" : "Sao chép"}
        </button>
      </div>
      <p className="mt-1 text-[11px] leading-relaxed text-ink-500">{hint}</p>
      <code className="mt-1.5 block overflow-x-auto rounded border border-ink-200 bg-surface px-2 py-1.5 font-mono text-[11px] whitespace-nowrap text-ink-700">
        {url}
      </code>
    </div>
  );
}

/**
 * RSS 订阅助手：把「当前筛选」直接变成一条订阅地址，
 * 登录用户还能拿到带个人屏蔽规则的专属地址。
 */
export function RssModal({
  boot,
  currentQuery,
  onClose,
}: {
  boot: Bootstrap;
  currentQuery: string;
  onClose: () => void;
}) {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const qs = currentQuery.replace(/^\?/, "").replace(/&?limit=\d+/, "");
  const publicUrl = origin + "/rss.xml" + (qs ? "?" + qs : "");
  const user = boot.user;

  return (
    <div className="backdrop-enter fixed inset-0 z-[70] flex items-center justify-center bg-ink-950/35 px-4">
      <div className="sheet-enter panel w-full max-w-[520px] overflow-hidden">
        <div className="flex items-start justify-between gap-3 border-b border-ink-100 px-5 py-3.5">
          <div className="flex items-center gap-2">
            <Globe2 size={15} className="text-accent" />
            <div>
              <h2 className="text-[15px] font-semibold text-ink-950">đăng ký RSS</h2>
              <p className="mt-0.5 text-[11.5px] text-ink-500">thả vào reader bất kỳ là xong, nguồn công khai không cần đăng nhập</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-ink-400 hover:bg-ink-100 hover:text-ink-900"
            title="Đóng"
          >
            <X size={14} />
          </button>
        </div>

        <div className="max-h-[62vh] space-y-2.5 overflow-auto px-5 py-4">
          <CopyRow label="đăng ký công khai (theo lọc hiện tại)" hint="áp dụng từ chặn toàn site & khử trùng liên nguồn, ai cũng đăng ký được" url={publicUrl} />
          <CopyRow
            label="đăng ký công khai (freebie thật tuyển chọn)"
            hint="cố định xuất theo kênh「freebie thật」, không bị lọc hiện tại ảnh hưởng"
            url={origin + "/rss.xml?preset=verified&limit=50"}
          />

          {user ? (
            <>
              <div className="pt-1 text-[11.5px] font-medium text-ink-500">đăng ký riêng của tôi</div>
              <CopyRow
                label="đăng ký cá nhân (thường)"
                hint="tự loại mục bạn bấm「không muốn xem」và áp dụng từ chặn cá nhân của bạn"
                url={origin + "/rss/u/" + user.rssToken + ".xml"}
              />
              <CopyRow
                label="đăng ký cá nhân (theo rule push)"
                hint="lọc hoàn toàn theo điểm, phân loại, cách lấy bạn đặt trong「push của tôi」"
                url={origin + "/rss/u/" + user.rssToken + ".xml?mode=push"}
              />
              <CopyRow
                label="đăng ký cá nhân (chỉ xem từ theo dõi)"
                hint="chỉ xuất mục trúng từ khoá bạn theo dõi"
                url={origin + "/rss/u/" + user.rssToken + ".xml?mode=subs"}
              />
              <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-ink-500">
                <Lock size={11} className="mt-0.5 shrink-0" />
                link này chính là thông tin xác thực, đừng dán nơi công khai; lộ thì vào「của tôi」reset token.
              </p>
            </>
          ) : (
            <p className="rounded-md border border-ink-200 bg-surface-hover px-3 py-2 text-[11.5px] leading-relaxed text-ink-600">
              sau đăng nhập còn lấy được địa chỉ đăng ký riêng kèm rule chặn cá nhân.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}