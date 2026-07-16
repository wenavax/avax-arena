/**
 * Land merkle tree — v2 kontrat ile uyumlu.
 *
 * v2 leaf hesabı (PixelAtlas.sol):
 *   bytes32 leaf = keccak256(bytes.concat(keccak256(abi.encode(tokenId))));
 *
 * Bu OZ `StandardMerkleTree` double-hash domain separation deseni.
 * Audit önerisi: 32-byte tree'lerde second-preimage'i pinler.
 *
 * `StandardMerkleTree.of(values, types)`:
 *   1. innerHash = keccak256(abi.encode(types, values))
 *   2. leaf = keccak256(bytes.concat(innerHash))
 */

import {AbiCoder, keccak256} from "ethers";
import {StandardMerkleTree} from "@openzeppelin/merkle-tree";

const _abi = AbiCoder.defaultAbiCoder();

/** v2 leaf encoding — kontratla birebir aynı */
export const leafFor = (tokenId: number | bigint): `0x${string}` => {
  const inner = keccak256(_abi.encode(["uint256"], [BigInt(tokenId)]));
  return keccak256(inner) as `0x${string}`;
};

export type LandTree = StandardMerkleTree<[bigint]>;

export function buildLandTree(landIds: ReadonlyArray<number>): LandTree {
  return StandardMerkleTree.of(
    landIds.map((id) => [BigInt(id)] as [bigint]),
    ["uint256"]
  );
}

export function proofFor(tree: LandTree, tokenId: number | bigint): `0x${string}`[] {
  return tree.getProof([BigInt(tokenId)]) as `0x${string}`[];
}

export function rootOf(tree: LandTree): `0x${string}` {
  return tree.root as `0x${string}`;
}

/** Serialize for committing to repo / downloading from /admin/derive. */
export type LandSnapshot = {
  /** schema version, bump if format changes */
  version: 2;
  /** edge coverage threshold used (kontratı deploy etmeden önce dondurulmuş) */
  edgeT: number;
  /** merkle root */
  root: `0x${string}`;
  /** canonical tokenId set, in cell-traversal order (row-major) */
  ids: number[];
};

export function exportSnapshot(landIds: number[], edgeT: number, tree: LandTree): LandSnapshot {
  return {version: 2, edgeT, root: rootOf(tree), ids: landIds};
}
