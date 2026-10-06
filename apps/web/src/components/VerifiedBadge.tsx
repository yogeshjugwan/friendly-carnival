/** Blue ✓: a moderator matched this person's selfie to a live gesture. */
export function VerifiedBadge({ className = '' }: { className?: string }) {
  return (
    <span
      title="Verified: a real person, checked by a moderator"
      aria-label="Verified"
      className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-sky-500 text-[10px] font-bold leading-none text-white ${className}`}
    >
      ✓
    </span>
  );
}
