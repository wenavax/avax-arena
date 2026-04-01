/**
 * ERC-6551 Token Bound Account utilities for Frostbite Warriors.
 *
 * Each warrior NFT can have its own smart contract wallet (TBA).
 * The TBA is controlled by whoever owns the warrior.
 */

import { type Address, type Hex, encodeFunctionData, formatEther } from 'viem';
import { CONTRACT_ADDRESSES, AVALANCHE_CHAIN_ID } from './constants';
import { ERC6551_REGISTRY_ABI, FROSTBITE_ACCOUNT_ABI } from './contracts';

const ZERO_SALT = '0x0000000000000000000000000000000000000000000000000000000000000000' as Hex;

/**
 * Get the deterministic TBA address for a warrior (no RPC call needed if using Registry view).
 */
export async function getWarriorTBAAddress(
  publicClient: { readContract: (args: any) => Promise<any> },
  tokenId: number
): Promise<Address> {
  const address = await publicClient.readContract({
    address: CONTRACT_ADDRESSES.erc6551Registry as Address,
    abi: ERC6551_REGISTRY_ABI,
    functionName: 'account',
    args: [
      CONTRACT_ADDRESSES.frostbiteAccount as Address,
      ZERO_SALT,
      BigInt(AVALANCHE_CHAIN_ID),
      CONTRACT_ADDRESSES.frostbiteWarrior as Address,
      BigInt(tokenId),
    ],
  });
  return address as Address;
}

/**
 * Check if a warrior's TBA is deployed.
 */
export async function isAccountDeployed(
  publicClient: { getCode: (args: any) => Promise<any> },
  tbaAddress: Address
): Promise<boolean> {
  const code = await publicClient.getCode({ address: tbaAddress });
  return !!code && code !== '0x';
}

/**
 * Get AVAX balance of a warrior's TBA.
 */
export async function getAccountBalance(
  publicClient: { getBalance: (args: any) => Promise<bigint> },
  tbaAddress: Address
): Promise<{ raw: bigint; formatted: string }> {
  const raw = await publicClient.getBalance({ address: tbaAddress });
  return { raw, formatted: formatEther(raw) };
}

/**
 * Prepare createAccount transaction data.
 */
export function createAccountTxData(tokenId: number) {
  return {
    address: CONTRACT_ADDRESSES.erc6551Registry as Address,
    abi: ERC6551_REGISTRY_ABI,
    functionName: 'createAccount' as const,
    args: [
      CONTRACT_ADDRESSES.frostbiteAccount as Address,
      ZERO_SALT,
      BigInt(AVALANCHE_CHAIN_ID),
      CONTRACT_ADDRESSES.frostbiteWarrior as Address,
      BigInt(tokenId),
    ],
  };
}

/**
 * Prepare execute transaction data for TBA.
 */
export function executeTxData(tbaAddress: Address, to: Address, value: bigint, data: Hex = '0x') {
  return {
    address: tbaAddress,
    abi: FROSTBITE_ACCOUNT_ABI,
    functionName: 'execute' as const,
    args: [to, value, data, 0], // operation 0 = CALL
  };
}

/**
 * Prepare AVAX send from TBA.
 */
export function sendAvaxFromTBA(tbaAddress: Address, to: Address, amount: bigint) {
  return executeTxData(tbaAddress, to, amount, '0x' as Hex);
}

/**
 * Batch fetch TBA info for multiple warriors.
 */
export async function batchGetTBAInfo(
  publicClient: { readContract: (args: any) => Promise<any>; getCode: (args: any) => Promise<any>; getBalance: (args: any) => Promise<bigint> },
  tokenIds: number[]
): Promise<Array<{
  tokenId: number;
  tbaAddress: Address;
  deployed: boolean;
  balance: string;
}>> {
  const results = [];
  for (const tokenId of tokenIds) {
    try {
      const tbaAddress = await getWarriorTBAAddress(publicClient, tokenId);
      const deployed = await isAccountDeployed(publicClient, tbaAddress);
      const balance = deployed
        ? (await getAccountBalance(publicClient, tbaAddress)).formatted
        : '0';
      results.push({ tokenId, tbaAddress, deployed, balance });
    } catch {
      results.push({
        tokenId,
        tbaAddress: '0x0000000000000000000000000000000000000000' as Address,
        deployed: false,
        balance: '0',
      });
    }
  }
  return results;
}
