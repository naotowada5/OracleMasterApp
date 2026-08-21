#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { buildConfig, ENV_NAMES, EnvName } from '../lib/config/environments';
import { ApiStack } from '../lib/stacks/api-stack';
import { AuthStack } from '../lib/stacks/auth-stack';
import { DataStack } from '../lib/stacks/data-stack';
import { MonitoringStack } from '../lib/stacks/monitoring-stack';

const app = new cdk.App();

// 対象環境はコンテキストで切り替える（既定値は cdk.json の env=dev）
//   例) cdk deploy -c env=stg -c frontendOrigin=https://stg.example.com --all
const envName = app.node.tryGetContext('env') as EnvName;

if (!ENV_NAMES.includes(envName)) {
  throw new Error(
    `不正な環境名です: ${String(envName)}。-c env=<${ENV_NAMES.join('|')}> を指定してください。`,
  );
}

const config = buildConfig({
  envName,
  frontendOrigin: app.node.tryGetContext('frontendOrigin'),
  alarmEmail: app.node.tryGetContext('alarmEmail'),
});

// 単一リージョン構成（テーブル一覧 §DynamoDB共通仕様）
const env: cdk.Environment = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION,
};

const stackPrefix = `OracleMasterApp-${config.envName}`;

const authStack = new AuthStack(app, `${stackPrefix}-Auth`, {
  env,
  config,
  description: `Oracle Master 資格問題アプリ 認証基盤 (${config.envName})`,
});

const dataStack = new DataStack(app, `${stackPrefix}-Data`, {
  env,
  config,
  description: `Oracle Master 資格問題アプリ データストア (${config.envName})`,
});

const apiStack = new ApiStack(app, `${stackPrefix}-Api`, {
  env,
  config,
  userPool: authStack.userPool,
  tables: dataStack.tables,
  description: `Oracle Master 資格問題アプリ API (${config.envName})`,
});

new MonitoringStack(app, `${stackPrefix}-Monitoring`, {
  env,
  config,
  restApiName: apiStack.restApi.restApiName,
  tableNames: Object.values(dataStack.tables).map((table) => table.tableName),
  description: `Oracle Master 資格問題アプリ 監視 (${config.envName})`,
});

cdk.Tags.of(app).add('Project', 'OracleMasterApp');
cdk.Tags.of(app).add('Environment', config.envName);

app.synth();
