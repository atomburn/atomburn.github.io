// Isolated local PostgreSQL cluster; never points to an existing Supabase database.
import { mkdtemp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync,spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
const bin=process.env.POSTGRES_BIN??'/opt/homebrew/opt/postgresql@15/bin';
const dir=await mkdtemp(join(tmpdir(),'moodies-pg-'));
const server=createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const port=server.address().port;await new Promise(resolve=>server.close(resolve));
let started=false;
try{
 execFileSync(`${bin}/initdb`,['-D',join(dir,'data'),'-A','trust','--no-locale'],{stdio:'ignore'});
 execFileSync(`${bin}/pg_ctl`,['-D',join(dir,'data'),'-l',join(dir,'postgres.log'),'-o',`-k ${dir} -p ${port} -h ''`,'-w','start'],{stdio:'ignore'});started=true;
 const result=spawnSync(process.execPath,['--test','tests/database.test.mjs'],{stdio:'inherit',env:{...process.env,MOODIES_TEST_DB:JSON.stringify({host:dir,port,database:'postgres',user:process.env.USER})}});
 process.exitCode=result.status??1;
}finally{
 if(started)execFileSync(`${bin}/pg_ctl`,['-D',join(dir,'data'),'-m','immediate','-w','stop'],{stdio:'ignore'});
 await rm(dir,{recursive:true,force:true});
}
