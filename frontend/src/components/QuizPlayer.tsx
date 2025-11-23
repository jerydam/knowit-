'use client';
import { useState, useEffect, useMemo } from 'react';
import { ethers } from 'ethers';
import { useRouter } from 'next/navigation';
import { Quiz } from '@/types/quiz';
import { QuizRewardsABI } from '@/lib/QuizAbi';
import toast from 'react-hot-toast';
import { useWallet } from '@/components/context/WalletContext';
import { createWalletClient, custom } from 'viem';
import { celo } from 'viem/chains';
import { sendTransactionWithDivvi } from '@/lib/divvi';

interface QuizPlayerProps {
  quiz: Quiz;
  onBack?: () => void; // Added for better nav inside Home
  onComplete?: () => void;
}

const TIMER_DURATION = 15;
const CUSD_ADDRESS = "0x765DE816845861e75A25fCA122bb6898B8B1282a";

export default function QuizPlayer({ quiz, onBack, onComplete }: QuizPlayerProps) {
  const router = useRouter();
  const { userAddress, isConnected, isMiniPay } = useWallet();
  const contractAddress = process.env.NEXT_PUBLIC_QUIZ_CONTRACT_ADDRESS!;
  
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [isFinished, setIsFinished] = useState(false);
  const [timeLeft, setTimeLeft] = useState(TIMER_DURATION);
  const [isClaiming, setIsClaiming] = useState(false);
  const [hasClaimed, setHasClaimed] = useState(false);

  // Timer Logic
  useEffect(() => {
    if (isFinished) return;
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          handleNext(true); // Auto-advance on timeout
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
    // Calculate score for current question
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

  // --- CLAIM NFT LOGIC ---
  const claimReward = async () => {
    if (!userAddress) return;
    setIsClaiming(true);

    try {
       // 1. First, record the completion on the smart contract if not done automatically by backend
       // Note: Ideally your 'createQuiz' stores the quiz. We just claim here.
       
       let txHash;

       // --- MINIPAY LOGIC ---
       if (isMiniPay) {
         const walletClient = createWalletClient({
           chain: celo,
           transport: custom(window.ethereum!)
         });
         
         console.log("Claiming with MiniPay (cUSD gas)...");
         txHash = await walletClient.writeContract({
            address: contractAddress as `0x${string}`,
            abi: QuizRewardsABI,
            functionName: 'claimNFTReward',
            account: userAddress as `0x${string}`,
            args: [BigInt(quiz.id)],
            feeCurrency: CUSD_ADDRESS as `0x${string}`
         });
       } 
       // --- STANDARD LOGIC ---
       else {
         const provider = new ethers.BrowserProvider(window.ethereum!);
         const signer = await provider.getSigner();
         const contract = new ethers.Contract(contractAddress, QuizRewardsABI, signer);
         const walletClient = createWalletClient({
            chain: celo,
            transport: custom(window.ethereum!)
         });

         txHash = await sendTransactionWithDivvi(
            contract,
            'claimNFTReward',
            [quiz.id],
            walletClient,
            provider
         );
       }

       toast.success('NFT Minted Successfully!');
       setHasClaimed(true);

    } catch (error: any) {
      console.error(error);
      let msg = error.message || "Claim failed";
      if(msg.includes("INSUFFICIENT_FUNDS")) msg = "Insufficient gas funds";
      toast.error(msg);
    } finally {
      setIsClaiming(false);
    }
  };

  // --- RESULT SCREEN ---
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

        {isPerfect && !hasClaimed && (
            <button 
                onClick={claimReward}
                disabled={isClaiming}
                className="w-full mb-4 py-4 bg-gradient-to-r from-yellow-400 to-orange-500 text-black font-bold rounded-xl shadow-lg hover:shadow-orange-500/20 transition-all"
            >
                {isClaiming ? 'Minting NFT...' : '🎁 Claim NFT Reward'}
            </button>
        )}

        {isPerfect && hasClaimed && (
            <div className="p-4 bg-green-500/10 border border-green-500/30 rounded-xl text-green-400 font-bold mb-4">
                ✅ NFT Added to Wallet!
            </div>
        )}

        <div className="flex gap-4 justify-center">
            {onBack ? (
                <button onClick={onBack} className="px-6 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-600 transition-colors">
                    Back to Home
                </button>
            ) : (
                <button onClick={() => router.push('/')} className="px-6 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-600 transition-colors">
                    Back to Home
                </button>
            )}
        </div>
      </div>
    );
  }

  // --- QUESTION SCREEN ---
  const question = quiz.questions[currentQuestionIndex];
  const progress = ((currentQuestionIndex + 1) / quiz.questions.length) * 100;

  return (
    <div className="max-w-3xl mx-auto">
      <div className="bg-slate-800 rounded-2xl border border-slate-700 shadow-2xl overflow-hidden">
        
        {/* Header / Progress */}
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

        {/* Question Body */}
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

        {/* Footer */}
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