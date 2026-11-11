import type { ActivityRecommendation, RecommendationContext } from '../types/recommendations';
import { recommendActivities } from '../utils/recommendations';
import { criticalToken, normalizeActivity } from '../utils/activityTiming';
import { dateKey } from '../utils/dates';

export interface RecommendationRound {
  date: string;
  number: number;
  skipped: { key: string; urgency: string | null }[];
}
export const newRound = (date: string, number = 1): RecommendationRound => ({
  date,
  number,
  skipped: [],
});

/** Pure offline engine. Source stores and persistence remain outside this layer. */
export class RecommendationEngine {
  recommend(context: RecommendationContext, saved?: RecommendationRound) {
    const round = saved?.date === dateKey(context.now) ? saved : newRound(dateKey(context.now));
    const allContext = { ...context, maxRecommendations: 10000 };
    const base = recommendActivities(allContext);
    const skipped = round.skipped.filter((s) => {
      const activity = base.activities.find((a) => a.key === s.key);
      return (
        !activity ||
        !criticalToken(activity, context) ||
        criticalToken(activity, context) === s.urgency
      );
    });
    let result = recommendActivities({
      ...allContext,
      deferred: [
        ...(context.deferred ?? []),
        ...skipped.map((s) => ({ key: s.key, until: Infinity })),
      ],
    });
    const restarted =
      result.activities.length === 0 && base.activities.length > 0 && skipped.length > 0;
    if (restarted) result = base;
    return {
      ...result,
      normalized: result.activities.map(normalizeActivity),
      round: restarted ? newRound(round.date, round.number + 1) : round,
      restarted,
    };
  }
  skip(
    activity: ActivityRecommendation,
    context: RecommendationContext,
    round?: RecommendationRound,
  ) {
    const current = round?.date === dateKey(context.now) ? round : newRound(dateKey(context.now));
    const next = {
      ...current,
      skipped: [
        ...current.skipped.filter((s) => s.key !== activity.key),
        { key: activity.key, urgency: criticalToken(activity, context) },
      ],
    };
    return this.recommend(context, next);
  }
}
export const recommendationEngine = new RecommendationEngine();
