import { BookOpen, Globe2, Send, ShieldCheck, X } from "lucide-react";
import type { Bootstrap } from "../lib/session.ts";

/**
 * 入站提示：首次访问（或站长把版本号 +1 后）弹一次。
 * 内容由后台可编辑，这里的引导卡片按站点形态动态决定显示哪几条。
 */
export function WelcomeModal({
  boot,
  onClose,
  onLogin,
}: {
  boot: Bootstrap;
  onClose: () => void;
  onLogin: () => void;
}) {
  const ob = boot.onboarding;
  const isPublic = boot.siteMode === "public";
  const cards = [
    isPublic && {
      icon: ShieldCheck,
      title: "không đăng nhập cũng không ảnh hưởng nhau",
      body: "không muốn xem, lưu, đã đọc, chặn nhanh chỉ lưu trong browser của bạn; đăng nhập mới đồng bộ đa thiết bị.",
    },
    boot.loginEnabled && {
      icon: Send,
      title: "gắn Telegram Bot của riêng bạn",
      body: "sau đăng nhập điền Bot Token & Chat ID riêng, nhận push theo rule cá nhân, không làm phiền ai.",
    },
    {
      icon: Globe2,
      title: "hỗ trợ đăng ký RSS",
      body: "nút「RSS」trên thanh trên tạo link đăng ký công khai; sau đăng nhập còn có link riêng kèm rule chặn cá nhân.",
    },
  ].filter(Boolean) as { icon: typeof ShieldCheck; title: string; body: string }[];

  return (
    <div className="backdrop-enter fixed inset-0 z-[70] flex items-center justify-center bg-ink-950/35 px-4">
      <div className="sheet-enter panel w-full max-w-[520px] overflow-hidden">
        <div className="flex items-start justify-between gap-3 border-b border-ink-100 px-5 py-3.5">
          <div className="flex items-center gap-2">
            <BookOpen size={15} className="text-accent" />
            <h2 className="text-[15px] font-semibold text-ink-950">{ob.title}</h2>
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

        <div className="max-h-[62vh] space-y-3 overflow-auto px-5 py-4">
          <p className="text-[12.5px] leading-relaxed whitespace-pre-wrap text-ink-700">{ob.content}</p>

          {ob.showGuideCards && (
            <div className="space-y-2 pt-1">
              {cards.map((c) => (
                <div key={c.title} className="flex items-start gap-2.5 rounded-lg border border-ink-200 bg-surface-hover px-3 py-2.5">
                  <c.icon size={14} className="mt-0.5 shrink-0 text-accent" />
                  <div>
                    <div className="text-[12.5px] font-medium text-ink-900">{c.title}</div>
                    <div className="mt-0.5 text-[11.5px] leading-relaxed text-ink-500">{c.body}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-ink-100 px-5 py-3">
          {boot.loginEnabled && !boot.user && (
            <button
              type="button"
              onClick={onLogin}
              className="rounded-lg border border-ink-200 bg-surface px-3 py-1.5 text-[12.5px] font-medium text-ink-700 hover:bg-ink-100"
            >
              đăng nhập trước
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-ink-950 px-3.5 py-1.5 text-[12.5px] font-medium text-white hover:bg-brand-hover"
          >
            bắt đầu dùng
          </button>
        </div>
      </div>
    </div>
  );
}