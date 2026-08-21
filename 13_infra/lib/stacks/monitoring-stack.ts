import { CfnOutput, Duration, Stack, StackProps } from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as actions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as subscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import { Construct } from 'constructs';
import { EnvironmentConfig } from '../config/environments';

export interface MonitoringStackProps extends StackProps {
  readonly config: EnvironmentConfig;
  /** 監視対象のAPI Gateway名（RestApi.restApiName） */
  readonly restApiName: string;
  /** 監視対象のDynamoDBテーブル名（環境プレフィックス込み） */
  readonly tableNames: string[];
}

/**
 * 監視・アラートスタック。
 *
 * 対応タスク: T1-6
 * 対応設計書: 01_docs/02_sd/04_共通設計/ログ・監視設計.md §2, §3
 */
export class MonitoringStack extends Stack {
  public readonly alarmTopic: sns.Topic;

  constructor(scope: Construct, id: string, props: MonitoringStackProps) {
    super(scope, id, props);

    const { config, restApiName, tableNames } = props;

    // ------------------------------------------------------------------
    // 通知先（ログ・監視設計 §3: CloudWatch Alarm → SNS → 運用担当者メール）
    // ------------------------------------------------------------------
    this.alarmTopic = new sns.Topic(this, 'AlarmTopic', {
      topicName: `oracle-master-app-${config.envName}-alarm`,
      displayName: `Oracle Master App アラート (${config.envName})`,
    });

    if (config.alarmEmail) {
      this.alarmTopic.addSubscription(new subscriptions.EmailSubscription(config.alarmEmail));
    }

    const alarmAction = new actions.SnsAction(this.alarmTopic);

    const apiDimensions = { ApiName: restApiName };
    const period = Duration.minutes(5);

    const apiCount = new cloudwatch.Metric({
      namespace: 'AWS/ApiGateway',
      metricName: 'Count',
      dimensionsMap: apiDimensions,
      statistic: 'Sum',
      period,
    });
    const api4xx = new cloudwatch.Metric({
      namespace: 'AWS/ApiGateway',
      metricName: '4XXError',
      dimensionsMap: apiDimensions,
      statistic: 'Sum',
      period,
    });
    const api5xx = new cloudwatch.Metric({
      namespace: 'AWS/ApiGateway',
      metricName: '5XXError',
      dimensionsMap: apiDimensions,
      statistic: 'Sum',
      period,
    });

    // ------------------------------------------------------------------
    // 監視項目1: APIエラー率（4xx/5xx比率）5%超過
    // ------------------------------------------------------------------
    const errorRate = new cloudwatch.MathExpression({
      expression: 'IF(count > 0, (errors4xx + errors5xx) / count * 100, 0)',
      usingMetrics: { count: apiCount, errors4xx: api4xx, errors5xx: api5xx },
      label: 'APIエラー率(%)',
      period,
    });

    const errorRateAlarm = new cloudwatch.Alarm(this, 'ApiErrorRateAlarm', {
      alarmName: `oracle-master-app-${config.envName}-api-error-rate`,
      alarmDescription: 'APIのエラー率（4xx+5xx）が5%を超過しました（ログ・監視設計 §2）',
      metric: errorRate,
      threshold: 5,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    errorRateAlarm.addAlarmAction(alarmAction);

    // ------------------------------------------------------------------
    // 監視項目2: Lambda実行時間 30秒超過
    // ------------------------------------------------------------------
    const lambdaDuration = new cloudwatch.Metric({
      namespace: 'AWS/Lambda',
      metricName: 'Duration',
      statistic: 'Maximum',
      period,
    });

    const lambdaDurationAlarm = new cloudwatch.Alarm(this, 'LambdaDurationAlarm', {
      alarmName: `oracle-master-app-${config.envName}-lambda-duration`,
      alarmDescription:
        'Lambdaの実行時間が30秒を超過しました（要件定義書 §10.4 / エラーハンドリング方針 §5）',
      metric: lambdaDuration,
      threshold: Duration.seconds(30).toMilliseconds(),
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    lambdaDurationAlarm.addAlarmAction(alarmAction);

    // ------------------------------------------------------------------
    // 監視項目3: Lambda同時実行数（スロットリング防止）
    // ------------------------------------------------------------------
    const lambdaConcurrent = new cloudwatch.Metric({
      namespace: 'AWS/Lambda',
      metricName: 'ConcurrentExecutions',
      statistic: 'Maximum',
      period,
    });

    const lambdaThrottleAlarm = new cloudwatch.Alarm(this, 'LambdaThrottleAlarm', {
      alarmName: `oracle-master-app-${config.envName}-lambda-throttles`,
      alarmDescription: 'Lambdaのスロットリングが発生しました（ログ・監視設計 §2）',
      metric: new cloudwatch.Metric({
        namespace: 'AWS/Lambda',
        metricName: 'Throttles',
        statistic: 'Sum',
        period,
      }),
      threshold: 0,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    lambdaThrottleAlarm.addAlarmAction(alarmAction);

    // ------------------------------------------------------------------
    // 監視項目4: DynamoDBスロットリング（オンデマンドのため頻発想定はないが監視する）
    // ------------------------------------------------------------------
    const dynamoThrottleMetrics = tableNames.map(
      (name) =>
        new cloudwatch.Metric({
          namespace: 'AWS/DynamoDB',
          metricName: 'ThrottledRequests',
          dimensionsMap: { TableName: name },
          statistic: 'Sum',
          period,
        }),
    );

    tableNames.forEach((name, index) => {
      const alarm = new cloudwatch.Alarm(this, `DynamoThrottleAlarm${index}`, {
        alarmName: `oracle-master-app-${config.envName}-dynamodb-throttle-${name}`,
        alarmDescription: `DynamoDBテーブル ${name} でスロットリングが発生しました（ログ・監視設計 §2）`,
        metric: dynamoThrottleMetrics[index],
        threshold: 0,
        evaluationPeriods: 1,
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      });
      alarm.addAlarmAction(alarmAction);
    });

    // ------------------------------------------------------------------
    // ダッシュボード（ログ・監視設計 §2: APIエラー率・Lambda実行時間を可視化）
    // ------------------------------------------------------------------
    const dashboard = new cloudwatch.Dashboard(this, 'Dashboard', {
      dashboardName: `oracle-master-app-${config.envName}`,
    });

    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'APIエラー率(%)',
        left: [errorRate],
        leftAnnotations: [{ value: 5, label: '閾値 5%', color: cloudwatch.Color.RED }],
        width: 12,
      }),
      new cloudwatch.GraphWidget({
        title: 'APIリクエスト数 / エラー数',
        left: [apiCount],
        right: [api4xx, api5xx],
        width: 12,
      }),
    );

    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Lambda実行時間 (ms)',
        left: [
          lambdaDuration,
          new cloudwatch.Metric({
            namespace: 'AWS/Lambda',
            metricName: 'Duration',
            statistic: 'Average',
            period,
          }),
        ],
        leftAnnotations: [
          { value: 30_000, label: 'タイムアウト閾値 30秒', color: cloudwatch.Color.RED },
        ],
        width: 12,
      }),
      new cloudwatch.GraphWidget({
        title: 'Lambda同時実行数 / エラー',
        left: [lambdaConcurrent],
        right: [
          new cloudwatch.Metric({
            namespace: 'AWS/Lambda',
            metricName: 'Errors',
            statistic: 'Sum',
            period,
          }),
        ],
        width: 12,
      }),
    );

    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'DynamoDB スロットリング',
        left: dynamoThrottleMetrics,
        width: 24,
      }),
    );

    new CfnOutput(this, 'AlarmTopicArn', {
      value: this.alarmTopic.topicArn,
      description: 'アラート通知用SNSトピックARN',
    });

    if (!config.alarmEmail) {
      new CfnOutput(this, 'AlarmSubscriptionNotice', {
        value:
          'アラートメールの購読者が未設定です。`-c alarmEmail=<通知先>` を指定して再デプロイするか、SNSコンソールから手動で購読を追加してください。',
        description: 'アラート通知先の設定状況',
      });
    }
  }
}
