import type { IDataProvider } from './provider.interface';
import type { ServerStatus } from '../types/server-status';
import type { ApiConfig } from '../config/config';
import { logger } from '../utils/logger';

interface ApiResponse {
  status: string;
  playersOnline: number;
  maxPlayers: number;
  totalAccounts: number;
  peakToday: number;
  recordOnline: number;
  uptime: string;
  activeEvents: Array<{
    name: string;
    status: string;
    startsIn?: string;
  }>;
  upcomingEvents: Array<{
    name: string;
    scheduledTime: string;
  }>;
}

export class RestApiProvider implements IDataProvider {
  private connected = false;
  private readonly serverName: string;

  constructor(private readonly config: ApiConfig, serverName: string) {
    this.serverName = serverName;
  }

  async connect(): Promise<void> {
    await this.healthCheck();
    this.connected = true;
    logger.success(`REST API provider connected to ${this.config.baseUrl}`);
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    logger.info('REST API provider disconnected');
  }

  isConnected(): boolean {
    return this.connected;
  }

  async fetchServerStatus(): Promise<ServerStatus> {
    let data: ApiResponse;

    try {
      const response = await fetch(`${this.config.baseUrl}/status`, {
        signal: AbortSignal.timeout(10_000),
        headers: { Accept: 'application/json' },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }

      data = (await response.json()) as ApiResponse;
      this.connected = true;
    } catch (error) {
      this.connected = false;
      throw error;
    }

    const statusMap: Record<string, ServerStatus['status']> = {
      online: 'online',
      offline: 'offline',
      maintenance: 'maintenance',
    };

    return {
      serverName: this.serverName,
      status: statusMap[data.status?.toLowerCase()] ?? 'offline',
      playersOnline: data.playersOnline ?? 0,
      maxPlayers: data.maxPlayers ?? 0,
      totalAccounts: data.totalAccounts ?? 0,
      peakToday: data.peakToday ?? 0,
      recordOnline: data.recordOnline ?? 0,
      uptime: data.uptime ?? 'N/A',
      activeEvents: (data.activeEvents ?? []).map(e => ({
        name: e.name,
        status: e.status === 'starting_soon' ? 'starting_soon' : 'active',
        startsIn: e.startsIn,
      })),
      upcomingEvents: (data.upcomingEvents ?? []).map(e => ({
        name: e.name,
        scheduledTime: e.scheduledTime,
      })),
      lastUpdate: new Date(),
    };
  }

  private async healthCheck(): Promise<void> {
    const response = await fetch(`${this.config.baseUrl}/status`, {
      signal: AbortSignal.timeout(10_000),
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      throw new Error(`API health check failed: HTTP ${response.status}`);
    }

    logger.info(`REST API health check passed`);
  }
}
