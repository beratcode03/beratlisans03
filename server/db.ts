// BERAT BİLAL CANKIR
// BERAT CANKIR
// CANKIR
import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import * as schema from "@shared/sema";

neonConfig.webSocketConstructor = ws;

// PostgreSQL kullanılmayacak - sadece JSON dosya sistemi (data/kayitlar.json) kullanılacak
let pool: Pool | null = null;
let db: any = null;

console.log("📁 Dosya tabanlı depolama kullanılıyor (data/kayitlar.json)");

export { pool, db };

// BERAT BİLAL CANKIR
// BERAT CANKIR
// CANKIR
