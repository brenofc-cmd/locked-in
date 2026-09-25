/**
 * Onboarding (Stage 8): Welcome → Name → Routine path → Items → Duo.
 * Completion is persisted (user_settings.onboarding_completed_at); the
 * current slide is not. An interrupted onboarding resumes from what already
 * exists: a routine means the routine steps are done.
 */
export const ONBOARDING_STEPS = 5;

export type OnboardingStep = 0 | 1 | 2 | 3 | 4;

export function onboardingStart(state: {
  completed: boolean;
  hasRoutine: boolean;
}): OnboardingStep | null {
  if (state.completed) return null;
  return state.hasRoutine ? 4 : 0;
}
