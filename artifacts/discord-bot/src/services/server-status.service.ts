import type { ServerStatusRepository } from '../repositories/server-status.repository';
import type { ServerStatus } from '../types/server-status';
import { logger } from '../utils/logger';

export class ServerStatusService {
  constructor(private readonly repository: ServerStatusRepository) {}

  async getServerStatus(serverName: string): Promise<ServerStatus> {
    if (!this.repository.isProviderConnected()) {
      logger.warning('Data provider is not connected — returning connecting status');

      return {
        serverName,
        status: 'connecting',
        playersOnline: 0,
        maxPlayers: 0,
        totalAccounts: 0,
        peakToday: 0,
        recordOnline: 0,
        uptime: 'N/A',
        activeEvents: [],
        upcomingEvents: [],
        lastUpdate: new Date(),
      };
    }

    const status = await this.repository.getServerStatus();
    return status;
  }
}
