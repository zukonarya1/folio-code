import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as iam from 'aws-cdk-lib/aws-iam';

export interface GitHubOidcStackProps extends cdk.StackProps {
  readonly githubOrg: string;
  readonly githubRepo: string;
}

export class GitHubOidcStack extends cdk.Stack {
  public readonly githubActionsRole: iam.Role;

  constructor(scope: Construct, id: string, props: GitHubOidcStackProps) {
    super(scope, id, props);

    const { githubOrg, githubRepo } = props;

    // Create GitHub OIDC Provider
    const githubProvider = new iam.OpenIdConnectProvider(this, 'GitHubOidcProvider', {
      url: 'https://token.actions.githubusercontent.com',
      clientIds: ['sts.amazonaws.com'],
      thumbprints: ['6938fd4d98bab03faadb97b34396831e3780aea1'], // GitHub's thumbprint
    });

    // Create IAM Role for GitHub Actions
    this.githubActionsRole = new iam.Role(this, 'GitHubActionsRole', {
      roleName: 'GHA-DeploymentRole',
      assumedBy: new iam.WebIdentityPrincipal(githubProvider.openIdConnectProviderArn, {
        StringEquals: {
          'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
        },
        StringLike: {
          'token.actions.githubusercontent.com:sub': [
            `repo:${githubOrg}/${githubRepo}:ref:refs/heads/main`,
            `repo:${githubOrg}/${githubRepo}:ref:refs/heads/develop`,
            `repo:${githubOrg}/${githubRepo}:ref:refs/heads/staging`,
            `repo:${githubOrg}/${githubRepo}:environment:development`,
            `repo:${githubOrg}/${githubRepo}:environment:production`,
            `repo:${githubOrg}/${githubRepo}:pull_request`,
          ],
        },
      }),
      description: 'Role used by GitHub Actions for CDK deployments',
      maxSessionDuration: cdk.Duration.hours(1),
    });

    // Grant CDK deployment permissions
    this.githubActionsRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName('PowerUserAccess')
    );

    // Add specific IAM permissions for CDK bootstrap
    this.githubActionsRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'iam:CreateRole',
          'iam:DeleteRole',
          'iam:AttachRolePolicy',
          'iam:DetachRolePolicy',
          'iam:PutRolePolicy',
          'iam:DeleteRolePolicy',
          'iam:GetRole',
          'iam:GetRolePolicy',
          'iam:PassRole',
          'iam:TagRole',
          'iam:UntagRole',
        ],
        resources: [
          `arn:aws:iam::${this.account}:role/cdk-*`,
          `arn:aws:iam::${this.account}:role/*-Lambda*`,
          `arn:aws:iam::${this.account}:role/*Function*`,
        ],
      })
    );

    // CloudFormation permissions
    this.githubActionsRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'cloudformation:*',
        ],
        resources: ['*'],
      })
    );

    // S3 permissions for CDK assets
    this.githubActionsRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          's3:*',
        ],
        resources: [
          `arn:aws:s3:::cdk-*`,
          `arn:aws:s3:::cdk-*/*`,
        ],
      })
    );

    // SSM permissions for CDK bootstrap
    this.githubActionsRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'ssm:GetParameter',
          'ssm:PutParameter',
        ],
        resources: [
          `arn:aws:ssm:${this.region}:${this.account}:parameter/cdk-bootstrap/*`,
        ],
      })
    );

    // ECR permissions for CDK assets
    this.githubActionsRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'ecr:*',
        ],
        resources: [
          `arn:aws:ecr:${this.region}:${this.account}:repository/cdk-*`,
        ],
      })
    );

    // Outputs
    new cdk.CfnOutput(this, 'GitHubActionsRoleArn', {
      value: this.githubActionsRole.roleArn,
      description: 'ARN of the GitHub Actions deployment role',
      exportName: 'github-actions-role-arn',
    });

    new cdk.CfnOutput(this, 'OIDCProviderArn', {
      value: githubProvider.openIdConnectProviderArn,
      description: 'ARN of the GitHub OIDC provider',
      exportName: 'github-oidc-provider-arn',
    });
  }
}