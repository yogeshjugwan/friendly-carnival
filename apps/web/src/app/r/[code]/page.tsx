'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { api, useAuth } from '@/lib/auth';
import { claimInvite, saveInviteCode } from '@/lib/referral';

/** Invite link: remember who invited you, then sign up (or just start, if logged in). */
export default function InviteLink() {
  const { code } = useParams<{ code: string }>();
  const { user, token, loading } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (loading) return;
    if (code && /^[a-z0-9]{4,16}$/i.test(code)) saveInviteCode(code);
    if (!user || !token) return router.replace('/signup?invited=1');
    void claimInvite(user, (c) => api('/auth/referral', { code: c }, token)).finally(() => router.replace('/'));
  }, [code, loading, user, token, router]);
  return <main className="flex h-full items-center justify-center text-slate-400">Opening randomCall…</main>;
}
