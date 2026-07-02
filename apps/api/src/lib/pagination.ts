import { z } from 'zod'

const PaginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
})

export function parsePagination(query: Record<string, unknown>): { limit: number; offset: number } {
  const parsed = PaginationSchema.safeParse(query)
  if (!parsed.success) return { limit: 25, offset: 0 }
  return parsed.data
}

export function paginatedResponse<T>(data: T[], total: number, limit: number, offset: number) {
  return {
    success: true as const,
    data,
    meta: {
      total,
      limit,
      offset,
      hasMore: offset + data.length < total,
    },
  }
}
