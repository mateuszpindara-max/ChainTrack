import { z } from "zod";

export const thresholdSchema = z.object({
  thresholdKm: z
    .number()
    .positive()
    .max(100_000)
    .refine((value) => Number.isInteger(value * 10))
    .nullable(),
});
