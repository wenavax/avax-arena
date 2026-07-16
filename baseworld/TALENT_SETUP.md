# Talent.app Builder Score Setup

Pixel Atlas'ı **Talent Protocol Builder Rewards**'a (haftalık 2 ETH top 100 builder'a) eklemek için adım listesi. Ben kod tarafında her şeyi hazırladım, sen aşağıdaki manuel adımları yap.

## Önkoşul

- Deploy cüzdanı (PixelAtlas'ı deploy edecek EOA — şimdilik Base Sepolia, sonra mainnet)
- GitHub hesabı
- Farcaster hesabı (opsiyonel ama puana katkı yapar)

---

## 1. Basename al (deploy cüzdanı için)

Builder Score'un baz şartı: Basename.

1. [base.org/names](https://base.org/names) → cüzdanı bağla
2. Bir isim seç (örn. `pixelatlas.base.eth` ya da kendi handle'ın)
3. Mint ücreti birkaç dolar
4. **Bu cüzdan PixelAtlas deploy cüzdanı OLMALI** — Talent.app contract activity'yi deploy cüzdanına bağlar

> **Mainnet'te yap.** Sepolia'da Basename yok.

## 2. Talent.app profili oluştur

1. [talent.app/~/earn](https://talent.app/~/earn) → "Connect Wallet"
2. 1. adımdaki Basename'li cüzdanı bağla
3. Profil oluştur

## 3. GitHub bağla

Talent.app profil sayfası → "Connect GitHub" → repo erişimi onayla.

> Public repo contribution'larını skor için sayar. PixelAtlas repo'sunu da public yap (henüz değilse).

## 4. Verified Base smart contract activity

Bu en kritik adım. Deploy ettikten sonra:

1. Talent.app profil → "Verified Contracts" / "Add Contract"
2. **Mainnet'te deploy edilen PixelAtlas adresini** ekle
3. Aynı deploy cüzdanı bağlı olduğundan otomatik verify olur (ya da Basescan'de "creator" cüzdanını gösterirsen yeter)

Skor hesabı: PixelAtlas'taki **mint** ve **setPixelImage** tx sayısı haftalık olarak Builder Score'a katkı yapar. Daha çok kullanıcı = daha yüksek skor.

## 5. Farcaster bağla (puana ekstra)

Talent.app profil → "Connect Farcaster".

Eğer Farcaster Mini App'i de yayınlarsan (Faz 4 → Faz 5 arası eklemek istediğin), MiniApp reward'ları da skor hesabına girer.

## 6. ERC-8021 Builder Code claim

Bu son adım. Builder Code aktif olunca tüm tx'lerin Pixel Atlas'a atfedilir.

1. [base.dev](https://base.dev) → cüzdanı bağla
2. Settings → Builder Code → kopyala (örn. `bc_b7k3p9da`)
3. `baseworld/web/.env.production.local`'a ekle:
   ```
   NEXT_PUBLIC_BUILDER_CODE=bc_b7k3p9da
   ```
4. Yeniden deploy et — tüm mint + setPixelImage tx'leri attribution suffix ile gider
5. Talent.app: Settings → "Link Builder Code" → aynı code'u gir

---

## Beklenen skor faktörleri (PixelAtlas için)

| Faktör | Etki | Notlar |
|---|---|---|
| GitHub commits | orta | PixelAtlas repo + diğer aktif projeler |
| Mainnet contract activity | **yüksek** | Mint + setPixelImage tx'leri haftalık sayılır |
| Builder Code attribution | **yüksek** | Tüm Pixel Atlas tx'leri code'a tag'lenir |
| Farcaster MiniApp aktivite | bonus | Wrapper deploy edersen |
| Basename | giriş şartı | Olmadan claim yok |

## Tier hedefi

| Tier | Sıralama | Pool payı | Tahmini ETH/hafta |
|---|---|---|---|
| 1 | top 25 | 30% | ~0.024 ETH (~$60-90 ortalama) |
| 2 | 26-100 | 30% | ~0.008 ETH |
| 3 | 101-250 | 20% | ~0.0027 ETH |
| 4 | 251-500 | 20% | ~0.0016 ETH |

> Pixel Atlas mainnet launch'ında genelde Tier 3-4'ten başlar, ilk haftalarda kullanıcı çekerse Tier 1-2'ye çıkabilir.

## Kontrol noktaları

Setup tamam mı doğrulamak için:

- [ ] [talent.app/[your-basename]](https://talent.app/) profilim açılıyor
- [ ] Builder Score > 0
- [ ] PixelAtlas mainnet adresi profilde verified
- [ ] Builder Code env'e eklendi, `console.log(builderCodeEnabled)` true
- [ ] Bir mint tx attığında Basescan'de calldata sonunda `0x80218021...` suffix var

## Sonraki

- [ ] Mainnet'e deploy et (DEPLOY.md §4)
- [ ] Builder Code env'e ekle, redeploy
- [ ] Talent.app verify contract
- [ ] İlk haftalık ödül periyodunu bekle
- [ ] Tier sıralamasını takip et
