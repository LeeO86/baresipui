import {
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  updateAccountAudioDevicesAtomic,
  withAccountAudioTransaction,
} from '~/server/services/accounts-file';

const temporaryDirectories: string[] = [];

async function temporaryAccountsPath(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'account-audio-test-'));
  temporaryDirectories.push(directory);
  return join(directory, 'accounts');
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe('lossless account audio transactions', () => {
  it('edits only audio values while preserving disabled lines, comments, unknown params, CRLF, and formatting', async () => {
    const accountsPath = await temporaryAccountsPath();
    const original = [
      '# generated account file - preserve this comment',
      '  #  "Studio"<SIP:Studio@Example.COM>;transport=tcp;audio_source=alsa,old-in;vendor_magic=keep me;audio_player=alsa,old-out;empty=  ',
      '"Other"<sip:other@example.com>;audio_source=alsa,other;audio_player=alsa,other-out',
      '',
    ].join('\r\n');
    const expected = original
      .replace('audio_source=alsa,old-in', 'audio_source=mediasoup,studio')
      .replace('audio_player=alsa,old-out', 'audio_player=mediasoup,studio');
    await writeFile(accountsPath, original, { encoding: 'utf8', mode: 0o640 });

    const result = await updateAccountAudioDevicesAtomic(
      accountsPath,
      'studio@example.com',
      {
        audioSource: 'mediasoup,studio',
        audioPlayer: 'mediasoup,studio',
      },
    );

    expect(result).toEqual({
      found: true,
      changed: true,
      before: {
        accountUri: 'sip:studio@example.com',
        audioSource: 'alsa,old-in',
        audioPlayer: 'alsa,old-out',
        audioSourcePresent: true,
        audioPlayerPresent: true,
      },
      after: {
        accountUri: 'sip:studio@example.com',
        audioSource: 'mediasoup,studio',
        audioPlayer: 'mediasoup,studio',
        audioSourcePresent: true,
        audioPlayerPresent: true,
      },
    });
    expect(await readFile(accountsPath, 'utf8')).toBe(expected);
    expect((await stat(accountsPath)).mode & 0o777).toBe(0o640);
  });

  it('tracks parameter absence and restores the exact original bytes after rollback', async () => {
    const accountsPath = await temporaryAccountsPath();
    const original = [
      '; preamble with no final normalization',
      '"Studio"<sip:studio@example.com>;transport=udp;unknown=untouched   ',
      '# trailing comment',
    ].join('\r\n');
    await writeFile(accountsPath, original, 'utf8');

    await expect(
      withAccountAudioTransaction(accountsPath, async (transaction) => {
        expect(transaction.getAccountAudioDevices('studio@example.com')).toEqual({
          accountUri: 'sip:studio@example.com',
          audioSource: '',
          audioPlayer: '',
          audioSourcePresent: false,
          audioPlayerPresent: false,
        });
        const edit = transaction.setAccountAudioDevices('studio@example.com', {
          audioSource: 'mediasoup,studio',
          audioPlayer: 'mediasoup,studio',
        });
        expect(edit.after).toMatchObject({
          audioSourcePresent: true,
          audioPlayerPresent: true,
        });
        await expect(transaction.commit()).resolves.toBe(true);
        expect(await readFile(accountsPath, 'utf8')).not.toBe(original);
        throw new Error('simulated later config failure');
      }),
    ).rejects.toThrow('simulated later config failure');

    expect(await readFile(accountsPath, 'utf8')).toBe(original);
  });

  it('removes absent/empty audio parameters without rewriting unrelated bytes', async () => {
    const accountsPath = await temporaryAccountsPath();
    const original =
      '"Studio"<sip:studio@example.com>;audio_source=;unknown=x;audio_player=;transport=udp\n';
    await writeFile(accountsPath, original, 'utf8');

    await updateAccountAudioDevicesAtomic(accountsPath, 'studio@example.com', {
      audioSource: null,
      audioPlayer: null,
    });

    expect(await readFile(accountsPath, 'utf8')).toBe(
      '"Studio"<sip:studio@example.com>;unknown=x;transport=udp\n',
    );
  });
});
