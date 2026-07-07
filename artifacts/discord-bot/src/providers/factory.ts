import type { AppConfig } from '../config/config';
import type { IDataProvider } from './provider.interface';
import { MssqlProvider } from './mssql.provider';
import { RestApiProvider } from './rest-api.provider';
import { MockProvider } from './mock.provider';

export function createProvider(config: AppConfig): IDataProvider {
  switch (config.dataSource) {
    case 'mssql': {
      if (!config.mssql) {
        throw new Error('DATA_SOURCE=mssql requires MSSQL_* environment variables');
      }
      return new MssqlProvider(config.mssql, config.server.name);
    }
    case 'api': {
      if (!config.api) {
        throw new Error('DATA_SOURCE=api requires GAME_SERVER_API_URL environment variable');
      }
      return new RestApiProvider(config.api, config.server.name);
    }
    case 'mock':
    default:
      return new MockProvider();
  }
}
