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
  isMiniPay: boolean; 
  error: string | null;
  setWalletState: (state: any) => void;
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

    // 1. Detect Environment Flags
    const userAgent = navigator.userAgent.toLowerCase();
    const url = new URL(window.location.href);
    
    const isFarcasterApp = userAgent.includes('warpcast') || url.searchParams.has('farcaster');
    const isMini = url.pathname.startsWith('/mini') || url.searchParams.get('miniApp') === 'true';

    setIsFarcaster(isFarcasterApp);
    setIsMiniApp(isMini);

    // 2. MiniPay Detection & Auto-Connect Function
    const checkMiniPay = async () => {
      // @ts-ignore
      if (window.ethereum && window.ethereum.isMiniPay) {
        console.log("MiniPay Detected!");
        setIsMiniPay(true);
        
        try {
          // Auto-Connect Logic for MiniPay
          const client = createWalletClient({
            chain: celo,
            transport: custom(window.ethereum)
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

    // 3. Run check immediately
    checkMiniPay();

    // 4. Run check again if 'ethereum#initialized' event fires
    // (Fixes race condition where provider injects slightly after load)
    window.addEventListener('ethereum#initialized', checkMiniPay, { once: true });

    return () => {
        window.removeEventListener('ethereum#initialized', checkMiniPay);
    }

  }, []);

  const setWalletState = (state: any) => {
    if(state.userAddress) setUserAddress(state.userAddress);
    if(state.username !== undefined) setUsername(state.username);
    if(state.isConnected !== undefined) setIsConnected(state.isConnected);
    if(state.error !== undefined) setError(state.error);
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