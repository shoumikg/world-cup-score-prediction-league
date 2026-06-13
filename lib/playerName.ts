// Diacritic- and case-insensitive key for comparing player names that originate
// from different data sources. openfootball's goals data (worldcup.json) and its
// squads data (worldcup.squads.json) disagree on casing ("Hwang In-Beom" vs.
// "Hwang In-beom") and diacritics ("Krejcí" vs. "Krejčí"), so the goal-scorer
// name and the admin-confirmed squad name must be compared by this key, never by
// raw string equality — otherwise a correct Q1 pick scores as wrong.
//
// "Patrik Schick" / "PÉREZ" → "patrik schick" / "perez"
export function normalizePlayerName(s: string | null | undefined): string {
  return (s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip combining diacritics
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')    // punctuation → space
    .replace(/\s+/g, ' ')
    .trim()
}
