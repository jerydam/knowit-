import { getDataSuffix, submitReferral } from '@divvi/referral-sdk';
import { createWalletClient, custom, http } from 'viem';
import { celo, celoAlfajores } from 'viem/chains';
import { ethers } from 'ethers';
import type { WalletClient } from 'viem';

export interface DivviConfig {
  consumer: `0x${string}`;
  providers: `0x${string}`[];
}

const divviConfig: DivviConfig = {
  consumer: '0xFb7E31f9a59FA2722E1Bc0D2D83449B113Ee7a24',
  providers: [
    '0x0423189886d7966f0dd7e7d256898daeee625dca',
    '0xc95876688026be9d6fa7a7c33328bd013effa2bb',
    '0x5f0a55fad9424ac99429f635dfb9bf20c3360ab8',
  ],
};

export function getDivviDataSuffix(): string {
  return getDataSuffix(divviConfig);
}

export async function submitDivviReferral(txHash: `0x${string}`, chainId: number): Promise<void> {
  try {
    await submitReferral({ txHash, chainId });
    console.log(`Divvi referral submitted for tx: ${txHash}`);
  } catch (error: any) {
    console.error(`Failed to submit Divvi referral: ${error.message}`);
    throw new Error(`Divvi referral submission failed: ${error.message}`);
  }
}

export async function sendTransactionWithDivvi(
  contract: ethers.Contract,
  functionName: string,
  args: any[],
  walletClient: WalletClient,
  provider: ethers.BrowserProvider | ethers.JsonRpcProvider
): Promise<`0x${string}`> {
  try {
    // Get the current network from provider
    const network = await provider.getNetwork();
    const currentChainId = Number(network.chainId);
    
    // Determine which chain to use based on current network
    const targetChain = currentChainId === 44787 ? celoAlfajores : celo;
    
    // Get accounts from the wallet client
    const accounts = await walletClient.getAddresses();
    if (!accounts || accounts.length === 0) {
      throw new Error('No accounts found in wallet');
    }
    const fromAddress = accounts[0];

    // Encode function data
    const functionData = contract.interface.encodeFunctionData(functionName, args);

    // Append Divvi data suffix
    const dataSuffix = getDivviDataSuffix();
    const data = functionData + (dataSuffix.startsWith('0x') ? dataSuffix.slice(2) : dataSuffix);

    // Estimate gas using the contract's function call
    const gasEstimate = await contract[functionName].estimateGas(...args);

    // Prepare transaction
    const tx = {
      account: fromAddress,
      to: contract.target as `0x${string}`, // Use contract.target instead of contract.address
      data: data as `0x${string}`,
      gas: (BigInt(gasEstimate.toString()) * BigInt(120)) / BigInt(100), // 20% buffer
      chain: targetChain,
    };

    // Sign and send transaction
    const txHash = await walletClient.sendTransaction(tx);

    // Wait for transaction confirmation
    const receipt = await provider.waitForTransaction(txHash);

    if (!receipt) {
      throw new Error('Transaction failed to confirm');
    }

    // Submit Divvi referral
    await submitDivviReferral(txHash, currentChainId);

    return txHash;
  } catch (error: any) {
    console.error(`Transaction failed: ${error.message}`);
    throw new Error(`Failed to send transaction: ${error.message}`);
  }
}
