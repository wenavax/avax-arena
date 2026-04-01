const fs = require('fs');
const data = JSON.parse(fs.readFileSync('artifacts/build-info/solc-0_8_24-b7dc514ac3c63d012141081994299648163ba38c.json', 'utf-8'));
const solcInput = data.input;
const compilerVersion = 'v' + data.solcLongVersion;

const API_URL = 'https://api.routescan.io/v2/network/mainnet/evm/43114/etherscan/api';
const API_KEY = 'rs_6365ec81b665250e4d79a261';

const contracts = [
  ['FrostbiteAccountV2', 'contracts/FrostbiteAccountV2.sol:FrostbiteAccountV2', '0x0FE706D3D3B67e085d4f34Cb8bbA31869B93d752', ''],
  ['FrostbiteAccountV3', 'contracts/FrostbiteAccountV3.sol:FrostbiteAccountV3', '0x086C924593b25562d9ff44D10D03CA73b46A48eA', ''],
  ['IdentityRegistry', 'contracts/FrostbiteIdentityRegistry.sol:FrostbiteIdentityRegistry', '0x1D62EA442f0539e56917D55B548c4FB99265ea17', '000000000000000000000000000000006551c19487814612e58fe0681377575800000000000000000000000060d97cb53f0ccf12f74013493c6f41aa11ab00f9000000000000000000000000958d7b064224453bb5134279777e5d907b405de2'],
  ['ReputationRegistry', 'contracts/FrostbiteReputationRegistry.sol:FrostbiteReputationRegistry', '0x526bFF52aaF4aadA1CD766Ea407323296B5a6f76', ''],
  ['BatchMinter', 'contracts/BatchMinter.sol:BatchMinter', '0xDeB17b2d8318EB4bCA58a11Cf0287bA6a99FEfe4', '000000000000000000000000958d7b064224453bb5134279777e5d907b405de2'],
];

async function verify(name, contractname, addr, args) {
  const body = new URLSearchParams({
    apikey: API_KEY,
    module: 'contract',
    action: 'verifysourcecode',
    contractaddress: addr,
    sourceCode: JSON.stringify(solcInput),
    codeformat: 'solidity-standard-json-input',
    contractname: contractname,
    compilerversion: compilerVersion,
    constructorArguements: args,
  });
  const res = await fetch(API_URL, { method: 'POST', body });
  const d = await res.json();
  console.log(name + ': status=' + d.status + ' result=' + (d.result || d.message));
  return d.result;
}

async function checkStatus(name, guid) {
  const res = await fetch(API_URL + '?apikey=' + API_KEY + '&module=contract&action=checkverifystatus&guid=' + guid);
  const d = await res.json();
  console.log(name + ': ' + d.result);
}

(async () => {
  console.log('Compiler:', compilerVersion);
  console.log('Submitting', contracts.length, 'contracts...\n');

  const guids = [];
  for (const [name, cn, addr, args] of contracts) {
    const guid = await verify(name, cn, addr, args);
    guids.push([name, guid]);
    await new Promise(r => setTimeout(r, 5000));
  }

  console.log('\nWaiting 90s for verification...');
  await new Promise(r => setTimeout(r, 90000));

  console.log('\nResults:');
  for (const [name, guid] of guids) {
    if (!guid || guid.includes('Error')) {
      console.log(name + ': SUBMIT FAILED');
      continue;
    }
    await checkStatus(name, guid);
    await new Promise(r => setTimeout(r, 1000));
  }
})();
