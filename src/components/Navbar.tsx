'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';

const links = [
    { href: '/dashboard', label: 'Dashboard' },
    { href: '/dashboard/expenses', label: 'Expenses' },
    { href: '/dashboard/savings', label: 'Savings' },
    { href: '/dashboard/goals', label: 'Goals' },
];

export function Navbar() {
    const pathname = usePathname();
    const { user, signOut } = useAuth();

    return (
        <nav className="border-b border-slate-200 bg-white">
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                <div className="flex h-16 items-center justify-between">
                    <div className="flex items-center gap-8">
                        <Link
                            href="/dashboard"
                            className="text-xl font-bold text-slate-900"
                        >
                            Wealth<span className="text-emerald-600">Wise</span>
                        </Link>
                        <div className="hidden sm:flex items-center gap-1">
                            {links.map((link) => (
                                <Link
                                    key={link.href}
                                    href={link.href}
                                    className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${pathname === link.href
                                            ? 'bg-emerald-50 text-emerald-700'
                                            : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                                        }`}
                                >
                                    {link.label}
                                </Link>
                            ))}
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        {user?.photoURL && (
                            <img
                                src={user.photoURL}
                                alt=""
                                className="h-8 w-8 rounded-full"
                                referrerPolicy="no-referrer"
                            />
                        )}
                        <span className="hidden sm:inline text-sm text-slate-600">
                            {user?.displayName}
                        </span>
                        <button onClick={signOut} className="btn-secondary text-xs">
                            Sign Out
                        </button>
                    </div>
                </div>
            </div>
            {/* Mobile nav */}
            <div className="sm:hidden border-t border-slate-100 px-4 py-2 flex gap-1 overflow-x-auto">
                {links.map((link) => (
                    <Link
                        key={link.href}
                        href={link.href}
                        className={`rounded-lg px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${pathname === link.href
                                ? 'bg-emerald-50 text-emerald-700'
                                : 'text-slate-600 hover:bg-slate-50'
                            }`}
                    >
                        {link.label}
                    </Link>
                ))}
            </div>
        </nav>
    );
}
