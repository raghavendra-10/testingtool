import type { Metadata } from 'next'
import { Inter, JetBrains_Mono } from 'next/font/google'
import { ClerkProvider } from '@clerk/nextjs'
import { Toaster } from 'sonner'
import { Providers } from './providers'
import { CommandPalette } from '@/components/shared/command-palette'
import './globals.css'

const fontSans = Inter({ subsets: ['latin'], variable: '--font-sans' })
const fontMono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono' })

export const metadata: Metadata = {
  title: 'Speclyn — From Spec to Certainty',
  description: 'AI-powered autonomous API testing platform',
  icons: { icon: '/favicon.svg' },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${fontSans.variable} ${fontMono.variable}`}>
      <body className="font-sans antialiased">
        <ClerkProvider>
          <Providers>
            {children}
            <CommandPalette />
          </Providers>
        </ClerkProvider>
        <Toaster richColors position="bottom-right" />
      </body>
    </html>
  )
}
