import { useCallback, useEffect, useState } from "react";
import {
  Ban,
  Check,
  Copy,
  DownloadCloud,
  Loader2,
  Megaphone,
  RefreshCw,
  ShieldCheck,
  Ticket,
  Users,
} from "lucide-react";
import { getToken } from "../lib/auth.ts";

type Access = {
  loginEnabled: boolean;
  suspendUserSessionsOnClose: boolean;
  registrationMode: "open" | "invite" | "closed";
  minTrustLevel: number;
  maxUsers: number;
};

type Onboarding = { enabled: boolean; title: string; content: string; showGuideCards: boolean; version: number };

type Invite = {
  id: number;
  code: string;
  max_uses: number;
  used_count: number;
  disabled: number;
  note: string | null;
  expires_at: string | null;
  created_at: string;
};

type AdminUser = {
  id: number;
  linuxdo_id: number;
  username: string;
  name: string | null;
  trust_level: number;
  disabled: number;
  created_at: string;
  last_login_at: string;
  hidden: number;
  starred: number;
  push_enabled: number;
};

type BuildInfo = {
  version: string;
  commitShort: string | null;
  branch: string | null;
  runtimeMode: "git" | "docker-webhook" | "docker-readonly";
  buildTime: string | null;
};

type UpdateCheck = {
  runtimeMode: string;
  current: BuildInfo;
  available: boolean;
  behind: number;
  latest: { short: string; message: string; date: string; author: string } | null;
  commits: { short: string; message: string; date: string; author: string }[];
  dirtyFiles: string[];
  canAutoUpdate: boolean;
  notes: string[];
};

type UpdateJob = {
  id: string;
  status: "running" | "done" | "failed";
  steps: { name: string; status: string; detail?: string }[];
  log: string;
  error: string | null;
  restartScheduled: boolean;
};

const authHeaders = (): Record<string, string> => {
  const t = getToken();
  return t ? { authorization: "Bearer " + t } : {};
};

const jsonAuth = (): Record<string, string> => ({ "content-type": "application/json", ...authHeaders() });

function Section({ icon: Icon, title, desc, children }: { icon: typeof Users; title: string; desc?: string; children: React.ReactNode }) {
  return (
    <section className="panel space-y-3 p-5">
      <div className="flex items-center gap-2 text-[13.5px] font-semibold text-ink-950">
        <Icon size={14} className="text-accent" /> {title}
      </div>
      {desc && <p className="text-[11.5px] leading-relaxed text-ink-500">{desc}</p>}
      {children}
    </section>
  );
}

const MODE_LABEL: Record<string, string> = {
  git: "chạy trực tiếp từ source Git",
  "docker-webhook": "Docker + webhook trên host",
  "docker-readonly": "Docker (chỉ đọc, thao tác trên host)",
};

export function SiteAdminPanel() {
  const [access, setAccess] = useState<Access | null>(null);
  const [onboarding, setOnboarding] = useState<Onboarding | null>(null);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [build, setBuild] = useState<BuildInfo | null>(null);
  const [hostCmd, setHostCmd] = useState("");
  const [check, setCheck] = useState<UpdateCheck | null>(null);
  const [job, setJob] = useState<UpdateJob | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [inviteCount, setInviteCount] = useState(5);
  const [inviteUses, setInviteUses] = useState(1);
  const [inviteDays, setInviteDays] = useState(0);
  const [inviteNote, setInviteNote] = useState("");

  const notify = useCallback((m: string) => {
    setMsg(m);
    setTimeout(() => setMsg(null), 2600);
  }, []);

  const loadAll = useCallback(async () => {
    const [ov, inv, usr] = await Promise.all([
      fetch("/api/admin/overview", { headers: authHeaders() }).then((r) => (r.ok ? r.json() : null)),
      fetch("/api/admin/invites", { headers: authHeaders() }).then((r) => (r.ok ? r.json() : null)),
      fetch("/api/admin/users?limit=200", { headers: authHeaders() }).then((r) => (r.ok ? r.json() : null)),
    ]);
    if (ov) {
      setAccess(ov.access as Access);
      setOnboarding(ov.onboarding as Onboarding);
      setBuild(ov.build as BuildInfo);
      setHostCmd(String(ov.hostUpdateCommand ?? ""));
    }
    if (inv) setInvites((inv.codes ?? []) as Invite[]);
    if (usr) setUsers((usr.users ?? []) as AdminUser[]);
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const patchAccess = async (patch: Partial<Access>) => {
    const res = await fetch("/api/admin/access", { method: "PATCH", headers: jsonAuth(), body: JSON.stringify(patch) });
    const data = (await res.json().catch(() => ({}))) as { access?: Access; error?: string };
    if (!res.ok) return notify(data.error ?? "Lưu thất bại");
    setAccess(data.access ?? null);
    notify("đã lưu");
  };

  const saveOnboarding = async (patch: Record<string, unknown>) => {
    const res = await fetch("/api/admin/onboarding", { method: "PATCH", headers: jsonAuth(), body: JSON.stringify(patch) });
    const data = (await res.json().catch(() => ({}))) as { onboarding?: Onboarding; error?: string };
    if (!res.ok) return notify(data.error ?? "Lưu thất bại");
    setOnboarding(data.onboarding ?? null);
    notify("đã lưu");
  };

  const runCheck = async () => {
    setBusy("check");
    try {
      const res = await fetch("/api/admin/update/check", { headers: authHeaders() });
      const data = (await res.json().catch(() => ({}))) as UpdateCheck & { error?: string };
      if (!res.ok) return notify(data.error ?? "Kiểm tra thất bại");
      setCheck(data);
      notify(data.available ? `phát hiện ${data.behind} commit mới` : "đã mới nhất");
    } finally {
      setBusy(null);
    }
  };

  const runUpdate = async () => {
    setBusy("update");
    try {
      const res = await fetch("/api/admin/update/run", { method: "POST", headers: authHeaders() });
      const data = (await res.json().catch(() => ({}))) as { job?: UpdateJob; error?: string };
      if (!res.ok) return notify(data.error ?? "Khởi động thất bại");
      setJob(data.job ?? null);
      pollJob();
    } finally {
      setBusy(null);
    }
  };

  const pollJob = useCallback(() => {
    let n = 0;
    const timer = setInterval(async () => {
      n += 1;
      const res = await fetch("/api/admin/update/status", { headers: authHeaders() });
      if (res.ok) {
        const data = (await res.json()) as { job: UpdateJob | null };
        setJob(data.job);
        if (data.job && data.job.status !== "running") {
          clearInterval(timer);
          notify(data.job.status === "done" ? "Cập nhật xong" : "Cập nhật thất bại:" + (data.job.error ?? ""));
        }
      }
      if (n > 100) clearInterval(timer);
    }, 2000);
  }, [notify]);

  return (
    <div className="space-y-4">
      {msg && (
        <div className="toast-enter fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-lg border border-ink-800 bg-ink-950 px-3.5 py-2 text-[12.5px] font-medium text-white">
          {msg}
        </div>
      )}

      <Section
        icon={ShieldCheck}
        title="kiểm soát truy cập"
        desc="cổng đăng nhập & chế độ đăng ký áp dụng nóng, không cần restart. quyền quản trị luôn chỉ nhận ADMIN_TOKEN, đăng nhập LINUX DO không nâng quyền."
      >
        {!access ? (
          <div className="text-[12.5px] text-ink-500">Đang tải…</div>
        ) : (
          <div className="space-y-2.5">
            <label className="flex items-center justify-between gap-2 rounded-lg border border-ink-200 bg-surface-hover px-3 py-2 text-[12.5px] text-ink-800">
              <span>mở cổng đăng nhập</span>
              <input
                type="checkbox"
                checked={access.loginEnabled}
                onChange={(e) => void patchAccess({ loginEnabled: e.target.checked })}
                className="h-3.5 w-3.5 accent-[#111318]"
              />
            </label>
            <label className="flex items-center justify-between gap-2 rounded-lg border border-ink-200 bg-surface-hover px-3 py-2 text-[12.5px] text-ink-800">
              <span>đóng đăng nhập thì đồng thời tạm dừng phía cá nhân (chế độ bảo trì)</span>
              <input
                type="checkbox"
                checked={access.suspendUserSessionsOnClose}
                onChange={(e) => void patchAccess({ suspendUserSessionsOnClose: e.target.checked })}
                className="h-3.5 w-3.5 accent-[#111318]"
              />
            </label>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[12px] text-ink-700">chế độ đăng ký</span>
              {(
                [
                  ["open", "mở đăng ký"],
                  ["invite", "đăng ký bằng mã mời"],
                  ["closed", "dừng đăng ký mới"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => void patchAccess({ registrationMode: key })}
                  className={
                    "rounded-lg border px-2.5 py-1 text-[11.5px] font-medium " +
                    (access.registrationMode === key
                      ? "border-brand bg-ink-950 text-white"
                      : "border-ink-200 bg-surface text-ink-700 hover:bg-ink-100")
                  }
                >
                  {label}
                </button>
              ))}
            </div>
            <label className="flex items-center justify-between gap-2 rounded-lg border border-ink-200 bg-surface-hover px-3 py-2 text-[12.5px] text-ink-800">
              <span>cấp trust LINUX DO tối thiểu</span>
              <select
                value={access.minTrustLevel}
                onChange={(e) => void patchAccess({ minTrustLevel: Number(e.target.value) })}
                className="rounded border border-ink-200 bg-surface px-2 py-1 text-[12px] text-ink-900 outline-none focus:border-accent"
              >
                {[0, 1, 2, 3, 4].map((n) => (
                  <option key={n} value={n}>
                    TL{n}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center justify-between gap-2 rounded-lg border border-ink-200 bg-surface-hover px-3 py-2 text-[12.5px] text-ink-800">
              <span>
                giới hạn suất đăng ký
                <span className="ml-1.5 text-[11px] text-ink-500">0 = không giới hạn; đầy chỉ chặn đăng ký mới, user cũ đăng nhập bình thường</span>
              </span>
              <input
                type="number"
                min={0}
                max={100000}
                value={access.maxUsers}
                onChange={(e) => void patchAccess({ maxUsers: Number(e.target.value) })}
                className="w-24 rounded border border-ink-200 bg-surface px-2 py-1 text-right text-[12px] text-ink-900 outline-none focus:border-accent"
              />
            </label>
          </div>
        )}
      </Section>

      <Section icon={Ticket} title="mã mời" desc="ghi danh là nguyên tử (BEGIN IMMEDIATE + UPDATE điều kiện), đồng thời không cấp vượt; user cũ mãi mãi không cần mã.">
        <div className="flex flex-wrap items-end gap-2">
          {[
            { label: "Số lượng", value: inviteCount, set: setInviteCount, max: 50 },
            { label: "số lần dùng mỗi mã", value: inviteUses, set: setInviteUses, max: 10000 },
            { label: "số ngày hiệu lực (0=vĩnh viễn)", value: inviteDays, set: setInviteDays, max: 3650 },
          ].map((f) => (
            <label key={f.label} className="block">
              <span className="text-[11.5px] text-ink-600">{f.label}</span>
              <input
                type="number"
                min={0}
                max={f.max}
                value={f.value}
                onChange={(e) => f.set(Number(e.target.value))}
                className="mt-1 w-[110px] rounded-lg border border-ink-200 bg-surface px-2 py-1.5 text-[12px] text-ink-950 outline-none focus:border-accent"
              />
            </label>
          ))}
          <label className="block">
            <span className="text-[11.5px] text-ink-600">Ghi chú</span>
            <input
              value={inviteNote}
              onChange={(e) => setInviteNote(e.target.value)}
              placeholder="tuỳ chọn"
              className="mt-1 w-[150px] rounded-lg border border-ink-200 bg-surface px-2 py-1.5 text-[12px] text-ink-950 outline-none focus:border-accent"
            />
          </label>
          <button
            type="button"
            onClick={async () => {
              setBusy("invite");
              try {
                const res = await fetch("/api/admin/invites", {
                  method: "POST",
                  headers: jsonAuth(),
                  body: JSON.stringify({ count: inviteCount, maxUses: inviteUses, expiresDays: inviteDays, note: inviteNote }),
                });
                const data = (await res.json().catch(() => ({}))) as { created?: Invite[]; codes?: Invite[]; error?: string };
                if (!res.ok) return notify(data.error ?? "Tạo thất bại");
                setInvites((data.codes ?? []) as Invite[]);
                notify(`đã tạo ${data.created?.length ?? 0} mã mời`);
                setInviteNote("");
              } finally {
                setBusy(null);
              }
            }}
            disabled={busy !== null}
            className="inline-flex items-center gap-1.5 rounded-lg bg-ink-950 px-3 py-1.5 text-[12px] font-medium text-white hover:bg-brand-hover disabled:opacity-60"
          >
            {busy === "invite" ? <Loader2 size={12} className="animate-spin" /> : <Ticket size={12} />} tạo
          </button>
        </div>

        <div className="max-h-[260px] divide-y divide-ink-100 overflow-auto rounded-lg border border-ink-200">
          {invites.length === 0 && <div className="px-3 py-6 text-center text-[12px] text-ink-500">chưa có mã mời</div>}
          {invites.map((v) => (
            <div key={v.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-[12px]">
              <code className="font-mono font-medium text-ink-900">{v.code}</code>
              <span className="text-ink-500">
                {v.used_count}/{v.max_uses}
              </span>
              {v.note && <span className="text-ink-500">· {v.note}</span>}
              {v.expires_at && <span className="text-ink-400">· {v.expires_at.slice(0, 10)} hết hạn</span>}
              {v.disabled === 1 && <span className="rounded bg-ink-100 px-1.5 py-0.5 text-ink-600">đã ngừng</span>}
              <div className="ml-auto flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(v.code);
                      notify("Đã sao chép");
                    } catch {
                      /* ignore */
                    }
                  }}
                  className="rounded p-1 text-ink-400 hover:bg-ink-100 hover:text-ink-900"
                  title="Sao chép"
                >
                  <Copy size={12} />
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const res = await fetch("/api/admin/invites/" + v.id, {
                      method: "PATCH",
                      headers: jsonAuth(),
                      body: JSON.stringify({ disabled: v.disabled !== 1 }),
                    });
                    if (res.ok) setInvites(((await res.json()) as { codes: Invite[] }).codes);
                  }}
                  className="rounded px-1.5 py-0.5 text-[11.5px] text-ink-600 hover:bg-ink-100"
                >
                  {v.disabled === 1 ? "Bật" : "Ngừng dùng"}
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const res = await fetch("/api/admin/invites/" + v.id, { method: "DELETE", headers: authHeaders() });
                    if (res.ok) setInvites(((await res.json()) as { codes: Invite[] }).codes);
                  }}
                  className="rounded px-1.5 py-0.5 text-[11.5px] text-alert hover:bg-ink-100"
                >
                  xoá
                </button>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section icon={Users} title={`user đã đăng ký (${users.length})`} desc="cấm sẽ đồng thời xoá phiên đăng nhập của user đó; push bot cá nhân cũng ngừng theo.">
        <div className="max-h-[280px] divide-y divide-ink-100 overflow-auto rounded-lg border border-ink-200">
          {users.length === 0 && <div className="px-3 py-6 text-center text-[12px] text-ink-500">chưa có người dùng</div>}
          {users.map((u) => (
            <div key={u.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-[12px]">
              <span className="font-medium text-ink-900">{u.name ?? u.username}</span>
              <span className="text-ink-500">@{u.username}</span>
              <span className="rounded bg-ink-100 px-1.5 py-0.5 text-ink-600">TL{u.trust_level}</span>
              <span className="text-ink-500">
                lưu {u.starred} · đóng {u.hidden} {u.push_enabled === 1 ? "· push cá nhân" : ""}
              </span>
              <span className="text-ink-400">gần đây {u.last_login_at.slice(0, 10)}</span>
              {u.disabled === 1 && <span className="rounded bg-alert-subtle px-1.5 py-0.5 text-alert">đã cấm</span>}
              <button
                type="button"
                onClick={async () => {
                  const res = await fetch("/api/admin/users/" + u.id, {
                    method: "PATCH",
                    headers: jsonAuth(),
                    body: JSON.stringify({ disabled: u.disabled !== 1 }),
                  });
                  if (res.ok) {
                    setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, disabled: u.disabled === 1 ? 0 : 1 } : x)));
                    notify(u.disabled === 1 ? "đã bỏ cấm" : "đã cấm");
                  }
                }}
                className="ml-auto inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11.5px] text-ink-600 hover:bg-ink-100"
              >
                {u.disabled === 1 ? <Check size={11} /> : <Ban size={11} />}
                {u.disabled === 1 ? "Bỏ cấm" : "Cấm"}
              </button>
            </div>
          ))}
        </div>
      </Section>

      <Section icon={Megaphone} title="thông báo chung" desc="chỉ bật một lần theo số phiên bản; bấm「lưu và bật lại」để mọi khách thấy lại lần vào sau.">
        {!onboarding ? (
          <div className="text-[12.5px] text-ink-500">Đang tải…</div>
        ) : (
          <div className="space-y-2.5">
            <label className="block">
              <span className="text-[12px] text-ink-700">Tiêu đề</span>
              <input
                defaultValue={onboarding.title}
                onBlur={(e) => e.target.value !== onboarding.title && void saveOnboarding({ title: e.target.value })}
                className="mt-1 w-full rounded-lg border border-ink-200 bg-surface px-2.5 py-1.5 text-[12.5px] text-ink-950 outline-none focus:border-accent"
              />
            </label>
            <label className="block">
              <span className="text-[12px] text-ink-700">Nội dung</span>
              <textarea
                defaultValue={onboarding.content}
                rows={6}
                onBlur={(e) => e.target.value !== onboarding.content && void saveOnboarding({ content: e.target.value })}
                className="mt-1 w-full rounded-lg border border-ink-200 bg-surface px-2.5 py-1.5 text-[12.5px] leading-relaxed text-ink-950 outline-none focus:border-accent"
              />
            </label>
            <div className="flex flex-wrap items-center gap-3 text-[12px] text-ink-700">
              <label className="inline-flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={onboarding.enabled}
                  onChange={(e) => void saveOnboarding({ enabled: e.target.checked })}
                  className="h-3.5 w-3.5 accent-[#111318]"
                />
                bật thông báo
              </label>
              <label className="inline-flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={onboarding.showGuideCards}
                  onChange={(e) => void saveOnboarding({ showGuideCards: e.target.checked })}
                  className="h-3.5 w-3.5 accent-[#111318]"
                />
                hiện thẻ hướng dẫn tính năng
              </label>
              <span className="text-ink-400">phiên bản hiện tại v{onboarding.version}</span>
              <button
                type="button"
                onClick={() => void saveOnboarding({ bumpVersion: true })}
                className="rounded-lg border border-ink-200 bg-surface px-2.5 py-1 text-[11.5px] font-medium text-ink-700 hover:bg-ink-100"
              >
                lưu và bật lại
              </button>
            </div>
          </div>
        )}
      </Section>

      <Section icon={DownloadCloud} title="phiên bản & cập nhật" desc="trong container không dựng lại image được, sẽ báo đúng giới hạn chứ không giả vờ tự cập nhật.">
        <div className="flex flex-wrap items-center gap-2 text-[12px] text-ink-700">
          <span className="rounded bg-ink-100 px-2 py-0.5 font-mono">
            v{build?.version ?? "?"} {build?.commitShort ? "· " + build.commitShort : ""}
          </span>
          <span className="text-ink-500">{build ? (MODE_LABEL[build.runtimeMode] ?? build.runtimeMode) : ""}</span>
          <button
            type="button"
            onClick={() => void runCheck()}
            disabled={busy !== null}
            className="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 bg-surface px-2.5 py-1 text-[11.5px] font-medium text-ink-700 hover:bg-ink-100 disabled:opacity-60"
          >
            {busy === "check" ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />} kiểm tra cập nhật
          </button>
          {check?.canAutoUpdate && (
            <button
              type="button"
              onClick={() => void runUpdate()}
              disabled={busy !== null}
              className="inline-flex items-center gap-1.5 rounded-lg bg-ink-950 px-2.5 py-1 text-[11.5px] font-medium text-white hover:bg-brand-hover disabled:opacity-60"
            >
              {busy === "update" ? <Loader2 size={11} className="animate-spin" /> : <DownloadCloud size={11} />} sao lưu & cập nhật một chạm
            </button>
          )}
        </div>

        {check && (
          <div className="space-y-2 rounded-lg border border-ink-200 bg-surface-hover p-3 text-[11.5px] leading-relaxed">
            <div className="text-ink-700">
              {check.available ? `chậm ${check.behind} commit` : "đã mới nhất"}
              {check.latest ? ` · mới nhất ${check.latest.short} ${check.latest.message}` : ""}
            </div>
            {check.notes.map((n) => (
              <div key={n} className="text-ink-500">
                · {n}
              </div>
            ))}
            {check.dirtyFiles.length > 0 && (
              <div className="font-mono text-[11px] text-alert">{check.dirtyFiles.slice(0, 6).join(" · ")}</div>
            )}
            {check.commits.slice(0, 8).map((c) => (
              <div key={c.short} className="flex gap-2 text-ink-600">
                <span className="font-mono text-ink-400">{c.short}</span>
                <span className="truncate">{c.message}</span>
              </div>
            ))}
            {check.runtimeMode === "docker-readonly" && hostCmd && (
              <div className="rounded border border-ink-200 bg-surface px-2 py-1.5 font-mono text-[11px] break-all text-ink-700">
                {hostCmd}
              </div>
            )}
          </div>
        )}

        {job && (
          <div className="space-y-1.5 rounded-lg border border-ink-200 bg-surface-hover p-3 text-[11.5px]">
            <div className="flex items-center gap-2">
              <span className="font-medium text-ink-800">tác vụ cập nhật {job.status}</span>
              {job.restartScheduled && <span className="text-ink-500">· đã xếp lịch khởi động lại</span>}
              {job.error && <span className="text-alert">· {job.error}</span>}
            </div>
            {job.steps.map((s) => (
              <div key={s.name} className="flex items-center gap-2 text-ink-600">
                <span className={s.status === "done" ? "text-deal" : s.status === "failed" ? "text-alert" : "text-ink-400"}>
                  {s.status === "done" ? "✔" : s.status === "failed" ? "✘" : "…"}
                </span>
                {s.name}
                {s.detail && <span className="truncate text-ink-500">· {s.detail}</span>}
              </div>
            ))}
            {job.log && (
              <pre className="max-h-[160px] overflow-auto rounded border border-ink-200 bg-surface p-2 font-mono text-[10.5px] leading-relaxed whitespace-pre-wrap text-ink-600">
                {job.log}
              </pre>
            )}
          </div>
        )}
      </Section>

      <p className="px-1 text-[11.5px] leading-relaxed text-ink-500">
        <ShieldCheck size={11} className="mr-1 inline" />
        các API này đều yêu cầu ADMIN_TOKEN; tài khoản thường đăng nhập LINUX DO truy cập sẽ trả 401.
      </p>
    </div>
  );
}