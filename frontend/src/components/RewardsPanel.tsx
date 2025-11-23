'use client';
import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import type { UserScore } from '@/types/quiz';
import { QuizRewardsABI } from '@/lib/QuizAbi';
import { createWalletClient, custom } from 'viem';
import { celo } from 'viem/chains';
import { sendTransactionWithDivvi } from '@/lib/divvi';
import toast from 'react-hot-toast';

interface RewardsPanelProps {
  userAddress: string | null;
  isConnected: boolean;
}

export function RewardsPanel({ userAddress, isConnected }: RewardsPanelProps) {
  const [userScores, setUserScores] = useState<UserScore[]>([]);
  const [claimingRewards, setClaimingRewards] = useState<string[]>([]);
  const [claimedNFTs, setClaimedNFTs] = useState<{ [quizId: string]: boolean }>({});
  const [error, setError] = useState<string | null>(null);
  const contractAddress = process.env.NEXT_PUBLIC_QUIZ_CONTRACT_ADDRESS || '';
  const CELO_MAINNET_CHAIN_ID = celo.id;

  useEffect(() => {
    const fetchUserScores = async () => {
      if (!isConnected || !userAddress || !contractAddress || !window.ethereum) {
        setError('Wallet not connected or contract address missing');
        return;
      }

      try {
        const provider = new ethers.BrowserProvider(window.ethereum);
        const network = await provider.getNetwork();
        if (Number(network.chainId) !== CELO_MAINNET_CHAIN_ID) {
          setError('Please switch to Celo Mainnet');
          return;
        }

        const contract = new ethers.Contract(contractAddress, QuizRewardsABI, provider);
        const completions = await contract.getPlayerQuizCompletions(userAddress);

        const quizMap = new Map();
        const scores: UserScore[] = await Promise.all(
          completions.map(async (completion: any) => {
            const quizId = completion.quizId?.toString();
            if (!quizId) return null;
            if (!quizMap.has(quizId)) {
              const quizResponse = await fetch(`/api/quizzes?id=${quizId}`);
              const quizData = quizResponse.ok ? await quizResponse.json() : { title: 'Unknown Quiz', questions: [] };
              quizMap.set(quizId, quizData);
            }
            const quizData = quizMap.get(quizId);
            return {
              quizId,
              quizTitle: quizData.title || 'Unknown Quiz',
              score: Number(completion.score) || 0,
              totalQuestions: quizData.questions?.length || 0,
              completedAt: new Date(Number(completion.timestamp) * 1000),
              attempts: Number(completion.attempts) || 0,
            };
          })
        );

        const validScores = scores.filter((score): score is UserScore => score !== null);
        setUserScores(validScores);
        setError(null);

        // Check claimed NFTs
        const claimed: { [quizId: string]: boolean } = {};
        for (const score of validScores) {
          if (!score.quizId) continue;
          const hasCompleted = await contract.hasCompletedQuiz(userAddress, score.quizId);
          claimed[score.quizId] = hasCompleted;
        }
        setClaimedNFTs(claimed);
      } catch (err: any) {
        console.error('Error fetching user scores:', err);
        setError(err.message || 'Failed to fetch quiz completions');
        setUserScores([]);
      }
    };
    fetchUserScores();
  }, [userAddress, isConnected, contractAddress]);

  const totalRewardsEarned = userScores.filter(score => score.score === score.totalQuestions).length;
  const totalPointsEarned = userScores.reduce((acc, score) => acc + score.score, 0);

  const handleClaimReward = async (scoreId: string) => {
    if (!isConnected || !userAddress) {
      toast.error('Please connect your wallet to claim rewards.');
      return;
    }
    if (!contractAddress) {
      toast.error('Contract address is not configured.');
      return;
    }
    if (typeof window === 'undefined' || !window.ethereum) {
      toast.error('No wallet provider detected.');
      return;
    }

    setClaimingRewards(prev => [...prev, scoreId]);
    setError(null);

    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const network = await provider.getNetwork();
      if (Number(network.chainId) !== CELO_MAINNET_CHAIN_ID) {
        try {
          await window.ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: `0x${CELO_MAINNET_CHAIN_ID.toString(16)}` }],
          });
        } catch (switchError: any) {
          throw new Error('Please switch to Celo Mainnet');
        }
      }

      const signer = await provider.getSigner();
      const contract = new ethers.Contract(contractAddress, QuizRewardsABI, signer);
      const walletClient = createWalletClient({
        chain: celo,
        transport: custom(window.ethereum!),
      });

      console.log('Claiming NFT for quizId:', scoreId, 'on contract:', contractAddress);
      await sendTransactionWithDivvi(
        contract,
        'claimNFTReward',
        [scoreId],
        walletClient,
        provider
      );
      console.log('NFT reward claimed successfully');
      toast.success('NFT reward claimed successfully! 🎉');
      setClaimedNFTs(prev => ({ ...prev, [scoreId]: true }));
    } catch (err: any) {
      let errorMessage = 'Failed to claim NFT reward';
      if (err.code === 'INSUFFICIENT_FUNDS') {
        errorMessage = 'Insufficient funds for gas fees. Please fund your wallet with CELO.';
      } else if (err.message.includes('unknown function') || err.message.includes('INVALID_ARGUMENT')) {
        errorMessage = 'Claim function not found. Please verify the contract address and ABI.';
      } else if (err.reason) {
        errorMessage = err.reason;
      } else if (err.message) {
        errorMessage = err.message;
      }
      console.error('Claim error:', err);
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setClaimingRewards(prev => prev.filter(id => id !== scoreId));
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6 px-4 sm:px-0">
      <h2 className="text-2xl sm:text-3xl font-bold text-white mb-4 sm:mb-6">🏆 Your Rewards</h2>
      
      {error && (
        <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-3 sm:p-4 mb-4 sm:mb-6 text-red-400 text-sm sm:text-base">
          {error}
        </div>
      )}
      
      {!isConnected ? (
        <div className="text-center py-8 sm:py-12">
          <div className="text-4xl sm:text-6xl mb-3 sm:mb-4" role="img" aria-label="Link emoji">
            🔗
          </div>
          <h3 className="text-lg sm:text-xl font-bold text-white mb-2">Connect Your Wallet</h3>
          <p className="text-gray-400 mb-4 sm:mb-6 text-sm sm:text-base px-4">
            Connect your wallet to view and claim your quiz rewards
          </p>
        </div>
      ) : userScores.length === 0 ? (
        <div className="text-center py-8 sm:py-12">
          <div className="text-4xl sm:text-6xl mb-3 sm:mb-4" role="img" aria-label="Gamepad emoji">
            🎮
          </div>
          <h3 className="text-lg sm:text-xl font-bold text-white mb-2">No Quiz Results Yet</h3>
          <p className="text-gray-400 mb-4 sm:mb-6 text-sm sm:text-base px-4">
            Complete some quizzes to start earning NFTs!
          </p>
        </div>
      ) : (
        <>
          {/* Stats Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 mb-6 sm:mb-8">
            <div className="bg-gradient-to-br from-yellow-500/20 to-orange-500/20 border border-yellow-500/30 rounded-xl p-4 sm:p-6 text-center">
              <div className="text-2xl sm:text-3xl font-bold text-yellow-400 mb-1 sm:mb-2">{totalRewardsEarned}</div>
              <div className="text-white font-semibold text-sm sm:text-base">NFTs Earned</div>
              <div className="text-xs sm:text-sm text-gray-400">For perfect scores</div>
            </div>
            <div className="bg-gradient-to-br from-green-500/20 to-emerald-500/20 border border-green-500/30 rounded-xl p-4 sm:p-6 text-center">
              <div className="text-2xl sm:text-3xl font-bold text-green-400 mb-1 sm:mb-2">{totalPointsEarned}</div>
              <div className="text-white font-semibold text-sm sm:text-base">Total Points</div>
              <div className="text-xs sm:text-sm text-gray-400">Across all quizzes</div>
            </div>
            <div className="bg-gradient-to-br from-purple-500/20 to-pink-500/20 border border-purple-500/30 rounded-xl p-4 sm:p-6 text-center sm:col-span-2 lg:col-span-1">
              <div className="text-2xl sm:text-3xl font-bold text-purple-400 mb-1 sm:mb-2">{userScores.length}</div>
              <div className="text-white font-semibold text-sm sm:text-base">Quizzes Completed</div>
              <div className="text-xs sm:text-sm text-gray-400">Keep learning!</div>
            </div>
          </div>

          {/* Quiz History */}
          <div className="bg-white/10 rounded-xl p-4 sm:p-6">
            <h3 className="text-lg sm:text-xl font-bold text-white mb-3 sm:mb-4">📊 Quiz History</h3>
            <div className="space-y-3 sm:space-y-4">
              {userScores.map((score) => (
                <div 
                  key={score.quizId} 
                  className="bg-white/10 rounded-lg p-3 sm:p-4 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 sm:gap-0"
                >
                  <div className="flex-1">
                    <h4 className="font-bold text-white text-sm sm:text-base mb-1">{score.quizTitle}</h4>
                    <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 text-xs sm:text-sm text-gray-400">
                      <p>
                        Score: {score.score}/{score.totalQuestions} (
                        {score.totalQuestions > 0 ? Math.round((score.score / score.totalQuestions) * 100) : 0}%)
                      </p>
                      <p>Completed: {score.completedAt.toLocaleDateString()}</p>
                      <p>Attempts: {score.attempts}</p>
                    </div>
                  </div>
                  
                  {score.quizId && score.score === score.totalQuestions && !claimedNFTs[score.quizId] ? (
                    <button
                      onClick={() => handleClaimReward(score.quizId)}
                      disabled={claimingRewards.includes(score.quizId)}
                      className="w-full sm:w-auto px-3 sm:px-4 py-2 bg-gradient-to-r from-yellow-400 to-orange-400 hover:from-yellow-500 hover:to-orange-500 text-black disabled:bg-gray-600 disabled:text-gray-400 font-semibold rounded-full transition-all text-sm sm:text-base"
                      aria-label={`Claim NFT for ${score.quizTitle}`}
                    >
                      {claimingRewards.includes(score.quizId) ? (
                        <div className="flex items-center justify-center sm:justify-start space-x-2">
                          <div className="animate-spin rounded-full h-3 sm:h-4 w-3 sm:w-4 border-b-2 border-gray-200"></div>
                          <span>Claiming...</span>
                        </div>
                      ) : (
                        '🎁 Claim NFT'
                      )}
                    </button>
                  ) : score.score === score.totalQuestions && claimedNFTs[score.quizId] ? (
                    <span className="text-xs sm:text-sm text-green-400 font-semibold text-center sm:text-right">
                      NFT Claimed
                    </span>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
      
      {/* Info Panel */}
      <div className="mt-4 sm:mt-6 bg-blue-500/20 border border-blue-500/50 rounded-xl p-3 sm:p-4">
        <h3 className="text-base sm:text-lg font-bold text-white mb-2 sm:mb-3">ℹ️ Reward System</h3>
        <p className="text-xs sm:text-sm text-gray-300">
          Earn an NFT for achieving a perfect score on any quiz, minted on the Celo blockchain!
        </p>
      </div>
    </div>
  );
}