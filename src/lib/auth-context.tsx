'use client';

import {
    createContext,
    useContext,
    useEffect,
    useState,
    type ReactNode,
} from 'react';
import {
    onAuthStateChanged,
    signInWithPopup,
    signOut as firebaseSignOut,
    type User,
} from 'firebase/auth';
import { auth, googleProvider } from '@/lib/firebase';
import { getViewerAccess } from '@/lib/firestore';

interface AuthContextValue {
    user: User | null;
    loading: boolean;
    signInWithGoogle: () => Promise<void>;
    signOut: () => Promise<void>;
    /** The userId whose data should be displayed (owner's UID when viewing, own UID otherwise) */
    effectiveUserId: string | null;
    /** True when the logged-in user is viewing someone else's data read-only */
    isViewer: boolean;
    /** The owner's email when in viewer mode */
    ownerEmail: string | null;
}

const AuthContext = createContext<AuthContextValue>({
    user: null,
    loading: true,
    signInWithGoogle: async () => { },
    signOut: async () => { },
    effectiveUserId: null,
    isViewer: false,
    ownerEmail: null,
});

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [isViewer, setIsViewer] = useState(false);
    const [effectiveUserId, setEffectiveUserId] = useState<string | null>(null);
    const [ownerEmail, setOwnerEmail] = useState<string | null>(null);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (u) => {
            setUser(u);
            if (u) {
                // Check if this user is a viewer of someone else's account
                const email = u.email;
                if (email) {
                    const access = await getViewerAccess(email);
                    if (access) {
                        setIsViewer(true);
                        setEffectiveUserId(access.ownerUid);
                        setOwnerEmail(access.ownerEmail);
                    } else {
                        setIsViewer(false);
                        setEffectiveUserId(u.uid);
                        setOwnerEmail(null);
                    }
                } else {
                    setIsViewer(false);
                    setEffectiveUserId(u.uid);
                    setOwnerEmail(null);
                }
            } else {
                setIsViewer(false);
                setEffectiveUserId(null);
                setOwnerEmail(null);
            }
            setLoading(false);
        });
        return unsubscribe;
    }, []);

    const signInWithGoogle = async () => {
        await signInWithPopup(auth, googleProvider);
    };

    const signOut = async () => {
        await firebaseSignOut(auth);
    };

    return (
        <AuthContext.Provider value={{ user, loading, signInWithGoogle, signOut, effectiveUserId, isViewer, ownerEmail }}>
            {children}
        </AuthContext.Provider>
    );
}

export const useAuth = () => useContext(AuthContext);
