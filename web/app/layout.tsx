import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Reliqa — Autonomous QA Platform",
  description: "AI-powered QA agent that tests your web application using Google Gemini Vision and Playwright.",
};

import { Footer } from "@/components/footer";
import { MainNav } from "@/components/main-nav";

// ... existing code ...

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased h-screen bg-background font-sans text-foreground flex flex-col overflow-hidden`}
      >
        <MainNav />
        <main className="flex-1 min-h-0 overflow-auto">
          {children}
        </main>
        <Footer />
      </body>
    </html>
  );
}
