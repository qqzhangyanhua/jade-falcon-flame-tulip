"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { listMyHiddenImageIdsFn } from "@/app/actions/review";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import {
  hiddenImageKnowledge,
  nextHiddenImageKnowledge,
  ownedImageFrame,
  type HiddenImageKnowledge,
  type OwnedImageFrame,
} from "@/lib/image-jobs/hidden-image-state";
import { cn } from "@/lib/utils";

export const HIDDEN_IMAGE_LABEL = "已被管理员隐藏";
export const HIDDEN_IMAGES_CHANGED_EVENT = "keystone:hidden-images-changed";

const HiddenImageContext = createContext<HiddenImageKnowledge>(hiddenImageKnowledge(null));

export function HiddenImageProvider({
  children,
  initialIds = null,
}: {
  children: ReactNode;
  initialIds?: readonly string[] | null;
}) {
  const { user, isPending } = useCurrentUserState();
  const [knowledge, setKnowledge] = useState(() => hiddenImageKnowledge(initialIds));

  useEffect(() => {
    if (isPending) return;
    if (!user) {
      setKnowledge((current) => nextHiddenImageKnowledge(current, { type: "signed-out" }));
      return;
    }
    let cancelled = false;
    const load = () => {
      void listMyHiddenImageIdsFn()
        .then((list) => {
          if (cancelled) return;
          setKnowledge((current) => nextHiddenImageKnowledge(current, { type: "loaded", ids: list }));
        })
        .catch(() => {
          if (cancelled) return;
          setKnowledge((current) => nextHiddenImageKnowledge(current, { type: "failed" }));
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

  return <HiddenImageContext.Provider value={knowledge}>{children}</HiddenImageContext.Provider>;
}

export function useHiddenImageIds(): ReadonlySet<string> {
  return useContext(HiddenImageContext).ids;
}

export function useOwnedImageFrame(url: string | null | undefined): OwnedImageFrame {
  const knowledge = useContext(HiddenImageContext);
  if (!url) return "image";
  return ownedImageFrame(knowledge, url);
}

export function useImageHidden(url: string | null | undefined): boolean {
  return useOwnedImageFrame(url) === "hidden";
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
  const frame = useOwnedImageFrame(src);
  if (frame === "pending") {
    return <div aria-hidden className={cn("bg-surface-2", placeholderClassName ?? className)} />;
  }
  if (frame === "hidden") {
    return <HiddenImagePlaceholder className={placeholderClassName ?? className} />;
  }
  return <img src={src} alt={alt} className={className} />;
}
