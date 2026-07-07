import type { ServerStatus } from '../types/server-status';

export interface IDataProvider {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
  fetchServerStatus(): Promise<ServerStatus>;
}
