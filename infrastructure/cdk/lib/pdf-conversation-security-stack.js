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
        const { accountId, region } = props.envConfig;
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicGRmLWNvbnZlcnNhdGlvbi1zZWN1cml0eS1zdGFjay5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInBkZi1jb252ZXJzYXRpb24tc2VjdXJpdHktc3RhY2sudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSxpREFBbUM7QUFFbkMseURBQTJDO0FBTzNDLE1BQWEsNEJBQTZCLFNBQVEsR0FBRyxDQUFDLEtBQUs7SUFDekMscUJBQXFCLENBQVc7SUFDaEMscUJBQXFCLENBQVc7SUFDaEMsNEJBQTRCLENBQVc7SUFDdkMsd0JBQXdCLENBQVc7SUFDbkMsbUJBQW1CLENBQVc7SUFDOUIsbUJBQW1CLENBQVc7SUFDOUIsd0JBQXdCLENBQVc7SUFDbkMsaUJBQWlCLENBQVc7SUFFNUMsWUFBWSxLQUFnQixFQUFFLEVBQVUsRUFBRSxLQUF5QjtRQUNqRSxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUV4QixNQUFNLEVBQUUsU0FBUyxFQUFFLE1BQU0sRUFBRSxHQUFHLEtBQUssQ0FBQyxTQUFTLENBQUM7UUFDOUMsTUFBTSxDQUFDLEdBQUcsS0FBSyxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUM7UUFFakMsd0VBQXdFO1FBQ3hFLElBQUksQ0FBQyxtQkFBbUIsR0FBRyxJQUFJLEdBQUcsQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFLHFCQUFxQixFQUFFO1lBQ25FLFFBQVEsRUFBRSxHQUFHLENBQUMscUJBQXFCO1lBQ25DLFNBQVMsRUFBRSxJQUFJLEdBQUcsQ0FBQyxnQkFBZ0IsQ0FBQyx3QkFBd0IsQ0FBQztZQUM3RCxjQUFjLEVBQUU7Z0JBQ2QsaUJBQWlCLEVBQUUsSUFBSSxHQUFHLENBQUMsY0FBYyxDQUFDO29CQUN4QyxVQUFVLEVBQUU7d0JBQ1YsSUFBSSxHQUFHLENBQUMsZUFBZSxDQUFDOzRCQUN0QixNQUFNLEVBQUUsR0FBRyxDQUFDLE1BQU0sQ0FBQyxL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LENBQUMsT0FBTztZQUN2QyxVQUFVLEVBQUUsR0FBRyxDQUFDLDRDQUE0QztTQUM3RCxDQUFDLENBQUM7UUFFSCxJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLDZCQUE2QixFQUFFO1lBQ3JELEtBQUssRUFBRSxJQUFJLENBQUMsd0JBQXdCLENBQUMsT0FBTztZQUM1QyxVQUFVLEVBQUUsR0FBRyxDQUFDLGlEQUFpRDtTQUNsRSxDQUFDLENBQUM7SUFDTCxDQUFDO0NBQ0Y7QUEvYkQsb0VBK2JDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgY2RrIGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gJ2NvbnN0cnVjdHMnO1xuaW1wb3J0ICogYXMgaWFtIGZyb20gJ2F3cy1jZGstbGliL2F3cy1pYW0nO1xuaW1wb3J0IHsgRW52aXJvbm1lbnRDb25maWcgfSBmcm9tICcuL2Vudmlyb25tZW50LWNvbmZpZyc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgU2VjdXJpdHlTdGFja1Byb3BzIGV4dGVuZHMgY2RrLlN0YWNrUHJvcHMge1xuICByZWFkb25seSBlbnZDb25maWc6IEVudmlyb25tZW50Q29uZmlnO1xufVxuXG5leHBvcnQgY2xhc3MgUGRmQ29udmVyc2F0aW9uU2VjdXJpdHlTdGFjayBleHRlbmRzIGNkay5TdGFjayB7XG4gIHB1YmxpYyByZWFkb25seSBkb2N1bWVudEluZ2VzdGlvblJvbGU6IGlhbS5Sb2xlO1xuICBwdWJsaWMgcmVhZG9ubHkgdGV4dHJhY3RQcm9jZXNzb3JSb2xlOiBpYW0uUm9sZTtcbiAgcHVibGljIHJlYWRvbmx5IHRleHRyYWN0UmVzdWx0c1Byb2Nlc3NvclJvbGU6IGlhbS5Sb2xlO1xuICBwdWJsaWMgcmVhZG9ubHkgYmVkcm9ja1ZlY3Rvcml6YXRpb25Sb2xlOiBpYW0uUm9sZTtcbiAgcHVibGljIHJlYWRvbmx5IHF1ZXJ5UHJvY2Vzc2luZ1JvbGU6IGlhbS5Sb2xlO1xuICBwdWJsaWMgcmVhZG9ubHkgdGV4dHJhY3RTZXJ2aWNlUm9sZTogaWFtLlJvbGU7XG4gIHB1YmxpYyByZWFkb25seSBjb252ZXJzYXRpb25GdW5jdGlvblJvbGU6IGlhbS5Sb2xlO1xuICBwdWJsaWMgcmVhZG9ubHkgdXNhZ2VGdW5jdGlvblJvbGU6IGlhbS5Sb2xlO1xuXG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzOiBTZWN1cml0eVN0YWNrUHJvcHMpIHtcbiAgICBzdXBlcihzY29wZSwgaWQsIHByb3BzKTtcblxuICAgIGNvbnN0IHsgYWNjb3VudElkLCByZWdpb24gfSA9IHByb3BzLmVudkNvbmZpZztcbiAgICBjb25zdCBwID0gcHJvcHMuZW52Q29uZmlnLnByZWZpeDtcblxuICAgIC8vIFRleHRyYWN0IFNlcnZpY2UgUm9sZSAodXNlZCBieSBUZXh0cmFjdCB0byBwdWJsaXNoIFNOUyBub3RpZmljYXRpb25zKVxuICAgIHRoaXMudGV4dHJhY3RTZXJ2aWNlUm9sZSA9IG5ldyBpYW0uUm9sZSh0aGlzLCAnVGV4dHJhY3RTZXJ2aWNlUm9sZScsIHtcbiAgICAgIHJvbGVOYW1lOiBgJHtwfVRleHRyYWN0U2VydmljZVJvbGVgLFxuICAgICAgYXNzdW1lZEJ5OiBuZXcgaWFtLlNlcnZpY2VQcmluY2lwYWwoJ3RleHRyYWN0LmFtYXpvbmF3cy5jb20nKSxcbiAgICAgIGlubGluZVBvbGljaWVzOiB7XG4gICAgICAgIFRleHRyYWN0U05TUG9saWN5OiBuZXcgaWFtLlBvbGljeURvY3VtZW50KHtcbiAgICAgICAgICBzdGF0ZW1lbnRzOiBbXG4gICAgICAgICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgICAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgICAgICAgICAgYWN0aW9uczogWydzbnM6UHVibGlzaCddLFxuICAgICAgICAgICAgICByZXNvdXJjZXM6IFtgYXJuOmF3czpzbnM6JHtyZWdpb259OiR7YWNjb3VudElkfToke3B9dGV4dHJhY3QtY29tcGxldGlvbmBdLFxuICAgICAgICAgICAgfSksXG4gICAgICAgICAgXSxcbiAgICAgICAgfSksXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgLy8gRG9jdW1lbnQgSW5nZXN0aW9uIEZ1bmN0aW9uIFJvbGVcbiAgICB0aGlzLmRvY3VtZW50SW5nZXN0aW9uUm9sZSA9IG5ldyBpYW0uUm9sZSh0aGlzLCAnRG9jdW1lbnRJbmdlc3Rpb25Sb2xlJywge1xuICAgICAgcm9sZU5hbWU6IGAke3B9RG9jdW1lbnRJbmdlc3Rpb25GdW5jdGlvbi1yb2xlYCxcbiAgICAgIGFzc3VtZWRCeTogbmV3IGlhbS5TZXJ2aWNlUHJpbmNpcGFsKCdsYW1iZGEuYW1hem9uYXdzLmNvbScpLFxuICAgICAgbWFuYWdlZFBvbGljaWVzOiBbXG4gICAgICAgIGlhbS5NYW5hZ2VkUG9saWN5LmZyb21Bd3NNYW5hZ2VkUG9saWN5TmFtZSgnc2VydmljZS1yb2xlL0FXU0xhbWJkYUJhc2ljRXhlY3V0aW9uUm9sZScpLFxuICAgICAgXSxcbiAgICAgIGlubGluZVBvbGljaWVzOiB7XG4gICAgICAgIERvY3VtZW50SW5nZXN0aW9uUG9saWN5OiBuZXcgaWFtLlBvbGljeURvY3VtZW50KHtcbiAgICAgICAgICBzdGF0ZW1lbnRzOiBbXG4gICAgICAgICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgICAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgICAgICAgICAgYWN0aW9uczogW1xuICAgICAgICAgICAgICAgICdzMzpHZXRPYmplY3QnLFxuICAgICAgICAgICAgICAgICdzMzpQdXRPYmplY3QnLFxuICAgICAgICAgICAgICBdLFxuICAgICAgICAgICAgICByZXNvdXJjZXM6IFtgYXJuOmF3czpzMzo6OiR7cH1wZGYtY29udmVyc2F0aW9uLXByb2Nlc3NpbmctJHthY2NvdW50SWR9LypgXSxcbiAgICAgICAgICAgIH0pLFxuICAgICAgICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICAgICAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgICAgICAgICAnczM6UHV0T2JqZWN0JyxcbiAgICAgICAgICAgICAgXSxcbiAgICAgICAgICAgICAgcmVzb3VyY2VzOiBbYGFybjphd3M6czM6Ojoke3B9cGRmLWNvbnZlcnNhdGlvbi1kaWdlc3RzLSR7YWNjb3VudElkfS8qYF0sXG4gICAgICAgICAgICB9KSxcbiAgICAgICAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICAgICAgICBhY3Rpb25zOiBbXG4gICAgICAgICAgICAgICAgJ2R5bmFtb2RiOlB1dEl0ZW0nLFxuICAgICAgICAgICAgICAgICdkeW5hbW9kYjpHZXRJdGVtJyxcbiAgICAgICAgICAgICAgICAnZHluYW1vZGI6VXBkYXRlSXRlbScsXG4gICAgICAgICAgICAgICAgJ2R5bmFtb2RiOlF1ZXJ5JyxcbiAgICAgICAgICAgICAgICAnZHluYW1vZGI6U2NhbicsXG4gICAgICAgICAgICAgIF0sXG4gICAgICAgICAgICAgIHJlc291cmNlczogW2Bhcm46YXdzOmR5bmFtb2RiOiR7cmVnaW9ufToke2FjY291bnRJZH06dGFibGUvJHtwfXBkZi1jb252ZXJzYXRpb24tbWV0YWRhdGEqYF0sXG4gICAgICAgICAgICB9KSxcbiAgICAgICAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICAgICAgICBhY3Rpb25zOiBbJ3NuczpQdWJsaXNoJ10sXG4gICAgICAgICAgICAgIHJlc291cmNlczogW2Bhcm46YXdzOnNuczoke3JlZ2lvbn06JHthY2NvdW50SWR9OiR7cH10ZXh0cmFjdC1jb21wbGV0aW9uYF0sXG4gICAgICAgICAgICB9KSxcbiAgICAgICAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICAgICAgICBhY3Rpb25zOiBbXG4gICAgICAgICAgICAgICAgJ3RleHRyYWN0OlN0YXJ0RG9jdW1lbnRUZXh0RGV0ZWN0aW9uJyxcbiAgICAgICAgICAgICAgXSxcbiAgICAgICAgICAgICAgcmVzb3VyY2VzOiBbJyonXSxcbiAgICAgICAgICAgIH0pLFxuICAgICAgICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICAgICAgICAgIGFjdGlvbnM6IFsnaWFtOlBhc3NSb2xlJ10sXG4gICAgICAgICAgICAgIHJlc291cmNlczogW2Bhcm46YXdzOmlhbTo6JHthY2NvdW50SWR9OnJvbGUvJHtwfVRleHRyYWN0U2VydmljZVJvbGVgXSxcbiAgICAgICAgICAgIH0pLFxuICAgICAgICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICAgICAgICAgIGFjdGlvbnM6IFsnZHluYW1vZGI6R2V0SXRlbScsICdkeW5hbW9kYjpVcGRhdGVJdGVtJ10sXG4gICAgICAgICAgICAgIHJlc291cmNlczogW2Bhcm46YXdzOmR5bmFtb2RiOiR7cmVnaW9ufToke2FjY291bnRJZH06dGFibGUvJHtwfWZvbGlvLXVzYWdlYF0sXG4gICAgICAgICAgICB9KSxcbiAgICAgICAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICAgICAgICBhY3Rpb25zOiBbJ2NvZ25pdG8taWRwOkxpc3RVc2VycyddLFxuICAgICAgICAgICAgICByZXNvdXJjZXM6IFtgYXJuOmF3czpjb2duaXRvLWlkcDoke3JlZ2lvbn06JHthY2NvdW50SWR9OnVzZXJwb29sLyR7cHJvcHMuZW52Q29uZmlnLnVzZXJQb29sSWR9YF0sXG4gICAgICAgICAgICB9KSxcbiAgICAgICAgICBdLFxuICAgICAgICB9KSxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICAvLyBUZXh0cmFjdCBQcm9jZXNzb3IgRnVuY3Rpb24gUm9sZVxuICAgIHRoaXMudGV4dHJhY3RQcm9jZXNzb3JSb2xlID0gbmV3IGlhbS5Sb2xlKHRoaXMsICdUZXh0cmFjdFByb2Nlc3NvclJvbGUnLCB7XG4gICAgICByb2xlTmFtZTogYCR7cH1UZXh0cmFjdFByb2Nlc3NvckZ1bmN0aW9uLXJvbGVgLFxuICAgICAgYXNzdW1lZEJ5OiBuZXcgaWFtLlNlcnZpY2VQcmluY2lwYWwoJ2xhbWJkYS5hbWF6b25hd3MuY29tJyksXG4gICAgICBtYW5hZ2VkUG9saWNpZXM6IFtcbiAgICAgICAgaWFtLk1hbmFnZWRQb2xpY3kuZnJvbUF3c01hbmFnZWRQb2xpY3lOYW1lKCdzZXJ2aWNlLXJvbGUvQVdTTGFtYmRhQmFzaWNFeGVjdXRpb25Sb2xlJyksXG4gICAgICBdLFxuICAgICAgaW5saW5lUG9saWNpZXM6IHtcbiAgICAgICAgVGV4dHJhY3RQcm9jZXNzb3JQb2xpY3k6IG5ldyBpYW0uUG9saWN5RG9jdW1lbnQoe1xuICAgICAgICAgIHN0YXRlbWVudHM6IFtcbiAgICAgICAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICAgICAgICBhY3Rpb25zOiBbXG4gICAgICAgICAgICAgICAgJ3MzOkdldE9iamVjdCcsXG4gICAgICAgICAgICAgICAgJ3MzOlB1dE9iamVjdCcsXG4gICAgICAgICAgICAgICAgJ3MzOkRlbGV0ZU9iamVjdCcsXG4gICAgICAgICAgICAgIF0sXG4gICAgICAgICAgICAgIHJlc291cmNlczogW1xuICAgICAgICAgICAgICAgIGBhcm46YXdzOnMzOjo6JHtwfXBkZi1jb252ZXJzYXRpb24tcHJvY2Vzc2luZy0ke2FjY291bnRJZH0vKmAsXG4gICAgICAgICAgICAgICAgYGFybjphd3M6czM6Ojoke3B9cGRmLWNvbnZlcnNhdGlvbi1kaWdlc3RzLSR7YWNjb3VudElkfS8qYCxcbiAgICAgICAgICAgICAgXSxcbiAgICAgICAgICAgIH0pLFxuICAgICAgICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICAgICAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgICAgICAgICAnZHluYW1vZGI6UHV0SXRlbScsXG4gICAgICAgICAgICAgICAgJ2R5bmFtb2RiOkdldEl0ZW0nLFxuICAgICAgICAgICAgICAgICdkeW5hbW9kYjpVcGRhdGVJdGVtJyxcbiAgICAgICAgICAgICAgICAnZHluYW1vZGI6UXVlcnknLFxuICAgICAgICAgICAgICAgICdkeW5hbW9kYjpTY2FuJyxcbiAgICAgICAgICAgICAgXSxcbiAgICAgICAgICAgICAgcmVzb3VyY2VzOiBbYGFybjphd3M6ZHluYW1vZGI6JHtyZWdpb259OiR7YWNjb3VudElkfTp0YWJsZS8ke3B9cGRmLWNvbnZlcnNhdGlvbi1tZXRhZGF0YSpgXSxcbiAgICAgICAgICAgIH0pLFxuICAgICAgICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICAgICAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgICAgICAgICAndGV4dHJhY3Q6U3RhcnREb2N1bWVudFRleHREZXRlY3Rpb24nLFxuICAgICAgICAgICAgICAgICd0ZXh0cmFjdDpHZXREb2N1bWVudFRleHREZXRlY3Rpb24nLFxuICAgICAgICAgICAgICAgICd0ZXh0cmFjdDpTdGFydERvY3VtZW50QW5hbHlzaXMnLFxuICAgICAgICAgICAgICAgICd0ZXh0cmFjdDpHZXREb2N1bWVudEFuYWx5c2lzJyxcbiAgICAgICAgICAgICAgXSxcbiAgICAgICAgICAgICAgcmVzb3VyY2VzOiBbJyonXSxcbiAgICAgICAgICAgIH0pLFxuICAgICAgICAgIF0sXG4gICAgICAgIH0pLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIC8vIFRleHRyYWN0IFJlc3VsdHMgUHJvY2Vzc29yIEZ1bmN0aW9uIFJvbGVcbiAgICB0aGlzLnRleHRyYWN0UmVzdWx0c1Byb2Nlc3NvclJvbGUgPSBuZXcgaWFtLlJvbGUodGhpcywgJ1RleHRyYWN0UmVzdWx0c1Byb2Nlc3NvclJvbGUnLCB7XG4gICAgICByb2xlTmFtZTogYCR7cH1UZXh0cmFjdFJlc3VsdHNQcm9jZXNzb3JGdW5jdGlvbi1yb2xlYCxcbiAgICAgIGFzc3VtZWRCeTogbmV3IGlhbS5TZXJ2aWNlUHJpbmNpcGFsKCdsYW1iZGEuYW1hem9uYXdzLmNvbScpLFxuICAgICAgbWFuYWdlZFBvbGljaWVzOiBbXG4gICAgICAgIGlhbS5NYW5hZ2VkUG9saWN5LmZyb21Bd3NNYW5hZ2VkUG9saWN5TmFtZSgnc2VydmljZS1yb2xlL0FXU0xhbWJkYUJhc2ljRXhlY3V0aW9uUm9sZScpLFxuICAgICAgXSxcbiAgICAgIGlubGluZVBvbGljaWVzOiB7XG4gICAgICAgIFRleHRyYWN0UmVzdWx0c1Byb2Nlc3NvclBvbGljeTogbmV3IGlhbS5Qb2xpY3lEb2N1bWVudCh7XG4gICAgICAgICAgc3RhdGVtZW50czogW1xuICAgICAgICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICAgICAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgICAgICAgICAnczM6R2V0T2JqZWN0JyxcbiAgICAgICAgICAgICAgICAnczM6UHV0T2JqZWN0JyxcbiAgICAgICAgICAgICAgXSxcbiAgICAgICAgICAgICAgcmVzb3VyY2VzOiBbYGFybjphd3M6czM6Ojoke3B9cGRmLWNvbnZlcnNhdGlvbi1kaWdlc3RzLSR7YWNjb3VudElkfS8qYF0sXG4gICAgICAgICAgICB9KSxcbiAgICAgICAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICAgICAgICBhY3Rpb25zOiBbXG4gICAgICAgICAgICAgICAgJ2R5bmFtb2RiOlB1dEl0ZW0nLFxuICAgICAgICAgICAgICAgICdkeW5hbW9kYjpHZXRJdGVtJyxcbiAgICAgICAgICAgICAgICAnZHluYW1vZGI6VXBkYXRlSXRlbScsXG4gICAgICAgICAgICAgICAgJ2R5bmFtb2RiOlF1ZXJ5JyxcbiAgICAgICAgICAgICAgICAnZHluYW1vZGI6U2NhbicsXG4gICAgICAgICAgICAgIF0sXG4gICAgICAgICAgICAgIHJlc291cmNlczogW2Bhcm46YXdzOmR5bmFtb2RiOiR7cmVnaW9ufToke2FjY291bnRJZH06dGFibGUvJHtwfXBkZi1jb252ZXJzYXRpb24tbWV0YWRhdGEqYF0sXG4gICAgICAgICAgICB9KSxcbiAgICAgICAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICAgICAgICBhY3Rpb25zOiBbXG4gICAgICAgICAgICAgICAgJ3RleHRyYWN0OkdldERvY3VtZW50QW5hbHlzaXMnLFxuICAgICAgICAgICAgICAgICd0ZXh0cmFjdDpHZXREb2N1bWVudFRleHREZXRlY3Rpb24nLFxuICAgICAgICAgICAgICBdLFxuICAgICAgICAgICAgICByZXNvdXJjZXM6IFsnKiddLFxuICAgICAgICAgICAgfSksXG4gICAgICAgICAgXSxcbiAgICAgICAgfSksXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgLy8gQmVkcm9jayBWZWN0b3JpemF0aW9uIEZ1bmN0aW9uIFJvbGVcbiAgICB0aGlzLmJlZHJvY2tWZWN0b3JpemF0aW9uUm9sZSA9IG5ldyBpYW0uUm9sZSh0aGlzLCAnQmVkcm9ja1ZlY3Rvcml6YXRpb25Sb2xlJywge1xuICAgICAgcm9sZU5hbWU6IGAke3B9QmVkcm9ja1RvUzNWZWN0b3JpemF0aW9uLUxhbWJkYWAsXG4gICAgICBhc3N1bWVkQnk6IG5ldyBpYW0uU2VydmljZVByaW5jaXBhbCgnbGFtYmRhLmFtYXpvbmF3cy5jb20nKSxcbiAgICAgIG1hbmFnZWRQb2xpY2llczogW1xuICAgICAgICBpYW0uTWFuYWdlZFBvbGljeS5mcm9tQXdzTWFuYWdlZFBvbGljeU5hbWUoJ3NlcnZpY2Utcm9sZS9BV1NMYW1iZGFCYXNpY0V4ZWN1dGlvblJvbGUnKSxcbiAgICAgIF0sXG4gICAgICBpbmxpbmVQb2xpY2llczoge1xuICAgICAgICBCZWRyb2NrVmVjdG9yaXphdGlvblBvbGljeTogbmV3IGlhbS5Qb2xpY3lEb2N1bWVudCh7XG4gICAgICAgICAgc3RhdGVtZW50czogW1xuICAgICAgICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICAgICAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgICAgICAgICAnczM6R2V0T2JqZWN0JyxcbiAgICAgICAgICAgICAgICAnczM6UHV0T2JqZWN0JyxcbiAgICAgICAgICAgICAgXSxcbiAgICAgICAgICAgICAgcmVzb3VyY2VzOiBbXG4gICAgICAgICAgICAgICAgYGFybjphd3M6czM6Ojoke3B9cGRmLWNvbnZlcnNhdGlvbi1kaWdlc3RzLSR7YWNjb3VudElkfS8qYCxcbiAgICAgICAgICAgICAgICBgYXJuOmF3czpzMzo6OiR7cH1wZGYtY29udmVyc2F0aW9uLXZlY3RvcnMtJHthY2NvdW50SWR9LypgLFxuICAgICAgICAgICAgICAgIGBhcm46YXdzOnMzOjo6JHtwfXBkZi1jb252ZXJzYXRpb24tdmVjdG9ycy1qc29uLSR7YWNjb3VudElkfS8qYCxcbiAgICAgICAgICAgICAgXSxcbiAgICAgICAgICAgIH0pLFxuICAgICAgICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICAgICAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgICAgICAgICAnczM6TGlzdEJ1Y2tldCcsXG4gICAgICAgICAgICAgIF0sXG4gICAgICAgICAgICAgIHJlc291cmNlczogW1xuICAgICAgICAgICAgICAgIGBhcm46YXdzOnMzOjo6JHtwfXBkZi1jb252ZXJzYXRpb24tdmVjdG9ycy0ke2FjY291bnRJZH1gLFxuICAgICAgICAgICAgICAgIGBhcm46YXdzOnMzOjo6JHtwfXBkZi1jb252ZXJzYXRpb24tdmVjdG9ycy1qc29uLSR7YWNjb3VudElkfWAsXG4gICAgICAgICAgICAgIF0sXG4gICAgICAgICAgICB9KSxcbiAgICAgICAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICAgICAgICBhY3Rpb25zOiBbXG4gICAgICAgICAgICAgICAgJ2JlZHJvY2s6SW52b2tlTW9kZWwnLFxuICAgICAgICAgICAgICBdLFxuICAgICAgICAgICAgICByZXNvdXJjZXM6IFtgYXJuOmF3czpiZWRyb2NrOiR7cmVnaW9ufTo6Zm91bmRhdGlvbi1tb2RlbC9jb2hlcmUuZW1iZWQtbXVsdGlsaW5ndWFsLXYzYF0sXG4gICAgICAgICAgICB9KSxcbiAgICAgICAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICAgICAgICBhY3Rpb25zOiBbXG4gICAgICAgICAgICAgICAgJ3MzdmVjdG9yczpQdXRWZWN0b3JzJyxcbiAgICAgICAgICAgICAgICAnczN2ZWN0b3JzOkdldFZlY3RvcnMnLFxuICAgICAgICAgICAgICAgICdzM3ZlY3RvcnM6RGVsZXRlVmVjdG9ycycsXG4gICAgICAgICAgICAgICAgJ3MzdmVjdG9yczpMaXN0VmVjdG9ycycsXG4gICAgICAgICAgICAgIF0sXG4gICAgICAgICAgICAgIHJlc291cmNlczogW2Bhcm46YXdzOnMzdmVjdG9yczoke3JlZ2lvbn06JHthY2NvdW50SWR9OmJ1Y2tldC8ke3B9cGRmLWNvbnZlcnNhdGlvbi12ZWN0b3JzLSR7YWNjb3VudElkfS9pbmRleC8qYF0sXG4gICAgICAgICAgICB9KSxcbiAgICAgICAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICAgICAgICBhY3Rpb25zOiBbXG4gICAgICAgICAgICAgICAgJ2R5bmFtb2RiOlVwZGF0ZUl0ZW0nLFxuICAgICAgICAgICAgICAgICdkeW5hbW9kYjpHZXRJdGVtJyxcbiAgICAgICAgICAgICAgXSxcbiAgICAgICAgICAgICAgcmVzb3VyY2VzOiBbYGFybjphd3M6ZHluYW1vZGI6JHtyZWdpb259OiR7YWNjb3VudElkfTp0YWJsZS8ke3B9cGRmLWNvbnZlcnNhdGlvbi1tZXRhZGF0YSpgXSxcbiAgICAgICAgICAgIH0pLFxuICAgICAgICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICAgICAgICAgIGFjdGlvbnM6IFsnc25zOlB1Ymxpc2gnXSxcbiAgICAgICAgICAgICAgcmVzb3VyY2VzOiBbYGFybjphd3M6c25zOiR7cmVnaW9ufToke2FjY291bnRJZH06JHtwfXZlY3Rvcml6YXRpb24tY29tcGxldGVgXSxcbiAgICAgICAgICAgIH0pLFxuICAgICAgICAgIF0sXG4gICAgICAgIH0pLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIC8vIFF1ZXJ5IFByb2Nlc3NpbmcgRnVuY3Rpb24gUm9sZVxuICAgIHRoaXMucXVlcnlQcm9jZXNzaW5nUm9sZSA9IG5ldyBpYW0uUm9sZSh0aGlzLCAnUXVlcnlQcm9jZXNzaW5nUm9sZScsIHtcbiAgICAgIHJvbGVOYW1lOiBgJHtwfVF1ZXJ5UHJvY2Vzc2luZ0Z1bmN0aW9uLXJvbGVgLFxuICAgICAgYXNzdW1lZEJ5OiBuZXcgaWFtLlNlcnZpY2VQcmluY2lwYWwoJ2xhbWJkYS5hbWF6b25hd3MuY29tJyksXG4gICAgICBtYW5hZ2VkUG9saWNpZXM6IFtcbiAgICAgICAgaWFtLk1hbmFnZWRQb2xpY3kuZnJvbUF3c01hbmFnZWRQb2xpY3lOYW1lKCdzZXJ2aWNlLXJvbGUvQVdTTGFtYmRhQmFzaWNFeGVjdXRpb25Sb2xlJyksXG4gICAgICBdLFxuICAgICAgaW5saW5lUG9saWNpZXM6IHtcbiAgICAgICAgUXVlcnlQcm9jZXNzaW5nUG9saWN5OiBuZXcgaWFtLlBvbGljeURvY3VtZW50KHtcbiAgICAgICAgICBzdGF0ZW1lbnRzOiBbXG4gICAgICAgICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgICAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgICAgICAgICAgYWN0aW9uczogW1xuICAgICAgICAgICAgICAgICdkeW5hbW9kYjpQdXRJdGVtJyxcbiAgICAgICAgICAgICAgICAnZHluYW1vZGI6R2V0SXRlbScsXG4gICAgICAgICAgICAgICAgJ2R5bmFtb2RiOlVwZGF0ZUl0ZW0nLFxuICAgICAgICAgICAgICAgICdkeW5hbW9kYjpRdWVyeScsXG4gICAgICAgICAgICAgICAgJ2R5bmFtb2RiOlNjYW4nLFxuICAgICAgICAgICAgICBdLFxuICAgICAgICAgICAgICByZXNvdXJjZXM6IFtcbiAgICAgICAgICAgICAgICBgYXJuOmF3czpkeW5hbW9kYjoke3JlZ2lvbn06JHthY2NvdW50SWR9OnRhYmxlLyR7cH1wZGYtY29udmVyc2F0aW9uLW1ldGFkYXRhKmAsXG4gICAgICAgICAgICAgICAgYGFybjphd3M6ZHluYW1vZGI6JHtyZWdpb259OiR7YWNjb3VudElkfTp0YWJsZS8ke3B9cGRmLWNvbnZlcnNhdGlvbi1xdWVyeS1sb2dzKmAsXG4gICAgICAgICAgICAgIF0sXG4gICAgICAgICAgICB9KSxcbiAgICAgICAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICAgICAgICBhY3Rpb25zOiBbXG4gICAgICAgICAgICAgICAgJ2JlZHJvY2s6SW52b2tlTW9kZWwnLFxuICAgICAgICAgICAgICBdLFxuICAgICAgICAgICAgICByZXNvdXJjZXM6IFtcbiAgICAgICAgICAgICAgICBgYXJuOmF3czpiZWRyb2NrOiR7cmVnaW9ufTo6Zm91bmRhdGlvbi1tb2RlbC9jb2hlcmUuZW1iZWQtbXVsdGlsaW5ndWFsLXYzYCxcbiAgICAgICAgICAgICAgICBgYXJuOmF3czpiZWRyb2NrOiR7cmVnaW9ufToke2FjY291bnRJZH06aW5mZXJlbmNlLXByb2ZpbGUvdXMuYW50aHJvcGljLmNsYXVkZS1oYWlrdS00LTUtMjAyNTEwMDEtdjE6MGAsXG4gICAgICAgICAgICAgIF0sXG4gICAgICAgICAgICB9KSxcbiAgICAgICAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICAgICAgICBhY3Rpb25zOiBbXG4gICAgICAgICAgICAgICAgJ2JlZHJvY2s6SW52b2tlTW9kZWwnLFxuICAgICAgICAgICAgICBdLFxuICAgICAgICAgICAgICByZXNvdXJjZXM6IFtcbiAgICAgICAgICAgICAgICAnYXJuOmF3czpiZWRyb2NrOnVzLWVhc3QtMTo6Zm91bmRhdGlvbi1tb2RlbC9hbnRocm9waWMuY2xhdWRlLWhhaWt1LTQtNS0yMDI1MTAwMS12MTowJyxcbiAgICAgICAgICAgICAgICAnYXJuOmF3czpiZWRyb2NrOnVzLWVhc3QtMjo6Zm91bmRhdGlvbi1tb2RlbC9hbnRocm9waWMuY2xhdWRlLWhhaWt1LTQtNS0yMDI1MTAwMS12MTowJyxcbiAgICAgICAgICAgICAgICAnYXJuOmF3czpiZWRyb2NrOnVzLXdlc3QtMjo6Zm91bmRhdGlvbi1tb2RlbC9hbnRocm9waWMuY2xhdWRlLWhhaWt1LTQtNS0yMDI1MTAwMS12MTowJyxcbiAgICAgICAgICAgICAgXSxcbiAgICAgICAgICAgICAgY29uZGl0aW9uczoge1xuICAgICAgICAgICAgICAgIFN0cmluZ0VxdWFsczoge1xuICAgICAgICAgICAgICAgICAgJ2JlZHJvY2s6SW5mZXJlbmNlUHJvZmlsZUFybic6IGBhcm46YXdzOmJlZHJvY2s6JHtyZWdpb259OiR7YWNjb3VudElkfTppbmZlcmVuY2UtcHJvZmlsZS91cy5hbnRocm9waWMuY2xhdWRlLWhhaWt1LTQtNS0yMDI1MTAwMS12MTowYCxcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgfSksXG4gICAgICAgICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgICAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgICAgICAgICAgYWN0aW9uczogW1xuICAgICAgICAgICAgICAgICdzM3ZlY3RvcnM6R2V0VmVjdG9ycycsXG4gICAgICAgICAgICAgICAgJ3MzdmVjdG9yczpMaXN0VmVjdG9ycycsXG4gICAgICAgICAgICAgICAgJ3MzdmVjdG9yczpRdWVyeVZlY3RvcnMnLFxuICAgICAgICAgICAgICBdLFxuICAgICAgICAgICAgICByZXNvdXJjZXM6IFtgYXJuOmF3czpzM3ZlY3RvcnM6JHtyZWdpb259OiR7YWNjb3VudElkfTpidWNrZXQvJHtwfXBkZi1jb252ZXJzYXRpb24tdmVjdG9ycy0ke2FjY291bnRJZH0vaW5kZXgvKmBdLFxuICAgICAgICAgICAgfSksXG4gICAgICAgICAgXSxcbiAgICAgICAgfSksXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgLy8gQ29udmVyc2F0aW9uIEZ1bmN0aW9uIFJvbGVcbiAgICB0aGlzLmNvbnZlcnNhdGlvbkZ1bmN0aW9uUm9sZSA9IG5ldyBpYW0uUm9sZSh0aGlzLCAnQ29udmVyc2F0aW9uRnVuY3Rpb25Sb2xlJywge1xuICAgICAgcm9sZU5hbWU6IGAke3B9Q29udmVyc2F0aW9uRnVuY3Rpb24tcm9sZWAsXG4gICAgICBhc3N1bWVkQnk6IG5ldyBpYW0uU2VydmljZVByaW5jaXBhbCgnbGFtYmRhLmFtYXpvbmF3cy5jb20nKSxcbiAgICAgIG1hbmFnZWRQb2xpY2llczogW1xuICAgICAgICBpYW0uTWFuYWdlZFBvbGljeS5mcm9tQXdzTWFuYWdlZFBvbGljeU5hbWUoJ3NlcnZpY2Utcm9sZS9BV1NMYW1iZGFCYXNpY0V4ZWN1dGlvblJvbGUnKSxcbiAgICAgIF0sXG4gICAgICBpbmxpbmVQb2xpY2llczoge1xuICAgICAgICBDb252ZXJzYXRpb25GdW5jdGlvblBvbGljeTogbmV3IGlhbS5Qb2xpY3lEb2N1bWVudCh7XG4gICAgICAgICAgc3RhdGVtZW50czogW1xuICAgICAgICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICAgICAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgICAgICAgICAnZHluYW1vZGI6R2V0SXRlbScsXG4gICAgICAgICAgICAgICAgJ2R5bmFtb2RiOlB1dEl0ZW0nLFxuICAgICAgICAgICAgICAgICdkeW5hbW9kYjpVcGRhdGVJdGVtJyxcbiAgICAgICAgICAgICAgICAnZHluYW1vZGI6UXVlcnknLFxuICAgICAgICAgICAgICBdLFxuICAgICAgICAgICAgICByZXNvdXJjZXM6IFtcbiAgICAgICAgICAgICAgICBgYXJuOmF3czpkeW5hbW9kYjoke3JlZ2lvbn06JHthY2NvdW50SWR9OnRhYmxlLyR7cH1wZGYtY29udmVyc2F0aW9uLWNvbnZlcnNhdGlvbnNgLFxuICAgICAgICAgICAgICAgIGBhcm46YXdzOmR5bmFtb2RiOiR7cmVnaW9ufToke2FjY291bnRJZH06dGFibGUvJHtwfXBkZi1jb252ZXJzYXRpb24tY29udmVyc2F0aW9ucy9pbmRleC8qYCxcbiAgICAgICAgICAgICAgICBgYXJuOmF3czpkeW5hbW9kYjoke3JlZ2lvbn06JHthY2NvdW50SWR9OnRhYmxlLyR7cH1wZGYtY29udmVyc2F0aW9uLW1ldGFkYXRhYCxcbiAgICAgICAgICAgICAgXSxcbiAgICAgICAgICAgIH0pLFxuICAgICAgICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICAgICAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgICAgICAgICAnYmVkcm9jazpJbnZva2VNb2RlbCcsXG4gICAgICAgICAgICAgIF0sXG4gICAgICAgICAgICAgIHJlc291cmNlczogW1xuICAgICAgICAgICAgICAgIGBhcm46YXdzOmJlZHJvY2s6JHtyZWdpb259Ojpmb3VuZGF0aW9uLW1vZGVsL2NvaGVyZS5lbWJlZC1tdWx0aWxpbmd1YWwtdjNgLFxuICAgICAgICAgICAgICAgIGBhcm46YXdzOmJlZHJvY2s6JHtyZWdpb259OiR7YWNjb3VudElkfTppbmZlcmVuY2UtcHJvZmlsZS91cy5hbnRocm9waWMuY2xhdWRlLWhhaWt1LTQtNS0yMDI1MTAwMS12MTowYCxcbiAgICAgICAgICAgICAgXSxcbiAgICAgICAgICAgIH0pLFxuICAgICAgICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICAgICAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgICAgICAgICAnYmVkcm9jazpJbnZva2VNb2RlbCcsXG4gICAgICAgICAgICAgIF0sXG4gICAgICAgICAgICAgIHJlc291cmNlczogW1xuICAgICAgICAgICAgICAgICdhcm46YXdzOmJlZHJvY2s6dXMtZWFzdC0xOjpmb3VuZGF0aW9uLW1vZGVsL2FudGhyb3BpYy5jbGF1ZGUtaGFpa3UtNC01LTIwMjUxMDAxLXYxOjAnLFxuICAgICAgICAgICAgICAgICdhcm46YXdzOmJlZHJvY2s6dXMtZWFzdC0yOjpmb3VuZGF0aW9uLW1vZGVsL2FudGhyb3BpYy5jbGF1ZGUtaGFpa3UtNC01LTIwMjUxMDAxLXYxOjAnLFxuICAgICAgICAgICAgICAgICdhcm46YXdzOmJlZHJvY2s6dXMtd2VzdC0yOjpmb3VuZGF0aW9uLW1vZGVsL2FudGhyb3BpYy5jbGF1ZGUtaGFpa3UtNC01LTIwMjUxMDAxLXYxOjAnLFxuICAgICAgICAgICAgICBdLFxuICAgICAgICAgICAgICBjb25kaXRpb25zOiB7XG4gICAgICAgICAgICAgICAgU3RyaW5nRXF1YWxzOiB7XG4gICAgICAgICAgICAgICAgICAnYmVkcm9jazpJbmZlcmVuY2VQcm9maWxlQXJuJzogYGFybjphd3M6YmVkcm9jazoke3JlZ2lvbn06JHthY2NvdW50SWR9OmluZmVyZW5jZS1wcm9maWxlL3VzLmFudGhyb3BpYy5jbGF1ZGUtaGFpa3UtNC01LTIwMjUxMDAxLXYxOjBgLFxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB9KSxcbiAgICAgICAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICAgICAgICBhY3Rpb25zOiBbXG4gICAgICAgICAgICAgICAgJ3MzdmVjdG9yczpHZXRWZWN0b3JzJyxcbiAgICAgICAgICAgICAgICAnczN2ZWN0b3JzOlF1ZXJ5VmVjdG9ycycsXG4gICAgICAgICAgICAgIF0sXG4gICAgICAgICAgICAgIHJlc291cmNlczogW2Bhcm46YXdzOnMzdmVjdG9yczoke3JlZ2lvbn06JHthY2NvdW50SWR9OmJ1Y2tldC8ke3B9cGRmLWNvbnZlcnNhdGlvbi12ZWN0b3JzLSR7YWNjb3VudElkfS9pbmRleC8qYF0sXG4gICAgICAgICAgICB9KSxcbiAgICAgICAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICAgICAgICBhY3Rpb25zOiBbJ2R5bmFtb2RiOkdldEl0ZW0nLCAnZHluYW1vZGI6VXBkYXRlSXRlbSddLFxuICAgICAgICAgICAgICByZXNvdXJjZXM6IFtgYXJuOmF3czpkeW5hbW9kYjoke3JlZ2lvbn06JHthY2NvdW50SWR9OnRhYmxlLyR7cH1mb2xpby11c2FnZWBdLFxuICAgICAgICAgICAgfSksXG4gICAgICAgICAgXSxcbiAgICAgICAgfSksXG4gICAgICB9LFxuICAgIH0pO1xuXG5cbiAgICAvLyBVc2FnZSBGdW5jdGlvbiBSb2xlXG4gICAgdGhpcy51c2FnZUZ1bmN0aW9uUm9sZSA9IG5ldyBpYW0uUm9sZSh0aGlzLCAnVXNhZ2VGdW5jdGlvblJvbGUnLCB7XG4gICAgICByb2xlTmFtZTogYCR7cH1Vc2FnZUZ1bmN0aW9uLXJvbGVgLFxuICAgICAgYXNzdW1lZEJ5OiBuZXcgaWFtLlNlcnZpY2VQcmluY2lwYWwoJ2xhbWJkYS5hbWF6b25hd3MuY29tJyksXG4gICAgICBtYW5hZ2VkUG9saWNpZXM6IFtcbiAgICAgICAgaWFtLk1hbmFnZWRQb2xpY3kuZnJvbUF3c01hbmFnZWRQb2xpY3lOYW1lKCdzZXJ2aWNlLXJvbGUvQVdTTGFtYmRhQmFzaWNFeGVjdXRpb25Sb2xlJyksXG4gICAgICBdLFxuICAgICAgaW5saW5lUG9saWNpZXM6IHtcbiAgICAgICAgVXNhZ2VGdW5jdGlvblBvbGljeTogbmV3IGlhbS5Qb2xpY3lEb2N1bWVudCh7XG4gICAgICAgICAgc3RhdGVtZW50czogW1xuICAgICAgICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICAgICAgICAgIGFjdGlvbnM6IFsnZHluYW1vZGI6R2V0SXRlbSddLFxuICAgICAgICAgICAgICByZXNvdXJjZXM6IFtgYXJuOmF3czpkeW5hbW9kYjoke3JlZ2lvbn06JHthY2NvdW50SWR9OnRhYmxlLyR7cH1mb2xpby11c2FnZWBdLFxuICAgICAgICAgICAgfSksXG4gICAgICAgICAgXSxcbiAgICAgICAgfSksXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgLy8gT3V0cHV0IHJvbGUgQVJOcyBmb3Igb3RoZXIgc3RhY2tzXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0RvY3VtZW50SW5nZXN0aW9uUm9sZUFybicsIHtcbiAgICAgIHZhbHVlOiB0aGlzLmRvY3VtZW50SW5nZXN0aW9uUm9sZS5yb2xlQXJuLFxuICAgICAgZXhwb3J0TmFtZTogYCR7cH1wZGYtY29udmVyc2F0aW9uLWRvY3VtZW50LWluZ2VzdGlvbi1yb2xlLWFybmAsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnVGV4dHJhY3RQcm9jZXNzb3JSb2xlQXJuJywge1xuICAgICAgdmFsdWU6IHRoaXMudGV4dHJhY3RQcm9jZXNzb3JSb2xlLnJvbGVBcm4sXG4gICAgICBleHBvcnROYW1lOiBgJHtwfXBkZi1jb252ZXJzYXRpb24tdGV4dHJhY3QtcHJvY2Vzc29yLXJvbGUtYXJuYCxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdUZXh0cmFjdFJlc3VsdHNQcm9jZXNzb3JSb2xlQXJuJywge1xuICAgICAgdmFsdWU6IHRoaXMudGV4dHJhY3RSZXN1bHRzUHJvY2Vzc29yUm9sZS5yb2xlQXJuLFxuICAgICAgZXhwb3J0TmFtZTogYCR7cH1wZGYtY29udmVyc2F0aW9uLXRleHRyYWN0LXJlc3VsdHMtcHJvY2Vzc29yLXJvbGUtYXJuYCxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdCZWRyb2NrVmVjdG9yaXphdGlvblJvbGVBcm4nLCB7XG4gICAgICB2YWx1ZTogdGhpcy5iZWRyb2NrVmVjdG9yaXphdGlvblJvbGUucm9sZUFybixcbiAgICAgIGV4cG9ydE5hbWU6IGAke3B9cGRmLWNvbnZlcnNhdGlvbi1iZWRyb2NrLXZlY3Rvcml6YXRpb24tcm9sZS1hcm5gLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1F1ZXJ5UHJvY2Vzc2luZ1JvbGVBcm4nLCB7XG4gICAgICB2YWx1ZTogdGhpcy5xdWVyeVByb2Nlc3NpbmdSb2xlLnJvbGVBcm4sXG4gICAgICBleHBvcnROYW1lOiBgJHtwfXBkZi1jb252ZXJzYXRpb24tcXVlcnktcHJvY2Vzc2luZy1yb2xlLWFybmAsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnVGV4dHJhY3RTZXJ2aWNlUm9sZUFybicsIHtcbiAgICAgIHZhbHVlOiB0aGlzLnRleHRyYWN0U2VydmljZVJvbGUucm9sZUFybixcbiAgICAgIGV4cG9ydE5hbWU6IGAke3B9cGRmLWNvbnZlcnNhdGlvbi10ZXh0cmFjdC1zZXJ2aWNlLXJvbGUtYXJuYCxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdDb252ZXJzYXRpb25GdW5jdGlvblJvbGVBcm4nLCB7XG4gICAgICB2YWx1ZTogdGhpcy5jb252ZXJzYXRpb25GdW5jdGlvblJvbGUucm9sZUFybixcbiAgICAgIGV4cG9ydE5hbWU6IGAke3B9cGRmLWNvbnZlcnNhdGlvbi1jb252ZXJzYXRpb24tZnVuY3Rpb24tcm9sZS1hcm5gLFxuICAgIH0pO1xuICB9XG59Il19