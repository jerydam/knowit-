import type { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  console.log('📥 Update Quiz Transaction API called');

  try {
    const { quizId, transactionHash } = await req.json();

    console.log('📋 Received data:', {
      quizId: quizId || 'missing',
      transactionHash: transactionHash || 'missing'
    });

    if (!quizId || !transactionHash) {
      console.error('❌ Missing required fields:', { quizId, transactionHash });
      return new Response(
        JSON.stringify({ error: 'Quiz ID and transaction hash are required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    console.log('💾 Updating quiz in Supabase...');
    const { data, error } = await supabaseAdmin
      .from('quizzes')
      .update({ transaction_hash: transactionHash })
      .eq('id', quizId)
      .select()
      .single();

    if (error) {
      console.error('❌ Error updating quiz:', {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint
      });
      return new Response(
        JSON.stringify({
          error: `Failed to update quiz: ${error.message}`,
          code: error.code
        }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!data) {
      console.error('❌ No quiz found with ID:', quizId);
      return new Response(
        JSON.stringify({ error: `Quiz with ID ${quizId} not found` }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    console.log('✅ Quiz updated successfully:', {
      id: data.id,
      transactionHash: data.transaction_hash
    });

    return new Response(
      JSON.stringify({ success: true, quiz: data }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('💥 Update Quiz Transaction API error:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    return new Response(
      JSON.stringify({
        error: error.message || 'Failed to update quiz transaction',
        timestamp: new Date().toISOString()
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}