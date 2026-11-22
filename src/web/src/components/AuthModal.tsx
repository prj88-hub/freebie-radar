import { useEffect, useState } from "react";
import { AlertTriangle, Github, Loader2, LogIn, Ticket, X } from "lucide-react";
import type { Bootstrap } from "../lib/session.ts";

const HASH_MESSAGES: Record<string, string> = {
  "login-disabled": "site hiện đã đóng đăng nhập",
  "login-unconfigured": "site chưa cấu hình thông tin đăng nhập LINUX DO",
  "login-failed": "đăng nhập thất bại, thử lại",
  "login-state-mismatch": "kiểm tra trạng thái đăng nhập thất bại (có thể link hết hạn), đăng nhập lại",
  "login-inactive": "tài khoản LINUX DO chưa kích hoạt",
  "login-silenced": "tài khoản LINUX DO đang bị cấm chat, tạm không đăng nhập được",
  "login-trust": "cấp trust chưa đủ, site đặt ngưỡng đăng nhập",
  "login-banned": "tài khoản đã bị site vô hiệu",
  "register-closed": "site hiện đã dừng đăng ký user mới (user cũ vẫn đăng nhập bình thường)",
  "quota-full": "site hết suất đăng ký, tạm dừng đăng ký user mới (user cũ vẫn đăng nhập bình thường)",
  "invite-invalid": "mã mời không hợp lệ hoặc đã hết",
};

export function AuthModal({
  boot,
  initialHash,
  onClose,
  onDone,
}: {
  boot: Bootstrap;
  initialHash?: string | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [inviteMode, setInviteMode] = useState(initialHash === "invite-required");
  const [invite, setInvite] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(
    initialHash ? (HASH_MESSAGES[initialHash] ?? null) : null,
  );

  useEffect(() => {
    if (initialHash) window.history.replaceState(null, "", window.location.pathname);
  }, [initialHash]);

  const startLogin = (code?: string, provider: "linuxdo" | "github" = "linuxdo") => {
    const q = code?.trim() ? "?invite=" + encodeURIComponent(code.trim()) : "";
    window.location.href = `/api/auth/${provider}/login` + q;
  };

  const devLogin = async (preset: "alice" | "bob") => {
    setBusy(preset);
    setError(null);
    try {
      const res = await fetch("/api/auth/dev-login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ preset }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; needInvite?: boolean; message?: string };
      if (!res.ok) {
        setError(data.error ?? "đăng nhập test local thất bại");
        return;
      }
      // 邀请码模式下后端会返回 needInvite：切到补码界面，走和真实 OAuth 一样的准入
      if (data.needInvite) {
        setInviteMode(true);
        setError(data.error ?? data.message ?? null);
        return;
      }
      onDone();
    } catch {
      setError("lỗi mạng, thử lại");
    } finally {
      setBusy(null);
    }
  };

  const submitInvite = async () => {
    if (!invite.trim()) return;
    setBusy("invite");
    setError(null);
    try {
      const res = await fetch("/api/auth/redeem-invite", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: invite.trim() }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; expired?: boolean };
      if (!res.ok) {
        setError(data.error ?? "kiểm tra mã mời thất bại");
        return;
      }
      onDone();
    } catch {
      setError("lỗi mạng, thử lại");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="backdrop-enter fixed inset-0 z-[70] flex items-center justify-center bg-ink-950/35 px-4">
      <div className="sheet-enter panel w-full max-w-[420px] overflow-hidden">
        <div className="flex items-start justify-between gap-3 border-b border-ink-100 px-5 py-3.5">
          <div>
            <h2 className="text-[15px] font-semibold text-ink-950">
              {inviteMode ? "nhập mã mời để hoàn tất đăng ký" : "đăng nhập Freebie Radar"}
            </h2>
            <p className="mt-0.5 text-[11.5px] text-ink-500">
              {inviteMode
                ? "danh tính đăng nhập đã xác thực, điền thêm một mã mời là mở được tài khoản"
                : "sau đăng nhập đồng bộ lưu & chặn đa thiết bị, và gắn Telegram Bot của riêng bạn"}
            </p>
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

        <div className="space-y-3 px-5 py-4">
          {error && (
            <div className="flex items-start gap-2 rounded-md border border-alert-border bg-alert-subtle px-3 py-2 text-[12px] text-alert">
              <AlertTriangle size={13} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {inviteMode ? (
            <>
              <label className="block">
                <span className="text-[12px] font-medium text-ink-700">mã mời</span>
                <input
                  value={invite}
                  onChange={(e) => setInvite(e.target.value.toUpperCase())}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void submitInvite();
                  }}
                  placeholder="FR-XXXX-XXXX"
                  maxLength={32}
                  autoFocus
                  className="mt-1 w-full rounded-lg border border-ink-200 bg-surface px-2.5 py-2 font-mono text-[13px] tracking-wider text-ink-950 outline-none focus:border-accent"
                />
              </label>
              <button
                type="button"
                onClick={() => void submitInvite()}
                disabled={busy === "invite" || !invite.trim()}
                className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-ink-950 px-3 py-2 text-[13px] font-medium text-white hover:bg-brand-hover disabled:opacity-60"
              >
                {busy === "invite" ? <Loader2 size={14} className="animate-spin" /> : <Ticket size={14} />}
                xác thực & hoàn tất đăng ký
              </button>
              <p className="text-[11px] leading-relaxed text-ink-500">
                mã có hiệu lực trong 10 phút. hết hạn thì đóng cửa sổ này bấm lại「đăng nhập LINUX DO」.
              </p>
            </>
          ) : (
            <>
              {boot.loginEnabled ? (
                <>
                  {/* 只有邀请码注册时才显示补码输入；开放注册下这里是空噪声 */}
                  {boot.registrationMode === "invite" && (
                    <label className="block">
                      <span className="text-[12px] font-medium text-ink-700">mã mời</span>
                      <input
                        value={invite}
                        onChange={(e) => setInvite(e.target.value.toUpperCase())}
                        placeholder="user mới bắt buộc, user cũ để trống"
                        maxLength={32}
                        className="mt-1 w-full rounded-lg border border-ink-200 bg-surface px-2.5 py-2 font-mono text-[13px] tracking-wider text-ink-950 outline-none focus:border-accent"
                      />
                    </label>
                  )}
                  <button
                    type="button"
                    onClick={() => startLogin(invite)}
                    disabled={!boot.oauthConfigured}
                    className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-ink-950 px-3 py-2 text-[13px] font-medium text-white hover:bg-brand-hover disabled:opacity-60"
                  >
                    <LogIn size={14} />
                    chuyển tới uỷ quyền LINUX DO
                  </button>
                  {boot.githubConfigured && (
                    <button
                      type="button"
                      onClick={() => startLogin(invite, "github")}
                      className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-ink-200 bg-surface px-3 py-2 text-[13px] font-medium text-ink-800 hover:bg-ink-100"
                    >
                      <Github size={14} /> chuyển tới uỷ quyền GitHub
                    </button>
                  )}
                  {!boot.oauthConfigured && (
                    <p className="text-[11.5px] text-ink-500">
                      server chưa cấu hình LINUXDO_CLIENT_ID / SECRET, hãy dùng tài khoản test local bên dưới trước.
                    </p>
                  )}
                </>
              ) : (
                <p className="rounded-md border border-ink-200 bg-surface-hover px-3 py-2 text-[12px] text-ink-600">
                  site hiện đã đóng cổng đăng nhập. phiên đăng nhập đã có không bị ảnh hưởng.
                </p>
              )}

              {boot.devMockEnabled && (
                <div className="rounded-lg border border-ink-200 bg-surface-hover p-3">
                  <div className="mb-2 text-[11.5px] font-medium text-ink-700">tài khoản test local (chỉ hiện ngoài production)</div>
                  <div className="flex gap-2">
                    {(["alice", "bob"] as const).map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => void devLogin(preset)}
                        disabled={busy !== null}
                        className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-ink-200 bg-surface px-3 py-1.5 text-[12px] font-medium text-ink-700 hover:bg-ink-100 disabled:opacity-60"
                      >
                        {busy === preset ? <Loader2 size={12} className="animate-spin" /> : null}
                        tài khoản {preset === "alice" ? "A" : "B"}
                      </button>
                    ))}
                  </div>
                  <p className="mt-2 text-[11px] leading-relaxed text-ink-500">
                    dùng để kiểm chứng「mục A đóng không ảnh hưởng B」, và hai tài khoản push về Bot riêng của mình.
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
