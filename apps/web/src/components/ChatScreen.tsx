'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { GENDER_ICON } from '@/lib/format';
import { type RandomCall } from '@/lib/useRandomCall';
import { AdSlot } from './AdSlot';
import { type Corner } from './DraggablePip';
import { CallControls, CancelButton, ReactionLayer, StopNext } from './CallControls';
import { FilterBar } from './FilterBar';
import { LimitModal } from './LimitModal';
import { GiftButton, GiftLayer } from './Coins';
import { FriendButton, FriendsPanel } from './Friends';
import { IncomingCallModal, OnlineUsersPanel } from './OnlineUsers';
import { PlusUpsell } from './PlusUpsell';
import { ChatPanel } from './ChatPanel';
import { SafetyMenu } from './SafetyMenu';
import { ReportDialog } from './ReportDialog';
import { PlusModal } from './PlusModal';
import { AccountMenu, Brand } from './SiteHeader';
import { SettingsMenu } from './SettingsMenu';
import { VideoTile } from './VideoTile';
import { VoiceStage } from './VoiceStage';
import { GameCard, GamesButton } from './Games';
import { DailyRewardChip } from './DailyReward';
import { useI18n } from '@/lib/i18n';
import { CAMERA_PROBLEM } from '@/lib/cameraCheck';

import { MatchPanel } from './chat/MatchPanel';
import { PartnerBadge, PartnerPills } from './chat/PartnerInfo';
import { ConnectionLost, Searching } from './chat/SearchStates';
import { SelfTile } from './chat/SelfTile';

export function ChatScreen({ call }: { call: RandomCall }) {
  const { t } = useI18n();
  const matched = call.status === 'in-call' || call.status === 'connecting';
  const isText = call.mode === 'text';
  const isVoice = call.mode === 'voice';
  const { user } = useAuth();
  const isPlus = !!user?.plus.active;
  const showAd = call.adBreak && !isPlus;
  const [showOnline, setShowOnline] = useState(false);
  // Meet-style chat: closed by default; a side panel on desktop, a sheet over the video on phones.
  const [chatOpen, setChatOpen] = useState(false);
  // Partner messages seen while the chat was open; the rest show as a badge.
  const theirCount = call.messages.filter((m) => m.from === 'them').length;
  const [seen, setSeen] = useState(0);
  useEffect(() => {
    if (chatOpen || theirCount < seen) setSeen(theirCount);
  }, [chatOpen, theirCount, seen]);
  const unread = Math.max(0, theirCount - seen);
  // Adjust view: fill the tile (cropped) or fit the whole picture.
  const [fit, setFit] = useState(false);
  const mainRef = useRef<HTMLElement>(null);
  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void mainRef.current?.requestFullscreen?.().catch(() => undefined);
  }, []);
  const [onlineUpsell, setOnlineUpsell] = useState(false);
  const closeOnline = useCallback(() => setShowOnline(false), []);
  const [showFriends, setShowFriends] = useState(false);
  const closeFriends = useCallback(() => setShowFriends(false), []);
  // One side panel at a time, like Meet: Online now, Friends or Chat.
  const openOnline = useCallback(() => {
    setChatOpen(false);
    setShowFriends(false);
    setShowOnline(true);
  }, []);
  const toggleFriends = useCallback(() => {
    setChatOpen(false);
    setShowOnline(false);
    setShowFriends((o) => !o);
  }, []);
  const toggleChat = useCallback(() => {
    setShowOnline(false);
    setShowFriends(false);
    setChatOpen((o) => !o);
  }, []);
  const sideOpen = chatOpen || showOnline || showFriends;
  // "See who's online" from the home page opens the list straight away.
  useEffect(() => {
    if (call.status !== 'browsing') return;
    if (call.browseFor === 'friends') {
      setChatOpen(false);
      setShowOnline(false);
      setShowFriends(true);
    } else openOnline();
  }, [call.status, call.browseFor, openOnline]);
  // Space = Next (like the button says), unless you're typing.
  const nextRef = useRef(call.next);
  nextRef.current = call.next;
  const stopRef = useRef(call.stop);
  stopRef.current = call.stop;
  const [reportOpen, setReportOpen] = useState(false);
  /** "Tap to reveal" asks once more before showing a hidden video. */
  const [revealAsk, setRevealAsk] = useState(false);
  useEffect(() => setRevealAsk(false), [call.partner]);
  const [plusOpen, setPlusOpen] = useState(false);
  // Report abuse in the more menu opens the same dialog.
  useEffect(() => {
    const open = () => setReportOpen(true);
    window.addEventListener('rc:report', open);
    return () => window.removeEventListener('rc:report', open);
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)) return;
      if (call.mode === 'text' || !['searching', 'in-call', 'connecting', 'browsing'].includes(call.status)) return;
      // Esc stops (or cancels matching); arrow right or Space for the next person.
      if (e.key === 'Escape') {
        if (document.querySelector('[role="dialog"]')) return;
        e.preventDefault();
        stopRef.current();
      } else if (e.key === 'ArrowRight' || (e.code === 'Space' && el?.tagName !== 'BUTTON')) {
        e.preventDefault();
        nextRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [call.mode, call.status]);
  const [pipCorner, setPipCorner] = useState<Corner>('br');
  const pipOnTop = pipCorner[0] === 't';


  const chat = (className: string) => (
    <ChatPanel
      className={className}
      messages={call.messages}
      partnerTyping={call.partnerTyping}
      enabled={matched}
      onSend={call.sendMessage}
      onTyping={call.notifyTyping}
    />
  );

  return (
    // Full-screen dark call view, like Google Meet.
    <main ref={mainRef} className={`flex h-[100dvh] w-full flex-col overflow-hidden bg-night ${isText ? 'px-2 pb-2 pt-2 sm:px-5 sm:pb-5 sm:pt-3' : 'sm:p-4'}`}>
      <div className="flex min-h-0 flex-1 flex-col gap-2 sm:gap-3 [@media(max-height:500px)]:gap-1.5">
        {/* Header (text chat): logo · online · settings · upgrade. Calls carry these over the video instead. */}
        {isText && (
        <header className="flex items-center gap-2 sm:gap-3">
          <span className="flex items-center gap-2">
            <span className="sm:hidden">
              <Brand compact />
            </span>
            <span className="max-sm:hidden">
              <Brand compact />
            </span>
            {isText && <span className="text-sm text-dim max-md:hidden">text chat</span>}
            {isVoice && <span className="text-sm text-dim max-md:hidden">voice call</span>}
          </span>
          {/* Filters share the header row on wide and short screens; phones get their own row below. */}
          <div className="ml-2 mr-auto hidden min-w-0 sm:block [@media(max-height:500px)]:block">
            <FilterBar />
          </div>
          <span className="mr-auto sm:hidden [@media(max-height:500px)]:hidden" aria-hidden />
          <button
            onClick={toggleFriends}
            aria-pressed={showFriends}
            title="Friends"
            className={`flex h-11 items-center gap-2 rounded-[10px] border px-3 text-sm transition sm:px-3.5 ${showFriends ? 'border-lime bg-pick text-[#f4f5f7]' : 'border-line bg-card text-[#e8ebf2] hover:border-line-2'}`}
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4 text-lime" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" />
            </svg>
            <span className="hidden sm:inline">Friends</span>
          </button>
          {/* Online count and the Online list are Plus-only. */}
          <button
            onClick={() => (isPlus ? (showOnline ? closeOnline() : openOnline()) : setOnlineUpsell(true))}
            aria-pressed={showOnline}
            className={`flex h-11 items-center gap-2 rounded-[10px] border px-3 text-sm transition sm:px-3.5 ${showOnline ? 'border-lime text-[#e8ebf2]' : 'border-line bg-card text-[#b7becc] hover:border-line-2'}`}
            title={isPlus ? 'See who is online and call them' : 'See who is online (Plus)'}
          >
            <span className="h-2 w-2 rounded-full bg-[#3ddc84]" aria-hidden />
            {isPlus && call.online !== null ? (
              <span>
                {Math.max(0, call.online - 1).toLocaleString()}
                <span className="hidden sm:inline"> online</span>
              </span>
            ) : (
              <span>
                <span className="hidden sm:inline">Online </span>👑
              </span>
            )}
          </button>
          {user && <DailyRewardChip refreshKey={call.status === 'in-call' ? call.partner : null} />}
          {user && (
            <Link
              href="/coins"
              target="_blank"
              className="flex h-10 items-center gap-2 rounded-[10px] border border-[#3a3418] bg-[#1b1a10] px-3 text-sm font-semibold text-gold max-sm:hidden"
              title="Coins"
            >
              <svg viewBox="0 0 24 24" className="h-[15px] w-[15px]" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden>
                <circle cx="12" cy="12" r="8" />
                <path d="M12 8v8M9.5 10.5h4a1.5 1.5 0 0 1 0 3h-3" />
              </svg>
              {(call.wallet ?? user.wallet).coins.toLocaleString()}
            </Link>
          )}
          {/* Video calls have settings under ⋮ in the call bar. */}
          {isText && <SettingsMenu call={call} />}
          {!isPlus && (
            <Link href="/plus" target="_blank" className="flex h-10 items-center rounded-[10px] bg-gold px-3.5 text-sm font-semibold text-[#1a1608] hover:brightness-105 max-sm:hidden">
              Upgrade
            </Link>
          )}
          {user ? (
            <AccountMenu />
          ) : (
            <Link href="/login" target="_blank" className="flex h-10 items-center rounded-[10px] border border-line bg-card px-3.5 text-sm text-[#e8ebf2] max-sm:hidden">
              Log in
            </Link>
          )}
        </header>
        )}

        {isText && (
          <div className="sm:hidden [@media(max-height:500px)]:hidden">
            <FilterBar />
          </div>
        )}

        <LimitModal call={call} />
        <ConnectionLost call={call} />
        <IncomingCallModal call={call} />
        {/* Text chat has no side column, so the list floats on the right there. */}
        {showOnline && isText && <OnlineUsersPanel call={call} onClose={closeOnline} className="fixed inset-y-2 right-2 z-40 w-[min(24rem,95vw)] shadow-2xl" />}
        {showFriends && isText && <FriendsPanel call={call} onClose={closeFriends} className="fixed inset-y-2 right-2 z-40 w-[min(24rem,95vw)] shadow-2xl" />}
        {onlineUpsell && <PlusUpsell onClose={() => setOnlineUpsell(false)} reason="See who’s online right now" body="With Plus, see who is online and call them directly." />}
        {!isPlus && call.limit && !call.limit.unlimited && call.limit.remaining <= 5 && call.status !== 'limited' && (
          <p className="-mt-1 text-xs text-amber-300">
            {call.limit.remaining === 0 ? 'No free matches left today.' : `${call.limit.remaining} free match${call.limit.remaining === 1 ? '' : 'es'} left today.`}{' '}
            <Link href="/plus" className="font-semibold underline">
              Get unlimited
            </Link>
          </p>
        )}
        {call.plusRequired && <PlusUpsell onClose={call.dismissPlusRequired} reason="Want to choose who you meet?" body="With Plus, pick gender and country so every match fits." />}
        {call.notice && (
          <p role="status" className="rounded-xl bg-gold-bg px-3 py-2 text-sm text-gold">
            {call.notice}
          </p>
        )}

        {isText ? (
          <div className="relative flex min-h-0 flex-1 flex-col gap-2">
            <div className="relative flex min-h-8 items-center justify-between">
              <div className="flex items-center gap-2">
                <PartnerBadge call={call} />
                {matched && <FriendButton call={call} />}
                {matched && <GiftButton call={call} />}
                {matched && <GamesButton call={call} />}
              </div>
              <SafetyMenu call={call} />
            </div>
            <div className="relative min-h-0 flex-1">
              {chat('h-full')}
              {matched && call.game && (
                <div className="absolute inset-x-0 top-2 z-20 flex justify-center px-2">
                  <GameCard call={call} />
                </div>
              )}
              {(!matched || showAd) && (
                <div className="absolute inset-0 overflow-hidden rounded-xl bg-night/90">
                  {showAd ? (
                    <AdSlot placement="break" refreshKey={call.adKey} className="h-full rounded-none" />
                  ) : (
                    <div className="pointer-events-none">
                      <Searching call={call} />
                    </div>
                  )}
                </div>
              )}
              <div className="absolute bottom-16 left-0 right-0 z-20 flex justify-center">
                <StopNext call={call} compact />
              </div>
            </div>
          </div>
        ) : (
          // Video / voice: the stranger and you side by side on larger screens; on phones the stranger fills the screen with you inset.
          <div className={`flex min-h-0 flex-1 flex-col gap-3 sm:grid ${isVoice ? '' : 'sm:grid-cols-2'}`}>
            {/* While matching on phones, your camera comes first. */}
            {!isVoice && !matched && <SelfTile call={call} controls className="mx-2 mt-2 shrink-0 max-sm:h-[52dvh] sm:order-2 sm:m-0" />}
            <VideoTile
              stream={matched ? call.remoteStream : null}
              videoRef={call.setPartnerVideo}
              forceVisible={call.relayActive}
              className={`min-h-0 flex-1 sm:rounded-3xl ${
                matched || isVoice
                  ? 'rounded-b-[28px] !bg-[linear-gradient(165deg,#8a5fc2,#3b2a4f)]'
                  : 'max-sm:!bg-transparent sm:border sm:border-[#1c1f26] sm:!bg-[radial-gradient(circle_at_50%_45%,#1e0f2a_0%,#120d18_65%)]'
              }`}
              videoClassName={`absolute inset-0 transition-[filter] duration-700 ${fit ? '!object-contain' : ''} ${
                reportOpen || call.partnerHidden || call.aiHidden ? 'blur-3xl brightness-50' : call.blurPartner ? 'blur-xl' : ''
              }`}
            >
              {!matched && !showAd && !isVoice && (
                <div className="absolute inset-0 z-10 flex items-center justify-center max-sm:items-start max-sm:pt-1">
                  <MatchPanel call={call} onPlus={() => setPlusOpen(true)} />
                </div>
              )}
              {isVoice && !showAd && (
                <VoiceStage call={call} matched={matched} partnerEmoji={call.partner ? (call.partner.avatar ?? GENDER_ICON[call.partner.gender]) : '🙂'} />
              )}
              {isVoice && !matched && !showAd && (
                <div className="absolute inset-x-0 top-14 flex justify-center px-4">
                  <Searching call={call} />
                </div>
              )}
              {matched && !reportOpen && (call.partnerHidden || call.aiHidden) && (
                <div className="absolute inset-0 z-[15] flex items-center justify-center overflow-y-auto p-4">
                  <section className="flex w-full max-w-[400px] flex-col gap-3 rounded-[22px] border border-divider bg-[rgba(23,18,31,.94)] p-5 text-center shadow-[0_30px_80px_rgba(0,0,0,.55)] sm:gap-4 sm:p-7">
                    <span aria-hidden className="flex h-14 w-14 items-center justify-center self-center rounded-full bg-[#FF6FAE1F] text-lime sm:h-[72px] sm:w-[72px]">
                      <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" />
                        <path d="M9 12l2 2 4-4" />
                      </svg>
                    </span>
                    <h2 className="m-0 font-display text-[22px] font-bold leading-[1.15] sm:text-[26px]">
                      {call.aiHidden ? 'Blurred for safety' : call.partner?.isNew ? 'New user, video hidden' : 'Partner video hidden'}
                    </h2>
                    <p className="m-0 text-sm leading-normal text-mute sm:text-base">
                      {call.aiHidden
                        ? 'Our system flagged possible nudity. You won’t see it unless you choose to.'
                        : 'Hidden for your safety. You won’t see it unless you choose to.'}
                    </p>
                    <div className="mt-1 flex flex-col gap-2.5">
                      <button
                        onClick={() => setReportOpen(true)}
                        className="flex h-12 w-full items-center justify-center rounded-[14px] bg-[#D93A4A] font-display text-base font-bold text-white sm:h-[52px]"
                      >
                        Report &amp; find next
                      </button>
                      <button
                        onClick={call.next}
                        className="flex h-12 w-full items-center justify-center rounded-[14px] bg-lime font-display text-base font-bold text-night sm:h-[52px]"
                      >
                        Next
                      </button>
                      {revealAsk ? (
                        <div role="alertdialog" aria-label="Reveal video?" className="flex flex-col gap-2.5 rounded-[14px] border border-[#4A2424] bg-[#2A1616] p-3.5 text-left">
                          <b className="text-[#FFD3CE]">Show this video anyway?</b>
                          <span className="text-[13px] text-[#FFD3CE]">It may contain nudity. You can report it at any time.</span>
                          <div className="flex gap-2">
                            <button type="button" autoFocus onClick={() => setRevealAsk(false)} className="h-11 flex-1 rounded-xl border-[1.5px] border-[#6b5d84] text-sm font-semibold text-[#e6e8ec]">
                              Keep hidden
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setRevealAsk(false);
                                call.togglePartnerHidden();
                              }}
                              className="h-11 flex-1 rounded-xl bg-[#3A2A33] text-sm font-semibold text-[#FFD3CE]"
                            >
                              Show anyway
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button onClick={() => setRevealAsk(true)} className="flex h-11 w-full items-center justify-center text-sm font-semibold text-mute underline hover:text-white">
                          Tap to reveal (18+)
                        </button>
                      )}
                    </div>
                  </section>
                </div>
              )}

              {/* A fresh ad between strangers; the next match connects underneath. */}
              {showAd && (
                <div className="absolute inset-0 z-10">
                  <AdSlot placement="break" refreshKey={call.adKey} className="h-full rounded-none" />
                  <p className="absolute left-0 right-0 top-3 text-center text-xs text-white/80">Your next stranger is right after this ad</p>
                </div>
              )}

              {matched && !showAd && (
                // Top of the video: who they are and the call clock; Report on the right.
                <div className="absolute inset-x-4 top-4 z-20 flex items-start justify-between gap-2">
                  <div className="flex min-w-0 flex-wrap items-center gap-1.5 sm:gap-2">
                    <PartnerPills call={call} />
                    {call.relayActive && (
                      <span
                        className="flex h-9 items-center rounded-full bg-amber-500/90 px-3 text-xs font-medium text-white"
                        title="Your networks blocked a direct connection, so video goes through our server with a short delay."
                      >
                        Relay · slight delay
                      </span>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setReportOpen(true)}
                      aria-label="Report or block"
                      className="flex h-11 items-center gap-1.5 rounded-full bg-black/50 text-[13px] font-medium text-stop-text max-sm:w-11 max-sm:justify-center sm:px-4"
                    >
                      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.2} aria-hidden>
                        <path d="M5 21V4h11l-2 4 2 4H5" />
                      </svg>
                      <span className="max-sm:hidden">Report</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Phones, in a call: you, inset bottom-right. */}
              {!isVoice && matched && (
                <div className="absolute bottom-4 right-4 z-20 h-[140px] w-[104px] overflow-hidden rounded-2xl border-2 border-white/25 sm:hidden">
                  <SelfTile call={call} className="h-full w-full !rounded-none" />
                </div>
              )}

              {(call.cameraProblem || call.noFace) && (
                <div className="absolute inset-x-0 bottom-3 z-20 flex justify-center px-3" role="status">
                  <p className={`rounded-full px-4 py-1.5 text-sm font-medium text-white shadow-lg ${call.cameraProblem ? 'bg-red-600/90' : 'bg-amber-500/90'}`}>
                    {call.cameraProblem ? CAMERA_PROBLEM[call.cameraProblem].chip : "🙂 We can't see your face — look at the camera so people don't skip you"}
                  </p>
                </div>
              )}
              <ReactionLayer call={call} />
              <GiftLayer call={call} />
              {matched && call.game && (
                <div className="absolute inset-x-0 bottom-3 z-20 flex justify-center px-3 lg:inset-x-auto lg:left-3">
                  <GameCard call={call} />
                </div>
              )}
              {call.icebreaker && matched && (
                <div className="absolute inset-x-3 top-20 z-20 flex justify-center">
                  <div className="w-full max-w-md rounded-2xl bg-black/70 px-4 py-3 text-center text-white shadow-xl backdrop-blur" role="status">
                    <p className="text-xs font-semibold uppercase tracking-wide text-lime">Icebreaker</p>
                    <p className="mt-1 text-base font-medium sm:text-lg">{call.icebreaker.text}</p>
                    <div className="mt-2 flex justify-center gap-2 text-xs">
                      <button onClick={call.askIcebreaker} className="rounded-full bg-white/15 px-3 py-1 hover:bg-white/25">
                        Another one
                      </button>
                      <button onClick={call.dismissIcebreaker} className="rounded-full px-3 py-1 text-white/70 hover:text-white">
                        Close
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </VideoTile>
            {/* Larger screens: you, beside them. */}
            {!isVoice && matched && <SelfTile call={call} className="max-sm:hidden" />}

            {showOnline && <OnlineUsersPanel call={call} onClose={closeOnline} className="fixed z-40 inset-x-0 bottom-0 h-[400px] rounded-t-3xl shadow-2xl sm:inset-x-auto sm:bottom-[108px] sm:right-8 sm:top-8 sm:h-auto sm:w-[360px] sm:rounded-[20px]" />}
            {showFriends && <FriendsPanel call={call} onClose={closeFriends} className="fixed z-40 inset-x-0 bottom-0 h-[400px] rounded-t-3xl shadow-2xl sm:inset-x-auto sm:bottom-[108px] sm:right-8 sm:top-8 sm:h-auto sm:w-[360px] sm:rounded-[20px]" />}
            {chatOpen && (
              <ChatPanel
                variant="meet"
                autoFocus
                onIcebreaker={matched ? call.askIcebreaker : undefined}
                canAutoTranslate={isPlus}
                onClose={() => setChatOpen(false)}
                messages={call.messages}
                partnerTyping={call.partnerTyping}
                enabled={matched}
                onSend={call.sendMessage}
                onTyping={call.notifyTyping}
                className="fixed z-40 inset-x-0 bottom-0 h-[400px] rounded-t-3xl shadow-2xl sm:inset-x-auto sm:bottom-[108px] sm:right-8 sm:top-8 sm:h-auto sm:w-[360px] sm:rounded-[20px]"
              />
            )}
          </div>
        )}

        {/* Under the video: Stop / Next (or Cancel) on the left, the keys, the controls on the right. Phones: controls row, then Stop / Next. */}
        {!isText && (
          <div className="flex shrink-0 flex-col gap-3 px-4 pb-6 pt-3 sm:h-16 sm:flex-row-reverse sm:items-center sm:justify-between sm:px-1 sm:pb-0 sm:pt-0">
            <div className={matched ? 'w-full sm:w-auto' : 'max-sm:hidden'}>
              <CallControls
                rail
                minimal={!matched}
                call={call}
                matched={matched}
                chatOpen={chatOpen}
                onToggleChat={toggleChat}
                unread={unread}
                fit={fit}
                onToggleFit={() => setFit((f) => !f)}
                onToggleFullscreen={toggleFullscreen}
              />
            </div>
            <span className="whitespace-nowrap text-[13px] text-[#8a8f99] max-lg:hidden">{matched ? 'Esc to stop · → for next' : 'Esc to cancel'}</span>
            {matched || call.status === 'browsing' ? (
              <StopNext call={call} wide />
            ) : (
              <div className="flex w-full gap-2 sm:w-auto">
                <CancelButton call={call} wide />
                <button
                  type="button"
                  onClick={() => setPlusOpen(true)}
                  className="flex h-14 flex-1 items-center justify-center gap-1.5 rounded-2xl border border-[#4a3f17] bg-gold-bg text-sm font-semibold text-gold sm:hidden"
                >
                  Filters{isPlus ? '' : ' · Plus'}
                </button>
              </div>
            )}
          </div>
        )}
        {reportOpen && <ReportDialog call={call} onClose={() => setReportOpen(false)} />}
        {plusOpen && <PlusModal onClose={() => setPlusOpen(false)} />}
      </div>
    </main>
  );
}
