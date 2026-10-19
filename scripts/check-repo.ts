/** Check Git's candidate paths without opening local state or credential files. */
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const candidates = Bun.spawn(['git', 'ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: root, stdout: 'pipe', stderr: 'inherit' });
const paths = (await new Response(candidates.stdout).text()).split('\0').filter(Boolean);
if (await candidates.exited !== 0) process.exit(1);
const privatePath = /^(?:data|workspace)\/|(^|\/)(?:node_modules|dist|coverage|\.wrangler|\.cloudflare)\/|(^|\/)(?:\.env(?:\.|$)|\.dev\.vars(?:\.|$)|prod\.secrets\.env)|\.(?:pem|key|p12|pfx|db|sqlite|sqlite3)(?:[-.]|$)/;
const unsafe = paths.filter(path => !path.endsWith('.example') && privatePath.test(path));
if (unsafe.length) { console.error('Private or generated paths would enter the repository:\n' + unsafe.join('\n')); process.exit(1); }
const excluded = ['data/launch.db', 'workspace/identity.yaml', '.env.local'];
const ignored = Bun.spawn(['git', 'check-ignore', '--stdin'], { cwd: root, stdin: 'pipe', stdout: 'pipe', stderr: 'inherit' });
ignored.stdin.write(excluded.join('\n') + '\n'); ignored.stdin.end();
const actual = new Set((await new Response(ignored.stdout).text()).trim().split('\n'));
await ignored.exited;
const missing = excluded.filter(path => !actual.has(path));
if (missing.length) { console.error('Missing Git exclusions:\n' + missing.join('\n')); process.exit(1); }
console.log(`Repository path check passed (${paths.length} candidate files). No private state or credential files read.`);
