/**
 * S-03 メイン画面
 *
 * 対応設計書: 01_docs/02_sd/01_画面設計/個別画面設計書/S-03_メイン画面.md
 *
 * 「問題作成・インポート」は Phase3 実装のため非活性で表示する（要件定義書 F-02）。
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getCurrentUser } from '../api/endpoints';
import { toDisplayMessage } from '../api/client';
import { Layout } from '../components/Layout';
import { ErrorMessage, Loading } from '../components/Feedback';

export function HomePage() {
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    getCurrentUser()
      .then((user) => {
        if (!cancelled) setDisplayName(user.displayName);
      })
      .catch((caught) => {
        if (!cancelled) setError(toDisplayMessage(caught));
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Layout title="Oracle Master 学習" showSignOut>
      {isLoading && <Loading />}
      {error && <ErrorMessage message={error} />}
      {displayName && <p className="home__greeting">{displayName} さん</p>}

      <nav className="home__menu">
        <button
          type="button"
          className="button button--primary button--large"
          onClick={() => navigate('/exam/settings')}
        >
          問題スタート
        </button>

        <button
          type="button"
          className="button button--large"
          onClick={() => navigate('/questions')}
        >
          問題閲覧
        </button>

        {/* Phase3 で実装。Phase1・Phase2 は非活性（要件定義書 F-02） */}
        <button
          type="button"
          className="button button--large"
          disabled
          title="Phase3で提供予定です"
        >
          問題作成・インポート
        </button>
      </nav>
    </Layout>
  );
}
