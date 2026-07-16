// PixelAtlas + USDC için kullanılan minimum ABI'lar.
// Foundry derledikten sonra contracts/out/PixelAtlas.sol/PixelAtlas.json
// içinden tam ABI'yi import edebilirsiniz; aşağıdaki minimum set zaten yeterli.

export const PIXEL_ATLAS_ABI = [
  // reads
  "function GRID_W() view returns (uint16)",
  "function GRID_H() view returns (uint16)",
  "function MAX_MINT_PRICE() view returns (uint256)",
  "function MAX_URI_LENGTH() view returns (uint256)",
  "function MAX_BATCH_READ() view returns (uint256)",
  "function mintPrice() view returns (uint256)",
  "function landCheck() view returns (bool)",
  "function landRoot() view returns (bytes32)",
  "function paused() view returns (bool)",
  "function isMinted(uint256 tokenId) view returns (bool)",
  "function tokenIdOf(uint16 x, uint16 y) view returns (uint256)",
  "function coordsOf(uint256 tokenId) view returns (uint16 x, uint16 y)",
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function pixelImage(uint256 tokenId) view returns (string)",
  "function pixelsInfo(uint256[] ids) view returns (address[] owners, string[] images)",
  "function tokenURI(uint256 tokenId) view returns (string)",

  // writes
  "function mint(uint16 x, uint16 y, uint256 maxPrice, bytes32[] proof)",
  "function setPixelImage(uint256 tokenId, string uri)",

  // events (v2 — emits pricePaid + owner indexed)
  "event PixelMinted(uint256 indexed tokenId, address indexed owner, uint16 x, uint16 y, uint256 pricePaid)",
  "event PixelImageSet(uint256 indexed tokenId, address indexed owner, string uri)",
  "event PixelImageCleared(uint256 indexed tokenId, address indexed fromOwner)"
] as const;

export const USDC_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function decimals() view returns (uint8)"
] as const;
