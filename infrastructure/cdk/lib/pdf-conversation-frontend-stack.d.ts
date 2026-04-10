import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import { Construct } from 'constructs';
import { EnvironmentConfig } from './environment-config';
export interface PdfConversationFrontendStackProps extends cdk.StackProps {
    readonly domainName?: string;
    readonly ssmEnvName?: string;
    readonly envConfig?: EnvironmentConfig;
}
export declare class PdfConversationFrontendStack extends cdk.Stack {
    readonly distribution: cloudfront.Distribution;
    readonly siteBucket: s3.Bucket;
    constructor(scope: Construct, id: string, props?: PdfConversationFrontendStackProps);
}
