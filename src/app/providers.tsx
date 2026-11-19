"use client";

import type { ReactNode } from "react";
import { Toaster } from "sonner";
import { HiddenImageProvider } from "@/components/owned-image";
import { PreviewHostBridge } from "@/components/preview-host-bridge";
import { LocalMigration } from "@/components/local-migration";
import { ProjectSync } from "@/components/project-sync";
import { AuthProvider } from "@/lib/auth/provider";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <>
      <PreviewHostBridge />
      <AuthProvider>
        <HiddenImageProvider>
          <ProjectSync />
          <LocalMigration />
          {children}
        </HiddenImageProvider>
        <Toaster theme="light" position="bottom-right" />
      </AuthProvider>
    </>
  );
}
