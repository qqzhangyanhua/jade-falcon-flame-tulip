"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { listMyHiddenImageIdsFn } from "@/app/actions/review";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { cn } from "@/lib/utils";

const DURABLE_IMAGE_PATH_PREFIX = "/api/images/";

function imageIdFromUrl(url: string): string | null {
  if (!url.startsWith("/")) return null;
  const path = url.split("?")[0] ?? url;
  if (!path.startsWith(DURABLE_IMAGE_PATH_PREFIX)) return null;
  const id = path.slice(DURABLE_IMAGE_PATH_PREFIX.length);
  if (!id || id.includes("/") || id.includes("..")) return null;
  return decodeURIComponent(id);
}

export const HIDDEN_IMAGE_LABEL = "已被管理员隐藏";
export const HIDDEN_IMAGES_CHANGED_EVENT = "keystone:hidden-images-changed";

const HiddenImageContext = createContext<ReadonlySet<string>>(new Set());

export function HiddenImageProvider({ children }: { children: ReactNode }) {
  const { user, isPending } = useCurrentUserState();
  const [ids, setIds] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    if (isPending || !user) {
      setIds(new Set());
      return;
    }
    let cancelled = false;
    const load = () => {
      void listMyHiddenImageIdsFn()
        .then((list) => {
          if (!cancelled) setIds(new Set(list));
        })
        .catch(() => {
          if (!cancelled) setIds(new Set());
        });
    };
    load();
    window.addEventListener("focus", load);
    window.addEventListener(HIDDEN_IMAGES_CHANGED_EVENT, load);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", load);
      window.removeEventListener(HIDDEN_IMAGES_CHANGED_EVENT, load);
    };
  }, [isPending, user]);

  return <HiddenImageContext.Provider value={ids}>{children}</HiddenImageContext.Provider>;
}

export function useImageHidden(url: string | null | undefined): boolean {
  const ids = useContext(HiddenImageContext);
  if (!url) return false;
  const id = imageIdFromUrl(url);
  if (!id) return false;
  return ids.has(id);
}

export function HiddenImagePlaceholder({ className }: { className?: string }) {
  return (
    <div
      role="img"
      aria-label={HIDDEN_IMAGE_LABEL}
      className={cn(
        "flex items-center justify-center bg-surface-2 px-3 text-center text-sm leading-relaxed text-muted",
        className,
      )}
    >
      {HIDDEN_IMAGE_LABEL}
    </div>
  );
}

export function OwnedImage({
  src,
  alt,
  className,
  placeholderClassName,
}: {
  src: string;
  alt: string;
  className?: string;
  placeholderClassName?: string;
}) {
  const hidden = useImageHidden(src);
  if (hidden) {
    return <HiddenImagePlaceholder className={placeholderClassName ?? className} />;
  }
  return <img src={src} alt={alt} className={className} />;
}
