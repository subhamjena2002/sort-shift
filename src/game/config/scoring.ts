/** Scoring and failure constants for a run. */
export const SCORING = {
  /** Points awarded for each correctly sorted parcel. */
  pointsPerCorrect: 10,
  /** Mistakes allowed; reaching this number ends the run. */
  maxMistakes: 3,
} as const;
