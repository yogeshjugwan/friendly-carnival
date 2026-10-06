'use client';

import { useCallback, useEffect, useState } from 'react';

const API = process.env.NEXT_PUBLIC_SIGNALING_URL ?? 'http://localhost:4100';
const TOKEN_KEY = 'rc.adminToken';
const DAY = 86_400_000;

interface Summary {
  openReports: number;
  oldestOpenAgeMs: number | null;
  activeBans: number;
  openAppeals: number;
  online: number;
}
interface Report {
  id: string;
  targetDevice: string;
  reason: string;
  source: 'user' | 'ai';
  note: string | null;
  snapshot: string | null;
  aiScore: number | null;
  status: string;
  createdAt: number;
  resolution: string | null;
}
interface Ban {
  id: string;
  deviceId: string;
  ipHash: string | null;
  reason: string;
  source: string;
  expiresAt: number | null;
  createdAt: number;
}
interface Appeal {
  id: string;
  banId: string;
  message: string;
  status: string;
  createdAt: number;
}

type Tab = 'reports' | 'bans' | 'appeals' | 'history';

const ago = (t: number) => {
  const m = Math.round((Date.now() - t) / 60_000);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h} h ago` : `${Math.round(h / 24)} d ago`;
};
const short = (id: string) => id.replace(/^anon:/, '~').slice(0, 8);
const REASON: Record<string, string> = {
  nudity: 'Nudity / sexual',
  harassment: 'Harassment / hate',
  underage: 'Underage',
  scam: 'Scam / spam',
  illegal: 'Illegal activity',
  other: 'Other',
};
const DURATIONS: { label: string; hours: number | null }[] = [
  { label: '1 h', hours: 1 },
  { label: '24 h', hours: 24 },
  { label: '7 d', hours: 168 },
  { label: 'Permanent', hours: null },
];

export default function AdminPage() {
  const [token, setToken] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [tab, setTab] = useState<Tab>('reports');
  const [summary, setSummary] = useState<Summary | null>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [bans, setBans] = useState<Ban[]>([]);
  const [appeals, setAppeals] = useState<Appeal[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [banIp, setBanIp] = useState<Set<string>>(new Set());

  useEffect(() => {
    try {
      setToken(window.sessionStorage.getItem(TOKEN_KEY));
    } catch {
      /* storage unavailable */
    }
  }, []);

  const api = useCallback(
    async <T,>(path: string, init?: RequestInit): Promise<T> => {
      const res = await fetch(API + path, {
        ...init,
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      });
      if (res.status === 401) {
        setToken(null);
        try {
          window.sessionStorage.removeItem(TOKEN_KEY);
        } catch {
          /* ignore */
        }
        throw new Error('Wrong admin token');
      }
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
      return body as T;
    },
    [token],
  );

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const [s, r, b, a] = await Promise.all([
        api<Summary>('/admin/summary'),
        api<Report[]>(tab === 'history' ? '/admin/reports' : '/admin/reports?status=open'),
        api<Ban[]>('/admin/bans?active=1'),
        api<Appeal[]>('/admin/appeals?status=open'),
      ]);
      setSummary(s);
      setReports(r);
      setBans(b);
      setAppeals(a);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load');
    }
  }, [api, token, tab]);

  useEffect(() => {
    void load();
    const t = window.setInterval(() => void load(), 30_000);
    return () => window.clearInterval(t);
  }, [load]);

  const act = async (path: string, body: unknown) => {
    try {
      await api(path, { method: 'POST', body: JSON.stringify(body) });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action failed');
    }
  };

  if (!token) {
    return (
      <main className="flex h-full items-center justify-center p-6">
        <form
          className="w-full max-w-sm rounded-2xl bg-white p-6 text-ink shadow-xl"
          onSubmit={(e) => {
            e.preventDefault();
            const t = draft.trim();
            if (!t) return;
            try {
              window.sessionStorage.setItem(TOKEN_KEY, t);
            } catch {
              /* ignore */
            }
            setToken(t);
          }}
        >
          <h1 className="text-xl font-semibold">Moderation</h1>
          <label htmlFor="token" className="mt-4 block text-sm text-slate-600">
            Admin token (the server&apos;s ADMIN_TOKEN)
          </label>
          <input
            id="token"
            type="password"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            autoComplete="off"
          />
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
          <button className="mt-4 w-full rounded-lg bg-brand py-2.5 font-semibold text-white">Sign in</button>
        </form>
      </main>
    );
  }

  const overdue = summary?.oldestOpenAgeMs != null && summary.oldestOpenAgeMs > DAY;

  return (
    <main className="mx-auto max-w-6xl p-4 sm:p-6">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="mr-auto text-2xl font-semibold">
          random<span className="text-brand">Call</span> moderation
        </h1>
        <button onClick={() => void load()} className="rounded-lg bg-slate-700 px-3 py-1.5 text-sm">
          Refresh
        </button>
        <button
          onClick={() => {
            try {
              window.sessionStorage.removeItem(TOKEN_KEY);
            } catch {
              /* ignore */
            }
            setToken(null);
          }}
          className="rounded-lg bg-slate-700 px-3 py-1.5 text-sm"
        >
          Sign out
        </button>
      </header>

      {error && <p className="mt-3 rounded-lg bg-red-100 px-3 py-2 text-sm text-red-800">{error}</p>}

      {summary && (
        <section className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
          {[
            ['Open reports', summary.openReports],
            ['Oldest open', summary.oldestOpenAgeMs == null ? '—' : ago(Date.now() - summary.oldestOpenAgeMs)],
            ['Active bans', summary.activeBans],
            ['Open appeals', summary.openAppeals],
            ['Online now', summary.online],
          ].map(([label, value], i) => (
            <div key={label as string} className={`rounded-xl p-3 ${i === 1 && overdue ? 'bg-red-900/60' : 'bg-panel'}`}>
              <p className="text-xs text-slate-400">{label}</p>
              <p className="text-2xl font-semibold">{value}</p>
              {i === 1 && <p className="text-xs text-slate-400">Target: under 24 h</p>}
            </div>
          ))}
        </section>
      )}

      <GivePlus api={api} />
      <GiveCoins api={api} />

      <nav className="mt-5 flex gap-2 border-b border-slate-700">
        {(['reports', 'appeals', 'bans', 'history'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm capitalize ${tab === t ? 'border-brand text-white' : 'border-transparent text-slate-400'}`}
          >
            {t === 'reports' ? `Reports (${summary?.openReports ?? 0})` : t === 'appeals' ? `Appeals (${appeals.length})` : t}
          </button>
        ))}
      </nav>

      {(tab === 'reports' || tab === 'history') && (
        <section className="mt-4 grid gap-3 md:grid-cols-2">
          {reports.length === 0 && <p className="text-slate-400">No reports. 🎉</p>}
          {reports.map((r) => (
            <article key={r.id} className="flex gap-3 rounded-xl bg-white p-3 text-ink">
              <button
                className="relative h-28 w-40 shrink-0 overflow-hidden rounded-lg bg-slate-200"
                onClick={() => setRevealed((s) => new Set(s).add(r.id))}
                title={r.snapshot ? 'Click to reveal' : 'No snapshot'}
              >
                {r.snapshot ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={r.snapshot} alt="Reported video frame" className={`h-full w-full object-cover ${revealed.has(r.id) ? '' : 'blur-xl'}`} />
                    {!revealed.has(r.id) && (
                      <span className="absolute inset-0 flex items-center justify-center text-xs font-medium text-white">Click to reveal</span>
                    )}
                  </>
                ) : (
                  <span className="text-xs text-slate-500">No snapshot</span>
                )}
              </button>
              <div className="min-w-0 flex-1 text-sm">
                <p className="font-semibold">
                  {REASON[r.reason] ?? r.reason}{' '}
                  {r.source === 'ai' && (
                    <span className="rounded bg-purple-100 px-1.5 py-0.5 text-xs text-purple-800">
                      AI {r.aiScore != null ? `${Math.round(r.aiScore * 100)}%` : ''}
                    </span>
                  )}
                </p>
                <p className="text-slate-500">
                  Device {short(r.targetDevice)} · {ago(r.createdAt)}
                </p>
                {r.note && <p className="mt-1 line-clamp-3 text-slate-700">“{r.note}”</p>}
                {r.status === 'open' ? (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {DURATIONS.map((d) => (
                      <button
                        key={d.label}
                        onClick={() => void act(`/admin/reports/${r.id}/action`, { action: 'ban', durationHours: d.hours, includeIp: banIp.has(r.id) })}
                        className="rounded-md bg-red-600 px-2 py-1 text-xs font-semibold text-white"
                      >
                        Ban {d.label}
                      </button>
                    ))}
                    <button
                      onClick={() => void act(`/admin/reports/${r.id}/action`, { action: 'dismiss' })}
                      className="rounded-md bg-slate-200 px-2 py-1 text-xs font-semibold"
                    >
                      Dismiss
                    </button>
                    <label className="ml-1 flex items-center gap-1 text-xs text-slate-500" title="Shared mobile IPs can cover many users">
                      <input
                        type="checkbox"
                        checked={banIp.has(r.id)}
                        onChange={(e) =>
                          setBanIp((s) => {
                            const n = new Set(s);
                            if (e.target.checked) n.add(r.id);
                            else n.delete(r.id);
                            return n;
                          })
                        }
                      />
                      also ban IP
                    </label>
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-slate-500">
                    {r.status}: {r.resolution}
                  </p>
                )}
              </div>
            </article>
          ))}
        </section>
      )}

      {tab === 'appeals' && (
        <section className="mt-4 space-y-3">
          {appeals.length === 0 && <p className="text-slate-400">No open appeals.</p>}
          {appeals.map((a) => {
            const ban = bans.find((b) => b.id === a.banId);
            return (
              <article key={a.id} className="rounded-xl bg-white p-4 text-sm text-ink">
                <p className="text-slate-500">
                  {ago(a.createdAt)} · ban: {ban ? `${ban.reason} (${ban.expiresAt ? 'until ' + new Date(ban.expiresAt).toLocaleString() : 'permanent'})` : a.banId.slice(0, 8)}
                </p>
                <p className="mt-2 whitespace-pre-wrap">{a.message}</p>
                <div className="mt-3 flex gap-2">
                  <button onClick={() => void act(`/admin/appeals/${a.id}/resolve`, { approve: true })} className="rounded-md bg-emerald-600 px-3 py-1.5 font-semibold text-white">
                    Approve &amp; lift ban
                  </button>
                  <button onClick={() => void act(`/admin/appeals/${a.id}/resolve`, { approve: false })} className="rounded-md bg-slate-200 px-3 py-1.5 font-semibold">
                    Reject
                  </button>
                </div>
              </article>
            );
          })}
        </section>
      )}

      {tab === 'bans' && (
        <section className="mt-4 overflow-x-auto rounded-xl bg-white text-sm text-ink">
          <table className="w-full text-left">
            <thead className="bg-slate-100 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">Device</th>
                <th className="px-3 py-2">Reason</th>
                <th className="px-3 py-2">By</th>
                <th className="px-3 py-2">Until</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {bans.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-4 text-slate-500">
                    No active bans.
                  </td>
                </tr>
              )}
              {bans.map((b) => (
                <tr key={b.id} className="border-t border-slate-100">
                  <td className="px-3 py-2 font-mono">
                    {short(b.deviceId)}
                    {b.ipHash && <span className="ml-1 rounded bg-amber-100 px-1 text-xs text-amber-800">+IP</span>}
                  </td>
                  <td className="px-3 py-2">{b.reason}</td>
                  <td className="px-3 py-2">{b.source}</td>
                  <td className="px-3 py-2">{b.expiresAt ? new Date(b.expiresAt).toLocaleString() : 'Permanent'}</td>
                  <td className="px-3 py-2 text-right">
                    <button onClick={() => void act(`/admin/bans/${b.id}/lift`, {})} className="rounded-md bg-slate-200 px-2 py-1 text-xs font-semibold">
                      Lift
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </main>
  );
}

/** Complimentary Plus for testers / support: enter the account email and days (0 removes it). */
function GivePlus({ api }: { api: <T>(path: string, init?: RequestInit) => Promise<T> }) {
  const [email, setEmail] = useState('');
  const [days, setDays] = useState(30);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api('/admin/plus', { method: 'POST', body: JSON.stringify({ email: email.trim(), days }) });
      setResult({ ok: true, text: days === 0 ? `Removed Plus from ${email.trim()}` : `${email.trim()} has Plus for ${days} days` });
    } catch (err) {
      setResult({ ok: false, text: err instanceof Error ? err.message : 'Could not update Plus' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="mt-4 flex flex-wrap items-end gap-2 rounded-xl bg-panel p-3">
      <p className="w-full text-sm font-semibold">👑 Give Plus</p>
      <label className="flex min-w-[14rem] flex-1 flex-col text-xs text-slate-400">
        Account email
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1 rounded-lg bg-slate-800 px-3 py-2 text-sm text-white"
        />
      </label>
      <label className="flex w-24 flex-col text-xs text-slate-400">
        Days (0 = remove)
        <input
          type="number"
          min={0}
          max={3650}
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          className="mt-1 rounded-lg bg-slate-800 px-3 py-2 text-sm text-white"
        />
      </label>
      <button disabled={busy} className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
        {days === 0 ? 'Remove Plus' : 'Give Plus'}
      </button>
      {result && <p className={`w-full text-sm ${result.ok ? 'text-emerald-400' : 'text-red-400'}`}>{result.text}</p>}
    </form>
  );
}

/** Give (or take back) coins, for support and testing. */
function GiveCoins({ api }: { api: <T>(path: string, init?: RequestInit) => Promise<T> }) {
  const [email, setEmail] = useState('');
  const [coins, setCoins] = useState(100);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          const r = await api<{ coins: number }>('/admin/coins', { method: 'POST', body: JSON.stringify({ email: email.trim(), coins }) });
          setResult({ ok: true, text: `${email.trim()} now has ${r.coins} coins` });
        } catch (err) {
          setResult({ ok: false, text: err instanceof Error ? err.message : 'Could not update coins' });
        }
      }}
      className="mt-3 flex flex-wrap items-end gap-2 rounded-xl bg-panel p-3"
    >
      <p className="w-full text-sm font-semibold">🪙 Give coins</p>
      <label className="flex min-w-[14rem] flex-1 flex-col text-xs text-slate-400">
        Account email
        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 rounded-lg bg-slate-800 px-3 py-2 text-sm text-white" />
      </label>
      <label className="flex w-28 flex-col text-xs text-slate-400">
        Coins (− to remove)
        <input type="number" value={coins} onChange={(e) => setCoins(Number(e.target.value))} className="mt-1 rounded-lg bg-slate-800 px-3 py-2 text-sm text-white" />
      </label>
      <button className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white">Apply</button>
      {result && <p className={`w-full text-sm ${result.ok ? 'text-emerald-400' : 'text-red-400'}`}>{result.text}</p>}
    </form>
  );
}
