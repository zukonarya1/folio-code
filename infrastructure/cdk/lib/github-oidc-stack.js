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
exports.GitHubOidcStack = void 0;
const cdk = __importStar(require("aws-cdk-lib"));
const iam = __importStar(require("aws-cdk-lib/aws-iam"));
class GitHubOidcStack extends cdk.Stack {
    githubActionsRole;
    constructor(scope, id, props) {
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
        this.githubActionsRole.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('PowerUserAccess'));
        // Add specific IAM permissions for CDK bootstrap
        this.githubActionsRole.addToPolicy(new iam.PolicyStatement({
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
        }));
        // CloudFormation permissions
        this.githubActionsRole.addToPolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: [
                'cloudformation:*',
            ],
            resources: ['*'],
        }));
        // S3 permissions for CDK assets
        this.githubActionsRole.addToPolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: [
                's3:*',
            ],
            resources: [
                `arn:aws:s3:::cdk-*`,
                `arn:aws:s3:::cdk-*/*`,
            ],
        }));
        // SSM permissions for CDK bootstrap
        this.githubActionsRole.addToPolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: [
                'ssm:GetParameter',
                'ssm:PutParameter',
            ],
            resources: [
                `arn:aws:ssm:${this.region}:${this.account}:parameter/cdk-bootstrap/*`,
            ],
        }));
        // ECR permissions for CDK assets
        this.githubActionsRole.addToPolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: [
                'ecr:*',
            ],
            resources: [
                `arn:aws:ecr:${this.region}:${this.account}:repository/cdk-*`,
            ],
        }));
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
exports.GitHubOidcStack = GitHubOidcStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2l0aHViLW9pZGMtc3RhY2suanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJnaXRodWItb2lkYy1zdGFjay50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBLGlEQUFtQztBQUVuQyx5REFBMkM7QUFPM0MsTUFBYSxlQUFnQixTQUFRLEdBQUcsQ0FBQyxLQUFLO0lBQzVCLGlCQUFpQixDQUFXO0lBRTVDLFlBQVksS0FBZ0IsRUFBRSxFQUFVLEVBQUUsS0FBMkI7UUFDbkUsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFFeEIsTUFBTSxFQUFFLFNBQVMsRUFBRSxVQUFVLEVBQUUsR0FBRyxLQUFLLENBQUM7UUFFeEMsOEJBQThCO1FBQzlCLE1BQU0sY0FBYyxHQUFHLElBQUksR0FBRyxDQUFDLHFCQUFxQixDQUFDLElBQUksRUFBRSxvQkFBb0IsRUFBRTtZQUMvRSxHQUFHLEVBQUUsNkNBQTZDO1lBQ2xELFNBQVMsRUFBRSxDQUFDLG1CQUFtQixDQUFDO1lBQ2hDLFdBQVcsRUFBRSxDQUFDLDBDQUEwQyxDQUFDLEVBQUUsc0JBQXNCO1NBQ2xGLENBQUMsQ0FBQztRQUVILHFDQUFxQztRQUNyQyxJQUFJLENBQUMsaUJBQWlCLEdBQUcsSUFBSSxHQUFHLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSxtQkFBbUIsRUFBRTtZQUMvRCxRQUFRLEVBQUUsb0JBQW9CO1lBQzlCLFNBQVMsRUFBRSxJQUFJLEdBQUcsQ0FBQyxvQkFBb0IsQ0FBQyxjQUFjLENBQUMsd0JBQXdCLEVBQUU7Z0JBQy9FLFlBQVksRUFBRTtvQkFDWix5Q0FBeUMsRUFBRSxtQkFBbUI7aUJBQy9EO2dCQUNELFVBQVUsRUFBRTtvQkFDVix5Q0FBeUMsRUFBRTt3QkFDekMsUUFBUSxTQUFTLElBQUksVUFBVSxzQkFBc0I7d0JBQ3JELFFBQVEsU0FBUyxJQUFJLFVBQVUseUJBQXlCO3dCQUN4RCxRQUFR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T0FBTztZQUNyQyxXQUFXLEVBQUUsMkNBQTJDO1lBQ3hELFVBQVUsRUFBRSx5QkFBeUI7U0FDdEMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxpQkFBaUIsRUFBRTtZQUN6QyxLQUFLLEVBQUUsY0FBYyxDQUFDLHdCQUF3QjtZQUM5QyxXQUFXLEVBQUUsaUNBQWlDO1lBQzlDLFVBQVUsRUFBRSwwQkFBMEI7U0FDdkMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztDQUNGO0FBcElELDBDQW9JQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIGNkayBmcm9tICdhd3MtY2RrLWxpYic7XHJcbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gJ2NvbnN0cnVjdHMnO1xyXG5pbXBvcnQgKiBhcyBpYW0gZnJvbSAnYXdzLWNkay1saWIvYXdzLWlhbSc7XHJcblxyXG5leHBvcnQgaW50ZXJmYWNlIEdpdEh1Yk9pZGNTdGFja1Byb3BzIGV4dGVuZHMgY2RrLlN0YWNrUHJvcHMge1xyXG4gIHJlYWRvbmx5IGdpdGh1Yk9yZzogc3RyaW5nO1xyXG4gIHJlYWRvbmx5IGdpdGh1YlJlcG86IHN0cmluZztcclxufVxyXG5cclxuZXhwb3J0IGNsYXNzIEdpdEh1Yk9pZGNTdGFjayBleHRlbmRzIGNkay5TdGFjayB7XHJcbiAgcHVibGljIHJlYWRvbmx5IGdpdGh1YkFjdGlvbnNSb2xlOiBpYW0uUm9sZTtcclxuXHJcbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM6IEdpdEh1Yk9pZGNTdGFja1Byb3BzKSB7XHJcbiAgICBzdXBlcihzY29wZSwgaWQsIHByb3BzKTtcclxuXHJcbiAgICBjb25zdCB7IGdpdGh1Yk9yZywgZ2l0aHViUmVwbyB9ID0gcHJvcHM7XHJcblxyXG4gICAgLy8gQ3JlYXRlIEdpdEh1YiBPSURDIFByb3ZpZGVyXHJcbiAgICBjb25zdCBnaXRodWJQcm92aWRlciA9IG5ldyBpYW0uT3BlbklkQ29ubmVjdFByb3ZpZGVyKHRoaXMsICdHaXRIdWJPaWRjUHJvdmlkZXInLCB7XHJcbiAgICAgIHVybDogJ2h0dHBzOi8vdG9rZW4uYWN0aW9ucy5naXRodWJ1c2VyY29udGVudC5jb20nLFxyXG4gICAgICBjbGllbnRJZHM6IFsnc3RzLmFtYXpvbmF3cy5jb20nXSxcclxuICAgICAgdGh1bWJwcmludHM6IFsnNjkzOGZkNGQ5OGJhYjAzZmFhZGI5N2IzNDM5NjgzMWUzNzgwYWVhMSddLCAvLyBHaXRIdWIncyB0aHVtYnByaW50XHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyBDcmVhdGUgSUFNIFJvbGUgZm9yIEdpdEh1YiBBY3Rpb25zXHJcbiAgICB0aGlzLmdpdGh1YkFjdGlvbnNSb2xlID0gbmV3IGlhbS5Sb2xlKHRoaXMsICdHaXRIdWJBY3Rpb25zUm9sZScsIHtcclxuICAgICAgcm9sZU5hbWU6ICdHSEEtRGVwbG95bWVudFJvbGUnLFxyXG4gICAgICBhc3N1bWVkQnk6IG5ldyBpYW0uV2ViSWRlbnRpdHlQcmluY2lwYWwoZ2l0aHViUHJvdmlkZXIub3BlbklkQ29ubmVjdFByb3ZpZGVyQXJuLCB7XHJcbiAgICAgICAgU3RyaW5nRXF1YWxzOiB7XHJcbiAgICAgICAgICAndG9rZW4uYWN0aW9ucy5naXRodWJ1c2VyY29udGVudC5jb206YXVkJzogJ3N0cy5hbWF6b25hd3MuY29tJyxcclxuICAgICAgICB9LFxyXG4gICAgICAgIFN0cmluZ0xpa2U6IHtcclxuICAgICAgICAgICd0b2tlbi5hY3Rpb25zLmdpdGh1YnVzZXJjb250ZW50LmNvbTpzdWInOiBbXHJcbiAgICAgICAgICAgIGByZXBvOiR7Z2l0aHViT3JnfS8ke2dpdGh1YlJlcG99OnJlZjpyZWZzL2hlYWRzL21haW5gLFxyXG4gICAgICAgICAgICBgcmVwbzoke2dpdGh1Yk9yZ30vJHtnaXRodWJSZXBvfTpyZWY6cmVmcy9oZWFkcy9kZXZlbG9wYCxcclxuICAgICAgICAgICAgYHJlcG86JHtnaXRodWJPcmd9LyR7Z2l0aHViUmVwb306cmVmOnJlZnMvaGVhZHMvc3RhZ2luZ2AsXHJcbiAgICAgICAgICAgIGByZXBvOiR7Z2l0aHViT3JnfS8ke2dpdGh1YlJlcG99OmVudmlyb25tZW50OmRldmVsb3BtZW50YCxcclxuICAgICAgICAgICAgYHJlcG86JHtnaXRodWJPcmd9LyR7Z2l0aHViUmVwb306ZW52aXJvbm1lbnQ6cHJvZHVjdGlvbmAsXHJcbiAgICAgICAgICAgIGByZXBvOiR7Z2l0aHViT3JnfS8ke2dpdGh1YlJlcG99OnB1bGxfcmVxdWVzdGAsXHJcbiAgICAgICAgICBdLFxyXG4gICAgICAgIH0sXHJcbiAgICAgIH0pLFxyXG4gICAgICBkZXNjcmlwdGlvbjogJ1JvbGUgdXNlZCBieSBHaXRIdWIgQWN0aW9ucyBmb3IgQ0RLIGRlcGxveW1lbnRzJyxcclxuICAgICAgbWF4U2Vzc2lvbkR1cmF0aW9uOiBjZGsuRHVyYXRpb24uaG91cnMoMSksXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyBHcmFudCBDREsgZGVwbG95bWVudCBwZXJtaXNzaW9uc1xyXG4gICAgdGhpcy5naXRodWJBY3Rpb25zUm9sZS5hZGRNYW5hZ2VkUG9saWN5KFxyXG4gICAgICBpYW0uTWFuYWdlZFBvbGljeS5mcm9tQXdzTWFuYWdlZFBvbGljeU5hbWUoJ1Bvd2VyVXNlckFjY2VzcycpXHJcbiAgICApO1xyXG5cclxuICAgIC8vIEFkZCBzcGVjaWZpYyBJQU0gcGVybWlzc2lvbnMgZm9yIENESyBib290c3RyYXBcclxuICAgIHRoaXMuZ2l0aHViQWN0aW9uc1JvbGUuYWRkVG9Qb2xpY3koXHJcbiAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcclxuICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXHJcbiAgICAgICAgYWN0aW9uczogW1xyXG4gICAgICAgICAgJ2lhbTpDcmVhdGVSb2xlJyxcclxuICAgICAgICAgICdpYW06RGVsZXRlUm9sZScsXHJcbiAgICAgICAgICAnaWFtOkF0dGFjaFJvbGVQb2xpY3knLFxyXG4gICAgICAgICAgJ2lhbTpEZXRhY2hSb2xlUG9saWN5JyxcclxuICAgICAgICAgICdpYW06UHV0Um9sZVBvbGljeScsXHJcbiAgICAgICAgICAnaWFtOkRlbGV0ZVJvbGVQb2xpY3knLFxyXG4gICAgICAgICAgJ2lhbTpHZXRSb2xlJyxcclxuICAgICAgICAgICdpYW06R2V0Um9sZVBvbGljeScsXHJcbiAgICAgICAgICAnaWFtOlBhc3NSb2xlJyxcclxuICAgICAgICAgICdpYW06VGFnUm9sZScsXHJcbiAgICAgICAgICAnaWFtOlVudGFnUm9sZScsXHJcbiAgICAgICAgXSxcclxuICAgICAgICByZXNvdXJjZXM6IFtcclxuICAgICAgICAgIGBhcm46YXdzOmlhbTo6JHt0aGlzLmFjY291bnR9OnJvbGUvY2RrLSpgLFxyXG4gICAgICAgICAgYGFybjphd3M6aWFtOjoke3RoaXMuYWNjb3VudH06cm9sZS8qLUxhbWJkYSpgLFxyXG4gICAgICAgICAgYGFybjphd3M6aWFtOjoke3RoaXMuYWNjb3VudH06cm9sZS8qRnVuY3Rpb24qYCxcclxuICAgICAgICBdLFxyXG4gICAgICB9KVxyXG4gICAgKTtcclxuXHJcbiAgICAvLyBDbG91ZEZvcm1hdGlvbiBwZXJtaXNzaW9uc1xyXG4gICAgdGhpcy5naXRodWJBY3Rpb25zUm9sZS5hZGRUb1BvbGljeShcclxuICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xyXG4gICAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcclxuICAgICAgICBhY3Rpb25zOiBbXHJcbiAgICAgICAgICAnY2xvdWRmb3JtYXRpb246KicsXHJcbiAgICAgICAgXSxcclxuICAgICAgICByZXNvdXJjZXM6IFsnKiddLFxyXG4gICAgICB9KVxyXG4gICAgKTtcclxuXHJcbiAgICAvLyBTMyBwZXJtaXNzaW9ucyBmb3IgQ0RLIGFzc2V0c1xyXG4gICAgdGhpcy5naXRodWJBY3Rpb25zUm9sZS5hZGRUb1BvbGljeShcclxuICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xyXG4gICAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcclxuICAgICAgICBhY3Rpb25zOiBbXHJcbiAgICAgICAgICAnczM6KicsXHJcbiAgICAgICAgXSxcclxuICAgICAgICByZXNvdXJjZXM6IFtcclxuICAgICAgICAgIGBhcm46YXdzOnMzOjo6Y2RrLSpgLFxyXG4gICAgICAgICAgYGFybjphd3M6czM6OjpjZGstKi8qYCxcclxuICAgICAgICBdLFxyXG4gICAgICB9KVxyXG4gICAgKTtcclxuXHJcbiAgICAvLyBTU00gcGVybWlzc2lvbnMgZm9yIENESyBib290c3RyYXBcclxuICAgIHRoaXMuZ2l0aHViQWN0aW9uc1JvbGUuYWRkVG9Qb2xpY3koXHJcbiAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcclxuICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXHJcbiAgICAgICAgYWN0aW9uczogW1xyXG4gICAgICAgICAgJ3NzbTpHZXRQYXJhbWV0ZXInLFxyXG4gICAgICAgICAgJ3NzbTpQdXRQYXJhbWV0ZXInLFxyXG4gICAgICAgIF0sXHJcbiAgICAgICAgcmVzb3VyY2VzOiBbXHJcbiAgICAgICAgICBgYXJuOmF3czpzc206JHt0aGlzLnJlZ2lvbn06JHt0aGlzLmFjY291bnR9OnBhcmFtZXRlci9jZGstYm9vdHN0cmFwLypgLFxyXG4gICAgICAgIF0sXHJcbiAgICAgIH0pXHJcbiAgICApO1xyXG5cclxuICAgIC8vIEVDUiBwZXJtaXNzaW9ucyBmb3IgQ0RLIGFzc2V0c1xyXG4gICAgdGhpcy5naXRodWJBY3Rpb25zUm9sZS5hZGRUb1BvbGljeShcclxuICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xyXG4gICAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcclxuICAgICAgICBhY3Rpb25zOiBbXHJcbiAgICAgICAgICAnZWNyOionLFxyXG4gICAgICAgIF0sXHJcbiAgICAgICAgcmVzb3VyY2VzOiBbXHJcbiAgICAgICAgICBgYXJuOmF3czplY3I6JHt0aGlzLnJlZ2lvbn06JHt0aGlzLmFjY291bnR9OnJlcG9zaXRvcnkvY2RrLSpgLFxyXG4gICAgICAgIF0sXHJcbiAgICAgIH0pXHJcbiAgICApO1xyXG5cclxuICAgIC8vIE91dHB1dHNcclxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdHaXRIdWJBY3Rpb25zUm9sZUFybicsIHtcclxuICAgICAgdmFsdWU6IHRoaXMuZ2l0aHViQWN0aW9uc1JvbGUucm9sZUFybixcclxuICAgICAgZGVzY3JpcHRpb246ICdBUk4gb2YgdGhlIEdpdEh1YiBBY3Rpb25zIGRlcGxveW1lbnQgcm9sZScsXHJcbiAgICAgIGV4cG9ydE5hbWU6ICdnaXRodWItYWN0aW9ucy1yb2xlLWFybicsXHJcbiAgICB9KTtcclxuXHJcbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnT0lEQ1Byb3ZpZGVyQXJuJywge1xyXG4gICAgICB2YWx1ZTogZ2l0aHViUHJvdmlkZXIub3BlbklkQ29ubmVjdFByb3ZpZGVyQXJuLFxyXG4gICAgICBkZXNjcmlwdGlvbjogJ0FSTiBvZiB0aGUgR2l0SHViIE9JREMgcHJvdmlkZXInLFxyXG4gICAgICBleHBvcnROYW1lOiAnZ2l0aHViLW9pZGMtcHJvdmlkZXItYXJuJyxcclxuICAgIH0pO1xyXG4gIH1cclxufSJdfQ==