"use client";
import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import QuizPlayer from '@/components/QuizPlayer';
import { QuizGenerator } from '@/components/QuizGenerator';
import { ConnectWallet } from '@/components/ConnectWallet';
import Link from 'next/link';
import type { Quiz } from '@/types/quiz';
import { useWallet } from '@/components/context/WalletContext';
import { QuizRewardsABI } from '@/lib/QuizAbi';
import { createWalletClient, custom } from 'viem';
import { celo, celoAlfajores } from 'viem/chains';
import { sendTransactionWithDivvi } from '@/lib/divvi';
import toast from 'react-hot-toast';
import Image from 'next/image'; 

// Celo Mainnet cUSD Address for paying gas in MiniPay
const CUSD_ADDRESS = "0x765DE816845861e75A25fCA122bb6898B8B1282a";

export default function Home() {
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [selectedQuiz, setSelectedQuiz] = useState<Quiz | null>(null);
  const [showGenerator, setShowGenerator] = useState(false);
  const [participation, setParticipation] = useState<{ [quizId: string]: boolean }>({});
  const [error, setError] = useState<string | null>(null);
  const [isCheckingIn, setIsCheckingIn] = useState(false);
  const contractAddress: string = process.env.NEXT_PUBLIC_QUIZ_CONTRACT_ADDRESS || '';
  
  const { userAddress, username, isConnected, isMiniPay, error: walletError } = useWallet();

  useEffect(() => {
    fetchQuizzes();
  }, []);

  const fetchQuizzes = async () => {
    try {
      const response = await fetch('/api/quizzes');
      if (!response.ok) throw new Error(`Failed to fetch quizzes`);
      const data = await response.json();
      setQuizzes(data);
    } catch (err: any) {
      console.error(err);
      toast.error('Failed to load quizzes');
    }
  };

  const checkParticipation = async (quizId: string) => {
    if (!userAddress) return false;
    try {
      // Optimized: In a real app, fetch all attempts in one go rather than looping requests
      const response = await fetch(`/api/quizAttempts?quizId=${quizId}&address=${userAddress}`);
      if (response.ok) {
        const { attempt } = await response.json();
        // We only care if they got a perfect score for the UI "Completed" badge
        return attempt && attempt.score > 0; 
      }
      return false;
    } catch (err) {
      return false;
    }
  };

  useEffect(() => {
    if (userAddress && quizzes.length > 0) {
      const updateParticipation = async () => {
        const newParticipation: { [quizId: string]: boolean } = {};
        for (const quiz of quizzes) {
          // Fetch quiz details to get max score if needed, or just check existence of attempt
          newParticipation[quiz.id] = await checkParticipation(quiz.id);
        }
        setParticipation(newParticipation);
      };
      updateParticipation();
    }
  }, [userAddress, quizzes]);

  const handleQuizGenerated = (quiz: Quiz) => {
    setQuizzes([...quizzes, quiz]);
    setShowGenerator(false);
    toast.success('Quiz created successfully!');
  };

  const handleCheckIn = async () => {
    if (!isConnected || !userAddress) {
      toast.error('Please connect your wallet.');
      return;
    }
    if (!contractAddress) {
      toast.error('Contract address is not configured.');
      return;
    }
  
    setIsCheckingIn(true);
    try {
      let txHash;

      // =========================================================
      // MINIPAY SPECIFIC LOGIC (Check-In)
      // =========================================================
      if (isMiniPay) {
        const walletClient = createWalletClient({
          chain: celo, 
          transport: custom(window.ethereum!),
        });
        
        console.log('MiniPay CheckIn: Using cUSD');
        txHash = await walletClient.writeContract({
          address: contractAddress as `0x${string}`,
          abi: QuizRewardsABI,
          functionName: 'checkIn',
          account: userAddress as `0x${string}`, 
          args: [],
          feeCurrency: CUSD_ADDRESS as `0x${string}`,
        });

      } else {
        // STANDARD BROWSER LOGIC
        const provider = new ethers.BrowserProvider(window.ethereum!);
        const signer = await provider.getSigner();
        const contract = new ethers.Contract(contractAddress, QuizRewardsABI, signer);
        const walletClient = createWalletClient({
          chain: celo,
          transport: custom(window.ethereum!),
        });
    
        txHash = await sendTransactionWithDivvi(contract, 'checkIn', [], walletClient, provider);
      }
      
      console.log('Tx Hash:', txHash);
      toast.success('Successfully checked in! +10 Points 🎉');

    } catch (err: any) {
      let msg = err.message || 'Failed to check in';
      if (err.message.includes('already checked in')) msg = 'You have already checked in today.';
      toast.error(msg);
    } finally {
      setIsCheckingIn(false);
    }
  };

  return (
    // THEME: Slate/Blue Gradient Background
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-blue-950 to-slate-900 text-white py-6 sm:py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto">
        
        {/* HEADER */}
        <header className="text-center mb-10 sm:mb-14">
          <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight mb-4 flex flex-col sm:flex-row justify-center items-center gap-3">
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-cyan-300">
              KnowIt?
            </span>
          </h1>
          <p className="mt-2 text-lg text-slate-300 max-w-2xl mx-auto">
            Daily quizzes, on-chain rewards, and NFT milestones on Celo.
            {username && <span className="block text-yellow-400 mt-1">Welcome back, {username}!</span>}
          </p>

          <div className="mt-8 flex flex-col sm:flex-row gap-4 justify-center items-center">
            <Link href="/rewards">
              <button className="w-full sm:w-auto px-8 py-3 bg-gradient-to-r from-yellow-400 to-orange-500 hover:from-yellow-300 hover:to-orange-400 text-black font-bold rounded-xl shadow-lg shadow-orange-500/20 transition-all transform hover:-translate-y-1">
                🏆 View Rewards
              </button>
            </Link>
            <button
              onClick={handleCheckIn}
              disabled={isCheckingIn || !isConnected}
              className="w-full sm:w-auto px-8 py-3 bg-slate-700 hover:bg-slate-600 text-white border border-slate-500 font-semibold rounded-xl transition-all transform hover:-translate-y-1 disabled:opacity-50 disabled:hover:translate-y-0"
            >
              {isCheckingIn ? 'Checking In...' : '✅ Daily Check-In'}
            </button>
          </div>
        </header>

        {(error || walletError) && (
          <div className="mb-8 p-4 bg-red-500/10 border border-red-500/30 text-red-300 rounded-xl text-center text-sm">
            {error || walletError}
          </div>
        )}

        <div className="flex justify-center mb-10">
          <ConnectWallet className="bg-slate-800/50 backdrop-blur p-2 rounded-2xl border border-slate-700" />
        </div>

        <main>
          {selectedQuiz ? (
            <QuizPlayer quiz={selectedQuiz} onBack={() => setSelectedQuiz(null)} />
          ) : showGenerator ? (
            <QuizGenerator onQuizGenerated={handleQuizGenerated} onCancel={() => setShowGenerator(false)} />
          ) : (
            <div>
              {/* ACTION BAR */}
              <div className="flex justify-center mb-12">
                <button
                  onClick={() => setShowGenerator(true)}
                  className="w-full sm:w-auto px-8 py-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-lg rounded-2xl shadow-xl shadow-blue-900/20 transform hover:-translate-y-1 transition-all"
                >
                  ✨ Create New Quiz
                </button>
              </div>

              {/* QUIZ LIST */}
              <section>
                <h2 className="text-2xl font-bold mb-6 text-slate-200 border-l-4 border-yellow-400 pl-4">
                  Available Quizzes
                </h2>
                
                {quizzes.length === 0 ? (
                  <div className="text-center py-12 bg-slate-800/30 rounded-2xl border border-slate-700 border-dashed">
                    <p className="text-slate-400 text-lg">No quizzes yet. Be the first to create one!</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    {quizzes.map((quiz) => (
                      <div
                        key={quiz.id}
                        className="group bg-slate-800/50 backdrop-blur-sm rounded-2xl p-6 border border-slate-700 hover:border-blue-500/50 transition-all duration-300 hover:shadow-xl hover:shadow-blue-900/10 flex flex-col"
                      >
                        <div className="flex justify-between items-start mb-3">
                          <h3 className="text-xl font-bold text-white group-hover:text-blue-300 transition-colors">{quiz.title}</h3>
                          {participation[quiz.id] && (
                            <span className="bg-green-500/20 text-green-400 text-xs px-2 py-1 rounded-lg border border-green-500/30">
                              Done
                            </span>
                          )}
                        </div>
                        
                        <p className="text-slate-400 text-sm mb-6 line-clamp-2 flex-grow">{quiz.description}</p>
                        
                        <div className="mt-auto pt-4 border-t border-slate-700/50 flex items-center justify-between">
                          <span className="text-xs text-slate-500 font-mono">ID: {quiz.id}</span>
                          <Link href={`/quiz/${quiz.id}`} className="w-full sm:w-auto">
                              <button className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-lg transition-colors shadow-lg shadow-blue-900/20">
                                {participation[quiz.id] ? 'See Results' : 'Start Quiz →'}
                              </button>
                           </Link>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}