'use client'

import { UserButton } from '@clerk/nextjs'
import { useUIStore } from '@/store/ui'
import { Logo, SpeclynMark } from '@/components/ui/logo'

interface DashboardShellProps {
  children: React.ReactNode
  sidebarContent?: React.ReactNode
  activePath?: string // current route path for highlighting
}

export function DashboardShell({ children, sidebarContent, activePath }: DashboardShellProps) {
  const { sidebarOpen, toggleSidebar } = useUIStore()

  return (
    <div className="min-h-screen bg-muted/50">
      {/* Fixed sidebar */}
      <aside
        className={`${
          sidebarOpen ? 'w-56' : 'w-0 overflow-hidden'
        } fixed inset-y-0 left-0 z-30 flex flex-col border-r border-border bg-white transition-all duration-200`}
      >
        <div className="flex h-14 shrink-0 items-center border-b border-border px-4">
          <Logo size="md" />
        </div>
        <nav className="flex flex-1 flex-col p-2 pt-3 overflow-y-auto">
          {sidebarContent ? (
            <>
              <div className="flex-1 space-y-0.5">
                {sidebarContent}
              </div>
              <div className="border-t border-border pt-2 mt-2">
                <a
                  href="/projects"
                  className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted/50 hover:text-muted-foreground transition-colors"
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="shrink-0">
                    <path d="M10 12L6 8l4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  Back to Projects
                </a>
              </div>
            </>
          ) : (
            <div className="space-y-0.5">
              {[
                { href: '/dashboard', label: 'Dashboard', icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="1" y="1" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.3"/><rect x="9" y="1" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.3"/><rect x="1" y="9" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.3"/><rect x="9" y="9" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.3"/></svg> },
                { href: '/projects', label: 'Projects', icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 4h12M2 4v9a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V4M2 4l2-2h8l2 2" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/></svg> },
                { href: '/templates', label: 'Templates', icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M4 2h6l4 4v8a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z" stroke="currentColor" strokeWidth="1.3"/><path d="M10 2v4h4" stroke="currentColor" strokeWidth="1.3"/><path d="M6 9h4M6 11h2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg> },
                { href: '/activity', label: 'Activity', icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 3v10M4 7l4-4 4 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg> },
              ].map(item => {
                const isActive = activePath === item.href
                return (
                  <a
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-indigo-50 text-indigo-600'
                        : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                    }`}
                  >
                    <span className="shrink-0">{item.icon}</span>
                    {item.label}
                  </a>
                )
              })}
            </div>
          )}
        </nav>
      </aside>

      {/* Fixed navbar */}
      <header
        className={`fixed top-0 right-0 z-20 flex h-14 items-center justify-between border-b border-border bg-white px-5 transition-all duration-200 ${
          sidebarOpen ? 'left-56' : 'left-0'
        }`}
      >
        <button
          onClick={toggleSidebar}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-muted-foreground transition-colors"
          aria-label="Toggle sidebar"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M2.5 5h13M2.5 9h13M2.5 13h13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>

        {!sidebarOpen && (
          <div className="absolute left-1/2 -translate-x-1/2">
            <SpeclynMark size={26} />
          </div>
        )}

        <UserButton afterSignOutUrl="/sign-in" />
      </header>

      {/* Scrollable main content — offset by sidebar width + navbar height */}
      <main
        className={`pt-14 min-h-screen transition-all duration-200 ${sidebarOpen ? 'ml-56' : 'ml-0'}`}
      >
        <div className="p-6">{children}</div>
      </main>
    </div>
  )
}
