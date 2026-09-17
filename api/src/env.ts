import { existsSync } from 'fs';
import { join } from 'path';

// Carregado antes de tudo: o .env fica ao lado de dist/ (C:\EscolaApp\.env em produção).
const envPath = join(process.cwd(), '.env');
if (existsSync(envPath)) process.loadEnvFile(envPath);
process.env.CHECKPOINT_DISABLE ??= '1';
process.env.TZ ??= 'Africa/Luanda';
