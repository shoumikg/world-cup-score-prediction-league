import Link from 'next/link'
import { getAuthUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { CHANGELOG, LATEST_CHANGELOG_ID, unseenEntries } from '@/lib/changelog'
import { markWhatsNewSeen } from '@/app/actions'

export const dynamic = 'force-dynamic'

export default async function WhatsNewPage() {
  const user = await getAuthUser()
  if (!user) return null
  const supabase = await createClient()

  const { data: readRow } = await supabase
    .from('whats_new_reads')
    .select('seen_id')
    .eq('user_id', user.id)
    .single()

  const seenId = readRow?.seen_id ?? 0
  const unseen = unseenEntries(seenId)

  // Visiting this page counts as acknowledging any unread entries.
  if (unseen.length > 0) {
    await markWhatsNewSeen()
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <Link href="/" className="text-sm text-gray-400 hover:text-gray-600 mb-6 inline-block">← Back</Link>
      <h1 className="text-xl font-bold mb-1">What&rsquo;s New</h1>
      <p className="text-sm text-gray-500 mb-6">Updates to the WC26 Predictor</p>

      <div className="space-y-6">
        {CHANGELOG.map(entry => {
          const isNew = entry.id > seenId
          return (
            <div key={entry.id} className="bg-white rounded-xl border shadow-sm px-5 py-4">
              <div className="flex items-center gap-2 mb-2">
                <p className="text-sm font-semibold text-gray-900 flex-1">{entry.title}</p>
                {isNew && (
                  <span className="text-xs font-medium bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full shrink-0">
                    New
                  </span>
                )}
                <span className="text-xs text-gray-400 shrink-0">
                  {new Date(entry.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                </span>
              </div>
              <ul className="space-y-1.5">
                {entry.items.map((item, i) => (
                  <li key={i} className="flex gap-2 text-sm text-gray-600">
                    <span className="text-green-500 shrink-0 mt-0.5">•</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )
        })}
      </div>

      <p className="text-xs text-center text-gray-400 mt-8">
        Latest update · v{LATEST_CHANGELOG_ID}
      </p>
    </div>
  )
}
