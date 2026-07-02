interface LogoProps {
  size?: 'sm' | 'md' | 'lg'
  showWordmark?: boolean
  className?: string
}

const sizes = {
  sm: { box: 22, wordmark: 13, gap: 7 },
  md: { box: 28, wordmark: 15, gap: 8 },
  lg: { box: 38, wordmark: 20, gap: 10 },
}

export function Logo({ size = 'md', showWordmark = true, className = '' }: LogoProps) {
  const s = sizes[size]
  return (
    <div className={`flex items-center select-none ${className}`} style={{ gap: s.gap }}>
      <SpeclynMark size={s.box} />
      {showWordmark && (
        <span
          style={{
            fontSize: s.wordmark,
            fontWeight: 600,
            letterSpacing: '-0.025em',
            color: '#0f172a',
            lineHeight: 1,
            fontFamily: 'var(--font-geist-sans), system-ui, sans-serif',
          }}
        >
          Speclyn
        </span>
      )}
    </div>
  )
}

export function SpeclynMark({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 28 28"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      style={{ display: 'block', flexShrink: 0 }}
    >
      {/* Indigo square background */}
      <rect width="28" height="28" rx="6.5" fill="#6366f1" />

      {/*
        Geometric S — two symmetric arcs.
        Top arc: right side → top → left side (center y=10)
        Bottom arc: left side → bottom → right side (center y=18)
        Connected at mid-left and mid-right.
      */}
      <path
        d="M19.5 10C19.5 8.067 17.933 6.5 16 6.5H13C11.067 6.5 9.5 8.067 9.5 10C9.5 11.933 11.067 13.5 13 13.5H15C16.933 13.5 18.5 15.067 18.5 17C18.5 18.933 16.933 20.5 15 20.5H12C10.067 20.5 8.5 18.933 8.5 17"
        stroke="white"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  )
}
