import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import { getAuthUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { logout } from "@/app/actions";
import { FeedbackWidget } from "@/app/FeedbackWidget";
import { ThemeToggle } from "@/app/ThemeToggle";
import { NavLinks } from "@/app/NavLinks";
import { NavigationProgress } from "@/app/NavigationProgress";
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
  const user = await getAuthUser();

  let profile = null;
  let unseenCount = 0;
  let unseenForModal: ReturnType<typeof unseenEntries> = [];
  let hasLive = false;
  if (user) {
    const supabase = await createClient();
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
                  <Link href="/profile" className="text-sm text-gray-500 hover:text-gray-900 truncate max-w-24 sm:max-w-none">{profile?.username}</Link>
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
              {/* Row 2: nav links — client component for active-state highlighting */}
              <NavLinks
                isAdmin={!!profile?.is_admin}
                hasLive={hasLive}
                unseenCount={unseenCount}
              />
            </div>
          </nav>
        )}
        <NavigationProgress />
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
