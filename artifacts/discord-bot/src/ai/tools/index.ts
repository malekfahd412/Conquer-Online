import type { ITool } from './tool.interface';
import { CreateCategoryTool } from './create-category.tool';
import { DeleteCategoryTool } from './delete-category.tool';
import { RenameCategoryTool } from './rename-category.tool';
import { CreateChannelTool } from './create-channel.tool';
import { DeleteChannelTool } from './delete-channel.tool';
import { RenameChannelTool } from './rename-channel.tool';
import { LockChannelTool } from './lock-channel.tool';
import { UnlockChannelTool } from './unlock-channel.tool';
import { SlowmodeChannelTool } from './slowmode-channel.tool';
import { CloneChannelTool } from './clone-channel.tool';
import { CreateRoleTool } from './create-role.tool';
import { DeleteRoleTool } from './delete-role.tool';
import { RenameRoleTool } from './rename-role.tool';
import { MoveRoleTool } from './move-role.tool';
import { ChangeRoleColorTool } from './change-role-color.tool';
import { AssignRoleTool } from './assign-role.tool';
import { RemoveRoleTool } from './remove-role.tool';
import { KickMemberTool } from './kick-member.tool';
import { BanMemberTool } from './ban-member.tool';
import { TimeoutMemberTool } from './timeout-member.tool';
import { SetNicknameTool } from './set-nickname.tool';
import { SendMessageTool } from './send-message.tool';
import { CreateEmbedTool } from './create-embed.tool';

export type ToolConstructor = new () => ITool;

export const ALL_TOOLS: ToolConstructor[] = [
  CreateCategoryTool,
  DeleteCategoryTool,
  RenameCategoryTool,
  CreateChannelTool,
  DeleteChannelTool,
  RenameChannelTool,
  LockChannelTool,
  UnlockChannelTool,
  SlowmodeChannelTool,
  CloneChannelTool,
  CreateRoleTool,
  DeleteRoleTool,
  RenameRoleTool,
  MoveRoleTool,
  ChangeRoleColorTool,
  AssignRoleTool,
  RemoveRoleTool,
  KickMemberTool,
  BanMemberTool,
  TimeoutMemberTool,
  SetNicknameTool,
  SendMessageTool,
  CreateEmbedTool,
];
