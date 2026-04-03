import type { Metadata } from 'next';
import { AuthProvider } from '@/lib/auth-context';
import './globals.css';

export const metadata: Metadata = {
    title: 'WealthWise — Smart Personal Finance',
    description:
        'Track expenses, savings, and financial goals with WealthWise.',
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="en">
            <body className="min-h-screen">
                <AuthProvider>{children}</AuthProvider>
            </body>
        </html>
    );
}
