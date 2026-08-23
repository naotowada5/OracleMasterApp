/**
 * ビルド出力先（dist）を削除する。
 *
 * ## なぜ専用スクリプトが必要か
 *
 * Node.js 24 系の Windows 版には、**パスに非ASCII文字を含むディレクトリを
 * `fs.rm`/`fs.rmSync` の `recursive: true` で削除するとプロセスごと落ちる**
 * 不具合がある（終了コード 0xC0000409 / STATUS_STACK_BUFFER_OVERRUN。
 * エラーではなく即死するため try/catch でも拾えない）。
 * 本リポジトリのパスは `...\資格問題アプリ\...` を含むため直撃する。
 *
 * Vite の emptyOutDir がこの API を使っており、dist に1ファイルでも
 * 残っているとビルドが必ず落ちる（空なら再現しない）。出力先が存在しなければ
 * emptyOutDir は何もしないので、ビルド前にここで消しておく。
 *
 * 本プロジェクトの想定ランタイムは Node.js 22.x（`.nvmrc`）。Node.js 22 では
 * 再現しないため、22 系に揃えればこのスクリプトは不要になる。
 */
import { lstatSync, readdirSync, rmdirSync, unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** fs.rmSync(recursive) を使わずに再帰削除する */
function removeRecursively(target) {
  if (lstatSync(target).isDirectory()) {
    for (const entry of readdirSync(target)) {
      removeRecursively(join(target, entry));
    }
    rmdirSync(target);
    return;
  }
  unlinkSync(target);
}

const distDir = fileURLToPath(new URL('../dist', import.meta.url));

if (existsSync(distDir)) {
  removeRecursively(distDir);
}
