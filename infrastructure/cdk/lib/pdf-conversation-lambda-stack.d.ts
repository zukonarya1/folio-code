import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as iam from 'aws-cdk-lib/aws-iam';
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
export declare class PdfConversationLambdaStack extends cdk.Stack {
    readonly documentIngestionFunction: lambda.Function;
    readonly textractProcessorFunction: lambda.Function;
    readonly textractResultsProcessorFunction: lambda.Function;
    readonly bedrockVectorizationFunction: lambda.Function;
    readonly queryProcessingFunction: lambda.Function;
    constructor(scope: Construct, id: string, props: PdfConversationLambdaStackProps);
}
