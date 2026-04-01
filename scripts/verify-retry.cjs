const fs = require('fs');

const buildInfo = JSON.parse(fs.readFileSync('artifacts/build-info/solc-0_8_24-b7dc514ac3c63d012141081994299648163ba38c.json', 'utf-8'));
const solcInput = buildInfo.input;
const compilerVersion = 'v' + buildInfo.solcLongVersion;

const API_URL = 'https://api.routescan.io/v2/network/mainnet/evm/43114/etherscan/api';
const API_KEY = 'rs_6365ec81b665250e4d79a261';

const contracts = [
  { name: 'FrostbiteAccountV2', cn: 'contracts/FrostbiteAccountV2.sol:FrostbiteAccountV2', addr: '0x0FE706D3D3B67e085d4f34Cb8bbA31869B93d752', args: '' },
  { name: 'FrostbiteAccountV3', cn: 'contracts/FrostbiteAccountV3.sol:FrostbiteAccountV3', addr: '0x086C924593b25562d9ff44D10D03CA73b46A48eA', args: '' },
  { name: 'IdentityRegistry', cn: 'contracts/FrostbiteIdentityRegistry.sol:FrostbiteIdentityRegistry', addr: '0x1D62EA442f0539e56917D55B548c4FB99265ea17', args: '000000000000000000000000000000006551c19487814612e58fe0681377575800000000000000000000000060d97cb53f0ccf12f74013493c6f41aa11ab00f9000000000000000000000000958d7b064224453bb5134279777e5d907b405de2' },
  { name: 'ReputationRegistry', cn: 'contracts/FrostbiteReputationRegistry.sol:FrostbiteReputationRegistry', addr: '0x526bFF52aaF4aadA1CD766Ea407323296B5a6f76', args: '' },
  { name: 'BatchMinter', cn: 'contracts/BatchMinter.sol:BatchMinter', addr: '0xDeB17b2d8318EB4bCA58a11Cf0287bA6a99FEfe4', args: '000000000000000000000000958d7b064224453bb5134279777e5d907b405de2' },
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
  console.log('Submitting...\n');

  const guids = [];
  for (const c of contracts) {
    const guid = await submit(c);
    console.log(c.name + ': guid=' + guid);
    guids.push([c.name, guid]);
    await new Promise(r => setTimeout(r, 3000));
  }

  // Poll every 30s for 5 minutes
  for (let attempt = 0; attempt < 10; attempt++) {
    console.log('\nWaiting 30s... (attempt ' + (attempt + 1) + '/10)');
    await new Promise(r => setTimeout(r, 30000));

    let allDone = true;
    for (const [name, guid] of guids) {
      if (guid && guid.includes('-')) {
        const result = await check(guid);
        const done = result.includes('Pass') || result.includes('Fail') || result.includes('Already');
        if (!done) allDone = false;
        console.log(name + ': ' + result);
      }
      await new Promise(r => setTimeout(r, 500));
    }
    if (allDone) break;
  }

  // Final check via getabi
  console.log('\n=== FINAL STATUS ===');
  for (const c of contracts) {
    const res = await fetch(API_URL + '?module=contract&action=getabi&address=' + c.addr + '&apikey=' + API_KEY);
    const d = await res.json();
    console.log((d.status === '1' ? 'VERIFIED' : 'NOT VERIFIED') + ' ' + c.name);
    await new Promise(r => setTimeout(r, 500));
  }
})();
