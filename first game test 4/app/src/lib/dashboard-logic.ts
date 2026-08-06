import type { FoodLog } from '@/lib/api';
import type { FoxMood } from '@/components/fox-companion';

export type MealBucket = { key: string; label: string; logs: FoodLog[] };

export function bucketLogs(logs: FoodLog[]): MealBucket[] {
  const buckets: MealBucket[] = [
    { key: 'morning', label: 'Morning Forage', logs: [] },
    { key: 'midday', label: 'Midday Feast', logs: [] },
    { key: 'evening', label: 'Evening Den', logs: [] },
    { key: 'snare', label: 'Quick Snare', logs: [] },
  ];
  for (const log of logs) {
    const hour = new Date(log.logged_at + 'Z').getHours();
    if (hour >= 5 && hour < 11) buckets[0].logs.push(log);
    else if (hour >= 11 && hour < 16) buckets[1].logs.push(log);
    else if (hour >= 16 && hour < 22) buckets[2].logs.push(log);
    else buckets[3].logs.push(log);
  }
  return buckets.filter((b) => b.logs.length > 0);
}

export function foxxyState(logCount: number, calories: number, goal: number): { mood: FoxMood; line: string } {
  if (logCount === 0) {
    return { mood: 'empty', line: 'Ready to forage? Log your first bite of the day.' };
  }
  if (calories > goal) {
    return { mood: 'over', line: 'A feast fit for the den. We’ll balance it tomorrow!' };
  }
  const remaining = goal - calories;
  if (remaining <= goal * 0.15) {
    return { mood: 'onTarget', line: `Sly moves! Only ${remaining} cal left to hit your goal.` };
  }
  return { mood: 'onTarget', line: `${remaining} cal remaining — keep the trail going.` };
}
