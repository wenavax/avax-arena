# CAR(D) GAME — MatchEscrow P2/P3 (real AVAX escrow) plan

> 2026-07-07. Kullanıcı: "cüzdanlardan AVAX isteyelim, kontrat yazalım, auditleyelim, dağıtım+fee".
> Girdi: `cardgame/contracts/MatchEscrow.sol` (starter), `cardgame/ARCHITECTURE.md` §1-8.

## Ekonomi (tasarım dokümanından, sabit)
Giriş 1 AVAX × 4 = **4 AVAX havuz** → platform fee **0.2**, ödüller **2.0 / 1.0 / 0.5 / 0.3** (1.–4.). Toplam 3.8 + 0.2 = 4.0. NFT yok, token yok — zincir yalnızca giriş + dağıtım.

## Starter'ın düzeltilecek kusurları
1. **PUSH payment** (`settle`/`refund` içinde `.call` döngüsü) → kötü niyetli kontrat-oyuncu `receive`'de revert ederek tüm maçı kilitler. **→ pull-payment** (`pendingPayouts` + `withdrawPayout`, repo konvansiyonu).
2. **Ham `ecrecover`** (s-malleability + `address(0)` dönüşü). **→ OZ ECDSA + MessageHashUtils**.
3. **Rol yok**: owner hem admin hem her maçı açan sıcak anahtar. **→ Ownable2Step owner (Safe) + `authorized` operatör (sunucu) createMatch için**.
4. Pausable/ReentrancyGuard yok. **→ eklendi** (createMatch/join durur; refund/withdraw ASLA durmaz — kaçış kapısı).

## Sağlamlaştırılmış tasarım
- **Roller**: `Ownable2Step` owner=Safe (setSigner/setTreasury/setPayoutConfig/pause/setAuthorized; renounce kapalı). `authorized[server]` → createMatch. `trustedSigner` → sonuç imzalar (HSM/ayrı olabilir). settle **PERMISSIONLESS** (imzalı sonucu kim gönderirse — canlılık).
- **entryFee immutable** (Fuji'de küçük, mainnet 1 AVAX). PLAYERS=4 sabit.
- **Dağıtım+fee owner-ayarlı ama SIKI değişmez**: `setPayoutConfig(fee, uint256[4] rewards)` → `require(fee + Σrewards == PLAYERS*entryFee)`. Yani havuz her zaman tam dağıtılır, ne eksik ne fazla.
- **İmza**: `keccak256(abi.encode(matchId, ranking, address(this), chainid))` → EthSignedMessage → OZ ECDSA.recover == trustedSigner. address+chainid bağlı (deploy/chain replay engellenir); matchId tek-atımlık (status makinesi replay engeller).
- **Muhasebe değişmezi**: `balance == escrowed + totalPending`. join: escrowed+=fee. settle: escrowed-=pool, totalPending+=pool (config değişmezi gereği fee+Σrewards==pool). refund: escrowed-=fee, totalPending+=fee. withdraw: totalPending-=amt.
- **Refund**: deadline sonrası herkes `refund(matchId)` çağırır → ilk çağrı status=CANCELLED, herkes kendi girişini pendingPayouts'a çeker. Owner `cancelMatch` ile deadline öncesi zorla iptal edebilir (sunucu çökerse).
- Status: NONE→OPEN→LOCKED→SETTLED | CANCELLED.

## Adımlar
1. `cardgame/contracts/` → Foundry projesi (launchpad/adventures şablonu). `src/MatchEscrow.sol` sağlamlaştırılmış.
2. Test bataryası (paralel): unit + fuzz + invariant + adversarial (kötü-alıcı, imza replay/malleability, refund yarışı) + fork.
3. Çok-ajanlı adversarial audit → `cardgame/contracts/AUDIT.md`.
4. Fuji deploy + `frontend/scripts/matchescrow-rehearsal-fuji.ts` (ethers imzalı gerçek yaşam döngüsü: create→join×4→settle→withdraw, kötü-alıcı testi, refund yolu).
5. Sunucu imza modülü `server/cardgame-signer.mjs` (ranking imzalama, ethers) — UI'ye create/join/settle bağlama P3.

## Mainnet kapısı (user-gated)
Owner→Safe, signer anahtar yönetimi (HSM/KMS), harici audit (ARCHITECTURE §7 "audit'i atlama"), regülasyon (skill-vs-chance danışmanlık, §8), UI cüzdan akışı. Fuji'de "SIMULATED" → gerçek testnet escrow.
