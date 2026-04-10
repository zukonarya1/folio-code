import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as iam from 'aws-cdk-lib/aws-iam';
import { EnvironmentConfig } from './environment-config';
export interface SecurityStackProps extends cdk.StackProps {
    readonly envConfig: EnvironmentConfig;
}
export declare class PdfConversationSecurityStack extends cdk.Stack {
    readonly documentIngestionRole: iam.Role;
    readonly textractProcessorRole: iam.Role;
    readonly textractResultsProcessorRole: iam.Role;
    readonly bedrockVectorizationRole: iam.Role;
    readonly queryProcessingRole: iam.Role;
    readonly textractServiceRole: iam.Role;
    readonly conversationFunctionRole: iam.Role;
    readonly usageFunctionRole: iam.Role;
    constructor(scope: Construct, id: string, props: SecurityStackProps);
}
