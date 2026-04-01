const fs = require('fs');
const data = JSON.parse(fs.readFileSync('artifacts/build-info/solc-0_8_24-b7dc514ac3c63d012141081994299648163ba38c.json', 'utf-8'));
const solcInput = data.input;
const compilerVersion = 'v' + data.solcLongVersion;

const API_URL = 'https://api.routescan.io/v2/network/mainnet/evm/43114/etherscan/api';
const API_KEY = 'rs_6365ec81b665250e4d79a261';

// Only the 4 unverified contracts
const contracts = [
  { name: 'BatchMinter', cn: 'contracts/BatchMinter.sol:BatchMinter', addr: '0xDeB17b2d8318EB4bCA58a11Cf0287bA6a99FEfe4', args: '000000000000000000000000958d7b064224453bb5134279777e5d907b405de2' },
  { name: 'IdentityRegistry', cn: 'contracts/FrostbiteIdentityRegistry.sol:FrostbiteIdentityRegistry', addr: '0x1D62EA442f0539e56917D55B548c4FB99265ea17', args: '000000000000000000000000000000006551c19487814612e58fe0681377575800000000000000000000000060d97cb53f0ccf12f74013493c6f41aa11ab00f9000000000000000000000000958d7b064224453bb5134279777e5d907b405de2' },
  // Proxies need ERC1967 proxy verification - different approach
  { name: 'BattleEngineProxy', cn: 'contracts/BattleEngineProxy.sol:BattleEngineProxy', addr: '0x6f636ea5D2b8c2909baDb32491e7df47F7bd1B42', args: '000000000000000000000000617fd0b23c35b4ba7fcf76c47f919ddd9a506f620000000000000000000000000000000000000000000000000000000000000040000000000000000000000000000000000000000000000000000000000000000000' },
  { name: 'TeamBattleProxy', cn: 'contracts/TeamBattleEngineProxy.sol:TeamBattleEngineProxy', addr: '0xdE330aaBB3DF6D127431e244302c44cD486f2c34', args: '000000000000000000000000522d57c8b594ddd56ab8660e77fa9e0ba7548c270000000000000000000000000000000000000000000000000000000000000040000000000000000000000000000000000000000000000000000000000000000000' },
];

async function submit(c) {
  const body = new URLSearchParams({
    apikey: API_KEY,
    module: 'contract',
    action: 'verifysourcecode',
    contractaddress: c.addr,
    sourceCode: JSON.stringify(solcInput),
    codeformat: 'solidity-standard-json-input',
    contractname: c.cn,
    compilerversion: compilerVersion,
    constructorArguements: c.args,
  });
  const res = await fetch(API_URL, { method: 'POST', body });
  const d = await res.json();
  return d.result;
}

async function check(guid) {
  const res = await fetch(API_URL + '?apikey=' + API_KEY + '&module=contract&action=checkverifystatus&guid=' + guid);
  const d = await res.json();
  return d.result;
}

(async () => {
  console.log('Compiler:', compilerVersion);
  console.log('Submitting 4 unverified contracts...\n');

  const guids = [];
  for (const c of contracts) {
    const guid = await submit(c);
    console.log(c.name + ': guid=' + guid);
    guids.push([c.name, guid]);
    await new Promise(r => setTimeout(r, 5000));
  }

  // Poll
  for (let attempt = 0; attempt < 15; attempt++) {
    console.log('\nWaiting 30s... (attempt ' + (attempt + 1) + '/15)');
    await new Promise(r => setTimeout(r, 30000));

    let allDone = true;
    for (const [name, guid] of guids) {
      if (guid && guid.includes('-')) {
        const result = await check(guid);
        const done = result.includes('Pass') || result.includes('Fail') || result.includes('Already');
        if (!done) allDone = false;
        console.log(name + ': ' + result);
      } else {
        console.log(name + ': submit failed (' + guid + ')');
      }
      await new Promise(r => setTimeout(r, 500));
    }
    if (allDone) break;
  }

  // Final check
  console.log('\n=== FINAL ===');
  for (const c of contracts) {
    const res = await fetch(API_URL + '?module=contract&action=getabi&address=' + c.addr + '&apikey=' + API_KEY);
    const d = await res.json();
    console.log((d.status === '1' ? 'VERIFIED' : 'NOT VERIFIED') + ' ' + c.name);
    await new Promise(r => setTimeout(r, 500));
  }
})();
