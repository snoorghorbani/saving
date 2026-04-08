'use client';

import { useAuth } from '@/lib/auth-context';
import { useEffect } from 'react';
import { Navbar } from '@/components/Navbar';

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const { user, loading } = useAuth();

    useEffect(() => {
        if (!loading && !user) {
            window.location.href = '/';
        }
    }, [user, loading]);

    if (loading || !user) {
        return (
            <div className="flex min-h-screen items-center justify-center">
                <p className="text-slate-400">Loading...</p>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-50">
            <Navbar />
            <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
                {children}
            </main>
        </div>
    );
}
