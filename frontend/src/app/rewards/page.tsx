'use client';
import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { RewardsPanel } from '@/components/RewardsPanel';
import type { UserScore } from '@/types/quiz';
import Link from 'next/link';
import { ConnectWallet } from '@/components/ConnectWallet';
import { QuizRewardsABI } from '@/lib/QuizAbi';

interface Window {
  ethereum?: {
    request: (args: { method: string; params?: any[] }) => Promise<any>;
    on: (event: string, callback: (accounts: string[]) => void) => void;
  };
}

export default function RewardsPage() {
  const [userAddress, setUserAddress] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const contractAddress = process.env.NEXT_PUBLIC_QUIZ_CONTRACT_ADDRESS!;

  useEffect(() => {
    const fetchUserData = async () => {
      if (typeof window === 'undefined' || !window.ethereum) {
        setError('MetaMask not detected. Please install MetaMask.');
        return;
      }

      try {
        const provider = new ethers.BrowserProvider(window.ethereum);
        const accounts = await provider.send('eth_requestAccounts', []);
        if (accounts.length === 0) {
          setError('No wallet accounts found.');
          return;
        }
        setUserAddress(accounts[0]);
        setIsConnected(true);
        console.log('Wallet connected:', accounts[0]);
      } catch (err: any) {
        console.error('Error fetching user data:', err);
        setError('Failed to connect wallet: ' + err.message);
      }
    };
    fetchUserData();

    if (window.ethereum) {
      window.ethereum.on('accountsChanged', (accounts: string[]) => {
        setUserAddress(accounts[0] || null);
        setIsConnected(!!accounts[0]);
        fetchUserData();
      });
    }
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-black text-white py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto">
        <header className="text-center mb-12">
          <h1 className="text-5xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-500">
            🏆 Your Rewards
          </h1>
          <p className="mt-3 text-lg text-gray-300">
            View your quiz achievements and claim your NFTs on the Celo blockchain
          </p>
        </header>

        {error && (
          <div className="mb-8 p-4 bg-red-500/20 text-red-300 rounded-lg text-center">
            {error}
          </div>
        )}

        <div className="flex justify-center mb-8">
          {userAddress ? (
            <div className="flex items-center space-x-3 bg-gray-800/50 rounded-full px-4 py-2 border border-blue-500/30">
              <span className="text-sm text-blue-300">
                Connected: {userAddress.slice(0, 6)}...{userAddress.slice(-4)}
              </span>
              <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
            </div>
          ) : (
            <ConnectWallet />
          )}
        </div>

        <main>
          <RewardsPanel
            userAddress={userAddress}
            isConnected={isConnected}
          />
          <div className="mt-6 text-center">
            <Link href="/">
              <button className="px-6 py-3 bg-gray-600 hover:bg-gray-700 text-white font-semibold rounded-lg transition-all duration-300">
                ← Back to Home
              </button>
            </Link>
          </div>
        </main>
      </div>
    </div>
  );
}