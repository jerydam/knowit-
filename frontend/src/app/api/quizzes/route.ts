import type { NextRequest } from 'next/server';
import { supabase, supabaseAdmin } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  console.log('📥 Get Quizzes API called');
  
  try {
    const id = req.nextUrl.searchParams.get('id');
    
    if (id) {
      console.log('🔍 Fetching single quiz with id:', id);
      
      // Always use admin client for quiz fetching since quizzes should be publicly readable
      const { data: quiz, error } = await supabaseAdmin
        .from('quizzes')
        .select('*')
        .eq('id', id)
        .single();

      console.log('🔍 Quiz query result:', { quiz: quiz?.id, error: error?.message });

      if (error) {
        console.error('❌ Error fetching quiz:', error);
        return new Response(
          JSON.stringify({ 
            error: 'Quiz not found', 
            details: error.message,
            code: error.code 
          }), 
          { status: 404, headers: { 'Content-Type': 'application/json' } }
        );
      }

      if (!quiz) {
        console.log('❌ Quiz not found with id:', id);
        return new Response(
          JSON.stringify({ error: 'Quiz not found' }), 
          { status: 404, headers: { 'Content-Type': 'application/json' } }
        );
      }

      console.log('✅ Quiz found:', { id: quiz.id, title: quiz.title });

      // Transform the response to match expected frontend format
      const transformedQuiz = {
        id: quiz.id,
        title: quiz.title,
        description: quiz.description,
        questions: quiz.questions,
        difficulty: quiz.difficulty,
        estimatedTime: quiz.estimated_time,
        rewards: quiz.rewards,
        source: quiz.source,
        createdAt: quiz.created_at,
        rewardType: quiz.reward_type,
        rewardAmount: quiz.reward_amount,
        nftMetadata: quiz.nft_metadata,
        createdBy: quiz.created_by,
        transactionHash: quiz.transaction_hash,
      };

      return new Response(
        JSON.stringify(transformedQuiz),
        { 
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    // Fetch all quizzes - always use admin client
    console.log('📋 Fetching all quizzes...');
    
    const { data: quizzes, error } = await supabaseAdmin
      .from('quizzes')
      .select('*')
      .order('created_at', { ascending: false });

    console.log('📋 All quizzes query result:', { 
      count: quizzes?.length || 0, 
      error: error?.message,
      firstQuiz: quizzes?.[0]?.id 
    });

    if (error) {
      console.error('❌ Error fetching quizzes:', error);
      // Still return empty array instead of throwing
      return new Response(JSON.stringify([]), { 
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (!quizzes || quizzes.length === 0) {
      console.log('📝 No quizzes found');
      return new Response(JSON.stringify([]), { 
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    console.log('✅ Quizzes fetched successfully:', { count: quizzes.length });

    // Transform the response to match expected frontend format
    const transformedQuizzes = quizzes.map((quiz) => ({
      id: quiz.id,
      title: quiz.title,
      description: quiz.description,
      questions: quiz.questions,
      difficulty: quiz.difficulty,
      estimatedTime: quiz.estimated_time,
      rewards: quiz.rewards,
      source: quiz.source,
      createdAt: quiz.created_at,
      rewardType: quiz.reward_type,
      rewardAmount: quiz.reward_amount,
      nftMetadata: quiz.nft_metadata,
      createdBy: quiz.created_by,
      transactionHash: quiz.transaction_hash,
    }));

    return new Response(JSON.stringify(transformedQuizzes), { 
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('💥 Get Quizzes API error:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    
    // Always return empty array for frontend compatibility
    return new Response(JSON.stringify([]), { 
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}