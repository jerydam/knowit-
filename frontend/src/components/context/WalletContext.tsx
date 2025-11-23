'use client';
import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { createWalletClient, custom } from 'viem';
import { celo } from 'viem/chains';

interface WalletContextType {
  userAddress: string | null;
  username: string | null;
  isConnected: boolean;
  isFarcaster: boolean;
  isMiniApp: boolean; 
  isMiniPay: boolean; // Added specific flag for MiniPay
  error: string | null;
  setWalletState: (state: {
    userAddress: string | null;
    username: string | null;
    isConnected: boolean;
    error: string | null;
  }) => void;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [userAddress, setUserAddress] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isFarcaster, setIsFarcaster] = useState(false);
  const [isMiniApp, setIsMiniApp] = useState(false);
  const [isMiniPay, setIsMiniPay] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // 1. Detect Environment
    const userAgent = navigator.userAgent.toLowerCase();
    const url = new URL(window.location.href);
    
    const isFarcasterApp = userAgent.includes('warpcast') || url.searchParams.has('farcaster');
    const isMini = url.pathname.startsWith('/mini') || url.searchParams.get('miniApp') === 'true';
    
    // Check for MiniPay injection
    // @ts-ignore
    const isMiniPayDetected = window.ethereum && window.ethereum.isMiniPay === true;

    setIsFarcaster(isFarcasterApp);
    setIsMiniApp(isMini);
    setIsMiniPay(!!isMiniPayDetected);

    // 2. Auto-Connect if MiniPay
    const autoConnectMiniPay = async () => {
      if (isMiniPayDetected) {
        try {
          // MiniPay connection is implicit, we just grab the address
          const client = createWalletClient({
            chain: celo,
            transport: custom(window.ethereum!)
          });
          const [address] = await client.requestAddresses();
          
          if (address) {
            setUserAddress(address);
            setIsConnected(true);
          }
        } catch (err) {
          console.error("MiniPay auto-connect failed", err);
        }
      }
    };

    autoConnectMiniPay();

  }, []);

  const setWalletState = ({
    userAddress,
    username,
    isConnected,
    error,
  }: {
    userAddress: string | null;
    username: string | null;
    isConnected: boolean;
    error: string | null;
  }) => {
    setUserAddress(userAddress);
    setUsername(username ?? null);
    setIsConnected(isConnected);
    setError(error);
  };

  return (
    <WalletContext.Provider
      value={{
        userAddress,
        username,
        isConnected,
        isFarcaster,
        isMiniApp,
        isMiniPay,
        error,
        setWalletState,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error('useWallet must be used within a WalletProvider');
  }
  return context;
}