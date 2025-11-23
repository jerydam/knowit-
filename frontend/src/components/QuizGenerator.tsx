'use client';
import { useState } from 'react';
import { ethers } from 'ethers';
import { createWalletClient, custom } from 'viem';
import { celo } from 'viem/chains';
import { QuizRewardsABI } from '@/lib/QuizAbi';
import { sendTransactionWithDivvi } from '@/lib/divvi';
import { useWallet } from '@/components/context/WalletContext';
import toast from 'react-hot-toast';
import type { Quiz } from '@/types/quiz';

const CUSD_ADDRESS = "0x765DE816845861e75A25fCA122bb6898B8B1282a";

interface QuizGeneratorProps {
  onQuizGenerated: (quiz: Quiz) => void;
  onCancel?: () => void;
}

export function QuizGenerator({ onQuizGenerated, onCancel }: QuizGeneratorProps) {
  const [topic, setTopic] = useState('');
  const [difficulty, setDifficulty] = useState<'beginner' | 'intermediate' | 'advanced'>('beginner');
  const [questionCount, setQuestionCount] = useState(5);
  const [image, setImage] = useState<File | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentStep, setCurrentStep] = useState<'form' | 'generating' | 'storing' | 'blockchain'>('form');
  
  const { userAddress, isConnected, isMiniPay } = useWallet();
  const contractAddress = process.env.NEXT_PUBLIC_QUIZ_CONTRACT_ADDRESS;

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast.error('Image size must be less than 5MB');
        return;
      }
      setImage(file);
    }
  };

  const generateQuiz = async () => {
    if (!isConnected || !userAddress) {
      toast.error('Connect wallet first');
      return;
    }
    if (!topic.trim() || !image) {
      toast.error('Please add a topic and an image');
      return;
    }

    setIsGenerating(true);
    setCurrentStep('generating');
    // Optional: Initial toast
    toast('Starting Quiz Generation...', { icon: '🚀' });

    try {
      // =================================================
      // STAGE 1: AI GENERATION
      // =================================================
      const qRes = await fetch('/api/generateQuestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic, difficulty, count: questionCount }),
      });
      
      if (!qRes.ok) throw new Error('Failed to generate questions');
      const questions = await qRes.json();
      
      // NOTIFICATION: Stage 1 Complete
      toast.success('Stage 1/3 Complete: Questions Generated');
      
      setCurrentStep('storing');

      // =================================================
      // STAGE 2: STORAGE & UPLOAD
      // =================================================
      const formData = new FormData();
      formData.append('topic', topic);
      formData.append('difficulty', difficulty);
      formData.append('questionCount', questionCount.toString());
      formData.append('image', image);
      formData.append('userAddress', userAddress);
      formData.append('questions', JSON.stringify(questions));

      const sRes = await fetch('/api/storeQuiz', { method: 'POST', body: formData });
      if (!sRes.ok) throw new Error('Failed to store quiz');
      
      const { quiz } = await sRes.json();

      // NOTIFICATION: Stage 2 Complete
      toast.success('Stage 2/3 Complete: Assets Uploaded');

      setCurrentStep('blockchain');

      // =================================================
      // STAGE 3: BLOCKCHAIN MINTING
      // =================================================
      let txHash;
      
      // --- MINIPAY LOGIC ---
      if (isMiniPay) {
        const walletClient = createWalletClient({
            chain: celo,
            transport: custom(window.ethereum!)
        });
        
        txHash = await walletClient.writeContract({
            address: contractAddress as `0x${string}`,
            abi: QuizRewardsABI,
            functionName: 'createQuiz',
            account: userAddress as `0x${string}`,
            args: [BigInt(quiz.id), quiz.title, quiz.nftMetadata],
            feeCurrency: CUSD_ADDRESS as `0x${string}`
        });
      } 
      // --- STANDARD LOGIC ---
      else {
        const provider = new ethers.BrowserProvider(window.ethereum!);
        const signer = await provider.getSigner();
        const contract = new ethers.Contract(contractAddress!, QuizRewardsABI, signer);
        const walletClient = createWalletClient({
            chain: celo,
            transport: custom(window.ethereum!)
        });
        
        txHash = await sendTransactionWithDivvi(
            contract, 
            'createQuiz', 
            [quiz.id, quiz.title, quiz.nftMetadata], 
            walletClient, 
            provider
        );
      }

      // 4. Update DB with Hash
      await fetch('/api/updateQuizTransaction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quizId: quiz.id, transactionHash: txHash }),
      });

      // NOTIFICATION: Stage 3 Complete (Final)
      toast.success('Stage 3/3 Complete: Quiz Minted on Celo!');
      
      onQuizGenerated({ ...quiz, transactionHash: txHash });

    } catch (error: any) {
      console.error(error);
      toast.error(error.message || 'Failed to create quiz');
      setCurrentStep('form');
    } finally {
      setIsGenerating(false);
    }
  };

  // --- LOADING UI ---
  if (currentStep !== 'form') {
    return (
      <div className="max-w-xl mx-auto bg-slate-800 rounded-2xl p-8 border border-slate-700 shadow-2xl">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-blue-500 border-r-transparent mx-auto mb-6"></div>
          <h3 className="text-2xl font-bold text-white mb-2">
            {currentStep === 'generating' && 'Step 1: Generating AI Questions...'}
            {currentStep === 'storing' && 'Step 2: Uploading Assets to IPFS...'}
            {currentStep === 'blockchain' && (isMiniPay ? 'Step 3: Confirm in MiniPay...' : 'Step 3: Confirm Wallet Transaction...')}
          </h3>
          <p className="text-slate-400">
            {currentStep === 'generating' && 'This usually takes 5-10 seconds.'}
            {currentStep === 'storing' && 'Securing your data...'}
            {currentStep === 'blockchain' && 'Please verify the transaction in your wallet.'}
          </p>
        </div>
      </div>
    );
  }

  // --- FORM UI ---
  return (
    <div className="max-w-2xl mx-auto bg-slate-800/80 backdrop-blur rounded-2xl p-8 border border-slate-700 shadow-xl">
      <div className="flex justify-between items-center mb-8">
        <h2 className="text-2xl font-bold text-white">Create AI Quiz</h2>
        {onCancel && (
            <button onClick={onCancel} className="text-slate-400 hover:text-white">✕</button>
        )}
      </div>
      
      <div className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">Topic</label>
          <input
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="e.g., DeFi, Celo History, NFTs"
            className="w-full px-4 py-3 bg-slate-900 border border-slate-600 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
            <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Difficulty</label>
            <select
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value as any)}
                className="w-full px-4 py-3 bg-slate-900 border border-slate-600 rounded-xl text-white focus:border-blue-500 outline-none"
            >
                <option value="beginner">Beginner</option>
                <option value="intermediate">Intermediate</option>
                <option value="advanced">Advanced</option>
            </select>
            </div>

            <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Questions</label>
            <input
                type="number"
                min="1"
                max="10"
                value={questionCount}
                onChange={(e) => setQuestionCount(parseInt(e.target.value))}
                className="w-full px-4 py-3 bg-slate-900 border border-slate-600 rounded-xl text-white focus:border-blue-500 outline-none"
            />
            </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">NFT Image</label>
          <div className="border-2 border-dashed border-slate-600 rounded-xl p-6 text-center hover:border-blue-500 transition-colors bg-slate-900/50">
            <input
                type="file"
                accept="image/*"
                id="file-upload"
                onChange={handleImageChange}
                className="hidden"
            />
            <label htmlFor="file-upload" className="cursor-pointer flex flex-col items-center">
                {image ? (
                    <span className="text-green-400 font-medium">{image.name}</span>
                ) : (
                    <>
                        <span className="text-slate-400 text-sm">Click to upload NFT Cover Image</span>
                        <span className="text-xs text-slate-500 mt-1">(Max 5MB)</span>
                    </>
                )}
            </label>
          </div>
        </div>

        <button
          onClick={generateQuiz}
          disabled={isGenerating || !isConnected}
          className="w-full py-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold rounded-xl shadow-lg shadow-blue-900/20 transition-all transform active:scale-95 disabled:opacity-50 disabled:transform-none"
        >
          {isGenerating ? 'Processing...' : 'Generate & Mint Quiz'}
        </button>
      </div>
    </div>
  );
}