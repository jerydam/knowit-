'use client';
import { RewardsPanel } from '@/components/RewardsPanel';
import Link from 'next/link';
import { ConnectWallet } from '@/components/ConnectWallet';
import { useWallet } from '@/components/context/WalletContext';
import { Toaster } from 'react-hot-toast';

export default function RewardsPage() {
  // Use the central wallet context instead of local state
  const { userAddress, isConnected, isMiniPay, error: walletError } = useWallet();

  return (
    // Updated Background: Blue/Slate Gradient (Knowledge Theme)
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-blue-950 to-slate-900 text-white py-8 sm:py-12 px-4 sm:px-6 lg:px-8">
      <Toaster position="bottom-center" />
      
      <div className="max-w-5xl mx-auto">
        <header className="text-center mb-12">
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight mb-4">
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-cyan-300">
              Your
            </span>{' '}
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-yellow-300 to-orange-400">
              Rewards
            </span>
          </h1>
          <p className="mt-3 text-lg text-slate-300 max-w-2xl mx-auto">
            Track your learning journey. Earn NFTs for every perfect score and build your on-chain knowledge profile.
          </p>
        </header>

        {walletError && (
          <div className="mb-8 p-4 bg-red-500/20 border border-red-500/50 text-red-200 rounded-xl text-center">
            {walletError}
          </div>
        )}

        <div className="flex justify-center mb-10">
          {isConnected ? (
            <div className="flex items-center space-x-3 bg-slate-800/80 backdrop-blur-sm rounded-full px-6 py-2 border border-blue-500/30 shadow-lg shadow-blue-500/10">
              <span className="text-sm font-medium text-blue-200">
                {isMiniPay ? '📱 MiniPay Connected' : 'Wallet Connected'}:
              </span>
              <span className="font-mono text-yellow-400 font-bold">
                 {userAddress?.slice(0, 6)}...{userAddress?.slice(-4)}
              </span>
            </div>
          ) : (
            // ConnectWallet handles the specific button logic (hides if MiniPay)
            <ConnectWallet />
          )}
        </div>

        <main>
          {/* Pass isMiniPay to panel to handle gas logic */}
          <RewardsPanel 
            userAddress={userAddress} 
            isConnected={isConnected} 
            isMiniPay={isMiniPay} 
          />
          
          <div className="mt-12 text-center">
            <Link href="/">
              <button className="px-8 py-3 bg-slate-700 hover:bg-slate-600 text-white font-semibold rounded-xl transition-all duration-300 hover:shadow-lg hover:-translate-y-1 border border-slate-600">
                ← Back to Dashboard
              </button>
            </Link>
          </div>
        </main>
      </div>
    </div>
  );
}