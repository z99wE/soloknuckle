// No external imports needed — pure type definitions

export type HygieneDimension =
  | 'quality' | 'testing' | 'security' | 'efficiency' | 'accessibility'
  | 'dependencies' | 'documentation' | 'gitHygiene' | 'ciPipeline' | 'featureFlags'
  | 'performance' | 'reliability' | 'supplyChain';

export const DEFAULT_WEIGHTS: Record<HygieneDimension, number> = {
  quality: 1,
  testing: 1,
  security: 1,
  efficiency: 1,
  accessibility: 1,
  dependencies: 1,
  documentation: 1,
  gitHygiene: 1,
  ciPipeline: 1,
  featureFlags: 1,
  performance: 1,
  reliability: 1,
  supplyChain: 1,
};

export const WEIGHTS_FILE = '.soloknuckle/score-weights.json';

export interface DimensionScore {
  score: number;
  rawOutput: string;
}

export interface ScoreMetrics {
  quality: DimensionScore;
  testing: DimensionScore;
  security: DimensionScore;
  efficiency: DimensionScore;
  accessibility: DimensionScore;
  dependencies: DimensionScore;
  documentation: DimensionScore;
  gitHygiene: DimensionScore;
  ciPipeline: DimensionScore;
  featureFlags: DimensionScore;
  performance: DimensionScore;
  reliability: DimensionScore;
  supplyChain: DimensionScore;
  overall: number;
  weights: Record<HygieneDimension, number>;
}

export type DomainName =
  | 'codeQuality' | 'testing' | 'securityCompliance'
  | 'performance' | 'reliability' | 'dependenciesSupplyChain'
  | 'documentationVisibility';

export interface DomainScorecard {
  name: string;
  score: number;
  dimensions: { name: string; score: number }[];
  status: 'production-ready' | 'almost-there' | 'needs-work' | 'not-ready';
}

export interface SevenDomainScorecard {
  domains: DomainScorecard[];
  overallScore: number;
  overallStatus: 'production-ready' | 'almost-there' | 'needs-work' | 'not-ready';
}
