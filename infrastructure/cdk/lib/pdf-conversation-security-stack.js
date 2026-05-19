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
exports.PdfConversationSecurityStack = void 0;
const cdk = __importStar(require("aws-cdk-lib"));
const iam = __importStar(require("aws-cdk-lib/aws-iam"));
class PdfConversationSecurityStack extends cdk.Stack {
    documentIngestionRole;
    textractProcessorRole;
    textractResultsProcessorRole;
    bedrockVectorizationRole;
    queryProcessingRole;
    textractServiceRole;
    conversationFunctionRole;
    usageFunctionRole;
    constructor(scope, id, props) {
        super(scope, id, props);
        const { region } = props.envConfig;
        // this.account is concrete (not a CloudFormation token) because app.ts always sets env.account
        // from CDK_DEFAULT_ACCOUNT. S3 bucket name ARNs embed accountId as a physical string component —
        // they cannot tolerate a token value.
        const accountId = this.account;
        const p = props.envConfig.prefix;
        // Textract Service Role (used by Textract to publish SNS notifications)
        this.textractServiceRole = new iam.Role(this, 'TextractServiceRole', {
            roleName: `${p}TextractServiceRole`,
            assumedBy: new iam.ServicePrincipal('textract.amazonaws.com'),
            inlinePolicies: {
                TextractSNSPolicy: new iam.PolicyDocument({
                    statements: [
                        new iam.PolicyStatement({
                            effect: iam.Effect.ALLOW,
                            actions: ['sns:Publish'],
                            resources: [`arn:aws:sns:${region}:${accountId}:${p}textract-completion`],
                        }),
                    ],
                }),
            },
        });
        // Document Ingestion Function Role
        this.documentIngestionRole = new iam.Role(this, 'DocumentIngestionRole', {
            roleName: `${p}DocumentIngestionFunction-role`,
            assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
            managedPolicies: [
                iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
            ],
            inlinePolicies: {
                DocumentIngestionPolicy: new iam.PolicyDocument({
                    statements: [
                        new iam.PolicyStatement({
                            effect: iam.Effect.ALLOW,
                            actions: [
                                's3:GetObject',
                                's3:PutObject',
                            ],
                            resources: [`arn:aws:s3:::${p}pdf-conversation-processing-${accountId}/*`],
                        }),
                        new iam.PolicyStatement({
                            effect: iam.Effect.ALLOW,
                            actions: [
                                's3:PutObject',
                            ],
                            resources: [`arn:aws:s3:::${p}pdf-conversation-digests-${accountId}/*`],
                        }),
                        new iam.PolicyStatement({
                            effect: iam.Effect.ALLOW,
                            actions: [
                                'dynamodb:PutItem',
                                'dynamodb:GetItem',
                                'dynamodb:UpdateItem',
                                'dynamodb:Query',
                                'dynamodb:Scan',
                            ],
                            resources: [`arn:aws:dynamodb:${region}:${accountId}:table/${p}pdf-conversation-metadata*`],
                        }),
                        new iam.PolicyStatement({
                            effect: iam.Effect.ALLOW,
                            actions: ['sns:Publish'],
                            resources: [`arn:aws:sns:${region}:${accountId}:${p}textract-completion`],
                        }),
                        new iam.PolicyStatement({
                            effect: iam.Effect.ALLOW,
                            actions: [
                                'textract:StartDocumentTextDetection',
                            ],
                            resources: ['*'],
                        }),
                        new iam.PolicyStatement({
                            effect: iam.Effect.ALLOW,
                            actions: ['iam:PassRole'],
                            resources: [`arn:aws:iam::${accountId}:role/${p}TextractServiceRole`],
                        }),
                        new iam.PolicyStatement({
                            effect: iam.Effect.ALLOW,
                            actions: ['dynamodb:GetItem', 'dynamodb:UpdateItem'],
                            resources: [`arn:aws:dynamodb:${region}:${accountId}:table/${p}folio-usage`],
                        }),
                        new iam.PolicyStatement({
                            effect: iam.Effect.ALLOW,
                            actions: ['cognito-idp:ListUsers'],
                            resources: [`arn:aws:cognito-idp:${region}:${accountId}:userpool/${props.envConfig.userPoolId}`],
                        }),
                    ],
                }),
            },
        });
        // Textract Processor Function Role
        this.textractProcessorRole = new iam.Role(this, 'TextractProcessorRole', {
            roleName: `${p}TextractProcessorFunction-role`,
            assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
            managedPolicies: [
                iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
            ],
            inlinePolicies: {
                TextractProcessorPolicy: new iam.PolicyDocument({
                    statements: [
                        new iam.PolicyStatement({
                            effect: iam.Effect.ALLOW,
                            actions: [
                                's3:GetObject',
                                's3:PutObject',
                                's3:DeleteObject',
                            ],
                            resources: [
                                `arn:aws:s3:::${p}pdf-conversation-processing-${accountId}/*`,
                                `arn:aws:s3:::${p}pdf-conversation-digests-${accountId}/*`,
                            ],
                        }),
                        new iam.PolicyStatement({
                            effect: iam.Effect.ALLOW,
                            actions: [
                                'dynamodb:PutItem',
                                'dynamodb:GetItem',
                                'dynamodb:UpdateItem',
                                'dynamodb:Query',
                                'dynamodb:Scan',
                            ],
                            resources: [`arn:aws:dynamodb:${region}:${accountId}:table/${p}pdf-conversation-metadata*`],
                        }),
                        new iam.PolicyStatement({
                            effect: iam.Effect.ALLOW,
                            actions: [
                                'textract:StartDocumentTextDetection',
                                'textract:GetDocumentTextDetection',
                                'textract:StartDocumentAnalysis',
                                'textract:GetDocumentAnalysis',
                            ],
                            resources: ['*'],
                        }),
                    ],
                }),
            },
        });
        // Textract Results Processor Function Role
        this.textractResultsProcessorRole = new iam.Role(this, 'TextractResultsProcessorRole', {
            roleName: `${p}TextractResultsProcessorFunction-role`,
            assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
            managedPolicies: [
                iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
            ],
            inlinePolicies: {
                TextractResultsProcessorPolicy: new iam.PolicyDocument({
                    statements: [
                        new iam.PolicyStatement({
                            effect: iam.Effect.ALLOW,
                            actions: [
                                's3:GetObject',
                                's3:PutObject',
                            ],
                            resources: [`arn:aws:s3:::${p}pdf-conversation-digests-${accountId}/*`],
                        }),
                        new iam.PolicyStatement({
                            effect: iam.Effect.ALLOW,
                            actions: [
                                'dynamodb:PutItem',
                                'dynamodb:GetItem',
                                'dynamodb:UpdateItem',
                                'dynamodb:Query',
                                'dynamodb:Scan',
                            ],
                            resources: [`arn:aws:dynamodb:${region}:${accountId}:table/${p}pdf-conversation-metadata*`],
                        }),
                        new iam.PolicyStatement({
                            effect: iam.Effect.ALLOW,
                            actions: [
                                'textract:GetDocumentAnalysis',
                                'textract:GetDocumentTextDetection',
                            ],
                            resources: ['*'],
                        }),
                    ],
                }),
            },
        });
        // Bedrock Vectorization Function Role
        this.bedrockVectorizationRole = new iam.Role(this, 'BedrockVectorizationRole', {
            roleName: `${p}BedrockToS3Vectorization-Lambda`,
            assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
            managedPolicies: [
                iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
            ],
            inlinePolicies: {
                BedrockVectorizationPolicy: new iam.PolicyDocument({
                    statements: [
                        new iam.PolicyStatement({
                            effect: iam.Effect.ALLOW,
                            actions: [
                                's3:GetObject',
                                's3:PutObject',
                            ],
                            resources: [
                                `arn:aws:s3:::${p}pdf-conversation-digests-${accountId}/*`,
                                `arn:aws:s3:::${p}pdf-conversation-vectors-${accountId}/*`,
                                `arn:aws:s3:::${p}pdf-conversation-vectors-json-${accountId}/*`,
                            ],
                        }),
                        new iam.PolicyStatement({
                            effect: iam.Effect.ALLOW,
                            actions: [
                                's3:ListBucket',
                            ],
                            resources: [
                                `arn:aws:s3:::${p}pdf-conversation-vectors-${accountId}`,
                                `arn:aws:s3:::${p}pdf-conversation-vectors-json-${accountId}`,
                            ],
                        }),
                        new iam.PolicyStatement({
                            effect: iam.Effect.ALLOW,
                            actions: [
                                'bedrock:InvokeModel',
                            ],
                            resources: [`arn:aws:bedrock:${region}::foundation-model/cohere.embed-multilingual-v3`],
                        }),
                        new iam.PolicyStatement({
                            effect: iam.Effect.ALLOW,
                            actions: [
                                's3vectors:PutVectors',
                                's3vectors:GetVectors',
                                's3vectors:DeleteVectors',
                                's3vectors:ListVectors',
                            ],
                            resources: [`arn:aws:s3vectors:${region}:${accountId}:bucket/${p}pdf-conversation-vectors-${accountId}/index/*`],
                        }),
                        new iam.PolicyStatement({
                            effect: iam.Effect.ALLOW,
                            actions: [
                                'dynamodb:UpdateItem',
                                'dynamodb:GetItem',
                            ],
                            resources: [`arn:aws:dynamodb:${region}:${accountId}:table/${p}pdf-conversation-metadata*`],
                        }),
                        new iam.PolicyStatement({
                            effect: iam.Effect.ALLOW,
                            actions: ['sns:Publish'],
                            resources: [`arn:aws:sns:${region}:${accountId}:${p}vectorization-complete`],
                        }),
                    ],
                }),
            },
        });
        // Query Processing Function Role
        this.queryProcessingRole = new iam.Role(this, 'QueryProcessingRole', {
            roleName: `${p}QueryProcessingFunction-role`,
            assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
            managedPolicies: [
                iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
            ],
            inlinePolicies: {
                QueryProcessingPolicy: new iam.PolicyDocument({
                    statements: [
                        new iam.PolicyStatement({
                            effect: iam.Effect.ALLOW,
                            actions: [
                                'dynamodb:PutItem',
                                'dynamodb:GetItem',
                                'dynamodb:UpdateItem',
                                'dynamodb:Query',
                                'dynamodb:Scan',
                            ],
                            resources: [
                                `arn:aws:dynamodb:${region}:${accountId}:table/${p}pdf-conversation-metadata*`,
                                `arn:aws:dynamodb:${region}:${accountId}:table/${p}pdf-conversation-query-logs*`,
                            ],
                        }),
                        new iam.PolicyStatement({
                            effect: iam.Effect.ALLOW,
                            actions: [
                                'bedrock:InvokeModel',
                            ],
                            resources: [
                                `arn:aws:bedrock:${region}::foundation-model/cohere.embed-multilingual-v3`,
                                `arn:aws:bedrock:${region}:${accountId}:inference-profile/us.anthropic.claude-haiku-4-5-20251001-v1:0`,
                            ],
                        }),
                        new iam.PolicyStatement({
                            effect: iam.Effect.ALLOW,
                            actions: [
                                'bedrock:InvokeModel',
                            ],
                            resources: [
                                'arn:aws:bedrock:us-east-1::foundation-model/anthropic.claude-haiku-4-5-20251001-v1:0',
                                'arn:aws:bedrock:us-east-2::foundation-model/anthropic.claude-haiku-4-5-20251001-v1:0',
                                'arn:aws:bedrock:us-west-2::foundation-model/anthropic.claude-haiku-4-5-20251001-v1:0',
                            ],
                            conditions: {
                                StringEquals: {
                                    'bedrock:InferenceProfileArn': `arn:aws:bedrock:${region}:${accountId}:inference-profile/us.anthropic.claude-haiku-4-5-20251001-v1:0`,
                                },
                            },
                        }),
                        new iam.PolicyStatement({
                            effect: iam.Effect.ALLOW,
                            actions: [
                                's3vectors:GetVectors',
                                's3vectors:ListVectors',
                                's3vectors:QueryVectors',
                            ],
                            resources: [`arn:aws:s3vectors:${region}:${accountId}:bucket/${p}pdf-conversation-vectors-${accountId}/index/*`],
                        }),
                    ],
                }),
            },
        });
        // Conversation Function Role
        this.conversationFunctionRole = new iam.Role(this, 'ConversationFunctionRole', {
            roleName: `${p}ConversationFunction-role`,
            assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
            managedPolicies: [
                iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
            ],
            inlinePolicies: {
                ConversationFunctionPolicy: new iam.PolicyDocument({
                    statements: [
                        new iam.PolicyStatement({
                            effect: iam.Effect.ALLOW,
                            actions: [
                                'dynamodb:GetItem',
                                'dynamodb:PutItem',
                                'dynamodb:UpdateItem',
                                'dynamodb:Query',
                            ],
                            resources: [
                                `arn:aws:dynamodb:${region}:${accountId}:table/${p}pdf-conversation-conversations`,
                                `arn:aws:dynamodb:${region}:${accountId}:table/${p}pdf-conversation-conversations/index/*`,
                                `arn:aws:dynamodb:${region}:${accountId}:table/${p}pdf-conversation-metadata`,
                            ],
                        }),
                        new iam.PolicyStatement({
                            effect: iam.Effect.ALLOW,
                            actions: [
                                'bedrock:InvokeModel',
                            ],
                            resources: [
                                `arn:aws:bedrock:${region}::foundation-model/cohere.embed-multilingual-v3`,
                                `arn:aws:bedrock:${region}:${accountId}:inference-profile/us.anthropic.claude-haiku-4-5-20251001-v1:0`,
                            ],
                        }),
                        new iam.PolicyStatement({
                            effect: iam.Effect.ALLOW,
                            actions: [
                                'bedrock:InvokeModel',
                            ],
                            resources: [
                                'arn:aws:bedrock:us-east-1::foundation-model/anthropic.claude-haiku-4-5-20251001-v1:0',
                                'arn:aws:bedrock:us-east-2::foundation-model/anthropic.claude-haiku-4-5-20251001-v1:0',
                                'arn:aws:bedrock:us-west-2::foundation-model/anthropic.claude-haiku-4-5-20251001-v1:0',
                            ],
                            conditions: {
                                StringEquals: {
                                    'bedrock:InferenceProfileArn': `arn:aws:bedrock:${region}:${accountId}:inference-profile/us.anthropic.claude-haiku-4-5-20251001-v1:0`,
                                },
                            },
                        }),
                        new iam.PolicyStatement({
                            effect: iam.Effect.ALLOW,
                            actions: [
                                's3vectors:GetVectors',
                                's3vectors:QueryVectors',
                            ],
                            resources: [`arn:aws:s3vectors:${region}:${accountId}:bucket/${p}pdf-conversation-vectors-${accountId}/index/*`],
                        }),
                        new iam.PolicyStatement({
                            effect: iam.Effect.ALLOW,
                            actions: ['dynamodb:GetItem', 'dynamodb:UpdateItem'],
                            resources: [`arn:aws:dynamodb:${region}:${accountId}:table/${p}folio-usage`],
                        }),
                    ],
                }),
            },
        });
        // Usage Function Role
        this.usageFunctionRole = new iam.Role(this, 'UsageFunctionRole', {
            roleName: `${p}UsageFunction-role`,
            assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
            managedPolicies: [
                iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
            ],
            inlinePolicies: {
                UsageFunctionPolicy: new iam.PolicyDocument({
                    statements: [
                        new iam.PolicyStatement({
                            effect: iam.Effect.ALLOW,
                            actions: ['dynamodb:GetItem'],
                            resources: [`arn:aws:dynamodb:${region}:${accountId}:table/${p}folio-usage`],
                        }),
                    ],
                }),
            },
        });
        // Output role ARNs for other stacks
        new cdk.CfnOutput(this, 'DocumentIngestionRoleArn', {
            value: this.documentIngestionRole.roleArn,
            exportName: `${p}pdf-conversation-document-ingestion-role-arn`,
        });
        new cdk.CfnOutput(this, 'TextractProcessorRoleArn', {
            value: this.textractProcessorRole.roleArn,
            exportName: `${p}pdf-conversation-textract-processor-role-arn`,
        });
        new cdk.CfnOutput(this, 'TextractResultsProcessorRoleArn', {
            value: this.textractResultsProcessorRole.roleArn,
            exportName: `${p}pdf-conversation-textract-results-processor-role-arn`,
        });
        new cdk.CfnOutput(this, 'BedrockVectorizationRoleArn', {
            value: this.bedrockVectorizationRole.roleArn,
            exportName: `${p}pdf-conversation-bedrock-vectorization-role-arn`,
        });
        new cdk.CfnOutput(this, 'QueryProcessingRoleArn', {
            value: this.queryProcessingRole.roleArn,
            exportName: `${p}pdf-conversation-query-processing-role-arn`,
        });
        new cdk.CfnOutput(this, 'TextractServiceRoleArn', {
            value: this.textractServiceRole.roleArn,
            exportName: `${p}pdf-conversation-textract-service-role-arn`,
        });
        new cdk.CfnOutput(this, 'ConversationFunctionRoleArn', {
            value: this.conversationFunctionRole.roleArn,
            exportName: `${p}pdf-conversation-conversation-function-role-arn`,
        });
    }
}
exports.PdfConversationSecurityStack = PdfConversationSecurityStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicGRmLWNvbnZlcnNhdGlvbi1zZWN1cml0eS1zdGFjay5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInBkZi1jb252ZXJzYXRpb24tc2VjdXJpdHktc3RhY2sudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSxpREFBbUM7QUFFbkMseURBQTJDO0FBTzNDLE1BQWEsNEJBQTZCLFNBQVEsR0FBRyxDQUFDLEtBQUs7SUFDekMscUJBQXFCLENBQVc7SUFDaEMscUJBQXFCLENBQVc7SUFDaEMsNEJBQTRCLENBQVc7SUFDdkMsd0JBQXdCLENBQVc7SUFDbkMsbUJBQW1CLENBQVc7SUFDOUIsbUJBQW1CLENBQVc7SUFDOUIsd0JBQXdCLENBQVc7SUFDbkMsaUJBQWlCLENBQVc7SUFFNUMsWUFBWSxLQUFnQixFQUFFLEVBQVUsRUFBRSxLQUF5QjtRQUNqRSxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUV4QixNQUFNLEVBQUUsTUFBTSxFQUFFLEdBQUcsS0FBSyxDQUFDLFNBQVMsQ0FBQztRQUNuQywrRkFBK0Y7UUFDL0YsaUdBQWlHO1FBQ2pHLHNDQUFzQztRQUN0QyxNQUFNLFNBQVMsR0FBRyxJQUFJLENBQUMsT0FBTyxDQUFDO1FBQy9CLE1BQU0sQ0FBQyxHQUFHLEtBQUssQ0FBQyxTQUFTLENBQUMsTUFBTSxDQUFDO1FBRWpDLHdFQUF3RTtRQUN4RSxJQUFJLENBQUMsbUJBQW1CLEdBQUcsSUFBSSxHQUFHLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSxxQkFBcUIsRUFBRTtZQUNuRSxRQUFRLEVBQUUsR0FBRyxDQUFDLHFCQUFxQjtZQUNuQyxTQUFTLEVBQUUsSUFBSSxHQUFHLENBQUMsZ0JBQWdCLENBQUMsd0JBQXdCLENBQUM7WUFDN0QsY0FBYyxFQUFFO2dCQUNkLGlCQUFpQixFQUFFLElBQUksR0FBRyxDQUFDLGNBQWMsQ0FBQztvQkFDeEMsVUFBVSxFQUFFO3dCQUNWLElBQUksR0FBRyxDQUFDLGVBQWUsQ0FBQzs0QkFDdEIsTUFBTSxFQUFFLEdBQUcsQ0FBQyxNQUFNLENBQUMsS0FBSzs0QkFDeEIsT0FBTyxFQUFFLENBQUMsYUFBYSxDQUFDOzRCQUN4QixTQUFTLEVBQUUsQ0FBQyxlQUFlLE1BQU0sSUFBSSxTQUFTLElBQUksQ0FBQyxxQkFBcUIsQ0FBQzt5QkFDMUUsQ0FBQztxQkFDSDtpQkFDRixDQUFDO2FBQ0g7U0FDRixDQUFDLENBQUM7UUFFSCxtQ0FBbUM7UUFDbkMsSUFBSSxDQUFDLHFCQUFxQixHQUFHLElBQUksR0FBRyxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUsdUJBQXVCLEVBQUU7WUFDdkUsUUFBUSxFQUFFLEdBQUcsQ0FBQyxnQ0FBZ0M7WUFDOUMsU0FBUyxFQUFFLElBQUksR0FBRyxDQUFDLGdCQUFnQixDQUFDLHNCQUFzQixDQUFDO1lBQzNELGVBQWUsRUFBRTtnQkFDZixHQUFHLENBQUMsYUFBYSxDQUFDLHdCQUF3QixDQUFDLDBDQUEwQyxDQUFDO2FBQ3ZGO1lBQ0QsY0FBYyxFQUFFO2dCQUNkLHVCQUF1QixFQUFFLElBQUksR0FBRyxDQUFDLGNBQWMsQ0FBQztvQkFDOUMsVUFBVSxFQUFFO3dCQUNWLElBQUksR0FBRyxDQUFDLGVBQWUsQ0FBQzs0QkFDdEIsTUFBTSxFQUFFLEdBQUcsQ0FBQyxNQUFNLENBQUMsS0FBSzs0QkFDeEIsT0FBTyxFQUFFO2dDQUNQLGNBQWM7Z0NBQ2QsY0FBYzs2QkFDZjs0QkFDRCxTQUFTLEVBQUUsQ0FBQyxnQkFBZ0IsQ0FBQywrQkFBK0IsU0FBUyxJQUFJLENBQUM7eUJBQzNFLENBQUM7d0JBQ0YsSUFBSSxHQUFHLENBQUMsZUFBZSxDQUFDOzRCQUN0QixNQUFNLEVBQUUsR0FBRyxDQUFDLE1BQU0sQ0FBQyxLQUFLOzRCQUN4QixPQUFPLEVBQUU7Z0NBQ1AsY0FBYzs2QkFDZjs0QkFDRCxTQUFTLEVBQUUsQ0FBQyxnQkFBZ0IsQ0FBQyw0QkFBNEIsU0FBUyxJQUFJLENBQUM7eUJBQ3hFLENBQUM7d0JBQ0YsSUFBSSxHQUFHLENBQUMsZUFBZSxDQUFDOzRCQUN0QixNQUFNLEVBQUUsR0FBRyxDQUFDLE1BQU0sQ0FBQyxLQUFLOzRCQUN4QixPQUFPLEVBQUU7Z0NBQ1Asa0JBQWtCO2dDQUNsQixrQkFBa0I7Z0NBQ2xCLHFCQUFxQjtnQ0FDckIsZ0JBQWdCO2dDQUNoQixlQUFlOzZCQUNoQjs0QkFDRCxTQUFTLEVBQUUsQ0FBQyxvQkFBb0IsTUFBTSxJQUFJLFNBQVMsVUFBVSxDQUFDLDRCQUE0QixDQUFDO3lCQUM1RixDQUFDO3dCQUNGLElBQUksR0FBRyxDQUFDLGVBQWUsQ0FBQzs0QkFDdEIsTUFBTSxFQUFFLEdBQUcsQ0FBQyxNQUFNLENBQUMsS0FBSzs0QkFDeEIsT0FBTyxFQUFFLENBQUMsYUFBYSxDQUFDOzRCQUN4QixTQUFTLEVBQUUsQ0FBQyxlQUFlLE1BQU0sSUFBSSxTQUFTLElBQUksQ0FBQyxxQkFBcUIsQ0FBQzt5QkFDMUUsQ0FBQzt3QkFDRixJQUFJLEdBQUcsQ0FBQyxlQUFlLENBQUM7NEJBQ3RCLE1BQU0sRUFBRSxHQUFHLENBQUMsTUFBTSxDQUFDLEtBQUs7NEJBQ3hCLE9BQU8sRUFBRTtnQ0FDUCxxQ0FBcUM7NkJBQ3RDOzRCQUNELFNBQVMsRUFBRSxDQUFDLEdBQUcsQ0FBQzt5QkFDakIsQ0FBQzt3QkFDRixJQUFJLEdBQUcsQ0FBQyxlQUFlLENBQUM7NEJBQ3RCLE1BQU0sRUFBRSxHQUFHLENBQUMsTUFBTSxDQUFDLEtBQUs7NEJBQ3hCLE9BQU8sRUFBRSxDQUFDLGNBQWMsQ0FBQzs0QkFDekIsU0FBUyxFQUFFLENBQUMsZ0JBQWdCLFNBQVMsU0FBUyxDQUFDLHFCQUFxQixDQUFDO3lCQUN0RSxDQUFDO3dCQUNGLElBQUksR0FBRyxDQUFDLGVBQWUsQ0FBQzs0QkFDdEIsTUFBTSxFQUFFLEdBQUcsQ0FBQyxNQUFNLENBQUMsS0FBSzs0QkFDeEIsT0FBTyxFQUFFLENBQUMsa0JBQWtCLEVBQUUscUJBQXFCLENBQUM7NEJBQ3BELFNBQVMsRUFBRSxDQUFDLG9CQUFvQixNQUFNLElBQUksU0FBUyxVQUFVLENBQUMsYUFBYSxDQUFDO3lCQUM3RSxDQUFDO3dCQUNGLElBQUksR0FBRyxDQUFDLGVBQWUsQ0FBQzs0QkFDdEIsTUFBTSxFQUFFLEdBQUcsQ0FBQyxNQUFNLENBQUMsS0FBSzs0QkFDeEIsT0FBTyxFQUFFLENBQUMsdUJBQXVCLENBQUM7NEJBQ2xDLFNBQVMsRUFBRSxDQUFDLHVCQUF1QixNQUFNLElBQUksU0FBUyxhQUFhLEtBQUssQ0FBQyxTQUFTLENBQUMsVUFBVSxFQUFFLENBQUM7eUJBQ2pHLENBQUM7cUJBQ0g7aUJBQ0YsQ0FBQzthQUNIO1NBQ0YsQ0FBQyxDQUFDO1FBRUgsbUNBQW1DO1FBQ25DLElBQUksQ0FBQyxxQkFBcUIsR0FBRyxJQUFJLEdBQUcsQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFLHVCQUF1QixFQUFFO1lBQ3ZFLFFBQVEsRUFBRSxHQUFHLENBQUMsZ0NBQWdDO1lBQzlDLFNBQVMsRUFBRSxJQUFJLEdBQUcsQ0FBQyxnQkFBZ0IsQ0FBQyxzQkFBc0IsQ0FBQztZQUMzRCxlQUFlLEVBQUU7Z0JBQ2YsR0FBRyxDQUFDLGFBQWEsQ0FBQyx3QkFBd0IsQ0FBQywwQ0FBMEMsQ0FBQzthQUN2RjtZQUNELGNBQWMsRUFBRTtnQkFDZCx1QkFBdUIsRUFBRSxJQUFJLEdBQUcsQ0FBQyxjQUFjLENBQUM7b0JBQzlDLFVBQVUsRUFBRTt3QkFDVixJQUFJLEdBQUcsQ0FBQyxlQUFlLENBQUM7NEJBQ3RCLE1BQU0sRUFBRSxHQUFHLENBQUMsTUFBTSxDQUFDLEtBQUs7NEJBQ3hCLE9BQU8sRUFBRTtnQ0FDUCxjQUFjO2dDQUNkLGNBQWM7Z0NBQ2QsaUJBQWlCOzZCQUNsQjs0QkFDRCxTQUFTLEVBQUU7Z0NBQ1QsZ0JBQWdCLENBQUMsK0JBQStCLFNBQVMsSUFBSTtnQ0FDN0QsZ0JBQWdCLENBQUMsNEJBQTRCLFNBQVMsSUFBSTs2QkFDM0Q7eUJBQ0YsQ0FBQzt3QkFDRixJQUFJLEdBQUcsQ0FBQyxlQUFlLENBQUM7NEJBQ3RCLE1BQU0sRUFBRSxHQUFHLENBQUMsTUFBTSxDQUFDLEtBQUs7NEJBQ3hCLE9BQU8sRUFBRTtnQ0FDUCxrQkFBa0I7Z0NBQ2xCLGtCQUFrQjtnQ0FDbEIscUJBQXFCO2dDQUNyQixnQkFBZ0I7Z0NBQ2hCLGVBQWU7NkJBQ2hCOzRCQUNELFNBQVMsRUFBRSxDQUFDLG9CQUFvQixNQUFNLElBQUksU0FBUyxVQUFVLENBQUMsNEJBQTRCLENBQUM7eUJBQzVGLENBQUM7d0JBQ0YsSUFBSSxHQUFHLENBQUMsZUFBZSxDQUFDOzRCQUN0QixNQUFNLEVBQUUsR0FBRyxDQUFDLE1BQU0sQ0FBQyxLQUFLOzRCQUN4QixPQUFPLEVBQUU7Z0NBQ1AscUNBQXFDO2dDQUNyQyxtQ0FBbUM7Z0NBQ25DLGdDQUFnQztnQ0FDaEMsOEJBQThCOzZCQUMvQjs0QkFDRCxTQUFTLEVBQUUsQ0FBQyxHQUFHLENBQUM7eUJBQ2pCLENBQUM7cUJBQ0g7aUJBQ0YsQ0FBQzthQUNIO1NBQ0YsQ0FBQyxDQUFDO1FBRUgsMkNBQTJDO1FBQzNDLElBQUksQ0FBQyw0QkFBNEIsR0FBRyxJQUFJLEdBQUcsQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFLDhCQUE4QixFQUFFO1lBQ3JGLFFBQVEsRUFBRSxHQUFHLENBQUMsdUNBQXVDO1lBQ3JELFNBQVMsRUFBRSxJQUFJLEdBQUcsQ0FBQyxnQkFBZ0IsQ0FBQyxzQkFBc0IsQ0FBQztZQUMzRCxlQUFlLEVBQUU7Z0JBQ2YsR0FBRyxDQUFDLGFBQWEsQ0FBQyx3QkFBd0IsQ0FBQywwQ0FBMEMsQ0FBQzthQUN2RjtZQUNELGNBQWMsRUFBRTtnQkFDZCw4QkFBOEIsRUFBRSxJQUFJLEdBQUcsQ0FBQyxjQUFjLENBQUM7b0JBQ3JELFVBQVUsRUFBRTt3QkFDVixJQUFJLEdBQUcsQ0FBQyxlQUFlLENBQUM7NEJBQ3RCLE1BQU0sRUFBRSxHQUFHLENBQUMsTUFBTSxDQUFDLEtBQUs7NEJBQ3hCLE9BQU8sRUFBRTtnQ0FDUCxjQUFjO2dDQUNkLGNBQWM7NkJBQ2Y7NEJBQ0QsU0FBUyxFQUFFLENBQUMsZ0JBQWdCLENBQUMsNEJBQTRCLFNBQVMsSUFBSSxDQUFDO3lCQUN4RSxDQUFDO3dCQUNGLElBQUksR0FBRyxDQUFDLGVBQWUsQ0FBQzs0QkFDdEIsTUFBTSxFQUFFLEdBQUcsQ0FBQyxNQUFNLENBQUMsS0FBSzs0QkFDeEIsT0FBTyxFQUFFO2dDQUNQLGtCQUFrQjtnQ0FDbEIsa0JBQWtCO2dDQUNsQixxQkFBcUI7Z0NBQ3JCLGdCQUFnQjtnQ0FDaEIsZUFBZTs2QkFDaEI7NEJBQ0QsU0FBUyxFQUFFLENBQUMsb0JBQW9CLE1BQU0sSUFBSSxTQUFTLFVBQVUsQ0FBQyw0QkFBNEIsQ0FBQzt5QkFDNUYsQ0FBQzt3QkFDRixJQUFJLEdBQUcsQ0FBQyxlQUFlLENBQUM7NEJBQ3RCLE1BQU0sRUFBRSxHQUFHLENBQUMsTUFBTSxDQUFDLEtBQUs7NEJBQ3hCLE9BQU8sRUFBRTtnQ0FDUCw4QkFBOEI7Z0NBQzlCLG1DQUFtQzs2QkFDcEM7NEJBQ0QsU0FBUyxFQUFFLENBQUMsR0FBRyxDQUFDO3lCQUNqQixDQUFDO3FCQUNIO2lCQUNGLENBQUM7YUFDSDtTQUNGLENBQUMsQ0FBQztRQUVILHNDQUFzQztRQUN0QyxJQUFJLENBQUMsd0JBQXdCLEdBQUcsSUFBSSxHQUFHLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSwwQkFBMEIsRUFBRTtZQUM3RSxRQUFRLEVBQUUsR0FBRyxDQUFDLGlDQUFpQztZQUMvQyxTQUFTLEVBQUUsSUFBSSxHQUFHLENBQUMsZ0JBQWdCLENBQUMsc0JBQXNCLENBQUM7WUFDM0QsZUFBZSxFQUFFO2dCQUNmLEdBQUcsQ0FBQyxhQUFhLENBQUMsd0JBQXdCLENBQUMsMENBQTBDLENBQUM7YUFDdkY7WUFDRCxjQUFjLEVBQUU7Z0JBQ2QsMEJBQTBCLEVBQUUsSUFBSSxHQUFHLENBQUMsY0FBYyxDQUFDO29CQUNqRCxVQUFVLEVBQUU7d0JBQ1YsSUFBSSxHQUFHLENBQUMsZUFBZSxDQUFDOzRCQUN0QixNQUFNLEVBQUUsR0FBRyxDQUFDLE1BQU0sQ0FBQyxLQUFLOzRCQUN4QixPQUFPLEVBQUU7Z0NBQ1AsY0FBYztnQ0FDZCxjQUFjOzZCQUNmOzRCQUNELFNBQVMsRUFBRTtnQ0FDVCxnQkFBZ0IsQ0FBQyw0QkFBNEIsU0FBUyxJQUFJO2dDQUMxRCxnQkFBZ0IsQ0FBQyw0QkFBNEIsU0FBUyxJQUFJO2dDQUMxRCxnQkFBZ0IsQ0FBQyxpQ0FBaUMsU0FBUyxJQUFJOzZCQUNoRTt5QkFDRixDQUFDO3dCQUNGLElBQUksR0FBRyxDQUFDLGVBQWUsQ0FBQzs0QkFDdEIsTUFBTSxFQUFFLEdBQUcsQ0FBQyxNQUFNLENBQUMsS0FBSzs0QkFDeEIsT0FBTyxFQUFFO2dDQUNQLGVBQWU7NkJBQ2hCOzRCQUNELFNBQVMsRUFBRTtnQ0FDVCxnQkFBZ0IsQ0FBQyw0QkFBNEIsU0FBUyxFQUFFO2dDQUN4RCxnQkFBZ0IsQ0FBQyxpQ0FBaUMsU0FBUyxFQUFFOzZCQUM5RDt5QkFDRixDQUFDO3dCQUNGLElBQUksR0FBRyxDQUFDLGVBQWUsQ0FBQzs0QkFDdEIsTUFBTSxFQUFFLEdBQUcsQ0FBQyxNQUFNLENBQUMsS0FBSzs0QkFDeEIsT0FBTyxFQUFFO2dDQUNQLHFCQUFxQjs2QkFDdEI7NEJBQ0QsU0FBUyxFQUFFLENBQUMsbUJBQW1CLE1BQU0saURBQWlELENBQUM7eUJBQ3hGLENBQUM7d0JBQ0YsSUFBSSxHQUFHLENBQUMsZUFBZSxDQUFDOzRCQUN0QixNQUFNLEVBQUUsR0FBRyxDQUFDLE1BQU0sQ0FBQyxLQUFLOzRCQUN4QixPQUFPLEVBQUU7Z0NBQ1Asc0JBQXNCO2dDQUN0QixzQkFBc0I7Z0NBQ3RCLHlCQUF5QjtnQ0FDekIsdUJBQXVCOzZCQUN4Qjs0QkFDRCxTQUFTLEVBQUUsQ0FBQyxxQkFBcUIsTUFBTSxJQUFJLFNBQVMsV0FBVyxDQUFDLDRCQUE0QixTQUFTLFVBQVUsQ0FBQzt5QkFDakgsQ0FBQzt3QkFDRixJQUFJLEdBQUcsQ0FBQyxlQUFlLENBQUM7NEJBQ3RCLE1BQU0sRUFBRSxHQUFHLENBQUMsTUFBTSxDQUFDLEtBQUs7NEJBQ3hCLE9BQU8sRUFBRTtnQ0FDUCxxQkFBcUI7Z0NBQ3JCLGtCQUFrQjs2QkFDbkI7NEJBQ0QsU0FBUyxFQUFFLENBQUMsb0JBQW9CLE1BQU0sSUFBSSxTQUFTLFVBQVUsQ0FBQyw0QkFBNEIsQ0FBQzt5QkFDNUYsQ0FBQzt3QkFDRixJQUFJLEdBQUcsQ0FBQyxlQUFlLENBQUM7NEJBQ3RCLE1BQU0sRUFBRSxHQUFHLENBQUMsTUFBTSxDQUFDLEtBQUs7NEJBQ3hCLE9BQU8sRUFBRSxDQUFDLGFBQWEsQ0FBQzs0QkFDeEIsU0FBUyxFQUFFLENBQUMsZUFBZSxNQUFNLElBQUksU0FBUyxJQUFJLENBQUMsd0JBQXdCLENBQUM7eUJBQzdFLENBQUM7cUJBQ0g7aUJBQ0YsQ0FBQzthQUNIO1NBQ0YsQ0FBQyxDQUFDO1FBRUgsaUNBQWlDO1FBQ2pDLElBQUksQ0FBQyxtQkFBbUIsR0FBRyxJQUFJLEdBQUcsQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFLHFCQUFxQixFQUFFO1lBQ25FLFFBQVEsRUFBRSxHQUFHLENBQUMsOEJBQThCO1lBQzVDLFNBQVMsRUFBRSxJQUFJLEdBQUcsQ0FBQyxnQkFBZ0IsQ0FBQyxzQkFBc0IsQ0FBQztZQUMzRCxlQUFlLEVBQUU7Z0JBQ2YsR0FBRyxDQUFDLGFBQWEsQ0FBQyx3QkFBd0IsQ0FBQywwQ0FBMEMsQ0FBQzthQUN2RjtZQUNELGNBQWMsRUFBRTtnQkFDZCxxQkFBcUIsRUFBRSxJQUFJLEdBQUcsQ0FBQyxjQUFjLENBQUM7b0JBQzVDLFVBQVUsRUFBRTt3QkFDVixJQUFJLEdBQUcsQ0FBQyxlQUFlLENBQUM7NEJBQ3RCLE1BQU0sRUFBRSxHQUFHLENBQUMsTUFBTSxDQUFDLEtBQUs7NEJBQ3hCLE9BQU8sRUFBRTtnQ0FDUCxrQkFBa0I7Z0NBQ2xCLGtCQUFrQjtnQ0FDbEIscUJBQXFCO2dDQUNyQixnQkFBZ0I7Z0NBQ2hCLGVBQWU7NkJBQ2hCOzRCQUNELFNBQVMsRUFBRTtnQ0FDVCxvQkFBb0IsTUFBTSxJQUFJLFNBQVMsVUFBVSxDQUFDLDRCQUE0QjtnQ0FDOUUsb0JBQW9CLE1BQU0sSUFBSSxTQUFTLFVBQVUsQ0FBQyw4QkFBOEI7NkJBQ2pGO3lCQUNGLENBQUM7d0JBQ0YsSUFBSSxHQUFHLENBQUMsZUFBZSxDQUFDOzRCQUN0QixNQUFNLEVBQUUsR0FBRyxDQUFDLE1BQU0sQ0FBQyxLQUFLOzRCQUN4QixPQUFPLEVBQUU7Z0NBQ1AscUJBQXFCOzZCQUN0Qjs0QkFDRCxTQUFTLEVBQUU7Z0NBQ1QsbUJBQW1CLE1BQU0saURBQWlEO2dDQUMxRSxtQkFBbUIsTUFBTSxJQUFJLFNBQVMsZ0VBQWdFOzZCQUN2Rzt5QkFDRixDQUFDO3dCQUNGLElBQUksR0FBRyxDQUFDLGVBQWUsQ0FBQzs0QkFDdEIsTUFBTSxFQUFFLEdBQUcsQ0FBQyxNQUFNLENBQUMsS0FBSzs0QkFDeEIsT0FBTyxFQUFFO2dDQUNQLHFCQUFxQjs2QkFDdEI7NEJBQ0QsU0FBUyxFQUFFO2dDQUNULHNGQUFzRjtnQ0FDdEYsc0ZBQXNGO2dDQUN0RixzRkFBc0Y7NkJBQ3ZGOzRCQUNELFVBQVUsRUFBRTtnQ0FDVixZQUFZLEVBQUU7b0NBQ1osNkJBQTZCLEVBQUUsbUJBQW1CLE1BQU0sSUFBSSxTQUFTLGdFQUFnRTtpQ0FDdEk7NkJBQ0Y7eUJBQ0YsQ0FBQzt3QkFDRixJQUFJLEdBQUcsQ0FBQyxlQUFlLENBQUM7NEJBQ3RCLE1BQU0sRUFBRSxHQUFHLENBQUMsTUFBTSxDQUFDLEtBQUs7NEJBQ3hCLE9BQU8sRUFBRTtnQ0FDUCxzQkFBc0I7Z0NBQ3RCLHVCQUF1QjtnQ0FDdkIsd0JBQXdCOzZCQUN6Qjs0QkFDRCxTQUFTLEVBQUUsQ0FBQyxxQkFBcUIsTUFBTSxJQUFJLFNBQVMsV0FBVyxDQUFDLDRCQUE0QixTQUFTLFVBQVUsQ0FBQzt5QkFDakgsQ0FBQztxQkFDSDtpQkFDRixDQUFDO2FBQ0g7U0FDRixDQUFDLENBQUM7UUFFSCw2QkFBNkI7UUFDN0IsSUFBSSxDQUFDLHdCQUF3QixHQUFHLElBQUksR0FBRyxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUsMEJBQTBCLEVBQUU7WUFDN0UsUUFBUSxFQUFFLEdBQUcsQ0FBQywyQkFBMkI7WUFDekMsU0FBUyxFQUFFLElBQUksR0FBRyxDQUFDLGdCQUFnQixDQUFDLHNCQUFzQixDQUFDO1lBQzNELGVBQWUsRUFBRTtnQkFDZixHQUFHLENBQUMsYUFBYSxDQUFDLHdCQUF3QixDQUFDLDBDQUEwQyxDQUFDO2FBQ3ZGO1lBQ0QsY0FBYyxFQUFFO2dCQUNkLDBCQUEwQixFQUFFLElBQUksR0FBRyxDQUFDLGNBQWMsQ0FBQztvQkFDakQsVUFBVSxFQUFFO3dCQUNWLElBQUksR0FBRyxDQUFDLGVBQWUsQ0FBQzs0QkFDdEIsTUFBTSxFQUFFLEdBQUcsQ0FBQyxNQUFNLENBQUMsS0FBSzs0QkFDeEIsT0FBTyxFQUFFO2dDQUNQLGtCQUFrQjtnQ0FDbEIsa0JBQWtCO2dDQUNsQixxQkFBcUI7Z0NBQ3JCLGdCQUFnQjs2QkFDakI7NEJBQ0QsU0FBUyxFQUFFO2dDQUNULG9CQUFvQixNQUFNLElBQUksU0FBUyxVQUFVLENBQUMsZ0NBQWdDO2dDQUNsRixvQkFBb0IsTUFBTSxJQUFJLFNBQVMsVUFBVSxDQUFDLHdDQUF3QztnQ0FDMUYsb0JBQW9CLE1BQU0sSUFBSSxTQUFTLFVBQVUsQ0FBQywyQkFBMkI7NkJBQzlFO3lCQUNGLENBQUM7d0JBQ0YsSUFBSSxHQUFHLENBQUMsZUFBZSxDQUFDOzRCQUN0QixNQUFNLEVBQUUsR0FBRyxDQUFDLE1BQU0sQ0FBQyxLQUFLOzRCQUN4QixPQUFPLEVBQUU7Z0NBQ1AscUJBQXFCOzZCQUN0Qjs0QkFDRCxTQUFTLEVBQUU7Z0NBQ1QsbUJBQW1CLE1BQU0saURBQWlEO2dDQUMxRSxtQkFBbUIsTUFBTSxJQUFJLFNBQVMsZ0VBQWdFOzZCQUN2Rzt5QkFDRixDQUFDO3dCQUNGLElBQUksR0FBRyxDQUFDLGVBQWUsQ0FBQzs0QkFDdEIsTUFBTSxFQUFFLEdBQUcsQ0FBQyxNQUFNLENBQUMsS0FBSzs0QkFDeEIsT0FBTyxFQUFFO2dDQUNQLHFCQUFxQjs2QkFDdEI7NEJBQ0QsU0FBUyxFQUFFO2dDQUNULHNGQUFzRjtnQ0FDdEYsc0ZBQXNGO2dDQUN0RixzRkFBc0Y7NkJBQ3ZGOzRCQUNELFVBQVUsRUFBRTtnQ0FDVixZQUFZLEVBQUU7b0NBQ1osNkJBQTZCLEVBQUUsbUJBQW1CLE1BQU0sSUFBSSxTQUFTLGdFQUFnRTtpQ0FDdEk7NkJBQ0Y7eUJBQ0YsQ0FBQzt3QkFDRixJQUFJLEdBQUcsQ0FBQyxlQUFlLENBQUM7NEJBQ3RCLE1BQU0sRUFBRSxHQUFHLENBQUMsTUFBTSxDQUFDLEtBQUs7NEJBQ3hCLE9BQU8sRUFBRTtnQ0FDUCxzQkFBc0I7Z0NBQ3RCLHdCQUF3Qjs2QkFDekI7NEJBQ0QsU0FBUyxFQUFFLENBQUMscUJBQXFCLE1BQU0sSUFBSSxTQUFTLFdBQVcsQ0FBQyw0QkFBNEIsU0FBUyxVQUFVLENBQUM7eUJBQ2pILENBQUM7d0JBQ0YsSUFBSSxHQUFHLENBQUMsZUFBZSxDQUFDOzRCQUN0QixNQUFNLEVBQUUsR0FBRyxDQUFDLE1BQU0sQ0FBQyxLQUFLOzRCQUN4QixPQUFPLEVBQUUsQ0FBQyxrQkFBa0IsRUFBRSxxQkFBcUIsQ0FBQzs0QkFDcEQsU0FBUyxFQUFFLENBQUMsb0JBQW9CLE1BQU0sSUFBSSxTQUFTLFVBQVUsQ0FBQyxhQUFhLENBQUM7eUJBQzdFLENBQUM7cUJBQ0g7aUJBQ0YsQ0FBQzthQUNIO1NBQ0YsQ0FBQyxDQUFDO1FBR0gsc0JBQXNCO1FBQ3RCLElBQUksQ0FBQyxpQkFBaUIsR0FBRyxJQUFJLEdBQUcsQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFLG1CQUFtQixFQUFFO1lBQy9ELFFBQVEsRUFBRSxHQUFHLENBQUMsb0JBQW9CO1lBQ2xDLFNBQVMsRUFBRSxJQUFJLEdBQUcsQ0FBQyxnQkFBZ0IsQ0FBQyxzQkFBc0IsQ0FBQztZQUMzRCxlQUFlLEVBQUU7Z0JBQ2YsR0FBRyxDQUFDLGFBQWEsQ0FBQyx3QkFBd0IsQ0FBQywwQ0FBMEMsQ0FBQzthQUN2RjtZQUNELGNBQWMsRUFBRTtnQkFDZCxtQkFBbUIsRUFBRSxJQUFJLEdBQUcsQ0FBQyxjQUFjLENBQUM7b0JBQzFDLFVBQVUsRUFBRTt3QkFDVixJQUFJLEdBQUcsQ0FBQyxlQUFlLENBQUM7NEJBQ3RCLE1BQU0sRUFBRSxHQUFHLENBQUMsTUFBTSxDQUFDLEtBQUs7NEJBQ3hCLE9BQU8sRUFBRSxDQUFDLGtCQUFrQixDQUFDOzRCQUM3QixTQUFTLEVBQUUsQ0FBQyxvQkFBb0IsTUFBTSxJQUFJLFNBQVMsVUFBVSxDQUFDLGFBQWEsQ0FBQzt5QkFDN0UsQ0FBQztxQkFDSDtpQkFDRixDQUFDO2FBQ0g7U0FDRixDQUFDLENBQUM7UUFFSCxvQ0FBb0M7UUFDcEMsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSwwQkFBMEIsRUFBRTtZQUNsRCxLQUFLLEVBQUUsSUFBSSxDQUFDLHFCQUFxQixDQUFDLE9BQU87WUFDekMsVUFBVSxFQUFFLEdBQUcsQ0FBQyw4Q0FBOEM7U0FDL0QsQ0FBQyxDQUFDO1FBRUgsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSwwQkFBMEIsRUFBRTtZQUNsRCxLQUFLLEVBQUUsSUFBSSxDQUFDLHFCQUFxQixDQUFDLE9BQU87WUFDekMsVUFBVSxFQUFFLEdBQUcsQ0FBQyw4Q0FBOEM7U0FDL0QsQ0FBQyxDQUFDO1FBRUgsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxpQ0FBaUMsRUFBRTtZQUN6RCxLQUFLLEVBQUUsSUFBSSxDQUFDLDRCQUE0QixDQUFDLE9BQU87WUFDaEQsVUFBVSxFQUFFLEdBQUcsQ0FBQyxzREFBc0Q7U0FDdkUsQ0FBQyxDQUFDO1FBRUgsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSw2QkFBNkIsRUFBRTtZQUNyRCxLQUFLLEVBQUUsSUFBSSxDQUFDLHdCQUF3QixDQUFDLE9BQU87WUFDNUMsVUFBVSxFQUFFLEdBQUcsQ0FBQyxpREFBaUQ7U0FDbEUsQ0FBQyxDQUFDO1FBRUgsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSx3QkFBd0IsRUFBRTtZQUNoRCxLQUFLLEVBQUUsSUFBSSxDQUFDLG1CQUFtQixDQUFDLE9BQU87WUFDdkMsVUFBVSxFQUFFLEdBQUcsQ0FBQyw0Q0FBNEM7U0FDN0QsQ0FBQyxDQUFDO1FBRUgsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSx3QkFBd0IsRUFBRTtZQUNoRCxLQUFLLEVBQUUsSUFBSSxDQUFDLG1CQUFtQixDQUFDLE9BQU87WUFDdkMsVUFBVSxFQUFFLEdBQUcsQ0FBQyw0Q0FBNEM7U0FDN0QsQ0FBQyxDQUFDO1FBRUgsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSw2QkFBNkIsRUFBRTtZQUNyRCxLQUFLLEVBQUUsSUFBSSxDQUFDLHdCQUF3QixDQUFDLE9BQU87WUFDNUMsVUFBVSxFQUFFLEdBQUcsQ0FBQyxpREFBaUQ7U0FDbEUsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztDQUNGO0FBbmNELG9FQW1jQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIGNkayBmcm9tICdhd3MtY2RrLWxpYic7XG5pbXBvcnQgeyBDb25zdHJ1Y3QgfSBmcm9tICdjb25zdHJ1Y3RzJztcbmltcG9ydCAqIGFzIGlhbSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtaWFtJztcbmltcG9ydCB7IEVudmlyb25tZW50Q29uZmlnIH0gZnJvbSAnLi9lbnZpcm9ubWVudC1jb25maWcnO1xuXG5leHBvcnQgaW50ZXJmYWNlIFNlY3VyaXR5U3RhY2tQcm9wcyBleHRlbmRzIGNkay5TdGFja1Byb3BzIHtcbiAgcmVhZG9ubHkgZW52Q29uZmlnOiBFbnZpcm9ubWVudENvbmZpZztcbn1cblxuZXhwb3J0IGNsYXNzIFBkZkNvbnZlcnNhdGlvblNlY3VyaXR5U3RhY2sgZXh0ZW5kcyBjZGsuU3RhY2sge1xuICBwdWJsaWMgcmVhZG9ubHkgZG9jdW1lbnRJbmdlc3Rpb25Sb2xlOiBpYW0uUm9sZTtcbiAgcHVibGljIHJlYWRvbmx5IHRleHRyYWN0UHJvY2Vzc29yUm9sZTogaWFtLlJvbGU7XG4gIHB1YmxpYyByZWFkb25seSB0ZXh0cmFjdFJlc3VsdHNQcm9jZXNzb3JSb2xlOiBpYW0uUm9sZTtcbiAgcHVibGljIHJlYWRvbmx5IGJlZHJvY2tWZWN0b3JpemF0aW9uUm9sZTogaWFtLlJvbGU7XG4gIHB1YmxpYyByZWFkb25seSBxdWVyeVByb2Nlc3NpbmdSb2xlOiBpYW0uUm9sZTtcbiAgcHVibGljIHJlYWRvbmx5IHRleHRyYWN0U2VydmljZVJvbGU6IGlhbS5Sb2xlO1xuICBwdWJsaWMgcmVhZG9ubHkgY29udmVyc2F0aW9uRnVuY3Rpb25Sb2xlOiBpYW0uUm9sZTtcbiAgcHVibGljIHJlYWRvbmx5IHVzYWdlRnVuY3Rpb25Sb2xlOiBpYW0uUm9sZTtcblxuICBjb25zdHJ1Y3RvcihzY29wZTogQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wczogU2VjdXJpdHlTdGFja1Byb3BzKSB7XG4gICAgc3VwZXIoc2NvcGUsIGlkLCBwcm9wcyk7XG5cbiAgICBjb25zdCB7IHJlZ2lvbiB9ID0gcHJvcHMuZW52Q29uZmlnO1xuICAgIC8vIHRoaXMuYWNjb3VudCBpcyBjb25jcmV0ZSAobm90IGEgQ2xvdWRGb3JtYXRpb24gdG9rZW4pIGJlY2F1c2UgYXBwLnRzIGFsd2F5cyBzZXRzIGVudi5hY2NvdW50XG4gICAgLy8gZnJvbSBDREtfREVGQVVMVF9BQ0NPVU5ULiBTMyBidWNrZXQgbmFtZSBBUk5zIGVtYmVkIGFjY291bnRJZCBhcyBhIHBoeXNpY2FsIHN0cmluZyBjb21wb25lbnQg4oCUXG4gICAgLy8gdGhleSBjYW5ub3QgdG9sZXJhdGUgYSB0b2tlbiB2YWx1ZS5cbiAgICBjb25zdCBhY2NvdW50SWQgPSB0aGlzLmFjY291bnQ7XG4gICAgY29uc3QgcCA9IHByb3BzLmVudkNvbmZpZy5wcmVmaXg7XG5cbiAgICAvLyBUZXh0cmFjdCBTZXJ2aWNlIFJvbGUgKHVzZWQgYnkgVGV4dHJhY3QgdG8gcHVibGlzaCBTTlMgbm90aWZpY2F0aW9ucylcbiAgICB0aGlzLnRleHRyYWN0U2VydmljZVJvbGUgPSBuZXcgaWFtLlJvbGUodGhpcywgJ1RleHRyYWN0U2VydmljZVJvbGUnLCB7XG4gICAgICByb2xlTmFtZTogYCR7cH1UZXh0cmFjdFNlcnZpY2VSb2xlYCxcbiAgICAgIGFzc3VtZWRCeTogbmV3IGlhbS5TZXJ2aWNlUHJpbmNpcGFsKCd0ZXh0cmFjdC5hbWF6b25hd3MuY29tJyksXG4gICAgICBpbmxpbmVQb2xpY2llczoge1xuICAgICAgICBUZXh0cmFjdFNOU1BvbGljeTogbmV3IGlhbS5Qb2xpY3lEb2N1bWVudCh7XG4gICAgICAgICAgc3RhdGVtZW50czogW1xuICAgICAgICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICAgICAgICAgIGFjdGlvbnM6IFsnc25zOlB1Ymxpc2gnXSxcbiAgICAgICAgICAgICAgcmVzb3VyY2VzOiBbYGFybjphd3M6c25zOiR7cmVnaW9ufToke2FjY291bnRJZH06JHtwfXRleHRyYWN0LWNvbXBsZXRpb25gXSxcbiAgICAgICAgICAgIH0pLFxuICAgICAgICAgIF0sXG4gICAgICAgIH0pLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIC8vIERvY3VtZW50IEluZ2VzdGlvbiBGdW5jdGlvbiBSb2xlXG4gICAgdGhpcy5kb2N1bWVudEluZ2VzdGlvblJvbGUgPSBuZXcgaWFtLlJvbGUodGhpcywgJ0RvY3VtZW50SW5nZXN0aW9uUm9sZScsIHtcbiAgICAgIHJvbGVOYW1lOiBgJHtwfURvY3VtZW50SW5nZXN0aW9uRnVuY3Rpb24tcm9sZWAsXG4gICAgICBhc3N1bWVkQnk6IG5ldyBpYW0uU2VydmljZVByaW5jaXBhbCgnbGFtYmRhLmFtYXpvbmF3cy5jb20nKSxcbiAgICAgIG1hbmFnZWRQb2xpY2llczogW1xuICAgICAgICBpYW0uTWFuYWdlZFBvbGljeS5mcm9tQXdzTWFuYWdlZFBvbGljeU5hbWUoJ3NlcnZpY2Utcm9sZS9BV1NMYW1iZGFCYXNpY0V4ZWN1dGlvblJvbGUnKSxcbiAgICAgIF0sXG4gICAgICBpbmxpbmVQb2xpY2llczoge1xuICAgICAgICBEb2N1bWVudEluZ2VzdGlvblBvbGljeTogbmV3IGlhbS5Qb2xpY3lEb2N1bWVudCh7XG4gICAgICAgICAgc3RhdGVtZW50czogW1xuICAgICAgICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICAgICAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgICAgICAgICAnczM6R2V0T2JqZWN0JyxcbiAgICAgICAgICAgICAgICAnczM6UHV0T2JqZWN0JyxcbiAgICAgICAgICAgICAgXSxcbiAgICAgICAgICAgICAgcmVzb3VyY2VzOiBbYGFybjphd3M6czM6Ojoke3B9cGRmLWNvbnZlcnNhdGlvbi1wcm9jZXNzaW5nLSR7YWNjb3VudElkfS8qYF0sXG4gICAgICAgICAgICB9KSxcbiAgICAgICAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICAgICAgICBhY3Rpb25zOiBbXG4gICAgICAgICAgICAgICAgJ3MzOlB1dE9iamVjdCcsXG4gICAgICAgICAgICAgIF0sXG4gICAgICAgICAgICAgIHJlc291cmNlczogW2Bhcm46YXdzOnMzOjo6JHtwfXBkZi1jb252ZXJzYXRpb24tZGlnZXN0cy0ke2FjY291bnRJZH0vKmBdLFxuICAgICAgICAgICAgfSksXG4gICAgICAgICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgICAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgICAgICAgICAgYWN0aW9uczogW1xuICAgICAgICAgICAgICAgICdkeW5hbW9kYjpQdXRJdGVtJyxcbiAgICAgICAgICAgICAgICAnZHluYW1vZGI6R2V0SXRlbScsXG4gICAgICAgICAgICAgICAgJ2R5bmFtb2RiOlVwZGF0ZUl0ZW0nLFxuICAgICAgICAgICAgICAgICdkeW5hbW9kYjpRdWVyeScsXG4gICAgICAgICAgICAgICAgJ2R5bmFtb2RiOlNjYW4nLFxuICAgICAgICAgICAgICBdLFxuICAgICAgICAgICAgICByZXNvdXJjZXM6IFtgYXJuOmF3czpkeW5hbW9kYjoke3JlZ2lvbn06JHthY2NvdW50SWR9OnRhYmxlLyR7cH1wZGYtY29udmVyc2F0aW9uLW1ldGFkYXRhKmBdLFxuICAgICAgICAgICAgfSksXG4gICAgICAgICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgICAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgICAgICAgICAgYWN0aW9uczogWydzbnM6UHVibGlzaCddLFxuICAgICAgICAgICAgICByZXNvdXJjZXM6IFtgYXJuOmF3czpzbnM6JHtyZWdpb259OiR7YWNjb3VudElkfToke3B9dGV4dHJhY3QtY29tcGxldGlvbmBdLFxuICAgICAgICAgICAgfSksXG4gICAgICAgICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgICAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgICAgICAgICAgYWN0aW9uczogW1xuICAgICAgICAgICAgICAgICd0ZXh0cmFjdDpTdGFydERvY3VtZW50VGV4dERldGVjdGlvbicsXG4gICAgICAgICAgICAgIF0sXG4gICAgICAgICAgICAgIHJlc291cmNlczogWycqJ10sXG4gICAgICAgICAgICB9KSxcbiAgICAgICAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICAgICAgICBhY3Rpb25zOiBbJ2lhbTpQYXNzUm9sZSddLFxuICAgICAgICAgICAgICByZXNvdXJjZXM6IFtgYXJuOmF3czppYW06OiR7YWNjb3VudElkfTpyb2xlLyR7cH1UZXh0cmFjdFNlcnZpY2VSb2xlYF0sXG4gICAgICAgICAgICB9KSxcbiAgICAgICAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICAgICAgICBhY3Rpb25zOiBbJ2R5bmFtb2RiOkdldEl0ZW0nLCAnZHluYW1vZGI6VXBkYXRlSXRlbSddLFxuICAgICAgICAgICAgICByZXNvdXJjZXM6IFtgYXJuOmF3czpkeW5hbW9kYjoke3JlZ2lvbn06JHthY2NvdW50SWR9OnRhYmxlLyR7cH1mb2xpby11c2FnZWBdLFxuICAgICAgICAgICAgfSksXG4gICAgICAgICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgICAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgICAgICAgICAgYWN0aW9uczogWydjb2duaXRvLWlkcDpMaXN0VXNlcnMnXSxcbiAgICAgICAgICAgICAgcmVzb3VyY2VzOiBbYGFybjphd3M6Y29nbml0by1pZHA6JHtyZWdpb259OiR7YWNjb3VudElkfTp1c2VycG9vbC8ke3Byb3BzLmVudkNvbmZpZy51c2VyUG9vbElkfWBdLFxuICAgICAgICAgICAgfSksXG4gICAgICAgICAgXSxcbiAgICAgICAgfSksXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgLy8gVGV4dHJhY3QgUHJvY2Vzc29yIEZ1bmN0aW9uIFJvbGVcbiAgICB0aGlzLnRleHRyYWN0UHJvY2Vzc29yUm9sZSA9IG5ldyBpYW0uUm9sZSh0aGlzLCAnVGV4dHJhY3RQcm9jZXNzb3JSb2xlJywge1xuICAgICAgcm9sZU5hbWU6IGAke3B9VGV4dHJhY3RQcm9jZXNzb3JGdW5jdGlvbi1yb2xlYCxcbiAgICAgIGFzc3VtZWRCeTogbmV3IGlhbS5TZXJ2aWNlUHJpbmNpcGFsKCdsYW1iZGEuYW1hem9uYXdzLmNvbScpLFxuICAgICAgbWFuYWdlZFBvbGljaWVzOiBbXG4gICAgICAgIGlhbS5NYW5hZ2VkUG9saWN5LmZyb21Bd3NNYW5hZ2VkUG9saWN5TmFtZSgnc2VydmljZS1yb2xlL0FXU0xhbWJkYUJhc2ljRXhlY3V0aW9uUm9sZScpLFxuICAgICAgXSxcbiAgICAgIGlubGluZVBvbGljaWVzOiB7XG4gICAgICAgIFRleHRyYWN0UHJvY2Vzc29yUG9saWN5OiBuZXcgaWFtLlBvbGljeURvY3VtZW50KHtcbiAgICAgICAgICBzdGF0ZW1lbnRzOiBbXG4gICAgICAgICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgICAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgICAgICAgICAgYWN0aW9uczogW1xuICAgICAgICAgICAgICAgICdzMzpHZXRPYmplY3QnLFxuICAgICAgICAgICAgICAgICdzMzpQdXRPYmplY3QnLFxuICAgICAgICAgICAgICAgICdzMzpEZWxldGVPYmplY3QnLFxuICAgICAgICAgICAgICBdLFxuICAgICAgICAgICAgICByZXNvdXJjZXM6IFtcbiAgICAgICAgICAgICAgICBgYXJuOmF3czpzMzo6OiR7cH1wZGYtY29udmVyc2F0aW9uLXByb2Nlc3NpbmctJHthY2NvdW50SWR9LypgLFxuICAgICAgICAgICAgICAgIGBhcm46YXdzOnMzOjo6JHtwfXBkZi1jb252ZXJzYXRpb24tZGlnZXN0cy0ke2FjY291bnRJZH0vKmAsXG4gICAgICAgICAgICAgIF0sXG4gICAgICAgICAgICB9KSxcbiAgICAgICAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICAgICAgICBhY3Rpb25zOiBbXG4gICAgICAgICAgICAgICAgJ2R5bmFtb2RiOlB1dEl0ZW0nLFxuICAgICAgICAgICAgICAgICdkeW5hbW9kYjpHZXRJdGVtJyxcbiAgICAgICAgICAgICAgICAnZHluYW1vZGI6VXBkYXRlSXRlbScsXG4gICAgICAgICAgICAgICAgJ2R5bmFtb2RiOlF1ZXJ5JyxcbiAgICAgICAgICAgICAgICAnZHluYW1vZGI6U2NhbicsXG4gICAgICAgICAgICAgIF0sXG4gICAgICAgICAgICAgIHJlc291cmNlczogW2Bhcm46YXdzOmR5bmFtb2RiOiR7cmVnaW9ufToke2FjY291bnRJZH06dGFibGUvJHtwfXBkZi1jb252ZXJzYXRpb24tbWV0YWRhdGEqYF0sXG4gICAgICAgICAgICB9KSxcbiAgICAgICAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICAgICAgICBhY3Rpb25zOiBbXG4gICAgICAgICAgICAgICAgJ3RleHRyYWN0OlN0YXJ0RG9jdW1lbnRUZXh0RGV0ZWN0aW9uJyxcbiAgICAgICAgICAgICAgICAndGV4dHJhY3Q6R2V0RG9jdW1lbnRUZXh0RGV0ZWN0aW9uJyxcbiAgICAgICAgICAgICAgICAndGV4dHJhY3Q6U3RhcnREb2N1bWVudEFuYWx5c2lzJyxcbiAgICAgICAgICAgICAgICAndGV4dHJhY3Q6R2V0RG9jdW1lbnRBbmFseXNpcycsXG4gICAgICAgICAgICAgIF0sXG4gICAgICAgICAgICAgIHJlc291cmNlczogWycqJ10sXG4gICAgICAgICAgICB9KSxcbiAgICAgICAgICBdLFxuICAgICAgICB9KSxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICAvLyBUZXh0cmFjdCBSZXN1bHRzIFByb2Nlc3NvciBGdW5jdGlvbiBSb2xlXG4gICAgdGhpcy50ZXh0cmFjdFJlc3VsdHNQcm9jZXNzb3JSb2xlID0gbmV3IGlhbS5Sb2xlKHRoaXMsICdUZXh0cmFjdFJlc3VsdHNQcm9jZXNzb3JSb2xlJywge1xuICAgICAgcm9sZU5hbWU6IGAke3B9VGV4dHJhY3RSZXN1bHRzUHJvY2Vzc29yRnVuY3Rpb24tcm9sZWAsXG4gICAgICBhc3N1bWVkQnk6IG5ldyBpYW0uU2VydmljZVByaW5jaXBhbCgnbGFtYmRhLmFtYXpvbmF3cy5jb20nKSxcbiAgICAgIG1hbmFnZWRQb2xpY2llczogW1xuICAgICAgICBpYW0uTWFuYWdlZFBvbGljeS5mcm9tQXdzTWFuYWdlZFBvbGljeU5hbWUoJ3NlcnZpY2Utcm9sZS9BV1NMYW1iZGFCYXNpY0V4ZWN1dGlvblJvbGUnKSxcbiAgICAgIF0sXG4gICAgICBpbmxpbmVQb2xpY2llczoge1xuICAgICAgICBUZXh0cmFjdFJlc3VsdHNQcm9jZXNzb3JQb2xpY3k6IG5ldyBpYW0uUG9saWN5RG9jdW1lbnQoe1xuICAgICAgICAgIHN0YXRlbWVudHM6IFtcbiAgICAgICAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICAgICAgICBhY3Rpb25zOiBbXG4gICAgICAgICAgICAgICAgJ3MzOkdldE9iamVjdCcsXG4gICAgICAgICAgICAgICAgJ3MzOlB1dE9iamVjdCcsXG4gICAgICAgICAgICAgIF0sXG4gICAgICAgICAgICAgIHJlc291cmNlczogW2Bhcm46YXdzOnMzOjo6JHtwfXBkZi1jb252ZXJzYXRpb24tZGlnZXN0cy0ke2FjY291bnRJZH0vKmBdLFxuICAgICAgICAgICAgfSksXG4gICAgICAgICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgICAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgICAgICAgICAgYWN0aW9uczogW1xuICAgICAgICAgICAgICAgICdkeW5hbW9kYjpQdXRJdGVtJyxcbiAgICAgICAgICAgICAgICAnZHluYW1vZGI6R2V0SXRlbScsXG4gICAgICAgICAgICAgICAgJ2R5bmFtb2RiOlVwZGF0ZUl0ZW0nLFxuICAgICAgICAgICAgICAgICdkeW5hbW9kYjpRdWVyeScsXG4gICAgICAgICAgICAgICAgJ2R5bmFtb2RiOlNjYW4nLFxuICAgICAgICAgICAgICBdLFxuICAgICAgICAgICAgICByZXNvdXJjZXM6IFtgYXJuOmF3czpkeW5hbW9kYjoke3JlZ2lvbn06JHthY2NvdW50SWR9OnRhYmxlLyR7cH1wZGYtY29udmVyc2F0aW9uLW1ldGFkYXRhKmBdLFxuICAgICAgICAgICAgfSksXG4gICAgICAgICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgICAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgICAgICAgICAgYWN0aW9uczogW1xuICAgICAgICAgICAgICAgICd0ZXh0cmFjdDpHZXREb2N1bWVudEFuYWx5c2lzJyxcbiAgICAgICAgICAgICAgICAndGV4dHJhY3Q6R2V0RG9jdW1lbnRUZXh0RGV0ZWN0aW9uJyxcbiAgICAgICAgICAgICAgXSxcbiAgICAgICAgICAgICAgcmVzb3VyY2VzOiBbJyonXSxcbiAgICAgICAgICAgIH0pLFxuICAgICAgICAgIF0sXG4gICAgICAgIH0pLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIC8vIEJlZHJvY2sgVmVjdG9yaXphdGlvbiBGdW5jdGlvbiBSb2xlXG4gICAgdGhpcy5iZWRyb2NrVmVjdG9yaXphdGlvblJvbGUgPSBuZXcgaWFtLlJvbGUodGhpcywgJ0JlZHJvY2tWZWN0b3JpemF0aW9uUm9sZScsIHtcbiAgICAgIHJvbGVOYW1lOiBgJHtwfUJlZHJvY2tUb1MzVmVjdG9yaXphdGlvbi1MYW1iZGFgLFxuICAgICAgYXNzdW1lZEJ5OiBuZXcgaWFtLlNlcnZpY2VQcmluY2lwYWwoJ2xhbWJkYS5hbWF6b25hd3MuY29tJyksXG4gICAgICBtYW5hZ2VkUG9saWNpZXM6IFtcbiAgICAgICAgaWFtLk1hbmFnZWRQb2xpY3kuZnJvbUF3c01hbmFnZWRQb2xpY3lOYW1lKCdzZXJ2aWNlLXJvbGUvQVdTTGFtYmRhQmFzaWNFeGVjdXRpb25Sb2xlJyksXG4gICAgICBdLFxuICAgICAgaW5saW5lUG9saWNpZXM6IHtcbiAgICAgICAgQmVkcm9ja1ZlY3Rvcml6YXRpb25Qb2xpY3k6IG5ldyBpYW0uUG9saWN5RG9jdW1lbnQoe1xuICAgICAgICAgIHN0YXRlbWVudHM6IFtcbiAgICAgICAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICAgICAgICBhY3Rpb25zOiBbXG4gICAgICAgICAgICAgICAgJ3MzOkdldE9iamVjdCcsXG4gICAgICAgICAgICAgICAgJ3MzOlB1dE9iamVjdCcsXG4gICAgICAgICAgICAgIF0sXG4gICAgICAgICAgICAgIHJlc291cmNlczogW1xuICAgICAgICAgICAgICAgIGBhcm46YXdzOnMzOjo6JHtwfXBkZi1jb252ZXJzYXRpb24tZGlnZXN0cy0ke2FjY291bnRJZH0vKmAsXG4gICAgICAgICAgICAgICAgYGFybjphd3M6czM6Ojoke3B9cGRmLWNvbnZlcnNhdGlvbi12ZWN0b3JzLSR7YWNjb3VudElkfS8qYCxcbiAgICAgICAgICAgICAgICBgYXJuOmF3czpzMzo6OiR7cH1wZGYtY29udmVyc2F0aW9uLXZlY3RvcnMtanNvbi0ke2FjY291bnRJZH0vKmAsXG4gICAgICAgICAgICAgIF0sXG4gICAgICAgICAgICB9KSxcbiAgICAgICAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICAgICAgICBhY3Rpb25zOiBbXG4gICAgICAgICAgICAgICAgJ3MzOkxpc3RCdWNrZXQnLFxuICAgICAgICAgICAgICBdLFxuICAgICAgICAgICAgICByZXNvdXJjZXM6IFtcbiAgICAgICAgICAgICAgICBgYXJuOmF3czpzMzo6OiR7cH1wZGYtY29udmVyc2F0aW9uLXZlY3RvcnMtJHthY2NvdW50SWR9YCxcbiAgICAgICAgICAgICAgICBgYXJuOmF3czpzMzo6OiR7cH1wZGYtY29udmVyc2F0aW9uLXZlY3RvcnMtanNvbi0ke2FjY291bnRJZH1gLFxuICAgICAgICAgICAgICBdLFxuICAgICAgICAgICAgfSksXG4gICAgICAgICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgICAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgICAgICAgICAgYWN0aW9uczogW1xuICAgICAgICAgICAgICAgICdiZWRyb2NrOkludm9rZU1vZGVsJyxcbiAgICAgICAgICAgICAgXSxcbiAgICAgICAgICAgICAgcmVzb3VyY2VzOiBbYGFybjphd3M6YmVkcm9jazoke3JlZ2lvbn06OmZvdW5kYXRpb24tbW9kZWwvY29oZXJlLmVtYmVkLW11bHRpbGluZ3VhbC12M2BdLFxuICAgICAgICAgICAgfSksXG4gICAgICAgICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgICAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgICAgICAgICAgYWN0aW9uczogW1xuICAgICAgICAgICAgICAgICdzM3ZlY3RvcnM6UHV0VmVjdG9ycycsXG4gICAgICAgICAgICAgICAgJ3MzdmVjdG9yczpHZXRWZWN0b3JzJyxcbiAgICAgICAgICAgICAgICAnczN2ZWN0b3JzOkRlbGV0ZVZlY3RvcnMnLFxuICAgICAgICAgICAgICAgICdzM3ZlY3RvcnM6TGlzdFZlY3RvcnMnLFxuICAgICAgICAgICAgICBdLFxuICAgICAgICAgICAgICByZXNvdXJjZXM6IFtgYXJuOmF3czpzM3ZlY3RvcnM6JHtyZWdpb259OiR7YWNjb3VudElkfTpidWNrZXQvJHtwfXBkZi1jb252ZXJzYXRpb24tdmVjdG9ycy0ke2FjY291bnRJZH0vaW5kZXgvKmBdLFxuICAgICAgICAgICAgfSksXG4gICAgICAgICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgICAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgICAgICAgICAgYWN0aW9uczogW1xuICAgICAgICAgICAgICAgICdkeW5hbW9kYjpVcGRhdGVJdGVtJyxcbiAgICAgICAgICAgICAgICAnZHluYW1vZGI6R2V0SXRlbScsXG4gICAgICAgICAgICAgIF0sXG4gICAgICAgICAgICAgIHJlc291cmNlczogW2Bhcm46YXdzOmR5bmFtb2RiOiR7cmVnaW9ufToke2FjY291bnRJZH06dGFibGUvJHtwfXBkZi1jb252ZXJzYXRpb24tbWV0YWRhdGEqYF0sXG4gICAgICAgICAgICB9KSxcbiAgICAgICAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICAgICAgICBhY3Rpb25zOiBbJ3NuczpQdWJsaXNoJ10sXG4gICAgICAgICAgICAgIHJlc291cmNlczogW2Bhcm46YXdzOnNuczoke3JlZ2lvbn06JHthY2NvdW50SWR9OiR7cH12ZWN0b3JpemF0aW9uLWNvbXBsZXRlYF0sXG4gICAgICAgICAgICB9KSxcbiAgICAgICAgICBdLFxuICAgICAgICB9KSxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICAvLyBRdWVyeSBQcm9jZXNzaW5nIEZ1bmN0aW9uIFJvbGVcbiAgICB0aGlzLnF1ZXJ5UHJvY2Vzc2luZ1JvbGUgPSBuZXcgaWFtLlJvbGUodGhpcywgJ1F1ZXJ5UHJvY2Vzc2luZ1JvbGUnLCB7XG4gICAgICByb2xlTmFtZTogYCR7cH1RdWVyeVByb2Nlc3NpbmdGdW5jdGlvbi1yb2xlYCxcbiAgICAgIGFzc3VtZWRCeTogbmV3IGlhbS5TZXJ2aWNlUHJpbmNpcGFsKCdsYW1iZGEuYW1hem9uYXdzLmNvbScpLFxuICAgICAgbWFuYWdlZFBvbGljaWVzOiBbXG4gICAgICAgIGlhbS5NYW5hZ2VkUG9saWN5LmZyb21Bd3NNYW5hZ2VkUG9saWN5TmFtZSgnc2VydmljZS1yb2xlL0FXU0xhbWJkYUJhc2ljRXhlY3V0aW9uUm9sZScpLFxuICAgICAgXSxcbiAgICAgIGlubGluZVBvbGljaWVzOiB7XG4gICAgICAgIFF1ZXJ5UHJvY2Vzc2luZ1BvbGljeTogbmV3IGlhbS5Qb2xpY3lEb2N1bWVudCh7XG4gICAgICAgICAgc3RhdGVtZW50czogW1xuICAgICAgICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICAgICAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgICAgICAgICAnZHluYW1vZGI6UHV0SXRlbScsXG4gICAgICAgICAgICAgICAgJ2R5bmFtb2RiOkdldEl0ZW0nLFxuICAgICAgICAgICAgICAgICdkeW5hbW9kYjpVcGRhdGVJdGVtJyxcbiAgICAgICAgICAgICAgICAnZHluYW1vZGI6UXVlcnknLFxuICAgICAgICAgICAgICAgICdkeW5hbW9kYjpTY2FuJyxcbiAgICAgICAgICAgICAgXSxcbiAgICAgICAgICAgICAgcmVzb3VyY2VzOiBbXG4gICAgICAgICAgICAgICAgYGFybjphd3M6ZHluYW1vZGI6JHtyZWdpb259OiR7YWNjb3VudElkfTp0YWJsZS8ke3B9cGRmLWNvbnZlcnNhdGlvbi1tZXRhZGF0YSpgLFxuICAgICAgICAgICAgICAgIGBhcm46YXdzOmR5bmFtb2RiOiR7cmVnaW9ufToke2FjY291bnRJZH06dGFibGUvJHtwfXBkZi1jb252ZXJzYXRpb24tcXVlcnktbG9ncypgLFxuICAgICAgICAgICAgICBdLFxuICAgICAgICAgICAgfSksXG4gICAgICAgICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgICAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgICAgICAgICAgYWN0aW9uczogW1xuICAgICAgICAgICAgICAgICdiZWRyb2NrOkludm9rZU1vZGVsJyxcbiAgICAgICAgICAgICAgXSxcbiAgICAgICAgICAgICAgcmVzb3VyY2VzOiBbXG4gICAgICAgICAgICAgICAgYGFybjphd3M6YmVkcm9jazoke3JlZ2lvbn06OmZvdW5kYXRpb24tbW9kZWwvY29oZXJlLmVtYmVkLW11bHRpbGluZ3VhbC12M2AsXG4gICAgICAgICAgICAgICAgYGFybjphd3M6YmVkcm9jazoke3JlZ2lvbn06JHthY2NvdW50SWR9OmluZmVyZW5jZS1wcm9maWxlL3VzLmFudGhyb3BpYy5jbGF1ZGUtaGFpa3UtNC01LTIwMjUxMDAxLXYxOjBgLFxuICAgICAgICAgICAgICBdLFxuICAgICAgICAgICAgfSksXG4gICAgICAgICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgICAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgICAgICAgICAgYWN0aW9uczogW1xuICAgICAgICAgICAgICAgICdiZWRyb2NrOkludm9rZU1vZGVsJyxcbiAgICAgICAgICAgICAgXSxcbiAgICAgICAgICAgICAgcmVzb3VyY2VzOiBbXG4gICAgICAgICAgICAgICAgJ2Fybjphd3M6YmVkcm9jazp1cy1lYXN0LTE6OmZvdW5kYXRpb24tbW9kZWwvYW50aHJvcGljLmNsYXVkZS1oYWlrdS00LTUtMjAyNTEwMDEtdjE6MCcsXG4gICAgICAgICAgICAgICAgJ2Fybjphd3M6YmVkcm9jazp1cy1lYXN0LTI6OmZvdW5kYXRpb24tbW9kZWwvYW50aHJvcGljLmNsYXVkZS1oYWlrdS00LTUtMjAyNTEwMDEtdjE6MCcsXG4gICAgICAgICAgICAgICAgJ2Fybjphd3M6YmVkcm9jazp1cy13ZXN0LTI6OmZvdW5kYXRpb24tbW9kZWwvYW50aHJvcGljLmNsYXVkZS1oYWlrdS00LTUtMjAyNTEwMDEtdjE6MCcsXG4gICAgICAgICAgICAgIF0sXG4gICAgICAgICAgICAgIGNvbmRpdGlvbnM6IHtcbiAgICAgICAgICAgICAgICBTdHJpbmdFcXVhbHM6IHtcbiAgICAgICAgICAgICAgICAgICdiZWRyb2NrOkluZmVyZW5jZVByb2ZpbGVBcm4nOiBgYXJuOmF3czpiZWRyb2NrOiR7cmVnaW9ufToke2FjY291bnRJZH06aW5mZXJlbmNlLXByb2ZpbGUvdXMuYW50aHJvcGljLmNsYXVkZS1oYWlrdS00LTUtMjAyNTEwMDEtdjE6MGAsXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIH0pLFxuICAgICAgICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICAgICAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgICAgICAgICAnczN2ZWN0b3JzOkdldFZlY3RvcnMnLFxuICAgICAgICAgICAgICAgICdzM3ZlY3RvcnM6TGlzdFZlY3RvcnMnLFxuICAgICAgICAgICAgICAgICdzM3ZlY3RvcnM6UXVlcnlWZWN0b3JzJyxcbiAgICAgICAgICAgICAgXSxcbiAgICAgICAgICAgICAgcmVzb3VyY2VzOiBbYGFybjphd3M6czN2ZWN0b3JzOiR7cmVnaW9ufToke2FjY291bnRJZH06YnVja2V0LyR7cH1wZGYtY29udmVyc2F0aW9uLXZlY3RvcnMtJHthY2NvdW50SWR9L2luZGV4LypgXSxcbiAgICAgICAgICAgIH0pLFxuICAgICAgICAgIF0sXG4gICAgICAgIH0pLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIC8vIENvbnZlcnNhdGlvbiBGdW5jdGlvbiBSb2xlXG4gICAgdGhpcy5jb252ZXJzYXRpb25GdW5jdGlvblJvbGUgPSBuZXcgaWFtLlJvbGUodGhpcywgJ0NvbnZlcnNhdGlvbkZ1bmN0aW9uUm9sZScsIHtcbiAgICAgIHJvbGVOYW1lOiBgJHtwfUNvbnZlcnNhdGlvbkZ1bmN0aW9uLXJvbGVgLFxuICAgICAgYXNzdW1lZEJ5OiBuZXcgaWFtLlNlcnZpY2VQcmluY2lwYWwoJ2xhbWJkYS5hbWF6b25hd3MuY29tJyksXG4gICAgICBtYW5hZ2VkUG9saWNpZXM6IFtcbiAgICAgICAgaWFtLk1hbmFnZWRQb2xpY3kuZnJvbUF3c01hbmFnZWRQb2xpY3lOYW1lKCdzZXJ2aWNlLXJvbGUvQVdTTGFtYmRhQmFzaWNFeGVjdXRpb25Sb2xlJyksXG4gICAgICBdLFxuICAgICAgaW5saW5lUG9saWNpZXM6IHtcbiAgICAgICAgQ29udmVyc2F0aW9uRnVuY3Rpb25Qb2xpY3k6IG5ldyBpYW0uUG9saWN5RG9jdW1lbnQoe1xuICAgICAgICAgIHN0YXRlbWVudHM6IFtcbiAgICAgICAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICAgICAgICBhY3Rpb25zOiBbXG4gICAgICAgICAgICAgICAgJ2R5bmFtb2RiOkdldEl0ZW0nLFxuICAgICAgICAgICAgICAgICdkeW5hbW9kYjpQdXRJdGVtJyxcbiAgICAgICAgICAgICAgICAnZHluYW1vZGI6VXBkYXRlSXRlbScsXG4gICAgICAgICAgICAgICAgJ2R5bmFtb2RiOlF1ZXJ5JyxcbiAgICAgICAgICAgICAgXSxcbiAgICAgICAgICAgICAgcmVzb3VyY2VzOiBbXG4gICAgICAgICAgICAgICAgYGFybjphd3M6ZHluYW1vZGI6JHtyZWdpb259OiR7YWNjb3VudElkfTp0YWJsZS8ke3B9cGRmLWNvbnZlcnNhdGlvbi1jb252ZXJzYXRpb25zYCxcbiAgICAgICAgICAgICAgICBgYXJuOmF3czpkeW5hbW9kYjoke3JlZ2lvbn06JHthY2NvdW50SWR9OnRhYmxlLyR7cH1wZGYtY29udmVyc2F0aW9uLWNvbnZlcnNhdGlvbnMvaW5kZXgvKmAsXG4gICAgICAgICAgICAgICAgYGFybjphd3M6ZHluYW1vZGI6JHtyZWdpb259OiR7YWNjb3VudElkfTp0YWJsZS8ke3B9cGRmLWNvbnZlcnNhdGlvbi1tZXRhZGF0YWAsXG4gICAgICAgICAgICAgIF0sXG4gICAgICAgICAgICB9KSxcbiAgICAgICAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICAgICAgICBhY3Rpb25zOiBbXG4gICAgICAgICAgICAgICAgJ2JlZHJvY2s6SW52b2tlTW9kZWwnLFxuICAgICAgICAgICAgICBdLFxuICAgICAgICAgICAgICByZXNvdXJjZXM6IFtcbiAgICAgICAgICAgICAgICBgYXJuOmF3czpiZWRyb2NrOiR7cmVnaW9ufTo6Zm91bmRhdGlvbi1tb2RlbC9jb2hlcmUuZW1iZWQtbXVsdGlsaW5ndWFsLXYzYCxcbiAgICAgICAgICAgICAgICBgYXJuOmF3czpiZWRyb2NrOiR7cmVnaW9ufToke2FjY291bnRJZH06aW5mZXJlbmNlLXByb2ZpbGUvdXMuYW50aHJvcGljLmNsYXVkZS1oYWlrdS00LTUtMjAyNTEwMDEtdjE6MGAsXG4gICAgICAgICAgICAgIF0sXG4gICAgICAgICAgICB9KSxcbiAgICAgICAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICAgICAgICBhY3Rpb25zOiBbXG4gICAgICAgICAgICAgICAgJ2JlZHJvY2s6SW52b2tlTW9kZWwnLFxuICAgICAgICAgICAgICBdLFxuICAgICAgICAgICAgICByZXNvdXJjZXM6IFtcbiAgICAgICAgICAgICAgICAnYXJuOmF3czpiZWRyb2NrOnVzLWVhc3QtMTo6Zm91bmRhdGlvbi1tb2RlbC9hbnRocm9waWMuY2xhdWRlLWhhaWt1LTQtNS0yMDI1MTAwMS12MTowJyxcbiAgICAgICAgICAgICAgICAnYXJuOmF3czpiZWRyb2NrOnVzLWVhc3QtMjo6Zm91bmRhdGlvbi1tb2RlbC9hbnRocm9waWMuY2xhdWRlLWhhaWt1LTQtNS0yMDI1MTAwMS12MTowJyxcbiAgICAgICAgICAgICAgICAnYXJuOmF3czpiZWRyb2NrOnVzLXdlc3QtMjo6Zm91bmRhdGlvbi1tb2RlbC9hbnRocm9waWMuY2xhdWRlLWhhaWt1LTQtNS0yMDI1MTAwMS12MTowJyxcbiAgICAgICAgICAgICAgXSxcbiAgICAgICAgICAgICAgY29uZGl0aW9uczoge1xuICAgICAgICAgICAgICAgIFN0cmluZ0VxdWFsczoge1xuICAgICAgICAgICAgICAgICAgJ2JlZHJvY2s6SW5mZXJlbmNlUHJvZmlsZUFybic6IGBhcm46YXdzOmJlZHJvY2s6JHtyZWdpb259OiR7YWNjb3VudElkfTppbmZlcmVuY2UtcHJvZmlsZS91cy5hbnRocm9waWMuY2xhdWRlLWhhaWt1LTQtNS0yMDI1MTAwMS12MTowYCxcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgfSksXG4gICAgICAgICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgICAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgICAgICAgICAgYWN0aW9uczogW1xuICAgICAgICAgICAgICAgICdzM3ZlY3RvcnM6R2V0VmVjdG9ycycsXG4gICAgICAgICAgICAgICAgJ3MzdmVjdG9yczpRdWVyeVZlY3RvcnMnLFxuICAgICAgICAgICAgICBdLFxuICAgICAgICAgICAgICByZXNvdXJjZXM6IFtgYXJuOmF3czpzM3ZlY3RvcnM6JHtyZWdpb259OiR7YWNjb3VudElkfTpidWNrZXQvJHtwfXBkZi1jb252ZXJzYXRpb24tdmVjdG9ycy0ke2FjY291bnRJZH0vaW5kZXgvKmBdLFxuICAgICAgICAgICAgfSksXG4gICAgICAgICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgICAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgICAgICAgICAgYWN0aW9uczogWydkeW5hbW9kYjpHZXRJdGVtJywgJ2R5bmFtb2RiOlVwZGF0ZUl0ZW0nXSxcbiAgICAgICAgICAgICAgcmVzb3VyY2VzOiBbYGFybjphd3M6ZHluYW1vZGI6JHtyZWdpb259OiR7YWNjb3VudElkfTp0YWJsZS8ke3B9Zm9saW8tdXNhZ2VgXSxcbiAgICAgICAgICAgIH0pLFxuICAgICAgICAgIF0sXG4gICAgICAgIH0pLFxuICAgICAgfSxcbiAgICB9KTtcblxuXG4gICAgLy8gVXNhZ2UgRnVuY3Rpb24gUm9sZVxuICAgIHRoaXMudXNhZ2VGdW5jdGlvblJvbGUgPSBuZXcgaWFtLlJvbGUodGhpcywgJ1VzYWdlRnVuY3Rpb25Sb2xlJywge1xuICAgICAgcm9sZU5hbWU6IGAke3B9VXNhZ2VGdW5jdGlvbi1yb2xlYCxcbiAgICAgIGFzc3VtZWRCeTogbmV3IGlhbS5TZXJ2aWNlUHJpbmNpcGFsKCdsYW1iZGEuYW1hem9uYXdzLmNvbScpLFxuICAgICAgbWFuYWdlZFBvbGljaWVzOiBbXG4gICAgICAgIGlhbS5NYW5hZ2VkUG9saWN5LmZyb21Bd3NNYW5hZ2VkUG9saWN5TmFtZSgnc2VydmljZS1yb2xlL0FXU0xhbWJkYUJhc2ljRXhlY3V0aW9uUm9sZScpLFxuICAgICAgXSxcbiAgICAgIGlubGluZVBvbGljaWVzOiB7XG4gICAgICAgIFVzYWdlRnVuY3Rpb25Qb2xpY3k6IG5ldyBpYW0uUG9saWN5RG9jdW1lbnQoe1xuICAgICAgICAgIHN0YXRlbWVudHM6IFtcbiAgICAgICAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICAgICAgICBhY3Rpb25zOiBbJ2R5bmFtb2RiOkdldEl0ZW0nXSxcbiAgICAgICAgICAgICAgcmVzb3VyY2VzOiBbYGFybjphd3M6ZHluYW1vZGI6JHtyZWdpb259OiR7YWNjb3VudElkfTp0YWJsZS8ke3B9Zm9saW8tdXNhZ2VgXSxcbiAgICAgICAgICAgIH0pLFxuICAgICAgICAgIF0sXG4gICAgICAgIH0pLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIC8vIE91dHB1dCByb2xlIEFSTnMgZm9yIG90aGVyIHN0YWNrc1xuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdEb2N1bWVudEluZ2VzdGlvblJvbGVBcm4nLCB7XG4gICAgICB2YWx1ZTogdGhpcy5kb2N1bWVudEluZ2VzdGlvblJvbGUucm9sZUFybixcbiAgICAgIGV4cG9ydE5hbWU6IGAke3B9cGRmLWNvbnZlcnNhdGlvbi1kb2N1bWVudC1pbmdlc3Rpb24tcm9sZS1hcm5gLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1RleHRyYWN0UHJvY2Vzc29yUm9sZUFybicsIHtcbiAgICAgIHZhbHVlOiB0aGlzLnRleHRyYWN0UHJvY2Vzc29yUm9sZS5yb2xlQXJuLFxuICAgICAgZXhwb3J0TmFtZTogYCR7cH1wZGYtY29udmVyc2F0aW9uLXRleHRyYWN0LXByb2Nlc3Nvci1yb2xlLWFybmAsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnVGV4dHJhY3RSZXN1bHRzUHJvY2Vzc29yUm9sZUFybicsIHtcbiAgICAgIHZhbHVlOiB0aGlzLnRleHRyYWN0UmVzdWx0c1Byb2Nlc3NvclJvbGUucm9sZUFybixcbiAgICAgIGV4cG9ydE5hbWU6IGAke3B9cGRmLWNvbnZlcnNhdGlvbi10ZXh0cmFjdC1yZXN1bHRzLXByb2Nlc3Nvci1yb2xlLWFybmAsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnQmVkcm9ja1ZlY3Rvcml6YXRpb25Sb2xlQXJuJywge1xuICAgICAgdmFsdWU6IHRoaXMuYmVkcm9ja1ZlY3Rvcml6YXRpb25Sb2xlLnJvbGVBcm4sXG4gICAgICBleHBvcnROYW1lOiBgJHtwfXBkZi1jb252ZXJzYXRpb24tYmVkcm9jay12ZWN0b3JpemF0aW9uLXJvbGUtYXJuYCxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdRdWVyeVByb2Nlc3NpbmdSb2xlQXJuJywge1xuICAgICAgdmFsdWU6IHRoaXMucXVlcnlQcm9jZXNzaW5nUm9sZS5yb2xlQXJuLFxuICAgICAgZXhwb3J0TmFtZTogYCR7cH1wZGYtY29udmVyc2F0aW9uLXF1ZXJ5LXByb2Nlc3Npbmctcm9sZS1hcm5gLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1RleHRyYWN0U2VydmljZVJvbGVBcm4nLCB7XG4gICAgICB2YWx1ZTogdGhpcy50ZXh0cmFjdFNlcnZpY2VSb2xlLnJvbGVBcm4sXG4gICAgICBleHBvcnROYW1lOiBgJHtwfXBkZi1jb252ZXJzYXRpb24tdGV4dHJhY3Qtc2VydmljZS1yb2xlLWFybmAsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnQ29udmVyc2F0aW9uRnVuY3Rpb25Sb2xlQXJuJywge1xuICAgICAgdmFsdWU6IHRoaXMuY29udmVyc2F0aW9uRnVuY3Rpb25Sb2xlLnJvbGVBcm4sXG4gICAgICBleHBvcnROYW1lOiBgJHtwfXBkZi1jb252ZXJzYXRpb24tY29udmVyc2F0aW9uLWZ1bmN0aW9uLXJvbGUtYXJuYCxcbiAgICB9KTtcbiAgfVxufSJdfQ==