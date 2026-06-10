import type { Match, Prediction, Stage } from '@/lib/types'

const STAGE_LABELS: Record<string, string> = {
  r32: 'R32', r16: 'R16', qf: 'QF', sf: 'SF', third: '3rd', final: 'Final',
}

export function stageLabel(stage: Stage | string): string {
  return STAGE_LABELS[stage] ?? stage.toUpperCase()
}

export function scoreColor(p: Prediction, m: Match): string {
  if (m.home_score === null) return 'bg-gray-100 text-gray-700'
  if (p.home_pred === m.home_score && p.away_pred === m.away_score) {
    return 'bg-green-100 text-green-800'
  }
  const actualDir = Math.sign((m.home_score ?? 0) - (m.away_score ?? 0))
  const predDir   = Math.sign(p.home_pred - p.away_pred)
  if (actualDir === predDir) return 'bg-yellow-100 text-yellow-800'
  return 'bg-red-100 text-red-700'
}
