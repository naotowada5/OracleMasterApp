/**
 * Lambda デプロイパッケージのビルド。
 *
 * src/handlers/*.ts をハンドラごとに dist/<名前>/index.js へバンドルする。
 * 13_infra はこの dist を lambda.Code.fromAsset で参照する。
 *
 * CDK の NodejsFunction を使わずに自前でバンドルしているのは、NodejsFunction が
 * ローカルバンドリングに失敗するとDockerへフォールバックし、Docker未導入の環境で
 * ビルドできなくなるため。事前ビルド方式なら Docker に依存しない。
 */
import { readdir, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const handlersDir = join(root, 'src', 'handlers');
const distDir = join(root, 'dist');

const entries = (await readdir(handlersDir))
  .filter((file) => file.endsWith('.ts'))
  .map((file) => file.replace(/\.ts$/, ''));

if (entries.length === 0) {
  console.error('src/handlers にハンドラが見つかりません');
  process.exit(1);
}

await rm(distDir, { recursive: true, force: true });

for (const name of entries) {
  await build({
    entryPoints: [join(handlersDir, `${name}.ts`)],
    outfile: join(distDir, name, 'index.js'),
    bundle: true,
    platform: 'node',
    target: 'node22',
    format: 'cjs',
    minify: true,
    sourcemap: true,
    // AWS SDK v3 は Lambda ランタイムに同梱されているためバンドルしない
    external: ['@aws-sdk/*'],
    logLevel: 'warning',
  });
  console.log(`bundled: dist/${name}/index.js`);
}

console.log(`${entries.length} 件のハンドラをビルドしました`);
