import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as sns from 'aws-cdk-lib/aws-sns';
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
export declare class PdfConversationMonitoringStack extends cdk.Stack {
    readonly systemDashboard: cloudwatch.Dashboard;
    readonly alertTopic: sns.Topic;
    constructor(scope: Construct, id: string, props: PdfConversationMonitoringStackProps);
    private createLambdaMonitoring;
    private createDynamoDBMonitoring;
    private createS3Monitoring;
    private createSystemHealthMonitoring;
    private createAlarms;
    private createProdBusinessMonitoring;
}
