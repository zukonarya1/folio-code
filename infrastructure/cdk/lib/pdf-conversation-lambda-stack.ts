import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3n from 'aws-cdk-lib/aws-s3-notifications';
import * as lambdaEventSources from 'aws-cdk-lib/aws-lambda-event-sources';
import * as path from 'path';

export interface PdfConversationLambdaStackProps extends cdk.StackProps {
  readonly processingBucket: s3.IBucket;
  readonly digestsBucket: s3.IBucket;
  readonly vectorsBucket: s3.IBucket;
  readonly vectorsJsonBucket: s3.IBucket;
  readonly metadataTable: dynamodb.ITable;
  readonly queryLogsTable: dynamodb.ITable;
  readonly textractCompletionTopic: sns.ITopic;
  readonly documentIngestionRole: iam.IRole;
  readonly textractProcessorRole: iam.IRole;
  readonly textractResultsProcessorRole: iam.IRole;
  readonly bedrockVectorizationRole: iam.IRole;
  readonly queryProcessingRole: iam.IRole;
}

export class PdfConversationLambdaStack extends cdk.Stack {
  public readonly documentIngestionFunction: lambda.Function;
  public readonly textractProcessorFunction: lambda.Function;
  public readonly textractResultsProcessorFunction: lambda.Function;
  public readonly bedrockVectorizationFunction: lambda.Function;
  public readonly queryProcessingFunction: lambda.Function;

  constructor(scope: Construct, id: string, props: PdfConversationLambdaStackProps) {
    super(scope, id, props);

    // 1. Document Ingestion Function - Triggered by S3 upload
    this.documentIngestionFunction = new lambda.Function(this, 'DocumentIngestionFunction', {
      functionName: 'DocumentIngestionFunction',
      runtime: lambda.Runtime.PYTHON_3_13,
      handler: 'index.lambda_handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../../lambda-functions/document-ingestion')),
      timeout: cdk.Duration.seconds(60),
      memorySize: 256,
      role: props.documentIngestionRole,
      environment: {
        METADATA_TABLE: props.metadataTable.tableName,
        SNS_TOPIC_ARN: props.textractCompletionTopic.topicArn,
        REGION_NAME: this.region,
      },
    });

    // S3 trigger for document ingestion
    props.processingBucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3n.LambdaDestination(this.documentIngestionFunction),
      { suffix: '.pdf' }
    );

    // 2. Textract Processor Function - Triggered by S3 upload
    this.textractProcessorFunction = new lambda.Function(this, 'TextractProcessorFunction', {
      functionName: 'TextractProcessorFunction',
      runtime: lambda.Runtime.PYTHON_3_13,
      handler: 'index.lambda_handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../../lambda-functions/textract-processor')),
      timeout: cdk.Duration.seconds(300),
      memorySize: 128,
      role: props.textractProcessorRole,
      environment: {
        SNS_TOPIC_ARN: props.textractCompletionTopic.topicArn,
        REGION_NAME: this.region,
      },
    });

    // S3 trigger for textract processor
    props.processingBucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3n.LambdaDestination(this.textractProcessorFunction),
      { suffix: '.pdf' }
    );

    // 3. Textract Results Processor Function - Triggered by SNS
    this.textractResultsProcessorFunction = new lambda.Function(this, 'TextractResultsProcessorFunction', {
      functionName: 'TextractResultsProcessorFunction',
      runtime: lambda.Runtime.PYTHON_3_13,
      handler: 'index.lambda_handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../../lambda-functions/textract-results-processor')),
      timeout: cdk.Duration.seconds(900),
      memorySize: 1024,
      role: props.textractResultsProcessorRole,
      environment: {
        METADATA_TABLE: props.metadataTable.tableName,
        DIGESTS_BUCKET: props.digestsBucket.bucketName,
        REGION_NAME: this.region,
      },
    });

    // SNS trigger for textract results processor
    this.textractResultsProcessorFunction.addEventSource(
      new lambdaEventSources.SnsEventSource(props.textractCompletionTopic)
    );

    // 4. Bedrock Vectorization Function
    this.bedrockVectorizationFunction = new lambda.Function(this, 'BedrockVectorizationFunction', {
      functionName: 'BedrockToS3Vectorization',
      runtime: lambda.Runtime.PYTHON_3_9,
      handler: 'index.lambda_handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../../lambda-functions/bedrock-vectorization')),
      timeout: cdk.Duration.seconds(300),
      memorySize: 512,
      role: props.bedrockVectorizationRole,
      environment: {
        VECTORS_BUCKET: props.vectorsBucket.bucketName,
        VECTORS_JSON_BUCKET: props.vectorsJsonBucket.bucketName,
        REGION_NAME: this.region,
      },
    });

    // S3 trigger for bedrock vectorization
    props.digestsBucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3n.LambdaDestination(this.bedrockVectorizationFunction),
      { suffix: '.json' }
    );

    // 5. Query Processing Function
    this.queryProcessingFunction = new lambda.Function(this, 'QueryProcessingFunction', {
      functionName: 'QueryProcessingFunction',
      runtime: lambda.Runtime.PYTHON_3_9,
      handler: 'index.lambda_handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../../lambda-functions/query-processing')),
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
      role: props.queryProcessingRole,
      environment: {
        VECTORS_BUCKET: props.vectorsBucket.bucketName,
        METADATA_TABLE: props.metadataTable.tableName,
        QUERY_LOGS_TABLE: props.queryLogsTable.tableName,
        REGION_NAME: this.region,
      },
    });

    // Outputs
    new cdk.CfnOutput(this, 'DocumentIngestionFunctionArn', {
      value: this.documentIngestionFunction.functionArn,
      exportName: 'document-ingestion-function-arn',
    });

    new cdk.CfnOutput(this, 'QueryProcessingFunctionArn', {
      value: this.queryProcessingFunction.functionArn,
      exportName: 'query-processing-function-arn',
    });
  }
}