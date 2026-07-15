import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/dashboard/Sidebar";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Vardhnam Analytics",
  description: "FY 2025–26 Purchase-to-Demand Intelligence",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.className} flex flex-col lg:flex-row h-screen bg-white text-slate-900`}>
        <Sidebar />
        <main className="flex-1 overflow-auto bg-slate-50/50">
          {children}
        </main>
      </body>
    </html>
  );
}
