export interface Question {
  id: string;
  question: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
  tags: string[];
}

export interface Quiz {
  id: string;
  title: string;
  description: string;
  questions: Question[];
  difficulty: string;
  estimatedTime: number;
  rewards: { nfts: number; points: number };
  source: { name: string; url: string };
  createdAt: Date;
  rewardType: string;
  rewardAmount: number;
  createdBy?: string;
  nftMetadata: string;
}

export interface UserScore {
  quizId: string;
  quizTitle: string;
  score: number;
  totalQuestions: number;
  completedAt: Date;
  timeTaken?: number;
  attempts: number; // Added to track attempts until perfect score
}

// Interface for smart contract QuizCompletion struct
export interface QuizCompletion {
  player: string;
  timestamp: bigint;
  score: bigint;
  quizId: string;
  attempts: bigint;
}