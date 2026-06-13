import { calcAge } from '@/lib/openfootball'
import type { OFPlayer } from '@/lib/openfootball'

const POS_ORDER: OFPlayer['pos'][] = ['GK', 'DF', 'MF', 'FW']
const POS_LABEL: Record<OFPlayer['pos'], string> = {
  GK: 'Goalkeepers',
  DF: 'Defenders',
  MF: 'Midfielders',
  FW: 'Forwards',
}

interface Props {
  players: OFPlayer[]
}

export function SquadSection({ players }: Props) {
  const byPos = Object.fromEntries(
    POS_ORDER.map(pos => [
      pos,
      players.filter(p => p.pos === pos).sort((a, b) => a.number - b.number),
    ])
  ) as Record<OFPlayer['pos'], OFPlayer[]>

  return (
    <div className="bg-white rounded-xl border shadow-sm p-4 mb-6">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-4">
        Squad · {players.length} players
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-5">
        {POS_ORDER.map(pos => {
          const group = byPos[pos]
          if (group.length === 0) return null
          return (
            <div key={pos}>
              <p className="text-xs font-semibold text-gray-400 mb-1.5">
                {POS_LABEL[pos]} <span className="font-normal">({group.length})</span>
              </p>
              <div className="space-y-0.5">
                {group.map(player => (
                  <div key={player.number} className="flex items-center gap-2">
                    <span className="text-xs text-gray-400 tabular-nums w-5 text-right shrink-0">
                      {player.number}
                    </span>
                    <span className="text-sm flex-1 min-w-0 truncate">{player.name}</span>
                    <span className="text-xs text-gray-400 shrink-0">
                      {calcAge(player.date_of_birth)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
