import { parsePetDialogueSettings, type PetDialogueSettings } from "./dialogue-settings";

export type WindowKind = "pet" | "settings" | "bubble";

export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export type CursorTolerance = "sensitive" | "standard" | "relaxed";
export type AudioAssetFormat = "mp3" | "wav" | "ogg";
export type BuiltInSoundId = "gentle-chime" | "soft-whimper";
export type CompanionPace = "quiet" | "natural" | "lively";
export type CompanionLifeState = "daily-calm" | "daily-playful" | "drowsy" | "sleeping" | "working";
export type ManualLifeSelection = "auto" | "daily-calm" | "daily-playful" | "drowsy" | "sleeping";

export interface ReminderSounds {
  reminder: boolean;
  crying: boolean;
}

export interface ReminderSchedule {
  id: string;
  enabled: boolean;
  hour: number;
  minute: number;
  weekdays: readonly Weekday[];
  restDurationMinutes: number;
  cursorTolerance: CursorTolerance;
  message: string;
  sounds: ReminderSounds;
}

export interface AudioAsset {
  id: string;
  fileName: string;
  format: AudioAssetFormat;
  byteSize: number;
  available: boolean;
}

export type AudioSource = { kind: "builtin"; id: BuiltInSoundId } | { kind: "imported"; assetId: string };

export interface AudioSettingsV3 {
  reminderSource: AudioSource;
  cryingSource: AudioSource;
  assets: readonly AudioAsset[];
}

export const ACTION_SLOTS = ["idle", "resting"] as const;

export type ActionSlot = (typeof ACTION_SLOTS)[number];
export type PetAssetFormat = "png" | "webp";
export const MAX_PET_PACK_BYTES = 250 * 1024 * 1024;
export const PET_WINDOW_WIDTH = 220;
export const PET_WINDOW_HEIGHT = 240;
export const BUBBLE_WINDOW_WIDTH = 320;
export const BUBBLE_WINDOW_HEIGHT = 140;
export const MIN_PET_TARGET_HEIGHT = 80;
export const MAX_PET_TARGET_HEIGHT = 320;

export function resolvePetWindowSize(targetHeight: number): { width: number; height: number } {
  const clampedHeight = Math.max(MIN_PET_TARGET_HEIGHT, Math.min(MAX_PET_TARGET_HEIGHT, Math.round(targetHeight)));
  const height = clampedHeight + 24;
  const width = Math.max(120, Math.round(clampedHeight * 1.1) + 24);
  return { width, height };
}

export type BubblePlacement = "top" | "bottom";

export interface BubbleSystemSnapshot {
  dialogue: string | null;
  placement: BubblePlacement;
  tailOffsetX: number;
}

export interface PetWindowSettings {
  x: number | null;
  y: number | null;
  displayId: string | null;
  height: number;
  visible: boolean;
}

export interface AlphaBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface HeadHotspot {
  enabled?: boolean;
  centerX: number;
  centerY: number;
  radiusX: number;
  radiusY: number;
}

export type ScreenEllipse = HeadHotspot;

export interface AssetNormalization {
  scale: number;
  offsetX: number;
  offsetY: number;
  baselineOffset: number;
}

export interface PetAsset {
  id: string;
  fileName: string;
  format: PetAssetFormat;
  byteSize: number;
  width: number;
  height: number;
  alphaBounds: AlphaBounds;
  normalization: AssetNormalization;
  headHotspot: HeadHotspot | null;
}

export type PetActionSlots = Record<ActionSlot, readonly string[]>;

export interface PetActionTemplates {
  idleIntervalMs: number;
  blinkIntervalMs: number;
  cuteDurationMs: number;
  pettingDurationMs: number;
  angryDurationMs: number;
  dragAngryVelocity: number;
}

export interface PetConfig {
  id: string;
  name: string;
  targetHeight: number;
  assets: readonly PetAsset[];
  actionSlots: PetActionSlots;
  actionTemplates: PetActionTemplates;
  lifeStates: PetLifeStates;
  companionPace: CompanionPace;
  interactionBubblesEnabled: boolean;
  dialogueSettings: PetDialogueSettings;
}

export interface OptionalLifeAssets {
  enabled: boolean;
  assetIds: readonly string[];
}

export interface PetLifeStates {
  drowsy: OptionalLifeAssets;
  sleeping: OptionalLifeAssets;
  workingAssetIds: readonly string[];
}

export interface WorkSchedule {
  id: string;
  enabled: boolean;
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
  weekdays: readonly Weekday[];
}

export interface CompanionRuntimeSnapshot {
  lifeState: CompanionLifeState;
  pace: CompanionPace;
  manualSelection: ManualLifeSelection;
  manualWorkActive: boolean;
  scheduledWorkActive: boolean;
  systemSuspended: boolean;
  nextTransitionAt: number | null;
  available: { drowsy: boolean; sleeping: boolean };
}

export type PetInteractionRequest = { type: "play-now" } | { type: "preview-pace"; pace: CompanionPace };

export interface CompanionSystemSnapshot {
  workSchedules: readonly WorkSchedule[];
  runtime: CompanionRuntimeSnapshot;
}

export interface AppSettingsV6 {
  schemaVersion: 6;
  activePetId: string | null;
  petWindow: PetWindowSettings;
  autostartEnabled: boolean;
  audio: AudioSettingsV3;
  reminders: readonly ReminderSchedule[];
  workSchedules: readonly WorkSchedule[];
  pets: readonly PetConfig[];
}

export type AppSettings = AppSettingsV6;

export interface ReminderOccurrence {
  occurrenceId: string;
  scheduleId: string;
  scheduledFor: number;
  restDurationMinutes: number;
  cursorTolerance: CursorTolerance;
  message: string;
  sounds: ReminderSounds;
}

export interface ReminderPrompt extends ReminderOccurrence {
  triggeredAt: number;
}

export type RestSessionState = "resting" | "crying" | "celebrating";

export interface RestSessionSnapshot {
  sessionId: string;
  scheduleId: string | null;
  startedAt: number;
  endsAt: number;
  state: RestSessionState;
  cryingUntil: number | null;
  cursorTolerance: CursorTolerance;
  message: string;
  sounds: ReminderSounds;
}

export interface RestRuntimeSnapshot {
  serviceStatus: "healthy" | "error";
  serviceError?: { code: string; message: string };
  prompt: ReminderPrompt | null;
  session: RestSessionSnapshot | null;
}

export interface RestSystemSnapshot {
  reminders: readonly ReminderSchedule[];
  audio: AudioSettingsV3;
  runtime: RestRuntimeSnapshot;
}

export type CreateReminderInput = Omit<ReminderSchedule, "id">;
export type UpdateReminderInput = ReminderSchedule;
export interface AudioSourceInput {
  reminderSource: AudioSource;
  cryingSource: AudioSource;
}

export type AudioImportErrorCode = "unsupported-type" | "empty-file" | "file-too-large" | "read-failed" | "copy-failed";

export interface AudioImportFailure {
  index: number;
  code: AudioImportErrorCode;
  message: string;
}

export interface AudioImportResult {
  imported: readonly AudioAsset[];
  failures: readonly AudioImportFailure[];
}

export interface AudioPlaybackRequest {
  requestId: string;
  cue: "reminder" | "crying";
  source: AudioSource;
  maxDurationMs: 30_000;
}

export interface SettingsNavigationTarget {
  tab: "pets" | "rest" | "work" | "system";
  action?: "new-reminder";
}

export function parseSettingsNavigationTarget(value: unknown): SettingsNavigationTarget | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const tab = record.tab;
  if (tab !== "pets" && tab !== "rest" && tab !== "work" && tab !== "system") return null;
  const action = record.action;
  if (action !== undefined && action !== "new-reminder") return null;
  return {
    tab,
    ...(action ? { action } : {}),
  };
}

export interface FoundationApi {
  getSettings(): Promise<AppSettings>;
  setPetVisibility(visible: boolean): Promise<AppSettings>;
  openSettings(target?: SettingsNavigationTarget): Promise<void>;
  getWindowKind(): WindowKind;
}

export type AutostartErrorCode =
  "os-read-failed" | "os-write-failed" | "readback-mismatch" | "settings-save-failed" | "rollback-failed";

export interface AutostartStatus {
  supported: boolean;
  requested: boolean;
  effective: boolean;
  errorCode?: AutostartErrorCode;
}

export interface PetRendererStatus {
  state: "healthy" | "recovering" | "safe-mode";
  errorCode?: "pet-renderer-failed";
}

export interface PetAssetAdjustment {
  id: string;
  normalization: AssetNormalization;
  headHotspot: HeadHotspot | null;
}

export interface PetUpdateInput {
  id: string;
  name: string;
  targetHeight: number;
  assets: readonly PetAssetAdjustment[];
  actionSlots: PetActionSlots;
  actionTemplates: PetActionTemplates;
  lifeStates: PetLifeStates;
  companionPace: CompanionPace;
  interactionBubblesEnabled: boolean;
  dialogueSettings: PetDialogueSettings;
}

export type CreateWorkScheduleInput = Omit<WorkSchedule, "id">;
export type UpdateWorkScheduleInput = WorkSchedule;

export type ImageImportErrorCode =
  | "unsupported-type"
  | "empty-file"
  | "file-too-large"
  | "read-failed"
  | "decode-failed"
  | "dimensions-too-large"
  | "no-transparency"
  | "fully-transparent"
  | "pack-too-large"
  | "copy-failed";

export interface ImageImportFailure {
  index: number;
  code: ImageImportErrorCode;
  message: string;
}

export interface ImageImportResult {
  imported: readonly PetAsset[];
  failures: readonly ImageImportFailure[];
}

export interface PetSystemSnapshot {
  activePetId: string | null;
  petWindow: PetWindowSettings;
  pets: readonly PetConfig[];
}

export interface PetSystemApi extends FoundationApi {
  getPetSystemSnapshot(): Promise<PetSystemSnapshot>;
  createPet(name: string): Promise<PetSystemSnapshot>;
  deletePet(petId: string): Promise<PetSystemSnapshot>;
  deletePetAsset(petId: string, assetId: string): Promise<PetSystemSnapshot>;
  chooseAndImportPetAssets(petId: string): Promise<ImageImportResult>;
  updatePet(input: PetUpdateInput): Promise<PetSystemSnapshot>;
  savePetVoice(petId: string, data: Uint8Array, extension: string): Promise<{ voiceId: string }>;
  chooseAndImportPetVoice(petId: string): Promise<{ voiceId: string } | null>;
  pickPetVoiceSource(petId: string): Promise<{ data: Uint8Array; ext: string } | null>;
  getPetVoice(petId: string, voiceId: string): Promise<{ data: Uint8Array; ext: string } | null>;
  cleanupPetVoiceDrafts(petId: string): Promise<void>;
  getPetVoiceAvailability(petId: string, voiceIds: readonly string[]): Promise<Record<string, boolean>>;
  setActivePet(petId: string): Promise<PetSystemSnapshot>;
  movePetBy(deltaX: number, deltaY: number): void;
  nudgePetBy(deltaX: number, deltaY: number): void;
  setIgnoreMouseEvents(ignore: boolean): void;
  showPetContextMenu(): void;
  previewCompanionPace(pace: CompanionPace): Promise<void>;
  getBubbleSystemSnapshot(): Promise<BubbleSystemSnapshot>;
  setBubbleDialogue(dialogue: string | null): void;
  onPetSystemChanged(listener: (snapshot: PetSystemSnapshot) => void): () => void;
  onPetInteractionRequested(listener: (request: PetInteractionRequest) => void): () => void;
  onBubbleSystemChanged(listener: (snapshot: BubbleSystemSnapshot) => void): () => void;
}

export interface CompanionSystemApi extends PetSystemApi {
  getCompanionSystemSnapshot(): Promise<CompanionSystemSnapshot>;
  createWorkSchedule(input: CreateWorkScheduleInput): Promise<CompanionSystemSnapshot>;
  updateWorkSchedule(input: UpdateWorkScheduleInput): Promise<CompanionSystemSnapshot>;
  deleteWorkSchedule(id: string): Promise<CompanionSystemSnapshot>;
  setWorkScheduleEnabled(id: string, enabled: boolean): Promise<CompanionSystemSnapshot>;
  wakeCompanion(): Promise<CompanionSystemSnapshot>;
  beginPettingGesture(region: ScreenEllipse): void;
  cancelPettingGesture(): void;
  onCompanionSystemChanged(listener: (snapshot: CompanionSystemSnapshot) => void): () => void;
  onPettingGestureDetected(listener: () => void): () => void;
}

export interface RestSystemApi extends CompanionSystemApi {
  getRestSystemSnapshot(): Promise<RestSystemSnapshot>;
  createReminder(input: CreateReminderInput): Promise<RestSystemSnapshot>;
  updateReminder(input: UpdateReminderInput): Promise<RestSystemSnapshot>;
  deleteReminder(reminderId: string): Promise<RestSystemSnapshot>;
  setReminderEnabled(reminderId: string, enabled: boolean): Promise<RestSystemSnapshot>;
  retryReminderService(): Promise<RestSystemSnapshot>;
  startPromptedRest(occurrenceId: string): Promise<RestSystemSnapshot>;
  snoozePrompt(occurrenceId: string, minutes: 5 | 10 | 15): Promise<RestSystemSnapshot>;
  skipPrompt(occurrenceId: string): Promise<RestSystemSnapshot>;
  endRestSession(): Promise<RestSystemSnapshot>;
  chooseAndImportAudio(): Promise<AudioImportResult>;
  updateAudioSources(input: AudioSourceInput): Promise<RestSystemSnapshot>;
  reportAudioPlaybackFailure(requestId: string, assetId: string | null): void;
  onRestSystemChanged(listener: (snapshot: RestSystemSnapshot) => void): () => void;
  onAudioPlaybackRequested(listener: (request: AudioPlaybackRequest) => void): () => void;
}

export interface ReleaseHardeningApi extends RestSystemApi {
  getAutostartStatus(): Promise<AutostartStatus>;
  setAutostartEnabled(enabled: boolean): Promise<AutostartStatus>;
  getPetRendererStatus(): Promise<PetRendererStatus>;
  retryPetRenderer(): Promise<PetRendererStatus>;
  onPetRendererStatusChanged(listener: (status: PetRendererStatus) => void): () => void;
  getSettingsNavigationTarget(): Promise<SettingsNavigationTarget | null>;
  onSettingsNavigationRequested(listener: (target: SettingsNavigationTarget) => void): () => void;
}

export interface SettingsMigrationResult {
  settings: AppSettings;
  migrated: boolean;
}

export const DEFAULT_ASSET_NORMALIZATION: Readonly<AssetNormalization> = Object.freeze({
  scale: 1,
  offsetX: 0,
  offsetY: 0,
  baselineOffset: 0,
});

export const DEFAULT_ACTION_TEMPLATES: Readonly<PetActionTemplates> = Object.freeze({
  idleIntervalMs: 12_000,
  blinkIntervalMs: 8_000,
  cuteDurationMs: 900,
  pettingDurationMs: 1_000,
  angryDurationMs: 1_500,
  dragAngryVelocity: 1_200,
});

export const EMPTY_ACTION_SLOTS: Readonly<PetActionSlots> = Object.freeze({
  idle: Object.freeze([]),
  resting: Object.freeze([]),
});

export const DEFAULT_PET_LIFE_STATES: Readonly<PetLifeStates> = Object.freeze({
  drowsy: Object.freeze({ enabled: false, assetIds: Object.freeze([]) }),
  sleeping: Object.freeze({ enabled: false, assetIds: Object.freeze([]) }),
  workingAssetIds: Object.freeze([]),
});

export const DEFAULT_APP_SETTINGS = Object.freeze({
  schemaVersion: 6,
  activePetId: null,
  petWindow: Object.freeze({
    x: null,
    y: null,
    displayId: null,
    height: 180,
    visible: true,
  }),
  autostartEnabled: false,
  audio: Object.freeze({
    reminderSource: Object.freeze({ kind: "builtin", id: "gentle-chime" }),
    cryingSource: Object.freeze({ kind: "builtin", id: "soft-whimper" }),
    assets: Object.freeze([]) as readonly AudioAsset[],
  }),
  reminders: Object.freeze([]) as readonly ReminderSchedule[],
  workSchedules: Object.freeze([]) as readonly WorkSchedule[],
  pets: Object.freeze([]) as readonly PetConfig[],
}) satisfies AppSettings;

const IDENTIFIER_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;
const INTERNAL_FILE_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}\.(png|webp)$/;
const INTERNAL_AUDIO_FILE_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}\.(mp3|wav|ogg)$/;

export function parseAppSettings(value: unknown): AppSettings {
  return migrateAppSettings(value).settings;
}

export function parseAutostartEnabledInput(value: unknown): boolean {
  if (typeof value !== "boolean") throw new TypeError("enabled must be a boolean");
  return value;
}

export function parseAutostartStatus(value: unknown): AutostartStatus {
  if (!isRecord(value)) throw new Error("Invalid autostart status");
  assertExactKeys(
    value,
    value.errorCode === undefined
      ? ["supported", "requested", "effective"]
      : ["supported", "requested", "effective", "errorCode"],
    "Invalid autostart status"
  );
  if (
    typeof value.supported !== "boolean" ||
    typeof value.requested !== "boolean" ||
    typeof value.effective !== "boolean" ||
    (value.errorCode !== undefined && !isAutostartErrorCode(value.errorCode))
  ) {
    throw new Error("Invalid autostart status");
  }
  return {
    supported: value.supported,
    requested: value.requested,
    effective: value.effective,
    ...(value.errorCode ? { errorCode: value.errorCode } : {}),
  };
}

export function parsePetRendererStatus(value: unknown): PetRendererStatus {
  if (!isRecord(value)) throw new Error("Invalid pet renderer status");
  assertExactKeys(
    value,
    value.errorCode === undefined ? ["state"] : ["state", "errorCode"],
    "Invalid pet renderer status"
  );
  if (value.state !== "healthy" && value.state !== "recovering" && value.state !== "safe-mode") {
    throw new Error("Invalid pet renderer status");
  }
  if (value.errorCode !== undefined && value.errorCode !== "pet-renderer-failed") {
    throw new Error("Invalid pet renderer status");
  }
  return {
    state: value.state,
    ...(value.errorCode ? { errorCode: value.errorCode } : {}),
  };
}

export function migrateAppSettings(value: unknown): SettingsMigrationResult {
  if (!isRecord(value)) throw new Error("Unsupported settings schema version");

  if (value.schemaVersion === 6) {
    return { migrated: false, settings: parseAppSettingsV6(value) };
  }
  if (value.schemaVersion === 5) {
    return { migrated: true, settings: parseAppSettingsV6(value, "Invalid schema v5 settings") };
  }

  throw new Error("Unsupported settings schema version");
}

export function parseCreateReminderInput(value: unknown): CreateReminderInput {
  if (!isRecord(value)) throw new Error("Invalid reminder input");
  assertExactKeys(
    value,
    ["enabled", "hour", "minute", "weekdays", "restDurationMinutes", "cursorTolerance", "message", "sounds"],
    "Invalid reminder input"
  );
  return parseReminderFields(value);
}

export function parseUpdateReminderInput(value: unknown): UpdateReminderInput {
  if (!isRecord(value)) throw new Error("Invalid reminder input");
  assertExactKeys(
    value,
    ["id", "enabled", "hour", "minute", "weekdays", "restDurationMinutes", "cursorTolerance", "message", "sounds"],
    "Invalid reminder input"
  );
  return { id: parsePetIdentifier(value.id), ...parseReminderFields(value) };
}

export function parseCreateWorkScheduleInput(value: unknown): CreateWorkScheduleInput {
  if (!isRecord(value)) throw new Error("Invalid work schedule input");
  assertExactKeys(
    value,
    ["enabled", "startHour", "startMinute", "endHour", "endMinute", "weekdays"],
    "Invalid work schedule input"
  );
  return parseWorkScheduleFields(value);
}

export function parseUpdateWorkScheduleInput(value: unknown): UpdateWorkScheduleInput {
  if (!isRecord(value)) throw new Error("Invalid work schedule input");
  assertExactKeys(
    value,
    ["id", "enabled", "startHour", "startMinute", "endHour", "endMinute", "weekdays"],
    "Invalid work schedule input"
  );
  return { id: parsePetIdentifier(value.id), ...parseWorkScheduleFields(value) };
}

export function parseManualLifeSelection(value: unknown): ManualLifeSelection {
  if (
    value !== "auto" &&
    value !== "daily-calm" &&
    value !== "daily-playful" &&
    value !== "drowsy" &&
    value !== "sleeping"
  ) {
    throw new Error("Invalid manual life selection");
  }
  return value;
}

export function parseScreenEllipse(value: unknown): ScreenEllipse {
  if (!isRecord(value)) throw new Error("Invalid screen ellipse");
  assertExactKeys(value, ["centerX", "centerY", "radiusX", "radiusY"], "Invalid screen ellipse");
  if (
    !isFiniteNumberInRange(value.radiusX, 6, 200) ||
    !isFiniteNumberInRange(value.radiusY, 6, 200) ||
    typeof value.centerX !== "number" ||
    !Number.isFinite(value.centerX) ||
    typeof value.centerY !== "number" ||
    !Number.isFinite(value.centerY)
  ) {
    throw new Error("Invalid screen ellipse");
  }
  return {
    centerX: value.centerX,
    centerY: value.centerY,
    radiusX: value.radiusX,
    radiusY: value.radiusY,
  };
}

export function parseAudioSourceInput(value: unknown, availableAssetIds: readonly string[]): AudioSourceInput {
  if (!isRecord(value)) throw new Error("Invalid audio source input");
  assertExactKeys(value, ["reminderSource", "cryingSource"], "Invalid audio source input");
  const assets = new Set(availableAssetIds);
  return {
    reminderSource: parseAudioSource(value.reminderSource, assets, "gentle-chime"),
    cryingSource: parseAudioSource(value.cryingSource, assets, "soft-whimper"),
  };
}

export function createRestSystemSnapshot(settings: AppSettings, runtime: RestRuntimeSnapshot): RestSystemSnapshot {
  return {
    reminders: settings.reminders.map(cloneReminder),
    audio: cloneAudioSettings(settings.audio),
    runtime: cloneRuntime(runtime),
  };
}

export function createCompanionSystemSnapshot(
  settings: AppSettings,
  runtime: CompanionRuntimeSnapshot
): CompanionSystemSnapshot {
  return {
    workSchedules: settings.workSchedules.map(cloneWorkSchedule),
    runtime: cloneCompanionRuntime(runtime),
  };
}

export function isSafeIdentifier(value: unknown): value is string {
  return typeof value === "string" && IDENTIFIER_PATTERN.test(value);
}

export function parsePetIdentifier(value: unknown): string {
  if (!isSafeIdentifier(value)) throw new Error("Invalid pet identifier");
  return value;
}

export function parsePetName(value: unknown): string {
  if (typeof value !== "string") throw new Error("Invalid pet name");
  const name = value.trim();
  if (name.length < 1 || name.length > 80) throw new Error("Invalid pet name");
  return name;
}

export function parsePetUpdateInput(value: unknown, availableAssetIds: readonly string[]): PetUpdateInput {
  if (!isRecord(value)) throw new Error("Invalid pet update");
  assertExactKeys(
    value,
    [
      "id",
      "name",
      "targetHeight",
      "assets",
      "actionSlots",
      "actionTemplates",
      "lifeStates",
      "companionPace",
      "interactionBubblesEnabled",
      "dialogueSettings",
    ],
    "Invalid pet update"
  );
  const id = parsePetIdentifier(value.id);
  const name = parsePetName(value.name);
  if (!isFiniteNumberInRange(value.targetHeight, MIN_PET_TARGET_HEIGHT, MAX_PET_TARGET_HEIGHT)) {
    throw new Error("Invalid pet target height");
  }
  if (!Array.isArray(value.assets)) throw new Error("Invalid pet asset adjustments");
  const assets = value.assets.map((entry) => {
    if (!isRecord(entry)) throw new Error("Invalid pet asset adjustment");
    assertExactKeys(entry, ["id", "normalization", "headHotspot"], "Invalid pet asset adjustment");
    return {
      id: parsePetIdentifier(entry.id),
      normalization: parseNormalization(entry.normalization),
      headHotspot: parseNullableHeadHotspot(entry.headHotspot),
    };
  });
  assertUnique(
    assets.map((asset) => asset.id),
    "Duplicate pet asset adjustment"
  );
  const expected = new Set(availableAssetIds);
  if (assets.length !== expected.size || assets.some((asset) => !expected.has(asset.id))) {
    throw new Error("Pet update must contain every current asset exactly once");
  }

  const actionSlots = parseActionSlots(value.actionSlots, expected);
  const lifeStates = parsePetLifeStates(value.lifeStates, expected);
  if (actionSlots.idle.length === 0) throw new Error("At least one daily asset is required");

  return {
    id,
    name,
    targetHeight: value.targetHeight,
    assets,
    actionSlots,
    actionTemplates: parseActionTemplates(value.actionTemplates),
    lifeStates,
    companionPace: parseCompanionPace(value.companionPace),
    interactionBubblesEnabled: parseInteractionBubblesEnabled(value.interactionBubblesEnabled),
    dialogueSettings: parsePetDialogueSettings(value.dialogueSettings),
  };
}

export function createPetSystemSnapshot(settings: AppSettings): PetSystemSnapshot {
  return {
    activePetId: settings.activePetId,
    petWindow: { ...settings.petWindow },
    pets: settings.pets.map((pet) => parsePetConfig(pet, 0)),
  };
}

function parseAppSettingsV6(
  value: Record<string, unknown>,
  errorMessage = "Invalid schema v6 settings"
): AppSettingsV6 {
  assertExactKeys(
    value,
    ["schemaVersion", "activePetId", "petWindow", "autostartEnabled", "audio", "reminders", "workSchedules", "pets"],
    errorMessage
  );
  const foundation = parseCommonFoundationFields(value);
  if (!Array.isArray(value.pets)) throw new Error("Invalid pet collection");
  const pets = value.pets.map(parsePetConfig);
  assertUnique(
    pets.map((pet) => pet.id),
    "Duplicate pet identifier"
  );
  const activePetId = parseNullableIdentifier(value.activePetId, "active pet identifier");
  validateActivePet(activePetId, pets);
  if (!Array.isArray(value.reminders)) throw new Error("Invalid reminder collection");
  const reminders = value.reminders.map(parseReminderSchedule);
  assertUnique(
    reminders.map((reminder) => reminder.id),
    "Duplicate reminder identifier"
  );
  if (!Array.isArray(value.workSchedules)) throw new Error("Invalid work schedule collection");
  const workSchedules = value.workSchedules.map(parseWorkSchedule);
  assertUnique(
    workSchedules.map((schedule) => schedule.id),
    "Duplicate work schedule identifier"
  );
  const audio = parseAudioSettings(value.audio);
  return {
    schemaVersion: 6,
    activePetId,
    ...foundation,
    audio,
    reminders,
    workSchedules,
    pets,
  };
}

function parseCommonFoundationFields(
  value: Record<string, unknown>
): Pick<AppSettings, "petWindow" | "autostartEnabled"> {
  const petWindow = value.petWindow;
  if (!isRecord(petWindow)) throw new Error("Invalid pet window settings");
  assertExactKeys(petWindow, ["x", "y", "displayId", "height", "visible"], "Invalid pet window settings");
  if (
    !isNullableFiniteNumber(petWindow.x) ||
    !isNullableFiniteNumber(petWindow.y) ||
    !isNullableString(petWindow.displayId) ||
    !isFiniteNumberInRange(petWindow.height, 80, 260) ||
    typeof petWindow.visible !== "boolean"
  )
    throw new Error("Invalid pet window settings");
  if (typeof value.autostartEnabled !== "boolean") throw new Error("Invalid autostart setting");
  return {
    petWindow: {
      x: petWindow.x,
      y: petWindow.y,
      displayId: petWindow.displayId,
      height: petWindow.height,
      visible: petWindow.visible,
    },
    autostartEnabled: value.autostartEnabled,
  };
}

function validateActivePet(activePetId: string | null, pets: readonly Pick<PetConfig, "id" | "actionSlots">[]): void {
  if (activePetId === null) return;
  const activePet = pets.find((pet) => pet.id === activePetId);
  if (!activePet || activePet.actionSlots.idle.length === 0) {
    throw new Error("Active pet must reference a configured idle asset");
  }
}

function parseReminderSchedule(value: unknown): ReminderSchedule {
  if (!isRecord(value)) throw new Error("Invalid reminder schedule");
  assertExactKeys(
    value,
    ["id", "enabled", "hour", "minute", "weekdays", "restDurationMinutes", "cursorTolerance", "message", "sounds"],
    "Invalid reminder schedule"
  );
  return { id: parsePetIdentifier(value.id), ...parseReminderFields(value) };
}

function parseReminderFields(value: Record<string, unknown>): CreateReminderInput {
  if (typeof value.enabled !== "boolean") throw new Error("Invalid reminder enabled state");
  if (!isIntegerInRange(value.hour, 0, 23) || !isIntegerInRange(value.minute, 0, 59)) {
    throw new Error("Invalid reminder time");
  }
  if (
    !Array.isArray(value.weekdays) ||
    value.weekdays.length === 0 ||
    !value.weekdays.every((day) => isIntegerInRange(day, 0, 6))
  ) {
    throw new Error("Invalid reminder weekdays");
  }
  const weekdays = value.weekdays as Weekday[];
  if (new Set(weekdays).size !== weekdays.length) throw new Error("Duplicate reminder weekday");
  if (!isIntegerInRange(value.restDurationMinutes, 1, 120)) {
    throw new Error("Invalid reminder duration");
  }
  if (
    value.cursorTolerance !== "sensitive" &&
    value.cursorTolerance !== "standard" &&
    value.cursorTolerance !== "relaxed"
  )
    throw new Error("Invalid cursor tolerance");
  if (typeof value.message !== "string") throw new Error("Invalid reminder message");
  const message = value.message.trim();
  if (message.length < 1 || message.length > 200) throw new Error("Invalid reminder message");
  if (!isRecord(value.sounds)) throw new Error("Invalid reminder sounds");
  assertExactKeys(value.sounds, ["reminder", "crying"], "Invalid reminder sounds");
  if (typeof value.sounds.reminder !== "boolean" || typeof value.sounds.crying !== "boolean") {
    throw new Error("Invalid reminder sounds");
  }
  return {
    enabled: value.enabled,
    hour: value.hour,
    minute: value.minute,
    weekdays: [...weekdays],
    restDurationMinutes: value.restDurationMinutes,
    cursorTolerance: value.cursorTolerance,
    message,
    sounds: { reminder: value.sounds.reminder, crying: value.sounds.crying },
  };
}

function parseWorkSchedule(value: unknown): WorkSchedule {
  if (!isRecord(value)) throw new Error("Invalid work schedule");
  assertExactKeys(
    value,
    ["id", "enabled", "startHour", "startMinute", "endHour", "endMinute", "weekdays"],
    "Invalid work schedule"
  );
  return { id: parsePetIdentifier(value.id), ...parseWorkScheduleFields(value) };
}

function parseWorkScheduleFields(value: Record<string, unknown>): CreateWorkScheduleInput {
  if (typeof value.enabled !== "boolean") throw new Error("Invalid work schedule enabled state");
  if (
    !isIntegerInRange(value.startHour, 0, 23) ||
    !isIntegerInRange(value.startMinute, 0, 59) ||
    !isIntegerInRange(value.endHour, 0, 23) ||
    !isIntegerInRange(value.endMinute, 0, 59)
  ) {
    throw new Error("Invalid work schedule time");
  }
  if (value.startHour === value.endHour && value.startMinute === value.endMinute) {
    throw new Error("Work schedule start and end must differ");
  }
  if (
    !Array.isArray(value.weekdays) ||
    value.weekdays.length === 0 ||
    !value.weekdays.every((day) => isIntegerInRange(day, 0, 6))
  ) {
    throw new Error("Invalid work schedule weekdays");
  }
  const weekdays = value.weekdays as Weekday[];
  if (new Set(weekdays).size !== weekdays.length) {
    throw new Error("Duplicate work schedule weekday");
  }
  return {
    enabled: value.enabled,
    startHour: value.startHour,
    startMinute: value.startMinute,
    endHour: value.endHour,
    endMinute: value.endMinute,
    weekdays: [...weekdays],
  };
}

function parseAudioSettings(value: unknown): AudioSettingsV3 {
  if (!isRecord(value)) throw new Error("Invalid audio settings");
  assertExactKeys(value, ["reminderSource", "cryingSource", "assets"], "Invalid audio settings");
  if (!Array.isArray(value.assets)) throw new Error("Invalid audio asset collection");
  const assets = value.assets.map(parseAudioAsset);
  assertUnique(
    assets.map((asset) => asset.id),
    "Duplicate audio asset identifier"
  );
  assertUnique(
    assets.map((asset) => asset.fileName),
    "Duplicate audio asset filename"
  );
  const assetIds = new Set(assets.map((asset) => asset.id));
  return {
    reminderSource: parseAudioSource(value.reminderSource, assetIds, "gentle-chime"),
    cryingSource: parseAudioSource(value.cryingSource, assetIds, "soft-whimper"),
    assets,
  };
}

function parseAudioAsset(value: unknown): AudioAsset {
  if (!isRecord(value) || !isSafeIdentifier(value.id)) throw new Error("Invalid audio asset identifier");
  assertExactKeys(value, ["id", "fileName", "format", "byteSize", "available"], "Invalid audio asset");
  if (value.format !== "mp3" && value.format !== "wav" && value.format !== "ogg") {
    throw new Error("Invalid audio asset format");
  }
  if (
    typeof value.fileName !== "string" ||
    !INTERNAL_AUDIO_FILE_PATTERN.test(value.fileName) ||
    value.fileName !== `${value.id}.${value.format}`
  )
    throw new Error("Invalid audio asset filename");
  if (!isIntegerInRange(value.byteSize, 1, 20 * 1024 * 1024)) throw new Error("Invalid audio asset byte size");
  if (typeof value.available !== "boolean") throw new Error("Invalid audio asset availability");
  return {
    id: value.id,
    fileName: value.fileName,
    format: value.format,
    byteSize: value.byteSize,
    available: value.available,
  };
}

function parseAudioSource(value: unknown, assetIds: ReadonlySet<string>, allowedBuiltIn: BuiltInSoundId): AudioSource {
  if (!isRecord(value) || typeof value.kind !== "string") throw new Error("Invalid audio source");
  if (value.kind === "builtin") {
    assertExactKeys(value, ["kind", "id"], "Invalid audio source");
    if (value.id !== allowedBuiltIn) throw new Error("Unknown built-in audio source");
    return { kind: "builtin", id: allowedBuiltIn };
  }
  if (value.kind === "imported") {
    assertExactKeys(value, ["kind", "assetId"], "Invalid audio source");
    const assetId = parsePetIdentifier(value.assetId);
    if (!assetIds.has(assetId)) throw new Error("Stale imported audio source");
    return { kind: "imported", assetId };
  }
  throw new Error("Unknown audio source");
}

function cloneReminder(reminder: ReminderSchedule): ReminderSchedule {
  return { ...reminder, weekdays: [...reminder.weekdays], sounds: { ...reminder.sounds } };
}

function cloneWorkSchedule(schedule: WorkSchedule): WorkSchedule {
  return { ...schedule, weekdays: [...schedule.weekdays] };
}

function cloneCompanionRuntime(runtime: CompanionRuntimeSnapshot): CompanionRuntimeSnapshot {
  return { ...runtime, available: { ...runtime.available } };
}

function cloneAudioSettings(audio: AudioSettingsV3): AudioSettingsV3 {
  return {
    reminderSource: { ...audio.reminderSource },
    cryingSource: { ...audio.cryingSource },
    assets: audio.assets.map((asset) => ({ ...asset })),
  };
}

function cloneRuntime(runtime: RestRuntimeSnapshot): RestRuntimeSnapshot {
  return {
    serviceStatus: runtime.serviceStatus,
    ...(runtime.serviceError ? { serviceError: { ...runtime.serviceError } } : {}),
    prompt: runtime.prompt ? { ...runtime.prompt, sounds: { ...runtime.prompt.sounds } } : null,
    session: runtime.session ? { ...runtime.session, sounds: { ...runtime.session.sounds } } : null,
  };
}

function assertExactKeys(value: Record<string, unknown>, keys: readonly string[], message: string): void {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new Error(message);
  }
}

function isAutostartErrorCode(value: unknown): value is AutostartErrorCode {
  return (
    value === "os-read-failed" ||
    value === "os-write-failed" ||
    value === "readback-mismatch" ||
    value === "settings-save-failed" ||
    value === "rollback-failed"
  );
}

function parsePetConfig(value: unknown, index: number): PetConfig {
  if (!isRecord(value)) throw new Error(`Invalid pet at index ${index}`);
  assertExactKeys(
    value,
    [
      "id",
      "name",
      "targetHeight",
      "assets",
      "actionSlots",
      "actionTemplates",
      "lifeStates",
      "companionPace",
      "interactionBubblesEnabled",
      "dialogueSettings",
    ],
    "Invalid pet configuration"
  );
  if (!isSafeIdentifier(value.id)) throw new Error("Invalid pet identifier");
  const name = parsePetName(value.name);
  if (name !== value.name) throw new Error("Invalid pet name");
  if (!isFiniteNumberInRange(value.targetHeight, MIN_PET_TARGET_HEIGHT, MAX_PET_TARGET_HEIGHT)) {
    throw new Error("Invalid pet target height");
  }
  if (!Array.isArray(value.assets)) throw new Error("Invalid pet asset collection");

  const assets = value.assets.map(parsePetAsset);
  assertUnique(
    assets.map((asset) => asset.id),
    "Duplicate pet asset identifier"
  );
  assertUnique(
    assets.map((asset) => asset.fileName),
    "Duplicate pet asset filename"
  );
  const assetIds = new Set(assets.map((asset) => asset.id));
  if (assets.reduce((total, asset) => total + asset.byteSize, 0) > MAX_PET_PACK_BYTES) {
    throw new Error("Pet pack exceeds 250 MB");
  }

  const actionSlots = parseActionSlots(value.actionSlots, assetIds);
  return {
    id: value.id,
    name,
    targetHeight: value.targetHeight,
    assets,
    actionSlots,
    actionTemplates: parseActionTemplates(value.actionTemplates),
    lifeStates: parsePetLifeStates(value.lifeStates, assetIds),
    companionPace: parseCompanionPace(value.companionPace),
    interactionBubblesEnabled: parseInteractionBubblesEnabled(value.interactionBubblesEnabled),
    dialogueSettings: parsePetDialogueSettings(value.dialogueSettings),
  };
}

function parsePetAsset(value: unknown): PetAsset {
  if (!isRecord(value) || !isSafeIdentifier(value.id)) {
    throw new Error("Invalid pet asset identifier");
  }
  assertExactKeys(
    value,
    ["id", "fileName", "format", "byteSize", "width", "height", "alphaBounds", "normalization", "headHotspot"],
    "Invalid pet asset"
  );
  if (value.format !== "png" && value.format !== "webp") {
    throw new Error("Invalid pet asset format");
  }
  if (
    typeof value.fileName !== "string" ||
    !INTERNAL_FILE_PATTERN.test(value.fileName) ||
    value.fileName !== `${value.id}.${value.format}`
  ) {
    throw new Error("Invalid pet asset filename");
  }
  if (!isIntegerInRange(value.byteSize, 1, 20 * 1024 * 1024)) {
    throw new Error("Invalid pet asset byte size");
  }
  if (!isIntegerInRange(value.width, 1, 8192) || !isIntegerInRange(value.height, 1, 8192)) {
    throw new Error("Invalid pet asset dimensions");
  }

  const alphaBounds = parseAlphaBounds(value.alphaBounds, value.width, value.height);
  const normalization = parseNormalization(value.normalization);
  const headHotspot = parseNullableHeadHotspot(value.headHotspot);
  return {
    id: value.id,
    fileName: value.fileName,
    format: value.format,
    byteSize: value.byteSize,
    width: value.width,
    height: value.height,
    alphaBounds,
    normalization,
    headHotspot,
  };
}

function parseAlphaBounds(value: unknown, imageWidth: number, imageHeight: number): AlphaBounds {
  if (!isRecord(value)) throw new Error("Invalid alpha bounds");
  assertExactKeys(value, ["x", "y", "width", "height"], "Invalid alpha bounds");
  if (
    !isIntegerInRange(value.x, 0, imageWidth - 1) ||
    !isIntegerInRange(value.y, 0, imageHeight - 1) ||
    !isIntegerInRange(value.width, 1, imageWidth) ||
    !isIntegerInRange(value.height, 1, imageHeight) ||
    value.x + value.width > imageWidth ||
    value.y + value.height > imageHeight
  ) {
    throw new Error("Invalid alpha bounds");
  }
  return { x: value.x, y: value.y, width: value.width, height: value.height };
}

function parseNormalization(value: unknown): AssetNormalization {
  if (!isRecord(value)) throw new Error("Invalid asset normalization");
  assertExactKeys(value, ["scale", "offsetX", "offsetY", "baselineOffset"], "Invalid asset normalization");
  if (
    !isFiniteNumberInRange(value.scale, 0.25, 4) ||
    !isFiniteNumberInRange(value.offsetX, -512, 512) ||
    !isFiniteNumberInRange(value.offsetY, -512, 512) ||
    !isFiniteNumberInRange(value.baselineOffset, -256, 256)
  ) {
    throw new Error("Invalid asset normalization");
  }
  return {
    scale: value.scale,
    offsetX: value.offsetX,
    offsetY: value.offsetY,
    baselineOffset: value.baselineOffset,
  };
}

export function parseHeadHotspot(value: unknown): HeadHotspot {
  if (!isRecord(value)) throw new Error("Invalid head hotspot");
  const hasEnabled = "enabled" in value;
  if (hasEnabled) {
    assertExactKeys(value, ["centerX", "centerY", "radiusX", "radiusY", "enabled"], "Invalid head hotspot");
    if (typeof value.enabled !== "boolean") throw new Error("Invalid head hotspot enabled state");
  } else {
    assertExactKeys(value, ["centerX", "centerY", "radiusX", "radiusY"], "Invalid head hotspot");
  }
  if (
    !isFiniteNumberInRange(value.centerX, 0, 1) ||
    !isFiniteNumberInRange(value.centerY, 0, 1) ||
    !isFiniteNumberInRange(value.radiusX, 0.03, 0.5) ||
    !isFiniteNumberInRange(value.radiusY, 0.03, 0.5)
  ) {
    throw new Error("Invalid head hotspot");
  }
  return {
    ...(hasEnabled ? { enabled: value.enabled as boolean } : {}),
    centerX: value.centerX,
    centerY: value.centerY,
    radiusX: value.radiusX,
    radiusY: value.radiusY,
  };
}

function parseNullableHeadHotspot(value: unknown): HeadHotspot | null {
  return value === null ? null : parseHeadHotspot(value);
}

function parsePetLifeStates(value: unknown, assetIds: ReadonlySet<string>): PetLifeStates {
  if (!isRecord(value)) throw new Error("Invalid pet life states");
  assertExactKeys(value, ["drowsy", "sleeping", "workingAssetIds"], "Invalid pet life states");
  const drowsy = parseOptionalLifeAssets(value.drowsy, assetIds, "drowsy");
  const sleeping = parseOptionalLifeAssets(value.sleeping, assetIds, "sleeping");
  const workingAssetIds = parseAssetIdList(value.workingAssetIds, assetIds, "working");
  return { drowsy, sleeping, workingAssetIds };
}

function parseOptionalLifeAssets(value: unknown, assetIds: ReadonlySet<string>, label: string): OptionalLifeAssets {
  if (!isRecord(value)) throw new Error(`Invalid ${label} life assets`);
  assertExactKeys(value, ["enabled", "assetIds"], `Invalid ${label} life assets`);
  if (typeof value.enabled !== "boolean") throw new Error(`Invalid ${label} enabled state`);
  const assigned = parseAssetIdList(value.assetIds, assetIds, label);
  if (value.enabled && assigned.length === 0) {
    throw new Error(`Enabled ${label} state requires at least one asset`);
  }
  return { enabled: value.enabled, assetIds: assigned };
}

function parseAssetIdList(value: unknown, assetIds: ReadonlySet<string>, label: string): readonly string[] {
  if (!Array.isArray(value) || !value.every(isSafeIdentifier)) {
    throw new Error(`Invalid ${label} asset list`);
  }
  assertUnique(value, `Duplicate ${label} asset`);
  if (value.some((assetId) => !assetIds.has(assetId))) {
    throw new Error(`Unknown asset in ${label} life state`);
  }
  return [...value];
}

export function parseCompanionPace(value: unknown): CompanionPace {
  if (value !== "quiet" && value !== "natural" && value !== "lively") {
    throw new Error("Invalid companion pace");
  }
  return value;
}

function parseInteractionBubblesEnabled(value: unknown): boolean {
  if (typeof value !== "boolean") throw new Error("Invalid interaction bubble setting");
  return value;
}

function parseActionSlots(value: unknown, assetIds: ReadonlySet<string>): PetActionSlots {
  if (!isRecord(value)) throw new Error("Invalid action slots");
  const result = {} as Record<ActionSlot, readonly string[]>;

  for (const slot of ACTION_SLOTS) {
    const assignments = value[slot] ?? [];
    if (!Array.isArray(assignments) || !assignments.every(isSafeIdentifier)) {
      throw new Error(`Invalid ${slot} action slot`);
    }
    assertUnique(assignments, `Duplicate ${slot} action asset`);
    if (assignments.some((assetId) => !assetIds.has(assetId))) {
      throw new Error(`Unknown asset in ${slot} action slot`);
    }
    result[slot] = [...assignments];
  }

  return result;
}

function parseActionTemplates(value: unknown): PetActionTemplates {
  if (!isRecord(value)) throw new Error("Invalid action templates");
  const ranges = {
    idleIntervalMs: [3_000, 60_000],
    blinkIntervalMs: [2_000, 60_000],
    cuteDurationMs: [200, 5_000],
    pettingDurationMs: [200, 5_000],
    angryDurationMs: [300, 8_000],
    dragAngryVelocity: [200, 5_000],
  } as const;
  assertExactKeys(value, Object.keys(ranges), "Invalid action templates");
  const result = {} as Record<keyof PetActionTemplates, number>;

  for (const key of Object.keys(ranges) as Array<keyof PetActionTemplates>) {
    const [minimum, maximum] = ranges[key];
    if (!isFiniteNumberInRange(value[key], minimum, maximum)) {
      throw new Error(`Invalid action template parameter: ${key}`);
    }
    result[key] = value[key];
  }
  return result;
}

function parseNullableIdentifier(value: unknown, label: string): string | null {
  if (value === null) return null;
  if (!isSafeIdentifier(value)) throw new Error(`Invalid ${label}`);
  return value;
}

function assertUnique(values: readonly string[], message: string): void {
  if (new Set(values).size !== values.length) throw new Error(message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isNullableFiniteNumber(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isFinite(value));
}

function isFiniteNumberInRange(value: unknown, minimum: number, maximum: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= minimum && value <= maximum;
}

function isIntegerInRange(value: unknown, minimum: number, maximum: number): value is number {
  return Number.isInteger(value) && typeof value === "number" && value >= minimum && value <= maximum;
}
