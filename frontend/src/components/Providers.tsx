'use client';

import { WagmiProvider, createConfig, http } from 'wagmi';
import { celo } from 'wagmi/chains';
import { injected } from 'wagmi/connectors';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WalletProvider } from '@/components/context/WalletContext';
import { Toaster } from 'react-hot-toast';
import { ReactNode, useState } from 'react';

export function Providers({ children }: { children: ReactNode }) {
  // Using useState ensures the queryClient is stable across re-renders
  const [queryClient] = useState(() => new QueryClient());

  const [wagmiConfig] = useState(() => 
    createConfig({
      chains: [celo],
      connectors: [injected()],
      transports: {
        [celo.id]: http(),
      },
    })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <WagmiProvider config={wagmiConfig}>
        <WalletProvider>
          <Toaster position="bottom-center" />
          {children}
        </WalletProvider>
      </WagmiProvider>
    </QueryClientProvider>
  );
}