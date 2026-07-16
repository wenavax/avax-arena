// ─── World NFT Contract Addresses & ABIs ───

export const HERO_CONTRACT = '0x8b43A80A8EeBC2bf27EAa934B870AF1742f1e523' as const;
export const ITEM_CONTRACT = '0xA121AD68f54347215C67AD9A254c8dbBD653d5e6' as const;
export const AVALANCHE_CHAIN_ID = 43114;

export const HERO_ABI = [
  {
    inputs: [{ name: 'element', type: 'uint8' }, { name: 'quantity', type: 'uint256' }],
    name: 'mint',
    outputs: [],
    stateMutability: 'payable',
    type: 'function',
  },
  {
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    name: 'getHero',
    outputs: [{
      components: [
        { name: 'element', type: 'uint8' },
        { name: 'rarity', type: 'uint8' },
        { name: 'level', type: 'uint16' },
        { name: 'xp', type: 'uint32' },
        { name: 'atk', type: 'uint16' },
        { name: 'def', type: 'uint16' },
        { name: 'spd', type: 'uint16' },
        { name: 'baseAtk', type: 'uint16' },
        { name: 'baseDef', type: 'uint16' },
        { name: 'baseSpd', type: 'uint16' },
      ],
      name: '',
      type: 'tuple',
    }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'totalSupply',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'tokenId', type: 'uint256' }, { name: 'statChoice', type: 'uint8' }],
    name: 'levelUp',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ name: 'owner', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    name: 'ownerOf',
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

export const ITEM_ABI = [
  {
    inputs: [{ name: 'category', type: 'uint8' }, { name: 'element', type: 'uint8' }, { name: 'quantity', type: 'uint256' }],
    name: 'mint',
    outputs: [],
    stateMutability: 'payable',
    type: 'function',
  },
  {
    inputs: [{ name: 'tokenId1', type: 'uint256' }, { name: 'tokenId2', type: 'uint256' }],
    name: 'upgrade',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    name: 'getItem',
    outputs: [{
      components: [
        { name: 'category', type: 'uint8' },
        { name: 'element', type: 'uint8' },
        { name: 'rarity', type: 'uint8' },
        { name: 'atk', type: 'uint16' },
        { name: 'def', type: 'uint16' },
        { name: 'spd', type: 'uint16' },
      ],
      name: '',
      type: 'tuple',
    }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'category', type: 'uint8' }],
    name: 'getCategorySupply',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'nextTokenId',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'accounts', type: 'address[]' }, { name: 'ids', type: 'uint256[]' }],
    name: 'balanceOfBatch',
    outputs: [{ name: '', type: 'uint256[]' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

export const MINT_PRICE_HERO = '1'; // 1 AVAX
export const MINT_PRICE_ITEM = '0.2'; // 0.2 AVAX
