'use client';

import { useState } from 'react';
import { GAMES, type GameView } from '@rc/shared';
import type { RandomCall } from '@/lib/useRandomCall';
import { CHIP, POP, popPos } from './chip';

/** 🎮 Play: pick a mini-game to play with your partner. */
export function GamesButton({ call, up }: { call: RandomCall; up?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={CHIP}
      >
        🎮 Play
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} aria-hidden />
          <div className={`${POP} ${popPos(up)} w-64 p-2`}>
            <p className="px-2 pb-1 pt-1 text-xs font-semibold uppercase tracking-wide text-dim">Play together</p>
            {GAMES.map((g) => (
              <button
                key={g.id}
                onClick={() => {
                  call.startGame(g.id);
                  setOpen(false);
                }}
                className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-white/10"
              >
                <span className="text-2xl">{g.emoji}</span>
                <span>
                  <span className="block text-sm font-semibold">{g.name}</span>
                  <span className="block text-xs text-dim">{g.blurb}</span>
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

const btn = 'rounded-full px-4 py-1.5 text-sm font-semibold transition disabled:opacity-40';

function TicTacToe({ view, call }: { view: Extract<GameView, { game: 'ttt' }>; call: RandomCall }) {
  const status = view.winner
    ? view.winner === 'draw'
      ? "It's a draw!"
      : view.winner === 'me'
        ? '🎉 You win!'
        : 'They win!'
    : view.myTurn
      ? 'Your turn — you are ✕'
      : 'Their turn…';
  return (
    <div className="flex flex-col items-center gap-2">
      <p className="text-sm font-medium">{status}</p>
      <div className="grid grid-cols-3 gap-1.5">
        {view.board.map((cell, i) => (
          <button
            key={i}
            disabled={!view.myTurn || cell !== null}
            onClick={() => call.gameMove({ cell: i })}
            aria-label={`Cell ${i + 1}${cell ? `, ${cell === 'me' ? 'yours' : 'theirs'}` : ''}`}
            className={`flex h-14 w-14 items-center justify-center rounded-lg text-3xl font-bold sm:h-16 sm:w-16 ${
              view.line?.includes(i) ? 'bg-emerald-500/40' : 'bg-white/10'
            } ${view.myTurn && !cell ? 'hover:bg-white/20' : ''}`}
          >
            {cell === 'me' ? <span className="text-lime">✕</span> : cell === 'them' ? <span className="text-pink-300">◯</span> : ''}
          </button>
        ))}
      </div>
      {view.winner && (
        <button onClick={() => call.gameMove({ next: true })} className={`${btn} bg-lime text-white`}>
          Play again
        </button>
      )}
    </div>
  );
}

function TruthOrDare({ view, call }: { view: Extract<GameView, { game: 'tod' }>; call: RandomCall }) {
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      {view.card && (
        <div className={`w-full rounded-xl p-3 ${view.card.kind === 'truth' ? 'bg-sky-500/20' : 'bg-pink-500/20'}`}>
          <p className="text-xs font-semibold uppercase tracking-wide text-mute">
            {view.card.kind === 'truth' ? 'Truth' : 'Dare'} for {view.card.for === 'me' ? 'you' : 'them'}
          </p>
          <p className="mt-1 font-medium">{view.card.text}</p>
        </div>
      )}
      {view.myTurn ? (
        <div className="flex gap-2">
          <button onClick={() => call.gameMove({ pick: 'truth' })} className={`${btn} bg-lime text-white`}>
            Truth
          </button>
          <button onClick={() => call.gameMove({ pick: 'dare' })} className={`${btn} bg-pink-500 text-white`}>
            Dare
          </button>
        </div>
      ) : (
        <p className="text-sm text-mute">Waiting for them to pick truth or dare…</p>
      )}
      <p className="text-[11px] text-dim">Keep it friendly — you can always skip a card.</p>
    </div>
  );
}

function WouldYouRather({ view, call }: { view: Extract<GameView, { game: 'wyr' }>; call: RandomCall }) {
  const both = view.myVote && view.theirVote && view.theirVote !== 'hidden';
  const option = (key: 'a' | 'b', text: string) => {
    const mine = view.myVote === key;
    const theirs = both && view.theirVote === key;
    return (
      <button
        disabled={!!view.myVote}
        onClick={() => call.gameMove({ vote: key })}
        className={`relative flex-1 rounded-xl p-3 text-sm font-medium transition ${mine ? 'bg-lime text-night' : 'bg-white/10 hover:bg-white/20'} disabled:cursor-default`}
      >
        {text}
        <span className="mt-1 block text-[11px] font-normal text-[#e6e8ec]">
          {mine && 'You'}
          {mine && theirs && ' · '}
          {theirs && 'Them'}
        </span>
      </button>
    );
  };
  return (
    <div className="flex flex-col items-center gap-2">
      <p className="text-sm font-medium">Would you rather…</p>
      <div className="flex w-full gap-2">
        {option('a', view.question.a)}
        {option('b', view.question.b)}
      </div>
      <p className="text-xs text-dim">
        {!view.myVote
          ? view.theirVote === 'hidden'
            ? 'They picked — your turn!'
            : 'Pick one'
          : !both
            ? 'Waiting for their answer…'
            : view.myVote === view.theirVote
              ? '🤝 Same answer!'
              : 'You picked differently — talk about it!'}
      </p>
      {both && (
        <button onClick={() => call.gameMove({ next: true })} className={`${btn} bg-lime text-white`}>
          Next question
        </button>
      )}
    </div>
  );
}

/** The game being played, as a card over the call. */
export function GameCard({ call, className = '' }: { call: RandomCall; className?: string }) {
  const view = call.game;
  if (!view) return null;
  const meta = GAMES.find((g) => g.id === view.game);
  if (!meta) return null;
  return (
    <section className={`w-[min(20rem,92vw)] rounded-[20px] border border-line bg-card/95 p-3 text-[#f4f5f7] shadow-2xl backdrop-blur ${className}`} aria-label={meta.name}>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-semibold">
          {meta.emoji} {meta.name}
          {view.startedBy === 'them' && <span className="ml-1 text-xs font-normal text-dim">· they started</span>}
        </p>
        <button onClick={call.endGame} aria-label="Close game" className="rounded-full px-2 text-lg leading-none text-dim hover:text-white">
          ×
        </button>
      </div>
      {view.game === 'ttt' && <TicTacToe view={view} call={call} />}
      {view.game === 'tod' && <TruthOrDare view={view} call={call} />}
      {view.game === 'wyr' && <WouldYouRather view={view} call={call} />}
    </section>
  );
}
