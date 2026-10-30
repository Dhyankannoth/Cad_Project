import React, { createContext, useState, useEffect, useContext } from 'react';
import { supabase } from '../supabaseClient';

const AuthContext = createContext({});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!supabase) {
            setLoading(false);
            return;
        }

        supabase.auth.getSession()
            .then(({ data: { session } }) => {
                setUser(session?.user ?? null);
            })
            .catch((err) => {
                console.warn('Session check warning:', err);
            })
            .finally(() => {
                setLoading(false);
            });

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setUser(session?.user ?? null);
        });

        return () => subscription.unsubscribe();
    }, []);

    const signOut = async () => {
        if (supabase) await supabase.auth.signOut();
    };

    return (
        <AuthContext.Provider value={{ user, loading, signOut, supabase }}>
            {children}
        </AuthContext.Provider>
    );
};
