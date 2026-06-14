import { createClient } from '@/lib/supabase/server'
import { scoreColor, stageLabel } from '@/lib/scoring'
import { TeamLink } from '@/app/TeamLink'
import type { Match, Prediction } from '@/lib/types'

export const dynamic = 'force-dynamic'

function feederMatchId(source: string | null): number | null {
  if (!source) return null
  const m = source.match(/M(\d+)/i)
  return m ? parseInt(m[1]) : null
}

interface BracketNode {
  match: Match
  pred: Prediction | undefined
  topFeeder: BracketNode | null
  bottomFeeder: BracketNode | null
}

function buildNode(
  match: Match,
  byId: Map<number, Match>,
  predMap: Map<number, Prediction>
): BracketNode {
  const topId  = feederMatchId(match.home_source)
  const botId  = feederMatchId(match.away_source)
  const topM   = topId !== null ? byId.get(topId) : undefined
  const botM   = botId !== null ? byId.get(botId) : undefined
  return {
    match,
    pred: predMap.get(match.id),
    topFeeder:    topM ? buildNode(topM, byId, predMap) : null,
    bottomFeeder: botM ? buildNode(botM, byId, predMap) : null,
  }
}

export default async function BracketPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const [{ data: matchesRaw }, { data: predsRaw }] = await Promise.all([
    supabase.from('matches').select('*').neq('stage', 'group').order('kickoff_utc'),
    supabase.from('predictions').select('*'),
  ])

  const matches = (matchesRaw ?? []) as Match[]
  const preds   = (predsRaw   ?? []) as Prediction[]

  const byId = new Map<number, Match>()
  for (const m of matches) byId.set(m.id, m)

  const predMap = new Map<number, Prediction>()
  for (const p of preds) {
    if (p.user_id === user.id) predMap.set(p.match_id, p)
  }

  const finalMatch = matches.find(m => m.stage === 'final')
  const thirdMatch = matches.find(m => m.stage === 'third')

  if (!finalMatch) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-6">
        <h1 className="text-xl font-bold mb-1">Knockout Bracket</h1>
        <p className="text-sm text-gray-500">Knockout fixtures are not yet available.</p>
      </div>
    )
  }

  const tree = buildNode(finalMatch, byId, predMap)

  return (
    <div className="px-4 py-6">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-xl font-bold mb-1">Knockout Bracket</h1>
        <p className="text-sm text-gray-500 mb-6">
          Read left → right. Your pick is shown in each cell; colours apply once results are in.
        </p>
      </div>
      <div className="overflow-x-auto pb-4">
        <div className="inline-flex">
          <BracketTree node={tree} />
        </div>
      </div>
      {thirdMatch && (
        <div className="max-w-4xl mx-auto mt-6">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
            Third place
          </p>
          <MatchCell match={thirdMatch} pred={predMap.get(thirdMatch.id)} />
        </div>
      )}
    </div>
  )
}

function BracketTree({ node }: { node: BracketNode }) {
  const isLeaf = !node.topFeeder && !node.bottomFeeder
  if (isLeaf) {
    return (
      <div className="flex items-center py-1">
        <MatchCell match={node.match} pred={node.pred} />
      </div>
    )
  }
  return (
    <div className="flex items-stretch">
      {/* Left: two sub-trees stacked */}
      <div className="flex flex-col">
        {node.topFeeder
          ? <BracketTree node={node.topFeeder} />
          : <div className="flex-1" />}
        {node.bottomFeeder
          ? <BracketTree node={node.bottomFeeder} />
          : <div className="flex-1" />}
      </div>
      {/* Connector: top half closes down-right, bottom half closes up-right */}
      <div className="w-4 shrink-0 self-stretch flex flex-col">
        <div className="flex-1 border-r border-b border-gray-200" />
        <div className="flex-1 border-r border-t border-gray-200" />
      </div>
      {/* Current match, centred in the combined height of its feeders */}
      <div className="flex items-center shrink-0">
        <MatchCell match={node.match} pred={node.pred} />
      </div>
    </div>
  )
}

function MatchCell({ match, pred }: { match: Match; pred: Prediction | undefined }) {
  const hasResult   = match.home_score !== null
  const isPlaceholder = !match.home_team

  return (
    <div className="w-36 border rounded-lg bg-white shadow-sm p-2.5 text-xs shrink-0">
      <div className="text-[10px] text-gray-400 mb-1.5">
        #{match.id} · {stageLabel(match.stage)}
      </div>
      <div className="space-y-0.5 mb-1.5">
        <div className="flex items-center justify-between gap-1">
          <span className={`truncate ${isPlaceholder ? 'text-[10px] text-gray-400 italic' : 'font-medium text-gray-800'}`}>
            <TeamLink team={match.home_team} fallback={match.home_source ?? '?'} />
          </span>
          {hasResult && <span className="font-bold shrink-0 text-gray-900">{match.home_score}</span>}
        </div>
        <div className="flex items-center justify-between gap-1">
          <span className={`truncate ${isPlaceholder ? 'text-[10px] text-gray-400 italic' : 'font-medium text-gray-800'}`}>
            <TeamLink team={match.away_team} fallback={match.away_source ?? '?'} />
          </span>
          {hasResult && <span className="font-bold shrink-0 text-gray-900">{match.away_score}</span>}
        </div>
      </div>
      <div className="pt-1.5 border-t border-gray-100">
        {pred ? (
          <div className="flex items-center gap-1">
            <span className="text-gray-400">pick</span>
            <span className={`px-1 py-0.5 rounded font-semibold ${
              hasResult ? scoreColor(pred, match) : 'bg-gray-100 text-gray-600'
            }`}>
              {pred.home_pred}–{pred.away_pred}
            </span>
          </div>
        ) : (
          <span className="text-gray-300 italic">no pick</span>
        )}
      </div>
    </div>
  )
}
