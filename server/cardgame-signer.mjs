/**
 * CAR(D) GAME — sonuç imzalayıcı (trustedSigner sunucu tarafı).
 *
 * Maç bittiğinde nihai sıralamayı MatchEscrow'un beklediği digest üzerinden
 * imzalar. Kontrat digesti:
 *   inner = keccak256(abi.encode(bytes32 matchId, address[4] ranking, address escrow, uint256 chainid))
 *   signed = toEthSignedMessageHash(inner)          // EIP-191 personal_sign
 * ethers `signMessage(getBytes(inner))` tam bu signed hash'i üretir; kontrat
 * OZ ECDSA.recover ile trustedSigner'a eşitler.
 *
 * Güven modeli: bu anahtar SADECE sonuç imzalar (para hareket ettirmez — settle
 * permissionless, ödemeler pull). Sızarsa saldırgan sahte sıralama imzalayıp
 * ödülü yeniden dağıtabilir AMA yalnızca gerçekten kilitli maçlarda ve havuzu
 * ASLA aşamaz (fee+Σrewards==pool değişmezi). Yine de HSM/KMS önerilir (mainnet).
 *
 * Kullanım (kütüphane): import { signRanking, buildInnerDigest } from './cardgame-signer.mjs'
 * CLI test: node server/cardgame-signer.mjs <matchId> <escrow> <chainId> <p1> <p2> <p3> <p4>
 *           (PRIVATE_KEY env'inden imzalar, 0x-imza basar)
 */
import { ethers } from 'ethers';

/** Kontratla birebir aynı iç digest (imzalanmadan önceki keccak). */
export function buildInnerDigest(matchId, ranking, escrowAddress, chainId) {
  return ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ['bytes32', 'address[4]', 'address', 'uint256'],
      [matchId, ranking, escrowAddress, BigInt(chainId)]
    )
  );
}

/** Nihai sıralamayı imzala → 65-baytlık 0x-imza (settle'a geçilir). */
export async function signRanking(signer, { matchId, ranking, escrowAddress, chainId }) {
  if (!Array.isArray(ranking) || ranking.length !== 4) throw new Error('ranking must be address[4]');
  const inner = buildInnerDigest(matchId, ranking, escrowAddress, chainId);
  // signMessage(bytes) = toEthSignedMessageHash(inner) üzerinde imza — kontratla eşleşir
  return signer.signMessage(ethers.getBytes(inner));
}

/** Deterministik matchId üretici (oda + oyuncular + zaman). */
export function matchIdFrom(room, players, ts) {
  return ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ['string', 'address[4]', 'uint256'],
      [room, players, BigInt(ts)]
    )
  );
}

// ── CLI ──
const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const [, , matchId, escrow, chainId, p1, p2, p3, p4] = process.argv;
  const pk = process.env.PRIVATE_KEY;
  if (!pk || !matchId || !escrow || !chainId || !p4) {
    console.error('kullanım: PRIVATE_KEY=... node server/cardgame-signer.mjs <matchId> <escrow> <chainId> <p1> <p2> <p3> <p4>');
    process.exit(1);
  }
  const signer = new ethers.Wallet(pk.startsWith('0x') ? pk : `0x${pk}`);
  const ranking = [p1, p2, p3, p4];
  const sig = await signRanking(signer, { matchId, ranking, escrowAddress: escrow, chainId });
  console.log('signer :', signer.address);
  console.log('inner  :', buildInnerDigest(matchId, ranking, escrow, chainId));
  console.log('sig    :', sig);
}
