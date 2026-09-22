// Thin: request Auto-Protect via CLI/Core. Never claims Protected independently.
const { spawnSync } = require('child_process');
const r = spawnSync('secureai', ['status', '--platform', 'cursor'], { encoding: 'utf8' });
process.stdout.write(JSON.stringify({ continue: true, secureai: r.status === 0 ? 'queried' : 'core_unavailable' }));
