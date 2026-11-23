import { GameRoomEngine, type SocketLike } from '../server/gameRoomEngine.ts';
import type { ClientMessage, ServerMessage } from '../shared/gameData.ts';

export interface LocalRoomSessionOptions {
  onMessage: (msg: ServerMessage) => void;
  autoTick?: boolean;
  tickMs?: number;
}

/**
 * Zero-network in-memory host for Solo vs Bot and Training Area matches.
 * Runs the authoritative GameRoomEngine locally inside browser memory with
 * direct object message passing (0 WebSocket traffic, 0 JSON serialization, 0ms ping).
 */
export class LocalRoomSession {
  private readonly engine: GameRoomEngine;
  private readonly socket: SocketLike;
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private disposed = false;

  constructor(opts: LocalRoomSessionOptions) {
    this.engine = new GameRoomEngine({ autoTick: false });
    this.socket = {
      readyState: 1,
      send: (raw: string) => {
        if (this.disposed) return;
        try {
          opts.onMessage(JSON.parse(raw) as ServerMessage);
        } catch {
          // ignore malformed local payload
        }
      },
      onServerMessage: (msg: ServerMessage) => {
        if (this.disposed) return;
        opts.onMessage(msg);
      },
    };
    this.engine.registerSocket(this.socket);

    const autoTick = opts.autoTick ?? true;
    const tickMs = opts.tickMs ?? 16;
    if (autoTick) {
      this.tickTimer = setInterval(() => {
        if (!this.disposed) {
          this.engine.step(Date.now());
        }
      }, tickMs);
    }
  }

  public send(msg: ClientMessage): void {
    if (this.disposed) return;
    if (msg.type === 'net:ping') {
      this.socket.onServerMessage?.({
        type: 'net:pong',
        clientSendTime: msg.clientSendTime,
        serverTime: Date.now(),
      });
      return;
    }
    this.engine.dispatchMessage(this.socket, msg);
  }

  public stepNow(nowMs = Date.now()): void {
    if (this.disposed) return;
    this.engine.step(nowMs);
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
    this.engine.disconnectSocket(this.socket);
    this.engine.dispose();
  }
}
