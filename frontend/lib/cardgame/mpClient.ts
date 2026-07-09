/**
 * CAR(D) GAME — dedicated multiplayer socket. A thin connection to the frostbite-mp
 * server used ONLY by the cardgame page, kept separate from the world/zone
 * MultiplayerClient so the two never interfere. socket.io forwards every event to
 * `.on`, so the renderer subscribes to `cardgame:*` directly — no forward list.
 */
import { io, type Socket } from 'socket.io-client';

const MP_URL = process.env.NEXT_PUBLIC_MP_URL || 'wss://frostbite.pro/mp';

export function createCardgameSocket(): Socket {
  return io(MP_URL, {
    transports: ['websocket'],
    reconnection: true,
    reconnectionDelay: 2000,
    reconnectionAttempts: 8,
    timeout: 10_000,
  });
}

/** Message the player signs to queue / reconnect (proves wallet ownership so
 *  nobody can queue as someone else). Mirrors the mp server's verifyQueueSig. */
export function queueMessage(address: string, nonce: number): string {
  return `Frostbite CAR(D) GAME — queue\naddress: ${address.toLowerCase()}\nnonce: ${nonce}`;
}
