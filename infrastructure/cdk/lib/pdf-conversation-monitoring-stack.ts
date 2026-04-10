import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cloudwatchActions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as snsSubscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as budgets from 'aws-cdk-lib/aws-budgets';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { EnvironmentConfig } from './environment-config';

export interface PdfConversationMonitoringStackProps extends cdk.StackProps {
  readonly documentIngestionFunction: lambda.IFunction;
  readonly queryProcessingFunction: lambda.IFunction;
  readonly textractResultsProcessorFunction: lambda.IFunction;
  readonly bedrockVectorizationFunction: lambda.IFunction;
  readonly studyBookFunction: lambda.IFunction;
  readonly conversationFunction: lambda.IFunction;
  readonly studyBookDlq: sqs.IQueue;
  readonly metadataTable: dynamodb.ITable;
  readonly queryLogsTable: dynamodb.ITable;
  readonly processingBucket: s3.IBucket;
  readonly vectorsJsonBucket: s3.IBucket;
  readonly envConfig: EnvironmentConfig;
}

export class PdfConversationMonitoringStack extends cdk.Stack {
  public readonly systemDashboard: cloudwatch.Dashboard;
  public readonly alertTopic: sns.Topic;

  constructor(scope: Construct, id: string, props: PdfConversationMonitoringStackProps) {
    super(scope, id, props);

    const p = props.envConfig.prefix;

    // SNS Topic for Alerts
    this.alertTopic = new sns.Topic(this, 'SystemAlerts', {
      topicName: `${p}pdf-conversation-system-alerts`,
      displayName: 'PDF Conversation System Alerts',
    });

    // Email subscription for alerts via SSM dynamic reference (resolved at deploy time)
    const notificationEmail = ssm.StringParameter.valueForStringParameter(
      this,
      `/pdfconv/${props.envConfig.name}/notification-email`
    );
    this.alertTopic.addSubscription(
      new snsSubscriptions.EmailSubscription(notificationEmail)
    );

    // Create CloudWatch Dashboard
    this.systemDashboard = new cloudwatch.Dashboard(this, 'SystemDashboard', {
      dashboardName: `${p}PDF-Conversation-System-Overview`,
    });

    // Lambda Function Metrics Widgets
    this.createLambdaMonitoring(props);

    // DynamoDB Metrics Widgets
    this.createDynamoDBMonitoring(props);

    // S3 Metrics Widgets
    this.createS3Monitoring(props);

    // System Health and Cost Widgets
    this.createSystemHealthMonitoring();

    // Create CloudWatch Alarms
    this.createAlarms(props);

    if (props.envConfig.name === 'prod') {
      this.createProdBusinessMonitoring(props);
    }

    // Output dashboard URL
    new cdk.CfnOutput(this, 'DashboardURL', {
      value: `https://${this.region}.console.aws.amazon.com/cloudwatch/home?region=${this.region}#dashboards:name=${this.systemDashboard.dashboardName}`,
      description: 'CloudWatch Dashboard URL',
    });
  }

  private createLambdaMonitoring(props: PdfConversationMonitoringStackProps) {
    const lambdaFunctions = [
      { name: 'Document Ingestion', func: props.documentIngestionFunction },
      { name: 'Document Search', func: props.queryProcessingFunction },
      { name: 'Study Book', func: props.studyBookFunction },
      { name: 'Textract Results', func: props.textractResultsProcessorFunction },
      { name: 'Bedrock Vectorization', func: props.bedrockVectorizationFunction },
      { name: 'Conversation', func: props.conversationFunction },
    ];

    // Lambda Invocations Widget
    const invocationsWidget = new cloudwatch.GraphWidget({
      title: 'Lambda Function Invocations',
      width: 12,
      height: 6,
      left: lambdaFunctions.map(({ name, func }) =>
        new cloudwatch.Metric({
          namespace: 'AWS/Lambda',
          metricName: 'Invocations',
          dimensionsMap: { FunctionName: func.functionName },
          statistic: 'Sum',
          period: cdk.Duration.minutes(5),
          label: name,
        })
      ),
    });

    // Lambda Duration Widget
    const durationWidget = new cloudwatch.GraphWidget({
      title: 'Lambda Function Duration (ms)',
      width: 12,
      height: 6,
      left: lambdaFunctions.map(({ name, func }) =>
        new cloudwatch.Metric({
          namespace: 'AWS/Lambda',
          metricName: 'Duration',
          dimensionsMap: { FunctionName: func.functionName },
          statistic: 'Average',
          period: cdk.Duration.minutes(5),
          label: name,
        })
      ),
    });

    // Lambda Errors Widget
    const errorsWidget = new cloudwatch.GraphWidget({
      title: 'Lambda Function Errors',
      width: 12,
      height: 6,
      left: lambdaFunctions.map(({ name, func }) =>
        new cloudwatch.Metric({
          namespace: 'AWS/Lambda',
          metricName: 'Errors',
          dimensionsMap: { FunctionName: func.functionName },
          statistic: 'Sum',
          period: cdk.Duration.minutes(5),
          label: name,
        })
      ),
    });

    // Lambda Concurrent Executions Widget
    const concurrencyWidget = new cloudwatch.GraphWidget({
      title: 'Lambda Concurrent Executions',
      width: 12,
      height: 6,
      left: lambdaFunctions.map(({ name, func }) =>
        new cloudwatch.Metric({
          namespace: 'AWS/Lambda',
          metricName: 'ConcurrentExecutions',
          dimensionsMap: { FunctionName: func.functionName },
          statistic: 'Maximum',
          period: cdk.Duration.minutes(5),
          label: name,
        })
      ),
    });

    this.systemDashboard.addWidgets(
      invocationsWidget,
      durationWidget,
      errorsWidget,
      concurrencyWidget
    );
  }

  private createDynamoDBMonitoring(props: PdfConversationMonitoringStackProps) {
    const tables = [
      { name: 'Metadata Table', table: props.metadataTable },
      { name: 'Query Logs Table', table: props.queryLogsTable },
    ];

    // DynamoDB Read/Write Capacity Widget
    const capacityWidget = new cloudwatch.GraphWidget({
      title: 'DynamoDB Read/Write Capacity',
      width: 12,
      height: 6,
      left: [
        ...tables.flatMap(({ name, table }) => [
          new cloudwatch.Metric({
            namespace: 'AWS/DynamoDB',
            metricName: 'ConsumedReadCapacityUnits',
            dimensionsMap: { TableName: table.tableName },
            statistic: 'Sum',
            period: cdk.Duration.minutes(5),
            label: `${name} - Read`,
          }),
          new cloudwatch.Metric({
            namespace: 'AWS/DynamoDB',
            metricName: 'ConsumedWriteCapacityUnits',
            dimensionsMap: { TableName: table.tableName },
            statistic: 'Sum',
            period: cdk.Duration.minutes(5),
            label: `${name} - Write`,
          }),
        ]),
      ],
    });

    // DynamoDB Throttles Widget
    const throttlesWidget = new cloudwatch.GraphWidget({
      title: 'DynamoDB Throttled Requests',
      width: 12,
      height: 6,
      left: [
        ...tables.flatMap(({ name, table }) => [
          new cloudwatch.Metric({
            namespace: 'AWS/DynamoDB',
            metricName: 'ReadThrottleEvents',
            dimensionsMap: { TableName: table.tableName },
            statistic: 'Sum',
            period: cdk.Duration.minutes(5),
            label: `${name} - Read Throttles`,
          }),
          new cloudwatch.Metric({
            namespace: 'AWS/DynamoDB',
            metricName: 'WriteThrottleEvents',
            dimensionsMap: { TableName: table.tableName },
            statistic: 'Sum',
            period: cdk.Duration.minutes(5),
            label: `${name} - Write Throttles`,
          }),
        ]),
      ],
    });

    this.systemDashboard.addWidgets(capacityWidget, throttlesWidget);
  }

  private createS3Monitoring(props: PdfConversationMonitoringStackProps) {
    const buckets = [
      { name: 'Processing', bucket: props.processingBucket },
      { name: 'VectorsJson', bucket: props.vectorsJsonBucket },
    ];

    // S3 Requests Widget
    const requestsWidget = new cloudwatch.GraphWidget({
      title: 'S3 Request Metrics',
      width: 12,
      height: 6,
      left: [
        ...buckets.flatMap(({ name, bucket }) => [
          new cloudwatch.Metric({
            namespace: 'AWS/S3',
            metricName: 'NumberOfObjects',
            dimensionsMap: {
              BucketName: bucket.bucketName,
              StorageType: 'AllStorageTypes'
            },
            statistic: 'Average',
            period: cdk.Duration.hours(1),
            label: `${name} - Object Count`,
          }),
          new cloudwatch.Metric({
            namespace: 'AWS/S3',
            metricName: 'BucketSizeBytes',
            dimensionsMap: {
              BucketName: bucket.bucketName,
              StorageType: 'StandardStorage'
            },
            statistic: 'Average',
            period: cdk.Duration.hours(1),
            label: `${name} - Size (Bytes)`,
          }),
        ]),
      ],
    });

    this.systemDashboard.addWidgets(requestsWidget);
  }

  private createSystemHealthMonitoring() {
    // System Health Text Widget
    const systemHealthWidget = new cloudwatch.TextWidget({
      markdown: `# PDF Conversation System Health Dashboard

## System Components
- **PDF Ingestion**: Extracts text from uploaded PDFs (PyPDF / Textract fallback)
- **Vectorization**: Chunks text, embeds with Cohere, writes to S3 Vectors
- **Study Book**: Auto-generates school-book summary from full document digest
- **Document Search**: Semantic similarity search (30s timeout, no Haiku)
- **Document Chat**: Multi-turn RAG conversation with Haiku

## Alert Thresholds
- Lambda error rate > 5%
- Lambda duration > 80% of timeout
- DynamoDB throttling events
- StudyBook DLQ depth > 0`,
      width: 24,
      height: 8,
    });

    this.systemDashboard.addWidgets(systemHealthWidget);
  }

  private createAlarms(props: PdfConversationMonitoringStackProps) {
    const lambdaFunctions = [
      { name: 'DocumentIngestion', func: props.documentIngestionFunction, timeoutThreshold: 240 },
      { name: 'DocumentSearch', func: props.queryProcessingFunction, timeoutThreshold: 24 },
      { name: 'StudyBook', func: props.studyBookFunction, timeoutThreshold: 720 },
      { name: 'TextractResults', func: props.textractResultsProcessorFunction, timeoutThreshold: 720 },
      { name: 'BedrockVectorization', func: props.bedrockVectorizationFunction, timeoutThreshold: 240 },
      { name: 'ConversationFunction', func: props.conversationFunction, timeoutThreshold: 48 },
    ];

    lambdaFunctions.forEach(({ name, func, timeoutThreshold }) => {
      // High Error Rate Alarm
      new cloudwatch.Alarm(this, `${name}HighErrorRate`, {
        alarmName: `${props.envConfig.prefix}PDF-Conversation-${name}-HighErrorRate`,
        alarmDescription: `High error rate detected for ${name} function`,
        metric: new cloudwatch.Metric({
          namespace: 'AWS/Lambda',
          metricName: 'Errors',
          dimensionsMap: { FunctionName: func.functionName },
          statistic: 'Sum',
          period: cdk.Duration.minutes(5),
        }),
        threshold: 5,
        evaluationPeriods: 2,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      }).addAlarmAction(new cloudwatchActions.SnsAction(this.alertTopic));

      // High Duration Alarm
      new cloudwatch.Alarm(this, `${name}HighDuration`, {
        alarmName: `${props.envConfig.prefix}PDF-Conversation-${name}-HighDuration`,
        alarmDescription: `High duration detected for ${name} function`,
        metric: new cloudwatch.Metric({
          namespace: 'AWS/Lambda',
          metricName: 'Duration',
          dimensionsMap: { FunctionName: func.functionName },
          statistic: 'Average',
          period: cdk.Duration.minutes(5),
        }),
        threshold: timeoutThreshold * 1000, // Convert to milliseconds
        evaluationPeriods: 2,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      }).addAlarmAction(new cloudwatchActions.SnsAction(this.alertTopic));
    });


    new cloudwatch.Alarm(this, 'StudyBookDlqDepth', {
      alarmName: `${props.envConfig.prefix}PDF-Conversation-StudyBook-DLQ-Depth`,
      alarmDescription: 'StudyBook DLQ has messages — summary generation failures detected',
      metric: new cloudwatch.Metric({
        namespace: 'AWS/SQS',
        metricName: 'ApproximateNumberOfMessagesVisible',
        dimensionsMap: { QueueName: props.studyBookDlq.queueName },
        statistic: 'Sum',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    }).addAlarmAction(new cloudwatchActions.SnsAction(this.alertTopic));

    // DynamoDB Throttling Alarms
    [props.metadataTable, props.queryLogsTable].forEach((table, index) => {
      const tableName = index === 0 ? 'Metadata' : 'QueryLogs';

      new cloudwatch.Alarm(this, `${tableName}ReadThrottling`, {
        alarmName: `${props.envConfig.prefix}PDF-Conversation-${tableName}-ReadThrottling`,
        alarmDescription: `Read throttling detected for ${tableName} table`,
        metric: new cloudwatch.Metric({
          namespace: 'AWS/DynamoDB',
          metricName: 'ReadThrottleEvents',
          dimensionsMap: { TableName: table.tableName },
          statistic: 'Sum',
          period: cdk.Duration.minutes(5),
        }),
        threshold: 1,
        evaluationPeriods: 1,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      }).addAlarmAction(new cloudwatchActions.SnsAction(this.alertTopic));
    });
  }

  private createProdBusinessMonitoring(props: PdfConversationMonitoringStackProps) {
    this.alertTopic.addToResourcePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      principals: [new iam.ServicePrincipal('budgets.amazonaws.com')],
      actions: ['SNS:Publish'],
      resources: [this.alertTopic.topicArn],
    }));

    new budgets.CfnBudget(this, 'BedrockMonthlyBudget', {
      budget: {
        budgetName: 'folio-bedrock-monthly',
        budgetType: 'COST',
        timeUnit: 'MONTHLY',
        budgetLimit: { amount: 20, unit: 'USD' },
        costFilters: { Service: ['Amazon Bedrock'] },
      },
      notificationsWithSubscribers: [
        {
          notification: {
            notificationType: 'ACTUAL',
            comparisonOperator: 'GREATER_THAN',
            threshold: 80,
            thresholdType: 'PERCENTAGE',
          },
          subscribers: [
            {
              subscriptionType: 'SNS',
              address: this.alertTopic.topicArn,
            },
          ],
        },
      ],
    });

    const businessMetricsWidget = new cloudwatch.TextWidget({
      markdown: `# Folio Business Metrics

## Usage Limits (per user, free tier)
- Monthly budget: 3,000,000 tokens per user (ingestion + chat)
- Doc count limit: 20 lifetime docs
- Daily chat: 50 messages/day

## Bedrock Budget Alert
- Monthly Bedrock spend alert at 80% of $20 USD threshold
- Notification → SSM:/pdfconv/${props.envConfig.name}/notification-email`,
      width: 24,
      height: 6,
    });

    this.systemDashboard.addWidgets(businessMetricsWidget);
  }
}