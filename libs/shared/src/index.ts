export interface SecretKeySelector {
  name: string;
  key: string;
}

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
  frequency?: number;
  size?: number;
  richness?: number;
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
  terrainSegmentation?: number;
  water?: number;
  width?: number;
  height?: number;
  startingArea?: number;
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

export interface ResourcesSettings {
  cpuRequest?: string;
  cpuLimit?: string;
  memoryRequest?: string;
  memoryLimit?: string;
}

export interface ServiceSettings {
  type?: ServiceType;
}

export interface FactorioServerSpec {
  version?: string;
  suspended?: boolean;
  server?: ServerSettings;
  mapGenSettings?: MapGenSettings;
  mapSettings?: MapSettings;
  storage?: StorageSettings;
  resources?: ResourcesSettings;
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
  suspended?: boolean;
  server?: ServerSettings;
  mapGenSettings?: MapGenSettings;
  mapSettings?: MapSettings;
  storage?: StorageSettings;
  resources?: ResourcesSettings;
  service?: ServiceSettings;
  credentials?: CredentialsInput;
}

export interface CredentialsInput {
  gamePassword?: string | null;
  password?: string | null;
  token?: string | null;
}

export interface RconCommandInput {
  command: string;
}

export interface UpdateFactorioServerInput {
  spec: FactorioServerSpec;
  credentials?: CredentialsInput;
  /**
   * metadata.generation of the server the form was loaded from. The API
   * rejects the update if the spec has changed since then.
   */
  generation?: number;
}

export interface ServerLogs {
  pod: string | null;
  container: string;
  logs: string;
}

export interface ServerEvent {
  type: string;
  reason: string;
  message: string;
  objectKind: string;
  objectName: string;
  count: number;
  lastTimestamp: string;
}

export interface ServerBackup {
  name: string;
  size: number;
  createdAt: string;
}

export interface ServerStorage {
  /** Bytes used by the saves directory. */
  savesBytes: number;
  /** Bytes used by the whole data directory on the PVC. */
  usedBytes: number;
  /** Capacity of the data PVC, when known. */
  totalBytes?: number;
  /** Free bytes on the data PVC, when the capacity is known. */
  freeBytes?: number;
}

export interface ServerBackups {
  available: boolean;
  backups: ServerBackup[];
  storage?: ServerStorage;
}

export type ServerOperationType = "Restore" | "Import";

export type ServerOperationPhase =
  | "Pending"
  | "Suspending"
  | "Running"
  | "Completed"
  | "Failed";

export interface ServerOperation {
  name: string;
  type: ServerOperationType;
  phase: ServerOperationPhase;
  message?: string;
  saveFile?: string;
  createdAt: string;
  completedAt?: string;
}

export interface ServerSettingsJson {
  server: string | null;
  mapGen: string | null;
  mapSettings: string | null;
}

export interface ServicePortInfo {
  name?: string;
  port: number;
  protocol: string;
  nodePort?: number;
}

export interface ServerConnection {
  available: boolean;
  serviceType: string;
  clusterIP?: string;
  ports: ServicePortInfo[];
  loadBalancer: string[];
  nodeAddresses: string[];
}

export interface ContainerUsage {
  name: string;
  cpuMillicores: number;
  memoryBytes: number;
}

export interface ServerUsage {
  available: boolean;
  cpuMillicores: number;
  memoryBytes: number;
  containers: ContainerUsage[];
}

export interface EffectiveSettings {
  defaults: FactorioServerSpec;
  effective: FactorioServerSpec;
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

export * from "./schemas.js";
