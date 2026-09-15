"use client";

import type { ReactNode } from "react";
import { Toaster } from "sonner";
import { PreviewHostBridge } from "@/components/preview-host-bridge";
import { AuthProvider } from "@/lib/auth/provider";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <>
      <PreviewHostBridge />
      <AuthProvider>
        {children}
        <Toaster theme="dark" position="bottom-right" />
      </AuthProvider>
    </>
  );
}
