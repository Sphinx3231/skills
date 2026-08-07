import { useCallback, useRef, useState } from 'react';

import { type FoxMomentKind, shouldPlayFoxMoment } from '@/lib/fox-moments';

/**
 * Keeps at most one FoxMoment mounted at a time (each is a decoded animated
 * GIF, so stacking several concurrently multiplies memory cost for no
 * visible benefit) by queuing anything enqueued while one is already
 * playing. Respects reduce-motion by dropping enqueues entirely.
 */
export function useFoxMomentQueue(reduceMotionEnabled: boolean) {
  const [active, setActive] = useState<FoxMomentKind | null>(null);
  const queueRef = useRef<FoxMomentKind[]>([]);

  const enqueue = useCallback(
    (kind: FoxMomentKind) => {
      if (!shouldPlayFoxMoment(reduceMotionEnabled)) return;
      setActive((current) => {
        if (current !== null) {
          queueRef.current.push(kind);
          return current;
        }
        return kind;
      });
    },
    [reduceMotionEnabled]
  );

  const handleDone = useCallback(() => {
    setActive(queueRef.current.shift() ?? null);
  }, []);

  return { active, enqueue, handleDone };
}
