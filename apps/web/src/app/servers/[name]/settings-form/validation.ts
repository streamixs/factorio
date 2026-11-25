import { factorioServerSpecSchema } from "@factorio/shared";
import { z } from "zod";

import { validateResourceQuantities } from "@/lib/resource-quantities";

export function compareVersions(left: string, right: string): number {
  const leftParts = left.split(".").map(Number);
  const rightParts = right.split(".").map(Number);
  for (let index = 0; index < 3; index += 1) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (difference !== 0) {
      return difference;
    }
  }
  return 0;
}

export const formSchema = z.object({
  spec: factorioServerSpecSchema,
  credentials: z.strictObject({
    gamePassword: z.string(),
    password: z.string(),
    token: z.string(),
    clearGamePassword: z.boolean(),
    clearPassword: z.boolean(),
    clearToken: z.boolean(),
  }),
}).superRefine((values, ctx) => {
  const issue = validateResourceQuantities(values.spec.resources);
  if (issue !== undefined) {
    ctx.addIssue({
      code: "custom",
      path: ["spec", "resources", issue.field],
      message: issue.message,
    });
  }
});
