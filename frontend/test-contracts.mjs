import { createPublicClient, http, formatEther } from 'viem';
import { avalancheFuji } from 'viem/chains';

const RPC_URL = 'https://api.avax-test.network/ext/bc/C/rpc';

const client = createPublicClient({
  chain: avalancheFuji,
  transport: http(RPC_URL),
});

const CONTRACTS = {
  FrostbiteWarrior:  '0xcB28E9e6C273db63a41165947193BfA555d3f625',
  BattleEngine:  '0xe10d1c675612615d74AA733C5F0c7ED6b2255ACA',
  AgentChat:     '0x764167De119177d080DBc37261E293C1fC854E3D',
  AgentRegistry: '0xc5a5464FB139117E784A07Ef50Fae6eef27849D9',
  FrostbiteToken:    '0x6eaEfDB412a308B794EEe99db6b55BF8dda1E75f',
  Leaderboard:   '0x68EC58f4bEce61b97151aaeC26aeE5b922319931',
  RewardVault:   '0xF5b921313b9A5482069dB364469C215815F24eAc',
};

async function test() {
  console.log('=== Frostbite Contract Tests (Fuji Testnet) ===\n');

  // 1. RPC connection
  try {
    const blockNumber = await client.getBlockNumber();
    console.log('✅ RPC Bağlantısı OK — Block #' + blockNumber.toString());
  } catch (e) {
    console.log('❌ RPC Bağlantısı BAŞARISIZ:', e.message);
    return;
  }

  // 2. Bytecode check — kontratlar deploy edilmiş mi?
  console.log('\n--- Kontrat Deploy Kontrolü ---');
  for (const [name, addr] of Object.entries(CONTRACTS)) {
    try {
      const code = await client.getCode({ address: addr });
      const hasCode = code && code !== '0x' && code.length > 2;
      if (hasCode) {
        console.log(`✅ ${name} — Deploy edilmiş (${(code.length - 2) / 2} bytes)`);
      } else {
        console.log(`❌ ${name} — Adreste kod YOK`);
      }
    } catch (e) {
      console.log(`❌ ${name} — Hata: ${e.message.slice(0, 80)}`);
    }
  }

  // 3. FrostbiteWarrior
  console.log('\n--- FrostbiteWarrior ---');
  try {
    const totalSupply = await client.readContract({
      address: CONTRACTS.FrostbiteWarrior,
      abi: [{ name: 'totalSupply', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] }],
      functionName: 'totalSupply',
    });
    console.log('✅ totalSupply():', totalSupply.toString(), 'warrior mint edilmiş');
  } catch (e) {
    console.log('❌ totalSupply():', e.shortMessage || e.message.slice(0, 120));
  }

  // 4. BattleEngine
  console.log('\n--- BattleEngine ---');
  try {
    const battleCount = await client.readContract({
      address: CONTRACTS.BattleEngine,
      abi: [{ name: 'battleCounter', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] }],
      functionName: 'battleCounter',
    });
    console.log('✅ battleCounter():', battleCount.toString(), 'toplam savaş');
  } catch (e) {
    console.log('❌ battleCounter():', e.shortMessage || e.message.slice(0, 120));
  }

  try {
    const openBattles = await client.readContract({
      address: CONTRACTS.BattleEngine,
      abi: [{ name: 'getOpenBattles', type: 'function', stateMutability: 'view', inputs: [{ type: 'uint256' }, { type: 'uint256' }], outputs: [{ type: 'uint256[]' }] }],
      functionName: 'getOpenBattles',
      args: [0n, 10n],
    });
    const nonZero = openBattles.filter(b => b > 0n);
    console.log('✅ getOpenBattles():', nonZero.length, 'açık savaş');
  } catch (e) {
    console.log('❌ getOpenBattles():', e.shortMessage || e.message.slice(0, 120));
  }

  // If there are battles, try to read the first one
  try {
    const battleCount = await client.readContract({
      address: CONTRACTS.BattleEngine,
      abi: [{ name: 'battleCounter', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] }],
      functionName: 'battleCounter',
    });

    if (battleCount > 0n) {
      const battle = await client.readContract({
        address: CONTRACTS.BattleEngine,
        abi: [{
          name: 'getBattle', type: 'function', stateMutability: 'view',
          inputs: [{ type: 'uint256' }],
          outputs: [{ type: 'uint256' }, { type: 'address' }, { type: 'address' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'address' }, { type: 'uint8' }, { type: 'uint256' }, { type: 'uint256' }]
        }],
        functionName: 'getBattle',
        args: [1n],
      });
      console.log('✅ getBattle(1):', {
        player1: battle[1],
        player2: battle[2],
        nft1: battle[3].toString(),
        nft2: battle[4].toString(),
        stake: formatEther(battle[5]),
        winner: battle[6],
        status: battle[7],
      });
    }
  } catch (e) {
    console.log('⚠️  getBattle(1):', e.shortMessage || e.message.slice(0, 120));
  }

  // 5. AgentChat
  console.log('\n--- AgentChat ---');
  try {
    const threadCount = await client.readContract({
      address: CONTRACTS.AgentChat,
      abi: [{ name: 'getThreadCount', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] }],
      functionName: 'getThreadCount',
    });
    console.log('✅ getThreadCount():', threadCount.toString(), 'thread');
  } catch (e) {
    console.log('❌ getThreadCount():', e.shortMessage || e.message.slice(0, 120));
  }

  // 6. FrostbiteToken
  console.log('\n--- FrostbiteToken ---');
  try {
    const symbol = await client.readContract({
      address: CONTRACTS.FrostbiteToken,
      abi: [{ name: 'symbol', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'string' }] }],
      functionName: 'symbol',
    });
    const supply = await client.readContract({
      address: CONTRACTS.FrostbiteToken,
      abi: [{ name: 'totalSupply', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] }],
      functionName: 'totalSupply',
    });
    console.log('✅ symbol():', symbol, '| totalSupply():', formatEther(supply));
  } catch (e) {
    console.log('❌ FrostbiteToken:', e.shortMessage || e.message.slice(0, 120));
  }

  // 7. AgentRegistry
  console.log('\n--- AgentRegistry ---');
  try {
    // Try a simple read call
    const isAuth = await client.readContract({
      address: CONTRACTS.AgentRegistry,
      abi: [{
        name: 'isAgentAuthorized', type: 'function', stateMutability: 'view',
        inputs: [{ type: 'address' }],
        outputs: [{ type: 'bool' }]
      }],
      functionName: 'isAgentAuthorized',
      args: ['0x0000000000000000000000000000000000000001'],
    });
    console.log('✅ isAgentAuthorized(0x..01):', isAuth);
  } catch (e) {
    console.log('❌ isAgentAuthorized():', e.shortMessage || e.message.slice(0, 120));
  }

  console.log('\n=== Test Tamamlandı ===');
}

test().catch(e => console.error('Fatal:', e.message));
