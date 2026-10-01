'use client';

export function Field(props: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  const { label, id, ...rest } = props;
  return (
    <label className="mt-4 block text-sm" htmlFor={id}>
      <span className="font-medium text-slate-600">{label}</span>
      <input id={id} {...rest} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base" />
    </label>
  );
}

export function Submit({ busy, children }: { busy: boolean; children: React.ReactNode }) {
  return (
    <button
      type="submit"
      disabled={busy}
      className="mt-5 w-full rounded-lg bg-brand py-2.5 font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
    >
      {busy ? 'Please wait…' : children}
    </button>
  );
}

export function FormError({ error }: { error: string | null }) {
  return error ? (
    <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
      {error}
    </p>
  ) : null;
}

export function FormNote({ children }: { children: React.ReactNode }) {
  return <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{children}</p>;
}

/** Reads ?token= without useSearchParams (avoids a Suspense boundary on static pages). */
export function tokenFromUrl(): string | null {
  return typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('token');
}

export const errorText = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong');
