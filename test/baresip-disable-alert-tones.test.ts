import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const temporaryDirectories: string[] = [];
const scriptPath = fileURLToPath(
  new URL('../baresip/scripts/disable-alert-tones.sh', import.meta.url),
);

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe('disable-alert-tones config patch', () => {
  it('sets ring/alert tone files to none without changing audio devices', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'baresip-tones-'));
    temporaryDirectories.push(directory);
    const configPath = join(directory, 'config');
    await writeFile(
      configPath,
      [
        'audio_player            alsa,default',
        'audio_source            alsa,default',
        'audio_alert             alsa,default',
        '#ring_aufile            ring.wav',
        '#ringback_aufile        ringback.wav',
        '#menu_message_tone      yes',
        '',
      ].join('\n'),
      'utf8',
    );

    await execFileAsync('bash', [scriptPath, configPath]);
    const patched = await readFile(configPath, 'utf8');

    expect(patched).toContain('audio_player            alsa,default');
    expect(patched).toContain('audio_source            alsa,default');
    expect(patched).toContain('audio_alert             alsa,default');
    expect(patched).toMatch(/^ring_aufile\s+none$/m);
    expect(patched).toMatch(/^ringback_aufile\s+none$/m);
    expect(patched).toMatch(/^callwaiting_aufile\s+none$/m);
    expect(patched).toMatch(/^menu_message_tone\s+no$/m);
    expect(patched).not.toMatch(/^#ring_aufile/m);
  });
});
