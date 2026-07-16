// ─── Multiplayer Socket Client ───
import { io, Socket } from 'socket.io-client';

const MP_URL = process.env.NEXT_PUBLIC_MP_URL || 'wss://frostbite.pro/mp';

class MultiplayerClient {
  private socket: Socket | null = null;
  private registered = false;
  private listeners: Map<string, Set<Function>> = new Map();

  get connected(): boolean {
    return this.socket?.connected ?? false;
  }

  get id(): string | null {
    return this.socket?.id ?? null;
  }

  connect(): void {
    // Reuse an existing socket even if it is momentarily disconnected — creating a
    // second io() here would leave the old one auto-reconnecting in the background
    // (duplicate connections → every event delivered twice).
    if (this.socket) {
      if (!this.socket.connected) this.socket.connect();
      return;
    }

    this.socket = io(MP_URL, {
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 2000,
      reconnectionAttempts: 10,
      timeout: 10000,
    });

    this.socket.on('connect', () => {
      console.log('[MP] Connected:', this.socket?.id);
      this.emit('_connected');
    });

    this.socket.on('disconnect', (reason) => {
      console.log('[MP] Disconnected:', reason);
      this.registered = false;
      this.emit('_disconnected', reason);
    });

    this.socket.on('kicked', (data) => {
      console.warn('[MP] Kicked:', data.reason);
      this.emit('_kicked', data);
    });

    // Forward all server events to local listeners
    const events = [
      'registered', 'zone-players', 'player-joined', 'player-left', 'player-moved',
      'chat-message', 'player-emote',
      'pvp-challenged', 'pvp-challenge-sent', 'pvp-challenge-expired', 'pvp-declined',
      'pvp-start', 'pvp-battle-state', 'pvp-result',
      'trade-requested', 'trade-request-sent', 'trade-opened', 'trade-declined',
      'trade-updated', 'trade-partner-confirmed', 'trade-complete', 'trade-cancelled', 'trade-expired',
      // Party events
      'party-invited', 'party-update', 'party-dissolved', 'party-error', 'party-invite-declined',
      // Co-op dungeon events
      'coop-started', 'coop-state', 'coop-monster-update', 'coop-boss-phase',
      'coop-complete', 'coop-failed', 'coop-error', 'coop-player-left',
      // Guild events
      'guild-created', 'guild-error', 'guild-invited', 'guild-invite-sent', 'guild-invite-declined',
      'guild-joined', 'guild-left', 'guild-kicked', 'guild-promoted', 'guild-update',
      'guild-data', 'guild-chat-message', 'guild-dissolved',
      // Arena events
      'arena-queued', 'arena-left', 'arena-match-found', 'arena-countdown',
      'arena-start', 'arena-turn', 'arena-result',
    ];

    for (const event of events) {
      this.socket.on(event, (data: any) => {
        this.emit(event, data);
      });
    }
  }

  disconnect(): void {
    this.socket?.disconnect();
    this.socket = null;
    this.registered = false;
  }

  // ── Registration ──
  register(data: { wallet: string; name: string; playerClass: string; level: number; skinColor: number; hairColor: number }): void {
    this.socket?.emit('register', data);
    this.registered = true;
  }

  // ── Zone ──
  joinZone(zone: string, tx: number, ty: number): void {
    this.socket?.emit('join-zone', { zone, tx, ty });
  }

  // ── Movement ──
  sendMove(tx: number, ty: number, facing: string): void {
    this.socket?.volatile.emit('move', { tx, ty, facing });
  }

  // ── Chat ──
  sendChat(message: string): void {
    this.socket?.emit('chat', { message });
  }

  // ── PvP ──
  challengePlayer(targetId: string): void {
    this.socket?.emit('pvp-challenge', { targetId });
  }

  acceptChallenge(challengeId: string): void {
    this.socket?.emit('pvp-accept', { challengeId });
  }

  declineChallenge(challengeId: string): void {
    this.socket?.emit('pvp-decline', { challengeId });
  }

  pvpReady(battleId: string, stats: { hp: number; mp: number; atk: number; def: number; spd: number }): void {
    this.socket?.emit('pvp-ready', { battleId, ...stats });
  }

  pvpAction(battleId: string, action: string, extra?: { skillName?: string; skillMult?: number }): void {
    this.socket?.emit('pvp-action', { battleId, action, ...extra });
  }

  // ── Trade ──
  requestTrade(targetId: string): void {
    this.socket?.emit('trade-request', { targetId });
  }

  acceptTrade(tradeId: string): void {
    this.socket?.emit('trade-accept', { tradeId });
  }

  declineTrade(tradeId: string): void {
    this.socket?.emit('trade-decline', { tradeId });
  }

  updateTradeOffer(tradeId: string, items: any[], gold: number): void {
    this.socket?.emit('trade-offer', { tradeId, items, gold });
  }

  confirmTrade(tradeId: string): void {
    this.socket?.emit('trade-confirm', { tradeId });
  }

  cancelTrade(tradeId: string): void {
    this.socket?.emit('trade-cancel', { tradeId });
  }

  // ── Party ──
  inviteToParty(targetId: string): void {
    this.socket?.emit('party-invite', { targetId });
  }

  acceptParty(partyId: string): void {
    this.socket?.emit('party-accept', { partyId });
  }

  declineParty(partyId: string): void {
    this.socket?.emit('party-decline', { partyId });
  }

  leaveParty(): void {
    this.socket?.emit('party-leave', {});
  }

  // ── Co-op Dungeon ──
  startCoop(dungeonId: string): void {
    this.socket?.emit('coop-start', { dungeonId });
  }

  syncCoop(instanceId: string, tx: number, ty: number, hp: number): void {
    this.socket?.volatile.emit('coop-sync', { instanceId, tx, ty, hp });
  }

  hitMonster(instanceId: string, monsterId: string, damage: number): void {
    this.socket?.emit('coop-monster-hit', { instanceId, monsterId, damage });
  }

  // ── Guild ──
  createGuild(name: string, tag: string): void {
    this.socket?.emit('guild-create', { name, tag });
  }

  inviteToGuild(targetId: string): void {
    this.socket?.emit('guild-invite', { targetId });
  }

  acceptGuild(inviteId: string): void {
    this.socket?.emit('guild-accept', { inviteId });
  }

  declineGuild(inviteId: string): void {
    this.socket?.emit('guild-decline', { inviteId });
  }

  leaveGuild(): void {
    this.socket?.emit('guild-leave', {});
  }

  kickFromGuild(targetWallet: string): void {
    this.socket?.emit('guild-kick', { targetWallet });
  }

  promoteInGuild(targetWallet: string, role: string): void {
    this.socket?.emit('guild-promote', { targetWallet, role });
  }

  requestGuildInfo(): void {
    this.socket?.emit('guild-info', {});
  }

  sendGuildChat(message: string): void {
    this.socket?.emit('guild-chat', { message });
  }

  dissolveGuild(): void {
    this.socket?.emit('guild-dissolve', {});
  }

  contributeToGuild(gold: number): void {
    this.socket?.emit('guild-contribute', { gold });
  }

  reportGuildXpAction(action: string): void {
    this.socket?.emit('guild-xp-action', { action });
  }

  // ── Arena ──
  joinArena(mode: '1v1' | '2v2' | 'ffa'): void {
    this.socket?.emit('arena-join', { mode });
  }

  leaveArena(): void {
    this.socket?.emit('arena-leave', {});
  }

  arenaReady(matchId: string, stats: { hp: number; mp: number; atk: number; def: number; spd: number }): void {
    this.socket?.emit('arena-ready', { matchId, ...stats });
  }

  arenaAction(matchId: string, action: string, skillId?: string): void {
    this.socket?.emit('arena-action', { matchId, action, skillId });
  }

  // ── Event system ──
  on(event: string, fn: Function): void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(fn);
  }

  off(event: string, fn: Function): void {
    this.listeners.get(event)?.delete(fn);
  }

  /** Remove ALL listeners for an event (useful for scene cleanup) */
  offAll(event: string): void {
    this.listeners.delete(event);
  }

  /** Remove all listeners for all events */
  clearAllListeners(): void {
    this.listeners.clear();
  }

  private emit(event: string, data?: any): void {
    const fns = this.listeners.get(event);
    if (fns) {
      for (const fn of fns) {
        try { fn(data); } catch (e) { console.error('[MP] Listener error:', e); }
      }
    }
  }
}

// Singleton
export const mp = new MultiplayerClient();
