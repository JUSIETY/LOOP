import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import path from 'node:path';
// Reuse generated binding configuration, with Drizzle SQL files as Wrangler migrations.
const configPath='dist/server/wrangler.json';
if(!existsSync(configPath)){console.error('먼저 npm run build를 실행해 주세요.');process.exit(1)}
const cfg=JSON.parse(readFileSync(configPath,'utf8'));
for(const db of cfg.d1_databases||[])db.migrations_dir=path.resolve('drizzle');
// Absolute paths preserve the build configuration after moving the scratch config.
cfg.main=path.resolve('dist/server',cfg.main||'index.js');
if(cfg.assets?.directory)cfg.assets.directory=path.resolve('dist/server',cfg.assets.directory);
mkdirSync('.sites-runtime',{recursive:true});
const localConfig=path.resolve('.sites-runtime/local-migrations.json');writeFileSync(localConfig,JSON.stringify(cfg));
const result=spawnSync(process.execPath,['--import','./scripts/sites-env.mjs','./node_modules/wrangler/bin/wrangler.js','d1','migrations','apply','DB','--local','--config',localConfig,'--persist-to',process.env.LOOP_DB_STATE||'.wrangler/state'],{stdio:'inherit'});
process.exit(result.status??1);
