// hooks/useMiniPay.ts
import { useState, useEffect } from 'react';
import { useConnect } from 'wagmi';
import { injected } from 'wagmi/connectors';

export const useMiniPay = () => {
  const [isMiniPay, setIsMiniPay] = useState(false);
  const { connect } = useConnect();

  useEffect(() => {
    // Check if running in browser environment and if ethereum is injected
    if (typeof window !== 'undefined' && window.ethereum) {
      // @ts-ignore - isMiniPay is a custom property
      if (window.ethereum.isMiniPay) {
        setIsMiniPay(true);
        
        // MiniPay connection is implicit, trigger wagmi connection immediately
        connect({ connector: injected() });
      }
    }
  }, [connect]);

  return { isMiniPay };
};