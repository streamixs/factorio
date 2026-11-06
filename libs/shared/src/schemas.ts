import { z } from "zod";

export const dnsNamePattern = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/;
export const versionPattern = /^\d+\.\d+\.\d+$/;
export const quantityPattern =
  /^(\+|-)?(([0-9]+(\.[0-9]*)?)|(\.[0-9]+))(([KMGTPE]i)|[numkMGTPE]|([eE](\+|-)?(([0-9]+(\.[0-9]*)?)|(\.[0-9]+))))?$/;

const optionalNumber = z.number().finite().optional();
const nonNegativeNumber = z.number().min(0).optional();
const optionalBoolean = z.boolean().optional();
const rawSchema = z.record(z.string(), z.unknown());

export const secretKeySelectorSchema = z.strictObject({
  name: z.string().min(1).max(253),
  key: z.string().min(1).max(253),
});

export const serverIdentitySchema = z.strictObject({
  name: z.string().min(1).max(64).optional(),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

export const visibilitySchema = z.strictObject({
  public: optionalBoolean,
  lan: optionalBoolean,
});

export const accessControlSchema = z.strictObject({
  maxPlayers: z.number().int().min(0).max(65535).optional(),
  gamePasswordRef: secretKeySelectorSchema.optional(),
  requireUserVerification: optionalBoolean,
  visibility: visibilitySchema.optional(),
  allowCommands: z.enum(["true", "false", "admins-only"]).optional(),
});

export const autoSaveSchema = z.strictObject({
  interval: z.number().int().min(0).optional(),
  slots: z.number().int().min(1).optional(),
  nonBlockingSaving: optionalBoolean,
  onlyOnServer: optionalBoolean,
});

export const playerManagementSchema = z.strictObject({
  afkAutokickInterval: z.number().int().min(0).optional(),
  autoPauseWhenNoPlayers: optionalBoolean,
  onlyAdminsCanPause: optionalBoolean,
  ignorePlayerLimitForReturningPlayers: optionalBoolean,
  maxUploadSlots: z.number().int().min(0).optional(),
  maxUploadKilobytesPerSecond: z.number().int().min(0).optional(),
  minimumLatencyInTicks: z.number().int().min(0).optional(),
  maxHeartbeatsPerSecond: z.number().int().min(6).max(240).optional(),
});

export const authenticationSchema = z.strictObject({
  username: z.string().optional(),
  passwordRef: secretKeySelectorSchema.optional(),
  tokenRef: secretKeySelectorSchema.optional(),
});

export const serverSettingsSchema = z.strictObject({
  identity: serverIdentitySchema.optional(),
  access: accessControlSchema.optional(),
  autoSave: autoSaveSchema.optional(),
  playerManagement: playerManagementSchema.optional(),
  authentication: authenticationSchema.optional(),
  raw: rawSchema.optional(),
});

export const autoplaceControlSchema = z.strictObject({
  frequency: z.number().min(0).max(6).optional(),
  size: z.number().min(0).max(6).optional(),
  richness: z.number().min(0).max(6).optional(),
});

export const mapPositionSchema = z.strictObject({
  x: optionalNumber,
  y: optionalNumber,
});

export const cliffSettingsSchema = z.strictObject({
  name: z.string().optional(),
  cliffElevation0: optionalNumber,
  cliffElevationInterval: optionalNumber,
  richness: z.number().min(0).max(10).optional(),
});

export const mapGenSettingsSchema = z.strictObject({
  terrainSegmentation: z.number().min(0).max(6).optional(),
  water: z.number().min(0).max(6).optional(),
  width: z.number().int().min(0).optional(),
  height: z.number().int().min(0).optional(),
  startingArea: z.number().min(0).max(6).optional(),
  peacefulMode: optionalBoolean,
  seed: z.number().int().min(0).max(4294967295).optional(),
  startingPoints: z.array(mapPositionSchema).optional(),
  autoplaceControls: z.record(z.string(), autoplaceControlSchema).optional(),
  cliffSettings: cliffSettingsSchema.optional(),
  raw: rawSchema.optional(),
});

export const pollutionSchema = z.strictObject({
  enabled: optionalBoolean,
  diffusionRatio: nonNegativeNumber,
  minToDiffuse: nonNegativeNumber,
  ageing: nonNegativeNumber,
  expectedMaxPerChunk: nonNegativeNumber,
  minToShowPerChunk: nonNegativeNumber,
  minPollutionToDamageTrees: nonNegativeNumber,
  pollutionWithMaxForestDamage: nonNegativeNumber,
  pollutionPerTreeDamage: nonNegativeNumber,
  pollutionRestoredPerTreeDamage: nonNegativeNumber,
  maxPollutionToRestoreTrees: nonNegativeNumber,
  enemyAttackPollutionConsumptionModifier: nonNegativeNumber,
});

export const enemyEvolutionSchema = z.strictObject({
  enabled: optionalBoolean,
  timeFactor: nonNegativeNumber,
  destroyFactor: nonNegativeNumber,
  pollutionFactor: nonNegativeNumber,
});

export const enemyExpansionSchema = z.strictObject({
  enabled: optionalBoolean,
  maxExpansionDistance: z.number().int().min(0).optional(),
  friendlyBaseInfluenceRadius: z.number().int().min(0).optional(),
  enemyBuildingInfluenceRadius: z.number().int().min(0).optional(),
  buildingCoefficient: nonNegativeNumber,
  otherBaseCoefficient: nonNegativeNumber,
  neighbouringChunkCoefficient: nonNegativeNumber,
  neighbouringBaseChunkCoefficient: nonNegativeNumber,
  maxCollidingTilesCoefficient: nonNegativeNumber,
  settlerGroupMinSize: z.number().int().min(0).optional(),
  settlerGroupMaxSize: z.number().int().min(0).optional(),
  minExpansionCooldown: z.number().int().min(0).optional(),
  maxExpansionCooldown: z.number().int().min(0).optional(),
});

export const difficultySettingsSchema = z.strictObject({
  recipeDifficulty: z.number().int().min(0).max(1).optional(),
  technologyDifficulty: z.number().int().min(0).max(1).optional(),
  technologyPriceMultiplier: nonNegativeNumber,
  spoilTimeModifier: nonNegativeNumber,
});

export const mapSettingsSchema = z.strictObject({
  pollution: pollutionSchema.optional(),
  enemyEvolution: enemyEvolutionSchema.optional(),
  enemyExpansion: enemyExpansionSchema.optional(),
  difficultySettings: difficultySettingsSchema.optional(),
  maxFailedBehaviorCount: z.number().int().min(0).optional(),
  raw: rawSchema.optional(),
});

export const storageSettingsSchema = z.strictObject({
  size: z.string().regex(quantityPattern, "must be a Kubernetes quantity").optional(),
  storageClassName: z.string().min(1).optional(),
});

export const resourcesSettingsSchema = z.strictObject({
  cpuRequest: z.string().regex(quantityPattern, "must be a Kubernetes quantity").optional(),
  cpuLimit: z.string().regex(quantityPattern, "must be a Kubernetes quantity").optional(),
  memoryRequest: z.string().regex(quantityPattern, "must be a Kubernetes quantity").optional(),
  memoryLimit: z.string().regex(quantityPattern, "must be a Kubernetes quantity").optional(),
});

export const serviceSettingsSchema = z.strictObject({
  type: z.enum(["ClusterIP", "NodePort", "LoadBalancer"]).optional(),
});

export const factorioServerSpecSchema = z.strictObject({
  version: z.string().regex(versionPattern, "must look like 2.1.24").optional(),
  suspended: optionalBoolean,
  server: serverSettingsSchema.optional(),
  mapGenSettings: mapGenSettingsSchema.optional(),
  mapSettings: mapSettingsSchema.optional(),
  storage: storageSettingsSchema.optional(),
  resources: resourcesSettingsSchema.optional(),
  service: serviceSettingsSchema.optional(),
});

export const rconCommandSchema = z.strictObject({
  command: z.string().trim().min(1).max(1000),
});

export const credentialsSchema = z.strictObject({
  gamePassword: z.string().max(256).nullable().optional(),
  password: z.string().max(256).nullable().optional(),
  token: z.string().max(512).nullable().optional(),
});

export const createFactorioServerSchema = factorioServerSpecSchema.extend({
  name: z
    .string()
    .min(1)
    .max(63)
    .regex(dnsNamePattern, "must be a DNS-1123 label"),
  credentials: credentialsSchema.optional(),
});

export const updateFactorioServerSchema = z.strictObject({
  spec: factorioServerSpecSchema,
  credentials: credentialsSchema.optional(),
});

export function zodErrorMessage(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.join(".");
      return path === "" ? issue.message : `${path}: ${issue.message}`;
    })
    .join(", ");
}
