export type ServerOnlineStatus = 'online' | 'offline' | 'maintenance' | 'connecting';

export interface ActiveEvent {
  name: string;
  status: 'active' | 'starting_soon';
  startsIn?: string;
}

export interface UpcomingEvent {
  name: string;
  scheduledTime: string;
}

export interface ServerStatus {
  serverName: string;
  status: ServerOnlineStatus;
  playersOnline: number;
  maxPlayers: number;
  totalAccounts: number;
  peakToday: number;
  recordOnline: number;
  uptime: string;
  activeEvents: ActiveEvent[];
  upcomingEvents: UpcomingEvent[];
  lastUpdate: Date;
}
