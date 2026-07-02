import { SignUp } from '@clerk/nextjs'
import { Logo } from '@/components/ui/logo'

export default function SignUpPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4">
      <div className="mb-8 flex flex-col items-center gap-3">
        <Logo size="lg" showWordmark={false} />
        <div className="text-center">
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">
            Create your account
          </h1>
          <p className="mt-1 text-sm text-slate-500">Start testing your APIs automatically</p>
        </div>
      </div>

      <SignUp
        appearance={{
          elements: {
            rootBox: 'w-full max-w-sm',
            card: 'rounded-xl border border-slate-200 bg-white shadow-card p-6',
            headerTitle: 'hidden',
            headerSubtitle: 'hidden',
            socialButtonsBlockButton:
              'rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors',
            dividerLine: 'bg-slate-100',
            dividerText: 'text-slate-400 text-xs',
            formFieldLabel: 'text-sm font-medium text-slate-700',
            formFieldInput:
              'rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-colors',
            footerActionText: 'text-sm text-slate-500',
            footerActionLink: 'text-sm font-medium text-indigo-600 hover:text-indigo-500',
            formButtonPrimary:
              'rounded-lg bg-indigo-600 text-sm font-medium hover:bg-indigo-500 transition-colors shadow-sm',
          },
        }}
      />
    </div>
  )
}
