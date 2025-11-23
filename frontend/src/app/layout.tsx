'use client';
import './globals.css';
import { WalletProvider } from '@/components/context/WalletContext';
import { WagmiProvider, createConfig, http } from 'wagmi';
import { celo } from 'wagmi/chains';
import { injected } from 'wagmi/connectors';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactNode, useMemo } from 'react';

const queryClient = new QueryClient();

export default function RootLayout({ children }: { children: ReactNode }) {
  const wagmiConfig = useMemo(
    () =>
      createConfig({
        chains: [celo],
        connectors: [injected()],
        transports: {
          [celo.id]: http(),
        },
        storage: null,
      }),
    []
  );

  return (
    <html lang="en">
      <head>
        <link rel="shortcut icon" href="favicon.png" type="image/x-icon" />
      </head>
      <body>
        <QueryClientProvider client={queryClient}>
          <WagmiProvider config={wagmiConfig}>
            <WalletProvider>{children}</WalletProvider>
          </WagmiProvider>
        </QueryClientProvider>
      </body>
    </html>
  );
}