import {
  BadRequestException,
  ConflictException,
  Body,
  Controller,
  Get,
  Inject,
  Injectable,
  NotFoundException,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import {
  categoryMeasurements,
  comparisonSchema,
  comparisonFeedbackSchema,
  alternativeSetSchema,
  shortlistSchema,
  commonAlternativeMeasurements,
  type ComparisonInput,
  type ComparisonResult,
  type FitComparison,
  type Garment,
} from "@fytts/contracts";
import { AuthGuard, type UserRequest } from "./auth";
import { WardrobeService } from "./wardrobe";
import { LocalStore } from "./local-store";
import { settings } from "./config";
import { cloud } from "./cloud";
export function compareMeasurements(
  reference: Garment,
  input: ComparisonInput,
): ComparisonResult {
  if (reference.category !== input.product.category)
    throw new BadRequestException(
      "Choose a reference from the same garment category.",
    );
  const rows = categoryMeasurements(reference.category).map((key) => {
    const a = reference.measurements[key] ?? null,
      b = input.product.measurements[key] ?? null;
    return {
      key,
      reference: a,
      product: b,
      delta: a === null || b === null ? null : Math.round((b - a) * 10) / 10,
    };
  });
  const comparedCount = rows.filter((r) => r.delta !== null).length;
  if (!comparedCount)
    throw new BadRequestException(
      "Add at least one matching measurement to both garments before comparing.",
    );
  return {
    rows,
    comparedCount,
    stretchChanged: reference.stretch !== input.product.stretch,
    fabricChanged:
      reference.fabric.trim().toLowerCase() !==
      input.product.fabric.trim().toLowerCase(),
    version: 1,
  };
}
@Injectable()
export class ComparisonService {
  constructor(
    @Inject(LocalStore) private readonly store: LocalStore,
    @Inject(WardrobeService) private readonly wardrobe: WardrobeService,
  ) {}
  private check(error: unknown) {
    if (error)
      throw new BadRequestException(
        "Could not save your comparison. Please try again.",
      );
  }
  private decode(row: any): FitComparison {
    return {
      ...row.data,
      id: row.id,
      ownerId: row.owner_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
  async list(req: UserRequest): Promise<FitComparison[]> {
    if (settings.dataMode === "file")
      return this.store.read((d) =>
        d.comparisons
          .filter((c) => c.ownerId === req.identity.id)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      );
    const { data, error } = await cloud(req.accessToken)
      .from("comparisons")
      .select("*")
      .eq("owner_id", req.identity.id)
      .order("created_at", { ascending: false });
    this.check(error);
    return (data || []).map((r) => this.decode(r));
  }
  async get(req: UserRequest, id: string) {
    if (settings.dataMode === "file") {
      const c = await this.store.read((d) =>
        d.comparisons.find((c) => c.id === id && c.ownerId === req.identity.id),
      );
      if (!c) throw new NotFoundException("Comparison not found.");
      return c;
    }
    const { data, error } = await cloud(req.accessToken)
      .from("comparisons")
      .select("*")
      .eq("id", id)
      .eq("owner_id", req.identity.id)
      .maybeSingle();
    this.check(error);
    if (!data) throw new NotFoundException("Comparison not found.");
    return this.decode(data);
  }
  async create(req: UserRequest, raw: unknown) {
    const parsed = comparisonSchema.safeParse(raw);
    if (!parsed.success)
      throw new BadRequestException(
        "Check the product details and confirm both garments use the same measurement method.",
      );
    const input = parsed.data;
    const reference = await this.wardrobe.get(req, input.referenceId);
    const result = compareMeasurements(reference, input);
    const now = new Date().toISOString();
    const c: FitComparison = {
      id: randomUUID(),
      ownerId: req.identity.id,
      reference: structuredClone(reference),
      input,
      result,
      feedback: { outcome: "Not tried yet", notes: "" },
      createdAt: now,
      updatedAt: now,
    };
    if (settings.dataMode === "file")
      return this.store.write((d) => {
        d.comparisons.push(c);
        return c;
      });
    const { error } = await cloud(req.accessToken)
      .from("comparisons")
      .insert({
        id: c.id,
        owner_id: c.ownerId,
        data: { reference: c.reference, input, result, feedback: c.feedback },
        created_at: now,
        updated_at: now,
      });
    this.check(error);
    return c;
  }
  async createSet(req: UserRequest, raw: unknown) {
    const parsed = alternativeSetSchema.safeParse(raw);
    if (!parsed.success)
      throw new BadRequestException(
        "Enter a name, two to five alternatives, and confirm the shared measurement method.",
      );
    const input = parsed.data,
      reference = await this.wardrobe.get(req, input.referenceId);
    const results = input.products.map((product) =>
      compareMeasurements(reference, {
        referenceId: reference.id,
        product,
        measurementMethod: input.measurementMethod,
        sameMethodConfirmed: true,
      }),
    );
    const common = commonAlternativeMeasurements(reference, input.products);
    if (!common.length)
      throw new BadRequestException(
        "Add at least one of the same measurements to the reference and every alternative so they can be compared fairly.",
      );
    const setId = randomUUID(),
      now = new Date().toISOString();
    const records: FitComparison[] = input.products.map(
      (product, position) => ({
        id: randomUUID(),
        ownerId: req.identity.id,
        reference: structuredClone(reference),
        input: {
          referenceId: reference.id,
          product,
          measurementMethod: input.measurementMethod,
          sameMethodConfirmed: true,
        },
        result: results[position],
        feedback: { outcome: "Not tried yet", notes: "" },
        set: {
          id: setId,
          name: input.name,
          position,
          commonMeasurements: common,
        },
        shortlisted: false,
        createdAt: now,
        updatedAt: now,
      }),
    );
    if (settings.dataMode === "file")
      return this.store.write((d) => {
        d.comparisons.push(...records);
        return records;
      });
    const { error } = await cloud(req.accessToken)
      .from("comparisons")
      .insert(
        records.map((c) => ({
          id: c.id,
          owner_id: c.ownerId,
          data: this.data(c),
          created_at: c.createdAt,
          updated_at: c.updatedAt,
        })),
      );
    this.check(error);
    return records;
  }
  private data(record: FitComparison) {
    const { id, ownerId, createdAt, updatedAt, ...data } = record;
    return data;
  }
  private async change(
    req: UserRequest,
    id: string,
    update: (c: FitComparison) => FitComparison,
  ) {
    if (settings.dataMode === "file")
      return this.store.write((d) => {
        const index = d.comparisons.findIndex(
          (c) => c.id === id && c.ownerId === req.identity.id,
        );
        if (index < 0) throw new NotFoundException("Comparison not found.");
        const old = d.comparisons[index];
        const next = update(old);
        next.updatedAt = new Date(
          Math.max(Date.now(), Date.parse(old.updatedAt) + 1),
        ).toISOString();
        d.comparisons[index] = next;
        return next;
      });
    const old = await this.get(req, id),
      next = update(old);
    next.updatedAt = new Date(
      Math.max(Date.now(), Date.parse(old.updatedAt) + 1),
    ).toISOString();
    const { data, error } = await cloud(req.accessToken)
      .from("comparisons")
      .update({ data: this.data(next), updated_at: next.updatedAt })
      .eq("id", id)
      .eq("owner_id", req.identity.id)
      .eq("updated_at", old.updatedAt)
      .select("*")
      .maybeSingle();
    this.check(error);
    if (!data)
      throw new ConflictException(
        "This check changed. Reopen it and try again.",
      );
    return this.decode(data);
  }
  async feedback(req: UserRequest, id: string, raw: unknown) {
    const parsed = comparisonFeedbackSchema.safeParse(raw);
    if (!parsed.success)
      throw new BadRequestException(
        "Choose a fit outcome and keep notes under 1,000 characters.",
      );
    return this.change(req, id, (c) => ({ ...c, feedback: parsed.data }));
  }
  async shortlist(req: UserRequest, id: string, raw: unknown) {
    const parsed = shortlistSchema.safeParse(raw);
    if (!parsed.success)
      throw new BadRequestException(
        "Choose whether to shortlist this alternative.",
      );
    return this.change(req, id, (c) => {
      if (!c.set)
        throw new BadRequestException(
          "Only alternatives from a saved search can be shortlisted.",
        );
      return { ...c, shortlisted: parsed.data.shortlisted };
    });
  }
}
@Controller("comparisons")
@UseGuards(AuthGuard)
export class ComparisonController {
  constructor(
    @Inject(ComparisonService) private readonly service: ComparisonService,
  ) {}
  @Get() list(@Req() r: UserRequest) {
    return this.service.list(r);
  }
  @Post() create(@Req() r: UserRequest, @Body() body: unknown) {
    return this.service.create(r, body);
  }
  @Post("sets") createSet(@Req() r: UserRequest, @Body() body: unknown) {
    return this.service.createSet(r, body);
  }
  @Patch(":id/shortlist") shortlist(
    @Req() r: UserRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.service.shortlist(r, id, body);
  }
  @Get(":id") get(@Req() r: UserRequest, @Param("id") id: string) {
    return this.service.get(r, id);
  }
  @Patch(":id/feedback") feedback(
    @Req() r: UserRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.service.feedback(r, id, body);
  }
}
