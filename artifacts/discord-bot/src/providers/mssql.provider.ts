import sql from 'mssql';
import type { IDataProvider } from './provider.interface';
import type { ServerStatus, ActiveEvent, UpcomingEvent } from '../types/server-status';
import type { MssqlConfig } from '../config/config';
import { logger } from '../utils/logger';

// ---------------------------------------------------------------------------
// PRODUCTION SQL IMPLEMENTATION GUIDE
// ---------------------------------------------------------------------------
// When MSSQL credentials and the production schema are available:
//
//   1. Replace the placeholder SELECT statements in fetchServerStatus() with
//      the actual queries against your production tables / stored procedures.
//
//   2. Update the TypeScript row-type interfaces below to match the real
//      column names returned by those queries.
//
//   3. No architecture changes are needed — only the SQL strings change.
// ---------------------------------------------------------------------------

interface ServerStatusRow {
  Status: string;
  PlayersOnline: number;
  MaxPlayers: number;
  TotalAccounts: number;
  PeakToday: number;
  RecordOnline: number;
  Uptime: string;
}

interface ActiveEventRow {
  EventName: string;
  EventStatus: string;
  StartsIn: string | null;
}

interface UpcomingEventRow {
  EventName: string;
  ScheduledTime: string;
}

export class MssqlProvider implements IDataProvider {
  private pool: sql.ConnectionPool | null = null;
  private connected = false;
  private readonly serverName: string;

  constructor(private readonly config: MssqlConfig, serverName: string) {
    this.serverName = serverName;
  }

  async connect(): Promise<void> {
    try {
      this.pool = new sql.ConnectionPool({
        server: this.config.server,
        port: this.config.port,
        database: this.config.database,
        user: this.config.user,
        password: this.config.password,
        options: {
          encrypt: true,
          trustServerCertificate: true,
          connectTimeout: 15_000,
        },
        connectionTimeout: 15_000,
        requestTimeout: 10_000,
      });

      await this.pool.connect();
      this.connected = true;
      logger.success(`MSSQL connected to ${this.config.server}/${this.config.database}`);
    } catch (error) {
      this.connected = false;
      this.pool = null;
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.pool) {
      await this.pool.close();
      this.pool = null;
      this.connected = false;
      logger.info('MSSQL connection closed');
    }
  }

  isConnected(): boolean {
    return this.connected && this.pool !== null;
  }

  async fetchServerStatus(): Promise<ServerStatus> {
    if (!this.pool || !this.connected) {
      throw new Error('MSSQL provider is not connected');
    }

    try {
      const request = this.pool.request();

      // TODO: Replace with real query against your production schema.
      // Expected columns: Status (varchar), PlayersOnline (int),
      // MaxPlayers (int), TotalAccounts (int), PeakToday (int),
      // RecordOnline (int), Uptime (varchar)
      const statusResult = await request.query<ServerStatusRow>(`
        SELECT
          'online'    AS Status,
          0           AS PlayersOnline,
          1000        AS MaxPlayers,
          0           AS TotalAccounts,
          0           AS PeakToday,
          0           AS RecordOnline,
          '0d 0h 0m'  AS Uptime
      `);

      // TODO: Replace with real active-events query.
      // Expected columns: EventName (varchar), EventStatus (varchar — 'active' | 'starting_soon'),
      // StartsIn (varchar nullable — e.g. '5 minutes')
      const activeEventsResult = await request.query<ActiveEventRow>(`
        SELECT '' AS EventName, 'active' AS EventStatus, NULL AS StartsIn WHERE 1 = 0
      `);

      // TODO: Replace with real upcoming-events query, ordered by schedule time.
      // Expected columns: EventName (varchar), ScheduledTime (varchar — e.g. '18:00')
      const upcomingEventsResult = await request.query<UpcomingEventRow>(`
        SELECT '' AS EventName, '' AS ScheduledTime WHERE 1 = 0
      `);

      const row = statusResult.recordset[0];
      if (!row) {
        throw new Error('Server status query returned no rows');
      }

      const statusMap: Record<string, ServerStatus['status']> = {
        online: 'online',
        offline: 'offline',
        maintenance: 'maintenance',
      };

      const activeEvents: ActiveEvent[] = activeEventsResult.recordset.map(e => ({
        name: e.EventName,
        status: e.EventStatus === 'starting_soon' ? 'starting_soon' : 'active',
        startsIn: e.StartsIn ?? undefined,
      }));

      const upcomingEvents: UpcomingEvent[] = upcomingEventsResult.recordset.map(e => ({
        name: e.EventName,
        scheduledTime: e.ScheduledTime,
      }));

      return {
        serverName: this.serverName,
        status: statusMap[row.Status.toLowerCase()] ?? 'offline',
        playersOnline: row.PlayersOnline,
        maxPlayers: row.MaxPlayers,
        totalAccounts: row.TotalAccounts,
        peakToday: row.PeakToday,
        recordOnline: row.RecordOnline,
        uptime: row.Uptime,
        activeEvents,
        upcomingEvents,
        lastUpdate: new Date(),
      };
    } catch (error) {
      this.connected = false;
      throw error;
    }
  }
}
