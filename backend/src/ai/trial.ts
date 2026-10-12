// The plan's free trial: the first week of AI-drafted logbook work is free and
// the rest needs an IT/SIWES Pass. The trial is the first `AI_TRIAL_DAYS`
// confirmed attendance days and is spent only once (`ITPlacement.trialWeekUsed`)
// so deleting entries and re-generating cannot farm more free AI work. Shared by
// the logbook gating and the placement summary so the two never drift apart.
export const AI_TRIAL_DAYS = 7;
