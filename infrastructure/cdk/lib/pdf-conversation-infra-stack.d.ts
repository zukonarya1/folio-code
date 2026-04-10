import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
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
export declare class PdfConversationInfraStack extends cdk.Stack {
    readonly processingBucket: s3.Bucket;
    readonly digestsBucket: s3.Bucket;
    readonly vectorsJsonBucket: s3.Bucket;
    readonly s3VectorsBucketName: string;
    readonly s3VectorsIndexName: string;
    readonly metadataTable: dynamodb.Table;
    readonly queryLogsTable: dynamodb.Table;
    readonly textractCompletionTopic: sns.Topic;
    readonly documentIngestionFunction: lambda.Function;
    readonly queryProcessingFunction: lambda.Function;
    readonly textractResultsProcessorFunction: lambda.Function;
    readonly bedrockVectorizationFunction: lambda.Function;
    readonly conversationsTable: dynamodb.Table;
    readonly conversationFunction: lambda.Function;
    readonly studyBookDlq: sqs.Queue;
    readonly studyBookFunction: lambda.Function;
    readonly usageTable: dynamodb.Table;
    readonly usageFunction: lambda.Function;
    constructor(scope: Construct, id: string, props: PdfConversationInfraStackProps);
}
