import { SignIn } from '@clerk/nextjs'
import { Logo } from '@/components/ui/logo'

export default function SignInPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-muted/50 px-4">
      <div className="mb-8 flex flex-col items-center gap-3">
        <Logo size="lg" showWordmark={false} />
        <div className="text-center">
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            Welcome to Speclyn
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">Sign in to your account to continue</p>
        </div>
      </div>

      <SignIn
        appearance={{
          elements: {
            rootBox: 'w-full max-w-sm',
            card: 'rounded-xl border border-border bg-white shadow-card p-6',
            headerTitle: 'hidden',
            headerSubtitle: 'hidden',
            socialButtonsBlockButton:
              'rounded-lg border border-border bg-white text-sm font-medium text-foreground hover:bg-muted/50 transition-colors',
            dividerLine: 'bg-muted',
            dividerText: 'text-muted-foreground text-xs',
            formFieldLabel: 'text-sm font-medium text-foreground',
            formFieldInput:
              'rounded-lg border border-border bg-white px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-colors',
            footerActionText: 'text-sm text-muted-foreground',
            footerActionLink: 'text-sm font-medium text-indigo-600 hover:text-indigo-500',
            formButtonPrimary:
              'rounded-lg bg-indigo-600 text-sm font-medium hover:bg-indigo-500 transition-colors shadow-sm',
            identityPreviewText: 'text-foreground',
          },
        }}
      />
    </div>
  )
}
