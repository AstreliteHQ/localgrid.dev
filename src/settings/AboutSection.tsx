import type { ComponentType } from 'react'
import { BookOpen, Bug, ExternalLink, History, Scale } from 'lucide-react'
import { GithubIcon } from '@/components/icons/GithubIcon'
import { LogoIcon } from '@/components/icons/LogoIcon'

const REPOSITORY_URL = 'https://github.com/AstreliteHQ/localgrid.dev'

interface LinkEntry {
  label: string
  href: string
  icon: ComponentType<{ className?: string }>
}

const LINKS: LinkEntry[] = [
  { label: 'About page', href: `${import.meta.env.BASE_URL}about.html`, icon: BookOpen },
  { label: 'GitHub', href: REPOSITORY_URL, icon: GithubIcon },
  { label: 'Report an issue', href: `${REPOSITORY_URL}/issues`, icon: Bug },
  { label: 'Changelog', href: `${REPOSITORY_URL}/blob/main/CHANGELOG.md`, icon: History },
  { label: 'License (MIT)', href: `${REPOSITORY_URL}/blob/main/LICENSE`, icon: Scale },
]

export function AboutSection() {
  return (
    <div className="flex flex-col gap-6">
      <section className="flex items-center gap-3">
        <LogoIcon className="size-8 text-foreground" />
        <div>
          <div className="font-mono text-base font-medium tracking-tight">
            localgrid<span className="text-muted-foreground">.dev</span>
            <span className="ml-2 text-xs text-muted-foreground">v{__APP_VERSION__}</span>
          </div>
          <p className="text-xs text-muted-foreground">Developer tools on one dashboard.</p>
        </div>
      </section>

      <ul className="divide-y divide-border rounded-md border border-border text-sm">
        {LINKS.map((link) => {
          // Same-site pages open in place; external ones in a new tab.
          const external = link.href.startsWith('http')
          return (
            <li key={link.href}>
              <a
                href={link.href}
                target={external ? '_blank' : undefined}
                rel={external ? 'noreferrer' : undefined}
                className="flex items-center gap-3 px-3 py-2 hover:bg-muted"
              >
                <link.icon className="size-4 shrink-0 text-muted-foreground" />
                <span className="flex-1 text-foreground">{link.label}</span>
                {external && <ExternalLink className="size-3.5 shrink-0 text-muted-foreground" />}
              </a>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
