'use client';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { ethers } from 'ethers';
import { useRouter } from 'next/navigation';
import { Quiz, Question, QuizCompletion } from '@/types/quiz';
import { QuizRewardsABI } from '@/lib/QuizAbi';
import toast from 'react-hot-toast';
import { useWallet } from '@/components/context/WalletContext';
import { createWalletClient, custom } from 'viem';
import { celo } from 'viem/chains';
import { sendTransactionWithDivvi } from '@/lib/divvi';

interface QuizPlayerProps {
  quiz: Quiz;
  isFrame?: boolean;
  onComplete?: () => void;
}

interface QuizState {
  currentQuestionIndex: number;
  selectedAnswer: string | null;
  userAnswers: (string | null)[];
  score: number;
  isQuizComplete: boolean;
  hasPerfectScore: boolean;
  timer: number;
  attemptCount: number;
  startTime: number | null;
  isLoading: boolean;
  showResults: boolean;
  hasTimedOut: boolean;
}

const TIMER_DURATION = 10;
const QUIZ_CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_QUIZ_CONTRACT_ADDRESS!;

const QuizPlayer: React.FC<QuizPlayerProps> = ({ quiz, isFrame = false, onComplete }) => {
  const router = useRouter();
  const { userAddress, isConnected } = useWallet();
  
  const initialState: QuizState = useMemo(() => ({
    currentQuestionIndex: 0,
    selectedAnswer: null,
    userAnswers: new Array(quiz.questions.length).fill(null),
    score: 0,
    isQuizComplete: false,
    hasPerfectScore: false,
    timer: TIMER_DURATION,
    attemptCount: 0,
    startTime: null,
    isLoading: false,
    showResults: false,
    hasTimedOut: false,
  }), [quiz.questions.length]);

  const [state, setState] = useState<QuizState>(initialState);

  // Get attempt count from local storage
  const getStoredAttempts = useCallback(() => {
    if (!userAddress) return 0;
    const key = `quiz_attempts_${userAddress}_${quiz.id}`;
    const stored = localStorage.getItem(key);
    return stored ? parseInt(stored, 10) : 0;
  }, [userAddress, quiz.id]);

  // Set attempt count in local storage
  const setStoredAttempts = useCallback((count: number) => {
    if (!userAddress) return;
    const key = `quiz_attempts_${userAddress}_${quiz.id}`;
    localStorage.setItem(key, count.toString());
  }, [userAddress, quiz.id]);

  // Initialize quiz data
  const initializeQuiz = useCallback(async () => {
    if (isFrame || !userAddress || !window.ethereum) return;
    
    setState(prev => ({ ...prev, isLoading: true }));
    
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const contract = new ethers.Contract(QUIZ_CONTRACT_ADDRESS, QuizRewardsABI, provider);
      
      // Fetch player completions for this quiz
      const completions: QuizCompletion[] = await contract.getPlayerQuizCompletions(userAddress);
      const quizCompletions = completions.filter(c => c.quizId === quiz.id);
      const perfectAttempt = quizCompletions.find(c => Number(c.score) === quiz.questions.length);
      let attemptCount = getStoredAttempts();
      
      if (!perfectAttempt) {
        // Increment attempt count for new attempt
        attemptCount += 1;
        setStoredAttempts(attemptCount);
      }

      setState(prev => ({
        ...prev,
        hasPerfectScore: !!perfectAttempt,
        score: perfectAttempt ? Number(perfectAttempt.score) : (quizCompletions.length > 0 ? Math.max(...quizCompletions.map(c => Number(c.score))) : 0),
        isQuizComplete: !!perfectAttempt,
        attemptCount,
        startTime: Date.now(),
        isLoading: false,
      }));
    } catch (err: any) {
      console.error('Error fetching quiz completions:', err);
      setState(prev => ({ ...prev, isLoading: false, startTime: Date.now() }));
      toast.error('Failed to fetch quiz data');
    }
  }, [quiz.id, quiz.questions.length, userAddress, isFrame, getStoredAttempts, setStoredAttempts]);

  // Timer effect
  useEffect(() => {
    if (isFrame || state.isQuizComplete || state.hasPerfectScore || state.isLoading) return;
    
    const interval = setInterval(() => {
      setState(prev => {
        if (prev.timer <= 1) {
          setTimeout(() => handleNextQuestion(true), 100);
          return { ...prev, timer: TIMER_DURATION, hasTimedOut: true };
        }
        return { ...prev, timer: prev.timer - 1 };
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [state.currentQuestionIndex, state.isQuizComplete, state.hasPerfectScore, state.isLoading, isFrame]);

  // Initialize on mount
  useEffect(() => {
    initializeQuiz();
  }, [initializeQuiz]);

  const handleAnswerSelect = useCallback((answer: string) => {
    setState(prev => {
      const newAnswers = [...prev.userAnswers];
      newAnswers[prev.currentQuestionIndex] = answer;
      
      return {
        ...prev,
        selectedAnswer: answer,
        userAnswers: newAnswers,
        hasTimedOut: false,
      };
    });
  }, []);

  const calculateFinalScore = useCallback(() => {
    let correctCount = 0;
    for (let i = 0; i < quiz.questions.length; i++) {
      const userAnswer = state.userAnswers[i];
      const correctAnswer = quiz.questions[i].correctAnswer;
      if (userAnswer === correctAnswer) {
        correctCount++;
      }
    }
    return correctCount;
  }, [quiz.questions, state.userAnswers]);

  const saveQuizAttempt = useCallback(async (quizId: string, score: number, attempts: number) => {
    if (!userAddress || !window.ethereum) {
      console.error('No user address or wallet provider available');
      return false;
    }

    // Only save to smart contract if perfect score
    if (score !== quiz.questions.length) {
      return false;
    }

    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(QUIZ_CONTRACT_ADDRESS, QuizRewardsABI, signer);
      const walletClient = createWalletClient({
        chain: celo,
        transport: custom(window.ethereum!),
      });

      console.log('Recording quiz completion:', { quizId, score, attempts });
      
      await sendTransactionWithDivvi(
        contract,
        'recordQuizCompletion',
        [quizId, score, attempts],
        walletClient,
        provider
      );

      console.log('Quiz attempt saved to blockchain');
      toast.success('Quiz completion recorded on blockchain!');
      return true;
    } catch (error) {
      console.error('Failed to save quiz attempt:', error);
      toast.error('Failed to save quiz attempt to blockchain');
      return false;
    }
  }, [userAddress, quiz.questions.length]);

  const handleBlockchainReward = useCallback(async () => {
    if (!isConnected || !userAddress || !window.ethereum) {
      console.error('Wallet not connected or MetaMask not detected');
      return;
    }

    setState(prev => ({ ...prev, isLoading: true }));
    
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const network = await provider.getNetwork();
      
      if (Number(network.chainId) !== celo.id) {
        try {
          await window.ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: `0x${celo.id.toString(16)}` }],
          });
        } catch (switchError: any) {
          throw new Error('Please switch to Celo Mainnet to claim NFT reward');
        }
      }

      const signer = await provider.getSigner();
      const contract = new ethers.Contract(QUIZ_CONTRACT_ADDRESS, QuizRewardsABI, signer);
      const walletClient = createWalletClient({
        chain: celo,
        transport: custom(window.ethereum!),
      });

      console.log('Claiming NFT reward for quizId:', quiz.id);
      
      await sendTransactionWithDivvi(
        contract,
        'claimNFTReward',
        [quiz.id],
        walletClient,
        provider
      );
      
      console.log('NFT reward claimed successfully');
      toast.success('🎉 NFT reward claimed successfully!');
    } catch (err: any) {
      console.error('Blockchain operation error:', err);
      let errorMessage = 'Failed to process blockchain rewards';
      if (err.message.includes('INSUFFICIENT_FUNDS')) {
        errorMessage = 'Insufficient funds for gas. Get CELO at a faucet.';
      } else if (err.message.includes('user rejected')) {
        errorMessage = 'Transaction was rejected by user';
      } else if (err.message) {
        errorMessage = err.message;
      }
      toast.error(errorMessage);
    } finally {
      setState(prev => ({ ...prev, isLoading: false }));
    }
  }, [isConnected, userAddress, quiz.id]);

  const handleQuizComplete = useCallback(async () => {
    const endTime = Date.now();
    const timeTakenSeconds = state.startTime ? Math.round((endTime - state.startTime) / 1000) : 0;
    
    const finalScore = calculateFinalScore();
    const isPerfectScore = finalScore === quiz.questions.length;
    
    if (!isPerfectScore) {
      setStoredAttempts(state.attemptCount);
    }

    setState(prev => ({
      ...prev,
      score: finalScore,
      isQuizComplete: true,
      showResults: true,
      hasPerfectScore: isPerfectScore,
      attemptCount: prev.attemptCount,
    }));

    if (isPerfectScore && isConnected && userAddress) {
      await saveQuizAttempt(quiz.id, finalScore, state.attemptCount);
      await handleBlockchainReward();
      // Clear attempt count after perfect score
      setStoredAttempts(0);
    }

    if (onComplete) {
      onComplete();
    }
  }, [state.startTime, state.attemptCount, calculateFinalScore, quiz.questions.length, quiz.id, saveQuizAttempt, isConnected, userAddress, handleBlockchainReward, onComplete, setStoredAttempts]);

  const handleNextQuestion = useCallback(async (isTimeout = false) => {
    if (!isTimeout && state.selectedAnswer === null) {
      toast.error('Please select an answer.');
      return;
    }

    setState(prev => ({
      ...prev,
      selectedAnswer: null,
      timer: TIMER_DURATION,
      hasTimedOut: false,
    }));

    if (state.currentQuestionIndex < quiz.questions.length - 1) {
      setState(prev => ({ ...prev, currentQuestionIndex: prev.currentQuestionIndex + 1 }));
    } else {
      await handleQuizComplete();
    }
  }, [state.selectedAnswer, state.currentQuestionIndex, quiz.questions.length, handleQuizComplete]);

  const handleRetry = useCallback(() => {
    if (state.hasPerfectScore) {
      toast.error('You have a perfect score and cannot retake this quiz.');
      return;
    }
    
    const newAttemptCount = state.attemptCount + 1;
    setStoredAttempts(newAttemptCount);
    setState({
      ...initialState,
      startTime: Date.now(),
      attemptCount: newAttemptCount,
    });
  }, [state.hasPerfectScore, state.attemptCount, initialState, setStoredAttempts]);

  if (state.hasPerfectScore && !isFrame) {
    return (
      <div className="p-6 bg-gradient-to-br from-green-900/50 to-blue-900/50 rounded-xl border border-green-500/30">
        <div className="text-center">
          <div className="text-6xl mb-4">🏆</div>
          <h2 className="text-3xl font-bold text-green-300 mb-2">Perfect Mastery!</h2>
          <p className="text-xl text-gray-300 mb-2">
            Score: {state.score}/{quiz.questions.length}
          </p>
          <p className="text-sm text-green-400 mb-4">
            🎖️ NFT reward has been processed!
          </p>
          <button
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-semibold transition-colors"
            onClick={() => router.push('/')}
          >
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  if (state.isQuizComplete && !isFrame) {
    const percentage = Math.round((state.score / quiz.questions.length) * 100);
    const isPerfect = state.score === quiz.questions.length;
    
    return (
      <div className={`p-6 rounded-xl border ${isPerfect 
        ? 'bg-gradient-to-br from-green-900/50 to-blue-900/50 border-green-500/30' 
        : 'bg-gray-800/50 border-gray-600/30'
      }`}>
        <div className="text-center">
          <div className="text-4xl mb-4">{isPerfect ? '🎉' : '📊'}</div>
          <h2 className={`text-2xl font-bold mb-2 ${isPerfect ? 'text-green-300' : 'text-blue-300'}`}>
            {isPerfect ? '🎉 Perfect Score!' : '📊 Quiz Complete!'}
          </h2>
          <p className="text-xl text-gray-300 mb-2">
            Your score: {state.score}/{quiz.questions.length} ({percentage}%)
          </p>
          {isPerfect && (
            <p className="text-green-400 mb-4">🏆 NFT reward processing...</p>
          )}
          <div className="flex justify-center space-x-3 mt-4">
            <button
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-semibold transition-colors disabled:opacity-50"
              onClick={() => router.push('/')}
              disabled={state.isLoading}
            >
              {state.isLoading ? 'Processing...' : 'Back to Home'}
            </button>
            {!isPerfect && (
              <button
                className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg font-semibold transition-colors disabled:opacity-50"
                onClick={handleRetry}
                disabled={state.isLoading}
              >
                Retake Quiz
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (isFrame) {
    return (
      <div className="p-4 text-gray-300 text-center">
        <div className="text-2xl mb-2">🎯</div>
        <p>Quiz running in Farcaster Frame</p>
        <p className="text-sm text-gray-400">Use Warpcast to interact</p>
      </div>
    );
  }

  if (state.isLoading && !state.startTime) {
    return (
      <div className="p-6 bg-gray-800/50 rounded-xl">
        <div className="flex items-center justify-center space-x-3">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"></div>
          <span className="text-gray-300">Loading quiz...</span>
        </div>
      </div>
    );
  }

  const currentQuestion: Question = quiz.questions[state.currentQuestionIndex];
  const progress = ((state.currentQuestionIndex + 1) / quiz.questions.length) * 100;

  return (
    <div className="p-6 bg-gray-800/50 rounded-xl">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-blue-300 mb-2">{quiz.title}</h2>
        <div className="flex justify-between items-center">
          <p className="text-gray-300">
            Question {state.currentQuestionIndex + 1} of {quiz.questions.length}
          </p>
          <span className={`text-lg font-semibold flex items-center space-x-1 ${
            state.timer <= 3 ? 'text-red-500 animate-pulse' : 'text-gray-300'
          }`}>
            <span>⏱️</span>
            <span>{state.timer}s</span>
          </span>
        </div>
        
        <div className="w-full bg-gray-700 rounded-full h-2 mt-2">
          <div 
            className="bg-blue-500 h-2 rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          ></div>
        </div>
      </div>

      <div className="mb-6">
        <p className="text-lg text-gray-200 mb-4 leading-relaxed">
          {currentQuestion.question}
        </p>
        
        <div className="space-y-3">
          {currentQuestion.options.map((option, index) => (
            <button
              key={index}
              className={`block w-full text-left p-4 rounded-lg transition-all duration-200 ${
                state.selectedAnswer === option 
                  ? 'bg-blue-500 text-white shadow-lg scale-[1.02]' 
                  : 'bg-gray-200 text-gray-800 hover:bg-gray-300 hover:shadow-md hover:scale-[1.01]'
              }`}
              onClick={() => handleAnswerSelect(option)}
              disabled={state.isLoading}
            >
              <span className="font-semibold text-blue-600 mr-3">
                {String.fromCharCode(65 + index)}.
              </span>
              <span>{option}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex justify-between items-center">
        <div className="text-sm text-gray-400 space-y-1">
          <div>Attempt #{state.attemptCount}</div>
          {state.hasTimedOut && (
            <div className="text-orange-400">⚠️ Previous question timed out</div>
          )}
        </div>
        
        <button
          className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg font-semibold transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
          onClick={() => handleNextQuestion()}
          disabled={state.isLoading || (!state.selectedAnswer && state.timer > 0)}
        >
          {state.isLoading ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
              <span>Processing...</span>
            </>
          ) : (
            <span>
              {state.currentQuestionIndex === quiz.questions.length - 1 ? 'Finish Quiz' : 'Next Question'}
            </span>
          )}
        </button>
      </div>
    </div>
  );
};

export default QuizPlayer;