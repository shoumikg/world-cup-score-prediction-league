'use client'

import { useState, useActionState } from 'react'
import { login, signup } from '@/app/actions'

type ActionState = { error?: string } | undefined

const initState: ActionState = undefined

export default function LoginPage() {
  const [tab, setTab] = useState<'login' | 'signup'>('login')

  const [loginState, loginAction, loginPending] = useActionState(
    async (_: ActionState, formData: FormData) => login(formData),
    initState
  )
  const [signupState, signupAction, signupPending] = useActionState(
    async (_: ActionState, formData: FormData) => signup(formData),
    initState
  )

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-md p-8">
        <h1 className="text-2xl font-bold text-center mb-2">⚽ WC26 Predictor</h1>
        <p className="text-sm text-gray-500 text-center mb-6">FIFA World Cup 2026 Mini League</p>

        {/* Tabs */}
        <div className="flex rounded-lg bg-gray-100 p-1 mb-6">
          {(['login', 'signup'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-colors ${
                tab === t ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {t === 'login' ? 'Log in' : 'Sign up'}
            </button>
          ))}
        </div>

        {tab === 'login' ? (
          <form action={loginAction} className="space-y-4">
            <input
              name="username"
              type="text"
              placeholder="Username"
              autoComplete="username"
              required
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
            <input
              name="password"
              type="password"
              placeholder="Password"
              autoComplete="current-password"
              required
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
            {loginState?.error && (
              <p className="text-red-500 text-sm">{loginState.error}</p>
            )}
            <button
              type="submit"
              disabled={loginPending}
              className="w-full bg-green-600 hover:bg-green-700 text-white font-medium py-2 rounded-lg text-sm transition-colors disabled:opacity-60"
            >
              {loginPending ? 'Logging in…' : 'Log in'}
            </button>
          </form>
        ) : (
          <form action={signupAction} className="space-y-4">
            <input
              name="username"
              type="text"
              placeholder="Username (3–20 chars, a-z 0-9 _)"
              autoComplete="username"
              required
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
            <input
              name="password"
              type="password"
              placeholder="Password (min 8 chars)"
              autoComplete="new-password"
              required
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
            <input
              name="invite_code"
              type="text"
              placeholder="Invite code"
              required
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
            {signupState?.error && (
              <p className="text-red-500 text-sm">{signupState.error}</p>
            )}
            <button
              type="submit"
              disabled={signupPending}
              className="w-full bg-green-600 hover:bg-green-700 text-white font-medium py-2 rounded-lg text-sm transition-colors disabled:opacity-60"
            >
              {signupPending ? 'Creating account…' : 'Create account'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
