"use client";

import type { ReactNode } from "react";
import { Toaster } from "sonner";
import { PreviewHostBridge } from "@/components/preview-host-bridge";
import { LocalMigration } from "@/components/local-migration";
import { ProjectSync } from "@/components/project-sync";
import { AuthProvider } from "@/lib/auth/provider";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <>
      <PreviewHostBridge />
      <AuthProvider>
        <ProjectSync />
        <LocalMigration />
        {children}
        <Toaster theme="dark" position="bottom-right" />
      </AuthProvider>
    </>
  );
}
