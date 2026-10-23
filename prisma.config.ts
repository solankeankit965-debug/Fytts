import { defineConfig } from "prisma/config";
export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: process.env.DIRECT_URL || "postgresql://localhost:5432/fytts",
  },
});
