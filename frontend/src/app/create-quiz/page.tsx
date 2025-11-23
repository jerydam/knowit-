"use client";
import { QuizGenerator } from '@/components/QuizGenerator';
import { useRouter } from 'next/navigation';
import type { Quiz } from '@/types/quiz';

export default function CreateQuizPage() {
  const router = useRouter();

  const handleQuizGenerated = (quiz: Quiz) => {
    router.push('/'); // Redirect to home after creation
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-black text-white p-8">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-4xl font-bold">Create a New Quiz</h1>
          <button
            onClick={() => router.back()}
            className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white font-semibold rounded-lg transition-all"
          >
            ← Back
          </button>
        </div>
        <QuizGenerator onQuizGenerated={handleQuizGenerated} />
      </div>
    </div>
  );
}