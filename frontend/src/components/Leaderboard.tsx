'use client';
import { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import toast from 'react-hot-toast';
import { QuizRewardsABI } from '@/lib/QuizAbi';
import type { QuizCompletion } from '@/types/quiz';

interface LeaderboardEntry {
  address: string;
  fullAddress: string;
  attemptsUntilPerfect: number;
  totalTime: number;
  bestScore: number;
  totalAttempts: number;
  perfectScoreReached: boolean;
}

interface LeaderboardProps {
  quizId: string;
  className?: string;
}

export function Leaderboard({ quizId, className }: LeaderboardProps) {
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const contractAddress = process.env.NEXT_PUBLIC_QUIZ_CONTRACT_ADDRESS!;

  const fetchLeaderboard = useCallback(async () => {
    if (!quizId) return;

    try {
      setLoading(true);
      // Use Public RPC for reliability
      const provider = new ethers.JsonRpcProvider('https://forno.celo.org');
      const contract = new ethers.Contract(contractAddress, QuizRewardsABI, provider);

      // 1. Try to get Total Questions from API (soft fail if error)
      let totalQuestions = 0;
      try {
        const quizResponse = await fetch(`/api/quizzes?id=${quizId}`);
        if (quizResponse.ok) {
          const quiz = await quizResponse.json();
          totalQuestions = quiz.questions?.length || 0;
        }
      } catch (apiErr) {
        console.warn('Could not fetch quiz details for leaderboard:', apiErr);
      }

      // 2. Fetch leaderboard from smart contract
      // Note: Contract call might fail if ID doesn't exist on-chain yet
      let completions: QuizCompletion[] = [];
      try {
         completions = await contract.getLeaderboard(quizId);
      } catch (contractErr) {
         console.warn('No leaderboard data found on contract yet');
         setLeaderboard([]);
         return;
      }

      // 3. Process Data
      const leaderboardData: LeaderboardEntry[] = completions
        .map((completion: QuizCompletion) => {
           const score = Number(completion.score);
           // If API failed, assume the highest score seen so far is the "total" (fallback)
           if (totalQuestions === 0 && score > totalQuestions) totalQuestions = score;
           
           return {
            address: `${completion.player.slice(0, 6)}...${completion.player.slice(-4)}`,
            fullAddress: completion.player,
            attemptsUntilPerfect: Number(completion.attempts),
            totalTime: Number(completion.timestamp),
            bestScore: score,
            totalAttempts: Number(completion.attempts),
            perfectScoreReached: totalQuestions > 0 ? score === totalQuestions : false,
          };
        })
        .filter((entry: LeaderboardEntry) => entry.bestScore > 0);

      // Sort by timestamp (ascending) - earliest winners first
      leaderboardData.sort((a: LeaderboardEntry, b: LeaderboardEntry) => a.totalTime - b.totalTime);

      setLeaderboard(leaderboardData);
    } catch (err: any) {
      console.error('Error fetching leaderboard:', err);
      // Don't show toast error on load, just log it to avoid spamming user
      setLeaderboard([]);
    } finally {
      setLoading(false);
    }
  }, [quizId, contractAddress]);

  useEffect(() => {
    fetchLeaderboard();
  }, [fetchLeaderboard]);

  if (loading) {
    return (
      <div className={`bg-white/5 rounded-xl p-6 animate-pulse ${className}`}>
        <div className="h-6 bg-white/10 rounded w-1/3 mb-4"></div>
        <div className="space-y-3">
          <div className="h-4 bg-white/10 rounded w-full"></div>
          <div className="h-4 bg-white/10 rounded w-full"></div>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-white/10 rounded-xl p-6 ${className}`}>
      <h3 className="text-xl font-bold text-white mb-4">🏆 Leaderboard</h3>
      {leaderboard.length === 0 ? (
        <div className="text-center py-6 text-gray-400">
          <p>No attempts recorded yet.</p>
          <p className="text-sm mt-1 opacity-70">Be the first to complete it!</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm sm:text-base">
            <thead>
              <tr className="text-gray-400 border-b border-gray-700/50">
                <th className="p-3">Player</th>
                <th className="p-3 text-center">Attempts</th>
                <th className="p-3 text-right">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700/50">
              {leaderboard.map((entry, index) => (
                <tr key={index} className="hover:bg-white/5 transition-colors">
                  <td className="p-3 font-mono text-blue-300">
                    {entry.address}
                    {index === 0 && <span className="ml-2">🥇</span>}
                  </td>
                  <td className="p-3 text-center text-white">{entry.attemptsUntilPerfect}</td>
                  <td className="p-3 text-right text-gray-400">
                    {new Date(entry.totalTime * 1000).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}