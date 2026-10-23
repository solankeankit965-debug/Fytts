import { Injectable } from "@nestjs/common";
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { join } from "node:path";
import { settings } from "./config";
import type { Garment, Profile, FitComparison } from "@fytts/contracts";
export type LocalAccount = { id: string; email: string; passwordHash: string };
type Database = {
  accounts: LocalAccount[];
  profiles: Profile[];
  garments: Garment[];
  comparisons: FitComparison[];
};
@Injectable()
export class LocalStore {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(readonly directory = settings.dataDirectory) {}
  private async load(): Promise<Database> {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    try {
      const db = JSON.parse(
        await readFile(join(this.directory, "development.json"), "utf8"),
      );
      return { ...db, comparisons: db.comparisons ?? [] };
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
      return { accounts: [], profiles: [], garments: [], comparisons: [] };
    }
  }
  async read<T>(fn: (d: Database) => T): Promise<T> {
    await this.queue;
    return fn(await this.load());
  }
  async write<T>(fn: (d: Database) => T): Promise<T> {
    const operation = this.queue.then(async () => {
      const db = await this.load();
      const result = fn(db);
      const temp = join(this.directory, "development.json.tmp");
      await writeFile(temp, JSON.stringify(db), { mode: 0o600 });
      await rename(temp, join(this.directory, "development.json"));
      return result;
    });
    this.queue = operation.catch(() => undefined);
    return operation;
  }
}
