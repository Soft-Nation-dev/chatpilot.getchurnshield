import Link from "next/link"
import { Logo } from "./logo"

const columns = [
  {
    title: "Product",
    links: [
      { href: "/features", label: "Features" },
      { href: "/how-it-works", label: "How it works" },
    ],
  },
  {
    title: "Company",
    links: [
      { href: "/", label: "About" },
      { href: "mailto:getchurnshield@gmail.com", label: "Contact" },
      { href: "/how-it-works", label: "How it works" },
    ],
  },
  {
    title: "Legal",
    links: [
      { href: "/privacy", label: "Privacy" },
      { href: "/terms", label: "Terms" },
      { href: "/data-deletion", label: "Data deletion" },
    ],
  },
]

export function MarketingFooter() {
  return (
    <footer className="relative border-t border-slate-200 bg-slate-50">
      <div className="mx-auto max-w-6xl px-6 py-16">
        <div className="grid gap-12 md:grid-cols-5">
          <div className="md:col-span-2">
            <Logo />
            <p className="mt-4 max-w-xs text-sm text-slate-600 leading-relaxed">
              Property lead sourcing, qualification, WhatsApp replies, and customer
              support — running 24/7 on your own number.
            </p>
            <p className="mt-6 text-xs text-slate-500">Built for property teams in Nigeria.</p>
          </div>
          {columns.map((col) => (
            <div key={col.title}>
              <h4 className="text-sm font-semibold text-slate-900">{col.title}</h4>
              <ul className="mt-4 space-y-2">
                {col.links.map((l) => (
                  <li key={l.label}>
                    <Link
                      href={l.href}
                      className="text-sm text-slate-600 transition-colors hover:text-emerald-600"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-slate-200 pt-8 text-sm text-slate-500 md:flex-row">
          <p>© {new Date().getFullYear()} GetChurnShield. All rights reserved.</p>
          <div className="flex items-center gap-2">
            <span className="inline-flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>All systems operational</span>
          </div>
        </div>
      </div>
    </footer>
  )
}
