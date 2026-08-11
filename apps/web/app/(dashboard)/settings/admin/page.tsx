"use client";

import * as React from "react";
import useSWR, { mutate } from "swr";
import * as Dialog from "@radix-ui/react-dialog";
import { Users, Plus, X, Shield, Link2, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar } from "@/components/shared/avatar";
import { EmptyState } from "@/components/shared/empty-state";
import { useAuthStore } from "@/stores/auth-store";
import { useRouter } from "next/navigation";
import type { User, UserStatus } from "@/types";
import { InstanceSettingsTab } from "@/components/settings/instance-settings-tab";
import { useI18n } from "@/hooks/use-i18n";

const tr = (locale: string, en: string, ru: string) => locale === "ru" ? ru : en;

function BulkInviteDialog() {
  const { locale } = useI18n();
  const [open, setOpen] = React.useState(false);
  const [emails, setEmails] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");
  const [success, setSuccess] = React.useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const emailList = emails
      .split(/[\n,]/)
      .map((e) => e.trim())
      .filter(Boolean);
    if (emailList.length === 0) return;
    setLoading(true);
    setError("");
    setSuccess("");
    let sent = 0;
    const skipped: string[] = [];
    const failed: string[] = [];
    try {
      for (const email of emailList) {
        try {
          const name = email.split("@")[0];
          await api.post("/users/invite", { email, name });
          sent++;
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : "";
          if (msg.toLowerCase().includes("already registered")) {
            skipped.push(email);
          } else {
            failed.push(email);
          }
        }
      }
      const parts: string[] = [];
      if (sent > 0) parts.push(`${sent} invite(s) sent`);
      if (skipped.length > 0)
        parts.push(`${skipped.length} already registered`);
      if (failed.length > 0) parts.push(`${failed.length} failed`);
      if (sent > 0 || skipped.length > 0) {
        setSuccess(parts.join(", "));
        if (failed.length === 0) {
          setEmails("");
          setTimeout(() => setOpen(false), 1500);
        }
      }
      if (failed.length > 0) {
        setError(`Failed to invite: ${failed.join(", ")}`);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to send invites");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <Button variant="secondary" size="sm">
          <Users className="h-4 w-4" />
          {tr(locale, "Bulk Invite", "Массовое приглашение")}
        </Button>
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-bg-secondary p-6 shadow-xl data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95">
          <Dialog.Close className="absolute right-4 top-4 text-text-tertiary hover:text-text-primary transition-colors">
            <X className="h-4 w-4" />
          </Dialog.Close>

          <Dialog.Title className="text-base font-semibold text-text-primary">
            {tr(locale, "Bulk Invite Users", "Пригласить пользователей")}
          </Dialog.Title>
          <Dialog.Description className="mt-1 text-sm text-text-secondary">
            {tr(locale, "Enter email addresses separated by commas or newlines.", "Введите адреса email через запятую или с новой строки.")}
          </Dialog.Description>

          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-text-secondary">
                {tr(locale, "Email addresses", "Адреса email")}
              </label>
              <textarea
                value={emails}
                onChange={(e) => setEmails(e.target.value)}
                placeholder="user1@example.com&#10;user2@example.com"
                rows={5}
                className="flex w-full rounded-md border border-border bg-bg-secondary px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary transition-colors focus:outline-none focus:border-border-focus focus:ring-1 focus:ring-border-focus resize-none"
              />
            </div>
            {error && <p className="text-xs text-status-error">{error}</p>}
            {success && (
              <p className="text-xs text-status-success">{success}</p>
            )}
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setOpen(false)}
              >
                {tr(locale, "Close", "Закрыть")}
              </Button>
              <Button type="submit" size="sm" loading={loading}>
                {tr(locale, "Send Invites", "Отправить приглашения")}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function userStatusBadge(status: UserStatus, locale: string) {
  const map: Record<UserStatus, { label: string; className: string }> = {
    active: {
      label: tr(locale, "Active", "Активен"),
      className: "bg-status-success/15 text-status-success",
    },
    deactivated: {
      label: tr(locale, "Deactivated", "Деактивирован"),
      className: "bg-status-error/15 text-status-error",
    },
    pending_invite: {
      label: tr(locale, "Pending", "Ожидает"),
      className: "bg-status-warning/15 text-status-warning",
    },
    pending_verification: {
      label: tr(locale, "Unverified", "Не подтверждён"),
      className: "bg-bg-tertiary text-text-secondary",
    },
  };
  const cfg = map[status] ?? map.active;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        cfg.className,
      )}
    >
      {cfg.label}
    </span>
  );
}

export default function AdminPage() {
  const { locale, formatDate } = useI18n();
  const { user, isSuperAdmin } = useAuthStore();
  const router = useRouter();
  const [tab, setTab] = React.useState<"users" | "instance">("users");

  const { data: usersResp, isLoading: loadingUsers } = useSWR<User[]>(
    isSuperAdmin ? "/admin/users" : null,
    () => api.get<User[]>("/admin/users"),
  );

  React.useEffect(() => {
    if (user && !isSuperAdmin) {
      router.replace("/");
    }
  }, [user, isSuperAdmin, router]);

  const handleDeactivate = async (userId: string) => {
    try {
      await api.patch(`/admin/users/${userId}/deactivate`);
      mutate("/admin/users");
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to deactivate user";
      alert(message);
    }
  };

  const handleReactivate = async (userId: string) => {
    try {
      await api.patch(`/admin/users/${userId}/reactivate`);
      mutate("/admin/users");
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to reactivate user";
      alert(message);
    }
  };

  const [copiedId, setCopiedId] = React.useState<string | null>(null);

  const handleCopyInviteLink = (u: User) => {
    if (!u.invite_token) return;
    const link = `${window.location.origin}/invite/${u.invite_token}`;
    navigator.clipboard.writeText(link);
    setCopiedId(u.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleToggleAdmin = async (
    userId: string,
    isCurrentlyAdmin: boolean,
  ) => {
    try {
      await api.patch(`/admin/users/${userId}/role`, {
        is_admin: !isCurrentlyAdmin,
      });
      mutate("/admin/users");
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to update user role";
      alert(message);
    }
  };

  if (!isSuperAdmin) {
    return null;
  }

  return (
    <div className="p-6 space-y-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-muted">
          <Shield className="h-5 w-5 text-accent" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-text-primary">
            {tr(locale, "Admin Dashboard", "Панель администратора")}
          </h1>
          <p className="text-sm text-text-secondary">{tr(locale, "Manage platform users", "Управление пользователями платформы")}</p>
        </div>
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-1 border-b border-border">
        {([["users", tr(locale, "Users", "Пользователи")], ["instance", tr(locale, "Instance settings", "Настройки инстанса")]] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cn(
              "px-3 py-2 text-sm border-b-2 -mb-px transition-colors",
              tab === key
                ? "border-accent text-text-primary"
                : "border-transparent text-text-secondary hover:text-text-primary",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "instance" && <InstanceSettingsTab />}

      {/* User management */}
      {tab === "users" && (
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-text-primary">
            {tr(locale, "Platform Users", "Пользователи платформы")}
          </h2>
          <BulkInviteDialog />
        </div>

        {loadingUsers ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="h-12 animate-pulse rounded-lg bg-bg-tertiary"
              />
            ))}
          </div>
        ) : !usersResp || usersResp.length === 0 ? (
          <div className="rounded-lg border border-border bg-bg-secondary">
            <EmptyState
              icon={Users}
              title={tr(locale, "No users", "Пользователей пока нет")}
              description={tr(locale, "Users will appear here once they register or are invited.", "Здесь появятся зарегистрированные и приглашённые пользователи.")}
            />
          </div>
        ) : (
          <div className="rounded-lg border border-border bg-bg-secondary overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-bg-tertiary">
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-text-tertiary">
                    {tr(locale, "User", "Пользователь")}
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-text-tertiary">
                    {tr(locale, "Role", "Роль")}
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-text-tertiary">
                    {tr(locale, "Status", "Статус")}
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-text-tertiary">
                    {tr(locale, "Joined", "Дата регистрации")}
                  </th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-text-tertiary">
                    {tr(locale, "Actions", "Действия")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {usersResp.map((u: User) => (
                  <tr
                    key={u.id}
                    className="border-b border-border last:border-0 hover:bg-bg-tertiary transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <Avatar src={u.avatar_url} name={u.name} size="sm" />
                        <div className="min-w-0">
                          <p data-user-content="true" className="text-sm font-medium text-text-primary truncate">
                            {u.name}
                          </p>
                          <p data-user-content="true" className="text-xs text-text-tertiary truncate">
                            {u.email}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {u.is_superadmin ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent">
                          <Shield className="h-3 w-3" />
                          {tr(locale, "Admin", "Администратор")}
                        </span>
                      ) : (
                        <span className="text-xs text-text-tertiary">{tr(locale, "User", "Пользователь")}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">{userStatusBadge(u.status, locale)}</td>
                    <td className="px-4 py-3 text-xs text-text-tertiary">
                      {u.created_at
                        ? formatDate(u.created_at)
                        : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        {u.status === "pending_invite" && u.invite_token && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleCopyInviteLink(u)}
                            className="gap-1"
                          >
                            {copiedId === u.id ? (
                              <>
                                <Check className="h-3.5 w-3.5 text-status-success" />{" "}
                                {tr(locale, "Copied", "Скопировано")}
                              </>
                            ) : (
                              <>
                                <Link2 className="h-3.5 w-3.5" /> {tr(locale, "Copy Invite Link", "Копировать ссылку")}
                              </>
                            )}
                          </Button>
                        )}
                        {u.id !== user?.id && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              handleToggleAdmin(u.id, u.is_superadmin)
                            }
                          >
                            {u.is_superadmin ? tr(locale, "Remove Admin", "Снять права администратора") : tr(locale, "Make Admin", "Назначить администратором")}
                          </Button>
                        )}
                        {u.id !== user?.id && u.status === "active" ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeactivate(u.id)}
                            className="text-status-error hover:text-status-error"
                          >
                            {tr(locale, "Deactivate", "Деактивировать")}
                          </Button>
                        ) : u.id !== user?.id && u.status === "deactivated" ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleReactivate(u.id)}
                          >
                            {tr(locale, "Reactivate", "Активировать")}
                          </Button>
                        ) : u.id === user?.id ? (
                          <span className="text-xs text-text-tertiary italic">
                            {tr(locale, "You", "Вы")}
                          </span>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      )}
    </div>
  );
}
