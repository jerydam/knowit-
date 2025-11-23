import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

const validateEnv = () => {
  const requiredVars = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY'
  ];
  const missing = requiredVars.filter(key => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
};

// Validate environment variables on module load
validateEnv();

// Use service role key for server-side operations
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Export different clients for different use cases
export const supabase = createClient(supabaseUrl!, supabaseAnonKey);

// Service role client for server-side operations (bypasses RLS)
export const supabaseAdmin = createClient(
  supabaseUrl!, 
  supabaseServiceKey, 
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);