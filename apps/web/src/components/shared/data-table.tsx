'use client'

import { useState, useRef, useCallback } from 'react'
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
  type RowSelectionState,
} from '@tanstack/react-table'
import { useVirtualizer } from '@tanstack/react-virtual'
import { ArrowUpDown, ArrowUp, ArrowDown, Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Skeleton } from './skeleton'

interface DataTableProps<TData> {
  columns: ColumnDef<TData, unknown>[]
  data: TData[]
  isLoading?: boolean
  searchPlaceholder?: string
  searchValue?: string
  onSearchChange?: (value: string) => void
  enableSelection?: boolean
  onSelectionChange?: (selectedRows: TData[]) => void
  bulkActions?: React.ReactNode
  emptyMessage?: string
  className?: string
  /** Total rows (for server-side pagination display) */
  total?: number
  /** Current page info */
  page?: { limit: number; offset: number }
  onPageChange?: (offset: number) => void
}

export function DataTable<TData extends { id?: string }>({
  columns,
  data,
  isLoading,
  searchPlaceholder = 'Search...',
  searchValue,
  onSearchChange,
  enableSelection,
  onSelectionChange,
  bulkActions,
  emptyMessage = 'No data found.',
  className,
  total,
  page,
  onPageChange,
}: DataTableProps<TData>) {
  const [sorting, setSorting] = useState<SortingState>([])
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const parentRef = useRef<HTMLDivElement>(null)

  const table = useReactTable({
    data,
    columns,
    state: { sorting, rowSelection },
    onSortingChange: setSorting,
    onRowSelectionChange: (updater) => {
      const next = typeof updater === 'function' ? updater(rowSelection) : updater
      setRowSelection(next)
      if (onSelectionChange) {
        const selectedIndices = Object.keys(next).filter(k => next[k]).map(Number)
        onSelectionChange(selectedIndices.map(i => data[i]!))
      }
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    enableRowSelection: enableSelection ?? false,
  })

  const { rows } = table.getRowModel()

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 48,
    overscan: 10,
  })

  const selectedCount = Object.values(rowSelection).filter(Boolean).length

  if (isLoading) {
    return (
      <div className={cn('rounded-xl border border-border bg-card overflow-hidden', className)}>
        <div className="border-b border-border bg-muted/30 px-4 py-3">
          <Skeleton className="h-4 w-48" />
        </div>
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="border-b border-border px-4 py-3 last:border-b-0">
            <Skeleton className="h-4 w-full" />
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className={cn('space-y-3', className)}>
      {/* Search + bulk actions */}
      {(onSearchChange || (selectedCount > 0 && bulkActions)) && (
        <div className="flex items-center gap-3">
          {onSearchChange && (
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={searchValue ?? ''}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder={searchPlaceholder}
                className="w-full rounded-lg border border-input bg-background pl-9 pr-8 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
              />
              {searchValue && (
                <button onClick={() => onSearchChange('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          )}
          {selectedCount > 0 && bulkActions && (
            <div className="flex items-center gap-2 rounded-lg bg-primary/10 px-3 py-1.5">
              <span className="text-xs font-medium text-primary">{selectedCount} selected</span>
              {bulkActions}
            </div>
          )}
        </div>
      )}

      {/* Table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {/* Header */}
        <div className="border-b border-border bg-muted/30">
          {table.getHeaderGroups().map(headerGroup => (
            <div key={headerGroup.id} className="flex items-center">
              {headerGroup.headers.map(header => (
                <div
                  key={header.id}
                  className={cn(
                    'flex-1 px-4 py-2.5 text-xs font-medium text-muted-foreground',
                    header.column.getCanSort() && 'cursor-pointer select-none hover:text-foreground',
                  )}
                  style={{ width: header.getSize(), minWidth: header.getSize() }}
                  onClick={header.column.getToggleSortingHandler()}
                >
                  <span className="flex items-center gap-1">
                    {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                    {header.column.getIsSorted() === 'asc' ? <ArrowUp className="h-3 w-3" /> :
                     header.column.getIsSorted() === 'desc' ? <ArrowDown className="h-3 w-3" /> :
                     header.column.getCanSort() ? <ArrowUpDown className="h-3 w-3 opacity-30" /> : null}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* Body (virtualized) */}
        {rows.length === 0 ? (
          <div className="px-4 py-12 text-center text-sm text-muted-foreground">
            {emptyMessage}
          </div>
        ) : (
          <div ref={parentRef} className="max-h-[65vh] overflow-auto">
            <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}>
              {virtualizer.getVirtualItems().map(virtualRow => {
                const row = rows[virtualRow.index]!
                return (
                  <div
                    key={row.id}
                    className={cn(
                      'absolute left-0 right-0 flex items-center border-b border-border transition-colors hover:bg-muted/30',
                      row.getIsSelected() && 'bg-primary/5',
                    )}
                    style={{ height: `${virtualRow.size}px`, transform: `translateY(${virtualRow.start}px)` }}
                  >
                    {row.getVisibleCells().map(cell => (
                      <div
                        key={cell.id}
                        className="flex-1 px-4 py-2.5 text-sm text-foreground"
                        style={{ width: cell.column.getSize(), minWidth: cell.column.getSize() }}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </div>
                    ))}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Pagination footer */}
        {total != null && page && onPageChange && (
          <div className="flex items-center justify-between border-t border-border px-4 py-2.5">
            <p className="text-xs text-muted-foreground">
              Showing {page.offset + 1}–{Math.min(page.offset + data.length, total)} of {total}
            </p>
            <div className="flex gap-1">
              <button
                onClick={() => onPageChange(Math.max(0, page.offset - page.limit))}
                disabled={page.offset === 0}
                className="rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted disabled:opacity-30"
              >
                Previous
              </button>
              <button
                onClick={() => onPageChange(page.offset + page.limit)}
                disabled={page.offset + data.length >= total}
                className="rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted disabled:opacity-30"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
