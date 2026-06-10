import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { createClient } from "@/lib/supabase/server";
import { logout } from "@/app/actions";
import { FeedbackWidget } from "@/app/FeedbackWidget";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "WC26 Predictor",
  description: "FIFA World Cup 2026 score prediction mini league",
};

export const viewport: Viewport = {
  colorScheme: "light",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  let profile = null;
  if (user) {
    const { data } = await supabase
      .from("profiles")
      .select("username, is_admin")
      .eq("id", user.id)
      .single();
    profile = data;
  }

  return (
    <html lang="en" className={`${geistSans.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-gray-50">
        {user && (
          <nav className="bg-white border-b shadow-sm sticky top-0 z-20">
            <div className="max-w-4xl mx-auto px-4 h-12 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 sm:gap-4 min-w-0 overflow-x-auto">
                <span className="font-bold text-green-700 whitespace-nowrap">⚽<span className="hidden sm:inline"> WC26</span></span>
                <a href="/" className="text-sm text-gray-600 hover:text-gray-900 whitespace-nowrap">Schedule</a>
                <a href="/leaderboard" className="text-sm text-gray-600 hover:text-gray-900 whitespace-nowrap">Leaderboard</a>
                <a href="/groups" className="text-sm text-gray-600 hover:text-gray-900 whitespace-nowrap">Groups</a>
                <a href="/guide" className="text-sm text-gray-600 hover:text-gray-900 whitespace-nowrap">Guide</a>
                {profile?.is_admin && (
                  <a href="/admin" className="text-sm text-gray-600 hover:text-gray-900 whitespace-nowrap">Admin</a>
                )}
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
          </nav>
        )}
        <main className="flex-1">{children}</main>
        <FeedbackWidget />
      </body>
    </html>
  );
}
