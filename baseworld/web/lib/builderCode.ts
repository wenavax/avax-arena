/**
 * ERC-8021 Builder Code dataSuffix entegrasyonu.
 *
 * Base.dev'den alacağımız Builder Code'u tx calldata'sının sonuna ekler.
 * Akıllı kontratlar fazla calldata'yı yok sayar (spec gereği), suffix
 * execution'a etki etmez ama zincir-genelinde attribution sağlar →
 * Base ekosistem ödüllerine (Talent Builder Score) Pixel Atlas üzerinden
 * geçen tx'ler katkıda bulunur.
 *
 * Aktivasyon:
 *   1. base.dev → Settings → Builder Code → ID'yi kopyala (bc_xxxxxxxx)
 *   2. web/.env.local'a: NEXT_PUBLIC_BUILDER_CODE=bc_xxxxxxxx
 *   3. Yeniden başlat — tüm mint + setPixelImage tx'leri suffix ile gider
 *
 * Referans:
 *   - ERC-8021 spec: https://github.com/base/builder-codes
 *   - ox library: import {Attribution} from "ox/Erc8021"
 */
import {Attribution} from "ox/erc8021";

const RAW_CODE = process.env.NEXT_PUBLIC_BUILDER_CODE?.trim() ?? "";

/** Builder code yapılandırıldı mı? */
export const builderCodeEnabled = RAW_CODE.length > 0;

/** Hesaplanmış data suffix (hex string, "0x..." prefixli). Boşsa "" döner. */
export const DATA_SUFFIX: string = builderCodeEnabled
  ? Attribution.toDataSuffix({codes: [RAW_CODE]})
  : "";

/**
 * Calldata'nın sonuna ERC-8021 suffix ekler.
 * Builder code set değilse data'yı olduğu gibi döndürür.
 */
export function withBuilderSuffix(data: string): string {
  if (!builderCodeEnabled) return data;
  // suffix "0x..." formatında; data prefix'i koruyarak birleştir
  return data + DATA_SUFFIX.slice(2);
}
