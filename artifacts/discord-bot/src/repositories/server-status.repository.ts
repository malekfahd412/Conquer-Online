import type { IDataProvider } from '../providers/provider.interface';
import type { ServerStatus } from '../types/server-status';

export class ServerStatusRepository {
  constructor(private readonly provider: IDataProvider) {}

  async getServerStatus(): Promise<ServerStatus> {
    return this.provider.fetchServerStatus();
  }

  isProviderConnected(): boolean {
    return this.provider.isConnected();
  }
}
