export { attachDiscordClient } from './client-adapter.js';
export {
  type CommandPermissionsPort,
  type CommandRegistry,
  createCommandRegistry,
  type RouteCommandOptions,
  routeCommandInteraction,
} from './commands.js';
export {
  type ChannelSender,
  type CreateDiscordServiceOptions,
  createDiscordService,
  type RateLimitConfig,
} from './discord-service.js';
export {
  type BotDispatcher,
  type CreateDispatcherOptions,
  createDispatcher,
} from './dispatcher.js';
export {
  type DiscordEventInput,
  type DiscordEventKind,
  mapDiscordEvent,
} from './mapper.js';
export {
  bindSignals,
  type CreateShutdownOptions,
  createShutdownCoordinator,
  type ShutdownCoordinator,
  type ShutdownStep,
} from './shutdown.js';
