'use client';
import { useRouter } from 'next/navigation';
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useWallet } from '@/components/context/WalletContext';
import QuizPlayer from '@/components/QuizPlayer';
import { Leaderboard } from '@/components/Leaderboard';
import type { Quiz, UserScore } from '@/types/quiz';
import toast from 'react-hot-toast';
import { ethers } from 'ethers';
import { QuizRewardsABI } from '@/lib/QuizAbi';
import { z } from 'zod';

const UserScoreSchema = z.object({
  quizId: z.string(),
  quizTitle: z.string(),
  score: z.number(),
  totalQuestions: z.number(),
  completedAt: z.string().transform((str) => new Date(str)),
  attempts: z.number(),
}).strict();

interface QuizPageClientProps {
  quiz: Quiz;
}

export default function QuizPageClient({ quiz }: QuizPageClientProps) {
  const router = useRouter();
  const { userAddress } = useWallet();
  const [userScores, setUserScores] = useState<UserScore[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const contractAddress = process.env.NEXT_PUBLIC_QUIZ_CONTRACT_ADDRESS!;

  const fetchUserScores = useCallback(async () => {
    if (!userAddress || !window.ethereum) return;
    
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const contract = new ethers.Contract(contractAddress, QuizRewardsABI, provider);
      
      // Fetch player completions
      const completions = await contract.getPlayerQuizCompletions(userAddress);
      
      const quizMap = new Map();
      const scores = await Promise.all(
        completions.map(async (completion: any) => {
          try {
            // Fetch quiz details to get title and question count
            const quizResponse = await fetch(`/api/quizzes?id=${completion.quizId}`);
            let quizData = { title: 'Unknown Quiz', questions: [] };
            
            if (quizResponse.ok) {
              quizData = await quizResponse.json();
            }
            
            return UserScoreSchema.parse({
              quizId: completion.quizId,
              quizTitle: quizData.title || 'Unknown Quiz',
              score: Number(completion.score),
              totalQuestions: quizData.questions?.length || 0,
              completedAt: new Date(Number(completion.timestamp) * 1000),
              attempts: Number(completion.attempts),
            });
          } catch (parseError) {
            console.error('Error parsing completion:', parseError, completion);
            return null;
          }
        })
      );
      
      // Filter out any null values from failed parsing
      const validScores = scores.filter((score): score is UserScore => score !== null);
      setUserScores(validScores);
      
    } catch (err: any) {
      console.error('Error fetching user scores:', err);
      toast.error('Failed to load user scores.');
      setUserScores([]);
    }
  }, [userAddress, contractAddress]);

  useEffect(() => {
    fetchUserScores();
  }, [fetchUserScores]);

  const handleQuizComplete = () => {
    fetchUserScores();
    setRefreshKey(prev => prev + 1);
  };

  return (
    <div className="p-4">
      <div className="flex justify-start mb-6">
        <button
          onClick={() => router.back()}
          className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white font-semibold rounded-lg transition-all duration-300"
        >
          ← Back
        </button>
      </div>
      
      <QuizPlayer
        quiz={quiz}
        onComplete={handleQuizComplete}
      />
      
      <Leaderboard
        quizId={quiz.id}
        className="my-6"
        key={refreshKey}
      />
      
      {/* User Scores Section */}
      {userAddress && userScores.length > 0 && (
        <div className="bg-white/10 rounded-xl p-6 mt-6">
          <h3 className="text-xl font-bold text-white mb-4">Your Previous Attempts</h3>
          <div className="space-y-2">
            {userScores.map((score, index) => (
              <div key={index} className="flex justify-between items-center text-white border-b border-gray-700 pb-2">
                <span>{score.quizTitle}</span>
                <span>{score.score}/{score.totalQuestions}</span>
                <span className="text-sm text-gray-400">
                  {score.completedAt.toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
      
      <Link href="/" className="inline-block mt-4">
        <span className="text-blue-400 hover:underline">Back to Home</span>
      </Link>
    </div>
  );
}