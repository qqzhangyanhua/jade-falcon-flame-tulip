"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient, authEnabled, GROK_PROVIDERS, signIn } from "@/lib/auth/client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Wordmark } from "@/components/wordmark";
import { cn } from "@/lib/utils";

function mapAuthError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("invalid") && lower.includes("password")) return "邮箱或密码不正确";
  if (lower.includes("invalid email or password")) return "邮箱或密码不正确";
  if (lower.includes("already exists") || lower.includes("user_already_exists")) {
    return "该邮箱已注册，请直接登录";
  }
  if (lower.includes("too short") || lower.includes("password")) {
    if (lower.includes("8")) return "密码至少 8 位";
  }
  return message;
}

export function LoginScreen() {
  const router = useRouter();
  const { user, isPending } = useCurrentUserState();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user) router.replace("/studio");
  }, [user, router]);

  if (isPending) {
    return (
      <main className="grid min-h-dvh place-items-center bg-bg">
        <div className="h-10 w-40 animate-pulse rounded-md bg-surface-2" />
      </main>
    );
  }
  if (user) {
    return (
      <main className="grid min-h-dvh place-items-center bg-bg">
        <div className="h-10 w-40 animate-pulse rounded-md bg-surface-2" />
      </main>
    );
  }

  async function onOAuth(providerId: string) {
    setError(null);
    try {
      await signIn(providerId, { callbackURL: "/studio", errorCallbackURL: "/login" });
    } catch (e) {
      setError(e instanceof Error ? mapAuthError(e.message) : "登录失败");
    }
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!authEnabled) return;
    setError(null);
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error: signUpError } = await authClient.signUp.email({
          name: name.trim() || email.split("@")[0] || "用户",
          email: email.trim(),
          password,
        });
        if (signUpError) throw new Error(signUpError.message ?? "注册失败");
      } else {
        const { error: signInError } = await authClient.signIn.email({
          email: email.trim(),
          password,
        });
        if (signInError) throw new Error(signInError.message ?? "登录失败");
      }
      await authClient.getSession();
      window.location.href = "/studio";
    } catch (e) {
      setError(e instanceof Error ? mapAuthError(e.message) : "登录失败");
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-bg px-5 py-10">
      <div className="w-full max-w-sm">
        <Link href="/" className="inline-block">
          <Wordmark />
        </Link>
        <h1 className="mt-8 font-display text-3xl tracking-tight text-fg">登录后继续定调</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          登录后可以保存账户资料，并开始生成视觉方向。
        </p>

        {authEnabled ? (
          <div className="mt-8 space-y-3">
            {GROK_PROVIDERS.map((p) => (
              <Button
                key={p.providerId}
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => void onOAuth(p.providerId)}
              >
                使用 {p.label} 继续
              </Button>
            ))}
          </div>
        ) : (
          <p className="mt-8 text-sm text-muted">登录未开启。</p>
        )}

        {authEnabled ? (
          <>
            <div className="my-6 flex items-center gap-3">
              <span className="h-px flex-1 bg-border" />
              <span className="text-xs text-subtle">或使用邮箱</span>
              <span className="h-px flex-1 bg-border" />
            </div>

            <div className="mb-4 flex rounded-md border border-border p-1">
              <button
                type="button"
                className={cn(
                  "h-9 flex-1 rounded-sm text-sm",
                  mode === "signin" ? "bg-surface-2 text-fg" : "text-muted",
                )}
                onClick={() => setMode("signin")}
              >
                登录
              </button>
              <button
                type="button"
                className={cn(
                  "h-9 flex-1 rounded-sm text-sm",
                  mode === "signup" ? "bg-surface-2 text-fg" : "text-muted",
                )}
                onClick={() => setMode("signup")}
              >
                注册
              </button>
            </div>

            <form className="space-y-3" onSubmit={(e) => void onSubmit(e)}>
              {mode === "signup" ? (
                <label className="block space-y-1.5">
                  <span className="text-sm text-muted">显示名称</span>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    autoComplete="name"
                    placeholder="怎么称呼你"
                  />
                </label>
              ) : null}
              <label className="block space-y-1.5">
                <span className="text-sm text-muted">邮箱</span>
                <Input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  placeholder="you@example.com"
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-sm text-muted">密码</span>
                <Input
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  placeholder="至少 8 位"
                />
              </label>
              {error ? <p className="text-sm text-danger">{error}</p> : null}
              <Button type="submit" className="w-full" size="lg" disabled={busy}>
                {busy ? "请稍候…" : mode === "signup" ? "创建账户" : "登录"}
              </Button>
            </form>
          </>
        ) : null}
      </div>
    </main>
  );
}
