'use client';
import { useState } from 'react';
import { ethers } from 'ethers';
import { createWalletClient, custom } from 'viem';
import { celo, celoAlfajores } from 'viem/chains';
import { QuizRewardsABI } from '@/lib/QuizAbi';
import { sendTransactionWithDivvi } from '@/lib/divvi';
import { useWallet } from '@/components/context/WalletContext';
import toast from 'react-hot-toast';
import type { Quiz } from '@/types/quiz';

interface QuizGeneratorProps {
  onQuizGenerated: (quiz: Quiz) => void;
}

export function QuizGenerator({ onQuizGenerated }: QuizGeneratorProps) {
  const [topic, setTopic] = useState('');
  const [difficulty, setDifficulty] = useState<'beginner' | 'intermediate' | 'advanced'>('beginner');
  const [questionCount, setQuestionCount] = useState(5);
  const [image, setImage] = useState<File | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentStep, setCurrentStep] = useState<'form' | 'generating' | 'storing' | 'blockchain'>('form');
  
  const { userAddress, isConnected } = useWallet();
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
    console.log('🚀 Starting quiz generation process...');
    console.log('📋 Input data:', { topic, difficulty, questionCount, hasImage: !!image, userAddress });

    if (!isConnected || !userAddress) {
      toast.error('Please connect your wallet first');
      return;
    }

    if (!topic.trim() || !image) {
      toast.error('Please fill in all fields and select an image');
      return;
    }

    if (!contractAddress) {
      toast.error('Contract address is not configured');
      return;
    }

    setIsGenerating(true);
    setCurrentStep('generating');

    try {
      // Step 1: Generate questions
      console.log('🎯 Step 1: Generating questions...');
      toast.loading('Generating questions...');

      const questionsResponse = await fetch('/api/generateQuestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic, difficulty, count: questionCount }),
      });

      if (!questionsResponse.ok) {
        const errorData = await questionsResponse.json();
        console.error('❌ Failed to generate questions:', errorData);
        throw new Error(errorData.error || 'Failed to generate questions');
      }

      const questions = await questionsResponse.json();
      console.log('✅ Questions generated successfully:', questions);
      console.log('📊 Generated questions count:', questions.length);

      toast.dismiss();
      toast.success('Questions generated successfully!');
      setCurrentStep('storing');

      // Step 2: Store quiz in database
      console.log('💾 Step 2: Storing quiz in database...');
      toast.loading('Storing quiz in database...');

      const formData = new FormData();
      formData.append('topic', topic);
      formData.append('difficulty', difficulty);
      formData.append('questionCount', questionCount.toString());
      formData.append('image', image);
      formData.append('userAddress', userAddress);
      formData.append('questions', JSON.stringify(questions));

      console.log('📤 Sending data to database API...');
      const storeResponse = await fetch('/api/storeQuiz', {
        method: 'POST',
        body: formData,
      });

      if (!storeResponse.ok) {
        const errorData = await storeResponse.json();
        console.error('❌ Failed to store quiz:', errorData);
        throw new Error(errorData.error || 'Failed to store quiz in database');
      }

      const { quiz } = await storeResponse.json();
      console.log('✅ Quiz stored in database successfully:', quiz);
      console.log('🆔 Generated Quiz ID:', quiz.id);
      console.log('🖼️ NFT Metadata:', quiz.nftMetadata);

      toast.dismiss();
      toast.success('Quiz stored in database!');
      setCurrentStep('blockchain');

      // Step 3: Send quiz ID to smart contract
      console.log('⛓️ Step 3: Sending quiz ID to smart contract...');
      toast.loading('Creating quiz on blockchain...');

      if (typeof window === 'undefined' || !window.ethereum) {
        throw new Error('No wallet provider detected');
      }

      const provider = new ethers.BrowserProvider(window.ethereum);
      const network = await provider.getNetwork();
      const currentChainId = Number(network.chainId);
      
      console.log('🌐 Current network chain ID:', currentChainId);

      // Support both Celo mainnet and testnet
      const supportedChains = [42220, 44787];
      if (!supportedChains.includes(currentChainId)) {
        console.log('🔄 Switching to supported network...');
        try {
          await window.ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: `0x${(42220).toString(16)}` }],
          });
        } catch (switchError: any) {
          if (switchError.code === 4902) {
            try {
              await window.ethereum.request({
                method: 'wallet_switchEthereumChain',
                params: [{ chainId: `0x${(44787).toString(16)}` }],
              });
            } catch {
              throw new Error('Please switch to Celo network');
            }
          } else {
            throw new Error('Please switch to Celo network');
          }
        }
      }

      const signer = await provider.getSigner();
      const contract = new ethers.Contract(contractAddress, QuizRewardsABI, signer);
      const walletClient = createWalletClient({
        chain: currentChainId === 44787 ? celoAlfajores : celo,
        transport: custom(window.ethereum),
      });

      console.log('📄 Contract details:', {
        address: contractAddress,
        quizId: quiz.id,
        title: quiz.title,
        nftMetadata: quiz.nftMetadata
      });

      // Send transaction to create quiz on contract
      console.log('📝 Calling smart contract createQuiz function...');
      const txHash = await sendTransactionWithDivvi(
        contract,
        'createQuiz',
        [quiz.id, quiz.title, quiz.nftMetadata],
        walletClient,
        provider
      );

      console.log('✅ Transaction sent successfully!');
      console.log('🔗 Transaction hash:', txHash);

      // Update database with transaction hash
      console.log('🔄 Updating database with transaction hash...');
      const updateResponse = await fetch('/api/updateQuizTransaction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quizId: quiz.id, transactionHash: txHash }),
      });

      if (updateResponse.ok) {
        console.log('✅ Database updated with transaction hash');
      } else {
        console.warn('⚠️ Failed to update database with transaction hash');
      }

      toast.dismiss();
      toast.success('Quiz created successfully on blockchain!');
      
      // Reset form
      console.log('🔄 Resetting form...');
      setTopic('');
      setDifficulty('beginner');
      setQuestionCount(5);
      setImage(null);
      setCurrentStep('form');
      
      onQuizGenerated({ ...quiz, transactionHash: txHash });
      
      console.log('🎉 Quiz generation process completed successfully!');
      console.log('📋 Final quiz data:', { ...quiz, transactionHash: txHash });

    } catch (error: any) {
      console.error('💥 Error in quiz generation process:', {
        message: error.message,
        code: error.code,
        step: currentStep,
        stack: error.stack
      });
      
      let errorMessage = error.message || 'Failed to create quiz';
      
      if (error.code === 'INSUFFICIENT_FUNDS') {
        errorMessage = 'Insufficient funds for gas. Please fund your wallet with CELO.';
      } else if (error.message.includes('User rejected')) {
        errorMessage = 'Transaction was rejected by user.';
      }
      
      toast.dismiss();
      toast.error(errorMessage);
      setCurrentStep('form');
    } finally {
      setIsGenerating(false);
      console.log('🏁 Quiz generation process ended');
    }
  };

  const getStepMessage = () => {
    switch (currentStep) {
      case 'generating':
        return {
          title: 'Generating Questions',
          description: 'Creating quiz questions using AI...'
        };
      case 'storing':
        return {
          title: 'Storing Quiz',
          description: 'Saving quiz data and uploading image to IPFS...'
        };
      case 'blockchain':
        return {
          title: 'Creating on Blockchain',
          description: 'Sending quiz ID to smart contract...'
        };
      default:
        return null;
    }
  };

  const stepMessage = getStepMessage();

  if (stepMessage) {
    return (
      <div className="max-w-2xl mx-auto bg-gray-800/40 backdrop-blur-sm rounded-2xl p-8 border border-blue-500/20">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-400 mx-auto mb-4"></div>
          <h3 className="text-xl font-semibold text-blue-200 mb-2">{stepMessage.title}</h3>
          <p className="text-gray-300">{stepMessage.description}</p>
          
          {/* Progress indicator */}
          <div className="mt-6">
            <div className="flex justify-center space-x-4 mb-2">
              <div className={`w-3 h-3 rounded-full ${currentStep === 'generating' || currentStep === 'storing' || currentStep === 'blockchain' ? 'bg-blue-400' : 'bg-gray-600'}`}></div>
              <div className={`w-3 h-3 rounded-full ${currentStep === 'storing' || currentStep === 'blockchain' ? 'bg-blue-400' : 'bg-gray-600'}`}></div>
              <div className={`w-3 h-3 rounded-full ${currentStep === 'blockchain' ? 'bg-blue-400' : 'bg-gray-600'}`}></div>
            </div>
            <div className="text-sm text-gray-400">
              Step {currentStep === 'generating' ? '1' : currentStep === 'storing' ? '2' : '3'} of 3
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto bg-gray-800/40 backdrop-blur-sm rounded-2xl p-8 border border-blue-500/20">
      <h2 className="text-3xl font-bold text-center text-blue-200 mb-8">Create New Quiz</h2>
      
      <div className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">Topic</label>
          <input
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="e.g., Web3, Blockchain, DeFi"
            className="w-full px-4 py-3 bg-gray-700/50 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">Difficulty</label>
          <select
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value as 'beginner' | 'intermediate' | 'advanced')}
            className="w-full px-4 py-3 bg-gray-700/50 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="beginner">Beginner</option>
            <option value="intermediate">Intermediate</option>
            <option value="advanced">Advanced</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">Number of Questions</label>
          <input
            type="number"
            min="1"
            max="20"
            value={questionCount}
            onChange={(e) => setQuestionCount(Math.max(1, Math.min(20, parseInt(e.target.value) || 1)))}
            className="w-full px-4 py-3 bg-gray-700/50 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">NFT Image (Max 5MB)</label>
          <input
            type="file"
            accept="image/*"
            onChange={handleImageChange}
            className="w-full px-4 py-3 bg-gray-700/50 border border-gray-600 rounded-lg text-white file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-500 file:text-white hover:file:bg-blue-600"
          />
          {image && (
            <p className="text-sm text-gray-400 mt-2">Selected: {image.name}</p>
          )}
        </div>

        <div className="flex gap-4">
          <button
            onClick={generateQuiz}
            disabled={isGenerating || !isConnected}
            className="flex-1 px-6 py-3 bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 disabled:from-gray-600 disabled:to-gray-600 text-white font-semibold rounded-lg transition-all duration-300"
          >
            {isGenerating ? 'Creating Quiz...' : 'Create Quiz'}
          </button>
          
          <button
            onClick={() => {
              setTopic('');
              setDifficulty('beginner');
              setQuestionCount(5);
              setImage(null);
            }}
            className="px-6 py-3 bg-gray-600 hover:bg-gray-700 text-white font-semibold rounded-lg transition-all duration-300"
          >
            Reset
          </button>
        </div>
      </div>
    </div>
  );
}