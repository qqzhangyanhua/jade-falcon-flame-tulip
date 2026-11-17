import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import Script from "next/script";
import { AppProviders } from "@/app/providers";
import "./globals.css";

const APP_NAME = "Keystone";

export const metadata: Metadata = {
  title: APP_NAME,
  description: "先锁品牌方向，再出同一 DNA 的图。",
  icons: {
    icon: [{ url: "/favicon.svg", type: "image/svg+xml" }],
    apple: "/__grok/icon-180.png",
  },
  manifest: "/__grok/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: "#050506",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN" className="antialiased" suppressHydrationWarning>
      <body className="min-h-dvh bg-bg text-fg">
        <AppProviders>{children}</AppProviders>
        <Script src="https://grok.com/grok-app-builder/extensions.js" strategy="afterInteractive" />
      </body>
    </html>
  );
}
