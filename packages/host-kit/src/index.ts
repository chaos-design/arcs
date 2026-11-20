export { PLATFORMS, isPlatform, type PlatformName } from './platforms.js';
export {
  FileAuditSink,
  createAuditSink,
  type FileAuditSinkOptions,
} from './audit-sink.js';
export {
  HOST_CAPABILITIES,
  capabilitiesFor,
  hasCapability,
  type HostCapabilities,
  type SteeringCapability,
} from './capabilities.js';
export {
  emptyDecision,
  applyEffect,
  translateEffects,
  type HostDecision,
  type HostDecisionKind,
  type InjectedMessage,
  type DecisionSubject,
} from './decision.js';
export {
  pickString,
  pickRecord,
  nativeToRaw,
  toolCallFromNative,
  type NativeEvent,
} from './mapping.js';
export {
  makeNativeEvent,
  parseHookPayload,
  pickToolArgs,
  withHookEvent,
  shouldSteerPreToolUse,
  hookContextText,
  serializeHookDecision,
  type HookParseOptions,
  type HookSerializeOptions,
} from './hook.js';
export {
  HookEntryAdapter,
  goalFromArgs,
  readInput,
  runHookEntry,
  type HookEntryOptions,
} from './entry.js';
export {
  claimDirectory,
  claimFilePath,
  claimSession,
  createSessionClaim,
  defaultIsAlive,
  releaseSession,
  sanitizeClaimId,
  nodeClaimFs,
  type ClaimFs,
  type ClaimRecord,
  type SessionClaimHandle,
  type SessionClaimOptions,
} from './claim.js';
