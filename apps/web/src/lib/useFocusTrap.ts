'use client';

import { useCallback, useRef } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Pure: index of the element Tab should move to, or null to let the browser handle it. */
export function trapIndex(count: number, current: number, shift: boolean): number | null {
  if (count === 0) return null;
  if (shift && current <= 0) return count - 1;
  if (!shift && (current === count - 1 || current === -1)) return 0;
  return null;
}

/**
 * Modal focus handling as a callback ref: moves focus into the dialog when it
 * mounts, keeps Tab / Shift+Tab inside it, and gives focus back to whatever
 * had it (usually the button that opened it) when the dialog closes.
 */
export function useFocusTrap() {
  const cleanup = useRef<(() => void) | null>(null);
  return useCallback((el: HTMLElement | null) => {
    cleanup.current?.();
    cleanup.current = null;
    if (!el) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const items = () => [...el.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((x) => x.offsetParent !== null || x === document.activeElement);
    if (!el.contains(document.activeElement)) {
      const first = items()[0];
      if (first) first.focus();
      else {
        if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');
        el.focus();
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const list = items();
      const active = document.activeElement as HTMLElement | null;
      const i = trapIndex(list.length, active ? list.indexOf(active) : -1, e.shiftKey);
      if (list.length === 0) e.preventDefault();
      else if (i !== null) {
        e.preventDefault();
        list[i]?.focus();
      }
    };
    el.addEventListener('keydown', onKey);
    cleanup.current = () => {
      el.removeEventListener('keydown', onKey);
      if (opener?.isConnected) opener.focus();
    };
  }, []);
}
