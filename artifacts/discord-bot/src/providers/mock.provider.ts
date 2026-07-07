import type { IDataProvider } from './provider.interface';
import type { ServerStatus } from '../types/server-status';
import { logger } from '../utils/logger';

export class MockProvider implements IDataProvider {
  async connect(): Promise<void> {
    logger.warning(
      'No data source configured (DATA_SOURCE is not set).\n' +
      '        Set DATA_SOURCE=mssql and the MSSQL_* credentials, or\n' +
      '        DATA_SOURCE=api and GAME_SERVER_API_URL to display real data.\n' +
      '        The bot will show "Waiting for Server Connection" until then.',
    );
  }

  async disconnect(): Promise<void> {
    // nothing to close
  }

  isConnected(): boolean {
    return false;
  }

  async fetchServerStatus(): Promise<ServerStatus> {
    throw new Error('No data source configured — set DATA_SOURCE in your environment.');
  }
}
