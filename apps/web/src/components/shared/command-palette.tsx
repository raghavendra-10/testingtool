'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Command } from 'cmdk'
import { useQuery } from '@tanstack/react-query'
import { useApiClient } from '@/hooks/use-api-client'
import {
  Search, FolderOpen, Plus, Play, BarChart3, FileCheck,
  Settings, HelpCircle, Plug, ListChecks,
} from 'lucide-react'

interface Project { id: string; name: string }

export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const router = useRouter()
  const { request } = useApiClient()

  const { data: projects } = useQuery<Project[]>({
    queryKey: ['projects-cmd'],
    queryFn: () => request<Project[]>('/projects'),
    enabled: open,
    staleTime: 30_000,
  })

  // ⌘K / Ctrl+K to toggle
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault()
      setOpen(o => !o)
    }
    if (e.key === 'Escape') setOpen(false)
  }, [])

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  function navigate(path: string) {
    setOpen(false)
    router.push(path)
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50">
      <div className="fixed inset-0 bg-background/80 backdrop-blur-sm" onClick={() => setOpen(false)} />
      <div className="fixed left-1/2 top-[20%] z-50 w-full max-w-lg -translate-x-1/2">
        <Command className="rounded-xl border border-border bg-card shadow-2xl overflow-hidden">
          <div className="flex items-center gap-2 border-b border-border px-4">
            <Search className="h-4 w-4 text-muted-foreground shrink-0" />
            <Command.Input
              placeholder="Search projects, pages, actions..."
              className="w-full border-0 bg-transparent py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
              autoFocus
            />
            <kbd className="hidden shrink-0 rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground sm:inline">
              ESC
            </kbd>
          </div>

          <Command.List className="max-h-80 overflow-y-auto p-2">
            <Command.Empty className="py-6 text-center text-xs text-muted-foreground">
              No results found.
            </Command.Empty>

            <Command.Group heading="Actions" className="text-xs font-medium text-muted-foreground px-2 py-1.5">
              <Command.Item onSelect={() => navigate('/projects/new')} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-sm text-foreground aria-selected:bg-accent">
                <Plus className="h-4 w-4 text-muted-foreground" />
                New Project
              </Command.Item>
            </Command.Group>

            <Command.Group heading="Navigation" className="text-xs font-medium text-muted-foreground px-2 py-1.5">
              <Command.Item onSelect={() => navigate('/projects')} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-sm text-foreground aria-selected:bg-accent">
                <FolderOpen className="h-4 w-4 text-muted-foreground" />
                All Projects
              </Command.Item>
              <Command.Item onSelect={() => navigate('/dashboard')} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-sm text-foreground aria-selected:bg-accent">
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
                Dashboard
              </Command.Item>
            </Command.Group>

            {projects && projects.length > 0 && (
              <Command.Group heading="Projects" className="text-xs font-medium text-muted-foreground px-2 py-1.5">
                {projects.slice(0, 8).map(p => (
                  <Command.Item
                    key={p.id}
                    value={p.name}
                    onSelect={() => navigate(`/projects/${p.id}`)}
                    className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-sm text-foreground aria-selected:bg-accent"
                  >
                    <FolderOpen className="h-4 w-4 text-muted-foreground" />
                    {p.name}
                  </Command.Item>
                ))}
              </Command.Group>
            )}

            <Command.Group heading="Help" className="text-xs font-medium text-muted-foreground px-2 py-1.5">
              <Command.Item onSelect={() => { setOpen(false) }} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-sm text-foreground aria-selected:bg-accent">
                <HelpCircle className="h-4 w-4 text-muted-foreground" />
                Keyboard Shortcuts
                <span className="ml-auto text-xs text-muted-foreground">?</span>
              </Command.Item>
            </Command.Group>
          </Command.List>

          <div className="flex items-center justify-between border-t border-border px-4 py-2">
            <p className="text-[10px] text-muted-foreground">
              <kbd className="rounded border border-border bg-muted px-1 font-mono">↑↓</kbd> navigate
              <span className="mx-1.5">·</span>
              <kbd className="rounded border border-border bg-muted px-1 font-mono">↵</kbd> select
            </p>
          </div>
        </Command>
      </div>
    </div>
  )
}
