import QuizPageClient from '@/components/QuizPageClient';
import type { Quiz } from '@/types/quiz';
import Link from 'next/link';
import { supabaseAdmin } from '@/lib/supabase';
import { notFound } from 'next/navigation';

interface QuizPageProps {
  params: Promise<{ id: string }>;
}

export default async function QuizPage({ params }: QuizPageProps) {
  const { id } = await params;
  console.log('📥 Fetching quiz server-side:', { id });

  try {
    // Fetch quiz from Supabase
    const { data: quiz, error } = await supabaseAdmin
      .from('quizzes')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !quiz) {
      console.error('❌ Failed to fetch quiz:', { error: error?.message, id });
      notFound();
    }

    console.log('✅ Quiz fetched server-side:', { id: quiz.id, title: quiz.title });

    return <QuizPageClient quiz={quiz} />;
  } catch (error: any) {
    console.error('❌ Failed to fetch quiz:', {
      status: 500,
      errorText: error.message
    });
    return (
      <div className="p-4">
        <h2 className="text-2xl font-bold text-red-500">Error</h2>
        <p>Failed to load quiz: {error.message}</p>
        <Link href="/" className="mt-4 inline-block bg-blue-500 text-white px-4 py-2 rounded">
          Back to Home
        </Link>
      </div>
    );
  }
}