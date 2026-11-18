import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { AuthSlot } from "@/components/auth-slot";
import { CASES, SLOTS, order, shot } from "@/components/landing-data";
import { HeroShowcase } from "@/components/landing-showcase";
import { Wordmark } from "@/components/wordmark";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "#how", label: "方法" },
  { href: "#cases", label: "案例" },
  { href: "#pricing", label: "定价" },
] as const;

export function LandingScreen() {
  return (
    <div className="landing-shell">
      <LandingNav />
      <main>
        <Hero />
        <HowItWorks />
        <Cases />
        <PricingCta />
      </main>
      <Footer />
    </div>
  );
}

function LandingNav() {
  return (
    <header className="sticky top-0 z-20 border-b border-border bg-bg">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-5 md:px-8">
        <Link href="/" className="flex min-h-11 items-center" aria-label="Keystone 首页">
          <Wordmark />
        </Link>
        <nav className="hidden items-center gap-1 md:flex" aria-label="页面章节">
          {NAV.map((item) => (
            <a key={item.href} href={item.href} className="nav-link">
              {item.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <AuthSlot compact />
          <StartLink className="h-10 px-4">开始使用</StartLink>
        </div>
      </div>
    </header>
  );
}

function Hero() {
  const lines: ReactNode[] = [
    "先锁定品牌方向，",
    <>
      再出一整套<em className="not-italic text-seal">同风格</em>
    </>,
    "的品牌图。",
  ];
  return (
    <section className="mx-auto grid max-w-6xl gap-12 px-5 pb-20 pt-12 md:px-8 md:pt-20 lg:grid-cols-12 lg:items-center lg:gap-10 lg:pb-28">
      <div className="lg:col-span-5">
        <h1 className="landing-title">
          {lines.map((line, i) => (
            <span key={i} className="line-mask">
              <span style={order(i)}>{line}</span>
            </span>
          ))}
        </h1>
        <p
          className="hero-fade mt-6 max-w-md text-base leading-relaxed text-muted"
          style={order(0)}
        >
          Keystone 把视觉方向固化成一份风格
          DNA：色板、光线、材质、构图。之后的主视觉、产品图、官网首屏，都从这份 DNA
          生成，不再每次重新猜风格。
        </p>
        <div className="hero-fade mt-8 flex flex-wrap items-center gap-6" style={order(1)}>
          <StartLink>
            免费开始
            <ArrowRight className="btn-arrow size-4" aria-hidden />
          </StartLink>
          <a href="#cases" className="link-line text-sm font-medium text-fg">
            看三组案例
          </a>
        </div>
        <p className="hero-fade mt-8 text-sm text-subtle" style={order(2)}>
          每日免费出图额度 · 无需信用卡
        </p>
      </div>

      <HeroShowcase />
    </section>
  );
}

function HowItWorks() {
  return (
    <section id="how" className="scroll-mt-16 border-t border-border">
      <div className="mx-auto max-w-6xl px-5 py-20 md:px-8 md:py-28">
        <SectionHeading label="方法" title="三步，让风格不再漂移" />
        <ol className="mt-12 grid gap-10 md:grid-cols-3 md:gap-8">
          <Step
            index="01"
            title="描述你的品牌"
            body="一句话或一份简报都行。Keystone 解析出受众、调性和要做的物料，解析不扣出图额度。"
          >
            <blockquote className="border-l-2 border-seal bg-surface p-4 text-sm leading-relaxed text-muted">
              “一家做手作陶器的小工作室，想要安静、温暖、有留白感的视觉。”
            </blockquote>
          </Step>
          <Step
            index="02"
            title="选一个方向，锁定"
            body="对比几个方向候选的预览板，挑中一个锁定。它会成为这个项目的风格线，其余方向留作备选。"
          >
            <div className="grid grid-cols-3 gap-2">
              {CASES.map((c, i) => (
                <div key={c.id} className="relative">
                  <Photo
                    image={shot(c.id, "key")}
                    alt={`${c.name} 方向候选`}
                    className={cn(
                      "aspect-4/5",
                      i === 0 ? "outline-2 outline-offset-2 outline-seal" : "opacity-55 grayscale",
                    )}
                    sizes="120px"
                  />
                  {i === 0 ? (
                    <span className="seal seal-sm absolute -right-1 -top-2">锁定</span>
                  ) : null}
                </div>
              ))}
            </div>
          </Step>
          <Step
            index="03"
            title="沿 DNA 出全套物料"
            body="主视觉、产品图、官网首屏都从同一份 DNA 生成。想微调就写回，生成新的风格版本，后面的图一起跟上。"
          >
            <div className="grid grid-cols-3 gap-2">
              {SLOTS.map((slot) => (
                <Photo
                  key={slot.id}
                  image={shot("atelier", slot.id)}
                  alt={`Atelier ${slot.label}`}
                  className="aspect-4/5"
                  sizes="120px"
                />
              ))}
            </div>
          </Step>
        </ol>
      </div>
    </section>
  );
}

function Step({
  index,
  title,
  body,
  children,
}: {
  index: string;
  title: string;
  body: string;
  children: ReactNode;
}) {
  return (
    <li className="reveal flex flex-col border-t border-fg pt-5">
      <span className="font-display text-sm text-seal">{index}</span>
      <h3 className="mt-3 text-xl text-fg">{title}</h3>
      <p className="mt-3 text-sm leading-relaxed text-muted">{body}</p>
      <div className="mt-6 md:mt-auto md:pt-6">{children}</div>
    </li>
  );
}

function Cases() {
  return (
    <section id="cases" className="scroll-mt-16 border-t border-border bg-surface">
      <div className="mx-auto max-w-6xl px-5 py-20 md:px-8 md:py-28">
        <SectionHeading
          label="案例"
          title="同一份 DNA，一整套物料"
          body="每一组都由同一份风格 DNA 生成。换物料、换构图，色温和材质不跑偏。"
        />
        <div className="mt-14 space-y-16 md:space-y-20">
          {CASES.map((c, i) => (
            <article key={c.id} className="grid gap-6 lg:grid-cols-12 lg:gap-10">
              <div className="reveal lg:col-span-4">
                <p className="font-display text-sm text-seal">{`0${i + 1}`}</p>
                <h3 className="mt-2 text-3xl text-fg">
                  {c.name} <span className="text-xl text-muted">{c.zh}</span>
                </h3>
                <p className="mt-2 text-sm text-muted">{c.brand}</p>
                <div className="reveal-swatches mt-5 flex h-6" aria-hidden>
                  {c.palette.map((color) => (
                    <span key={color} className="flex-1" style={{ background: color }} />
                  ))}
                </div>
                <ul className="mt-5 flex flex-wrap gap-2" aria-label={`${c.name} 的 DNA 关键词`}>
                  {c.dna.map((word) => (
                    <li key={word} className="border border-border px-2.5 py-1 text-xs text-muted">
                      {word}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="grid grid-cols-3 gap-2 sm:gap-3 lg:col-span-8">
                {SLOTS.map((slot) => (
                  <figure key={slot.id} className="group">
                    <Photo
                      image={shot(c.id, slot.id)}
                      alt={`${c.name} ${slot.label}`}
                      className="reveal-wipe aspect-4/5"
                      imageClassName="transition-transform duration-700 ease-smooth group-hover:scale-105"
                      sizes="(min-width: 1024px) 22vw, 33vw"
                    />
                    <figcaption className="mt-2 text-xs text-subtle">{slot.label}</figcaption>
                  </figure>
                ))}
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function PricingCta() {
  const facts = ["每天都有免费出图额度", "解析品牌简报不扣额度", "无需信用卡，登录即用"];
  return (
    <section id="pricing" className="scroll-mt-16 bg-fg text-bg">
      <div className="mx-auto grid max-w-6xl gap-10 px-5 py-20 md:px-8 md:py-28 lg:grid-cols-12 lg:items-end">
        <div className="reveal lg:col-span-7">
          <p className="section-label text-bg/60">定价</p>
          <h2 className="mt-4 text-3xl leading-tight md:text-5xl">
            免费开始，
            <span className="block">
              <span className="inline-block">锁定你的</span>
              <span className="inline-block">第一份品牌 DNA。</span>
            </span>
          </h2>
        </div>
        <div className="reveal lg:col-span-5">
          <ul className="divide-y divide-bg/15 border-y border-bg/15">
            {facts.map((fact, i) => (
              <li key={fact} className="flex items-baseline gap-4 py-3 text-sm text-bg/80">
                <span className="font-display text-xs text-bg/50">{`0${i + 1}`}</span>
                {fact}
              </li>
            ))}
          </ul>
          <Link href="/studio" className="btn btn-paper mt-8">
            进入工作台
            <ArrowRight className="btn-arrow size-4" aria-hidden />
          </Link>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  const links = [
    { href: "#how", label: "方法" },
    { href: "#cases", label: "案例" },
    { href: "/studio", label: "工作台" },
    { href: "/login", label: "登录" },
    { href: "/account", label: "账户" },
  ];
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-5 py-10 md:flex-row md:items-center md:justify-between md:px-8">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
          <Wordmark />
          <p className="text-sm text-subtle">先锁品牌方向，再出同一 DNA 的图。</p>
        </div>
        <nav aria-label="页脚" className="-mx-3 flex flex-wrap">
          {links.map((link) =>
            link.href.startsWith("#") ? (
              <a key={link.href} href={link.href} className="nav-link">
                {link.label}
              </a>
            ) : (
              <Link key={link.href} href={link.href} className="nav-link">
                {link.label}
              </Link>
            ),
          )}
        </nav>
      </div>
      <p className="mx-auto max-w-6xl px-5 pb-8 text-xs text-subtle md:px-8">© 2026 Keystone</p>
    </footer>
  );
}

function SectionHeading({ label, title, body }: { label: string; title: string; body?: string }) {
  return (
    <div className="reveal max-w-2xl">
      <p className="section-label">{label}</p>
      <h2 className="mt-4 text-3xl leading-tight text-fg md:text-5xl">{title}</h2>
      {body ? <p className="mt-4 max-w-lg text-base leading-relaxed text-muted">{body}</p> : null}
    </div>
  );
}

function StartLink({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <Link href="/studio" className={cn("btn btn-ink", className)}>
      {children}
    </Link>
  );
}

function Photo({
  image,
  alt,
  className,
  imageClassName,
  sizes,
}: {
  image: { src: string; width: number; height: number };
  alt: string;
  className?: string;
  imageClassName?: string;
  sizes: string;
}) {
  return (
    <div className={cn("relative overflow-hidden bg-surface-2", className)}>
      <Image
        src={image.src}
        alt={alt}
        width={image.width}
        height={image.height}
        sizes={sizes}
        className={cn("size-full object-cover", imageClassName)}
      />
    </div>
  );
}
