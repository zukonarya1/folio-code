"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PdfConversationInfraStack = void 0;
const cdk = __importStar(require("aws-cdk-lib"));
const s3 = __importStar(require("aws-cdk-lib/aws-s3"));
const sqs = __importStar(require("aws-cdk-lib/aws-sqs"));
const dynamodb = __importStar(require("aws-cdk-lib/aws-dynamodb"));
const sns = __importStar(require("aws-cdk-lib/aws-sns"));
const sns_subscriptions = __importStar(require("aws-cdk-lib/aws-sns-subscriptions"));
const lambda = __importStar(require("aws-cdk-lib/aws-lambda"));
const iam = __importStar(require("aws-cdk-lib/aws-iam"));
const s3n = __importStar(require("aws-cdk-lib/aws-s3-notifications"));
const lambdaEventSources = __importStar(require("aws-cdk-lib/aws-lambda-event-sources"));
const cr = __importStar(require("aws-cdk-lib/custom-resources"));
const path = __importStar(require("path"));
class PdfConversationInfraStack extends cdk.Stack {
    processingBucket;
    digestsBucket;
    vectorsJsonBucket;
    s3VectorsBucketName;
    s3VectorsIndexName;
    metadataTable;
    queryLogsTable;
    textractCompletionTopic;
    documentIngestionFunction;
    queryProcessingFunction;
    textractResultsProcessorFunction;
    bedrockVectorizationFunction;
    conversationsTable;
    conversationFunction;
    studyBookDlq;
    studyBookFunction;
    usageTable;
    usageFunction;
    constructor(scope, id, props) {
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
        this.processingBucket.addEventNotification(s3.EventType.OBJECT_CREATED, new s3n.LambdaDestination(this.documentIngestionFunction), { prefix: 'users/' });
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
        this.textractResultsProcessorFunction.addEventSource(new lambdaEventSources.SnsEventSource(this.textractCompletionTopic));
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
        this.digestsBucket.addEventNotification(s3.EventType.OBJECT_CREATED, new s3n.LambdaDestination(this.bedrockVectorizationFunction), { suffix: '.json' });
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
        vectorizationCompleteTopic.addSubscription(new sns_subscriptions.SqsSubscription(studyBookQueue, { rawMessageDelivery: false }));
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
        this.studyBookFunction.addEventSource(new lambdaEventSources.SqsEventSource(studyBookQueue, { batchSize: 1 }));
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
exports.PdfConversationInfraStack = PdfConversationInfraStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicGRmLWNvbnZlcnNhdGlvbi1pbmZyYS1zdGFjay5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInBkZi1jb252ZXJzYXRpb24taW5mcmEtc3RhY2sudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSxpREFBbUM7QUFFbkMsdURBQXlDO0FBQ3pDLHlEQUEyQztBQUMzQyxtRUFBcUQ7QUFDckQseURBQTJDO0FBQzNDLHFGQUF1RTtBQUN2RSwrREFBaUQ7QUFDakQseURBQTJDO0FBQzNDLHNFQUF3RDtBQUN4RCx5RkFBMkU7QUFDM0UsaUVBQW1EO0FBQ25ELDJDQUE2QjtBQWM3QixNQUFhLHlCQUEwQixTQUFRLEdBQUcsQ0FBQyxLQUFLO0lBQ3RDLGdCQUFnQixDQUFZO0lBQzVCLGFBQWEsQ0FBWTtJQUN6QixpQkFBaUIsQ0FBWTtJQUM3QixtQkFBbUIsQ0FBUztJQUM1QixrQkFBa0IsQ0FBUztJQUMzQixhQUFhLENBQWlCO0lBQzlCLGNBQWMsQ0FBaUI7SUFDL0IsdUJBQXVCLENBQVk7SUFDbkMseUJBQXlCLENBQWtCO0lBQzNDLHVCQUF1QixDQUFrQjtJQUN6QyxnQ0FBZ0MsQ0FBa0I7SUFDbEQsNEJBQTRCLENBQWtCO0lBQzlDLGtCQUFrQixDQUFpQjtJQUNuQyxvQkFBb0IsQ0FBa0I7SUFDdEMsWUFBWSxDQUFZO0lBQ3hCLGlCQUFpQixDQUFrQjtJQUNuQyxVQUFVLENBQWlCO0lBQzNCLGFBQWEsQ0FBa0I7SUFFL0MsWUFBWSxLQUFnQixFQUFFLEVBQVUsRUFBRSxLQUFxQztRQUM3RSxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUV4QixNQUFNLENBQUMsR0FBRyxLQUFLLENBQUMsU0FBUyxDQUFDLE1BQU0sQ0FBQztRQUNqQyxNQUFNLGFBQWEsR0FBRyxLQUFLLENBQUMsU0FBUyxDQUFDLGNBQWMsS0FBSyxRQUFRLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FB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RCxLQUFLLEVBQUUsSUFBSSxDQUFDLHlCQUF5QixDQUFDLFdBQVc7WUFDakQsVUFBVSxFQUFFLEdBQUcsQ0FBQyxpQ0FBaUM7U0FDbEQsQ0FBQyxDQUFDO1FBRUgsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSwyQkFBMkIsRUFBRTtZQUNuRCxLQUFLLEVBQUUsSUFBSSxDQUFDLHVCQUF1QixDQUFDLFdBQVc7WUFDL0MsVUFBVSxFQUFFLEdBQUcsQ0FBQyw4QkFBOEI7U0FDL0MsQ0FBQyxDQUFDO1FBRUgsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSx5QkFBeUIsRUFBRTtZQUNqRCxLQUFLLEVBQUUsSUFBSSxDQUFDLG9CQUFvQixDQUFDLFdBQVc7WUFDNUMsVUFBVSxFQUFFLEdBQUcsQ0FBQywyQkFBMkI7U0FDNUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztDQUNGO0FBemdCRCw4REF5Z0JDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgY2RrIGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gJ2NvbnN0cnVjdHMnO1xuaW1wb3J0ICogYXMgczMgZnJvbSAnYXdzLWNkay1saWIvYXdzLXMzJztcbmltcG9ydCAqIGFzIHNxcyBmcm9tICdhd3MtY2RrLWxpYi9hd3Mtc3FzJztcbmltcG9ydCAqIGFzIGR5bmFtb2RiIGZyb20gJ2F3cy1jZGstbGliL2F3cy1keW5hbW9kYic7XG5pbXBvcnQgKiBhcyBzbnMgZnJvbSAnYXdzLWNkay1saWIvYXdzLXNucyc7XG5pbXBvcnQgKiBhcyBzbnNfc3Vic2NyaXB0aW9ucyBmcm9tICdhd3MtY2RrLWxpYi9hd3Mtc25zLXN1YnNjcmlwdGlvbnMnO1xuaW1wb3J0ICogYXMgbGFtYmRhIGZyb20gJ2F3cy1jZGstbGliL2F3cy1sYW1iZGEnO1xuaW1wb3J0ICogYXMgaWFtIGZyb20gJ2F3cy1jZGstbGliL2F3cy1pYW0nO1xuaW1wb3J0ICogYXMgczNuIGZyb20gJ2F3cy1jZGstbGliL2F3cy1zMy1ub3RpZmljYXRpb25zJztcbmltcG9ydCAqIGFzIGxhbWJkYUV2ZW50U291cmNlcyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtbGFtYmRhLWV2ZW50LXNvdXJjZXMnO1xuaW1wb3J0ICogYXMgY3IgZnJvbSAnYXdzLWNkay1saWIvY3VzdG9tLXJlc291cmNlcyc7XG5pbXBvcnQgKiBhcyBwYXRoIGZyb20gJ3BhdGgnO1xuaW1wb3J0IHsgRW52aXJvbm1lbnRDb25maWcgfSBmcm9tICcuL2Vudmlyb25tZW50LWNvbmZpZyc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgUGRmQ29udmVyc2F0aW9uSW5mcmFTdGFja1Byb3BzIGV4dGVuZHMgY2RrLlN0YWNrUHJvcHMge1xuICByZWFkb25seSBkb2N1bWVudEluZ2VzdGlvblJvbGU6IGlhbS5JUm9sZTtcbiAgcmVhZG9ubHkgdGV4dHJhY3RQcm9jZXNzb3JSb2xlOiBpYW0uSVJvbGU7XG4gIHJlYWRvbmx5IHRleHRyYWN0UmVzdWx0c1Byb2Nlc3NvclJvbGU6IGlhbS5JUm9sZTtcbiAgcmVhZG9ubHkgYmVkcm9ja1ZlY3Rvcml6YXRpb25Sb2xlOiBpYW0uSVJvbGU7XG4gIHJlYWRvbmx5IHF1ZXJ5UHJvY2Vzc2luZ1JvbGU6IGlhbS5JUm9sZTtcbiAgcmVhZG9ubHkgY29udmVyc2F0aW9uRnVuY3Rpb25Sb2xlOiBpYW0uSVJvbGU7XG4gIHJlYWRvbmx5IHVzYWdlRnVuY3Rpb25Sb2xlOiBpYW0uSVJvbGU7XG4gIHJlYWRvbmx5IGVudkNvbmZpZzogRW52aXJvbm1lbnRDb25maWc7XG59XG5cbmV4cG9ydCBjbGFzcyBQZGZDb252ZXJzYXRpb25JbmZyYVN0YWNrIGV4dGVuZHMgY2RrLlN0YWNrIHtcbiAgcHVibGljIHJlYWRvbmx5IHByb2Nlc3NpbmdCdWNrZXQ6IHMzLkJ1Y2tldDtcbiAgcHVibGljIHJlYWRvbmx5IGRpZ2VzdHNCdWNrZXQ6IHMzLkJ1Y2tldDtcbiAgcHVibGljIHJlYWRvbmx5IHZlY3RvcnNKc29uQnVja2V0OiBzMy5CdWNrZXQ7XG4gIHB1YmxpYyByZWFkb25seSBzM1ZlY3RvcnNCdWNrZXROYW1lOiBzdHJpbmc7XG4gIHB1YmxpYyByZWFkb25seSBzM1ZlY3RvcnNJbmRleE5hbWU6IHN0cmluZztcbiAgcHVibGljIHJlYWRvbmx5IG1ldGFkYXRhVGFibGU6IGR5bmFtb2RiLlRhYmxlO1xuICBwdWJsaWMgcmVhZG9ubHkgcXVlcnlMb2dzVGFibGU6IGR5bmFtb2RiLlRhYmxlO1xuICBwdWJsaWMgcmVhZG9ubHkgdGV4dHJhY3RDb21wbGV0aW9uVG9waWM6IHNucy5Ub3BpYztcbiAgcHVibGljIHJlYWRvbmx5IGRvY3VtZW50SW5nZXN0aW9uRnVuY3Rpb246IGxhbWJkYS5GdW5jdGlvbjtcbiAgcHVibGljIHJlYWRvbmx5IHF1ZXJ5UHJvY2Vzc2luZ0Z1bmN0aW9uOiBsYW1iZGEuRnVuY3Rpb247XG4gIHB1YmxpYyByZWFkb25seSB0ZXh0cmFjdFJlc3VsdHNQcm9jZXNzb3JGdW5jdGlvbjogbGFtYmRhLkZ1bmN0aW9uO1xuICBwdWJsaWMgcmVhZG9ubHkgYmVkcm9ja1ZlY3Rvcml6YXRpb25GdW5jdGlvbjogbGFtYmRhLkZ1bmN0aW9uO1xuICBwdWJsaWMgcmVhZG9ubHkgY29udmVyc2F0aW9uc1RhYmxlOiBkeW5hbW9kYi5UYWJsZTtcbiAgcHVibGljIHJlYWRvbmx5IGNvbnZlcnNhdGlvbkZ1bmN0aW9uOiBsYW1iZGEuRnVuY3Rpb247XG4gIHB1YmxpYyByZWFkb25seSBzdHVkeUJvb2tEbHE6IHNxcy5RdWV1ZTtcbiAgcHVibGljIHJlYWRvbmx5IHN0dWR5Qm9va0Z1bmN0aW9uOiBsYW1iZGEuRnVuY3Rpb247XG4gIHB1YmxpYyByZWFkb25seSB1c2FnZVRhYmxlOiBkeW5hbW9kYi5UYWJsZTtcbiAgcHVibGljIHJlYWRvbmx5IHVzYWdlRnVuY3Rpb246IGxhbWJkYS5GdW5jdGlvbjtcblxuICBjb25zdHJ1Y3RvcihzY29wZTogQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wczogUGRmQ29udmVyc2F0aW9uSW5mcmFTdGFja1Byb3BzKSB7XG4gICAgc3VwZXIoc2NvcGUsIGlkLCBwcm9wcyk7XG5cbiAgICBjb25zdCBwID0gcHJvcHMuZW52Q29uZmlnLnByZWZpeDtcbiAgICBjb25zdCByZW1vdmFsUG9saWN5ID0gcHJvcHMuZW52Q29uZmlnLmRlbGV0aW9uUG9saWN5ID09PSAnUkVUQUlOJyA/IGNkay5SZW1vdmFsUG9saWN5LlJFVEFJTiA6IGNkay5SZW1vdmFsUG9saWN5LkRFU1RST1k7XG5cbiAgICAvLyBTMyBCdWNrZXRzXG4gICAgdGhpcy5wcm9jZXNzaW5nQnVja2V0ID0gbmV3IHMzLkJ1Y2tldCh0aGlzLCAnUHJvY2Vzc2luZ0J1Y2tldCcsIHtcbiAgICAgIGJ1Y2tldE5hbWU6IGAke3B9cGRmLWNvbnZlcnNhdGlvbi1wcm9jZXNzaW5nLSR7dGhpcy5hY2NvdW50fWAsXG4gICAgICB2ZXJzaW9uZWQ6IGZhbHNlLFxuICAgICAgZW5jcnlwdGlvbjogczMuQnVja2V0RW5jcnlwdGlvbi5TM19NQU5BR0VELFxuICAgICAgYmxvY2tQdWJsaWNBY2Nlc3M6IHMzLkJsb2NrUHVibGljQWNjZXNzLkJMT0NLX0FMTCxcbiAgICAgIHJlbW92YWxQb2xpY3ksXG4gICAgICBjb3JzOiBbXG4gICAgICAgIHtcbiAgICAgICAgICBhbGxvd2VkTWV0aG9kczogW1xuICAgICAgICAgICAgczMuSHR0cE1ldGhvZHMuR0VULFxuICAgICAgICAgICAgczMuSHR0cE1ldGhvZHMuUFVULFxuICAgICAgICAgICAgczMuSHR0cE1ldGhvZHMuUE9TVCxcbiAgICAgICAgICAgIHMzLkh0dHBNZXRob2RzLkRFTEVURSxcbiAgICAgICAgICAgIHMzLkh0dHBNZXRob2RzLkhFQUQsXG4gICAgICAgICAgXSxcbiAgICAgICAgICBhbGxvd2VkT3JpZ2luczogcHJvcHMuZW52Q29uZmlnLmFsbG93ZWRDb3JzT3JpZ2lucyxcbiAgICAgICAgICBhbGxvd2VkSGVhZGVyczogWycqJ10sXG4gICAgICAgICAgZXhwb3NlZEhlYWRlcnM6IFsnRVRhZyddLFxuICAgICAgICAgIG1heEFnZTogMzAwMCxcbiAgICAgICAgfSxcbiAgICAgIF0sXG4gICAgfSk7XG5cbiAgICB0aGlzLmRpZ2VzdHNCdWNrZXQgPSBuZXcgczMuQnVja2V0KHRoaXMsICdEaWdlc3RzQnVja2V0Jywge1xuICAgICAgYnVja2V0TmFtZTogYCR7cH1wZGYtY29udmVyc2F0aW9uLWRpZ2VzdHMtJHt0aGlzLmFjY291bnR9YCxcbiAgICAgIHZlcnNpb25lZDogZmFsc2UsXG4gICAgICBlbmNyeXB0aW9uOiBzMy5CdWNrZXRFbmNyeXB0aW9uLlMzX01BTkFHRUQsXG4gICAgICBibG9ja1B1YmxpY0FjY2VzczogczMuQmxvY2tQdWJsaWNBY2Nlc3MuQkxPQ0tfQUxMLFxuICAgICAgcmVtb3ZhbFBvbGljeSxcbiAgICB9KTtcblxuICAgIC8vIFMzIFZlY3RvcnMgYnVja2V0IGFuZCBpbmRleCAodXNpbmcgQ3VzdG9tIFJlc291cmNlIHNpbmNlIENESyBkb2Vzbid0IGhhdmUgbmF0aXZlIHN1cHBvcnQpXG4gICAgdGhpcy5zM1ZlY3RvcnNCdWNrZXROYW1lID0gYCR7cH1wZGYtY29udmVyc2F0aW9uLXZlY3RvcnMtJHt0aGlzLmFjY291bnR9YDtcbiAgICB0aGlzLnMzVmVjdG9yc0luZGV4TmFtZSA9ICdkb2N1bWVudC1jaHVua3MtaW5kZXgnO1xuXG4gICAgLy8gTGFtYmRhIGZ1bmN0aW9uIHRvIG1hbmFnZSBTMyBWZWN0b3JzIHJlc291cmNlc1xuICAgIGNvbnN0IHMzVmVjdG9yc1NldHVwRnVuY3Rpb24gPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsICdTM1ZlY3RvcnNTZXR1cEZ1bmN0aW9uJywge1xuICAgICAgZnVuY3Rpb25OYW1lOiBgJHtwfVMzVmVjdG9yc1NldHVwYCxcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLlBZVEhPTl8zXzksXG4gICAgICBoYW5kbGVyOiAnaW5kZXgubGFtYmRhX2hhbmRsZXInLFxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KHBhdGguam9pbihfX2Rpcm5hbWUsICcuLi8uLi8uLi9sYW1iZGEtZnVuY3Rpb25zL3MzLXZlY3RvcnMtc2V0dXAnKSksXG4gICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24ubWludXRlcyg1KSxcbiAgICAgIG1lbW9yeVNpemU6IDI1NixcbiAgICAgIGluaXRpYWxQb2xpY3k6IFtcbiAgICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgICAgICBhY3Rpb25zOiBbXG4gICAgICAgICAgICAnczN2ZWN0b3JzOkNyZWF0ZVZlY3RvckJ1Y2tldCcsXG4gICAgICAgICAgICAnczN2ZWN0b3JzOkRlbGV0ZVZlY3RvckJ1Y2tldCcsXG4gICAgICAgICAgICAnczN2ZWN0b3JzOkNyZWF0ZUluZGV4JyxcbiAgICAgICAgICAgICdzM3ZlY3RvcnM6RGVsZXRlSW5kZXgnLFxuICAgICAgICAgICAgJ3MzdmVjdG9yczpMaXN0VmVjdG9ycycsXG4gICAgICAgICAgICAnczN2ZWN0b3JzOkRlbGV0ZVZlY3RvcnMnLFxuICAgICAgICAgIF0sXG4gICAgICAgICAgcmVzb3VyY2VzOiBbJyonXSxcbiAgICAgICAgfSksXG4gICAgICBdLFxuICAgIH0pO1xuXG4gICAgLy8gQ3VzdG9tIFJlc291cmNlIFByb3ZpZGVyXG4gICAgY29uc3QgczNWZWN0b3JzUHJvdmlkZXIgPSBuZXcgY3IuUHJvdmlkZXIodGhpcywgJ1MzVmVjdG9yc1Byb3ZpZGVyJywge1xuICAgICAgb25FdmVudEhhbmRsZXI6IHMzVmVjdG9yc1NldHVwRnVuY3Rpb24sXG4gICAgfSk7XG5cbiAgICAvLyBDdXN0b20gUmVzb3VyY2UgdG8gY3JlYXRlIFMzIFZlY3RvcnMgYnVja2V0IGFuZCBpbmRleFxuICAgIG5ldyBjZGsuQ3VzdG9tUmVzb3VyY2UodGhpcywgJ1MzVmVjdG9yc1Jlc291cmNlJywge1xuICAgICAgc2VydmljZVRva2VuOiBzM1ZlY3RvcnNQcm92aWRlci5zZXJ2aWNlVG9rZW4sXG4gICAgICBwcm9wZXJ0aWVzOiB7XG4gICAgICAgIFZlY3RvckJ1Y2tldE5hbWU6IHRoaXMuczNWZWN0b3JzQnVja2V0TmFtZSxcbiAgICAgICAgSW5kZXhOYW1lOiB0aGlzLnMzVmVjdG9yc0luZGV4TmFtZSxcbiAgICAgICAgRGltZW5zaW9uOiAxMDI0LFxuICAgICAgICBEaXN0YW5jZU1ldHJpYzogJ2Nvc2luZScsXG4gICAgICAgIFJlZ2lvbjogdGhpcy5yZWdpb24sXG4gICAgICAgIC8vIFZlcnNpb24gcGFyYW1ldGVyIHRvIGZvcmNlIHJlY3JlYXRpb24gd2l0aCBub24tZmlsdGVyYWJsZSBtZXRhZGF0YVxuICAgICAgICBWZXJzaW9uOiAnMy4wLWdhLW1pZ3JhdGlvbicsXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgLy8gSlNPTiBmYWxsYmFjayBidWNrZXQgKHJlZ3VsYXIgUzMgYnVja2V0IGZvciBiYWNrdXAgc3RvcmFnZSlcbiAgICB0aGlzLnZlY3RvcnNKc29uQnVja2V0ID0gbmV3IHMzLkJ1Y2tldCh0aGlzLCAnVmVjdG9yc0pzb25CdWNrZXQnLCB7XG4gICAgICBidWNrZXROYW1lOiBgJHtwfXBkZi1jb252ZXJzYXRpb24tdmVjdG9ycy1qc29uLSR7dGhpcy5hY2NvdW50fWAsXG4gICAgICB2ZXJzaW9uZWQ6IGZhbHNlLFxuICAgICAgZW5jcnlwdGlvbjogczMuQnVja2V0RW5jcnlwdGlvbi5TM19NQU5BR0VELFxuICAgICAgYmxvY2tQdWJsaWNBY2Nlc3M6IHMzLkJsb2NrUHVibGljQWNjZXNzLkJMT0NLX0FMTCxcbiAgICAgIHJlbW92YWxQb2xpY3ksXG4gICAgfSk7XG5cbiAgICAvLyBEeW5hbW9EQiBUYWJsZXNcbiAgICB0aGlzLm1ldGFkYXRhVGFibGUgPSBuZXcgZHluYW1vZGIuVGFibGUodGhpcywgJ01ldGFkYXRhVGFibGUnLCB7XG4gICAgICB0YWJsZU5hbWU6IGAke3B9cGRmLWNvbnZlcnNhdGlvbi1tZXRhZGF0YWAsXG4gICAgICBwYXJ0aXRpb25LZXk6IHtcbiAgICAgICAgbmFtZTogJ2RvY3VtZW50X2lkJyxcbiAgICAgICAgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcsXG4gICAgICB9LFxuICAgICAgYmlsbGluZ01vZGU6IGR5bmFtb2RiLkJpbGxpbmdNb2RlLlBBWV9QRVJfUkVRVUVTVCxcbiAgICAgIGVuY3J5cHRpb246IGR5bmFtb2RiLlRhYmxlRW5jcnlwdGlvbi5BV1NfTUFOQUdFRCxcbiAgICAgIHBvaW50SW5UaW1lUmVjb3Zlcnk6IHRydWUsXG4gICAgICByZW1vdmFsUG9saWN5LFxuICAgIH0pO1xuXG4gICAgLy8gQWRkIEdTSXMgZm9yIG1ldGFkYXRhIHRhYmxlXG4gICAgdGhpcy5tZXRhZGF0YVRhYmxlLmFkZEdsb2JhbFNlY29uZGFyeUluZGV4KHtcbiAgICAgIGluZGV4TmFtZTogJ1N0YXR1c0luZGV4JyxcbiAgICAgIHBhcnRpdGlvbktleToge1xuICAgICAgICBuYW1lOiAnc3RhdHVzJyxcbiAgICAgICAgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcsXG4gICAgICB9LFxuICAgICAgc29ydEtleToge1xuICAgICAgICBuYW1lOiAnY3JlYXRlZF9hdCcsXG4gICAgICAgIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIHRoaXMubWV0YWRhdGFUYWJsZS5hZGRHbG9iYWxTZWNvbmRhcnlJbmRleCh7XG4gICAgICBpbmRleE5hbWU6ICdVc2VyRG9jdW1lbnRzSW5kZXgnLFxuICAgICAgcGFydGl0aW9uS2V5OiB7XG4gICAgICAgIG5hbWU6ICd1c2VyX2lkJyxcbiAgICAgICAgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcsXG4gICAgICB9LFxuICAgICAgc29ydEtleToge1xuICAgICAgICBuYW1lOiAnY3JlYXRlZF9hdCcsXG4gICAgICAgIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIHRoaXMucXVlcnlMb2dzVGFibGUgPSBuZXcgZHluYW1vZGIuVGFibGUodGhpcywgJ1F1ZXJ5TG9nc1RhYmxlJywge1xuICAgICAgdGFibGVOYW1lOiBgJHtwfXBkZi1jb252ZXJzYXRpb24tcXVlcnktbG9nc2AsXG4gICAgICBwYXJ0aXRpb25LZXk6IHtcbiAgICAgICAgbmFtZTogJ3F1ZXJ5X2lkJyxcbiAgICAgICAgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcsXG4gICAgICB9LFxuICAgICAgc29ydEtleToge1xuICAgICAgICBuYW1lOiAndGltZXN0YW1wJyxcbiAgICAgICAgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcsXG4gICAgICB9LFxuICAgICAgYmlsbGluZ01vZGU6IGR5bmFtb2RiLkJpbGxpbmdNb2RlLlBBWV9QRVJfUkVRVUVTVCxcbiAgICAgIGVuY3J5cHRpb246IGR5bmFtb2RiLlRhYmxlRW5jcnlwdGlvbi5BV1NfTUFOQUdFRCxcbiAgICAgIHBvaW50SW5UaW1lUmVjb3Zlcnk6IHRydWUsXG4gICAgICB0aW1lVG9MaXZlQXR0cmlidXRlOiAndHRsJyxcbiAgICAgIHJlbW92YWxQb2xpY3ksXG4gICAgfSk7XG5cbiAgICAvLyBBZGQgR1NJIGZvciBxdWVyeSBsb2dzIHRhYmxlXG4gICAgdGhpcy5xdWVyeUxvZ3NUYWJsZS5hZGRHbG9iYWxTZWNvbmRhcnlJbmRleCh7XG4gICAgICBpbmRleE5hbWU6ICdVc2VyUXVlcnlJbmRleCcsXG4gICAgICBwYXJ0aXRpb25LZXk6IHtcbiAgICAgICAgbmFtZTogJ3VzZXJfaWQnLFxuICAgICAgICB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyxcbiAgICAgIH0sXG4gICAgICBzb3J0S2V5OiB7XG4gICAgICAgIG5hbWU6ICd0aW1lc3RhbXAnLFxuICAgICAgICB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICB0aGlzLmNvbnZlcnNhdGlvbnNUYWJsZSA9IG5ldyBkeW5hbW9kYi5UYWJsZSh0aGlzLCAnQ29udmVyc2F0aW9uc1RhYmxlJywge1xuICAgICAgdGFibGVOYW1lOiBgJHtwfXBkZi1jb252ZXJzYXRpb24tY29udmVyc2F0aW9uc2AsXG4gICAgICBwYXJ0aXRpb25LZXk6IHtcbiAgICAgICAgbmFtZTogJ2NvbnZlcnNhdGlvbl9pZCcsXG4gICAgICAgIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HLFxuICAgICAgfSxcbiAgICAgIGJpbGxpbmdNb2RlOiBkeW5hbW9kYi5CaWxsaW5nTW9kZS5QQVlfUEVSX1JFUVVFU1QsXG4gICAgICBlbmNyeXB0aW9uOiBkeW5hbW9kYi5UYWJsZUVuY3J5cHRpb24uQVdTX01BTkFHRUQsXG4gICAgICBwb2ludEluVGltZVJlY292ZXJ5OiB0cnVlLFxuICAgICAgdGltZVRvTGl2ZUF0dHJpYnV0ZTogJ3R0bCcsXG4gICAgICByZW1vdmFsUG9saWN5LFxuICAgIH0pO1xuXG4gICAgdGhpcy5jb252ZXJzYXRpb25zVGFibGUuYWRkR2xvYmFsU2Vjb25kYXJ5SW5kZXgoe1xuICAgICAgaW5kZXhOYW1lOiAnRG9jdW1lbnRDb252ZXJzYXRpb25zSW5kZXgnLFxuICAgICAgcGFydGl0aW9uS2V5OiB7XG4gICAgICAgIG5hbWU6ICdkb2N1bWVudF9pZCcsXG4gICAgICAgIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HLFxuICAgICAgfSxcbiAgICAgIHNvcnRLZXk6IHtcbiAgICAgICAgbmFtZTogJ2NyZWF0ZWRfYXQnLFxuICAgICAgICB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICB0aGlzLnVzYWdlVGFibGUgPSBuZXcgZHluYW1vZGIuVGFibGUodGhpcywgJ1VzYWdlVGFibGUnLCB7XG4gICAgICB0YWJsZU5hbWU6IGAke3B9Zm9saW8tdXNhZ2VgLFxuICAgICAgcGFydGl0aW9uS2V5OiB7IG5hbWU6ICd1c2VyX2lkJywgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcgfSxcbiAgICAgIHNvcnRLZXk6IHsgbmFtZTogJ21vbnRoX2tleScsIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HIH0sXG4gICAgICBiaWxsaW5nTW9kZTogZHluYW1vZGIuQmlsbGluZ01vZGUuUEFZX1BFUl9SRVFVRVNULFxuICAgICAgZW5jcnlwdGlvbjogZHluYW1vZGIuVGFibGVFbmNyeXB0aW9uLkFXU19NQU5BR0VELFxuICAgICAgdGltZVRvTGl2ZUF0dHJpYnV0ZTogJ3R0bCcsXG4gICAgICByZW1vdmFsUG9saWN5LFxuICAgIH0pO1xuXG4gICAgLy8gU05TIFRvcGljXG4gICAgdGhpcy50ZXh0cmFjdENvbXBsZXRpb25Ub3BpYyA9IG5ldyBzbnMuVG9waWModGhpcywgJ1RleHRyYWN0Q29tcGxldGlvblRvcGljJywge1xuICAgICAgdG9waWNOYW1lOiBgJHtwfXRleHRyYWN0LWNvbXBsZXRpb25gLFxuICAgICAgZGlzcGxheU5hbWU6ICdUZXh0cmFjdCBKb2IgQ29tcGxldGlvbiBOb3RpZmljYXRpb25zJyxcbiAgICB9KTtcblxuICAgIC8vIFNOUyB0b3BpYyBmb3IgdmVjdG9yaXphdGlvbiBjb21wbGV0aW9uICh0cmlnZ2VycyBhdXRvLXN1bW1hcnkgZ2VuZXJhdGlvbilcbiAgICBjb25zdCB2ZWN0b3JpemF0aW9uQ29tcGxldGVUb3BpYyA9IG5ldyBzbnMuVG9waWModGhpcywgJ1ZlY3Rvcml6YXRpb25Db21wbGV0ZVRvcGljJywge1xuICAgICAgdG9waWNOYW1lOiBgJHtwfXZlY3Rvcml6YXRpb24tY29tcGxldGVgLFxuICAgICAgZGlzcGxheU5hbWU6ICdEb2N1bWVudCBWZWN0b3JpemF0aW9uIENvbXBsZXRpb24gTm90aWZpY2F0aW9ucycsXG4gICAgfSk7XG5cbiAgICAvLyBPdXRwdXQga2V5IHJlc291cmNlcyBmb3Igb3RoZXIgc3RhY2tzXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1Byb2Nlc3NpbmdCdWNrZXROYW1lJywge1xuICAgICAgdmFsdWU6IHRoaXMucHJvY2Vzc2luZ0J1Y2tldC5idWNrZXROYW1lLFxuICAgICAgZXhwb3J0TmFtZTogYCR7cH1wZGYtY29udmVyc2F0aW9uLXByb2Nlc3NpbmctYnVja2V0YCxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdEaWdlc3RzQnVja2V0TmFtZScsIHtcbiAgICAgIHZhbHVlOiB0aGlzLmRpZ2VzdHNCdWNrZXQuYnVja2V0TmFtZSxcbiAgICAgIGV4cG9ydE5hbWU6IGAke3B9cGRmLWNvbnZlcnNhdGlvbi1kaWdlc3RzLWJ1Y2tldGAsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnVmVjdG9yc0J1Y2tldE5hbWUnLCB7XG4gICAgICB2YWx1ZTogdGhpcy5zM1ZlY3RvcnNCdWNrZXROYW1lLFxuICAgICAgZXhwb3J0TmFtZTogYCR7cH1wZGYtY29udmVyc2F0aW9uLXZlY3RvcnMtYnVja2V0YCxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdNZXRhZGF0YVRhYmxlTmFtZScsIHtcbiAgICAgIHZhbHVlOiB0aGlzLm1ldGFkYXRhVGFibGUudGFibGVOYW1lLFxuICAgICAgZXhwb3J0TmFtZTogYCR7cH1wZGYtY29udmVyc2F0aW9uLW1ldGFkYXRhLXRhYmxlYCxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdRdWVyeUxvZ3NUYWJsZU5hbWUnLCB7XG4gICAgICB2YWx1ZTogdGhpcy5xdWVyeUxvZ3NUYWJsZS50YWJsZU5hbWUsXG4gICAgICBleHBvcnROYW1lOiBgJHtwfXBkZi1jb252ZXJzYXRpb24tcXVlcnktbG9ncy10YWJsZWAsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnVGV4dHJhY3RUb3BpY0FybicsIHtcbiAgICAgIHZhbHVlOiB0aGlzLnRleHRyYWN0Q29tcGxldGlvblRvcGljLnRvcGljQXJuLFxuICAgICAgZXhwb3J0TmFtZTogYCR7cH1wZGYtY29udmVyc2F0aW9uLXRleHRyYWN0LXRvcGljLWFybmAsXG4gICAgfSk7XG5cbiAgICAvLyBMYW1iZGEgRnVuY3Rpb25zIC0gNC1GdW5jdGlvbiBXb3JrZmxvd1xuICAgIC8vIEZsb3c6IFVwbG9hZCDihpIgRG9jdW1lbnRJbmdlc3Rpb24g4oaSIFRleHRyYWN0UmVzdWx0cyDihpIgQmVkcm9ja1ZlY3Rvcml6YXRpb24g4oaSIFF1ZXJ5UHJvY2Vzc2luZ1xuXG4gICAgLy8gMS4gRG9jdW1lbnQgSW5nZXN0aW9uIEZ1bmN0aW9uIChTMyB0cmlnZ2VyZWQsIHN0YXJ0cyBhc3luYyBUZXh0cmFjdCBqb2IpXG4gICAgdGhpcy5kb2N1bWVudEluZ2VzdGlvbkZ1bmN0aW9uID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCAnRG9jdW1lbnRJbmdlc3Rpb25GdW5jdGlvbicsIHtcbiAgICAgIGZ1bmN0aW9uTmFtZTogYCR7cH1Eb2N1bWVudEluZ2VzdGlvbkZ1bmN0aW9uYCxcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLlBZVEhPTl8zXzEzLFxuICAgICAgaGFuZGxlcjogJ2luZGV4LmxhbWJkYV9oYW5kbGVyJyxcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldChwYXRoLmpvaW4oX19kaXJuYW1lLCAnLi4vLi4vLi4vbGFtYmRhLWZ1bmN0aW9ucy9kb2N1bWVudC1pbmdlc3Rpb24nKSwge1xuICAgICAgICBidW5kbGluZzoge1xuICAgICAgICAgIGltYWdlOiBsYW1iZGEuUnVudGltZS5QWVRIT05fM18xMy5idW5kbGluZ0ltYWdlLFxuICAgICAgICAgIGNvbW1hbmQ6IFtcbiAgICAgICAgICAgICdiYXNoJywgJy1jJyxcbiAgICAgICAgICAgICdwaXAgaW5zdGFsbCAtciByZXF1aXJlbWVudHMudHh0IC10IC9hc3NldC1vdXRwdXQgJiYgY3AgLWF1IC4gL2Fzc2V0LW91dHB1dCdcbiAgICAgICAgICBdLFxuICAgICAgICB9LFxuICAgICAgfSksXG4gICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24uc2Vjb25kcygzMDApLFxuICAgICAgbWVtb3J5U2l6ZTogNTEyLFxuICAgICAgcm9sZTogcHJvcHMuZG9jdW1lbnRJbmdlc3Rpb25Sb2xlLFxuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgTUVUQURBVEFfVEFCTEU6IHRoaXMubWV0YWRhdGFUYWJsZS50YWJsZU5hbWUsXG4gICAgICAgIFNOU19UT1BJQ19BUk46IHRoaXMudGV4dHJhY3RDb21wbGV0aW9uVG9waWMudG9waWNBcm4sXG4gICAgICAgIERJR0VTVFNfQlVDS0VUOiB0aGlzLmRpZ2VzdHNCdWNrZXQuYnVja2V0TmFtZSxcbiAgICAgICAgUkVHSU9OX05BTUU6IHRoaXMucmVnaW9uLFxuICAgICAgICBVU0FHRV9UQUJMRTogdGhpcy51c2FnZVRhYmxlLnRhYmxlTmFtZSxcbiAgICAgICAgVVNFUl9QT09MX0lEOiBwcm9wcy5lbnZDb25maWcudXNlclBvb2xJZCxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICAvLyBBZGQgUzMgZXZlbnQgdHJpZ2dlciBmb3IgZG9jdW1lbnQgdXBsb2Fkc1xuICAgIHRoaXMucHJvY2Vzc2luZ0J1Y2tldC5hZGRFdmVudE5vdGlmaWNhdGlvbihcbiAgICAgIHMzLkV2ZW50VHlwZS5PQkpFQ1RfQ1JFQVRFRCxcbiAgICAgIG5ldyBzM24uTGFtYmRhRGVzdGluYXRpb24odGhpcy5kb2N1bWVudEluZ2VzdGlvbkZ1bmN0aW9uKSxcbiAgICAgIHsgcHJlZml4OiAndXNlcnMvJyB9XG4gICAgKTtcblxuICAgIC8vIDIuIFRleHRyYWN0IFJlc3VsdHMgUHJvY2Vzc29yIEZ1bmN0aW9uIChTTlMgdHJpZ2dlcmVkIHdoZW4gVGV4dHJhY3QgY29tcGxldGVzKVxuICAgIHRoaXMudGV4dHJhY3RSZXN1bHRzUHJvY2Vzc29yRnVuY3Rpb24gPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsICdUZXh0cmFjdFJlc3VsdHNQcm9jZXNzb3JGdW5jdGlvbicsIHtcbiAgICAgIGZ1bmN0aW9uTmFtZTogYCR7cH1UZXh0cmFjdFJlc3VsdHNQcm9jZXNzb3JGdW5jdGlvbmAsXG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5QWVRIT05fM18xMyxcbiAgICAgIGhhbmRsZXI6ICdpbmRleC5sYW1iZGFfaGFuZGxlcicsXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQocGF0aC5qb2luKF9fZGlybmFtZSwgJy4uLy4uLy4uL2xhbWJkYS1mdW5jdGlvbnMvdGV4dHJhY3QtcmVzdWx0cy1wcm9jZXNzb3InKSksXG4gICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24uc2Vjb25kcyg5MDApLFxuICAgICAgbWVtb3J5U2l6ZTogMTAyNCxcbiAgICAgIHJvbGU6IHByb3BzLnRleHRyYWN0UmVzdWx0c1Byb2Nlc3NvclJvbGUsXG4gICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICBNRVRBREFUQV9UQUJMRTogdGhpcy5tZXRhZGF0YVRhYmxlLnRhYmxlTmFtZSxcbiAgICAgICAgRElHRVNUU19CVUNLRVQ6IHRoaXMuZGlnZXN0c0J1Y2tldC5idWNrZXROYW1lLFxuICAgICAgICBSRUdJT05fTkFNRTogdGhpcy5yZWdpb24sXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgdGhpcy50ZXh0cmFjdFJlc3VsdHNQcm9jZXNzb3JGdW5jdGlvbi5hZGRFdmVudFNvdXJjZShcbiAgICAgIG5ldyBsYW1iZGFFdmVudFNvdXJjZXMuU25zRXZlbnRTb3VyY2UodGhpcy50ZXh0cmFjdENvbXBsZXRpb25Ub3BpYylcbiAgICApO1xuXG4gICAgLy8gMy4gQmVkcm9jayBWZWN0b3JpemF0aW9uIEZ1bmN0aW9uIChTMyB0cmlnZ2VyZWQgd2hlbiBkaWdlc3QgSlNPTiBjcmVhdGVkKVxuICAgIHRoaXMuYmVkcm9ja1ZlY3Rvcml6YXRpb25GdW5jdGlvbiA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgJ0JlZHJvY2tWZWN0b3JpemF0aW9uRnVuY3Rpb24nLCB7XG4gICAgICBmdW5jdGlvbk5hbWU6IGAke3B9QmVkcm9ja1RvUzNWZWN0b3JpemF0aW9uYCxcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLlBZVEhPTl8zXzksXG4gICAgICBoYW5kbGVyOiAnaW5kZXgubGFtYmRhX2hhbmRsZXInLFxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KHBhdGguam9pbihfX2Rpcm5hbWUsICcuLi8uLi8uLi9sYW1iZGEtZnVuY3Rpb25zL2JlZHJvY2stdmVjdG9yaXphdGlvbicpLCB7XG4gICAgICAgIGJ1bmRsaW5nOiB7XG4gICAgICAgICAgaW1hZ2U6IGxhbWJkYS5SdW50aW1lLlBZVEhPTl8zXzkuYnVuZGxpbmdJbWFnZSxcbiAgICAgICAgICBjb21tYW5kOiBbXG4gICAgICAgICAgICAnYmFzaCcsICctYycsXG4gICAgICAgICAgICAncGlwIGluc3RhbGwgLXIgcmVxdWlyZW1lbnRzLnR4dCAtdCAvYXNzZXQtb3V0cHV0ICYmIGNwIC1hdSAuIC9hc3NldC1vdXRwdXQnXG4gICAgICAgICAgXSxcbiAgICAgICAgfSxcbiAgICAgIH0pLFxuICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLnNlY29uZHMoMzAwKSxcbiAgICAgIG1lbW9yeVNpemU6IDUxMixcbiAgICAgIHJvbGU6IHByb3BzLmJlZHJvY2tWZWN0b3JpemF0aW9uUm9sZSxcbiAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgIFMzX1ZFQ1RPUlNfQlVDS0VUOiB0aGlzLnMzVmVjdG9yc0J1Y2tldE5hbWUsXG4gICAgICAgIFMzX1ZFQ1RPUl9JTkRFWF9OQU1FOiB0aGlzLnMzVmVjdG9yc0luZGV4TmFtZSxcbiAgICAgICAgUzNfSlNPTl9GQUxMQkFDS19CVUNLRVQ6IHRoaXMudmVjdG9yc0pzb25CdWNrZXQuYnVja2V0TmFtZSxcbiAgICAgICAgUFJPQ0VTU0VEX0JVQ0tFVDogdGhpcy5kaWdlc3RzQnVja2V0LmJ1Y2tldE5hbWUsXG4gICAgICAgIE1FVEFEQVRBX1RBQkxFOiB0aGlzLm1ldGFkYXRhVGFibGUudGFibGVOYW1lLFxuICAgICAgICBWRUNUT1JJWkFUSU9OX0NPTVBMRVRFX1RPUElDOiB2ZWN0b3JpemF0aW9uQ29tcGxldGVUb3BpYy50b3BpY0FybixcbiAgICAgICAgTUFYX0NIVU5LU19QRVJfRE9DVU1FTlQ6ICc1MDAnLFxuICAgICAgICBSRUdJT05fTkFNRTogdGhpcy5yZWdpb24sXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgLy8gTm90ZTogU05TIHB1Ymxpc2ggcGVybWlzc2lvbiBncmFudGVkIGluIFNlY3VyaXR5U3RhY2sgdG8gYXZvaWQgY2lyY3VsYXIgZGVwZW5kZW5jeVxuXG4gICAgdGhpcy5kaWdlc3RzQnVja2V0LmFkZEV2ZW50Tm90aWZpY2F0aW9uKFxuICAgICAgczMuRXZlbnRUeXBlLk9CSkVDVF9DUkVBVEVELFxuICAgICAgbmV3IHMzbi5MYW1iZGFEZXN0aW5hdGlvbih0aGlzLmJlZHJvY2tWZWN0b3JpemF0aW9uRnVuY3Rpb24pLFxuICAgICAgeyBzdWZmaXg6ICcuanNvbicgfVxuICAgICk7XG5cbiAgICAvLyA0LiBRdWVyeSBQcm9jZXNzaW5nIEZ1bmN0aW9uIChBUEkgR2F0ZXdheSB0cmlnZ2VyZWQgZm9yIHVzZXIgcXVlcmllcylcbiAgICAvLyBEb2N1bWVudFNlYXJjaEZ1bmN0aW9uIOKAlCBzZW1hbnRpYyBzaW1pbGFyaXR5IHNlYXJjaCBvbmx5IChubyBIYWlrdSwgbm8gc3VtbWFyaWVzKVxuICAgIHRoaXMucXVlcnlQcm9jZXNzaW5nRnVuY3Rpb24gPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsICdRdWVyeVByb2Nlc3NpbmdGdW5jdGlvbicsIHtcbiAgICAgIGZ1bmN0aW9uTmFtZTogYCR7cH1RdWVyeVByb2Nlc3NpbmdGdW5jdGlvbmAsXG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5QWVRIT05fM18xMyxcbiAgICAgIGhhbmRsZXI6ICdpbmRleC5sYW1iZGFfaGFuZGxlcicsXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQocGF0aC5qb2luKF9fZGlybmFtZSwgJy4uLy4uLy4uL2xhbWJkYS1mdW5jdGlvbnMvcXVlcnktcHJvY2Vzc2luZycpKSxcbiAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDMwKSxcbiAgICAgIG1lbW9yeVNpemU6IDUxMixcbiAgICAgIHJvbGU6IHByb3BzLnF1ZXJ5UHJvY2Vzc2luZ1JvbGUsXG4gICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICBTM19WRUNUT1JTX0JVQ0tFVDogdGhpcy5zM1ZlY3RvcnNCdWNrZXROYW1lLFxuICAgICAgICBTM19WRUNUT1JfSU5ERVhfTkFNRTogdGhpcy5zM1ZlY3RvcnNJbmRleE5hbWUsXG4gICAgICAgIE1FVEFEQVRBX1RBQkxFOiB0aGlzLm1ldGFkYXRhVGFibGUudGFibGVOYW1lLFxuICAgICAgICBRVUVSWV9MT0dTX1RBQkxFOiB0aGlzLnF1ZXJ5TG9nc1RhYmxlLnRhYmxlTmFtZSxcbiAgICAgICAgQkVEUk9DS19NT0RFTF9JRDogJ2NvaGVyZS5lbWJlZC1tdWx0aWxpbmd1YWwtdjMnLFxuICAgICAgICBNQVhfUkVTVUxUU19MSU1JVDogJzEwMCcsXG4gICAgICAgIE1BWF9DT05URVhUX0NIQVJTOiAnNTAwMDAnLFxuICAgICAgICBSRUdJT05fTkFNRTogdGhpcy5yZWdpb24sXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgLy8gRGVhZC1sZXR0ZXIgcXVldWUgZm9yIGZhaWxlZCBTdHVkeUJvb2sgZXZlbnRzICgxNC1kYXkgcmV0ZW50aW9uIGZvciBpbnNwZWN0aW9uKVxuICAgIGNvbnN0IHN1bW1hcnlHZW5lcmF0aW9uRGxxID0gbmV3IHNxcy5RdWV1ZSh0aGlzLCAnU3VtbWFyeUdlbmVyYXRpb25ETFEnLCB7XG4gICAgICBxdWV1ZU5hbWU6IGAke3B9U3VtbWFyeUdlbmVyYXRpb25ETFFgLFxuICAgICAgcmV0ZW50aW9uUGVyaW9kOiBjZGsuRHVyYXRpb24uZGF5cygxNCksXG4gICAgfSk7XG5cbiAgICAvLyBTUVMgcXVldWUgZm9yIFN0dWR5Qm9vayDigJQgY29ycmVjdCByZXRyeS9ETFEgc2VtYW50aWNzIGZvciBTTlMtdHJpZ2dlcmVkIExhbWJkYVxuICAgIGNvbnN0IHN0dWR5Qm9va1F1ZXVlID0gbmV3IHNxcy5RdWV1ZSh0aGlzLCAnU3R1ZHlCb29rUXVldWUnLCB7XG4gICAgICBxdWV1ZU5hbWU6IGAke3B9U3R1ZHlCb29rUXVldWVgLFxuICAgICAgdmlzaWJpbGl0eVRpbWVvdXQ6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDk2MCksXG4gICAgICByZXRlbnRpb25QZXJpb2Q6IGNkay5EdXJhdGlvbi5kYXlzKDE0KSxcbiAgICAgIGRlYWRMZXR0ZXJRdWV1ZToge1xuICAgICAgICBxdWV1ZTogc3VtbWFyeUdlbmVyYXRpb25EbHEsXG4gICAgICAgIG1heFJlY2VpdmVDb3VudDogMSxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICB2ZWN0b3JpemF0aW9uQ29tcGxldGVUb3BpYy5hZGRTdWJzY3JpcHRpb24oXG4gICAgICBuZXcgc25zX3N1YnNjcmlwdGlvbnMuU3FzU3Vic2NyaXB0aW9uKHN0dWR5Qm9va1F1ZXVlLCB7IHJhd01lc3NhZ2VEZWxpdmVyeTogZmFsc2UgfSlcbiAgICApO1xuXG4gICAgdGhpcy5zdHVkeUJvb2tEbHEgPSBzdW1tYXJ5R2VuZXJhdGlvbkRscTtcblxuICAgIC8vIFN0dWR5Qm9vayBpbmxpbmUgcm9sZSAoa2VwdCBpbmxpbmUgdG8gYXZvaWQgY2lyY3VsYXIgZGVwZW5kZW5jeSB3aXRoIER5bmFtb0RCL1NRUyBncmFudHMpXG4gICAgY29uc3Qgc3R1ZHlCb29rUm9sZSA9IG5ldyBpYW0uUm9sZSh0aGlzLCAnU3R1ZHlCb29rUm9sZScsIHtcbiAgICAgIGFzc3VtZWRCeTogbmV3IGlhbS5TZXJ2aWNlUHJpbmNpcGFsKCdsYW1iZGEuYW1hem9uYXdzLmNvbScpLFxuICAgICAgbWFuYWdlZFBvbGljaWVzOiBbXG4gICAgICAgIGlhbS5NYW5hZ2VkUG9saWN5LmZyb21Bd3NNYW5hZ2VkUG9saWN5TmFtZSgnc2VydmljZS1yb2xlL0FXU0xhbWJkYUJhc2ljRXhlY3V0aW9uUm9sZScpLFxuICAgICAgXSxcbiAgICAgIGlubGluZVBvbGljaWVzOiB7XG4gICAgICAgIFN0dWR5Qm9va1BvbGljeTogbmV3IGlhbS5Qb2xpY3lEb2N1bWVudCh7XG4gICAgICAgICAgc3RhdGVtZW50czogW1xuICAgICAgICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICAgICAgICAgIGFjdGlvbnM6IFsnczM6R2V0T2JqZWN0J10sXG4gICAgICAgICAgICAgIHJlc291cmNlczogW2Ake3RoaXMuZGlnZXN0c0J1Y2tldC5idWNrZXRBcm59L3VzZXJzLypgXSxcbiAgICAgICAgICAgIH0pLFxuICAgICAgICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICAgICAgICAgIGFjdGlvbnM6IFsnZHluYW1vZGI6R2V0SXRlbScsICdkeW5hbW9kYjpVcGRhdGVJdGVtJ10sXG4gICAgICAgICAgICAgIHJlc291cmNlczogW1xuICAgICAgICAgICAgICAgIGBhcm46YXdzOmR5bmFtb2RiOiR7dGhpcy5yZWdpb259OiR7dGhpcy5hY2NvdW50fTp0YWJsZS8ke3B9cGRmLWNvbnZlcnNhdGlvbi1tZXRhZGF0YWAsXG4gICAgICAgICAgICAgIF0sXG4gICAgICAgICAgICB9KSxcbiAgICAgICAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICAgICAgICBhY3Rpb25zOiBbJ2JlZHJvY2s6SW52b2tlTW9kZWwnXSxcbiAgICAgICAgICAgICAgcmVzb3VyY2VzOiBbXG4gICAgICAgICAgICAgICAgYGFybjphd3M6YmVkcm9jazoke3RoaXMucmVnaW9ufTo6Zm91bmRhdGlvbi1tb2RlbC9hbnRocm9waWMuY2xhdWRlLWhhaWt1LTQtNS0yMDI1MTAwMS12MTowYCxcbiAgICAgICAgICAgICAgICBgYXJuOmF3czpiZWRyb2NrOiR7dGhpcy5yZWdpb259OiR7dGhpcy5hY2NvdW50fTppbmZlcmVuY2UtcHJvZmlsZS91cy5hbnRocm9waWMuY2xhdWRlLWhhaWt1LTQtNS0yMDI1MTAwMS12MTowYCxcbiAgICAgICAgICAgICAgICBgYXJuOmF3czpiZWRyb2NrOnVzLWVhc3QtMTo6Zm91bmRhdGlvbi1tb2RlbC9hbnRocm9waWMuY2xhdWRlLWhhaWt1LTQtNS0yMDI1MTAwMS12MTowYCxcbiAgICAgICAgICAgICAgICBgYXJuOmF3czpiZWRyb2NrOnVzLWVhc3QtMjo6Zm91bmRhdGlvbi1tb2RlbC9hbnRocm9waWMuY2xhdWRlLWhhaWt1LTQtNS0yMDI1MTAwMS12MTowYCxcbiAgICAgICAgICAgICAgXSxcbiAgICAgICAgICAgIH0pLFxuICAgICAgICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICAgICAgICAgIGFjdGlvbnM6IFsnZHluYW1vZGI6VXBkYXRlSXRlbSddLFxuICAgICAgICAgICAgICByZXNvdXJjZXM6IFtgYXJuOmF3czpkeW5hbW9kYjoke3RoaXMucmVnaW9ufToke3RoaXMuYWNjb3VudH06dGFibGUvJHtwfWZvbGlvLXVzYWdlYF0sXG4gICAgICAgICAgICB9KSxcbiAgICAgICAgICBdLFxuICAgICAgICB9KSxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICB0aGlzLnN0dWR5Qm9va0Z1bmN0aW9uID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCAnU3R1ZHlCb29rRnVuY3Rpb24nLCB7XG4gICAgICBmdW5jdGlvbk5hbWU6IGAke3B9U3R1ZHlCb29rRnVuY3Rpb25gLFxuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuUFlUSE9OXzNfMTMsXG4gICAgICBoYW5kbGVyOiAnaW5kZXgubGFtYmRhX2hhbmRsZXInLFxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KHBhdGguam9pbihfX2Rpcm5hbWUsICcuLi8uLi8uLi9sYW1iZGEtZnVuY3Rpb25zL3N1bW1hcnktZ2VuZXJhdGlvbicpKSxcbiAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDkwMCksXG4gICAgICBtZW1vcnlTaXplOiAxMDI0LFxuICAgICAgcm9sZTogc3R1ZHlCb29rUm9sZSxcbiAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgIERJR0VTVFNfQlVDS0VUOiB0aGlzLmRpZ2VzdHNCdWNrZXQuYnVja2V0TmFtZSxcbiAgICAgICAgTUVUQURBVEFfVEFCTEU6IHRoaXMubWV0YWRhdGFUYWJsZS50YWJsZU5hbWUsXG4gICAgICAgIEhBSUtVX01PREVMX0lEOiAndXMuYW50aHJvcGljLmNsYXVkZS1oYWlrdS00LTUtMjAyNTEwMDEtdjE6MCcsXG4gICAgICAgIENIVU5LX1NJWkU6ICcyMDAwJyxcbiAgICAgICAgQ0hVTktTX1BFUl9HUk9VUDogJzEwJyxcbiAgICAgICAgSEFJS1VfSU5URVJfQ0FMTF9ERUxBWTogJzAuNScsXG4gICAgICAgIFJFR0lPTl9OQU1FOiB0aGlzLnJlZ2lvbixcbiAgICAgICAgVVNBR0VfVEFCTEU6IHRoaXMudXNhZ2VUYWJsZS50YWJsZU5hbWUsXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgLy8gV2lyZSB0byBTUVMgZXZlbnQgc291cmNlIOKAlCBiYXRjaFNpemU6MSBlbnN1cmVzIG9uZSBkb2N1bWVudCBwZXIgaW52b2NhdGlvblxuICAgIHRoaXMuc3R1ZHlCb29rRnVuY3Rpb24uYWRkRXZlbnRTb3VyY2UoXG4gICAgICBuZXcgbGFtYmRhRXZlbnRTb3VyY2VzLlNxc0V2ZW50U291cmNlKHN0dWR5Qm9va1F1ZXVlLCB7IGJhdGNoU2l6ZTogMSB9KVxuICAgICk7XG5cbiAgICAvLyBHcmFudCBTUVMgY29uc3VtZSBhY2Nlc3NcbiAgICBzdHVkeUJvb2tRdWV1ZS5ncmFudENvbnN1bWVNZXNzYWdlcyhzdHVkeUJvb2tSb2xlKTtcbiAgICBzdW1tYXJ5R2VuZXJhdGlvbkRscS5ncmFudFNlbmRNZXNzYWdlcyhzdHVkeUJvb2tSb2xlKTtcblxuICAgIC8vIDYuIENvbnZlcnNhdGlvbiBGdW5jdGlvbiAoQVBJIEdhdGV3YXkgdHJpZ2dlcmVkIGZvciBtdWx0aS10dXJuIGNvbnZlcnNhdGlvbnMpXG4gICAgdGhpcy5jb252ZXJzYXRpb25GdW5jdGlvbiA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgJ0NvbnZlcnNhdGlvbkZ1bmN0aW9uJywge1xuICAgICAgZnVuY3Rpb25OYW1lOiBgJHtwfUNvbnZlcnNhdGlvbkZ1bmN0aW9uYCxcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLlBZVEhPTl8zXzksXG4gICAgICBoYW5kbGVyOiAnaW5kZXgubGFtYmRhX2hhbmRsZXInLFxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KHBhdGguam9pbihfX2Rpcm5hbWUsICcuLi8uLi8uLi9sYW1iZGEtZnVuY3Rpb25zL2NvbnZlcnNhdGlvbicpKSxcbiAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDYwKSxcbiAgICAgIG1lbW9yeVNpemU6IDUxMixcbiAgICAgIHJvbGU6IHByb3BzLmNvbnZlcnNhdGlvbkZ1bmN0aW9uUm9sZSxcbiAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgIENPTlZFUlNBVElPTlNfVEFCTEU6IHRoaXMuY29udmVyc2F0aW9uc1RhYmxlLnRhYmxlTmFtZSxcbiAgICAgICAgTUVUQURBVEFfVEFCTEU6IHRoaXMubWV0YWRhdGFUYWJsZS50YWJsZU5hbWUsXG4gICAgICAgIFMzX1ZFQ1RPUlNfQlVDS0VUOiB0aGlzLnMzVmVjdG9yc0J1Y2tldE5hbWUsXG4gICAgICAgIFMzX1ZFQ1RPUl9JTkRFWF9OQU1FOiB0aGlzLnMzVmVjdG9yc0luZGV4TmFtZSxcbiAgICAgICAgSEFJS1VfTU9ERUxfSUQ6ICd1cy5hbnRocm9waWMuY2xhdWRlLWhhaWt1LTQtNS0yMDI1MTAwMS12MTowJyxcbiAgICAgICAgQkVEUk9DS19NT0RFTF9JRDogJ2NvaGVyZS5lbWJlZC1tdWx0aWxpbmd1YWwtdjMnLFxuICAgICAgICBSRUdJT05fTkFNRTogdGhpcy5yZWdpb24sXG4gICAgICAgIEFMTE9XRURfT1JJR0lOUzogcHJvcHMuZW52Q29uZmlnLmFsbG93ZWRDb3JzT3JpZ2lucy5qb2luKCcsJyksXG4gICAgICAgIFVTQUdFX1RBQkxFOiB0aGlzLnVzYWdlVGFibGUudGFibGVOYW1lLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIHRoaXMudXNhZ2VGdW5jdGlvbiA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgJ1VzYWdlRnVuY3Rpb24nLCB7XG4gICAgICBmdW5jdGlvbk5hbWU6IGAke3B9VXNhZ2VGdW5jdGlvbmAsXG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5QWVRIT05fM18xMyxcbiAgICAgIGhhbmRsZXI6ICdpbmRleC5sYW1iZGFfaGFuZGxlcicsXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQocGF0aC5qb2luKF9fZGlybmFtZSwgJy4uLy4uLy4uL2xhbWJkYS1mdW5jdGlvbnMvdXNhZ2UnKSksXG4gICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24uc2Vjb25kcygxMCksXG4gICAgICBtZW1vcnlTaXplOiAxMjgsXG4gICAgICByb2xlOiBwcm9wcy51c2FnZUZ1bmN0aW9uUm9sZSxcbiAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgIFVTQUdFX1RBQkxFOiB0aGlzLnVzYWdlVGFibGUudGFibGVOYW1lLFxuICAgICAgICBSRUdJT05fTkFNRTogdGhpcy5yZWdpb24sXG4gICAgICAgIEFMTE9XRURfT1JJR0lOUzogcHJvcHMuZW52Q29uZmlnLmFsbG93ZWRDb3JzT3JpZ2lucy5qb2luKCcsJyksXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdEb2N1bWVudEluZ2VzdGlvbkZ1bmN0aW9uQXJuJywge1xuICAgICAgdmFsdWU6IHRoaXMuZG9jdW1lbnRJbmdlc3Rpb25GdW5jdGlvbi5mdW5jdGlvbkFybixcbiAgICAgIGV4cG9ydE5hbWU6IGAke3B9ZG9jdW1lbnQtaW5nZXN0aW9uLWZ1bmN0aW9uLWFybmAsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnRG9jdW1lbnRTZWFyY2hGdW5jdGlvbkFybicsIHtcbiAgICAgIHZhbHVlOiB0aGlzLnF1ZXJ5UHJvY2Vzc2luZ0Z1bmN0aW9uLmZ1bmN0aW9uQXJuLFxuICAgICAgZXhwb3J0TmFtZTogYCR7cH1kb2N1bWVudC1zZWFyY2gtZnVuY3Rpb24tYXJuYCxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdDb252ZXJzYXRpb25GdW5jdGlvbkFybicsIHtcbiAgICAgIHZhbHVlOiB0aGlzLmNvbnZlcnNhdGlvbkZ1bmN0aW9uLmZ1bmN0aW9uQXJuLFxuICAgICAgZXhwb3J0TmFtZTogYCR7cH1jb252ZXJzYXRpb24tZnVuY3Rpb24tYXJuYCxcbiAgICB9KTtcbiAgfVxufSJdfQ==