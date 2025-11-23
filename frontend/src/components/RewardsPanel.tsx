'use client';
import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import type { UserScore } from '@/types/quiz';
import { QuizRewardsABI } from '@/lib/QuizAbi';
import { createWalletClient, custom } from 'viem';
import { celo } from 'viem/chains';
import { sendTransactionWithDivvi } from '@/lib/divvi';
import toast from 'react-hot-toast';

// Celo Mainnet cUSD Address for paying gas in MiniPay
const CUSD_ADDRESS = "0x765DE816845861e75A25fCA122bb6898B8B1282a";

interface RewardsPanelProps {
  userAddress: string | null;
  isConnected: boolean;
  isMiniPay?: boolean; // Added prop
}

export function RewardsPanel({ userAddress, isConnected, isMiniPay = false }: RewardsPanelProps) {
  const [userScores, setUserScores] = useState<UserScore[]>([]);
  const [claimingRewards, setClaimingRewards] = useState<string[]>([]);
  const [claimedNFTs, setClaimedNFTs] = useState<{ [quizId: string]: boolean }>({});
  const [error, setError] = useState<string | null>(null);
  const contractAddress = process.env.NEXT_PUBLIC_QUIZ_CONTRACT_ADDRESS || '';
  const CELO_MAINNET_CHAIN_ID = celo.id;

  useEffect(() => {
    const fetchUserScores = async () => {
      if (!isConnected || !userAddress || !contractAddress || !window.ethereum) {
        // Don't show error if just not connected yet
        if(isConnected) setError('Contract address missing or wallet issue');
        return;
      }

      try {
        // Standard read-only provider is fine for fetching data even in MiniPay
        const provider = new ethers.BrowserProvider(window.ethereum);
        const contract = new ethers.Contract(contractAddress, QuizRewardsABI, provider);
        
        // Get raw completions
        const completions = await contract.getPlayerQuizCompletions(userAddress);

        const quizMap = new Map();
        const scores: UserScore[] = await Promise.all(
          completions.map(async (completion: any) => {
            const quizId = completion.quizId?.toString();
            if (!quizId) return null;
            
            if (!quizMap.has(quizId)) {
              // Fetch metadata
              try {
                const quizResponse = await fetch(`/api/quizzes?id=${quizId}`);
                const quizData = quizResponse.ok ? await quizResponse.json() : { title: 'Unknown Quiz', questions: [] };
                quizMap.set(quizId, quizData);
              } catch (e) {
                 quizMap.set(quizId, { title: 'Unknown Quiz', questions: [] });
              }
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
        // Sort by most recent
        validScores.sort((a, b) => b.completedAt.getTime() - a.completedAt.getTime());
        setUserScores(validScores);
        setError(null);

        // Check claimed status
        const claimed: { [quizId: string]: boolean } = {};
        for (const score of validScores) {
          if (!score.quizId) continue;
          // Only check if they actually have a perfect score
          if (score.score === score.totalQuestions && score.totalQuestions > 0) {
             const hasCompleted = await contract.hasCompletedQuiz(userAddress, score.quizId);
             claimed[score.quizId] = hasCompleted;
          }
        }
        setClaimedNFTs(claimed);

      } catch (err: any) {
        console.error('Error fetching user scores:', err);
        // Silent fail on network mismatch, user will see button to switch later
        if(!err.message.includes("network")) {
            setError('Failed to load your history. Please refresh.');
        }
      }
    };
    fetchUserScores();
  }, [userAddress, isConnected, contractAddress]);

  const totalRewardsEarned = Object.values(claimedNFTs).filter(Boolean).length;
  const totalPointsEarned = userScores.reduce((acc, score) => acc + score.score, 0);

  const handleClaimReward = async (scoreId: string) => {
    if (!isConnected || !userAddress) {
      toast.error('Please connect your wallet.');
      return;
    }

    setClaimingRewards(prev => [...prev, scoreId]);
    setError(null);

    try {
      // =========================================================
      // MINIPAY SPECIFIC LOGIC (Using cUSD for Gas)
      // =========================================================
      if (isMiniPay) {
        const walletClient = createWalletClient({
          chain: celo,
          transport: custom(window.ethereum!),
        });

        console.log('MiniPay Claim: Using cUSD for gas');
        
        const hash = await walletClient.writeContract({
            address: contractAddress as `0x${string}`,
            abi: QuizRewardsABI,
            functionName: 'claimNFTReward',
            account: userAddress as `0x${string}`,
            args: [BigInt(scoreId)], // Ensure BigInt for ID
            feeCurrency: CUSD_ADDRESS as `0x${string}`
        });
        
        console.log('MiniPay Tx Hash:', hash);

      } else {
        // =========================================================
        // STANDARD BROWSER LOGIC
        // =========================================================
        const provider = new ethers.BrowserProvider(window.ethereum!);
        const network = await provider.getNetwork();
        
        if (Number(network.chainId) !== CELO_MAINNET_CHAIN_ID) {
           try {
             await window.ethereum!.request({
               method: 'wallet_switchEthereumChain',
               params: [{ chainId: `0x${CELO_MAINNET_CHAIN_ID.toString(16)}` }],
             });
           } catch (e) {
             throw new Error('Please switch to Celo Mainnet');
           }
        }

        const signer = await provider.getSigner();
        const contract = new ethers.Contract(contractAddress, QuizRewardsABI, signer);
        const walletClient = createWalletClient({
            chain: celo,
            transport: custom(window.ethereum!)
        });

        await sendTransactionWithDivvi(
          contract,
          'claimNFTReward',
          [scoreId],
          walletClient,
          provider
        );
      }

      toast.success('NFT Claimed Successfully! 🎉');
      setClaimedNFTs(prev => ({ ...prev, [scoreId]: true }));

    } catch (err: any) {
      console.error('Claim error:', err);
      let msg = 'Failed to claim reward';
      if (err.message.includes('INSUFFICIENT_FUNDS') || err.code === 'INSUFFICIENT_FUNDS') {
         msg = isMiniPay ? 'Insufficient cUSD for gas.' : 'Insufficient CELO for gas.';
      }
      toast.error(msg);
    } finally {
      setClaimingRewards(prev => prev.filter(id => id !== scoreId));
    }
  };

  return (
    <div className="space-y-8">      
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-red-300 text-sm text-center">
          {error}
        </div>
      )}
      
      {!isConnected ? (
        <div className="text-center py-16 bg-slate-800/40 rounded-2xl border border-slate-700/50">
          <div className="text-6xl mb-4 animate-bounce">🔐</div>
          <h3 className="text-xl font-bold text-white mb-2">Connect to View Rewards</h3>
          <p className="text-slate-400">Connect your wallet to see your NFTs and scores.</p>
        </div>
      ) : userScores.length === 0 ? (
        <div className="text-center py-16 bg-slate-800/40 rounded-2xl border border-slate-700/50">
          <div className="text-6xl mb-4">📝</div>
          <h3 className="text-xl font-bold text-white mb-2">No Quiz Results Yet</h3>
          <p className="text-slate-400 mb-6">Prove your knowledge to start earning.</p>
          <a href="/" className="text-yellow-400 hover:text-yellow-300 font-semibold underline decoration-yellow-400/30 hover:decoration-yellow-300">
            Take your first quiz
          </a>
        </div>
      ) : (
        <>
          {/* Stats Cards - Blue/Yellow Theme */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Card 1: NFTs (Yellow/Orange - The "Reward") */}
            <div className="bg-gradient-to-br from-slate-800 to-slate-900 border border-yellow-500/30 rounded-2xl p-6 text-center shadow-lg shadow-yellow-900/10">
              <div className="text-4xl font-black text-yellow-400 mb-2">{totalRewardsEarned}</div>
              <div className="text-slate-200 font-medium uppercase tracking-wider text-xs">NFTs Owned</div>
            </div>

            {/* Card 2: Points (Blue - The "Knowledge") */}
            <div className="bg-gradient-to-br from-slate-800 to-slate-900 border border-blue-500/30 rounded-2xl p-6 text-center shadow-lg shadow-blue-900/10">
              <div className="text-4xl font-black text-blue-400 mb-2">{totalPointsEarned}</div>
              <div className="text-slate-200 font-medium uppercase tracking-wider text-xs">Total Points</div>
            </div>

            {/* Card 3: Quizzes (Purple/Slate - The "Activity") */}
            <div className="bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-500/30 rounded-2xl p-6 text-center shadow-lg">
              <div className="text-4xl font-black text-slate-300 mb-2">{userScores.length}</div>
              <div className="text-slate-400 font-medium uppercase tracking-wider text-xs">Quizzes Taken</div>
            </div>
          </div>

          {/* Quiz History List */}
          <div className="bg-slate-800/50 backdrop-blur-md rounded-3xl border border-slate-700 overflow-hidden">
            <div className="p-6 border-b border-slate-700/50 flex justify-between items-center">
              <h3 className="text-xl font-bold text-white">📜 Activity Log</h3>
            </div>
            
            <div className="divide-y divide-slate-700/50">
              {userScores.map((score) => {
                 const isPerfect = score.totalQuestions > 0 && score.score === score.totalQuestions;
                 const isClaimed = claimedNFTs[score.quizId];

                 return (
                  <div 
                    key={`${score.quizId}-${score.completedAt.getTime()}`} 
                    className="p-4 sm:p-6 hover:bg-slate-700/30 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-bold text-white text-lg">{score.quizTitle}</h4>
                        {isPerfect && <span className="text-xs bg-yellow-500/20 text-yellow-300 px-2 py-0.5 rounded-full border border-yellow-500/30">Perfect Score</span>}
                      </div>
                      
                      <div className="flex flex-wrap gap-y-1 gap-x-4 text-sm text-slate-400">
                        <span className="flex items-center gap-1">
                          <span className={isPerfect ? "text-green-400 font-bold" : "text-slate-300"}>
                            {score.score}/{score.totalQuestions}
                          </span> Correct
                        </span>
                        <span className="w-1 h-1 rounded-full bg-slate-600 self-center"></span>
                        <span>{score.completedAt.toLocaleDateString()}</span>
                        <span className="w-1 h-1 rounded-full bg-slate-600 self-center"></span>
                        <span>{score.attempts} Attempts</span>
                      </div>
                    </div>
                    
                    {/* Action Button Area */}
                    <div>
                      {isPerfect && !isClaimed ? (
                        <button
                          onClick={() => handleClaimReward(score.quizId)}
                          disabled={claimingRewards.includes(score.quizId)}
                          className="w-full sm:w-auto px-6 py-2.5 bg-gradient-to-r from-yellow-400 to-orange-500 hover:from-yellow-300 hover:to-orange-400 text-black font-bold rounded-xl shadow-lg shadow-orange-500/20 transform hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none flex items-center justify-center gap-2"
                        >
                          {claimingRewards.includes(score.quizId) ? (
                            <>
                              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-black"></div>
                              <span>Minting...</span>
                            </>
                          ) : (
                            <>
                              <span>🎁 Claim NFT</span>
                            </>
                          )}
                        </button>
                      ) : isPerfect && isClaimed ? (
                        <div className="px-4 py-2 bg-green-500/10 border border-green-500/20 rounded-xl text-green-400 text-sm font-semibold flex items-center gap-2 justify-center sm:justify-end">
                          <span>✅ NFT Minted</span>
                        </div>
                      ) : (
                        <div className="text-slate-500 text-sm italic px-2">
                           Retake for NFT
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}