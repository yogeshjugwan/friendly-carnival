'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { REPORT_REASONS, ROOM_SIZE, TOPICS, type Gender, type ReportReason, type RoomMember } from '@rc/shared';
import { SiteFooter, SiteHeader } from '@/components/SiteHeader';
import { VideoTile } from '@/components/VideoTile';
import { VerifiedBadge } from '@/components/VerifiedBadge';
import { useAuth } from '@/lib/auth';
import { countryName, flagEmoji, GENDER_ICON } from '@/lib/format';
import { loadSettings } from '@/lib/settings';
import { getSocket } from '@/lib/socket';
import { useRoom, type RoomCall } from '@/lib/useRoom';

const REASON_TEXT: Record<ReportReason, string> = {
  nudity: 'Nudity / sexual',
  harassment: 'Harassment / hate',
  underage: 'Looks underage',
  scam: 'Scam / spam',
  illegal: 'Illegal activity',
  other: 'Something else',
};

function Tile({ stream, label, emoji, muted, showVideo, member, room }: {
  stream: MediaStream | null;
  label: string;
  emoji: string;
  muted?: boolean;
  showVideo: boolean;
  member?: RoomMember;
  room: RoomCall;
}) {
  const [menu, setMenu] = useState(false);
  return (
    <div className="relative min-h-0 overflow-hidden rounded-2xl bg-[#2d2e31]">
      <VideoTile stream={stream} muted={muted} mirrored={muted} className="h-full w-full !bg-transparent" videoClassName={showVideo ? '' : 'invisible'} />
      {!showVideo && <div className="absolute inset-0 flex items-center justify-center text-6xl">{emoji}</div>}
      <span className="absolute bottom-2 left-2 flex items-center gap-1 rounded-full bg-black/60 px-2.5 py-1 text-xs text-white">
        {label}
        {member?.verified && <VerifiedBadge />}
      </span>
      {member && (
        <div className="absolute right-2 top-2">
          <button onClick={() => setMenu((m) => !m)} aria-label="Report" className="rounded-full bg-black/60 px-2.5 py-1 text-xs text-white hover:bg-black/80">
            🚩
          </button>
          {menu && (
            <div className="absolute right-0 top-full z-20 mt-1 w-44 rounded-xl bg-white p-1 text-sm text-ink shadow-xl">
              <p className="px-2 py-1 text-xs text-slate-500">Report and leave the room</p>
              {REPORT_REASONS.map((r) => (
                <button key={r} onClick={() => room.report(member.id, r)} className="block w-full rounded-lg px-2 py-1.5 text-left hover:bg-slate-100">
                  {REASON_TEXT[r]}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function RoomChatPanel({ room }: { room: RoomCall }) {
  const [draft, setDraft] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // (Newer browsers return a Promise here; an effect must not return it.)
    void endRef.current?.scrollIntoView({ block: 'end' });
  }, [room.chat]);
  const name = (id: string) => {
    const m = room.members.find((x) => x.id === id);
    return m ? `${m.avatar ?? GENDER_ICON[m.gender]}` : '👋';
  };
  return (
    <aside className="flex min-h-0 flex-col rounded-2xl bg-[#202124]">
      <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-3 text-sm">
        {room.chat.length === 0 && <p className="py-6 text-center text-slate-400">Say hi to the room 👋</p>}
        {room.chat.map((c, i) => (
          <p key={i} className={c.mine ? 'text-right' : ''}>
            <span className={`inline-block max-w-[85%] break-words rounded-2xl px-3 py-1.5 ${c.mine ? 'bg-brand text-white' : 'bg-white/10'}`}>
              {!c.mine && <span className="mr-1">{name(c.from)}</span>}
              {c.text}
            </span>
          </p>
        ))}
        <div ref={endRef} />
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          room.send(draft);
          setDraft('');
        }}
        className="flex gap-2 border-t border-white/10 p-2"
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Message the room…"
          aria-label="Message the room"
          className="min-w-0 flex-1 rounded-full bg-white/10 px-4 py-2 text-sm text-white placeholder:text-slate-400 focus:outline-none"
        />
        <button className="rounded-full bg-brand px-4 text-sm font-semibold text-white">Send</button>
      </form>
    </aside>
  );
}

function InRoom({ room }: { room: RoomCall }) {
  const t = TOPICS.find((x) => x.id === room.topic);
  const video = room.mode === 'video';
  const tiles = 1 + room.members.length;
  return (
    <main className="flex h-dvh flex-col gap-3 bg-[#1f2023] p-3 text-white sm:p-4">
      <header className="flex items-center gap-3">
        <p className="text-lg font-semibold">
          {t?.emoji} {t?.label} room
        </p>
        <span className="text-sm text-slate-400">
          {tiles}/{ROOM_SIZE} people · {video ? 'video' : 'voice'}
        </span>
      </header>
      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className={`grid min-h-0 gap-2 ${tiles <= 1 ? 'grid-cols-1' : 'grid-cols-2'} ${tiles <= 2 ? 'grid-rows-1 max-sm:grid-cols-1 max-sm:grid-rows-2' : 'grid-rows-2'}`}>
          <Tile stream={room.local} muted label="You" emoji={loadSettings().avatar ?? '🙂'} showVideo={video && room.cameraOn} room={room} />
          {room.members.map((m) => (
            <Tile
              key={m.id}
              stream={room.streams[m.id] ?? null}
              label={`${GENDER_ICON[m.gender]} ${m.country ? `${flagEmoji(m.country)} ${countryName(m.country)}` : ''}`}
              emoji={m.avatar ?? GENDER_ICON[m.gender]}
              showVideo={video}
              member={m}
              room={room}
            />
          ))}
        </div>
        <RoomChatPanel room={room} />
      </div>
      {tiles === 1 && <p className="text-center text-sm text-slate-400">Waiting for others to join this room…</p>}
      <footer className="flex justify-center gap-3">
        <button onClick={room.toggleMic} className={`rounded-full px-5 py-2.5 font-semibold ${room.micOn ? 'bg-[#3c4043]' : 'bg-red-500'}`}>
          {room.micOn ? '🎙️ Mute' : '🔇 Unmute'}
        </button>
        {video && (
          <button onClick={room.toggleCamera} className={`rounded-full px-5 py-2.5 font-semibold ${room.cameraOn ? 'bg-[#3c4043]' : 'bg-red-500'}`}>
            {room.cameraOn ? '📷 Camera off' : '📷 Camera on'}
          </button>
        )}
        <button onClick={room.leave} className="rounded-full bg-red-500 px-6 py-2.5 font-semibold">
          Leave
        </button>
      </footer>
    </main>
  );
}

export default function RoomsPage() {
  const { user, loading } = useAuth();
  const room = useRoom();
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [mode, setMode] = useState<'video' | 'voice'>('video');
  const [gender, setGender] = useState<Gender>('male');

  useEffect(() => {
    const g = loadSettings().gender;
    if (g) setGender(g);
  }, []);

  useEffect(() => {
    if (room.phase !== 'lobby') return;
    const load = () => getSocket().timeout(8_000).emit('rooms:list', (err, c) => !err && setCounts(c));
    load();
    const t = window.setInterval(load, 10_000);
    return () => window.clearInterval(t);
  }, [room.phase]);

  if (room.phase === 'in-room') return <InRoom room={room} />;

  return (
    <main className="mx-auto flex min-h-full max-w-4xl flex-col gap-6 px-4 py-6 sm:px-6">
      <SiteHeader />
      <section className="mt-2 text-center">
        <h1 className="text-3xl font-bold">👥 Group rooms</h1>
        <p className="mt-2 text-slate-300">Hang out with up to {ROOM_SIZE} people who like the same thing.</p>
      </section>

      {room.error && <p className="rounded-xl bg-amber-500/15 p-3 text-center text-sm text-amber-200">{room.error}</p>}
      {room.phase === 'media-denied' && (
        <p className="rounded-xl bg-red-500/15 p-3 text-center text-sm text-red-200">Allow your microphone{mode === 'video' ? ' and camera' : ''} to join a room.</p>
      )}

      {loading ? null : !user ? (
        <p className="rounded-xl bg-white/5 p-4 text-center text-slate-300">
          <Link href="/login?next=/rooms" className="font-semibold text-sky-300 underline">
            Log in
          </Link>{' '}
          to join group rooms — it keeps them friendly.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-center gap-3 text-sm">
            <div className="flex rounded-full bg-white/10 p-1">
              {(['video', 'voice'] as const).map((m) => (
                <button key={m} onClick={() => setMode(m)} className={`rounded-full px-4 py-1.5 font-semibold ${mode === m ? 'bg-white text-ink' : 'text-slate-200'}`}>
                  {m === 'video' ? '📹 Video' : '🎙️ Voice'}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-2 text-slate-300">
              I am
              <select value={gender} onChange={(e) => setGender(e.target.value as Gender)} className="rounded-full bg-white/10 px-3 py-1.5 text-white">
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="couple">Couple</option>
              </select>
            </label>
          </div>
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {TOPICS.map((t) => (
              <button
                key={t.id}
                disabled={room.phase === 'joining'}
                onClick={() => void room.join(t.id, mode, gender)}
                className="rounded-2xl bg-white p-4 text-left text-ink transition hover:-translate-y-0.5 hover:shadow-lg disabled:opacity-50"
              >
                <span className="text-3xl">{t.emoji}</span>
                <span className="mt-2 block font-semibold">{t.label}</span>
                <span className="text-xs text-slate-500">{counts[t.id] ? `${counts[t.id]} here now` : 'Start a room'}</span>
              </button>
            ))}
          </section>
          {room.phase === 'joining' && <p className="text-center text-slate-400">Joining…</p>}
        </>
      )}
      <SiteFooter />
    </main>
  );
}
