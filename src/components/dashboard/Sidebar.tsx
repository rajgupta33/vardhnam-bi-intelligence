"use client";

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  Sprout,
  Package,
  Undo2,
  Boxes,
  TrendingUp,
  Database,
  Menu,
  X,
  Users
} from 'lucide-react';
import { Button } from '../ui/button';

const navItems = [
  { name: 'Command Centre', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Crop Intelligence', href: '/crops', icon: Sprout },
  { name: 'SKU Intelligence', href: '/skus', icon: Package },
  { name: 'Dealer Intelligence', href: '/dealers', icon: Users },
  { name: 'Sales Return Analysis', href: '/returns', icon: Undo2 },
  { name: 'Stock Analysis', href: '/stock', icon: Boxes },
  { name: 'Forecast Planner', href: '/forecast', icon: TrendingUp },
  { name: 'Data Workspace', href: '/', icon: Database },
];

export function Sidebar() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      {/* Mobile Top Bar */}
      <div className="lg:hidden flex items-center justify-between bg-slate-900 text-white p-4 h-16 shrink-0 sticky top-0 z-20">
        <Link href="/dashboard" className="text-sm font-bold tracking-tight truncate mr-2 hover:opacity-80">
          VARDHNAM <span className="text-blue-400">BI DASHBOARD</span>
        </Link>
        <Button variant="ghost" size="icon" onClick={() => setIsOpen(!isOpen)} className="text-white hover:bg-slate-800">
          {isOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </Button>
      </div>

      {/* Overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-30 lg:hidden" 
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div className={cn(
        "fixed inset-y-0 left-0 z-40 w-64 bg-slate-50 border-r flex flex-col transition-transform duration-300 lg:static lg:translate-x-0 lg:shrink-0",
        isOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="hidden lg:flex py-4 items-center border-b px-6 shrink-0">
          <Link href="/dashboard" className="block hover:opacity-80 transition-opacity">
            <h1 className="text-xl font-bold tracking-tight text-slate-900 leading-none">
              VARDHNAM
            </h1>
            <span className="text-blue-600 text-[10px] font-bold uppercase tracking-wider block mt-1">
              Business Intelligence Dashboard
            </span>
          </Link>
        </div>
        
        {/* Mobile close button inside sidebar (optional, but we have overlay) */}
        <div className="flex lg:hidden h-16 items-center justify-end px-4 border-b">
          <Button variant="ghost" size="icon" onClick={() => setIsOpen(false)}>
             <X className="h-5 w-5" />
          </Button>
        </div>

        <div className="flex-1 overflow-auto py-4">
          <nav className="space-y-1 px-4">
            {navItems.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  onClick={() => setIsOpen(false)}
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-blue-100 text-blue-900'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  )}
                >
                  <item.icon className={cn("h-5 w-5", isActive ? "text-blue-600" : "text-slate-400")} />
                  {item.name}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>
    </>
  );
}
