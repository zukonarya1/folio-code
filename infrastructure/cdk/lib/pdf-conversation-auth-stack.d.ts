import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { EnvironmentConfig } from './environment-config';
export interface PdfConversationAuthStackProps extends cdk.StackProps {
    readonly queryProcessingFunction: lambda.IFunction;
    readonly documentIngestionFunction: lambda.IFunction;
    readonly processingBucket: s3.IBucket;
    readonly metadataTableName: string;
    readonly conversationFunction: lambda.IFunction;
    readonly usageFunction: lambda.IFunction;
    readonly cloudFrontDomain?: string;
    readonly customDomainName?: string;
    readonly envConfig: EnvironmentConfig;
}
export declare class PdfConversationAuthStack extends cdk.Stack {
    readonly userPool: cognito.UserPool;
    readonly userPoolClient: cognito.UserPoolClient;
    readonly api: apigateway.RestApi;
    readonly identityPool: cognito.CfnIdentityPool;
    constructor(scope: Construct, id: string, props: PdfConversationAuthStackProps);
}
