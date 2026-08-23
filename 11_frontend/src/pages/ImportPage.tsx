/**
 * S-04 問題作成・インポート画面（Phase3実装 / Phase1・Phase2 は非活性）
 *
 * 対応設計書: 01_docs/02_sd/01_画面設計/個別画面設計書/S-04_問題作成インポート画面.md
 *
 * 画面自体は存在するが機能は実装しない。S-03 のボタンも非活性のため、
 * 通常の操作では到達しない（要件定義書 F-02）。
 */
import { Layout } from '../components/Layout';

export function ImportPage() {
  return (
    <Layout title="問題作成・インポート" backTo="/">
      <p className="feedback feedback--info">
        この機能は Phase3 で提供予定です。現在はご利用いただけません。
      </p>
    </Layout>
  );
}
