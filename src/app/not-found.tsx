import Link from "next/link";

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center bg-bg px-5 text-center">
      <div>
        <p className="section-label">404</p>
        <h1 className="mt-2 font-display text-3xl tracking-tight text-fg">页面不存在</h1>
        <p className="mt-2 text-sm text-muted">这个地址没有对应的页面。</p>
        <Link href="/studio" className="btn btn-ink mt-6 h-11 px-4">
          回到工作台
        </Link>
      </div>
    </main>
  );
}
