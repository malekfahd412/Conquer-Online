import type { IDataProvider } from './provider.interface';
import type { ServerStatus } from '../types/server-status';
import { logger } from '../utils/logger';

export class MockProvider implements IDataProvider {
  private connected = false;

  async connect(): Promise<void> {
    this.connected = true;
    logger.info('Mock provider connected (no real data source configured)');
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
  }

  async fetchServerStatus(): Promise<ServerStatus> {
    return {
      serverName: 'Conquer Online',
      status: 'online',
      playersOnline: 428,
      maxPlayers: 1000,
      totalAccounts: 25_430,
      peakToday: 612,
      recordOnline: 987,
      uptime: '3d 14h 22m',
      activeEvents: [
        { name: 'Guild War', status: 'active' },
        { name: 'Capture The Flag', status: 'active' },
        { name: 'Team PK', status: 'starting_soon', startsIn: '5 minutes' },
      ],
      upcomingEvents: [
        { name: 'Elite PK', scheduledTime: '18:00' },
        { name: 'Boss Invasion', scheduledTime: '20:00' },
        { name: 'Last Man Standing', scheduledTime: '21:30' },
      ],
      lastUpdate: new Date(),
    };
  }
}
