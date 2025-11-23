'use client';
import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { useRouter } from 'next/navigation';
import { Quiz } from '@/types/quiz';
import { QuizRewardsABI } from '@/lib/QuizAbi';
import toast from 'react-hot-toast';
import { useWallet } from '@/components/context/WalletContext';
import { createWalletClient, createPublicClient, custom, http } from 'viem';
import { celo } from 'viem/chains';
import { sendTransactionWithDivvi } from '@/lib/divvi';

interface QuizPlayerProps {
  quiz: Quiz;
  onBack?: () => void;
  onComplete?: () => void;
}

const TIMER_DURATION = 15;
const CUSD_ADDRESS = "0x765DE816845861e75A25fCA122bb6898B8B1282a";
const CELO_CHAIN_ID = 42220;

export default function QuizPlayer({ quiz, onBack, onComplete }: QuizPlayerProps) {
  const router = useRouter();
  const { userAddress, isConnected, isMiniPay } = useWallet();
  const contractAddress = process.env.NEXT_PUBLIC_QUIZ_CONTRACT_ADDRESS!;
  
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [isFinished, setIsFinished] = useState(false);
  const [timeLeft, setTimeLeft] = useState(TIMER_DURATION);
  const [isProcessing, setIsProcessing] = useState(false);
  const [hasClaimed, setHasClaimed] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");

  // Timer Logic
  useEffect(() => {
    if (isFinished) return;
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          handleNext(true);
          return TIMER_DURATION;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [currentQuestionIndex, isFinished]);

  const handleAnswer = (answer: string) => {
    setSelectedAnswer(answer);
  };

  const handleNext = (isTimeout = false) => {
    if (!isTimeout && selectedAnswer === quiz.questions[currentQuestionIndex].correctAnswer) {
      setScore((s) => s + 1);
    }

    if (currentQuestionIndex < quiz.questions.length - 1) {
      setCurrentQuestionIndex((prev) => prev + 1);
      setSelectedAnswer(null);
      setTimeLeft(TIMER_DURATION);
    } else {
      setIsFinished(true);
      if(onComplete) onComplete();
    }
  };

  // --- HELPER: SWITCH NETWORK ---
  const switchNetwork = async () => {
    if (!window.ethereum) return;
    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: `0x${CELO_CHAIN_ID.toString(16)}` }],
      });
    } catch (switchError: any) {
      // This error code indicates that the chain has not been added to MetaMask.
      if (switchError.code === 4902) {
        try {
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [
              {
                chainId: `0x${CELO_CHAIN_ID.toString(16)}`,
                chainName: 'Celo Mainnet',
                nativeCurrency: {
                  name: 'CELO',
                  symbol: 'CELO',
                  decimals: 18,
                },
                rpcUrls: ['https://forno.celo.org'],
                blockExplorerUrls: ['https://explorer.celo.org'],
              },
            ],
          });
        } catch (addError) {
          throw new Error('Failed to add Celo network');
        }
      } else {
        throw switchError;
      }
    }
  };

  // --- CLAIM NFT LOGIC (2-STEP PROCESS) ---
  const claimReward = async () => {
    if (!userAddress) {
        toast.error("No user address found. Is wallet connected?");
        return;
    }
    
    setIsProcessing(true);
    toast.dismiss();
    
    try {
       // --- MINIPAY PATH ---
       if (isMiniPay) {
         if (!window.ethereum) throw new Error("MiniPay provider not found");

         const walletClient = createWalletClient({
           chain: celo,
           transport: custom(window.ethereum)
         });
         
         const publicClient = createPublicClient({
            chain: celo,
            transport: http() 
         });

         // STEP 1: RECORD SCORE
         setStatusMessage("Step 1/2: Recording Score...");
         const recordPromise = toast.loading("Step 1: Recording Score on Blockchain...");
         
         const recordHash = await walletClient.writeContract({
            address: contractAddress as `0x${string}`,
            abi: QuizRewardsABI,
            functionName: 'recordQuizCompletion',
            account: userAddress as `0x${string}`,
            args: [quiz.id, BigInt(score), BigInt(1)], 
            feeCurrency: CUSD_ADDRESS as `0x${string}`
         });
         
         await publicClient.waitForTransactionReceipt({ hash: recordHash });
         toast.success("Score Recorded!", { id: recordPromise });

         // STEP 2: CLAIM NFT
         setStatusMessage("Step 2/2: Minting NFT...");
         const claimPromise = toast.loading("Step 2: Minting Reward...");
         
         const claimHash = await walletClient.writeContract({
            address: contractAddress as `0x${string}`,
            abi: QuizRewardsABI,
            functionName: 'claimNFTReward',
            account: userAddress as `0x${string}`,
            args: [quiz.id],
            feeCurrency: CUSD_ADDRESS as `0x${string}`
         });

         await publicClient.waitForTransactionReceipt({ hash: claimHash });
         toast.success("NFT Minted Successfully!", { id: claimPromise });
       } 
       
       // --- STANDARD BROWSER PATH (MetaMask, etc) ---
       else {
         if (!window.ethereum) throw new Error("Wallet not found");

         // 1. FORCE NETWORK SWITCH BEFORE ANYTHING ELSE
         await switchNetwork();

         const provider = new ethers.BrowserProvider(window.ethereum);
         const signer = await provider.getSigner();
         const contract = new ethers.Contract(contractAddress, QuizRewardsABI, signer);
         const walletClient = createWalletClient({
            chain: celo,
            transport: custom(window.ethereum)
         });

         // STEP 1: RECORD SCORE
         setStatusMessage("Step 1/2: Recording Score...");
         toast.loading("Step 1: Recording Score...");
         
         await sendTransactionWithDivvi(
            contract,
            'recordQuizCompletion',
            [quiz.id, score, 1],
            walletClient,
            provider
         );
         
         toast.dismiss();
         toast.success("Score Recorded!");

         // STEP 2: CLAIM NFT
         setStatusMessage("Step 2/2: Minting NFT...");
         toast.loading("Step 2: Minting Reward...");

         await sendTransactionWithDivvi(
            contract,
            'claimNFTReward',
            [quiz.id],
            walletClient,
            provider
         );
         
         toast.dismiss();
         toast.success("NFT Minted!");
       }

       setHasClaimed(true);
       setStatusMessage("");

    } catch (error: any) {
      console.error("Claim Error:", error);
      let msg = error.message || "Transaction failed";
      
      if (msg.includes("User rejected")) {
          msg = "Transaction rejected by user";
      } else if (msg.includes("insufficient funds")) {
          msg = "Insufficient funds for gas";
      } else if (msg.includes("Quiz not completed")) {
          msg = "Score recording failed. Please try again.";
      } else if (msg.includes("Chain ID")) {
          msg = "Wrong Network. Please switch to Celo.";
      }
      
      toast.dismiss();
      toast.error(msg);
    } finally {
      setIsProcessing(false);
      setStatusMessage("");
    }
  };

  if (isFinished) {
    const isPerfect = score === quiz.questions.length;
    return (
      <div className="max-w-2xl mx-auto bg-slate-800 rounded-2xl p-8 border border-slate-700 text-center shadow-2xl">
        <div className="text-6xl mb-4">{isPerfect ? '🏆' : '📊'}</div>
        <h2 className="text-3xl font-bold text-white mb-2">
            {isPerfect ? 'Perfect Score!' : 'Quiz Completed'}
        </h2>
        <p className="text-slate-300 text-lg mb-6">
            You scored <span className="text-blue-400 font-bold">{score}</span> out of <span className="text-white">{quiz.questions.length}</span>
        </p>

        {isProcessing && (
            <div className="mb-4 p-3 bg-blue-500/20 border border-blue-500/50 rounded-xl text-blue-200 animate-pulse">
                <p className="font-bold">{statusMessage}</p>
                <p className="text-xs mt-1">Please confirm transactions in your wallet</p>
            </div>
        )}

        {isPerfect && !hasClaimed && (
            <button 
                onClick={claimReward}
                disabled={isProcessing}
                className="w-full mb-4 py-4 bg-gradient-to-r from-yellow-400 to-orange-500 text-black font-bold rounded-xl shadow-lg hover:shadow-orange-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
                {isProcessing ? 'Processing Transactions...' : '🎁 Claim NFT Reward'}
            </button>
        )}

        {isPerfect && hasClaimed && (
            <div className="p-4 bg-green-500/10 border border-green-500/30 rounded-xl text-green-400 font-bold mb-4">
                ✅ NFT Added to Wallet!
            </div>
        )}

        <div className="flex gap-4 justify-center">
            <button onClick={onBack || (() => router.push('/'))} disabled={isProcessing} className="px-6 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-600 transition-colors disabled:opacity-50">
                Back to Home
            </button>
        </div>
      </div>
    );
  }

  const question = quiz.questions[currentQuestionIndex];
  const progress = ((currentQuestionIndex + 1) / quiz.questions.length) * 100;

  return (
    <div className="max-w-3xl mx-auto">
      <div className="bg-slate-800 rounded-2xl border border-slate-700 shadow-2xl overflow-hidden">
        <div className="bg-slate-900/50 p-6 border-b border-slate-700 flex justify-between items-center">
            <div>
                <h2 className="text-blue-200 text-sm font-bold uppercase tracking-wider mb-1">{quiz.title}</h2>
                <div className="text-white font-bold">Question {currentQuestionIndex + 1}/{quiz.questions.length}</div>
            </div>
            <div className={`flex items-center gap-2 font-mono text-xl font-bold ${timeLeft < 5 ? 'text-red-400 animate-pulse' : 'text-yellow-400'}`}>
                <span>⏱</span>
                <span>{timeLeft}s</span>
            </div>
        </div>
        <div className="h-1 w-full bg-slate-700">
            <div className="h-full bg-blue-500 transition-all duration-500" style={{ width: `${progress}%` }}></div>
        </div>

        <div className="p-6 sm:p-8">
            <p className="text-xl text-white font-medium mb-8 leading-relaxed">
                {question.question}
            </p>

            <div className="grid grid-cols-1 gap-4">
                {question.options.map((option, idx) => (
                    <button
                        key={idx}
                        onClick={() => handleAnswer(option)}
                        className={`
                            p-4 rounded-xl text-left transition-all border-2
                            ${selectedAnswer === option 
                                ? 'border-blue-500 bg-blue-500/20 text-white shadow-lg shadow-blue-500/10' 
                                : 'border-slate-600 bg-slate-700/30 text-slate-300 hover:bg-slate-700 hover:border-slate-500'
                            }
                        `}
                    >
                        <span className="inline-block w-8 h-8 rounded-full bg-slate-800 text-center leading-8 text-sm font-bold mr-3 text-slate-400 border border-slate-600">
                            {String.fromCharCode(65 + idx)}
                        </span>
                        {option}
                    </button>
                ))}
            </div>
        </div>

        <div className="p-6 border-t border-slate-700 bg-slate-900/30 flex justify-end">
            <button
                onClick={() => handleNext()}
                disabled={!selectedAnswer}
                className="px-8 py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white font-bold rounded-xl transition-all"
            >
                {currentQuestionIndex === quiz.questions.length - 1 ? 'Finish Quiz' : 'Next Question →'}
            </button>
        </div>
      </div>
    </div>
  );
}