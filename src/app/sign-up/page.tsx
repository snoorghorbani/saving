'use client';

import { useAuth } from '@/lib/auth-context';
import { useEffect } from 'react';

export default function SignUpPage() {
    const { user, loading, signInWithGoogle } = useAuth();

    useEffect(() => {
        if (!loading && user) window.location.href = '/dashboard';
    }, [user, loading]);

    if (loading) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-slate-50">
                <p className="text-slate-400">Loading...</p>
            </div>
        );
    }

    return (
        <div className="flex min-h-screen items-center justify-center bg-slate-50">
            <div className="text-center">
                <h1 className="text-2xl font-bold text-slate-900 mb-4">Sign Up</h1>
                <button
                    onClick={signInWithGoogle}
                    className="rounded-lg bg-emerald-600 px-6 py-3 text-white font-medium hover:bg-emerald-700 transition-colors"
                >
                    Sign up with Google
                </button>
            </div>
        </div>
    );
}
