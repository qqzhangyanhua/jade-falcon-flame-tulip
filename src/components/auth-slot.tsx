import { useState, useSyncExternalStore } from "react";
import { Link } from "@tanstack/react-router";
import { authEnabled, signOut } from "@/lib/auth/client";
import { hasGateSessionMarker } from "@/lib/auth/gate-session-marker";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { cn } from "@/lib/utils";

const subscribeToNothing = () => () => {};
const noGateSessionOnServer = () => false;

function initials(label: string): string {
  return label.charAt(0).toUpperCase();
}

export function AuthSlot({ compact = false }: { compact?: boolean }) {
  const { user, isPending } = useCurrentUserState();
  const [signingOut, setSigningOut] = useState(false);
  const gateSession = useSyncExternalStore(
    subscribeToNothing,
    hasGateSessionMarker,
    noGateSessionOnServer,
  );

  if (isPending) {
    return (
      <div
        className={cn("animate-pulse rounded-full bg-surface-2", compact ? "size-8" : "size-9")}
        aria-hidden
      />
    );
  }

  if (!user) {
    return (
      <Link
        to="/login"
        className={cn(
          "inline-flex items-center rounded-md px-3 text-sm text-muted hover:text-fg",
          compact ? "h-9" : "h-11",
        )}
      >
        登录
      </Link>
    );
  }

  const label = user.displayName ?? user.primaryEmail ?? "账户";

  return (
    <div className="flex items-center gap-1">
      <Link
        to="/account"
        className={cn(
          "flex items-center gap-2 rounded-md hover:bg-surface-2",
          compact ? "h-9 px-1.5" : "h-11 px-2",
        )}
      >
        {user.profileImageUrl ? (
          <img
            src={user.profileImageUrl}
            alt=""
            className={cn("rounded-full object-cover", compact ? "size-7" : "size-8")}
          />
        ) : (
          <span
            className={cn(
              "grid place-items-center rounded-full bg-surface-2 text-sm font-medium text-fg",
              compact ? "size-7" : "size-8",
            )}
          >
            {initials(label)}
          </span>
        )}
        <span className="hidden max-w-28 truncate text-sm text-fg md:inline">{label}</span>
      </Link>
      {authEnabled && !gateSession ? (
        <button
          type="button"
          disabled={signingOut}
          onClick={() => {
            setSigningOut(true);
            void signOut("/").catch(() => setSigningOut(false));
          }}
          className={cn(
            "rounded-md px-2 text-sm text-muted hover:text-fg disabled:cursor-wait",
            compact ? "h-9" : "h-11",
          )}
        >
          {signingOut ? "退出中" : "退出"}
        </button>
      ) : null}
    </div>
  );
}
