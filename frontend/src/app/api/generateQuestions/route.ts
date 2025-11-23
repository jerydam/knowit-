import { NextRequest, NextResponse } from 'next/server';
import type { Question } from '@/types/quiz';

export async function POST(req: NextRequest) {
  console.log('📥 Generate Questions API called');
  
  if (!process.env.GEMINI_API_KEY) {
    console.error('❌ GEMINI_API_KEY is not set in environment variables');
    return NextResponse.json(
      { error: 'Server configuration error: Missing GEMINI_API_KEY' },
      { status: 500 }
    );
  }

  let body;
  try {
    console.log('📋 Parsing request body...');
    body = await req.json();
    console.log('✅ Request body parsed successfully');
  } catch (error) {
    console.error('❌ Failed to parse request body:', error);
    return NextResponse.json(
      { error: 'Invalid request body: Expected JSON' },
      { status: 400 }
    );
  }

  const { topic, difficulty, count, fileContent } = body;
  
  console.log('📊 Received parameters:', {
    topic,
    difficulty,
    count,
    hasFileContent: !!fileContent,
    fileContentLength: fileContent?.length
  });

  if ((!topic && !fileContent) || !['beginner', 'intermediate', 'advanced'].includes(difficulty) || !Number.isInteger(count) || count < 1 || count > 20) {
    console.error('❌ Invalid input validation failed:', { 
      hasTopic: !!topic, 
      hasFileContent: !!fileContent,
      difficulty, 
      count, 
      isValidDifficulty: ['beginner', 'intermediate', 'advanced'].includes(difficulty),
      isValidCount: Number.isInteger(count) && count >= 1 && count <= 20
    });
    return NextResponse.json(
      { error: 'Invalid input: topic or fileContent, difficulty, or count' },
      { status: 400 }
    );
  }

  const generateQuestions = async (useOpenAI: boolean = false) => {
    console.log(`🎯 Generating questions using ${useOpenAI ? 'OpenAI' : 'Gemini'} API...`);
    
    try {
      const prompt = fileContent
        ? `Return valid JSON with the structure {"questions":[{"question":"text","options":["a","b","c","d"],"correctAnswer":"a","explanation":"text"}]}. Generate ${count} multiple-choice questions based on the following content at ${difficulty} level: "${fileContent.slice(0, 10000)}". Each question must have exactly 4 options, a correct answer (option text), and an explanation. Ensure the response is a single JSON object, not wrapped in markdown.`
        : `Return valid JSON with the structure {"questions":[{"question":"text","options":["a","b","c","d"],"correctAnswer":"a","explanation":"text"}]}. Generate ${count} multiple-choice questions about "${topic}" at ${difficulty} level. Each question must have exactly 4 options, a correct answer (option text), and an explanation. Ensure the response is a single JSON object, not wrapped in markdown.`;

      console.log('📝 Generated prompt:', {
        promptLength: prompt.length,
        isFileBasedContent: !!fileContent,
        targetQuestionCount: count,
        difficulty
      });

      if (useOpenAI) {
        console.log('🔄 Attempting OpenAI fallback...');
        if (!process.env.OPENAI_API_KEY) {
          console.error('❌ Missing OPENAI_API_KEY for fallback');
          throw new Error('Missing OPENAI_API_KEY');
        }
        
        console.log('📤 Calling OpenAI API endpoint...');
        const response = await fetch(`${req.nextUrl.origin}/api/generateQuestionsOpenAI`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ topic, difficulty, count, fileContent }),
        });
        
        if (!response.ok) {
          const errorData = await response.json();
          console.error('❌ OpenAI API failed:', { status: response.status, error: errorData });
          throw new Error(errorData.error || `OpenAI API failed: ${response.status}`);
        }
        
        const result = await response.json();
        console.log('✅ OpenAI API response received successfully');
        return result;
      }

      console.log('📤 Calling Gemini API...');
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  { text: prompt },
                ],
              },
            ],
            generationConfig: {
              temperature: 0.7,
              maxOutputTokens: 4096,
              responseMimeType: 'application/json',
            },
          }),
        }
      );

      console.log('📨 Gemini API response status:', response.status);

      if (!response.ok) {
        let errorData;
        try {
          errorData = await response.json();
          console.error('❌ Gemini API error details:', errorData);
        } catch {
          errorData = { error: `HTTP ${response.status}` };
          console.error('❌ Gemini API error - could not parse error response');
        }
        
        console.error('❌ Gemini API error:', { status: response.status, errorData });
        
        if (response.status === 401) {
          console.error('❌ Invalid Gemini API key');
          return NextResponse.json(
            { error: 'Invalid Gemini API key', details: errorData },
            { status: 401 }
          );
        }
        
        if (response.status === 429) {
          console.warn('⚠️ Gemini API rate limit exceeded, trying OpenAI fallback...');
          return generateQuestions(true); // Fallback to OpenAI
        }
        
        return NextResponse.json(
          { error: 'Failed to generate questions from Gemini API', details: errorData },
          { status: response.status }
        );
      }

      console.log('✅ Gemini API response received successfully');
      const result = await response.json();
      console.log('📋 Gemini API raw response structure:', {
        hasCandidates: !!result.candidates,
        candidatesLength: result.candidates?.length,
        hasContent: !!result.candidates?.[0]?.content,
        hasParts: !!result.candidates?.[0]?.content?.parts,
        partsLength: result.candidates?.[0]?.content?.parts?.length
      });

      const content = result.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!content) {
        console.error('❌ Gemini API response is empty:', result);
        return NextResponse.json(
          { error: 'Empty response from Gemini API', details: JSON.stringify(result) },
          { status: 500 }
        );
      }

      console.log('📄 Gemini API content received:', {
        contentLength: content.length,
        contentPreview: content.substring(0, 100) + '...'
      });

      let questionsData;
      try {
        console.log('🔍 Parsing Gemini API JSON response...');
        questionsData = JSON.parse(content);
        console.log('✅ JSON parsed successfully');
      } catch (parseError) {
        console.error('❌ Failed to parse Gemini API response as JSON:', { 
          content: content.substring(0, 500), 
          parseError: parseError 
        });
        return NextResponse.json(
          { error: 'Invalid JSON response from Gemini API', details: content },
          { status: 500 }
        );
      }

      console.log('📊 Parsed questions data structure:', {
        hasQuestions: !!questionsData.questions,
        isQuestionsArray: Array.isArray(questionsData.questions),
        questionsCount: questionsData.questions?.length,
        expectedCount: count
      });

      if (!questionsData.questions || !Array.isArray(questionsData.questions) || questionsData.questions.length === 0) {
        console.error('❌ Invalid or empty questions array from Gemini API:', questionsData);
        return NextResponse.json(
          { error: 'No questions returned from Gemini API', details: questionsData },
          { status: 500 }
        );
      }

      console.log('🔍 Validating question structure...');
      const validQuestions = questionsData.questions.every(
        (q: any, index: number) => {
          const isValid = typeof q.question === 'string' &&
            Array.isArray(q.options) &&
            q.options.length === 4 &&
            q.options.every((opt: any) => typeof opt === 'string') &&
            typeof q.correctAnswer === 'string' &&
            q.options.includes(q.correctAnswer) &&
            typeof q.explanation === 'string';

          if (!isValid) {
            console.error(`❌ Invalid question at index ${index}:`, {
              hasQuestion: typeof q.question === 'string',
              hasOptions: Array.isArray(q.options),
              optionsLength: q.options?.length,
              hasCorrectAnswer: typeof q.correctAnswer === 'string',
              correctAnswerInOptions: q.options?.includes(q.correctAnswer),
              hasExplanation: typeof q.explanation === 'string',
              question: q
            });
          } else {
            console.log(`✅ Question ${index + 1} validation passed`);
          }
          
          return isValid;
        }
      );

      if (!validQuestions) {
        console.error('❌ Invalid question structure validation failed');
        return NextResponse.json(
          { error: 'Invalid question structure from Gemini API', details: questionsData.questions },
          { status: 500 }
        );
      }

      console.log('✅ All questions validated successfully');

      const formattedQuestions: Question[] = questionsData.questions.map((q: any, index: number) => {
        const formattedQuestion = {
          id: `q${index + 1}`,
          question: q.question,
          options: q.options,
          correctAnswer: q.correctAnswer,
          explanation: q.explanation,
          tags: [topic || 'file-based', difficulty],
        };
        
        console.log(`📝 Formatted question ${index + 1}:`, {
          id: formattedQuestion.id,
          questionLength: formattedQuestion.question.length,
          optionsCount: formattedQuestion.options.length,
          hasCorrectAnswer: !!formattedQuestion.correctAnswer,
          tagsCount: formattedQuestion.tags.length
        });
        
        return formattedQuestion;
      });

      console.log('🎉 Questions generation completed successfully:', {
        totalQuestions: formattedQuestions.length,
        expectedCount: count,
        allQuestionsValid: formattedQuestions.length === count
      });

      return formattedQuestions;
    } catch (error: any) {
      console.error('💥 Error in generateQuestions function:', {
        message: error.message,
        code: error.code,
        response: error.response?.data,
        stack: error.stack
      });
      
      return NextResponse.json(
        {
          error: 'Failed to generate questions',
          details: error.message || 'Unknown error',
          code: error.code || 'UNKNOWN',
        },
        { status: 500 }
      );
    }
  };

  console.log('🚀 Starting question generation process...');
  const questions = await generateQuestions();
  
  if (questions instanceof NextResponse) {
    console.log('❌ Question generation returned error response');
    return questions;
  }
  
  console.log('✅ Question generation completed, returning response');
  return NextResponse.json(questions);
}