'use client';

import { useAuth } from '@/lib/auth-context';
import { useEffect } from 'react';
import { Navbar } from '@/components/Navbar';

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const { user, loading, isViewer, ownerEmail } = useAuth();

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
            {isViewer && (
                <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 text-center">
                    <p className="text-sm text-amber-700">
                        👁 Viewing <span className="font-semibold">{ownerEmail}</span>&apos;s account (read-only)
                    </p>
                </div>
            )}
            <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
                {children}
            </main>
        </div>
    );
}
