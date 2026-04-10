import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as iam from 'aws-cdk-lib/aws-iam';
import { EnvironmentConfig } from './environment-config';

export interface SecurityStackProps extends cdk.StackProps {
  readonly envConfig: EnvironmentConfig;
}

export class PdfConversationSecurityStack extends cdk.Stack {
  public readonly documentIngestionRole: iam.Role;
  public readonly textractProcessorRole: iam.Role;
  public readonly textractResultsProcessorRole: iam.Role;
  public readonly bedrockVectorizationRole: iam.Role;
  public readonly queryProcessingRole: iam.Role;
  public readonly textractServiceRole: iam.Role;
  public readonly conversationFunctionRole: iam.Role;
  public readonly usageFunctionRole: iam.Role;

  constructor(scope: Construct, id: string, props: SecurityStackProps) {
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