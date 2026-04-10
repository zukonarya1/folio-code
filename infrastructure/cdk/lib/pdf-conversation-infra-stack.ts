import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as sns_subscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3n from 'aws-cdk-lib/aws-s3-notifications';
import * as lambdaEventSources from 'aws-cdk-lib/aws-lambda-event-sources';
import * as cr from 'aws-cdk-lib/custom-resources';
import * as path from 'path';
import { EnvironmentConfig } from './environment-config';

export interface PdfConversationInfraStackProps extends cdk.StackProps {
  readonly documentIngestionRole: iam.IRole;
  readonly textractProcessorRole: iam.IRole;
  readonly textractResultsProcessorRole: iam.IRole;
  readonly bedrockVectorizationRole: iam.IRole;
  readonly queryProcessingRole: iam.IRole;
  readonly conversationFunctionRole: iam.IRole;
  readonly usageFunctionRole: iam.IRole;
  readonly envConfig: EnvironmentConfig;
}

export class PdfConversationInfraStack extends cdk.Stack {
  public readonly processingBucket: s3.Bucket;
  public readonly digestsBucket: s3.Bucket;
  public readonly vectorsJsonBucket: s3.Bucket;
  public readonly s3VectorsBucketName: string;
  public readonly s3VectorsIndexName: string;
  public readonly metadataTable: dynamodb.Table;
  public readonly queryLogsTable: dynamodb.Table;
  public readonly textractCompletionTopic: sns.Topic;
  public readonly documentIngestionFunction: lambda.Function;
  public readonly queryProcessingFunction: lambda.Function;
  public readonly textractResultsProcessorFunction: lambda.Function;
  public readonly bedrockVectorizationFunction: lambda.Function;
  public readonly conversationsTable: dynamodb.Table;
  public readonly conversationFunction: lambda.Function;
  public readonly studyBookDlq: sqs.Queue;
  public readonly studyBookFunction: lambda.Function;
  public readonly usageTable: dynamodb.Table;
  public readonly usageFunction: lambda.Function;

  constructor(scope: Construct, id: string, props: PdfConversationInfraStackProps) {
    super(scope, id, props);

    const p = props.envConfig.prefix;
    const removalPolicy = props.envConfig.deletionPolicy === 'RETAIN' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY;

    // S3 Buckets
    this.processingBucket = new s3.Bucket(this, 'ProcessingBucket', {
      bucketName: `${p}pdf-conversation-processing-${this.account}`,
      versioned: false,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy,
      cors: [
        {
          allowedMethods: [
            s3.HttpMethods.GET,
            s3.HttpMethods.PUT,
            s3.HttpMethods.POST,
            s3.HttpMethods.DELETE,
            s3.HttpMethods.HEAD,
          ],
          allowedOrigins: props.envConfig.allowedCorsOrigins,
          allowedHeaders: ['*'],
          exposedHeaders: ['ETag'],
          maxAge: 3000,
        },
      ],
    });

    this.digestsBucket = new s3.Bucket(this, 'DigestsBucket', {
      bucketName: `${p}pdf-conversation-digests-${this.account}`,
      versioned: false,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy,
    });

    // S3 Vectors bucket and index (using Custom Resource since CDK doesn't have native support)
    this.s3VectorsBucketName = `${p}pdf-conversation-vectors-${this.account}`;
    this.s3VectorsIndexName = 'document-chunks-index';

    // Lambda function to manage S3 Vectors resources
    const s3VectorsSetupFunction = new lambda.Function(this, 'S3VectorsSetupFunction', {
      functionName: `${p}S3VectorsSetup`,
      runtime: lambda.Runtime.PYTHON_3_9,
      handler: 'index.lambda_handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../../lambda-functions/s3-vectors-setup')),
      timeout: cdk.Duration.minutes(5),
      memorySize: 256,
      initialPolicy: [
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            's3vectors:CreateVectorBucket',
            's3vectors:DeleteVectorBucket',
            's3vectors:CreateIndex',
            's3vectors:DeleteIndex',
            's3vectors:ListVectors',
            's3vectors:DeleteVectors',
          ],
          resources: ['*'],
        }),
      ],
    });

    // Custom Resource Provider
    const s3VectorsProvider = new cr.Provider(this, 'S3VectorsProvider', {
      onEventHandler: s3VectorsSetupFunction,
    });

    // Custom Resource to create S3 Vectors bucket and index
    new cdk.CustomResource(this, 'S3VectorsResource', {
      serviceToken: s3VectorsProvider.serviceToken,
      properties: {
        VectorBucketName: this.s3VectorsBucketName,
        IndexName: this.s3VectorsIndexName,
        Dimension: 1024,
        DistanceMetric: 'cosine',
        Region: this.region,
        // Version parameter to force recreation with non-filterable metadata
        Version: '3.0-ga-migration',
      },
    });

    // JSON fallback bucket (regular S3 bucket for backup storage)
    this.vectorsJsonBucket = new s3.Bucket(this, 'VectorsJsonBucket', {
      bucketName: `${p}pdf-conversation-vectors-json-${this.account}`,
      versioned: false,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy,
    });

    // DynamoDB Tables
    this.metadataTable = new dynamodb.Table(this, 'MetadataTable', {
      tableName: `${p}pdf-conversation-metadata`,
      partitionKey: {
        name: 'document_id',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      pointInTimeRecovery: true,
      removalPolicy,
    });

    // Add GSIs for metadata table
    this.metadataTable.addGlobalSecondaryIndex({
      indexName: 'StatusIndex',
      partitionKey: {
        name: 'status',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'created_at',
        type: dynamodb.AttributeType.STRING,
      },
    });

    this.metadataTable.addGlobalSecondaryIndex({
      indexName: 'UserDocumentsIndex',
      partitionKey: {
        name: 'user_id',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'created_at',
        type: dynamodb.AttributeType.STRING,
      },
    });

    this.queryLogsTable = new dynamodb.Table(this, 'QueryLogsTable', {
      tableName: `${p}pdf-conversation-query-logs`,
      partitionKey: {
        name: 'query_id',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'timestamp',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      pointInTimeRecovery: true,
      timeToLiveAttribute: 'ttl',
      removalPolicy,
    });

    // Add GSI for query logs table
    this.queryLogsTable.addGlobalSecondaryIndex({
      indexName: 'UserQueryIndex',
      partitionKey: {
        name: 'user_id',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'timestamp',
        type: dynamodb.AttributeType.STRING,
      },
    });

    this.conversationsTable = new dynamodb.Table(this, 'ConversationsTable', {
      tableName: `${p}pdf-conversation-conversations`,
      partitionKey: {
        name: 'conversation_id',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      pointInTimeRecovery: true,
      timeToLiveAttribute: 'ttl',
      removalPolicy,
    });

    this.conversationsTable.addGlobalSecondaryIndex({
      indexName: 'DocumentConversationsIndex',
      partitionKey: {
        name: 'document_id',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'created_at',
        type: dynamodb.AttributeType.STRING,
      },
    });

    this.usageTable = new dynamodb.Table(this, 'UsageTable', {
      tableName: `${p}folio-usage`,
      partitionKey: { name: 'user_id', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'month_key', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      timeToLiveAttribute: 'ttl',
      removalPolicy,
    });

    // SNS Topic
    this.textractCompletionTopic = new sns.Topic(this, 'TextractCompletionTopic', {
      topicName: `${p}textract-completion`,
      displayName: 'Textract Job Completion Notifications',
    });

    // SNS topic for vectorization completion (triggers auto-summary generation)
    const vectorizationCompleteTopic = new sns.Topic(this, 'VectorizationCompleteTopic', {
      topicName: `${p}vectorization-complete`,
      displayName: 'Document Vectorization Completion Notifications',
    });

    // Output key resources for other stacks
    new cdk.CfnOutput(this, 'ProcessingBucketName', {
      value: this.processingBucket.bucketName,
      exportName: `${p}pdf-conversation-processing-bucket`,
    });

    new cdk.CfnOutput(this, 'DigestsBucketName', {
      value: this.digestsBucket.bucketName,
      exportName: `${p}pdf-conversation-digests-bucket`,
    });

    new cdk.CfnOutput(this, 'VectorsBucketName', {
      value: this.s3VectorsBucketName,
      exportName: `${p}pdf-conversation-vectors-bucket`,
    });

    new cdk.CfnOutput(this, 'MetadataTableName', {
      value: this.metadataTable.tableName,
      exportName: `${p}pdf-conversation-metadata-table`,
    });

    new cdk.CfnOutput(this, 'QueryLogsTableName', {
      value: this.queryLogsTable.tableName,
      exportName: `${p}pdf-conversation-query-logs-table`,
    });

    new cdk.CfnOutput(this, 'TextractTopicArn', {
      value: this.textractCompletionTopic.topicArn,
      exportName: `${p}pdf-conversation-textract-topic-arn`,
    });

    // Lambda Functions - 4-Function Workflow
    // Flow: Upload → DocumentIngestion → TextractResults → BedrockVectorization → QueryProcessing

    // 1. Document Ingestion Function (S3 triggered, starts async Textract job)
    this.documentIngestionFunction = new lambda.Function(this, 'DocumentIngestionFunction', {
      functionName: `${p}DocumentIngestionFunction`,
      runtime: lambda.Runtime.PYTHON_3_13,
      handler: 'index.lambda_handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../../lambda-functions/document-ingestion'), {
        bundling: {
          image: lambda.Runtime.PYTHON_3_13.bundlingImage,
          command: [
            'bash', '-c',
            'pip install -r requirements.txt -t /asset-output && cp -au . /asset-output'
          ],
        },
      }),
      timeout: cdk.Duration.seconds(300),
      memorySize: 512,
      role: props.documentIngestionRole,
      environment: {
        METADATA_TABLE: this.metadataTable.tableName,
        SNS_TOPIC_ARN: this.textractCompletionTopic.topicArn,
        DIGESTS_BUCKET: this.digestsBucket.bucketName,
        REGION_NAME: this.region,
        USAGE_TABLE: this.usageTable.tableName,
        USER_POOL_ID: props.envConfig.userPoolId,
      },
    });

    // Add S3 event trigger for document uploads
    this.processingBucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3n.LambdaDestination(this.documentIngestionFunction),
      { prefix: 'users/' }
    );

    // 2. Textract Results Processor Function (SNS triggered when Textract completes)
    this.textractResultsProcessorFunction = new lambda.Function(this, 'TextractResultsProcessorFunction', {
      functionName: `${p}TextractResultsProcessorFunction`,
      runtime: lambda.Runtime.PYTHON_3_13,
      handler: 'index.lambda_handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../../lambda-functions/textract-results-processor')),
      timeout: cdk.Duration.seconds(900),
      memorySize: 1024,
      role: props.textractResultsProcessorRole,
      environment: {
        METADATA_TABLE: this.metadataTable.tableName,
        DIGESTS_BUCKET: this.digestsBucket.bucketName,
        REGION_NAME: this.region,
      },
    });

    this.textractResultsProcessorFunction.addEventSource(
      new lambdaEventSources.SnsEventSource(this.textractCompletionTopic)
    );

    // 3. Bedrock Vectorization Function (S3 triggered when digest JSON created)
    this.bedrockVectorizationFunction = new lambda.Function(this, 'BedrockVectorizationFunction', {
      functionName: `${p}BedrockToS3Vectorization`,
      runtime: lambda.Runtime.PYTHON_3_9,
      handler: 'index.lambda_handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../../lambda-functions/bedrock-vectorization'), {
        bundling: {
          image: lambda.Runtime.PYTHON_3_9.bundlingImage,
          command: [
            'bash', '-c',
            'pip install -r requirements.txt -t /asset-output && cp -au . /asset-output'
          ],
        },
      }),
      timeout: cdk.Duration.seconds(300),
      memorySize: 512,
      role: props.bedrockVectorizationRole,
      environment: {
        S3_VECTORS_BUCKET: this.s3VectorsBucketName,
        S3_VECTOR_INDEX_NAME: this.s3VectorsIndexName,
        S3_JSON_FALLBACK_BUCKET: this.vectorsJsonBucket.bucketName,
        PROCESSED_BUCKET: this.digestsBucket.bucketName,
        METADATA_TABLE: this.metadataTable.tableName,
        VECTORIZATION_COMPLETE_TOPIC: vectorizationCompleteTopic.topicArn,
        MAX_CHUNKS_PER_DOCUMENT: '500',
        REGION_NAME: this.region,
      },
    });

    // Note: SNS publish permission granted in SecurityStack to avoid circular dependency

    this.digestsBucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3n.LambdaDestination(this.bedrockVectorizationFunction),
      { suffix: '.json' }
    );

    // 4. Query Processing Function (API Gateway triggered for user queries)
    // DocumentSearchFunction — semantic similarity search only (no Haiku, no summaries)
    this.queryProcessingFunction = new lambda.Function(this, 'QueryProcessingFunction', {
      functionName: `${p}QueryProcessingFunction`,
      runtime: lambda.Runtime.PYTHON_3_13,
      handler: 'index.lambda_handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../../lambda-functions/query-processing')),
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
      role: props.queryProcessingRole,
      environment: {
        S3_VECTORS_BUCKET: this.s3VectorsBucketName,
        S3_VECTOR_INDEX_NAME: this.s3VectorsIndexName,
        METADATA_TABLE: this.metadataTable.tableName,
        QUERY_LOGS_TABLE: this.queryLogsTable.tableName,
        BEDROCK_MODEL_ID: 'cohere.embed-multilingual-v3',
        MAX_RESULTS_LIMIT: '100',
        MAX_CONTEXT_CHARS: '50000',
        REGION_NAME: this.region,
      },
    });

    // Dead-letter queue for failed StudyBook events (14-day retention for inspection)
    const summaryGenerationDlq = new sqs.Queue(this, 'SummaryGenerationDLQ', {
      queueName: `${p}SummaryGenerationDLQ`,
      retentionPeriod: cdk.Duration.days(14),
    });

    // SQS queue for StudyBook — correct retry/DLQ semantics for SNS-triggered Lambda
    const studyBookQueue = new sqs.Queue(this, 'StudyBookQueue', {
      queueName: `${p}StudyBookQueue`,
      visibilityTimeout: cdk.Duration.seconds(960),
      retentionPeriod: cdk.Duration.days(14),
      deadLetterQueue: {
        queue: summaryGenerationDlq,
        maxReceiveCount: 1,
      },
    });

    vectorizationCompleteTopic.addSubscription(
      new sns_subscriptions.SqsSubscription(studyBookQueue, { rawMessageDelivery: false })
    );

    this.studyBookDlq = summaryGenerationDlq;

    // StudyBook inline role (kept inline to avoid circular dependency with DynamoDB/SQS grants)
    const studyBookRole = new iam.Role(this, 'StudyBookRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
      inlinePolicies: {
        StudyBookPolicy: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: ['s3:GetObject'],
              resources: [`${this.digestsBucket.bucketArn}/users/*`],
            }),
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: ['dynamodb:GetItem', 'dynamodb:UpdateItem'],
              resources: [
                `arn:aws:dynamodb:${this.region}:${this.account}:table/${p}pdf-conversation-metadata`,
              ],
            }),
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: ['bedrock:InvokeModel'],
              resources: [
                `arn:aws:bedrock:${this.region}::foundation-model/anthropic.claude-haiku-4-5-20251001-v1:0`,
                `arn:aws:bedrock:${this.region}:${this.account}:inference-profile/us.anthropic.claude-haiku-4-5-20251001-v1:0`,
                `arn:aws:bedrock:us-east-1::foundation-model/anthropic.claude-haiku-4-5-20251001-v1:0`,
                `arn:aws:bedrock:us-east-2::foundation-model/anthropic.claude-haiku-4-5-20251001-v1:0`,
              ],
            }),
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: ['dynamodb:UpdateItem'],
              resources: [`arn:aws:dynamodb:${this.region}:${this.account}:table/${p}folio-usage`],
            }),
          ],
        }),
      },
    });

    this.studyBookFunction = new lambda.Function(this, 'StudyBookFunction', {
      functionName: `${p}StudyBookFunction`,
      runtime: lambda.Runtime.PYTHON_3_13,
      handler: 'index.lambda_handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../../lambda-functions/summary-generation')),
      timeout: cdk.Duration.seconds(900),
      memorySize: 1024,
      role: studyBookRole,
      environment: {
        DIGESTS_BUCKET: this.digestsBucket.bucketName,
        METADATA_TABLE: this.metadataTable.tableName,
        HAIKU_MODEL_ID: 'us.anthropic.claude-haiku-4-5-20251001-v1:0',
        CHUNK_SIZE: '2000',
        CHUNKS_PER_GROUP: '10',
        HAIKU_INTER_CALL_DELAY: '0.5',
        REGION_NAME: this.region,
        USAGE_TABLE: this.usageTable.tableName,
      },
    });

    // Wire to SQS event source — batchSize:1 ensures one document per invocation
    this.studyBookFunction.addEventSource(
      new lambdaEventSources.SqsEventSource(studyBookQueue, { batchSize: 1 })
    );

    // Grant SQS consume access
    studyBookQueue.grantConsumeMessages(studyBookRole);
    summaryGenerationDlq.grantSendMessages(studyBookRole);

    // 6. Conversation Function (API Gateway triggered for multi-turn conversations)
    this.conversationFunction = new lambda.Function(this, 'ConversationFunction', {
      functionName: `${p}ConversationFunction`,
      runtime: lambda.Runtime.PYTHON_3_9,
      handler: 'index.lambda_handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../../lambda-functions/conversation')),
      timeout: cdk.Duration.seconds(60),
      memorySize: 512,
      role: props.conversationFunctionRole,
      environment: {
        CONVERSATIONS_TABLE: this.conversationsTable.tableName,
        METADATA_TABLE: this.metadataTable.tableName,
        S3_VECTORS_BUCKET: this.s3VectorsBucketName,
        S3_VECTOR_INDEX_NAME: this.s3VectorsIndexName,
        HAIKU_MODEL_ID: 'us.anthropic.claude-haiku-4-5-20251001-v1:0',
        BEDROCK_MODEL_ID: 'cohere.embed-multilingual-v3',
        REGION_NAME: this.region,
        ALLOWED_ORIGINS: props.envConfig.allowedCorsOrigins.join(','),
        USAGE_TABLE: this.usageTable.tableName,
      },
    });

    this.usageFunction = new lambda.Function(this, 'UsageFunction', {
      functionName: `${p}UsageFunction`,
      runtime: lambda.Runtime.PYTHON_3_13,
      handler: 'index.lambda_handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../../lambda-functions/usage')),
      timeout: cdk.Duration.seconds(10),
      memorySize: 128,
      role: props.usageFunctionRole,
      environment: {
        USAGE_TABLE: this.usageTable.tableName,
        REGION_NAME: this.region,
        ALLOWED_ORIGINS: props.envConfig.allowedCorsOrigins.join(','),
      },
    });

        new cdk.CfnOutput(this, 'DocumentIngestionFunctionArn', {
      value: this.documentIngestionFunction.functionArn,
      exportName: `${p}document-ingestion-function-arn`,
    });

    new cdk.CfnOutput(this, 'DocumentSearchFunctionArn', {
      value: this.queryProcessingFunction.functionArn,
      exportName: `${p}document-search-function-arn`,
    });

    new cdk.CfnOutput(this, 'ConversationFunctionArn', {
      value: this.conversationFunction.functionArn,
      exportName: `${p}conversation-function-arn`,
    });
  }
}