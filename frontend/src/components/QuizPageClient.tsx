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

// --- FIX: Update schema to expect a Date object ---
const UserScoreSchema = z.object({
  quizId: z.string(),
  quizTitle: z.string(),
  score: z.number(),
  totalQuestions: z.number(),
  completedAt: z.date(), // Changed from z.string() to z.date()
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
    if (!userAddress) return;
    
    try {
      // Use Public RPC for better reliability when reading data
      const provider = new ethers.JsonRpcProvider("https://forno.celo.org");
      const contract = new ethers.Contract(contractAddress, QuizRewardsABI, provider);
      
      // Fetch player completions
      // Note: Make sure your contract ABI matches the deployed contract
      const completions = await contract.getPlayerQuizCompletions(userAddress);
      
      const scores = await Promise.all(
        completions.map(async (completion: any) => {
          try {
            // We already have the current quiz details in props, 
            // no need to fetch if it matches the current page
            let quizTitle = 'Unknown Quiz';
            let totalQuestions = 0;

            if (completion.quizId === quiz.id) {
                quizTitle = quiz.title;
                totalQuestions = quiz.questions.length;
            } else {
                // If it's a different quiz (unlikely in this filtered view but possible in raw data)
                // We can skip fetching for now to speed up, or implement a cache
                quizTitle = `Quiz #${completion.quizId}`;
            }
            
            // Validate and parse with Zod
            return UserScoreSchema.parse({
              quizId: completion.quizId.toString(),
              quizTitle: quizTitle,
              score: Number(completion.score),
              totalQuestions: totalQuestions > 0 ? totalQuestions : Number(completion.score),
              completedAt: new Date(Number(completion.timestamp) * 1000),
              attempts: Number(completion.attempts),
            });
          } catch (parseError) {
            console.error('Error parsing completion:', parseError);
            return null;
          }
        })
      );
      
      // Filter out any null values from failed parsing
      const validScores = scores.filter((score): score is UserScore => score !== null);
      
      // Only show scores for THIS quiz on this page
      const currentQuizScores = validScores.filter(s => s.quizId === quiz.id);
      setUserScores(currentQuizScores);
      
    } catch (err: any) {
      console.error('Error fetching user scores:', err);
      // Silent fail is better than crashing UI
    }
  }, [userAddress, contractAddress, quiz.id, quiz.title, quiz.questions.length]);

  useEffect(() => {
    fetchUserScores();
  }, [fetchUserScores]);

  const handleQuizComplete = () => {
    fetchUserScores();
    setRefreshKey(prev => prev + 1);
  };

  return (
    <div className="p-4 max-w-5xl mx-auto">
      <div className="flex justify-start mb-6">
        <button
          onClick={() => router.back()}
          className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white font-semibold rounded-lg transition-all duration-300"
        >
          ← Back
        </button>
      </div>
      
      <QuizPlayer
        quiz={quiz}
        onComplete={handleQuizComplete}
      />
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
        {/* Leaderboard Section */}
        <Leaderboard
            quizId={quiz.id}
            className="w-full"
            key={refreshKey}
        />
        
        {/* User History Section */}
        {userAddress && (
            <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
            <h3 className="text-xl font-bold text-white mb-4">Your Past Attempts</h3>
            {userScores.length === 0 ? (
                <p className="text-slate-400">No attempts recorded yet.</p>
            ) : (
                <div className="space-y-3">
                {userScores.map((score, index) => (
                    <div key={index} className="flex justify-between items-center bg-slate-700/30 p-3 rounded-lg border border-slate-600">
                    <div className="flex flex-col">
                        <span className="font-semibold text-slate-200">Score: {score.score}/{score.totalQuestions}</span>
                        <span className="text-xs text-slate-400">
                            {score.completedAt.toLocaleDateString()} at {score.completedAt.toLocaleTimeString()}
                        </span>
                    </div>
                    {score.score === score.totalQuestions && (
                        <span className="text-xs bg-green-500/20 text-green-400 px-2 py-1 rounded border border-green-500/30">
                        Perfect
                        </span>
                    )}
                    </div>
                ))}
                </div>
            )}
            </div>
        )}
      </div>
    </div>
  );
}