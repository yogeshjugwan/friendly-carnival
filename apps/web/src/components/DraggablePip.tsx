'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';

export type Corner = 'tl' | 'tr' | 'bl' | 'br';
const KEY = 'rc.pipCorner';
/** Movement (px) before a press counts as a drag rather than a tap. */
const DRAG_THRESHOLD = 6;
const EDGE = 4;

/**
 * Corner positions, kept clear of the partner badge / Safety button (top) and
 * the call bar (bottom).
 */
const CORNER_CLASS: Record<Corner, string> = {
  tl: 'left-3 top-[4.5rem] sm:left-4 max-lg:landscape:top-12',
  tr: 'right-3 top-14 sm:right-4 max-lg:landscape:top-12',
  bl: 'left-3 bottom-[4.75rem] sm:left-4 sm:bottom-24',
  br: 'right-3 bottom-[4.75rem] sm:right-4 sm:bottom-24',
};

function loadCorner(): Corner {
  try {
    const v = window.localStorage.getItem(KEY);
    return v === 'tl' || v === 'tr' || v === 'bl' || v === 'br' ? v : 'br';
  } catch {
    return 'br';
  }
}

type Drag = { id: number; x: number; y: number; moved: boolean; box: DOMRect; area: DOMRect };

/**
 * Picture-in-picture that can be dragged anywhere inside its positioned parent
 * and glides to the nearest corner on release, like WhatsApp's self-view.
 */
export function DraggablePip({
  className = '',
  onCornerChange,
  children,
}: {
  className?: string;
  /** Lets the parent move other overlays out of the way. */
  onCornerChange?: (corner: Corner) => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [corner, setCorner] = useState<Corner>('br');
  const drag = useRef<Drag | null>(null);
  /** Where the preview was dropped, so the snap can animate from there. */
  const dropFrom = useRef<DOMRect | null>(null);

  useEffect(() => setCorner(loadCorner()), []);
  useEffect(() => onCornerChange?.(corner), [corner, onCornerChange]);

  const move = (dx: number, dy: number) => {
    if (ref.current) ref.current.style.transform = `translate(${dx}px, ${dy}px)`;
  };

  // FLIP: after the corner changes, start from the drop point and glide into place.
  useLayoutEffect(() => {
    const el = ref.current;
    const from = dropFrom.current;
    dropFrom.current = null;
    if (!el || !from) return;
    const to = el.getBoundingClientRect();
    el.style.transition = 'none';
    move(from.left - to.left, from.top - to.top);
    void el.offsetWidth; // apply the start position before animating
    el.style.transition = 'transform 280ms cubic-bezier(0.2, 0.8, 0.2, 1)';
    move(0, 0);
  }, [corner]);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = ref.current;
    const parent = el?.offsetParent as HTMLElement | null;
    if (e.button !== 0 || !el || !parent) return;
    el.style.transition = 'none';
    el.style.transform = '';
    drag.current = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      moved: false,
      box: el.getBoundingClientRect(),
      area: parent.getBoundingClientRect(),
    };
    el.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    d.moved = true;
    // Keep the preview inside the video area while dragging.
    const { box, area } = d;
    move(
      Math.min(Math.max(dx, area.left + EDGE - box.left), area.right - EDGE - box.right),
      Math.min(Math.max(dy, area.top + EDGE - box.top), area.bottom - EDGE - box.bottom),
    );
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    const el = ref.current;
    if (!d || d.id !== e.pointerId || !el) return;
    drag.current = null;
    if (!d.moved) return move(0, 0);
    // Snap to the corner nearest to where the preview was dropped.
    const box = el.getBoundingClientRect();
    const cx = box.left + box.width / 2 - d.area.left;
    const cy = box.top + box.height / 2 - d.area.top;
    const next = `${cy < d.area.height / 2 ? 't' : 'b'}${cx < d.area.width / 2 ? 'l' : 'r'}` as Corner;
    el.style.transform = '';
    dropFrom.current = box;
    if (next === corner) {
      // Same corner: the layout effect won't run, so glide back here.
      const to = el.getBoundingClientRect();
      move(box.left - to.left, box.top - to.top);
      void el.offsetWidth;
      el.style.transition = 'transform 280ms cubic-bezier(0.2, 0.8, 0.2, 1)';
      move(0, 0);
      dropFrom.current = null;
      return;
    }
    setCorner(next);
    try {
      window.localStorage.setItem(KEY, next);
    } catch {
      /* private mode: just don't remember it */
    }
  };

  return (
    <div
      ref={ref}
      role="group"
      aria-label="Your camera. Drag to move it to another corner."
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      className={`absolute z-20 cursor-grab touch-none select-none will-change-transform active:cursor-grabbing ${CORNER_CLASS[corner]} ${className}`}
    >
      {children}
    </div>
  );
}
