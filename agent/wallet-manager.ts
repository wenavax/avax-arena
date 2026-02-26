import { ethers } from 'ethers';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

// Storage directory for encrypted wallets
const WALLETS_DIR = path.join(process.cwd(), 'agent', 'wallets');

export interface AgentWalletInfo {
  agentId: string;
  address: string;
  createdAt: string;
  encryptedKey: string;   // AES-256-GCM encrypted private key
  iv: string;             // Initialization vector (hex)
  authTag: string;        // GCM auth tag (hex)
  salt: string;           // PBKDF2 salt (hex)
}

export interface WalletManagerConfig {
  password: string;       // Master password for encryption (from env WALLET_PASSWORD)
}

export class WalletManager {
  private password: string;

  constructor(config: WalletManagerConfig) {
    this.password = config.password;
    // Ensure wallets directory exists
    if (!fs.existsSync(WALLETS_DIR)) {
      fs.mkdirSync(WALLETS_DIR, { recursive: true });
    }
  }

  /**
   * Generate a new wallet for an agent. Returns the wallet and saves encrypted key.
   */
  createWallet(agentId: string): { wallet: ethers.Wallet; address: string } {
    // Generate random wallet
    const wallet = ethers.Wallet.createRandom();

    // Encrypt and store
    this.encryptAndStore(agentId, wallet.privateKey);

    console.log(`[wallet-manager] Created wallet for agent=${agentId} address=${wallet.address}`);

    return { wallet, address: wallet.address };
  }

  /**
   * Load an existing agent wallet from encrypted storage.
   */
  loadWallet(agentId: string, provider?: ethers.JsonRpcProvider): ethers.Wallet {
    const filePath = path.join(WALLETS_DIR, `${agentId}.json`);

    if (!fs.existsSync(filePath)) {
      throw new Error(`No wallet found for agent ${agentId}`);
    }

    const data = fs.readFileSync(filePath, 'utf-8');
    const walletInfo: AgentWalletInfo = JSON.parse(data);

    // Derive key from password + salt using PBKDF2
    const salt = Buffer.from(walletInfo.salt, 'hex');
    const key = crypto.pbkdf2Sync(this.password, salt, 100000, 32, 'sha512');

    // Decrypt using AES-256-GCM
    const iv = Buffer.from(walletInfo.iv, 'hex');
    const authTag = Buffer.from(walletInfo.authTag, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(walletInfo.encryptedKey, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    const wallet = new ethers.Wallet(decrypted, provider);
    console.log(`[wallet-manager] Loaded wallet for agent=${agentId} address=${wallet.address}`);

    return wallet;
  }

  /**
   * Check if a wallet exists for the given agent.
   */
  walletExists(agentId: string): boolean {
    return fs.existsSync(path.join(WALLETS_DIR, `${agentId}.json`));
  }

  /**
   * Get wallet info (address, creation time) without decrypting the key.
   */
  getWalletInfo(agentId: string): AgentWalletInfo | null {
    const filePath = path.join(WALLETS_DIR, `${agentId}.json`);
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  }

  /**
   * List all stored agent wallets.
   */
  listWallets(): AgentWalletInfo[] {
    if (!fs.existsSync(WALLETS_DIR)) return [];

    return fs.readdirSync(WALLETS_DIR)
      .filter(f => f.endsWith('.json'))
      .map(f => JSON.parse(fs.readFileSync(path.join(WALLETS_DIR, f), 'utf-8')));
  }

  /**
   * Securely delete a wallet file (overwrite with random bytes first).
   */
  deleteWallet(agentId: string): void {
    const filePath = path.join(WALLETS_DIR, `${agentId}.json`);
    if (!fs.existsSync(filePath)) return;

    // Overwrite with random data before deleting (secure erase)
    const fileSize = fs.statSync(filePath).size;
    fs.writeFileSync(filePath, crypto.randomBytes(fileSize));
    fs.unlinkSync(filePath);

    console.log(`[wallet-manager] Securely deleted wallet for agent=${agentId}`);
  }

  /**
   * Encrypt a private key and store to file.
   */
  private encryptAndStore(agentId: string, privateKey: string): AgentWalletInfo {
    // Generate salt and IV
    const salt = crypto.randomBytes(32);
    const iv = crypto.randomBytes(16);

    // Derive key from password using PBKDF2 (100k iterations for security)
    const key = crypto.pbkdf2Sync(this.password, salt, 100000, 32, 'sha512');

    // Encrypt with AES-256-GCM (authenticated encryption)
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    let encrypted = cipher.update(privateKey, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag();

    const walletInfo: AgentWalletInfo = {
      agentId,
      address: new ethers.Wallet(privateKey).address,
      createdAt: new Date().toISOString(),
      encryptedKey: encrypted,
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex'),
      salt: salt.toString('hex'),
    };

    // Save to file
    const filePath = path.join(WALLETS_DIR, `${agentId}.json`);
    fs.writeFileSync(filePath, JSON.stringify(walletInfo, null, 2), { mode: 0o600 }); // owner read/write only

    return walletInfo;
  }
}
