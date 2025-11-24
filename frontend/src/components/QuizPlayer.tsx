'use client';
import { useState, useEffect, useRef } from 'react';
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
const CELO_CHAIN_ID_HEX = `0x${CELO_CHAIN_ID.toString(16)}`;

export default function QuizPlayer({ quiz, onBack, onComplete }: QuizPlayerProps) {
  const router = useRouter();
  const { userAddress: contextAddress, isConnected, isMiniPay, setWalletState } = useWallet();
  const contractAddress = process.env.NEXT_PUBLIC_QUIZ_CONTRACT_ADDRESS!;
  
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [isFinished, setIsFinished] = useState(false);
  const [timeLeft, setTimeLeft] = useState(TIMER_DURATION);
  const [isProcessing, setIsProcessing] = useState(false);
  const [hasClaimed, setHasClaimed] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

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

  useEffect(() => {
    return () => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

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

  // --- STRICT NETWORK SWITCHER ---
  const ensureCeloNetwork = async () => {
    if (!window.ethereum) throw new Error("No wallet found");

    const chainId = await window.ethereum.request({ method: 'eth_chainId' });
    if (chainId === CELO_CHAIN_ID_HEX) return true;

    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: CELO_CHAIN_ID_HEX }],
      });
      return true;
    } catch (switchError: any) {
      if (switchError.code === 4902) {
        try {
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [
              {
                chainId: CELO_CHAIN_ID_HEX,
                chainName: 'Celo Mainnet',
                nativeCurrency: { name: 'CELO', symbol: 'CELO', decimals: 18 },
                rpcUrls: ['https://forno.celo.org'],
                blockExplorerUrls: ['https://explorer.celo.org'],
              },
            ],
          });
          return true;
        } catch (addError) {
          throw new Error("Could not add Celo network");
        }
      }
      throw new Error("Please switch your wallet to Celo Mainnet");
    }
  };

  // --- CLAIM NFT LOGIC ---
  const claimReward = async () => {
    setIsProcessing(true);
    toast.dismiss();
    
    // 1. FORCE RE-CONNECTION IF ADDRESS IS MISSING
    let activeAddress = contextAddress;
    
    if (!activeAddress) {
        console.log("Address missing, attempting silent reconnect...");
        try {
            if (window.ethereum) {
                const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
                if (accounts && accounts.length > 0) {
                    activeAddress = accounts[0];
                    // Optional: Update global state if you have access to setWalletState
                    console.log("Reconnected:", activeAddress);
                }
            }
        } catch (err) {
            console.error("Reconnect failed:", err);
        }
    }

    if (!activeAddress) {
        setIsProcessing(false);
        toast.error("Could not connect wallet. Please refresh.");
        return;
    }

    // Safety timeout
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
        setIsProcessing(false);
        setStatusMessage("");
        toast.error("Transaction timed out.");
    }, 45000); // Increased to 45s for 2-step process

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
         const recordPromise = toast.loading("Approve: Record Score");
         
         const recordHash = await walletClient.writeContract({
            address: contractAddress as `0x${string}`,
            abi: QuizRewardsABI,
            functionName: 'recordQuizCompletion',
            account: activeAddress as `0x${string}`, // Use local var
            args: [quiz.id, BigInt(score), BigInt(1)], 
            feeCurrency: CUSD_ADDRESS as `0x${string}`
         });
         
         await publicClient.waitForTransactionReceipt({ hash: recordHash });
         toast.success("Score Recorded!", { id: recordPromise });

         // STEP 2: CLAIM NFT
         setStatusMessage("Step 2/2: Claiming NFT...");
         const claimPromise = toast.loading("Approve: Claim NFT");
         
         const claimHash = await walletClient.writeContract({
            address: contractAddress as `0x${string}`,
            abi: QuizRewardsABI,
            functionName: 'claimNFTReward',
            account: activeAddress as `0x${string}`, // Use local var
            args: [quiz.id],
            feeCurrency: CUSD_ADDRESS as `0x${string}`
         });

         await publicClient.waitForTransactionReceipt({ hash: claimHash });
         toast.success("NFT Minted Successfully!", { id: claimPromise });
       } 
       
       // --- STANDARD BROWSER PATH ---
       else {
         setStatusMessage("Switching Network...");
         await ensureCeloNetwork();

         const provider = new ethers.BrowserProvider(window.ethereum!);
         await provider.getNetwork(); 
         
         const signer = await provider.getSigner();
         const contract = new ethers.Contract(contractAddress, QuizRewardsABI, signer);
         
         const walletClient = createWalletClient({
            chain: celo,
            transport: custom(window.ethereum!)
         });

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
       if (timeoutRef.current) clearTimeout(timeoutRef.current);

    } catch (error: any) {
      console.error("Claim Error:", error);
      let msg = error.message || "Transaction failed";
      
      if (msg.includes("User rejected")) msg = "Transaction cancelled.";
      else if (msg.includes("insufficient funds")) msg = "Insufficient gas funds.";
      else if (msg.includes("chain")) msg = "Wrong Network. Please switch to Celo.";
      
      toast.dismiss();
      toast.error(msg);
    } finally {
      setIsProcessing(false);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    }
  };

  if (isFinished) {
    const isPerfect = score === quiz.questions.length;
    return (
      <div className="max-w-2xl mx-auto bg-slate-800 rounded-2xl p-8 border border-slate-700 text-center shadow-2xl pb-24 relative z-10">
        <div className="text-6xl mb-4">{isPerfect ? '🏆' : '📊'}</div>
        <h2 className="text-3xl font-bold text-white mb-2">
            {isPerfect ? 'Perfect Score!' : 'Quiz Completed'}
        </h2>
        <p className="text-slate-300 text-lg mb-6">
            You scored <span className="text-blue-400 font-bold">{score}</span> out of <span className="text-white">{quiz.questions.length}</span>
        </p>

        {isProcessing && (
            <div className="mb-6 p-4 bg-blue-500/20 border border-blue-500/50 rounded-xl text-blue-200 animate-pulse">
                <div className="flex items-center justify-center gap-3">
                    <div className="w-5 h-5 border-2 border-blue-200 border-t-transparent rounded-full animate-spin"></div>
                    <p className="font-bold text-lg">{statusMessage}</p>
                </div>
                <p className="text-xs mt-2 text-blue-300">Please confirm in your wallet popup</p>
            </div>
        )}

        {isPerfect && !hasClaimed && (
            <button 
                onClick={claimReward}
                disabled={isProcessing}
                className="w-full mb-6 py-4 bg-gradient-to-r from-yellow-400 to-orange-500 active:from-yellow-500 active:to-orange-600 text-black font-bold text-lg rounded-xl shadow-lg shadow-orange-500/20 transform transition-all hover:-translate-y-1 active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
            >
                {isProcessing ? 'Wait...' : '🎁 TAP TO CLAIM REWARD'}
            </button>
        )}

        {isPerfect && hasClaimed && (
            <div className="p-4 bg-green-500/10 border border-green-500/30 rounded-xl text-green-400 font-bold mb-4">
                ✅ NFT Added to Wallet!
            </div>
        )}

        <div className="flex gap-4 justify-center">
            <button 
                onClick={onBack || (() => router.push('/'))} 
                disabled={isProcessing} 
                className="px-8 py-3 bg-slate-700 text-white font-semibold rounded-xl hover:bg-slate-600 transition-colors disabled:opacity-50"
            >
                Back to Home
            </button>
        </div>
      </div>
    );
  }

  const question = quiz.questions[currentQuestionIndex];
  const progress = ((currentQuestionIndex + 1) / quiz.questions.length) * 100;

  return (
    <div className="max-w-3xl mx-auto pb-12">
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