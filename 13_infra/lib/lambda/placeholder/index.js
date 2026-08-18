'use strict';

/**
 * M1（インフラ疎通確認）用のダミーハンドラ。
 *
 * Cognito Authorizer を通過したリクエストだけがここに到達することを確認するための
 * 仮実装であり、Step 2（12_backend）で各APIの実装に差し替える。
 */
exports.handler = async (event) => {
  const claims = event.requestContext?.authorizer?.claims ?? {};

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: 'Hello from Oracle Master App (placeholder)',
      method: event.httpMethod,
      path: event.path,
      // 認可情報がLambdaまで渡ってきているかの確認用（emailは出力しない）
      sub: claims.sub ?? null,
    }),
  };
};
