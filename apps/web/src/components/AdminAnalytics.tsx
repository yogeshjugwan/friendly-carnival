'use client';

import { useEffect, useState } from 'react';

interface Dashboard {
  days: { day: string; values: Record<string, number> }[];
  totals: { users: number | null; plusActive: number | null; verified: number | null; online: number };
}

const CHARTS: { metric: string; label: string; color: string }[] = [
  { metric: 'visitors', label: 'Visitors', color: 'bg-sky-500' },
  { metric: 'matches', label: 'Matches', color: 'bg-brand' },
  { metric: 'peakOnline', label: 'Peak online', color: 'bg-emerald-500' },
  { metric: 'signups', label: 'Sign-ups', color: 'bg-violet-500' },
  { metric: 'coinsSold', label: 'Coins sold', color: 'bg-amber-500' },
  { metric: 'reports', label: 'Reports', color: 'bg-red-500' },
];

const TABLE: { metric: string; label: string }[] = [
  { metric: 'visitors', label: 'Visitors' },
  { metric: 'matches', label: 'Matches' },
  { metric: 'videoMatches', label: 'Video' },
  { metric: 'textMatches', label: 'Text' },
  { metric: 'peakOnline', label: 'Peak' },
  { metric: 'signups', label: 'Sign-ups' },
  { metric: 'referrals', label: 'Invites' },
  { metric: 'coinPurchases', label: 'Coin buys' },
  { metric: 'gifts', label: 'Gifts' },
  { metric: 'boosts', label: 'Boosts' },
  { metric: 'adsWatched', label: 'Ads' },
  { metric: 'limitHits', label: 'Limit hits' },
  { metric: 'reports', label: 'Reports' },
];

const fmt = (n: number | null | undefined) => (n == null ? '—' : n.toLocaleString());
const shortDay = (day: string) => new Date(`${day}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

function Card({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl bg-white p-4 text-ink">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
      {sub && <p className="text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

function Bars({ days, metric, label, color }: { days: Dashboard['days']; metric: string; label: string; color: string }) {
  const values = days.map((d) => d.values[metric] ?? 0);
  const max = Math.max(1, ...values);
  const total = values.reduce((a, b) => a + b, 0);
  return (
    <div className="rounded-xl bg-white p-4 text-ink">
      <div className="flex items-baseline justify-between">
        <p className="font-semibold">{label}</p>
        <p className="text-xs text-slate-500">{metric === 'peakOnline' ? `max ${fmt(max)}` : `total ${fmt(total)}`}</p>
      </div>
      <div className="mt-3 flex h-28 items-end gap-px" role="img" aria-label={`${label} per day`}>
        {days.map((d, i) => (
          <div key={d.day} className="group relative flex h-full flex-1 items-end">
            <div className={`w-full rounded-t ${color} ${values[i] ? '' : 'opacity-20'}`} style={{ height: `${Math.max(2, (values[i] / max) * 100)}%` }} />
            <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded bg-slate-900 px-1.5 py-0.5 text-[10px] text-white group-hover:block">
              {shortDay(d.day)}: {fmt(values[i])}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-slate-400">
        <span>{shortDay(days[0].day)}</span>
        <span>{shortDay(days[days.length - 1].day)}</span>
      </div>
    </div>
  );
}

/** Admin dashboard: totals, daily charts and a table. Days are in IST. */
export function AdminAnalytics({ api }: { api: <T>(path: string, init?: RequestInit) => Promise<T> }) {
  const [range, setRange] = useState(30);
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    const load = () =>
      api<Dashboard>(`/admin/analytics?days=${range}`)
        .then((d) => live && (setData(d), setError(null)))
        .catch((e) => live && setError(e instanceof Error ? e.message : 'Could not load'));
    void load();
    const t = window.setInterval(load, 60_000);
    return () => {
      live = false;
      window.clearInterval(t);
    };
  }, [api, range]);

  if (error) return <p className="mt-4 text-red-400">{error}</p>;
  if (!data) return <p className="mt-4 text-slate-400">Loading…</p>;

  const today = data.days[data.days.length - 1].values;
  const yesterday = data.days[data.days.length - 2]?.values ?? {};
  const vs = (m: string) => `yesterday ${fmt(yesterday[m] ?? 0)}`;

  return (
    <section className="mt-4 space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card label="Online now" value={fmt(data.totals.online)} />
        <Card label="Accounts" value={fmt(data.totals.users)} />
        <Card label="Plus members" value={fmt(data.totals.plusActive)} />
        <Card label="Verified" value={fmt(data.totals.verified)} />
        <Card label="Visitors today" value={fmt(today.visitors ?? 0)} sub={vs('visitors')} />
        <Card label="Matches today" value={fmt(today.matches ?? 0)} sub={vs('matches')} />
        <Card label="Sign-ups today" value={fmt(today.signups ?? 0)} sub={vs('signups')} />
        <Card label="Coins sold today" value={fmt(today.coinsSold ?? 0)} sub={vs('coinsSold')} />
      </div>

      <div className="flex items-center gap-2 text-sm">
        <span className="text-slate-400">Range:</span>
        {[7, 30, 90].map((n) => (
          <button
            key={n}
            onClick={() => setRange(n)}
            className={`rounded-full px-3 py-1 ${range === n ? 'bg-brand text-white' : 'bg-slate-700 text-slate-200'}`}
          >
            {n} days
          </button>
        ))}
        <span className="ml-auto text-xs text-slate-500">Days in IST · visitors are approximate</span>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {CHARTS.map((c) => (
          <Bars key={c.metric} days={data.days} {...c} />
        ))}
      </div>

      <div className="overflow-x-auto rounded-xl bg-white text-sm text-ink">
        <table className="w-full text-right">
          <thead className="bg-slate-100 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2 text-left">Day</th>
              {TABLE.map((c) => (
                <th key={c.metric} className="px-3 py-2">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[...data.days].reverse().map((d) => (
              <tr key={d.day} className="border-t border-slate-100">
                <td className="whitespace-nowrap px-3 py-1.5 text-left">{shortDay(d.day)}</td>
                {TABLE.map((c) => (
                  <td key={c.metric} className="px-3 py-1.5 tabular-nums">
                    {d.values[c.metric] ? fmt(d.values[c.metric]) : <span className="text-slate-300">0</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
