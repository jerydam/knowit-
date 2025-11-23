import type { NextRequest } from 'next/server';
import { supabase, supabaseAdmin } from '@/lib/supabase';
import axios from 'axios';
import { ethers } from 'ethers';
import type { Quiz, Question } from '@/types/quiz';
import { z } from 'zod';

const QuestionSchema = z.object({
  id: z.string(),
  question: z.string(),
  options: z.array(z.string()).length(4),
  correctAnswer: z.string(),
  explanation: z.string(),
  tags: z.array(z.string()),
});

export async function POST(req: NextRequest) {
  console.log('📥 Store Quiz API called');

  try {
    // Validate environment variables
    console.log('🔍 Validating environment variables...');
    const requiredEnvVars = {
      PINATA_JWT: process.env.PINATA_JWT,
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    };

    for (const [key, value] of Object.entries(requiredEnvVars)) {
      if (!value) {
        console.error(`❌ ${key} is not set`);
        return new Response(
          JSON.stringify({ error: `Server configuration error: ${key} is missing` }),
          { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
      }
    }
    console.log('✅ Environment variables validated');

    // Parse form data with error handling
    console.log('📋 Parsing form data...');
    let formData: FormData;
    try {
      formData = await req.formData();
    } catch (parseError) {
      console.error('❌ Failed to parse form data:', parseError);
      return new Response(
        JSON.stringify({ error: 'Invalid form data' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const topic = formData.get('topic') as string;
    const difficulty = formData.get('difficulty') as 'beginner' | 'intermediate' | 'advanced';
    const questionCount = parseInt(formData.get('questionCount') as string);
    const image = formData.get('image') as File;
    const userAddress = formData.get('userAddress') as string;
    const questionsJson = formData.get('questions') as string;

    console.log('📊 Received data:', {
      topic: topic || 'missing',
      difficulty: difficulty || 'missing',
      questionCount: isNaN(questionCount) ? 'invalid' : questionCount,
      hasImage: !!image,
      imageSize: image?.size || 0,
      imageType: image?.type || 'unknown',
      userAddress: userAddress ? `${userAddress.slice(0, 6)}...${userAddress.slice(-4)}` : 'missing',
      hasQuestions: !!questionsJson
    });

    // Validate input data
    console.log('✅ Validating input data...');
    const validationErrors: string[] = [];

    if (!topic?.trim()) validationErrors.push('Topic is required');
    if (!['beginner', 'intermediate', 'advanced'].includes(difficulty)) {
      validationErrors.push('Invalid difficulty level');
    }
    if (isNaN(questionCount) || questionCount < 1) {
      validationErrors.push('Invalid question count');
    }
    if (!image) {
      validationErrors.push('Image is required');
    } else if (image.size > 5 * 1024 * 1024) {
      validationErrors.push('Image size must be less than 5MB');
    }
    if (!userAddress?.trim()) {
      validationErrors.push('User address is required');
    } else if (!ethers.isAddress(userAddress)) {
      validationErrors.push('Invalid user address format');
    }
    if (!questionsJson?.trim()) {
      validationErrors.push('Questions are required');
    }

    if (validationErrors.length > 0) {
      console.error('❌ Validation errors:', validationErrors);
      return new Response(
        JSON.stringify({
          error: 'Validation failed',
          details: validationErrors
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Parse and validate questions
    console.log('🔍 Parsing and validating questions...');
    let questions: Question[];
    try {
      questions = JSON.parse(questionsJson);
      console.log('📝 Parsed questions count:', questions.length);
    } catch (jsonError) {
      console.error('❌ Failed to parse questions JSON:', jsonError);
      return new Response(
        JSON.stringify({ error: 'Invalid questions JSON format' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!Array.isArray(questions)) {
      console.error('❌ Questions is not an array');
      return new Response(
        JSON.stringify({ error: 'Questions must be an array' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (questions.length !== questionCount) {
      console.error('❌ Questions count mismatch:', {
        actualCount: questions.length,
        expectedCount: questionCount
      });
      return new Response(
        JSON.stringify({
          error: 'Questions count mismatch',
          expected: questionCount,
          actual: questions.length
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Validate each question
    console.log('🔍 Validating each question...');
    for (let i = 0; i < questions.length; i++) {
      const question = questions[i];
      try {
        QuestionSchema.parse(question);
        if (!question.options.includes(question.correctAnswer)) {
          throw new Error('Correct answer not found in options');
        }
        console.log(`✅ Question ${i + 1} validated successfully`);
      } catch (validationError) {
        console.error(`❌ Invalid question format at index ${i}:`, validationError);
        return new Response(
          JSON.stringify({
            error: `Invalid question format at index ${i}`,
            details: (validationError as Error).message
          }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }
    }

    // Test database connection (only in development)
    if (process.env.NODE_ENV === 'development') {
      console.log('🔍 Testing database connection...');
      const { error: testError } = await supabaseAdmin
        .from('quizzes')
        .select('id', { count: 'exact' })
        .limit(1);

      if (testError) {
        console.error('❌ Database connection test failed:', testError);
        let errorMessage = 'Database connection failed';
        if (testError.code === '42P01') {
          errorMessage = 'Database table "quizzes" does not exist';
        }
        return new Response(
          JSON.stringify({
            error: errorMessage,
            details: testError.message,
            code: testError.code
          }),
          { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
      }
      console.log('✅ Database connection successful');
    }

    // Upload image to IPFS
    console.log('🌐 Uploading image to IPFS...');
    console.log('📁 Image details:', {
      name: image.name,
      size: image.size,
      type: image.type
    });

    let nftMetadata: string;
    try {
      const pinataFormData = new FormData();
      pinataFormData.append('file', image);

      const pinataResponse = await axios.post(
        'https://api.pinata.cloud/pinning/pinFileToIPFS',
        pinataFormData,
        {
          headers: {
            'Authorization': `Bearer ${process.env.PINATA_JWT}`,
            'Content-Type': 'multipart/form-data'
          },
          timeout: 90000, // 90 second timeout
        }
      );

      console.log('📤 Pinata response status:', pinataResponse.status);
      console.log('📤 Pinata response data:', {
        success: !!pinataResponse.data?.IpfsHash,
        hash: pinataResponse.data?.IpfsHash,
        size: pinataResponse.data?.PinSize
      });

      if (!pinataResponse.data?.IpfsHash) {
        console.error('❌ No IPFS hash returned from Pinata');
        return new Response(
          JSON.stringify({ error: 'Failed to upload to IPFS - no hash returned' }),
          { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
      }

      nftMetadata = `ipfs://${pinataResponse.data.IpfsHash}`;
      console.log('✅ Image uploaded to IPFS successfully:', nftMetadata);

    } catch (ipfsError: any) {
      console.error('❌ IPFS upload failed:', {
        message: ipfsError.message,
        response: ipfsError.response?.data,
        status: ipfsError.response?.status,
        code: ipfsError.code
      });

      let errorMessage = 'Failed to upload image to IPFS';
      if (ipfsError.code === 'ECONNABORTED') {
        errorMessage += ' - request timeout';
      } else if (ipfsError.response?.status === 401) {
        errorMessage += ' - invalid API key';
      } else if (ipfsError.response?.data?.error) {
        errorMessage += `: ${ipfsError.response.data.error}`;
      } else if (ipfsError.message) {
        errorMessage += `: ${ipfsError.message}`;
      }

      return new Response(
        JSON.stringify({ error: errorMessage }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Create quiz object
    console.log('🎯 Creating quiz object...');
    const quizId = `quiz-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const title = `${topic} - ${difficulty.charAt(0).toUpperCase() + difficulty.slice(1)}`;

    const quiz: Quiz = {
      id: quizId,
      title,
      description: `A ${difficulty} quiz about ${topic}`,
      questions,
      difficulty,
      estimatedTime: questionCount * 2,
      rewards: { nfts: 1, points: 0 },
      source: { name: 'Generated', url: '' },
      createdAt: new Date(),
      rewardType: 'NFT',
      rewardAmount: 1,
      nftMetadata,
      createdBy: userAddress,
    };

    console.log('📋 Quiz object created:', {
      id: quiz.id,
      title: quiz.title,
      questionsCount: quiz.questions.length,
      difficulty: quiz.difficulty,
      createdBy: userAddress ? `${userAddress.slice(0, 6)}...${userAddress.slice(-4)}` : 'missing',
      nftMetadata: quiz.nftMetadata
    });

    // Prepare data for Supabase insertion
    const supabaseData = {
      id: quiz.id,
      title: quiz.title,
      description: quiz.description,
      questions: quiz.questions,
      difficulty: quiz.difficulty,
      estimated_time: quiz.estimatedTime,
      rewards: quiz.rewards,
      source: quiz.source,
      created_at: quiz.createdAt.toISOString(),
      reward_type: quiz.rewardType,
      reward_amount: quiz.rewardAmount,
      nft_metadata: quiz.nftMetadata,
      created_by: userAddress,
      transaction_hash: null,
    };

    console.log('💾 Preparing to save to Supabase...');

    // Save to Supabase using admin client
    console.log('💾 Saving quiz to Supabase...');
    const { data, error: dbError } = await supabaseAdmin
      .from('quizzes')
      .insert(supabaseData)
      .select()
      .single();

    if (dbError) {
      console.error('❌ Failed to save quiz to Supabase:', {
        error: dbError,
        message: dbError.message,
        details: dbError.details,
        hint: dbError.hint,
        code: dbError.code
      });

      let errorMessage = 'Failed to save quiz to database';
      if (dbError.code === '42P01') {
        errorMessage = 'Database table "quizzes" does not exist';
      } else if (dbError.message) {
        errorMessage += `: ${dbError.message}`;
      }
      if (dbError.details) {
        errorMessage += ` (${dbError.details})`;
      }
      if (dbError.hint) {
        errorMessage += ` Hint: ${dbError.hint}`;
      }

      return new Response(
        JSON.stringify({
          error: errorMessage,
          code: dbError.code
        }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!data) {
      console.error('❌ No data returned from Supabase insert');
      return new Response(
        JSON.stringify({ error: 'Failed to save quiz - no data returned' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    console.log('✅ Quiz saved to Supabase successfully:', {
      id: data.id,
      title: data.title
    });
    console.log('🎉 Store Quiz API completed successfully');

    return new Response(
      JSON.stringify({ quiz }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    );

  } catch (error: any) {
    console.error('💥 Store Quiz API error:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    });

    return new Response(
      JSON.stringify({
        error: error.message || 'Failed to store quiz',
        timestamp: new Date().toISOString()
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}