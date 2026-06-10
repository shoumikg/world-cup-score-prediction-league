import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { createClient } from "@/lib/supabase/server";
import { logout } from "@/app/actions";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "WC26 Predictor",
  description: "FIFA World Cup 2026 score prediction mini league",
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
            <div className="max-w-4xl mx-auto px-4 h-12 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <span className="font-bold text-green-700">⚽ WC26</span>
                <a href="/" className="text-sm text-gray-600 hover:text-gray-900">Schedule</a>
                {profile?.is_admin && (
                  <a href="/admin" className="text-sm text-gray-600 hover:text-gray-900">Admin</a>
                )}
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm text-gray-500">{profile?.username}</span>
                <form action={logout}>
                  <button
                    type="submit"
                    className="text-xs text-gray-400 hover:text-gray-700 transition-colors"
                  >
                    Log out
                  </button>
                </form>
              </div>
            </div>
          </nav>
        )}
        <main className="flex-1">{children}</main>
      </body>
    </html>
  );
}
