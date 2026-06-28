'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

interface Props {
  isAdmin: boolean
  hasLive: boolean
  unseenCount: number
}

export function NavLinks({ isAdmin, hasLive, unseenCount }: Props) {
  const pathname = usePathname()

  function cls(href: string, exact = false) {
    const active = (exact || href === '/')
      ? pathname === href
      : pathname === href || pathname.startsWith(href + '/')
    return active
      ? 'text-sm px-2.5 py-1 rounded-md bg-green-600 text-white font-semibold whitespace-nowrap transition-colors'
      : 'text-sm px-2.5 py-1 rounded-md text-gray-600 hover:bg-gray-100 hover:text-gray-900 whitespace-nowrap transition-colors'
  }

  return (
    <div className="flex flex-wrap items-center gap-x-0.5 gap-y-1 pb-2">
      <Link href="/" className={cls('/', true)}>Schedule</Link>
      {hasLive && (
        <Link href="/live" className="animate-pulse bg-green-500 text-white text-xs font-semibold px-2.5 py-1 rounded-md whitespace-nowrap transition-colors">
          Live
        </Link>
      )}
      <Link href="/leaderboard" className={cls('/leaderboard')}>Leaderboard</Link>
      <Link href="/me" className={cls('/me')}>My Stats</Link>
      <Link href="/groups" className={cls('/groups')}>Groups</Link>
      <Link href="/guide" className={cls('/guide')}>Guide</Link>
      <Link href="/bonus" className={cls('/bonus')}>Bonus</Link>
      <Link href="/bracket" className={cls('/bracket')}>Knockout Bracket</Link>
      <Link href="/compare" className={cls('/compare')}>Compare</Link>
      <Link href="/whats-new" className={`${cls('/whats-new')} inline-flex items-center gap-1`}>
        What&rsquo;s New
        {unseenCount > 0 && (
          <span className="inline-flex items-center justify-center h-4 min-w-4 px-1 rounded-full bg-green-500 text-white text-[10px] font-bold leading-none">
            {unseenCount}
          </span>
        )}
      </Link>
      {isAdmin && (
        <Link href="/admin" className={cls('/admin', true)}>Admin</Link>
      )}
      {isAdmin && (
        <Link href="/admin/pending" className={cls('/admin/pending', true)}>Pending</Link>
      )}
    </div>
  )
}
