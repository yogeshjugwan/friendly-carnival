'use client';

export function Field(props: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  const { label, id, ...rest } = props;
  return (
    <label className="mt-4 block text-[13px]" htmlFor={id}>
      <span className="font-medium text-mute">{label}</span>
      <input
        id={id}
        {...rest}
        className="mt-1.5 h-[46px] w-full rounded-xl border border-[#6b5d84] bg-card-2 px-3.5 text-[15px] text-[#f4f5f7] [color-scheme:dark] placeholder:text-faint focus:outline-2 focus:outline-offset-1 focus:outline-lime"
      />
    </label>
  );
}

export function Submit({ busy, children }: { busy: boolean; children: React.ReactNode }) {
  return (
    <button
      type="submit"
      disabled={busy}
      className="mt-5 h-[52px] w-full rounded-2xl bg-lime font-display text-base font-bold text-night transition hover:bg-lime-hover disabled:opacity-50"
    >
      {busy ? 'Please wait…' : children}
    </button>
  );
}

export function FormError({ error }: { error: string | null }) {
  return error ? (
    <p role="alert" className="mt-3 rounded-xl border border-[#4a2424] bg-[#2a1616] px-3 py-2.5 text-[13px] text-[#ffb3ac]">
      {error}
    </p>
  ) : null;
}

export function FormNote({ children }: { children: React.ReactNode }) {
  return <p className="mt-3 rounded-xl bg-lime/10 px-3 py-2 text-sm text-lime">{children}</p>;
}

/** Reads ?token= without useSearchParams (avoids a Suspense boundary on static pages). */
export function tokenFromUrl(): string | null {
  return typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('token');
}

export const errorText = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong');
