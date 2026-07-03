'use client'

import { AreaChart, Area, ResponsiveContainer, Tooltip, XAxis } from 'recharts'
import { cn } from '@/lib/utils'

interface SparklineChartProps {
  data: Array<{ value: number; label?: string }>
  color?: string
  height?: number
  showTooltip?: boolean
  className?: string
}

export function SparklineChart({
  data,
  color = '#6366f1',
  height = 40,
  showTooltip = true,
  className,
}: SparklineChartProps) {
  if (data.length === 0) return null

  return (
    <div className={cn('w-full', className)} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={`gradient-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.3} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          {showTooltip && (
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.[0]) return null
                const entry = payload[0]
                return (
                  <div className="rounded-lg border border-border bg-popover px-2 py-1 text-xs shadow-sm">
                    <span className="font-medium text-popover-foreground">{String(entry.value)}</span>
                    {entry.payload?.label && (
                      <span className="ml-1 text-muted-foreground">{String(entry.payload.label)}</span>
                    )}
                  </div>
                )
              }}
            />
          )}
          <Area
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={1.5}
            fill={`url(#gradient-${color.replace('#', '')})`}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

interface StatCardProps {
  label: string
  value: string | number
  trend?: Array<{ value: number }>
  trendColor?: string
  suffix?: string
  className?: string
}

export function StatCard({ label, value, trend, trendColor = '#6366f1', suffix, className }: StatCardProps) {
  return (
    <div className={cn('rounded-xl border border-border bg-card p-4', className)}>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="mt-1 flex items-end justify-between gap-4">
        <p className="text-2xl font-bold text-foreground">
          {value}{suffix && <span className="text-sm font-normal text-muted-foreground">{suffix}</span>}
        </p>
        {trend && trend.length > 1 && (
          <SparklineChart data={trend} color={trendColor} height={32} showTooltip={false} className="w-20" />
        )}
      </div>
    </div>
  )
}
