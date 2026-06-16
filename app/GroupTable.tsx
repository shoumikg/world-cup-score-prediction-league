import Link from 'next/link'
import { teamDisplay } from '@/lib/flags'
import type { TableRow } from '@/lib/standings'

interface Props {
  group: string
  rows: TableRow[]
  liveTeams?: Set<string>
  highlightTeam?: string
  groupPageLink?: boolean // show "All matches →" in header
}

export function GroupTable({ group, rows, liveTeams, highlightTeam, groupPageLink }: Props) {
  return (
    <section className="bg-white rounded-xl border shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b bg-gray-50">
        <h2 className="text-sm font-bold">Group {group}</h2>
        {groupPageLink && (
          <Link href={`/groups/${encodeURIComponent(group)}`} className="text-xs text-gray-400 hover:text-gray-600">
            All matches →
          </Link>
        )}
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-gray-400">
            <th className="text-left font-medium pl-4 py-1.5">Team</th>
            <th className="font-medium w-8">MP</th>
            <th className="font-medium w-7">W</th>
            <th className="font-medium w-7">D</th>
            <th className="font-medium w-7">L</th>
            <th className="font-medium w-8">GF</th>
            <th className="font-medium w-8">GA</th>
            <th className="font-medium w-8">GD</th>
            <th className="font-semibold w-9 pr-4">Pts</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.team} className={`border-t ${r.team === highlightTeam ? 'bg-blue-50 dark:bg-blue-500/15' : ''}`}>
              <td className="pl-4 py-2">
                <span className="text-xs text-gray-400 w-4 inline-block">{i + 1}</span>
                <Link href={`/?team=${encodeURIComponent(r.team)}`} className="font-medium hover:underline decoration-gray-300">
                  {teamDisplay(r.team, r.team)}
                </Link>
                {liveTeams?.has(r.team) && (
                  <span className="ml-1.5 inline-block w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse align-middle" title="Playing now" />
                )}
              </td>
              <td className="text-center text-gray-600">{r.mp}</td>
              <td className="text-center text-gray-600">{r.w}</td>
              <td className="text-center text-gray-600">{r.d}</td>
              <td className="text-center text-gray-600">{r.l}</td>
              <td className="text-center text-gray-600">{r.gf}</td>
              <td className="text-center text-gray-600">{r.ga}</td>
              <td className="text-center text-gray-600">{r.gd}</td>
              <td className="text-center font-bold pr-4">{r.pts}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
