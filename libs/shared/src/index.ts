export interface SecretKeySelector {
  name: string;
  key: string;
}

export type MapGenSize =
  | "none"
  | "very-low"
  | "low"
  | "normal"
  | "high"
  | "very-high";

export type AllowCommands = "true" | "false" | "admins-only";

export type ServiceType = "ClusterIP" | "NodePort" | "LoadBalancer";

export interface ServerIdentity {
  name?: string;
  description?: string;
  tags?: string[];
}

export interface Visibility {
  public?: boolean;
  lan?: boolean;
}

export interface AccessControl {
  maxPlayers?: number;
  gamePasswordRef?: SecretKeySelector;
  requireUserVerification?: boolean;
  visibility?: Visibility;
  allowCommands?: AllowCommands;
}

export interface AutoSave {
  interval?: number;
  slots?: number;
  nonBlockingSaving?: boolean;
  onlyOnServer?: boolean;
}

export interface PlayerManagement {
  afkAutokickInterval?: number;
  autoPauseWhenNoPlayers?: boolean;
  onlyAdminsCanPause?: boolean;
  ignorePlayerLimitForReturningPlayers?: boolean;
  maxUploadSlots?: number;
  maxUploadKilobytesPerSecond?: number;
  minimumLatencyInTicks?: number;
  maxHeartbeatsPerSecond?: number;
}

export interface Authentication {
  username?: string;
  passwordRef?: SecretKeySelector;
  tokenRef?: SecretKeySelector;
}

export interface ServerSettings {
  identity?: ServerIdentity;
  access?: AccessControl;
  autoSave?: AutoSave;
  playerManagement?: PlayerManagement;
  authentication?: Authentication;
  raw?: Record<string, unknown>;
}

export interface AutoplaceControl {
  frequency?: MapGenSize;
  size?: MapGenSize;
  richness?: MapGenSize;
}

export interface MapPosition {
  x?: number;
  y?: number;
}

export interface CliffSettings {
  name?: string;
  cliffElevation0?: number;
  cliffElevationInterval?: number;
  richness?: number;
}

export interface MapGenSettings {
  terrainSegmentation?: MapGenSize;
  water?: MapGenSize;
  width?: number;
  height?: number;
  startingArea?: MapGenSize;
  peacefulMode?: boolean;
  seed?: number;
  startingPoints?: MapPosition[];
  autoplaceControls?: Record<string, AutoplaceControl>;
  cliffSettings?: CliffSettings;
  raw?: Record<string, unknown>;
}

export interface Pollution {
  enabled?: boolean;
  diffusionRatio?: number;
  minToDiffuse?: number;
  ageing?: number;
  expectedMaxPerChunk?: number;
  minToShowPerChunk?: number;
  minPollutionToDamageTrees?: number;
  pollutionWithMaxForestDamage?: number;
  pollutionPerTreeDamage?: number;
  pollutionRestoredPerTreeDamage?: number;
  maxPollutionToRestoreTrees?: number;
  enemyAttackPollutionConsumptionModifier?: number;
}

export interface EnemyEvolution {
  enabled?: boolean;
  timeFactor?: number;
  destroyFactor?: number;
  pollutionFactor?: number;
}

export interface EnemyExpansion {
  enabled?: boolean;
  maxExpansionDistance?: number;
  friendlyBaseInfluenceRadius?: number;
  enemyBuildingInfluenceRadius?: number;
  buildingCoefficient?: number;
  otherBaseCoefficient?: number;
  neighbouringChunkCoefficient?: number;
  neighbouringBaseChunkCoefficient?: number;
  maxCollidingTilesCoefficient?: number;
  settlerGroupMinSize?: number;
  settlerGroupMaxSize?: number;
  minExpansionCooldown?: number;
  maxExpansionCooldown?: number;
}

export interface DifficultySettings {
  recipeDifficulty?: number;
  technologyDifficulty?: number;
  technologyPriceMultiplier?: number;
  spoilTimeModifier?: number;
}

export interface MapSettings {
  pollution?: Pollution;
  enemyEvolution?: EnemyEvolution;
  enemyExpansion?: EnemyExpansion;
  difficultySettings?: DifficultySettings;
  maxFailedBehaviorCount?: number;
  raw?: Record<string, unknown>;
}

export interface StorageSettings {
  size?: string;
  storageClassName?: string;
}

export interface ServiceSettings {
  type?: ServiceType;
}

export interface FactorioServerSpec {
  version?: string;
  server?: ServerSettings;
  mapGenSettings?: MapGenSettings;
  mapSettings?: MapSettings;
  storage?: StorageSettings;
  service?: ServiceSettings;
}

export type ConditionStatus = "True" | "False" | "Unknown";

export interface Condition {
  type: string;
  status: ConditionStatus;
  reason?: string;
  message?: string;
  lastTransitionTime?: string;
  observedGeneration?: number;
}

export interface FactorioServerStatus {
  conditions?: Condition[];
}

export interface ObjectMeta {
  name: string;
  namespace?: string;
  uid?: string;
  resourceVersion?: string;
  generation?: number;
  creationTimestamp?: string;
  labels?: Record<string, string>;
  annotations?: Record<string, string>;
}

export interface FactorioServer {
  apiVersion?: string;
  kind?: string;
  metadata: ObjectMeta;
  spec: FactorioServerSpec;
  status?: FactorioServerStatus;
}

export interface FactorioServerList {
  apiVersion?: string;
  kind?: string;
  items: FactorioServer[];
  metadata?: Record<string, unknown>;
}

export interface CreateFactorioServerInput {
  name: string;
  version?: string;
  server?: ServerSettings;
  mapGenSettings?: MapGenSettings;
  mapSettings?: MapSettings;
  storage?: StorageSettings;
  service?: ServiceSettings;
}

export function findCondition(
  server: FactorioServer,
  type: string,
): Condition | undefined {
  return server.status?.conditions?.find((condition) => condition.type === type);
}

export function conditionStatus(
  server: FactorioServer,
  type: string,
): ConditionStatus | undefined {
  return findCondition(server, type)?.status;
}
