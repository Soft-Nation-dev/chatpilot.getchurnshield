import Link from 'next/link'
import { MarketingNav } from '@/components/marketing/nav'
import { MarketingFooter } from '@/components/marketing/footer'

export type LegalSection = {
  id: string
  title: string
  content: React.ReactNode
}

export function LegalShell({
  eyebrow,
  title,
  summary,
  effectiveDate,
  sections,
}: {
  eyebrow: string
  title: string
  summary: string
  effectiveDate: string
  sections: LegalSection[]
}) {
  return (
    <main className="min-h-screen bg-gradient-to-b from-white via-emerald-50/30 to-white">
      <MarketingNav />
      <section className="relative overflow-hidden border-b border-slate-200 pt-32 pb-16">
        <div className="absolute inset-0 grid-bg opacity-50" />
        <div className="absolute left-1/2 top-0 -z-10 h-96 w-[760px] -translate-x-1/2 rounded-full bg-emerald-300/20 blur-[100px]" />
        <div className="relative mx-auto max-w-4xl px-6">
          <div className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
            {eyebrow}
          </div>
          <h1 className="mt-5 text-4xl font-bold tracking-tight text-slate-950 sm:text-5xl">{title}</h1>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-slate-600">{summary}</p>
          <div className="mt-7 inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white/80 px-4 py-2 text-sm text-slate-500 shadow-sm backdrop-blur">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            Effective {effectiveDate}
          </div>
        </div>
      </section>

      <div className="mx-auto grid max-w-6xl gap-10 px-6 py-14 lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">On this page</p>
            <nav className="mt-4 space-y-1">
              {sections.map(section => (
                <Link key={section.id} href={`#${section.id}`} className="block rounded-lg px-3 py-2 text-sm text-slate-600 transition-colors hover:bg-emerald-50 hover:text-emerald-700">
                  {section.title}
                </Link>
              ))}
            </nav>
          </div>
        </aside>

        <article className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="divide-y divide-slate-100">
            {sections.map((section, index) => (
              <section key={section.id} id={section.id} className="scroll-mt-28 px-6 py-8 sm:px-10 sm:py-10">
                <div className="flex gap-4">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-xs font-bold text-emerald-700">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <div className="min-w-0 flex-1">
                    <h2 className="text-xl font-semibold text-slate-900">{section.title}</h2>
                    <div className="mt-4 space-y-4 text-sm leading-7 text-slate-600 [&_a]:font-medium [&_a]:text-emerald-700 [&_a]:underline-offset-4 hover:[&_a]:underline [&_li]:pl-1 [&_strong]:font-semibold [&_strong]:text-slate-800 [&_ul]:ml-5 [&_ul]:list-disc [&_ul]:space-y-2">
                      {section.content}
                    </div>
                  </div>
                </div>
              </section>
            ))}
          </div>
        </article>
      </div>
      <MarketingFooter />
    </main>
  )
}
