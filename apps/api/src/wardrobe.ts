import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Injectable,
  NotFoundException,
  Param,
  Patch,
  Post,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Response } from "express";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import {
  garmentSchema,
  profileSchema,
  type Garment,
  type GarmentInput,
  type Profile,
} from "@fytts/contracts";
import { AuthGuard, type UserRequest } from "./auth";
import { cloud } from "./cloud";
import { settings } from "./config";
import { LocalStore } from "./local-store";
@Injectable()
export class WardrobeService {
  constructor(@Inject(LocalStore) private readonly store: LocalStore) {}
  private decode(r: any): Garment {
    return {
      ...r.data,
      id: r.id,
      ownerId: r.owner_id,
      imagePath: r.image_path,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  }
  private check(error: any) {
    if (error)
      throw new BadRequestException(
        "Your change could not be saved. Please try again.",
      );
  }
  async profile(req: UserRequest): Promise<Profile> {
    if (settings.dataMode === "file")
      return this.store.read((d) =>
        d.profiles.find((p) => p.id === req.identity.id)!,
      );
    const c = cloud(req.accessToken);
    const { data, error } = await c
      .from("profiles")
      .select("*")
      .eq("id", req.identity.id)
      .maybeSingle();
    this.check(error);
    if (data) return { id: data.id, ...data.data };
    const p = { displayName: "", preferredFit: "Relaxed" };
    const result = await c
      .from("profiles")
      .upsert(
        { id: req.identity.id, data: p },
        { onConflict: "id", ignoreDuplicates: true },
      );
    this.check(result.error);
    const saved = await c
      .from("profiles")
      .select("*")
      .eq("id", req.identity.id)
      .single();
    this.check(saved.error);
    return { id: req.identity.id, ...saved.data!.data };
  }
  async saveProfile(req: UserRequest, raw: unknown) {
    const v = profileSchema.safeParse(raw);
    if (!v.success)
      throw new BadRequestException("Enter a name and fit preference.");
    if (settings.dataMode === "file")
      return this.store.write((d) => {
        const p = { id: req.identity.id, ...v.data };
        d.profiles = d.profiles.filter((p) => p.id !== req.identity.id);
        d.profiles.push(p);
        return p;
      });
    const { error } = await cloud(req.accessToken)
      .from("profiles")
      .upsert({ id: req.identity.id, data: v.data });
    this.check(error);
    return { id: req.identity.id, ...v.data };
  }
  async list(req: UserRequest) {
    if (settings.dataMode === "file")
      return this.store.read((d) =>
        d.garments
          .filter((g) => g.ownerId === req.identity.id)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      );
    const { data, error } = await cloud(req.accessToken)
      .from("garments")
      .select("*")
      .eq("owner_id", req.identity.id)
      .order("created_at", { ascending: false });
    this.check(error);
    return (data || []).map((r) => this.decode(r));
  }
  async get(req: UserRequest, id: string) {
    const g = (await this.list(req)).find((g) => g.id === id);
    if (!g) throw new NotFoundException("Garment not found.");
    return g;
  }
  validate(raw: unknown): GarmentInput {
    const v = garmentSchema.safeParse(raw);
    if (!v.success)
      throw new BadRequestException(
        v.error.issues
          .map((i) => i.path.join(".") + ": " + i.message)
          .join("; "),
      );
    return v.data;
  }
  async save(req: UserRequest, raw: unknown, id?: string) {
    const data = this.validate(raw);
    const old = id ? await this.get(req, id) : null;
    const now = new Date().toISOString();
    const g: Garment = {
      ...data,
      id: old?.id || randomUUID(),
      ownerId: req.identity.id,
      imagePath: old?.imagePath || null,
      createdAt: old?.createdAt || now,
      updatedAt: now,
    };
    if (settings.dataMode === "file")
      return this.store.write((d) => {
        d.garments = d.garments.filter((x) => x.id !== g.id);
        d.garments.push(g);
        return g;
      });
    const row = {
      id: g.id,
      owner_id: g.ownerId,
      data,
      image_path: g.imagePath,
      created_at: g.createdAt,
      updated_at: now,
    };
    const { error } = await cloud(req.accessToken).from("garments").upsert(row);
    this.check(error);
    return g;
  }
  private async removeImage(req: UserRequest, path: string) {
    if (settings.dataMode === "file") {
      await unlink(join(this.store.directory, "images", path)).catch((e) => {
        if (e.code !== "ENOENT") throw e;
      });
    } else {
      const { error } = await cloud(req.accessToken)
        .storage.from(settings.bucket)
        .remove([path]);
      this.check(error);
    }
  }
  async delete(req: UserRequest, id: string) {
    const g = await this.get(req, id);
    if (g.imagePath) await this.removeImage(req, g.imagePath);
    if (settings.dataMode === "file")
      await this.store.write((d) => {
        d.garments = d.garments.filter(
          (g) => g.id !== id || g.ownerId !== req.identity.id,
        );
      });
    else {
      const { error } = await cloud(req.accessToken)
        .from("garments")
        .delete()
        .eq("id", id)
        .eq("owner_id", req.identity.id);
      this.check(error);
    }
    return { ok: true };
  }
  async upload(req: UserRequest, id: string, file?: Express.Multer.File) {
    const g = await this.get(req, id);
    if (!file) throw new BadRequestException("Choose an image.");
    const b = file.buffer;
    const type = b
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      ? "image/png"
      : b[0] === 255 && b[1] === 216 && b[2] === 255
        ? "image/jpeg"
        : b.toString("ascii", 0, 4) === "RIFF" &&
            b.toString("ascii", 8, 12) === "WEBP"
          ? "image/webp"
          : null;
    if (!type || type !== file.mimetype)
      throw new BadRequestException(
        "Use a JPEG, PNG or WebP image under 5 MB.",
      );
    const path =
      settings.dataMode === "file"
        ? randomUUID() + "." + type.split("/")[1]
        : req.identity.id +
          "/" +
          id +
          "/" +
          randomUUID() +
          "." +
          type.split("/")[1];
    if (settings.dataMode === "file") {
      await mkdir(join(this.store.directory, "images"), {
        recursive: true,
        mode: 0o700,
      });
      await writeFile(join(this.store.directory, "images", path), b, {
        mode: 0o600,
      });
    } else {
      const { error } = await cloud(req.accessToken)
        .storage.from(settings.bucket)
        .upload(path, b, { contentType: type, upsert: false });
      this.check(error);
    }
    const updatedAt = new Date().toISOString();
    try {
      if (settings.dataMode === "file")
        await this.store.write((d) => {
          const x = d.garments.find(
            (x) => x.id === id && x.ownerId === req.identity.id,
          )!;
          x.imagePath = path;
          x.updatedAt = updatedAt;
        });
      else {
        const { error } = await cloud(req.accessToken)
          .from("garments")
          .update({ image_path: path, updated_at: updatedAt })
          .eq("id", id)
          .eq("owner_id", req.identity.id);
        this.check(error);
      }
    } catch (e) {
      await this.removeImage(req, path);
      throw e;
    }
    if (g.imagePath) await this.removeImage(req, g.imagePath);
    return { ...g, imagePath: path, updatedAt };
  }
  async image(req: UserRequest, id: string) {
    const g = await this.get(req, id);
    if (!g.imagePath) throw new NotFoundException();
    if (settings.dataMode === "file")
      return {
        buffer: await readFile(
          join(this.store.directory, "images", g.imagePath),
        ),
        type: "image/" + g.imagePath.split(".").pop(),
      };
    const { data, error } = await cloud(req.accessToken)
      .storage.from(settings.bucket)
      .download(g.imagePath);
    this.check(error);
    return { buffer: Buffer.from(await data!.arrayBuffer()), type: data!.type };
  }
}
@Controller()
@UseGuards(AuthGuard)
export class WardrobeController {
  constructor(
    @Inject(WardrobeService) private readonly service: WardrobeService,
  ) {}
  @Get("session") async session(@Req() r: UserRequest) {
    return {
      user: r.identity,
      profile: await this.service.profile(r),
      mode: settings.mode,
    };
  }
  @Patch("profile") profile(@Req() r: UserRequest, @Body() b: unknown) {
    return this.service.saveProfile(r, b);
  }
  @Get("garments") list(@Req() r: UserRequest) {
    return this.service.list(r);
  }
  @Post("garments") create(@Req() r: UserRequest, @Body() b: unknown) {
    return this.service.save(r, b);
  }
  @Get("garments/:id") get(@Req() r: UserRequest, @Param("id") id: string) {
    return this.service.get(r, id);
  }
  @Patch("garments/:id") update(
    @Req() r: UserRequest,
    @Param("id") id: string,
    @Body() b: unknown,
  ) {
    return this.service.save(r, b, id);
  }
  @Delete("garments/:id") delete(
    @Req() r: UserRequest,
    @Param("id") id: string,
  ) {
    return this.service.delete(r, id);
  }
  @Post("garments/:id/image")
  @UseInterceptors(
    FileInterceptor("image", {
      limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 0 },
    }),
  )
  upload(
    @Req() r: UserRequest,
    @Param("id") id: string,
    @UploadedFile() f: Express.Multer.File,
  ) {
    return this.service.upload(r, id, f);
  }
  @Get("garments/:id/image") async image(
    @Req() r: UserRequest,
    @Param("id") id: string,
    @Res() res: Response,
  ) {
    const i = await this.service.image(r, id);
    res
      .set({
        "Content-Type": i.type,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      })
      .send(i.buffer);
  }
}
