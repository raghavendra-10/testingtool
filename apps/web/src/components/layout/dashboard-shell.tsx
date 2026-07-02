'use client'

import { UserButton } from '@clerk/nextjs'
import { useUIStore } from '@/store/ui'
import { Logo, SpeclynMark } from '@/components/ui/logo'
import { ChevronLeft, LayoutGrid, FolderOpen, FileText, Activity, Menu } from 'lucide-react'

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
                  <ChevronLeft className="h-4 w-4 shrink-0" />
                  Back to Projects
                </a>
              </div>
            </>
          ) : (
            <div className="space-y-0.5">
              {[
                { href: '/dashboard', label: 'Dashboard', icon: <LayoutGrid className="h-4 w-4" /> },
                { href: '/projects', label: 'Projects', icon: <FolderOpen className="h-4 w-4" /> },
                { href: '/templates', label: 'Templates', icon: <FileText className="h-4 w-4" /> },
                { href: '/activity', label: 'Activity', icon: <Activity className="h-4 w-4" /> },
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
          <Menu className="h-[18px] w-[18px]" />
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
