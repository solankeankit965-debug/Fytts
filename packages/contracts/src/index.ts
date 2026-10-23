import { z } from "zod";
export const categories = [
  "Shirt",
  "T-shirt",
  "Trousers",
  "Jeans",
  "Dress",
  "Jacket",
  "Hoodie",
  "Other",
] as const;
export const silhouettes = [
  "Fitted",
  "Regular",
  "Relaxed",
  "Oversized",
] as const;
export const stretches = ["None", "A little", "Stretchy"] as const;
export const comforts = ["Too tight", "Just right", "Too loose"] as const;
const measurement = z.number().positive().max(400).optional();
export const measurementsSchema = z
  .object({
    chest: measurement,
    waist: measurement,
    hip: measurement,
    length: measurement,
  })
  .strict();
export const catalogueBrands = [
  "H&M",
  "Zara",
  "Mango",
  "Westside",
  "Zudio",
  "Yousta",
  "Being Human",
  "Levi’s",
  "Pantaloons",
] as const;
export const catalogueSearchSchema = z
  .object({
    brand: z.enum(catalogueBrands),
    category: z.enum(categories),
    q: z.string().trim().min(2).max(80),
  })
  .strict();
export const productSourceSchema = z
  .object({
    provider: z.literal("serpapi"),
    url: z
      .url()
      .max(2048)
      .refine((s) => s.startsWith("https://")),
    seller: z.string().max(120),
    priceLabel: z.string().max(80).nullable(),
    checkedAt: z.iso.datetime(),
  })
  .strict();
export type ProductSource = z.infer<typeof productSourceSchema>;
export type CatalogueQuery = z.infer<typeof catalogueSearchSchema>;
export type CatalogueStatus = {
  configured: boolean;
  brands: typeof catalogueBrands;
};
export type CatalogueProduct = {
  id: string;
  title: string;
  image: string | null;
  availability: "Check with seller" | "Out of stock";
  source: ProductSource;
};
export type CatalogueResults = {
  products: CatalogueProduct[];
  checkedAt: string;
  cached: boolean;
};
export const garmentSchema = z
  .object({
    name: z.string().trim().min(2).max(100),
    brand: z.string().trim().min(1).max(80),
    category: z.enum(categories),
    labelSize: z.string().trim().min(1).max(30),
    fabric: z.string().trim().min(1).max(80),
    silhouette: z.enum(silhouettes),
    stretch: z.enum(stretches),
    comfort: z.enum(comforts),
    color: z.enum(["Blue", "Pink", "Cream", "Black", "Green", "Orange"]),
    perfectFit: z.boolean(),
    notes: z.string().trim().max(1000),
    measurements: measurementsSchema,
  })
  .strict();
export const profileSchema = z
  .object({
    displayName: z.string().trim().min(1).max(80),
    preferredFit: z.enum(silhouettes),
  })
  .strict();
export const credentialsSchema = z
  .object({
    email: z
      .email()
      .max(254)
      .transform((s) => s.toLowerCase()),
    password: z.string().min(10).max(128),
  })
  .strict();
export type GarmentInput = z.infer<typeof garmentSchema>;
export type ProfileInput = z.infer<typeof profileSchema>;
export type Garment = GarmentInput & {
  id: string;
  ownerId: string;
  imagePath: string | null;
  createdAt: string;
  updatedAt: string;
};
export type Profile = ProfileInput & { id: string };
export type Account = { id: string; email: string };
export type Session = {
  user: Account;
  profile: Profile;
  mode: "local" | "supabase";
};
export type RuntimeInfo = {
  mode: "local" | "supabase";
  cloudConnected: boolean;
  milestone: string;
};

export const measurementKeys = ["chest", "waist", "hip", "length"] as const;
export type MeasurementKey = (typeof measurementKeys)[number];
export function categoryMeasurements(
  category: (typeof categories)[number],
): MeasurementKey[] {
  return category === "Trousers" || category === "Jeans"
    ? ["waist", "hip", "length"]
    : category === "Dress" || category === "Other"
      ? [...measurementKeys]
      : ["chest", "waist", "length"];
}
export const comparisonSchema = z
  .object({
    referenceId: z.uuid(),
    product: z
      .object({
        name: z.string().trim().min(2).max(100),
        brand: z.string().trim().min(1).max(80),
        category: z.enum(categories),
        labelSize: z.string().trim().min(1).max(30),
        fabric: z.string().trim().min(1).max(80),
        stretch: z.enum(stretches),
        measurements: measurementsSchema,
        source: productSourceSchema.optional(),
      })
      .strict(),
    measurementMethod: z.enum(["Circumference", "Flat width"]),
    sameMethodConfirmed: z.literal(true),
  })
  .strict();
export const feedbackOptions = [
  "Not tried yet",
  "Works well",
  "Too small",
  "Too large",
  "Mixed fit",
] as const;
export const comparisonFeedbackSchema = z
  .object({
    outcome: z.enum(feedbackOptions),
    notes: z.string().trim().max(1000),
  })
  .strict();
export type ComparisonInput = z.infer<typeof comparisonSchema>;
export type ComparisonFeedback = z.infer<typeof comparisonFeedbackSchema>;
export type MeasurementDifference = {
  key: MeasurementKey;
  reference: number | null;
  product: number | null;
  delta: number | null;
};
export type ComparisonResult = {
  rows: MeasurementDifference[];
  comparedCount: number;
  stretchChanged: boolean;
  fabricChanged: boolean;
  version: 1;
};
export type FitComparison = {
  id: string;
  ownerId: string;
  reference: Garment;
  input: ComparisonInput;
  result: ComparisonResult;
  feedback: ComparisonFeedback;
  set?: {
    id: string;
    name: string;
    position: number;
    commonMeasurements: MeasurementKey[];
  };
  shortlisted?: boolean;
  createdAt: string;
  updatedAt: string;
};

export const alternativeSetSchema = z
  .object({
    name: z.string().trim().min(2).max(100),
    referenceId: z.uuid(),
    products: z.array(comparisonSchema.shape.product).min(2).max(5),
    measurementMethod: z.enum(["Circumference", "Flat width"]),
    sameMethodConfirmed: z.literal(true),
  })
  .strict();
export const shortlistSchema = z.object({ shortlisted: z.boolean() }).strict();
export type AlternativeSetInput = z.infer<typeof alternativeSetSchema>;
export function commonAlternativeMeasurements(
  reference: Garment,
  products: ComparisonInput["product"][],
): MeasurementKey[] {
  return categoryMeasurements(reference.category).filter(
    (k) =>
      reference.measurements[k] !== undefined &&
      products.every((p) => p.measurements[k] !== undefined),
  );
}
export function rankAlternatives(checks: FitComparison[]) {
  if (!checks.length) return [];
  const common = commonAlternativeMeasurements(
    checks[0].reference,
    checks.map((c) => c.input.product),
  );
  if (!common.length) return [];
  const ordered = checks
    .map((c) => ({
      comparison: c,
      totalTenths: common.reduce(
        (n, k) =>
          n +
          Math.abs(
            Math.round(
              (c.input.product.measurements[k]! -
                c.reference.measurements[k]!) *
                10,
            ),
          ),
        0,
      ),
    }))
    .sort(
      (a, b) =>
        a.totalTenths - b.totalTenths ||
        (a.comparison.set?.position ?? 0) - (b.comparison.set?.position ?? 0),
    );
  return ordered.map((item, i) => ({
    ...item,
    common,
    meanDifference: item.totalTenths / (10 * common.length),
    rank: ordered.findIndex((x) => x.totalTenths === item.totalTenths) + 1,
  }));
}
