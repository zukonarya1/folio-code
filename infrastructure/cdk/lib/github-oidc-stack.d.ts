import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as iam from 'aws-cdk-lib/aws-iam';
export interface GitHubOidcStackProps extends cdk.StackProps {
    readonly githubOrg: string;
    readonly githubRepo: string;
}
export declare class GitHubOidcStack extends cdk.Stack {
    readonly githubActionsRole: iam.Role;
    constructor(scope: Construct, id: string, props: GitHubOidcStackProps);
}
