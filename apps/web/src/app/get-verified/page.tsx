'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { MAX_VERIFY_PHOTO, VERIFY_GESTURES, type PublicUser, type VerifyGestureId } from '@rc/shared';
import { SiteFooter, SiteHeader } from '@/components/SiteHeader';
import { errorText, FormError } from '@/components/forms/fields';
import { api, useAuth } from '@/lib/auth';
import { faceVisible } from '@/lib/faceCheck';

type Step = 'intro' | 'camera' | 'review' | 'sending';

/** JPEG of the current video frame, shrunk until it fits the server limit. */
function snapshot(video: HTMLVideoElement): string {
  const canvas = document.createElement('canvas');
  const w = Math.min(720, video.videoWidth || 640);
  canvas.width = w;
  canvas.height = Math.round((w * (video.videoHeight || 480)) / (video.videoWidth || 640));
  canvas.getContext('2d')!.drawImage(video, 0, 0, canvas.width, canvas.height);
  for (const q of [0.85, 0.7, 0.55, 0.4]) {
    const url = canvas.toDataURL('image/jpeg', q);
    if (url.length <= MAX_VERIFY_PHOTO) return url;
  }
  return canvas.toDataURL('image/jpeg', 0.3);
}

export default function GetVerifiedPage() {
  const { user, token, loading, refresh } = useAuth();
  const [step, setStep] = useState<Step>('intro');
  const [gesture, setGesture] = useState<VerifyGestureId | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);
  useEffect(() => stopCamera, [stopCamera]);

  const start = async () => {
    if (!token) return;
    setError(null);
    try {
      const ch = await api<{ gesture: VerifyGestureId }>('/auth/verification/challenge', {}, token);
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 } }, audio: false });
      streamRef.current = stream;
      setGesture(ch.gesture);
      setPhoto(null);
      setStep('camera');
    } catch (e) {
      setError(e instanceof DOMException ? 'Allow camera access to take your verification selfie.' : errorText(e));
    }
  };

  // Attach the stream once the <video> is on screen.
  useEffect(() => {
    if (step === 'camera' && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      void videoRef.current.play().catch(() => undefined);
    }
  }, [step]);

  const capture = async () => {
    const video = videoRef.current;
    const stream = streamRef.current;
    if (!video || !stream) return;
    setError(null);
    for (let n = 3; n > 0; n--) {
      setCountdown(n);
      await new Promise((r) => setTimeout(r, 1000));
    }
    setCountdown(null);
    if ((await faceVisible(stream)) === false) {
      setError("We couldn't see your face. Face the camera in good light and try again.");
      return;
    }
    setPhoto(snapshot(video));
    setStep('review');
  };

  const send = async () => {
    if (!token || !photo) return;
    setStep('sending');
    setError(null);
    try {
      await api<PublicUser>('/auth/verification', { photo }, token);
      stopCamera();
      setPhoto(null);
      await refresh();
      setStep('intro');
    } catch (e) {
      setError(errorText(e));
      setStep('review');
    }
  };

  const g = VERIFY_GESTURES.find((x) => x.id === gesture);
  const status = user?.verification ?? 'none';

  return (
    <main className="mx-auto flex min-h-full max-w-2xl flex-col gap-6 px-4 py-6 sm:px-6">
      <SiteHeader />
      <section className="mt-2 text-center">
        <p className="text-5xl" aria-hidden>
          <span className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-sky-500 text-4xl font-bold text-white">✓</span>
        </p>
        <h1 className="mt-3 text-3xl font-bold">Get the Verified badge</h1>
        <p className="mt-2 text-slate-300">
          Show strangers you&apos;re a real person. Verified people get more matches, and Plus members can choose to meet only verified people.
        </p>
      </section>

      <FormError error={error} />

      {loading ? null : !user ? (
        <p className="rounded-xl bg-white/5 p-4 text-center text-slate-300">
          <Link href="/login?next=/get-verified" className="font-semibold text-sky-300 underline">
            Log in
          </Link>{' '}
          or{' '}
          <Link href="/signup?next=/get-verified" className="font-semibold text-sky-300 underline">
            create a free account
          </Link>{' '}
          to get verified.
        </p>
      ) : status === 'verified' ? (
        <p className="rounded-2xl bg-white p-6 text-center text-ink">
          <span className="text-lg font-semibold">✓ You&apos;re verified.</span>
          <span className="mt-1 block text-sm text-slate-500">Partners see the badge next to your country.</span>
        </p>
      ) : step === 'intro' ? (
        <section className="rounded-2xl bg-white p-6 text-ink">
          {status === 'pending' && (
            <p className="mb-4 rounded-lg bg-sky-50 p-3 text-sm text-sky-900">
              ⏳ Your selfie is being reviewed — usually within 24 hours. You can keep chatting meanwhile.
            </p>
          )}
          {status === 'rejected' && (
            <p className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
              Your last selfie wasn&apos;t approved. Make sure your whole face and the gesture are clearly visible, then try again.
            </p>
          )}
          <ol className="list-decimal space-y-1.5 pl-5 text-sm text-slate-700">
            <li>We show you a random hand gesture.</li>
            <li>Take a selfie doing it, with your face clearly visible.</li>
            <li>A moderator compares it — the photo is deleted right after and is never shown to anyone else.</li>
          </ol>
          {status !== 'pending' && (
            <button onClick={() => void start()} className="mt-5 w-full rounded-lg bg-sky-600 py-3 font-semibold text-white hover:bg-sky-700">
              {status === 'rejected' ? 'Try again' : 'Start'}
            </button>
          )}
        </section>
      ) : (
        <section className="rounded-2xl bg-white p-4 text-ink sm:p-6">
          {g && (
            <p className="mb-3 text-center text-lg font-semibold">
              <span className="mr-2 text-3xl align-middle">{g.emoji}</span>
              {g.text}
            </p>
          )}
          <div className="relative mx-auto aspect-[4/3] w-full max-w-md overflow-hidden rounded-xl bg-slate-900">
            {step === 'camera' ? (
              <>
                <video ref={videoRef} muted playsInline className="h-full w-full -scale-x-100 object-cover" />
                <div className="pointer-events-none absolute left-1/2 top-1/2 h-3/4 w-2/5 -translate-x-1/2 -translate-y-1/2 rounded-[50%] border-4 border-white/70" />
                {countdown !== null && (
                  <span className="absolute inset-0 flex items-center justify-center text-7xl font-bold text-white drop-shadow-lg">{countdown}</span>
                )}
              </>
            ) : (
              photo && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photo} alt="Your verification selfie" className="h-full w-full -scale-x-100 object-cover" />
              )
            )}
          </div>
          <div className="mt-4 flex gap-3">
            {step === 'camera' ? (
              <>
                <button
                  onClick={() => {
                    stopCamera();
                    setStep('intro');
                  }}
                  className="flex-1 rounded-lg bg-slate-200 py-2.5 font-semibold hover:bg-slate-300"
                >
                  Cancel
                </button>
                <button
                  onClick={() => void capture()}
                  disabled={countdown !== null}
                  className="flex-1 rounded-lg bg-sky-600 py-2.5 font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
                >
                  {countdown !== null ? 'Hold it…' : 'Take photo'}
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => setStep('camera')}
                  disabled={step === 'sending'}
                  className="flex-1 rounded-lg bg-slate-200 py-2.5 font-semibold hover:bg-slate-300 disabled:opacity-50"
                >
                  Retake
                </button>
                <button
                  onClick={() => void send()}
                  disabled={step === 'sending'}
                  className="flex-1 rounded-lg bg-sky-600 py-2.5 font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
                >
                  {step === 'sending' ? 'Sending…' : 'Send for review'}
                </button>
              </>
            )}
          </div>
        </section>
      )}
      <SiteFooter />
    </main>
  );
}
