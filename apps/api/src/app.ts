import { ComparisonController, ComparisonService } from "./fit-comparison";
import { CatalogueController, CatalogueService } from "./catalogue";
import "reflect-metadata";
import { Controller, Get, Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { AuthController, AuthGuard, AuthService } from "./auth";
import { WardrobeController, WardrobeService } from "./wardrobe";
import { LocalStore } from "./local-store";
import { settings } from "./config";
@Controller("health")
class HealthController {
  @Get() health() {
    return {
      mode: settings.mode,
      cloudConnected: settings.dataMode === "supabase",
      milestone: "Your wardrobe, saved.",
    };
  }
}
@Module({
  controllers: [
    AuthController,
    WardrobeController,
    ComparisonController,
    CatalogueController,
    HealthController,
  ],
  providers: [
    { provide: LocalStore, useFactory: () => new LocalStore() },
    AuthService,
    AuthGuard,
    WardrobeService,
    ComparisonService,
    CatalogueService,
  ],
})
class AppModule {}
export async function createApp() {
  const app = await NestFactory.create(AppModule, {
    logger: process.env.NODE_ENV === "test" ? false : ["error", "warn", "log"],
  });
  app.setGlobalPrefix("api");
  app.use(helmet());
  app.use(cookieParser());
  const attempts = new Map<string, { count: number; until: number }>();
  app.use((req: any, res: any, next: any) => {
    if (
      ["POST", "PATCH", "DELETE", "PUT"].includes(req.method) &&
      req.headers.origin !== settings.origin
    )
      return res
        .status(403)
        .json({ message: "This request must come from FYTTS." });
    if (/\/auth\/(login|signup)$/.test(req.path)) {
      const now = Date.now();
      for (const [key, v] of attempts) if (v.until < now) attempts.delete(key);
      const key = req.ip || "unknown";
      const v = attempts.get(key) || { count: 0, until: now + 15 * 60000 };
      attempts.set(key, v);
      if (++v.count > 30)
        return res.status(429).json({
          message: "Too many attempts. Please try again in 15 minutes.",
        });
    }
    next();
  });
  await app.init();
  return app;
}
