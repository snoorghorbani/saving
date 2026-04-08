'use client';

import { useAuth } from '@/lib/auth-context';
import { useEffect } from 'react';

export default function Home() {
    const { user, loading, signInWithGoogle } = useAuth();

    useEffect(() => {
        if (!loading && user) {
            window.location.href = '/dashboard';
        }
    }, [user, loading]);

    if (loading) {
        return (
            <div className="flex min-h-screen items-center justify-center">
                <p className="text-slate-400">Loading...</p>
            </div>
        );
    }

    return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-emerald-50 via-white to-slate-50">
            <div className="text-center max-w-2xl px-6">
                <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-emerald-100 px-4 py-1.5 text-sm font-medium text-emerald-700">
                    Personal Finance Tracker
                </div>
                <h1 className="text-5xl font-bold tracking-tight text-slate-900 mb-4">
                    Wealth<span className="text-emerald-600">Wise</span>
                </h1>
                <p className="text-lg text-slate-600 mb-8">
                    Track your expenses, manage savings across multiple accounts, and hit
                    your financial goals — all in one place.
                </p>
                <button onClick={signInWithGoogle} className="btn-primary text-base px-6 py-3">
                    Sign in with Google
                </button>

                <div className="mt-16 grid grid-cols-1 sm:grid-cols-3 gap-8 text-left">
                    <div className="card">
                        <div className="text-2xl mb-2">📊</div>
                        <h3 className="font-semibold text-slate-800 mb-1">
                            Weekly-First View
                        </h3>
                        <p className="text-sm text-slate-500">
                            All expenses normalized to weekly amounts for clear budgeting.
                        </p>
                    </div>
                    <div className="card">
                        <div className="text-2xl mb-2">🏦</div>
                        <h3 className="font-semibold text-slate-800 mb-1">6 Accounts</h3>
                        <p className="text-sm text-slate-500">
                            Track cash, bank, and online accounts in one dashboard.
                        </p>
                    </div>
                    <div className="card">
                        <div className="text-2xl mb-2">🎯</div>
                        <h3 className="font-semibold text-slate-800 mb-1">Savings Goals</h3>
                        <p className="text-sm text-slate-500">
                            Set weekly and monthly targets with real-time progress.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
