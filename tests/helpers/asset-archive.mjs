/** Small third-party archives: real extraction inputs, with no network or installed toolchain. */
import { createWriteStream } from 'node:fs';
import { chmod, mkdir, readFile, symlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import * as tar from 'tar';
import yazl from 'yazl';

export async function writeAssetArchive(root, {
  format = 'tar.gz',
  files = { 'wrapper/bin/tool': '#!/bin/sh\nprintf "archive-member-ok\\n"\n' },
  links = {},
} = {}) {
  await mkdir(root, { recursive: true });
  const path = join(root, `asset.${format}`);
  if (format === 'zip') {
    const zip = new yazl.ZipFile();
    const output = pipeline(zip.outputStream, createWriteStream(path));
    for (const [name, contents] of Object.entries(files)) {
      zip.addBuffer(Buffer.from(contents), name, { mode: 0o100755 });
    }
    for (const [name, target] of Object.entries(links)) {
      zip.addBuffer(Buffer.from(target), name, { mode: 0o120777 });
    }
    zip.end();
    await output;
  } else {
    const source = join(root, 'source');
    for (const [name, contents] of Object.entries(files)) {
      await mkdir(dirname(join(source, name)), { recursive: true });
      await writeFile(join(source, name), contents);
      if (process.platform !== 'win32') await chmod(join(source, name), 0o755);
    }
    for (const [name, target] of Object.entries(links)) {
      await mkdir(dirname(join(source, name)), { recursive: true });
      await symlink(target, join(source, name));
    }
    await tar.c({ file: path, cwd: source, gzip: format === 'tar.gz' }, [
      ...Object.keys(files), ...Object.keys(links),
    ]);
  }
  return { path, bytes: await readFile(path) };
}
