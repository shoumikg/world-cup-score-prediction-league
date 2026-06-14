import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { createClient } from "@/lib/supabase/server";
import { logout } from "@/app/actions";
import { FeedbackWidget } from "@/app/FeedbackWidget";
import { ThemeToggle } from "@/app/ThemeToggle";
import { WhatsNewModal } from "@/app/WhatsNewModal";
import { unseenEntries } from "@/lib/changelog";
import { Analytics } from "@vercel/analytics/next";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "WC26 Predictor",
  description: "FIFA World Cup 2026 score prediction mini league",
};

export const viewport: Viewport = {
  colorScheme: "light dark",
};

// Runs synchronously in <head> before first paint: applies the saved theme, or
// falls back to the device's preferred colour scheme. Setting the class and
// color-scheme here avoids any flash of the wrong theme on load.
const themeScript = `(function(){try{var s=localStorage.getItem('theme');var d=s?s==='dark':matchMedia('(prefers-color-scheme: dark)').matches;var r=document.documentElement;r.classList.toggle('dark',d);r.style.colorScheme=d?'dark':'light';}catch(e){}})();`;

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  let profile = null;
  let unseenCount = 0;
  let unseenForModal: ReturnType<typeof unseenEntries> = [];
  let hasLive = false;
  if (user) {
    const [{ data: profileData }, { data: readRow }, { data: liveMatches }] = await Promise.all([
      supabase.from("profiles").select("username, is_admin").eq("id", user.id).single(),
      supabase.from("whats_new_reads").select("seen_id").eq("user_id", user.id).single(),
      supabase.from("matches").select("id").eq("status", "live").limit(1),
    ]);
    profile = profileData;
    const seenId = readRow?.seen_id ?? 0;
    unseenForModal = unseenEntries(seenId);
    unseenCount = unseenForModal.length;
    hasLive = (liveMatches?.length ?? 0) > 0;
  }

  return (
    <html lang="en" className={`${geistSans.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-full flex flex-col bg-gray-50">
        {user && (
          <nav className="bg-white border-b shadow-sm sticky top-0 z-20">
            <div className="max-w-4xl mx-auto px-4">
              {/* Row 1: logo + user actions */}
              <div className="h-12 flex items-center justify-between gap-3">
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="font-bold text-green-700 dark:text-green-400">⚽ WC26</span>
                  <ThemeToggle />
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <a href="/profile" className="text-sm text-gray-500 hover:text-gray-900 truncate max-w-24 sm:max-w-none">{profile?.username}</a>
                  <form action={logout} className="shrink-0">
                    <button
                      type="submit"
                      className="text-xs text-gray-400 hover:text-gray-700 transition-colors whitespace-nowrap"
                    >
                      Log out
                    </button>
                  </form>
                </div>
              </div>
              {/* Row 2: nav links — flex-wrap so future items spill to a new line */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pb-2 text-sm">
                <a href="/" className="text-gray-600 hover:text-gray-900 whitespace-nowrap">Schedule</a>
                {hasLive && (
                  <a href="/live" className="animate-pulse bg-green-500 text-white text-xs font-semibold px-2.5 py-0.5 rounded-full whitespace-nowrap">
                    Live
                  </a>
                )}
                <a href="/leaderboard" className="text-gray-600 hover:text-gray-900 whitespace-nowrap">Leaderboard</a>
                <a href="/groups" className="text-gray-600 hover:text-gray-900 whitespace-nowrap">Groups</a>
                <a href="/guide" className="text-gray-600 hover:text-gray-900 whitespace-nowrap">Guide</a>
                <a href="/bonus" className="text-gray-600 hover:text-gray-900 whitespace-nowrap">Bonus</a>
                <a href="/bracket" className="text-gray-600 hover:text-gray-900 whitespace-nowrap">Bracket</a>
                <a href="/compare" className="text-gray-600 hover:text-gray-900 whitespace-nowrap">Compare</a>
                <a href="/whats-new" className="text-gray-600 hover:text-gray-900 whitespace-nowrap flex items-center gap-1">
                  What&rsquo;s New
                  {unseenCount > 0 && (
                    <span className="inline-flex items-center justify-center h-4 min-w-4 px-1 rounded-full bg-green-500 text-white text-[10px] font-bold leading-none">
                      {unseenCount}
                    </span>
                  )}
                </a>
                {profile?.is_admin && (
                  <a href="/admin" className="text-gray-600 hover:text-gray-900 whitespace-nowrap">Admin</a>
                )}
                {profile?.is_admin && (
                  <a href="/admin/pending" className="text-gray-600 hover:text-gray-900 whitespace-nowrap">Pending</a>
                )}
              </div>
            </div>
          </nav>
        )}
        <main className="flex-1">{children}</main>
        {user && unseenForModal.length > 0 && (
          <WhatsNewModal entries={unseenForModal} />
        )}
        <FeedbackWidget />
        <Analytics />
      </body>
    </html>
  );
}
