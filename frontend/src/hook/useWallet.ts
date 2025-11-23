// src/hook/useWallet.ts
'use client';
import { useEffect } from 'react';
import { useProfile } from '@farcaster/auth-kit';
import { useAccount, useConnect, useDisconnect } from 'wagmi';
import { injected } from 'wagmi/connectors';
import axios from 'axios';
import toast from 'react-hot-toast';
import { useWallet } from '@/components/context/WalletContext';

export function useWalletConnection() {
  const { isFarcaster, setWalletState } = useWallet();
  const { isAuthenticated, profile } = useProfile();
  const { address, isConnected: isEthConnected } = useAccount();
  const { connectAsync } = useConnect();
  const { disconnect } = useDisconnect();

  const connectFarcaster = async () => {
    try {
      if (!isAuthenticated || !profile) {
        throw new Error('Please sign in with Farcaster');
      }

      const { fid, username: farcasterUsername, custody: custodyAddress } = profile;
      if (!fid || !custodyAddress) {
        throw new Error('Missing FID or custody address');
      }

      let username: string | null = farcasterUsername ?? null;
      if (!username) {
        const neynarResponse = await axios.get('https://api.neynar.com/v2/farcaster/user/bulk', {
          params: { fids: fid },
          headers: { api_key: process.env.NEXT_PUBLIC_NEYNAR_API_KEY },
        });

        const user = neynarResponse.data.users[0];
        username = user?.username ?? custodyAddress.slice(0, 6) + '...' + custodyAddress.slice(-4);
      }

      setWalletState({
        userAddress: custodyAddress,
        username,
        isConnected: true,
        error: null,
      });

      toast.success('Connected to Farcaster!');
    } catch (err: any) {
      const errorMessage = err.message || 'Failed to connect to Farcaster';
      setWalletState({
        userAddress: null,
        username: null,
        isConnected: false,
        error: errorMessage,
      });
      toast.error(errorMessage);
    }
  };

  const connectEthereum = async () => {
    try {
      const connector = typeof window !== 'undefined' && window.ethereum ? injected() : undefined;
      if (!connector) {
        throw new Error('No Ethereum provider found');
      }
      const result = await connectAsync({ connector }); // Fixed syntax

      let username: string | null = null;
      try {
        const neynarResponse = await axios.get('https://api.neynar.com/v2/farcaster/user/custody-address', {
          params: { custody_address: result.accounts[0] },
          headers: { api_key: process.env.NEXT_PUBLIC_NEYNAR_API_KEY },
        });

        const user = neynarResponse.data.result?.user;
        username = user?.username ?? result.accounts[0].slice(0, 6) + '...' + result.accounts[0].slice(-4);
      } catch {
        username = result.accounts[0].slice(0, 6) + '...' + result.accounts[0].slice(-4);
      }

      setWalletState({
        userAddress: result.accounts[0],
        username,
        isConnected: true,
        error: null,
      });

      toast.success('Connected to Ethereum wallet!');
    } catch (err: any) {
      const errorMessage = err.message || 'Failed to connect wallet';
      setWalletState({
        userAddress: null,
        username: null,
        isConnected: false,
        error: errorMessage,
      });
      toast.error(errorMessage);
    }
  };

  const connectWallet = async () => {
    if (isFarcaster) {
      await connectFarcaster();
    } else {
      await connectEthereum();
    }
  };

  const disconnectWallet = () => {
    if (isFarcaster) {
      setWalletState({
        userAddress: null,
        username: null,
        isConnected: false,
        error: null,
      });
      toast.success('Disconnected from Farcaster.');
    } else {
      disconnect();
      setWalletState({
        userAddress: null,
        username: null,
        isConnected: false,
        error: null,
      });
      toast.success('Disconnected from wallet.');
    }
  };

  useEffect(() => {
    if (isFarcaster && isAuthenticated && profile) {
      connectFarcaster();
    }
  }, [isFarcaster, isAuthenticated, profile]);

  useEffect(() => {
    if (!isFarcaster && isEthConnected && address) {
      let username: string | null = address.slice(0, 6) + '...' + address.slice(-4);
      setWalletState({
        userAddress: address,
        username,
        isConnected: true,
        error: null,
      });

      axios
        .get('https://api.neynar.com/v2/farcaster/user/custody-address', {
          params: { custody_address: address },
          headers: { api_key: process.env.NEXT_PUBLIC_NEYNAR_API_KEY },
        })
        .then((response) => {
          const user = response.data.result?.user;
          username = user?.username ?? address.slice(0, 6) + '...' + address.slice(-4);
          setWalletState({
            userAddress: address,
            username,
            isConnected: true,
            error: null,
          });
        })
        .catch(() => {
          // Username already set to truncated address
        });
    }
  }, [isFarcaster, isEthConnected, address]);

  return { connectWallet, disconnectWallet };
}