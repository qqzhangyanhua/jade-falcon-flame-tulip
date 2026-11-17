import type { ReactNode } from "react";
import Link from "next/link";
import { Diamond, Lock } from "lucide-react";
import { AuthSlot } from "@/components/auth-slot";
import { KeystoneMark, Wordmark } from "@/components/wordmark";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "#product", label: "产品" },
  { href: "#cases", label: "案例" },
  { href: "#pricing", label: "定价" },
] as const;

const FAMILIES = [
  {
    name: "暖工作室 · Atelier",
    tones: ["atm-paper", "atm-warm", "atm-gold", "atm-warm"] as const,
  },
  {
    name: "账本商务 · Ledger",
    tones: ["atm-cool", "atm-teal", "atm-cool", "atm-teal"] as const,
  },
  {
    name: "夜场片场 · Nocturne",
    tones: ["atm-night", "atm-violet", "atm-violet", "atm-night"] as const,
  },
  {
    name: "纸上留白 · Paper",
    tones: ["atm-paper", "atm-gold", "atm-paper", "atm-gold"] as const,
  },
] as const;

const STEPS = [
  {
    title: "选方向",
    body: "从情绪板里挑出你想要的视觉气质，而不是写一条漫长的 prompt。",
    tones: ["atm-cool", "atm-gold", "atm-night", "atm-warm"] as const,
  },
  {
    title: "锁 DNA",
    body: "把色温、材质、构图偏好固化成品牌 DNA——之后所有生成都沿着这条线。",
    node: true,
  },
  {
    title: "同风格出图",
    body: "批量仍保持同一调性。海报、社媒、产品图终于不再各说各话。",
    strips: ["atm-paper", "atm-gold", "atm-warm"] as const,
  },
] as const;

export function LandingScreen() {
  return (
    <div className="landing-shell">
      <LandingNav />
      <main>
        <Hero />
        <DnaGraph />
        <ProductSection />
        <Capabilities />
        <Cases />
        <Pricing />
        <FinalCta />
      </main>
      <Footer />
    </div>
  );
}

function LandingNav() {
  return (
    <header className="sticky top-0 z-20 border-b border-border bg-landing">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 md:px-8">
        <Link href="/" className="min-h-11">
          <Wordmark />
        </Link>
        <nav className="hidden items-center md:flex" aria-label="页面章节">
          {NAV.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="inline-flex h-11 items-center px-3 text-sm text-muted transition-colors duration-150 hover:text-fg"
            >
              {item.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-1">
          <AuthSlot compact />
          <StartLink className="h-11 rounded-full px-4 text-sm">开始使用</StartLink>
        </div>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="mx-auto max-w-3xl px-5 pb-10 pt-16 text-center md:pb-14 md:pt-24">
      <p className="landing-kicker animate-rise inline-flex items-center gap-2">
        <Diamond className="size-2.5 fill-subtle text-subtle" aria-hidden />
        Creative AI · Brand DNA First
      </p>
      <h1 className="landing-title animate-rise mt-6 text-fg">
        先锁品牌方向，再出
        <span className="block">同一 DNA 的图</span>
      </h1>
      <p className="animate-rise mx-auto mt-6 max-w-md text-sm leading-relaxed text-muted md:text-base">
        把视觉方向定死，再批量生成——每一张都带着你的风格基因，不再每次从零猜风格。
      </p>
      <div className="animate-rise mt-8 flex flex-wrap items-center justify-center gap-3">
        <StartLink className="h-12 rounded-full px-6">免费开始</StartLink>
        <a
          href="#product"
          className="inline-flex h-12 items-center justify-center rounded-full border border-border px-6 text-sm font-medium text-fg transition-[background-color,transform] duration-150 ease-smooth hover:bg-surface-2 active:scale-[0.96]"
        >
          看怎么工作
        </a>
      </div>
    </section>
  );
}

function DnaGraph() {
  return (
    <section className="mx-auto max-w-5xl px-5 pb-20 pt-6 md:pb-28" aria-label="品牌 DNA 如何锁定">
      <div className="flex flex-col items-center gap-6 lg:hidden">
        <div className="grid w-full max-w-sm grid-cols-2 gap-3">
          <AtmCard tone="atm-paper" caption="暖工作室 · Paper" />
          <AtmCard tone="atm-warm" caption="暖工作室 · Warm" />
        </div>
        <DnaNode />
        <AtmCard tone="atm-gold" caption="同风格成品" badge="DNA locked" className="w-full max-w-sm" />
      </div>

      <div className="hidden items-center justify-center gap-1 lg:flex">
        <div className="flex flex-col gap-6">
          <AtmCard tone="atm-paper" caption="暖工作室 · Paper" />
          <AtmCard tone="atm-warm" caption="暖工作室 · Warm" />
        </div>
        <svg width="96" height="176" viewBox="0 0 96 176" className="shrink-0 text-border" aria-hidden>
          <path
            d="M0 40 C 48 40, 44 88, 96 88"
            fill="none"
            stroke="currentColor"
            strokeWidth="1"
          />
          <path
            d="M0 136 C 48 136, 44 88, 96 88"
            fill="none"
            stroke="currentColor"
            strokeWidth="1"
          />
        </svg>
        <DnaNode />
        <div className="h-px w-14 shrink-0 bg-border" aria-hidden />
        <AtmCard tone="atm-gold" caption="同风格成品" badge="DNA locked" />
      </div>
    </section>
  );
}

function ProductSection() {
  return (
    <section id="product" className="scroll-mt-20 px-5 py-16 md:py-24">
      <div className="mx-auto max-w-3xl text-center">
        <p className="landing-kicker">Product</p>
        <h2 className="mt-4 font-display text-3xl tracking-tight text-fg md:text-4xl">
          方向盘一转，风格就锁死
        </h2>
        <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-muted">
          像选调色盘一样选视觉方向，锁定后所有生成都沿同一条 DNA 线走。
        </p>
      </div>
      <div className="mx-auto mt-12 max-w-5xl">
        <DirectionMock />
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Chip icon={<Lock className="size-3.5" aria-hidden />} label="锁 DNA" hint="色温 · 材质 · 构图同框" />
          <Chip label="批量同风格" hint="一次方向，一整列" />
        </div>
      </div>
    </section>
  );
}

function Capabilities() {
  return (
    <section className="px-5 py-16 md:py-24">
      <div className="mx-auto max-w-3xl text-center">
        <p className="landing-kicker">Capabilities</p>
        <h2 className="mt-4 font-display text-3xl tracking-tight text-fg md:text-4xl">
          三步，把品牌视觉打死
        </h2>
      </div>
      <ul className="mx-auto mt-12 grid max-w-5xl gap-4 md:grid-cols-3">
        {STEPS.map((step) => (
          <li key={step.title} className="overflow-hidden rounded-xl bg-surface p-2 shadow-border">
            <div className="overflow-hidden rounded-lg bg-bg">
              {"tones" in step && step.tones ? (
                <div className="grid h-40 grid-cols-2 gap-1 p-3">
                  {step.tones.map((tone) => (
                    <div key={tone} className={cn("atm-field min-h-0 rounded-md", tone)} />
                  ))}
                </div>
              ) : null}
              {"node" in step && step.node ? (
                <div className="grid h-40 place-items-center">
                  <DnaNode compact />
                </div>
              ) : null}
              {"strips" in step && step.strips ? (
                <div className="grid h-40 grid-cols-3 gap-1 p-3">
                  {step.strips.map((tone) => (
                    <div key={tone} className={cn("atm-field h-full rounded-md", tone)} />
                  ))}
                </div>
              ) : null}
            </div>
            <div className="px-3 pb-4 pt-4">
              <h3 className="font-medium text-fg">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{step.body}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Cases() {
  return (
    <section id="cases" className="scroll-mt-20 px-5 py-16 md:py-24">
      <div className="mx-auto max-w-3xl text-center">
        <p className="landing-kicker">Consistency</p>
        <h2 className="mt-4 font-display text-3xl tracking-tight text-fg md:text-4xl">
          同一方向，成片一致
        </h2>
      </div>
      <div className="mx-auto mt-12 grid max-w-5xl gap-8 sm:grid-cols-2 lg:grid-cols-4">
        {FAMILIES.map((family) => (
          <figure key={family.name}>
            <figcaption className="mb-3 text-xs text-muted">{family.name}</figcaption>
            <div className="grid grid-cols-2 gap-2">
              {family.tones.map((tone, i) => (
                <div
                  key={`${tone}-${i}`}
                  className={cn("atm-field aspect-square rounded-lg shadow-border", tone)}
                />
              ))}
            </div>
          </figure>
        ))}
      </div>
    </section>
  );
}

function Pricing() {
  return (
    <section id="pricing" className="scroll-mt-20 px-5 py-16 md:py-20">
      <div className="mx-auto max-w-lg rounded-xl bg-surface px-6 py-10 text-center shadow-border md:px-10">
        <p className="landing-kicker">Pricing</p>
        <h2 className="mt-4 font-display text-3xl tracking-tight text-fg">免费试用，按日出图</h2>
        <p className="mt-4 text-sm leading-relaxed text-muted">
          登录即可锁定方向并生成。每日有出图额度，无需信用卡。解析描述不扣额度。
        </p>
        <StartLink className="mt-8 h-12 rounded-full px-6">免费开始</StartLink>
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="px-5 py-20 text-center md:py-28">
      <h2 className="font-display text-3xl tracking-tight text-fg md:text-4xl">开始锁定你的品牌 DNA</h2>
      <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-muted">
        免费试用。无需信用卡。几分钟内完成第一次同风格出图。
      </p>
      <StartLink className="mt-8 h-12 rounded-full px-6">免费开始</StartLink>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto grid max-w-6xl gap-10 px-5 py-12 md:grid-cols-[minmax(0,1.4fr)_1fr_1fr] md:px-8">
        <div>
          <Wordmark />
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted">
            先锁品牌视觉方向，再生出同一 DNA 的图。
          </p>
        </div>
        <div>
          <p className="text-xs font-medium text-fg">产品</p>
          <ul className="mt-3 space-y-2 text-sm text-muted">
            <li>
              <a href="#product" className="inline-flex min-h-11 items-center hover:text-fg">
                功能
              </a>
            </li>
            <li>
              <a href="#pricing" className="inline-flex min-h-11 items-center hover:text-fg">
                定价
              </a>
            </li>
            <li>
              <Link href="/studio" className="inline-flex min-h-11 items-center hover:text-fg">
                工作台
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <p className="text-xs font-medium text-fg">账户</p>
          <ul className="mt-3 space-y-2 text-sm text-muted">
            <li>
              <Link href="/login" className="inline-flex min-h-11 items-center hover:text-fg">
                登录
              </Link>
            </li>
            <li>
              <Link href="/account" className="inline-flex min-h-11 items-center hover:text-fg">
                账户
              </Link>
            </li>
            <li>
              <a href="#cases" className="inline-flex min-h-11 items-center hover:text-fg">
                案例
              </a>
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t border-border">
        <p className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-5 text-xs text-subtle md:px-8">
          <span>© 2026 Keystone</span>
          <span className="hidden sm:inline">Made for locked-in creative AI</span>
        </p>
      </div>
    </footer>
  );
}

function StartLink({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link
      href="/studio"
      className={cn(
        "inline-flex items-center justify-center bg-accent text-sm font-medium text-accent-fg",
        "transition-[opacity,transform] duration-150 ease-smooth hover:opacity-90 active:scale-[0.96]",
        className,
      )}
    >
      {children}
    </Link>
  );
}

function AtmCard({
  tone,
  caption,
  badge,
  className,
}: {
  tone: string;
  caption: string;
  badge?: string;
  className?: string;
}) {
  return (
    <figure className={cn("w-full overflow-hidden rounded-lg bg-surface shadow-border lg:w-44", className)}>
      <div className={cn("atm-field h-24 w-full", tone)} />
      <figcaption className="flex items-center justify-between gap-2 px-3 py-2">
        <span className="truncate text-xs text-muted">{caption}</span>
        {badge ? <span className="shrink-0 text-xs text-subtle">{badge}</span> : null}
      </figcaption>
    </figure>
  );
}

function DnaNode({ compact = false }: { compact?: boolean }) {
  return (
    <div className={cn("relative grid place-items-center", compact ? "size-24" : "size-28")}>
      <span className="dna-ring absolute inset-0 rounded-full border border-border" aria-hidden />
      <div
        className={cn(
          "relative grid place-items-center rounded-full bg-surface shadow-border",
          compact ? "size-16" : "size-20",
        )}
      >
        <div className="flex flex-col items-center gap-1">
          <span className="grid size-7 place-items-center rounded-md bg-surface-2 text-fg">
            <KeystoneMark className="size-3.5" />
          </span>
          {compact ? null : <span className="text-xs text-muted">品牌 DNA</span>}
        </div>
      </div>
    </div>
  );
}

function Chip({
  icon,
  label,
  hint,
}: {
  icon?: ReactNode;
  label: string;
  hint: string;
}) {
  return (
    <div className="inline-flex min-h-11 items-center gap-3 rounded-lg bg-surface px-4 py-2 shadow-border">
      {icon ? <span className="text-muted">{icon}</span> : null}
      <span>
        <span className="block text-sm text-fg">{label}</span>
        <span className="block text-xs text-subtle">{hint}</span>
      </span>
    </div>
  );
}

function DirectionMock() {
  return (
    <div className="rounded-xl bg-surface p-2 shadow-border">
      <div className="overflow-hidden rounded-lg bg-bg">
        <div className="flex h-10 items-center gap-2 border-b border-border px-3">
          <span className="size-2 rounded-full bg-subtle" aria-hidden />
          <span className="size-2 rounded-full bg-muted" aria-hidden />
          <span className="size-2 rounded-full bg-fg/40" aria-hidden />
          <p className="ml-2 truncate text-xs text-subtle">Keystone — Direction Picker</p>
        </div>
        <div className="grid gap-3 p-3 lg:grid-cols-3">
          <div className="atm-field min-h-44 rounded-lg atm-gold lg:min-h-72">
            <span className="absolute bottom-3 left-3 z-10 text-xs text-fg">暖工作室 · 主方向</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <MockTile tone="atm-night" label="夜宴流光" locked />
            <MockTile tone="atm-cool" label="冷极简盘" />
            <MockTile tone="atm-violet" label="紫调夜色" />
            <MockTile tone="atm-teal" label="冰蓝工具" />
          </div>
          <div className="flex h-full min-w-0 flex-col rounded-lg bg-surface p-3 shadow-border">
            <p className="text-xs text-subtle">Prompt</p>
            <p className="mt-2 text-xs leading-relaxed text-muted">
              一只陶瓷咖啡杯放在品牌桌上，暖光、浅金木、品牌衬纸。DNA：暖工作室气质 · 奶油底色。
            </p>
            <div className="mt-4 rounded-md bg-bg px-3 py-3">
              <p className="text-xs text-subtle">暖工作室 DNA</p>
              <p className="mt-1 text-sm text-fg">LOCKED · 12 refs</p>
            </div>
            <Link
              href="/studio"
              className="mt-auto inline-flex h-11 items-center justify-center rounded-md bg-accent text-sm font-medium text-accent-fg transition-[opacity,transform] duration-150 ease-smooth hover:opacity-90 active:scale-[0.96]"
            >
              生成同风格图像
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function MockTile({
  tone,
  label,
  locked,
}: {
  tone: string;
  label: string;
  locked?: boolean;
}) {
  return (
    <div className={cn("atm-field relative min-h-24 rounded-lg lg:min-h-32", tone)}>
      {locked ? (
        <span className="absolute right-2 top-2 z-10 grid size-6 place-items-center rounded-full bg-bg/70 text-fg">
          <Lock className="size-3" aria-hidden />
        </span>
      ) : null}
      <span className="absolute bottom-2 left-2 z-10 text-xs text-fg">{label}</span>
    </div>
  );
}
