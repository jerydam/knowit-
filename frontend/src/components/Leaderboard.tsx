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
  key?: number; // For forced re-mount
}

export function Leaderboard({ quizId, className }: LeaderboardProps) {
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const contractAddress = process.env.NEXT_PUBLIC_QUIZ_CONTRACT_ADDRESS!;

  const fetchLeaderboard = useCallback(async () => {
    try {
      setLoading(true);
      const provider = new ethers.JsonRpcProvider('https://forno.celo.org');
      const contract = new ethers.Contract(contractAddress, QuizRewardsABI, provider);

      // Fetch quiz details to know total questions
      const quizResponse = await fetch(`/api/quizzes?id=${quizId}`);
      if (!quizResponse.ok) {
        throw new Error(`Quiz fetch failed: ${quizResponse.status}`);
      }
      const quiz = await quizResponse.json();
      const totalQuestions = quiz.questions?.length || 0;

      // Fetch leaderboard from smart contract
      const completions: QuizCompletion[] = await contract.getLeaderboard(quizId);

      const leaderboardData: LeaderboardEntry[] = completions
        .map((completion: QuizCompletion) => ({
          address: `${completion.player.slice(0, 6)}...${completion.player.slice(-4)}`,
          fullAddress: completion.player,
          attemptsUntilPerfect: Number(completion.attempts),
          totalTime: Number(completion.timestamp),
          bestScore: Number(completion.score),
          totalAttempts: Number(completion.attempts),
          perfectScoreReached: Number(completion.score) === totalQuestions,
        }))
        .filter((entry: LeaderboardEntry) => entry.bestScore > 0);

      // Sort by timestamp (ascending)
      leaderboardData.sort((a: LeaderboardEntry, b: LeaderboardEntry) => a.totalTime - b.totalTime);

      setLeaderboard(leaderboardData);
    } catch (err: any) {
      console.error('Error fetching leaderboard:', err);
      toast.error('Failed to load leaderboard.');
      setLeaderboard([]);
    } finally {
      setLoading(false);
    }
  }, [quizId, contractAddress]);

  useEffect(() => {
    fetchLeaderboard();
  }, [fetchLeaderboard]);

  if (loading) {
    return <div className={`text-center text-gray-300 ${className}`}>Loading leaderboard...</div>;
  }

  return (
    <div className={`bg-white/10 rounded-xl p-6 ${className}`}>
      <h3 className="text-xl font-bold text-white mb-4">🏆 Leaderboard</h3>
      {leaderboard.length === 0 ? (
        <p className="text-center text-gray-400">No attempts yet. Be the first!</p>
      ) : (
        <table className="w-full text-left">
          <thead>
            <tr className="text-gray-300">
              <th className="p-2">Player</th>
              <th className="p-2">Attempts Until Perfect</th>
              <th className="p-2">Timestamp</th>
            </tr>
          </thead>
          <tbody>
            {leaderboard.map((entry, index) => (
              <tr key={index} className="border-t border-gray-700">
                <td className="p-2 text-white">{entry.address}</td>
                <td className="p-2 text-white">{entry.attemptsUntilPerfect}</td>
                <td className="p-2 text-white">{new Date(entry.totalTime * 1000).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}