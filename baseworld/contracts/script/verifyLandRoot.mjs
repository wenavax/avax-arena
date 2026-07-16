/**
 * verifyLandRoot.mjs
 *
 * `/admin/derive` sayfasından indirilen landRoot-*.json dosyasını oku, içeriği
 * doğrula (JS-side root'u tekrar hesapla) ve forge SetLandRoot.s.sol için
 * gerekli env değerlerini yazdır.
 *
 * Kullanım:
 *   node script/verifyLandRoot.mjs ../web/path/to/landRoot-0.55.json
 */
import {readFile} from "node:fs/promises";

const file = process.argv[2];
if (!file) {
  console.error("usage: node script/verifyLandRoot.mjs <landRoot.json>");
  process.exit(1);
}

const snap = JSON.parse(await readFile(file, "utf8"));
if (snap.version !== 1) {
  console.error(`unknown snapshot version: ${snap.version}`);
  process.exit(1);
}

const {SimpleMerkleTree} = await import("../../web/node_modules/@openzeppelin/merkle-tree/dist/index.js");
const {keccak256, zeroPadValue, toBeHex} = await import("../../web/node_modules/ethers/lib.esm/index.js");

const leafFor = (id) => keccak256(zeroPadValue(toBeHex(BigInt(id)), 32));
const tree = SimpleMerkleTree.of(snap.ids.map(leafFor));
const recomputed = tree.root;

console.log("file:        ", file);
console.log("edgeT:       ", snap.edgeT);
console.log("ids count:   ", snap.ids.length);
console.log("stored root: ", snap.root);
console.log("recomputed:  ", recomputed);
console.log("match:       ", recomputed === snap.root ? "OK ✓" : "MISMATCH ✗");

if (recomputed !== snap.root) process.exit(2);

console.log("\n--- contracts/.env ---");
console.log(`LAND_ROOT=${snap.root}`);
console.log("\n--- next step ---");
console.log("  forge script script/SetLandRoot.s.sol --rpc-url $BASE_SEPOLIA_RPC_URL --broadcast \\");
console.log("    --sig 'run()' -vvv");
