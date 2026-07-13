import { staffService } from './staff.service';

// Attaches the staffEventBus listener exactly once, as soon as this module
// is first imported (from index.ts at bot startup).
staffService.init();

export { staffService } from './staff.service';
export { staffEventBus } from './staff-events';
export type { StaffActionEvent } from './staff-events';
export { staffCommandHandler, SHIFT_COMMAND_NAMES } from './staff-command-handler';
export { reportScheduler } from './report-scheduler';
export * from './types';
