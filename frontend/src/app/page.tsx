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
  
  // Destructure isMiniPay from context
  const { userAddress, username, isConnected, isMiniPay, error: walletError } = useWallet();

  useEffect(() => {
    fetchQuizzes();
  }, []);

  const fetchQuizzes = async () => {
    try {
      const response = await fetch('/api/quizzes');
      if (!response.ok) {
        throw new Error(`Failed to fetch quizzes: ${response.status}`);
      }
      const data = await response.json();
      setQuizzes(data);
    } catch (err: any) {
      const errorMessage = 'Failed to fetch quizzes: ' + err.message;
      setError(errorMessage);
      toast.error(errorMessage);
    }
  };

  const checkParticipation = async (quizId: string) => {
    if (!userAddress) return false;
    try {
      const quizResponse = await fetch(`/api/quizzes?id=${quizId}`);
      if (!quizResponse.ok) {
        console.warn(`Quiz ${quizId} not found: ${quizResponse.status}`);
        return false;
      }
      const quiz = await quizResponse.json();
      const totalQuestions = quiz.questions?.length || 0;

      const response = await fetch(`/api/quizAttempts?quizId=${quizId}&address=${userAddress}`);
      if (response.ok) {
        const { attempt } = await response.json();
        return attempt && attempt.score === totalQuestions;
      }
      return false;
    } catch (err: any) {
      console.error(`Error checking participation for ${quizId}: ${err.message}`);
      return false;
    }
  };

  useEffect(() => {
    if (userAddress && quizzes.length > 0) {
      const updateParticipation = async () => {
        const newParticipation: { [quizId: string]: boolean } = {};
        for (const quiz of quizzes) {
          newParticipation[quiz.id] = await checkParticipation(quiz.id);
        }
        setParticipation(newParticipation);
      };
      updateParticipation().catch((err) =>
        console.error('Error updating participation:', err.message)
      );
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
    if (typeof window === 'undefined' || !window.ethereum) {
      toast.error('No wallet provider detected.');
      return;
    }
  
    setIsCheckingIn(true);
    try {
      let txHash;

      // =========================================================
      // MINIPAY SPECIFIC LOGIC
      // =========================================================
      if (isMiniPay) {
        // 1. Create Viem Client
        const walletClient = createWalletClient({
          chain: celo, // MiniPay is on Celo Mainnet
          transport: custom(window.ethereum),
        });

        console.log('MiniPay CheckIn: Using cUSD for gas');
        
        // 2. Write Contract with feeCurrency (cUSD)
        txHash = await walletClient.writeContract({
          address: contractAddress as `0x${string}`,
          abi: QuizRewardsABI,
          functionName: 'checkIn',
          // FIX: explicitly provide the account
          account: userAddress as `0x${string}`, 
          args: [],
          feeCurrency: CUSD_ADDRESS as `0x${string}`, // Crucial for MiniPay
        });

      } else {
        // =========================================================
        // STANDARD BROWSER LOGIC (Metamask, etc)
        // =========================================================
        const provider = new ethers.BrowserProvider(window.ethereum);
        const network = await provider.getNetwork();
        const currentChainId = Number(network.chainId);
        
        const supportedChains = [42220, 44787];
        
        if (!supportedChains.includes(currentChainId)) {
          try {
            await window.ethereum.request({
              method: 'wallet_switchEthereumChain',
              params: [{ chainId: `0x${(42220).toString(16)}` }],
            });
          } catch (switchError: any) {
            if (switchError.code === 4902) {
                 // add chain logic here if needed
            }
             throw new Error('Please switch to Celo network.');
          }
        }
    
        const signer = await provider.getSigner();
        const contract = new ethers.Contract(contractAddress, QuizRewardsABI, signer);
        const walletClient = createWalletClient({
          chain: currentChainId === 44787 ? celoAlfajores : celo,
          transport: custom(window.ethereum),
        });
    
        console.log('Calling checkIn on contract via Divvi/Ethers');
        txHash = await sendTransactionWithDivvi(
          contract,
          'checkIn',
          [],
          walletClient,
          provider
        );
      }
      
      console.log('Check-in transaction hash:', txHash);
      toast.success('Successfully checked in! 🎉');

    } catch (err: any) {
      let errorMessage = err.message || 'Failed to check in';
      
      if (err.code === 'INSUFFICIENT_FUNDS') {
        errorMessage = 'Insufficient funds for gas.';
      } else if (err.message.includes('already checked in')) {
        errorMessage = 'You have already checked in today.';
      }
      
      console.error('Check-in error:', err);
      toast.error(errorMessage);
      setError(errorMessage);
    } finally {
      setIsCheckingIn(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-black text-white py-6 sm:py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto">
        <header className="text-center mb-8 sm:mb-12">
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-500">
            <Image
              src="/logo.png"
              alt="knowit? Logo"
              width={200}
              height={100}
              className="inline-block mb-2 sm:mb-0" />
          </h1>
          <p className="mt-2 sm:mt-3 text-base sm:text-lg text-gray-300 px-4">
            Learn, earn, and mint NFTs on the Celo blockchain
            {username && (
              <span className="block sm:inline">
                <span className="hidden sm:inline">, </span>
                <span className="sm:hidden">Welcome, </span>
                {username}!
              </span>
            )}
          </p>
          <div className="mt-4 sm:mt-6 flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center items-center">
            <Link href="/rewards">
              <button className="w-full sm:w-auto px-4 sm:px-6 py-2 sm:py-3 bg-gradient-to-r from-yellow-400 to-orange-400 hover:from-yellow-500 hover:to-orange-500 text-black font-semibold rounded-full transition-all duration-300 text-sm sm:text-base">
                🏆 View Rewards
              </button>
            </Link>
            <button
              onClick={handleCheckIn}
              disabled={isCheckingIn || !isConnected}
              className="w-full sm:w-auto px-4 sm:px-6 py-2 sm:py-3 bg-gradient-to-r from-green-400 to-teal-400 hover:from-green-500 hover:to-teal-500 text-black font-semibold rounded-full transition-all duration-300 disabled:bg-gray-600 text-sm sm:text-base"
            >
              {isCheckingIn ? 'Checking In...' : '✅ Check In'}
            </button>
          </div>
        </header>

        {(error || walletError) && (
          <div className="mb-6 sm:mb-8 p-4 bg-red-500/20 text-red-300 rounded-lg text-center text-sm sm:text-base">
            {error || walletError}
          </div>
        )}

        <div className="flex flex-col sm:flex-row justify-center mb-6 sm:mb-8 gap-3 sm:gap-4">
          <ConnectWallet
            className="w-full sm:w-auto bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-semibold rounded-lg transition-all px-4 py-2 text-sm sm:text-base"
          />
        </div>

        <main>
          {selectedQuiz ? (
            <QuizPlayer quiz={selectedQuiz} />
          ) : showGenerator ? (
            <QuizGenerator onQuizGenerated={handleQuizGenerated} />
          ) : (
            <div>
              <div className="flex justify-center mb-8 sm:mb-10">
                <button
                  onClick={() => setShowGenerator(true)}
                  className="w-full sm:w-auto px-6 sm:px-8 py-3 sm:py-4 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white font-bold text-base sm:text-lg rounded-xl shadow-lg hover:shadow-2xl transform hover:-translate-y-1 transition-all duration-300"
                >
                  🚀 Create New Quiz
                </button>
              </div>

              <section>
                <h2 className="text-2xl sm:text-3xl font-bold mb-4 sm:mb-6 text-center bg-clip-text text-transparent bg-gradient-to-r from-blue-300 to-purple-400">
                  Available Quizzes
                </h2>
                {quizzes.length === 0 ? (
                  <p className="text-center text-gray-400 text-base sm:text-lg animate-pulse px-4">
                    No quizzes available. Create one to get started!
                  </p>
                ) : (
                  <div className="space-y-4 sm:space-y-6 lg:space-y-8">
                    {quizzes.map((quiz) => (
                      <div
                        key={quiz.id}
                        className="bg-gray-800/40 backdrop-blur-sm rounded-xl sm:rounded-2xl p-4 sm:p-6 border border-blue-500/20 hover:border-blue-500/50 shadow-xl hover:shadow-2xl transform hover:-translate-y-1 transition-all duration-300"
                      >
                        <h3 className="text-lg sm:text-xl font-semibold text-blue-200 mb-2">{quiz.title}</h3>
                        <p className="text-gray-300 text-sm sm:text-base mb-4 line-clamp-2">{quiz.description}</p>
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-0">
                          <span className="text-xs sm:text-sm text-gray-400">
                            {participation[quiz.id] ? 'Completed (Perfect Score)' : 'Not Completed'}
                          </span>
                          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 w-full sm:w-auto">
                            <Link href={`/quiz/${quiz.id}`} className="w-full sm:w-auto">
                              <button className="w-full sm:w-auto px-3 sm:px-4 py-2 bg-green-500 hover:bg-green-600 text-white font-medium rounded-lg shadow-md hover:shadow-lg transition-all duration-200 text-sm sm:text-base">
                                {participation[quiz.id] ? 'View Results' : 'Take Quiz'}
                              </button>
                            </Link>
                            
                          </div>
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