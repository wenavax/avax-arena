/**
 * Tx hata mesajlarını Türkçe + kısa olarak normalize et. RPC ve cüzdan
 * sağlayıcıları farklı şekillerde fırlatır:
 *   - EIP-1193 reject: code 4001
 *   - Wrong chain / un-added chain: code 4902
 *   - ethers v6 BrowserProvider: { code: "ACTION_REJECTED" } veya shortMessage
 *   - Contract revert: error.reason / shortMessage / data.errorName
 */

export type ParsedTxError = {
  /** kullanıcıya gösterilecek kısa mesaj */
  short: string;
  /** olayın tipi — UI dallanması için */
  kind:
    | "user-rejected"
    | "wrong-chain"
    | "already-minted"
    | "not-a-land-pixel"
    | "not-pixel-owner"
    | "insufficient-usdc"
    | "insufficient-allowance"
    | "network"
    | "unknown";
  /** raw hata — debug için console'a gönderilir */
  raw: unknown;
};

const includesAny = (s: string, needles: string[]) =>
  needles.some((n) => s.toLowerCase().includes(n.toLowerCase()));

export function parseTxError(e: unknown): ParsedTxError {
  const err = e as {
    code?: number | string;
    message?: string;
    shortMessage?: string;
    reason?: string;
    data?: {message?: string; errorName?: string};
    info?: {error?: {code?: number; message?: string}};
  };

  const code = err?.code ?? err?.info?.error?.code;
  const msgPool = [
    err?.shortMessage,
    err?.reason,
    err?.message,
    err?.data?.message,
    err?.info?.error?.message,
  ]
    .filter(Boolean)
    .join(" | ");

  // EIP-1193 / ethers user rejection
  if (
    code === 4001 ||
    code === "ACTION_REJECTED" ||
    includesAny(msgPool, ["user rejected", "user denied", "rejected the request"])
  ) {
    return {short: "Transaction cancelled", kind: "user-rejected", raw: e};
  }

  if (code === 4902 || includesAny(msgPool, ["unrecognized chain", "chain id"])) {
    return {short: "Switch network: select Base", kind: "wrong-chain", raw: e};
  }

  // Contract revert reasons
  if (includesAny(msgPool, ["already minted"])) {
    return {short: "Pixel just got minted — refresh", kind: "already-minted", raw: e};
  }
  if (includesAny(msgPool, ["not a land pixel"])) {
    return {short: "Pixel not in land set", kind: "not-a-land-pixel", raw: e};
  }
  if (includesAny(msgPool, ["not pixel owner"])) {
    return {short: "You don't own this pixel", kind: "not-pixel-owner", raw: e};
  }

  // USDC errors
  if (includesAny(msgPool, ["ERC20InsufficientBalance", "transfer amount exceeds balance"])) {
    return {short: "Insufficient USDC balance", kind: "insufficient-usdc", raw: e};
  }
  if (includesAny(msgPool, ["ERC20InsufficientAllowance", "insufficient allowance"])) {
    return {short: "USDC approval missing", kind: "insufficient-allowance", raw: e};
  }

  // Network / RPC issues
  if (includesAny(msgPool, ["network", "fetch", "timeout", "connection"])) {
    return {short: "Network error — try again", kind: "network", raw: e};
  }

  return {
    short: msgPool ? msgPool.slice(0, 60) : "Transaction failed",
    kind: "unknown",
    raw: e,
  };
}
