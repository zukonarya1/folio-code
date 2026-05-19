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
const cdk = __importStar(require("aws-cdk-lib"));
const assertions_1 = require("aws-cdk-lib/assertions");
const pdf_conversation_security_stack_1 = require("../lib/pdf-conversation-security-stack");
const pdf_conversation_infra_stack_1 = require("../lib/pdf-conversation-infra-stack");
const pdf_conversation_monitoring_stack_1 = require("../lib/pdf-conversation-monitoring-stack");
const pdf_conversation_auth_stack_1 = require("../lib/pdf-conversation-auth-stack");
const pdf_conversation_frontend_stack_1 = require("../lib/pdf-conversation-frontend-stack");
const pdf_conversation_dns_stack_1 = require("../lib/pdf-conversation-dns-stack");
const environment_config_1 = require("../lib/environment-config");
const ACCOUNT_ID = process.env.CDK_DEFAULT_ACCOUNT || '123456789012';
const REGION = 'us-west-2';
const ENV = { account: ACCOUNT_ID, region: REGION };
const prodEnvConfig = (0, environment_config_1.buildEnvironmentConfig)('prod');
function makeApp() {
    return new cdk.App({
        context: { 'aws:cdk:bundling-stacks': [] },
    });
}
function buildSecurityStack(app) {
    return new pdf_conversation_security_stack_1.PdfConversationSecurityStack(app, 'SecurityStack', {
        env: ENV,
        envConfig: prodEnvConfig,
    });
}
function buildInfraStack(app, security) {
    return new pdf_conversation_infra_stack_1.PdfConversationInfraStack(app, 'InfraStack', {
        env: ENV,
        documentIngestionRole: security.documentIngestionRole,
        textractProcessorRole: security.textractProcessorRole,
        textractResultsProcessorRole: security.textractResultsProcessorRole,
        bedrockVectorizationRole: security.bedrockVectorizationRole,
        queryProcessingRole: security.queryProcessingRole,
        conversationFunctionRole: security.conversationFunctionRole,
        usageFunctionRole: security.usageFunctionRole,
        envConfig: prodEnvConfig,
    });
}
function buildMonitoringStack(app, infra) {
    return new pdf_conversation_monitoring_stack_1.PdfConversationMonitoringStack(app, 'MonitoringStack', {
        env: ENV,
        documentIngestionFunction: infra.documentIngestionFunction,
        queryProcessingFunction: infra.queryProcessingFunction,
        studyBookFunction: infra.studyBookFunction,
        studyBookDlq: infra.studyBookDlq,
        textractResultsProcessorFunction: infra.textractResultsProcessorFunction,
        bedrockVectorizationFunction: infra.bedrockVectorizationFunction,
        conversationFunction: infra.conversationFunction,
        metadataTable: infra.metadataTable,
        queryLogsTable: infra.queryLogsTable,
        processingBucket: infra.processingBucket,
        vectorsJsonBucket: infra.vectorsJsonBucket,
        envConfig: prodEnvConfig,
    });
}
function buildAuthStack(app, infra) {
    return new pdf_conversation_auth_stack_1.PdfConversationAuthStack(app, 'AuthStack', {
        env: ENV,
        queryProcessingFunction: infra.queryProcessingFunction,
        documentIngestionFunction: infra.documentIngestionFunction,
        processingBucket: infra.processingBucket,
        metadataTableName: infra.metadataTable.tableName,
        conversationFunction: infra.conversationFunction,
        usageFunction: infra.usageFunction,
        envConfig: prodEnvConfig,
    });
}
// =============================================================================
// SecurityStack
// =============================================================================
describe('PdfConversationSecurityStack', () => {
    let template;
    beforeAll(() => {
        const app = makeApp();
        const stack = buildSecurityStack(app);
        template = assertions_1.Template.fromStack(stack);
    });
    test('creates exactly 8 IAM roles', () => {
        template.resourceCountIs('AWS::IAM::Role', 8);
    });
    test('TextractServiceRole has correct trust principal', () => {
        template.hasResourceProperties('AWS::IAM::Role', {
            RoleName: 'TextractServiceRole',
            AssumeRolePolicyDocument: assertions_1.Match.objectLike({
                Statement: assertions_1.Match.arrayWith([
                    assertions_1.Match.objectLike({
                        Principal: { Service: 'textract.amazonaws.com' },
                        Action: 'sts:AssumeRole',
                    }),
                ]),
            }),
        });
    });
    test('DocumentIngestionRole has correct role name', () => {
        template.hasResourceProperties('AWS::IAM::Role', {
            RoleName: 'DocumentIngestionFunction-role',
        });
    });
    test('BedrockVectorizationRole has correct role name', () => {
        template.hasResourceProperties('AWS::IAM::Role', {
            RoleName: 'BedrockToS3Vectorization-Lambda',
        });
    });
    test('QueryProcessingRole has correct role name', () => {
        template.hasResourceProperties('AWS::IAM::Role', {
            RoleName: 'QueryProcessingFunction-role',
        });
    });
    test('ConversationFunctionRole has correct role name', () => {
        template.hasResourceProperties('AWS::IAM::Role', {
            RoleName: 'ConversationFunction-role',
        });
    });
    test('TextractResultsProcessorRole has correct role name', () => {
        template.hasResourceProperties('AWS::IAM::Role', {
            RoleName: 'TextractResultsProcessorFunction-role',
        });
    });
    test('all Lambda roles use AWSLambdaBasicExecutionRole managed policy', () => {
        const lambdaRoleNames = [
            'DocumentIngestionFunction-role',
            'TextractProcessorFunction-role',
            'TextractResultsProcessorFunction-role',
            'BedrockToS3Vectorization-Lambda',
            'QueryProcessingFunction-role',
            'ConversationFunction-role',
        ];
        lambdaRoleNames.forEach((roleName) => {
            template.hasResourceProperties('AWS::IAM::Role', {
                RoleName: roleName,
                ManagedPolicyArns: assertions_1.Match.arrayWith([
                    assertions_1.Match.objectLike({
                        'Fn::Join': assertions_1.Match.arrayWith([
                            assertions_1.Match.arrayWith([
                                assertions_1.Match.stringLikeRegexp('AWSLambdaBasicExecutionRole'),
                            ]),
                        ]),
                    }),
                ]),
            });
        });
    });
    test('exports 7 role ARNs as CloudFormation outputs', () => {
        const outputs = template.findOutputs('*');
        const exportNames = Object.values(outputs)
            .map((o) => o.Export?.Name)
            .filter(Boolean);
        expect(exportNames).toContain('pdf-conversation-document-ingestion-role-arn');
        expect(exportNames).toContain('pdf-conversation-bedrock-vectorization-role-arn');
        expect(exportNames).toContain('pdf-conversation-query-processing-role-arn');
        expect(exportNames).toContain('pdf-conversation-textract-service-role-arn');
        expect(exportNames).toContain('pdf-conversation-conversation-function-role-arn');
    });
});
// =============================================================================
// InfraStack
// =============================================================================
describe('PdfConversationInfraStack', () => {
    let template;
    beforeAll(() => {
        const app = makeApp();
        const security = buildSecurityStack(app);
        const infra = buildInfraStack(app, security);
        template = assertions_1.Template.fromStack(infra);
    });
    test('creates 3 S3 buckets (processing, digests, vectors-json)', () => {
        template.resourceCountIs('AWS::S3::Bucket', 3);
    });
    test('processing bucket has S3_MANAGED encryption and blocks public access', () => {
        template.hasResourceProperties('AWS::S3::Bucket', {
            BucketName: `pdf-conversation-processing-${ACCOUNT_ID}`,
            BucketEncryption: {
                ServerSideEncryptionConfiguration: assertions_1.Match.arrayWith([
                    assertions_1.Match.objectLike({
                        ServerSideEncryptionByDefault: { SSEAlgorithm: 'AES256' },
                    }),
                ]),
            },
            PublicAccessBlockConfiguration: {
                BlockPublicAcls: true,
                BlockPublicPolicy: true,
                IgnorePublicAcls: true,
                RestrictPublicBuckets: true,
            },
        });
    });
    test('digests bucket has S3_MANAGED encryption', () => {
        template.hasResourceProperties('AWS::S3::Bucket', {
            BucketName: `pdf-conversation-digests-${ACCOUNT_ID}`,
            BucketEncryption: {
                ServerSideEncryptionConfiguration: assertions_1.Match.arrayWith([
                    assertions_1.Match.objectLike({
                        ServerSideEncryptionByDefault: { SSEAlgorithm: 'AES256' },
                    }),
                ]),
            },
        });
    });
    test('vectors-json bucket has S3_MANAGED encryption', () => {
        template.hasResourceProperties('AWS::S3::Bucket', {
            BucketName: `pdf-conversation-vectors-json-${ACCOUNT_ID}`,
        });
    });
    test('creates 4 DynamoDB tables', () => {
        template.resourceCountIs('AWS::DynamoDB::Table', 4);
    });
    test('metadata table has correct name and PAY_PER_REQUEST billing', () => {
        template.hasResourceProperties('AWS::DynamoDB::Table', {
            TableName: 'pdf-conversation-metadata',
            BillingMode: 'PAY_PER_REQUEST',
            KeySchema: assertions_1.Match.arrayWith([
                { AttributeName: 'document_id', KeyType: 'HASH' },
            ]),
        });
    });
    test('query-logs table has TTL attribute', () => {
        template.hasResourceProperties('AWS::DynamoDB::Table', {
            TableName: 'pdf-conversation-query-logs',
            TimeToLiveSpecification: { AttributeName: 'ttl', Enabled: true },
        });
    });
    test('conversations table has correct partition key', () => {
        template.hasResourceProperties('AWS::DynamoDB::Table', {
            TableName: 'pdf-conversation-conversations',
            KeySchema: assertions_1.Match.arrayWith([
                { AttributeName: 'conversation_id', KeyType: 'HASH' },
            ]),
        });
    });
    test('has folio-usage DynamoDB table with TTL', () => {
        template.hasResourceProperties('AWS::DynamoDB::Table', {
            TableName: 'folio-usage',
            TimeToLiveSpecification: { AttributeName: 'ttl', Enabled: true },
            KeySchema: assertions_1.Match.arrayWith([
                { AttributeName: 'user_id', KeyType: 'HASH' },
                { AttributeName: 'month_key', KeyType: 'RANGE' },
            ]),
        });
    });
    test('DocumentIngestionFunction has USAGE_TABLE env var', () => {
        template.hasResourceProperties('AWS::Lambda::Function', {
            FunctionName: 'DocumentIngestionFunction',
            Environment: {
                Variables: assertions_1.Match.objectLike({ USAGE_TABLE: assertions_1.Match.anyValue() }),
            },
        });
    });
    test('creates 2 SNS topics (textract-completion and vectorization-complete)', () => {
        template.resourceCountIs('AWS::SNS::Topic', 2);
    });
    test('textract-completion SNS topic exists', () => {
        template.hasResourceProperties('AWS::SNS::Topic', {
            TopicName: 'textract-completion',
        });
    });
    test('vectorization-complete SNS topic exists', () => {
        template.hasResourceProperties('AWS::SNS::Topic', {
            TopicName: 'vectorization-complete',
        });
    });
    test('StudyBookQueue SQS queue exists with correct visibility timeout', () => {
        template.hasResourceProperties('AWS::SQS::Queue', {
            QueueName: 'StudyBookQueue',
            VisibilityTimeout: 960,
        });
    });
    test('DocumentIngestionFunction has correct name and runtime', () => {
        template.hasResourceProperties('AWS::Lambda::Function', {
            FunctionName: 'DocumentIngestionFunction',
            Runtime: 'python3.13',
            Handler: 'index.lambda_handler',
            Timeout: 300,
            MemorySize: 512,
        });
    });
    test('TextractResultsProcessorFunction has correct name and timeout', () => {
        template.hasResourceProperties('AWS::Lambda::Function', {
            FunctionName: 'TextractResultsProcessorFunction',
            Runtime: 'python3.13',
            Timeout: 900,
            MemorySize: 1024,
        });
    });
    test('BedrockToS3Vectorization function exists', () => {
        template.hasResourceProperties('AWS::Lambda::Function', {
            FunctionName: 'BedrockToS3Vectorization',
            Runtime: 'python3.9',
        });
    });
    test('DocumentSearchFunction exists with correct configuration', () => {
        template.hasResourceProperties('AWS::Lambda::Function', {
            FunctionName: 'QueryProcessingFunction',
            Runtime: 'python3.13',
            Timeout: 30,
            MemorySize: 512,
            Environment: assertions_1.Match.objectLike({
                Variables: assertions_1.Match.objectLike({
                    MAX_RESULTS_LIMIT: '100',
                    S3_VECTORS_BUCKET: `pdf-conversation-vectors-${ACCOUNT_ID}`,
                    S3_VECTOR_INDEX_NAME: 'document-chunks-index',
                }),
            }),
        });
    });
    test('StudyBookFunction exists with correct configuration', () => {
        template.hasResourceProperties('AWS::Lambda::Function', {
            FunctionName: 'StudyBookFunction',
            Runtime: 'python3.13',
            Timeout: 900,
            MemorySize: 1024,
            Environment: assertions_1.Match.objectLike({
                Variables: assertions_1.Match.objectLike({
                    HAIKU_MODEL_ID: 'us.anthropic.claude-haiku-4-5-20251001-v1:0',
                    CHUNKS_PER_GROUP: '10',
                }),
            }),
        });
    });
    test('ConversationFunction exists with correct name', () => {
        template.hasResourceProperties('AWS::Lambda::Function', {
            FunctionName: 'ConversationFunction',
            Runtime: 'python3.9',
        });
    });
    test('exports processing bucket name', () => {
        const outputs = template.findOutputs('*');
        const exportNames = Object.values(outputs)
            .map((o) => o.Export?.Name)
            .filter(Boolean);
        expect(exportNames).toContain('pdf-conversation-processing-bucket');
    });
    test('exports metadata table name', () => {
        const outputs = template.findOutputs('*');
        const exportNames = Object.values(outputs)
            .map((o) => o.Export?.Name)
            .filter(Boolean);
        expect(exportNames).toContain('pdf-conversation-metadata-table');
    });
});
// =============================================================================
// MonitoringStack
// =============================================================================
describe('PdfConversationMonitoringStack', () => {
    let template;
    beforeAll(() => {
        const app = makeApp();
        const security = buildSecurityStack(app);
        const infra = buildInfraStack(app, security);
        buildMonitoringStack(app, infra);
        template = assertions_1.Template.fromStack(app.node.findChild('MonitoringStack'));
    });
    test('creates CloudWatch dashboard named PDF-Conversation-System-Overview', () => {
        template.hasResourceProperties('AWS::CloudWatch::Dashboard', {
            DashboardName: 'PDF-Conversation-System-Overview',
        });
    });
    test('creates exactly 1 CloudWatch dashboard', () => {
        template.resourceCountIs('AWS::CloudWatch::Dashboard', 1);
    });
    test('creates system-alerts SNS topic', () => {
        template.hasResourceProperties('AWS::SNS::Topic', {
            TopicName: 'pdf-conversation-system-alerts',
        });
    });
    test('creates CloudWatch alarms for Lambda functions', () => {
        const alarms = template.findResources('AWS::CloudWatch::Alarm');
        expect(Object.keys(alarms).length).toBeGreaterThanOrEqual(11);
    });
    test('DocumentIngestion high-error-rate alarm exists', () => {
        template.hasResourceProperties('AWS::CloudWatch::Alarm', {
            AlarmName: 'PDF-Conversation-DocumentIngestion-HighErrorRate',
            Threshold: 5,
            EvaluationPeriods: 2,
        });
    });
    test('DocumentSearch high-duration alarm exists', () => {
        template.hasResourceProperties('AWS::CloudWatch::Alarm', {
            AlarmName: 'PDF-Conversation-DocumentSearch-HighDuration',
        });
    });
    test('StudyBook DLQ depth alarm exists', () => {
        template.hasResourceProperties('AWS::CloudWatch::Alarm', {
            AlarmName: 'PDF-Conversation-StudyBook-DLQ-Depth',
            Threshold: 1,
            EvaluationPeriods: 1,
        });
    });
    test('DynamoDB read-throttling alarms exist for both tables', () => {
        template.hasResourceProperties('AWS::CloudWatch::Alarm', {
            AlarmName: 'PDF-Conversation-Metadata-ReadThrottling',
        });
        template.hasResourceProperties('AWS::CloudWatch::Alarm', {
            AlarmName: 'PDF-Conversation-QueryLogs-ReadThrottling',
        });
    });
    test('outputs dashboard URL', () => {
        const outputs = template.findOutputs('DashboardURL');
        expect(Object.keys(outputs).length).toBe(1);
    });
    test('has error alarm for ConversationFunction', () => {
        template.hasResourceProperties('AWS::CloudWatch::Alarm', {
            AlarmName: assertions_1.Match.stringLikeRegexp('ConversationFunction.*HighErrorRate'),
            Namespace: 'AWS/Lambda',
            MetricName: 'Errors',
        });
    });
});
// =============================================================================
// AuthStack
// =============================================================================
describe('PdfConversationAuthStack', () => {
    let template;
    beforeAll(() => {
        const app = makeApp();
        const security = buildSecurityStack(app);
        const infra = buildInfraStack(app, security);
        buildAuthStack(app, infra);
        template = assertions_1.Template.fromStack(app.node.findChild('AuthStack'));
    });
    test('creates 1 Cognito user pool', () => {
        template.resourceCountIs('AWS::Cognito::UserPool', 1);
    });
    test('user pool has correct name and self-sign-up enabled', () => {
        template.hasResourceProperties('AWS::Cognito::UserPool', {
            UserPoolName: 'pdf-conversation-users',
            AdminCreateUserConfig: { AllowAdminCreateUserOnly: false },
        });
    });
    test('user pool client exists', () => {
        template.resourceCountIs('AWS::Cognito::UserPoolClient', 1);
    });
    test('identity pool allows only authenticated identities', () => {
        template.hasResourceProperties('AWS::Cognito::IdentityPool', {
            IdentityPoolName: 'pdf_conversation_identity_pool',
            AllowUnauthenticatedIdentities: false,
        });
    });
    test('creates 1 REST API Gateway', () => {
        template.resourceCountIs('AWS::ApiGateway::RestApi', 1);
    });
    test('API Gateway has correct name', () => {
        template.hasResourceProperties('AWS::ApiGateway::RestApi', {
            Name: 'PDF Conversation API',
        });
    });
    test('API Gateway deployment stage is v1', () => {
        template.hasResourceProperties('AWS::ApiGateway::Stage', {
            StageName: 'v1',
        });
    });
    test('ListDocuments Lambda function exists with correct name', () => {
        template.hasResourceProperties('AWS::Lambda::Function', {
            FunctionName: 'ListDocuments',
            Runtime: 'python3.9',
        });
    });
    test('GeneratePresignedUrl Lambda function exists', () => {
        template.hasResourceProperties('AWS::Lambda::Function', {
            FunctionName: 'GeneratePresignedUrl',
            Runtime: 'python3.9',
        });
    });
    test('GetDocumentSummary Lambda function exists', () => {
        template.hasResourceProperties('AWS::Lambda::Function', {
            FunctionName: 'GetDocumentSummary',
            Runtime: 'python3.9',
        });
    });
    test('Cognito authorizer is attached', () => {
        template.resourceCountIs('AWS::ApiGateway::Authorizer', 1);
        template.hasResourceProperties('AWS::ApiGateway::Authorizer', {
            Name: 'CognitoAuthorizer',
            Type: 'COGNITO_USER_POOLS',
        });
    });
    test('exports user pool ID and client ID', () => {
        const outputs = template.findOutputs('*');
        const exportNames = Object.values(outputs)
            .map((o) => o.Export?.Name)
            .filter(Boolean);
        expect(exportNames).toContain('PdfConversation-UserPoolId');
        expect(exportNames).toContain('PdfConversation-UserPoolClientId');
        expect(exportNames).toContain('PdfConversation-IdentityPoolId');
        expect(exportNames).toContain('PdfConversation-ApiEndpoint');
    });
    test('UserPoolDomain resource exists with folio prefix for prod', () => {
        template.hasResourceProperties('AWS::Cognito::UserPoolDomain', {
            Domain: 'folio',
        });
    });
    test('Google Identity Provider resource exists', () => {
        template.resourceCountIs('AWS::Cognito::UserPoolIdentityProvider', 1);
        template.hasResourceProperties('AWS::Cognito::UserPoolIdentityProvider', {
            ProviderName: 'Google',
            ProviderType: 'Google',
            AttributeMapping: assertions_1.Match.objectLike({
                email: 'email',
                given_name: 'given_name',
                family_name: 'family_name',
                name: 'name',
            }),
        });
    });
    test('PreSignUp Lambda function exists', () => {
        template.hasResourceProperties('AWS::Lambda::Function', {
            FunctionName: 'PreSignUpTrigger',
            Runtime: 'python3.9',
        });
    });
    test('Custom Message Lambda function exists', () => {
        template.hasResourceProperties('AWS::Lambda::Function', {
            FunctionName: 'CustomMessageTrigger',
            Runtime: 'python3.9',
        });
    });
    test('UserPoolClient has COGNITO and Google in SupportedIdentityProviders', () => {
        template.hasResourceProperties('AWS::Cognito::UserPoolClient', {
            SupportedIdentityProviders: assertions_1.Match.arrayWith(['COGNITO', 'Google']),
        });
    });
    test('UserPoolDomain CfnOutput exists with correct export name', () => {
        const outputs = template.findOutputs('*');
        const exportNames = Object.values(outputs)
            .map((o) => o.Export?.Name)
            .filter(Boolean);
        expect(exportNames).toContain('PdfConversation-UserPoolDomain');
    });
    test('UserPool lambdaConfig references PreSignUp and CustomMessage triggers', () => {
        template.hasResourceProperties('AWS::Cognito::UserPool', {
            LambdaConfig: assertions_1.Match.objectLike({
                PreSignUp: assertions_1.Match.anyValue(),
                CustomMessage: assertions_1.Match.anyValue(),
            }),
        });
    });
    test('user pool schema includes mutable name attribute', () => {
        template.hasResourceProperties('AWS::Cognito::UserPool', {
            Schema: assertions_1.Match.arrayWith([
                assertions_1.Match.objectLike({ Name: 'name', Mutable: true, Required: false }),
            ]),
        });
    });
    test('DeleteAccount Lambda function exists', () => {
        template.hasResourceProperties('AWS::Lambda::Function', {
            FunctionName: 'DeleteAccount',
            Runtime: 'python3.9',
        });
    });
    test('UserPool has custom:role attribute', () => {
        template.hasResourceProperties('AWS::Cognito::UserPool', {
            Schema: assertions_1.Match.arrayWith([
                assertions_1.Match.objectLike({
                    AttributeDataType: 'String',
                    Name: 'role',
                    Mutable: true,
                }),
            ]),
        });
    });
    test('has GET /users/me/usage API route', () => {
        template.hasResourceProperties('AWS::ApiGateway::Resource', {
            PathPart: 'usage',
        });
    });
});
// =============================================================================
// FrontendStack
// =============================================================================
describe('PdfConversationFrontendStack', () => {
    let template;
    beforeAll(() => {
        const app = makeApp();
        new pdf_conversation_frontend_stack_1.PdfConversationFrontendStack(app, 'FrontendStack', { env: ENV });
        template = assertions_1.Template.fromStack(app.node.findChild('FrontendStack'));
    });
    test('creates exactly 1 S3 bucket', () => {
        template.resourceCountIs('AWS::S3::Bucket', 1);
    });
    test('frontend bucket has correct name and S3_MANAGED encryption', () => {
        template.hasResourceProperties('AWS::S3::Bucket', {
            BucketName: `pdf-conversation-frontend-${ACCOUNT_ID}`,
            BucketEncryption: {
                ServerSideEncryptionConfiguration: assertions_1.Match.arrayWith([
                    assertions_1.Match.objectLike({
                        ServerSideEncryptionByDefault: { SSEAlgorithm: 'AES256' },
                    }),
                ]),
            },
            PublicAccessBlockConfiguration: {
                BlockPublicAcls: true,
                BlockPublicPolicy: true,
                IgnorePublicAcls: true,
                RestrictPublicBuckets: true,
            },
        });
    });
    test('creates exactly 1 CloudFront distribution', () => {
        template.resourceCountIs('AWS::CloudFront::Distribution', 1);
    });
    test('CloudFront distribution redirects HTTP to HTTPS', () => {
        template.hasResourceProperties('AWS::CloudFront::Distribution', {
            DistributionConfig: assertions_1.Match.objectLike({
                DefaultCacheBehavior: assertions_1.Match.objectLike({
                    ViewerProtocolPolicy: 'redirect-to-https',
                }),
                DefaultRootObject: 'index.html',
                PriceClass: 'PriceClass_100',
            }),
        });
    });
    test('CloudFront has SPA error responses for 403 and 404', () => {
        template.hasResourceProperties('AWS::CloudFront::Distribution', {
            DistributionConfig: assertions_1.Match.objectLike({
                CustomErrorResponses: assertions_1.Match.arrayWith([
                    assertions_1.Match.objectLike({ ErrorCode: 403, ResponseCode: 200, ResponsePagePath: '/index.html' }),
                    assertions_1.Match.objectLike({ ErrorCode: 404, ResponseCode: 200, ResponsePagePath: '/index.html' }),
                ]),
            }),
        });
    });
    test('S3 Origin Access Control is created', () => {
        template.resourceCountIs('AWS::CloudFront::OriginAccessControl', 1);
    });
    test('outputs CloudFront domain name', () => {
        const outputs = template.findOutputs('CloudFrontDomainName');
        expect(Object.keys(outputs).length).toBe(1);
    });
});
describe('PdfConversationFrontendStack with domain', () => {
    let domainTemplate;
    beforeAll(() => {
        const app = makeApp();
        new pdf_conversation_frontend_stack_1.PdfConversationFrontendStack(app, 'FrontendStackWithDomain', {
            env: ENV,
            domainName: 'folio.zukonarya.com',
            ssmEnvName: 'prod',
            envConfig: prodEnvConfig,
        });
        domainTemplate = assertions_1.Template.fromStack(app.node.findChild('FrontendStackWithDomain'));
    });
    test('CloudFront distribution has custom domain alias', () => {
        domainTemplate.hasResourceProperties('AWS::CloudFront::Distribution', {
            DistributionConfig: assertions_1.Match.objectLike({
                Aliases: ['folio.zukonarya.com'],
            }),
        });
    });
    test('Route53 ARecord is created', () => {
        domainTemplate.resourceCountIs('AWS::Route53::RecordSet', 1);
    });
});
// =============================================================================
// DnsStack
// =============================================================================
describe('PdfConversationDnsStack', () => {
    let template;
    beforeAll(() => {
        const app = makeApp();
        new pdf_conversation_dns_stack_1.PdfConversationDnsStack(app, 'DnsStack', {
            env: { account: ACCOUNT_ID, region: 'us-east-1' },
            domainName: 'folio.zukonarya.com',
            envName: 'prod',
        });
        template = assertions_1.Template.fromStack(app.node.findChild('DnsStack'));
    });
    test('creates 1 Route53 hosted zone for folio.zukonarya.com', () => {
        template.resourceCountIs('AWS::Route53::HostedZone', 1);
        template.hasResourceProperties('AWS::Route53::HostedZone', {
            Name: 'folio.zukonarya.com.',
        });
    });
    test('creates 1 ACM certificate', () => {
        template.resourceCountIs('AWS::CertificateManager::Certificate', 1);
        template.hasResourceProperties('AWS::CertificateManager::Certificate', {
            DomainName: 'folio.zukonarya.com',
            ValidationMethod: 'DNS',
        });
    });
    test('outputs hosted zone ID, name servers, and certificate ARN', () => {
        const outputs = template.findOutputs('*');
        expect(outputs).toHaveProperty('SubdomainHostedZoneId');
        expect(outputs).toHaveProperty('SubdomainNameServers');
        expect(outputs).toHaveProperty('AcmCertificateArn');
    });
    test('creates AwsCustomResource Lambda-backed custom resources for SSM writes', () => {
        template.resourceCountIs('Custom::AWS', 2);
    });
    test('AwsCustomResource IAM role has SSM write permissions to us-west-2', () => {
        template.hasResourceProperties('AWS::IAM::Policy', {
            PolicyDocument: assertions_1.Match.objectLike({
                Statement: assertions_1.Match.arrayWith([
                    assertions_1.Match.objectLike({
                        Action: assertions_1.Match.arrayWith(['ssm:PutParameter', 'ssm:DeleteParameter']),
                        Resource: assertions_1.Match.stringLikeRegexp('arn:aws:ssm:us-west-2.*pdfconv'),
                    }),
                ]),
            }),
        });
    });
});
// =============================================================================
// Prod environment: unprefixed resource names
// =============================================================================
describe('Prod environment resource names', () => {
    test('DynamoDB table names are unprefixed (no stack name prefix)', () => {
        const app = makeApp();
        const security = buildSecurityStack(app);
        const infra = buildInfraStack(app, security);
        const template = assertions_1.Template.fromStack(infra);
        template.hasResourceProperties('AWS::DynamoDB::Table', {
            TableName: 'pdf-conversation-metadata',
        });
        template.hasResourceProperties('AWS::DynamoDB::Table', {
            TableName: 'pdf-conversation-query-logs',
        });
        template.hasResourceProperties('AWS::DynamoDB::Table', {
            TableName: 'pdf-conversation-conversations',
        });
    });
    test('Lambda function names are unprefixed', () => {
        const app = makeApp();
        const security = buildSecurityStack(app);
        const infra = buildInfraStack(app, security);
        const template = assertions_1.Template.fromStack(infra);
        const expectedNames = [
            'DocumentIngestionFunction',
            'TextractResultsProcessorFunction',
            'BedrockToS3Vectorization',
            'QueryProcessingFunction',
            'ConversationFunction',
        ];
        expectedNames.forEach((name) => {
            template.hasResourceProperties('AWS::Lambda::Function', { FunctionName: name });
        });
    });
    test('IAM role names are unprefixed', () => {
        const app = makeApp();
        const security = buildSecurityStack(app);
        const template = assertions_1.Template.fromStack(security);
        const expectedRoleNames = [
            'TextractServiceRole',
            'DocumentIngestionFunction-role',
            'TextractResultsProcessorFunction-role',
            'BedrockToS3Vectorization-Lambda',
            'QueryProcessingFunction-role',
            'ConversationFunction-role',
        ];
        expectedRoleNames.forEach((roleName) => {
            template.hasResourceProperties('AWS::IAM::Role', { RoleName: roleName });
        });
    });
    test('S3 bucket names include account ID suffix (not stack-generated)', () => {
        const app = makeApp();
        const security = buildSecurityStack(app);
        const infra = buildInfraStack(app, security);
        const template = assertions_1.Template.fromStack(infra);
        template.hasResourceProperties('AWS::S3::Bucket', {
            BucketName: `pdf-conversation-processing-${ACCOUNT_ID}`,
        });
        template.hasResourceProperties('AWS::S3::Bucket', {
            BucketName: `pdf-conversation-digests-${ACCOUNT_ID}`,
        });
        template.hasResourceProperties('AWS::S3::Bucket', {
            BucketName: `pdf-conversation-vectors-json-${ACCOUNT_ID}`,
        });
    });
    test('QueryProcessingRole has cross-region foundation model statement for Haiku inference profile', () => {
        const app = makeApp();
        const security = buildSecurityStack(app);
        const template = assertions_1.Template.fromStack(security);
        template.hasResourceProperties('AWS::IAM::Role', {
            RoleName: 'QueryProcessingFunction-role',
            Policies: assertions_1.Match.arrayWith([
                assertions_1.Match.objectLike({
                    PolicyName: 'QueryProcessingPolicy',
                    PolicyDocument: assertions_1.Match.objectLike({
                        Statement: assertions_1.Match.arrayWith([
                            assertions_1.Match.objectLike({
                                Effect: 'Allow',
                                Action: 'bedrock:InvokeModel',
                                Resource: [
                                    `arn:aws:bedrock:us-east-1::foundation-model/anthropic.claude-haiku-4-5-20251001-v1:0`,
                                    `arn:aws:bedrock:us-east-2::foundation-model/anthropic.claude-haiku-4-5-20251001-v1:0`,
                                    `arn:aws:bedrock:us-west-2::foundation-model/anthropic.claude-haiku-4-5-20251001-v1:0`,
                                ],
                                Condition: {
                                    StringEquals: {
                                        'bedrock:InferenceProfileArn': `arn:aws:bedrock:us-west-2:${ACCOUNT_ID}:inference-profile/us.anthropic.claude-haiku-4-5-20251001-v1:0`,
                                    },
                                },
                            }),
                        ]),
                    }),
                }),
            ]),
        });
    });
    test('ConversationFunctionRole has cross-region foundation model statement for Haiku inference profile', () => {
        const app = makeApp();
        const security = buildSecurityStack(app);
        const template = assertions_1.Template.fromStack(security);
        template.hasResourceProperties('AWS::IAM::Role', {
            RoleName: 'ConversationFunction-role',
            Policies: assertions_1.Match.arrayWith([
                assertions_1.Match.objectLike({
                    PolicyName: 'ConversationFunctionPolicy',
                    PolicyDocument: assertions_1.Match.objectLike({
                        Statement: assertions_1.Match.arrayWith([
                            assertions_1.Match.objectLike({
                                Effect: 'Allow',
                                Action: 'bedrock:InvokeModel',
                                Resource: [
                                    `arn:aws:bedrock:us-east-1::foundation-model/anthropic.claude-haiku-4-5-20251001-v1:0`,
                                    `arn:aws:bedrock:us-east-2::foundation-model/anthropic.claude-haiku-4-5-20251001-v1:0`,
                                    `arn:aws:bedrock:us-west-2::foundation-model/anthropic.claude-haiku-4-5-20251001-v1:0`,
                                ],
                                Condition: {
                                    StringEquals: {
                                        'bedrock:InferenceProfileArn': `arn:aws:bedrock:us-west-2:${ACCOUNT_ID}:inference-profile/us.anthropic.claude-haiku-4-5-20251001-v1:0`,
                                    },
                                },
                            }),
                        ]),
                    }),
                }),
            ]),
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2RrLnRlc3QuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJjZGsudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUEsaURBQW1DO0FBQ25DLHVEQUF5RDtBQUN6RCw0RkFBc0Y7QUFDdEYsc0ZBQWdGO0FBQ2hGLGdHQUEwRjtBQUMxRixvRkFBOEU7QUFDOUUsNEZBQXNGO0FBQ3RGLGtGQUE0RTtBQUM1RSxrRUFBbUU7QUFFbkUsTUFBTSxVQUFVLEdBQUcsT0FBTyxDQUFDLEdBQUcsQ0FBQyxtQkFBbUIsSUFBSSxjQUFjLENBQUM7QUFDckUsTUFBTSxNQUFNLEdBQUcsV0FBVyxDQUFDO0FBQzNCLE1BQU0sR0FBRyxHQUFHLEVBQUUsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLEVBQUUsTUFBTSxFQUFFLENBQUM7QUFDcEQsTUFBTSxhQUFhLEdBQUcsSUFBQSwyQ0FBc0IsRUFBQyxNQUFNLENBQUMsQ0FBQztBQUVyRCxTQUFTLE9BQU87SUFDZCxPQUFPLElBQUksR0FBRyxDQUFDLEdBQUcsQ0FBQztRQUNqQixPQUFPLEVBQUUsRUFBRSx5QkFBeUIsRUFBRSxFQUFFLEVBQUU7S0FDM0MsQ0FBQyxDQUFDO0FBQ0wsQ0FBQztBQUVELFNBQVMsa0JBQWtCLENBQUMsR0FBWTtJQUN0QyxPQUFPLElBQUksOERBQTRCLENBQUMsR0FBRyxFQUFFLGVBQWUsRUFBRTtRQUM1RCxHQUFHLEVBQUUsR0FBRztRQUNSLFNBQVMsRUFBRSxhQUFhO0tBQ3pCLENBQUMsQ0FBQztBQUNMLENBQUM7QUFFRCxTQUFTLGVBQWUsQ0FBQyxHQUFZLEVBQUUsUUFBc0M7SUFDM0UsT0FBTyxJQUFJLHdEQUF5QixDQUFDLEdBQUcsRUFBRSxZQUFZLEVBQUU7UUFDdEQsR0FBRyxFQUFFLEdBQUc7UUFDUixxQkFBcUIsRUFBRSxRQUFRLENBQUMscUJBQXFCO1FBQ3JELHFCQUFxQixFQUFFLFFBQVEsQ0FBQyxxQkFBcUI7UUFDckQs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QUFTLENBQUM7Z0JBQ3hCLGtCQUFLLENBQUMsVUFBVSxDQUFDO29CQUNmLFVBQVUsRUFBRSw0QkFBNEI7b0JBQ3hDLGNBQWMsRUFBRSxrQkFBSyxDQUFDLFVBQVUsQ0FBQzt3QkFDL0IsU0FBUyxFQUFFLGtCQUFLLENBQUMsU0FBUyxDQUFDOzRCQUN6QixrQkFBSyxDQUFDLFVBQVUsQ0FBQztnQ0FDZixNQUFNLEVBQUUsT0FBTztnQ0FDZixNQUFNLEVBQUUscUJBQXFCO2dDQUM3QixRQUFRLEVBQUU7b0NBQ1Isc0ZBQXNGO29DQUN0RixzRkFBc0Y7b0NBQ3RGLHNGQUFzRjtpQ0FDdkY7Z0NBQ0QsU0FBUyxFQUFFO29DQUNULFlBQVksRUFBRTt3Q0FDWiw2QkFBNkIsRUFBRSw2QkFBNkIsVUFBVSxnRUFBZ0U7cUNBQ3ZJO2lDQUNGOzZCQUNGLENBQUM7eUJBQ0gsQ0FBQztxQkFDSCxDQUFDO2lCQUNILENBQUM7YUFDSCxDQUFDO1NBQ0gsQ0FBQyxDQUFDO0lBQ0wsQ0FBQyxDQUFDLENBQUM7QUFFTCxDQUFDLENBQUMsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIGNkayBmcm9tICdhd3MtY2RrLWxpYic7XG5pbXBvcnQgeyBUZW1wbGF0ZSwgTWF0Y2ggfSBmcm9tICdhd3MtY2RrLWxpYi9hc3NlcnRpb25zJztcbmltcG9ydCB7IFBkZkNvbnZlcnNhdGlvblNlY3VyaXR5U3RhY2sgfSBmcm9tICcuLi9saWIvcGRmLWNvbnZlcnNhdGlvbi1zZWN1cml0eS1zdGFjayc7XG5pbXBvcnQgeyBQZGZDb252ZXJzYXRpb25JbmZyYVN0YWNrIH0gZnJvbSAnLi4vbGliL3BkZi1jb252ZXJzYXRpb24taW5mcmEtc3RhY2snO1xuaW1wb3J0IHsgUGRmQ29udmVyc2F0aW9uTW9uaXRvcmluZ1N0YWNrIH0gZnJvbSAnLi4vbGliL3BkZi1jb252ZXJzYXRpb24tbW9uaXRvcmluZy1zdGFjayc7XG5pbXBvcnQgeyBQZGZDb252ZXJzYXRpb25BdXRoU3RhY2sgfSBmcm9tICcuLi9saWIvcGRmLWNvbnZlcnNhdGlvbi1hdXRoLXN0YWNrJztcbmltcG9ydCB7IFBkZkNvbnZlcnNhdGlvbkZyb250ZW5kU3RhY2sgfSBmcm9tICcuLi9saWIvcGRmLWNvbnZlcnNhdGlvbi1mcm9udGVuZC1zdGFjayc7XG5pbXBvcnQgeyBQZGZDb252ZXJzYXRpb25EbnNTdGFjayB9IGZyb20gJy4uL2xpYi9wZGYtY29udmVyc2F0aW9uLWRucy1zdGFjayc7XG5pbXBvcnQgeyBidWlsZEVudmlyb25tZW50Q29uZmlnIH0gZnJvbSAnLi4vbGliL2Vudmlyb25tZW50LWNvbmZpZyc7XG5cbmNvbnN0IEFDQ09VTlRfSUQgPSBwcm9jZXNzLmVudi5DREtfREVGQVVMVF9BQ0NPVU5UIHx8ICcxMjM0NTY3ODkwMTInO1xuY29uc3QgUkVHSU9OID0gJ3VzLXdlc3QtMic7XG5jb25zdCBFTlYgPSB7IGFjY291bnQ6IEFDQ09VTlRfSUQsIHJlZ2lvbjogUkVHSU9OIH07XG5jb25zdCBwcm9kRW52Q29uZmlnID0gYnVpbGRFbnZpcm9ubWVudENvbmZpZygncHJvZCcpO1xuXG5mdW5jdGlvbiBtYWtlQXBwKCk6IGNkay5BcHAge1xuICByZXR1cm4gbmV3IGNkay5BcHAoe1xuICAgIGNvbnRleHQ6IHsgJ2F3czpjZGs6YnVuZGxpbmctc3RhY2tzJzogW10gfSxcbiAgfSk7XG59XG5cbmZ1bmN0aW9uIGJ1aWxkU2VjdXJpdHlTdGFjayhhcHA6IGNkay5BcHApOiBQZGZDb252ZXJzYXRpb25TZWN1cml0eVN0YWNrIHtcbiAgcmV0dXJuIG5ldyBQZGZDb252ZXJzYXRpb25TZWN1cml0eVN0YWNrKGFwcCwgJ1NlY3VyaXR5U3RhY2snLCB7XG4gICAgZW52OiBFTlYsXG4gICAgZW52Q29uZmlnOiBwcm9kRW52Q29uZmlnLFxuICB9KTtcbn1cblxuZnVuY3Rpb24gYnVpbGRJbmZyYVN0YWNrKGFwcDogY2RrLkFwcCwgc2VjdXJpdHk6IFBkZkNvbnZlcnNhdGlvblNlY3VyaXR5U3RhY2spOiBQZGZDb252ZXJzYXRpb25JbmZyYVN0YWNrIHtcbiAgcmV0dXJuIG5ldyBQZGZDb252ZXJzYXRpb25JbmZyYVN0YWNrKGFwcCwgJ0luZnJhU3RhY2snLCB7XG4gICAgZW52OiBFTlYsXG4gICAgZG9jdW1lbnRJbmdlc3Rpb25Sb2xlOiBzZWN1cml0eS5kb2N1bWVudEluZ2VzdGlvblJvbGUsXG4gICAgdGV4dHJhY3RQcm9jZXNzb3JSb2xlOiBzZWN1cml0eS50ZXh0cmFjdFByb2Nlc3NvclJvbGUsXG4gICAgdGV4dHJhY3RSZXN1bHRzUHJvY2Vzc29yUm9sZTogc2VjdXJpdHkudGV4dHJhY3RSZXN1bHRzUHJvY2Vzc29yUm9sZSxcbiAgICBiZWRyb2NrVmVjdG9yaXphdGlvblJvbGU6IHNlY3VyaXR5LmJlZHJvY2tWZWN0b3JpemF0aW9uUm9sZSxcbiAgICBxdWVyeVByb2Nlc3NpbmdSb2xlOiBzZWN1cml0eS5xdWVyeVByb2Nlc3NpbmdSb2xlLFxuICAgIGNvbnZlcnNhdGlvbkZ1bmN0aW9uUm9sZTogc2VjdXJpdHkuY29udmVyc2F0aW9uRnVuY3Rpb25Sb2xlLFxuICAgIHVzYWdlRnVuY3Rpb25Sb2xlOiBzZWN1cml0eS51c2FnZUZ1bmN0aW9uUm9sZSxcbiAgICBlbnZDb25maWc6IHByb2RFbnZDb25maWcsXG4gIH0pO1xufVxuXG5mdW5jdGlvbiBidWlsZE1vbml0b3JpbmdTdGFjayhhcHA6IGNkay5BcHAsIGluZnJhOiBQZGZDb252ZXJzYXRpb25JbmZyYVN0YWNrKTogUGRmQ29udmVyc2F0aW9uTW9uaXRvcmluZ1N0YWNrIHtcbiAgcmV0dXJuIG5ldyBQZGZDb252ZXJzYXRpb25Nb25pdG9yaW5nU3RhY2soYXBwLCAnTW9uaXRvcmluZ1N0YWNrJywge1xuICAgIGVudjogRU5WLFxuICAgIGRvY3VtZW50SW5nZXN0aW9uRnVuY3Rpb246IGluZnJhLmRvY3VtZW50SW5nZXN0aW9uRnVuY3Rpb24sXG4gICAgcXVlcnlQcm9jZXNzaW5nRnVuY3Rpb246IGluZnJhLnF1ZXJ5UHJvY2Vzc2luZ0Z1bmN0aW9uLFxuICAgIHN0dWR5Qm9va0Z1bmN0aW9uOiBpbmZyYS5zdHVkeUJvb2tGdW5jdGlvbixcbiAgICBzdHVkeUJvb2tEbHE6IGluZnJhLnN0dWR5Qm9va0RscSxcbiAgICB0ZXh0cmFjdFJlc3VsdHNQcm9jZXNzb3JGdW5jdGlvbjogaW5mcmEudGV4dHJhY3RSZXN1bHRzUHJvY2Vzc29yRnVuY3Rpb24sXG4gICAgYmVkcm9ja1ZlY3Rvcml6YXRpb25GdW5jdGlvbjogaW5mcmEuYmVkcm9ja1ZlY3Rvcml6YXRpb25GdW5jdGlvbixcbiAgICBjb252ZXJzYXRpb25GdW5jdGlvbjogaW5mcmEuY29udmVyc2F0aW9uRnVuY3Rpb24sXG4gICAgbWV0YWRhdGFUYWJsZTogaW5mcmEubWV0YWRhdGFUYWJsZSxcbiAgICBxdWVyeUxvZ3NUYWJsZTogaW5mcmEucXVlcnlMb2dzVGFibGUsXG4gICAgcHJvY2Vzc2luZ0J1Y2tldDogaW5mcmEucHJvY2Vzc2luZ0J1Y2tldCxcbiAgICB2ZWN0b3JzSnNvbkJ1Y2tldDogaW5mcmEudmVjdG9yc0pzb25CdWNrZXQsXG4gICAgZW52Q29uZmlnOiBwcm9kRW52Q29uZmlnLFxuICB9KTtcbn1cblxuZnVuY3Rpb24gYnVpbGRBdXRoU3RhY2soYXBwOiBjZGsuQXBwLCBpbmZyYTogUGRmQ29udmVyc2F0aW9uSW5mcmFTdGFjayk6IFBkZkNvbnZlcnNhdGlvbkF1dGhTdGFjayB7XG4gIHJldHVybiBuZXcgUGRmQ29udmVyc2F0aW9uQXV0aFN0YWNrKGFwcCwgJ0F1dGhTdGFjaycsIHtcbiAgICBlbnY6IEVOVixcbiAgICBxdWVyeVByb2Nlc3NpbmdGdW5jdGlvbjogaW5mcmEucXVlcnlQcm9jZXNzaW5nRnVuY3Rpb24sXG4gICAgZG9jdW1lbnRJbmdlc3Rpb25GdW5jdGlvbjogaW5mcmEuZG9jdW1lbnRJbmdlc3Rpb25GdW5jdGlvbixcbiAgICBwcm9jZXNzaW5nQnVja2V0OiBpbmZyYS5wcm9jZXNzaW5nQnVja2V0LFxuICAgIG1ldGFkYXRhVGFibGVOYW1lOiBpbmZyYS5tZXRhZGF0YVRhYmxlLnRhYmxlTmFtZSxcbiAgICBjb252ZXJzYXRpb25GdW5jdGlvbjogaW5mcmEuY29udmVyc2F0aW9uRnVuY3Rpb24sXG4gICAgdXNhZ2VGdW5jdGlvbjogaW5mcmEudXNhZ2VGdW5jdGlvbixcbiAgICBlbnZDb25maWc6IHByb2RFbnZDb25maWcsXG4gIH0pO1xufVxuXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuLy8gU2VjdXJpdHlTdGFja1xuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuZGVzY3JpYmUoJ1BkZkNvbnZlcnNhdGlvblNlY3VyaXR5U3RhY2snLCAoKSA9PiB7XG4gIGxldCB0ZW1wbGF0ZTogVGVtcGxhdGU7XG5cbiAgYmVmb3JlQWxsKCgpID0+IHtcbiAgICBjb25zdCBhcHAgPSBtYWtlQXBwKCk7XG4gICAgY29uc3Qgc3RhY2sgPSBidWlsZFNlY3VyaXR5U3RhY2soYXBwKTtcbiAgICB0ZW1wbGF0ZSA9IFRlbXBsYXRlLmZyb21TdGFjayhzdGFjayk7XG4gIH0pO1xuXG4gIHRlc3QoJ2NyZWF0ZXMgZXhhY3RseSA4IElBTSByb2xlcycsICgpID0+IHtcbiAgICB0ZW1wbGF0ZS5yZXNvdXJjZUNvdW50SXMoJ0FXUzo6SUFNOjpSb2xlJywgOCk7XG4gIH0pO1xuXG4gIHRlc3QoJ1RleHRyYWN0U2VydmljZVJvbGUgaGFzIGNvcnJlY3QgdHJ1c3QgcHJpbmNpcGFsJywgKCkgPT4ge1xuICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcygnQVdTOjpJQU06OlJvbGUnLCB7XG4gICAgICBSb2xlTmFtZTogJ1RleHRyYWN0U2VydmljZVJvbGUnLFxuICAgICAgQXNzdW1lUm9sZVBvbGljeURvY3VtZW50OiBNYXRjaC5vYmplY3RMaWtlKHtcbiAgICAgICAgU3RhdGVtZW50OiBNYXRjaC5hcnJheVdpdGgoW1xuICAgICAgICAgIE1hdGNoLm9iamVjdExpa2Uoe1xuICAgICAgICAgICAgUHJpbmNpcGFsOiB7IFNlcnZpY2U6ICd0ZXh0cmFjdC5hbWF6b25hd3MuY29tJyB9LFxuICAgICAgICAgICAgQWN0aW9uOiAnc3RzOkFzc3VtZVJvbGUnLFxuICAgICAgICAgIH0pLFxuICAgICAgICBdKSxcbiAgICAgIH0pLFxuICAgIH0pO1xuICB9KTtcblxuICB0ZXN0KCdEb2N1bWVudEluZ2VzdGlvblJvbGUgaGFzIGNvcnJlY3Qgcm9sZSBuYW1lJywgKCkgPT4ge1xuICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcygnQVdTOjpJQU06OlJvbGUnLCB7XG4gICAgICBSb2xlTmFtZTogJ0RvY3VtZW50SW5nZXN0aW9uRnVuY3Rpb24tcm9sZScsXG4gICAgfSk7XG4gIH0pO1xuXG4gIHRlc3QoJ0JlZHJvY2tWZWN0b3JpemF0aW9uUm9sZSBoYXMgY29ycmVjdCByb2xlIG5hbWUnLCAoKSA9PiB7XG4gICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKCdBV1M6OklBTTo6Um9sZScsIHtcbiAgICAgIFJvbGVOYW1lOiAnQmVkcm9ja1RvUzNWZWN0b3JpemF0aW9uLUxhbWJkYScsXG4gICAgfSk7XG4gIH0pO1xuXG4gIHRlc3QoJ1F1ZXJ5UHJvY2Vzc2luZ1JvbGUgaGFzIGNvcnJlY3Qgcm9sZSBuYW1lJywgKCkgPT4ge1xuICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcygnQVdTOjpJQU06OlJvbGUnLCB7XG4gICAgICBSb2xlTmFtZTogJ1F1ZXJ5UHJvY2Vzc2luZ0Z1bmN0aW9uLXJvbGUnLFxuICAgIH0pO1xuICB9KTtcblxuICB0ZXN0KCdDb252ZXJzYXRpb25GdW5jdGlvblJvbGUgaGFzIGNvcnJlY3Qgcm9sZSBuYW1lJywgKCkgPT4ge1xuICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcygnQVdTOjpJQU06OlJvbGUnLCB7XG4gICAgICBSb2xlTmFtZTogJ0NvbnZlcnNhdGlvbkZ1bmN0aW9uLXJvbGUnLFxuICAgIH0pO1xuICB9KTtcblxuICB0ZXN0KCdUZXh0cmFjdFJlc3VsdHNQcm9jZXNzb3JSb2xlIGhhcyBjb3JyZWN0IHJvbGUgbmFtZScsICgpID0+IHtcbiAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoJ0FXUzo6SUFNOjpSb2xlJywge1xuICAgICAgUm9sZU5hbWU6ICdUZXh0cmFjdFJlc3VsdHNQcm9jZXNzb3JGdW5jdGlvbi1yb2xlJyxcbiAgICB9KTtcbiAgfSk7XG5cbiAgdGVzdCgnYWxsIExhbWJkYSByb2xlcyB1c2UgQVdTTGFtYmRhQmFzaWNFeGVjdXRpb25Sb2xlIG1hbmFnZWQgcG9saWN5JywgKCkgPT4ge1xuICAgIGNvbnN0IGxhbWJkYVJvbGVOYW1lcyA9IFtcbiAgICAgICdEb2N1bWVudEluZ2VzdGlvbkZ1bmN0aW9uLXJvbGUnLFxuICAgICAgJ1RleHRyYWN0UHJvY2Vzc29yRnVuY3Rpb24tcm9sZScsXG4gICAgICAnVGV4dHJhY3RSZXN1bHRzUHJvY2Vzc29yRnVuY3Rpb24tcm9sZScsXG4gICAgICAnQmVkcm9ja1RvUzNWZWN0b3JpemF0aW9uLUxhbWJkYScsXG4gICAgICAnUXVlcnlQcm9jZXNzaW5nRnVuY3Rpb24tcm9sZScsXG4gICAgICAnQ29udmVyc2F0aW9uRnVuY3Rpb24tcm9sZScsXG4gICAgXTtcblxuICAgIGxhbWJkYVJvbGVOYW1lcy5mb3JFYWNoKChyb2xlTmFtZSkgPT4ge1xuICAgICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKCdBV1M6OklBTTo6Um9sZScsIHtcbiAgICAgICAgUm9sZU5hbWU6IHJvbGVOYW1lLFxuICAgICAgICBNYW5hZ2VkUG9saWN5QXJuczogTWF0Y2guYXJyYXlXaXRoKFtcbiAgICAgICAgICBNYXRjaC5vYmplY3RMaWtlKHtcbiAgICAgICAgICAgICdGbjo6Sm9pbic6IE1hdGNoLmFycmF5V2l0aChbXG4gICAgICAgICAgICAgIE1hdGNoLmFycmF5V2l0aChbXG4gICAgICAgICAgICAgICAgTWF0Y2guc3RyaW5nTGlrZVJlZ2V4cCgnQVdTTGFtYmRhQmFzaWNFeGVjdXRpb25Sb2xlJyksXG4gICAgICAgICAgICAgIF0pLFxuICAgICAgICAgICAgXSksXG4gICAgICAgICAgfSksXG4gICAgICAgIF0pLFxuICAgICAgfSk7XG4gICAgfSk7XG4gIH0pO1xuXG4gIHRlc3QoJ2V4cG9ydHMgNyByb2xlIEFSTnMgYXMgQ2xvdWRGb3JtYXRpb24gb3V0cHV0cycsICgpID0+IHtcbiAgICBjb25zdCBvdXRwdXRzID0gdGVtcGxhdGUuZmluZE91dHB1dHMoJyonKTtcbiAgICBjb25zdCBleHBvcnROYW1lcyA9IE9iamVjdC52YWx1ZXMob3V0cHV0cylcbiAgICAgIC5tYXAoKG86IHsgRXhwb3J0PzogeyBOYW1lPzogc3RyaW5nIH0gfSkgPT4gby5FeHBvcnQ/Lk5hbWUpXG4gICAgICAuZmlsdGVyKEJvb2xlYW4pO1xuXG4gICAgZXhwZWN0KGV4cG9ydE5hbWVzKS50b0NvbnRhaW4oJ3BkZi1jb252ZXJzYXRpb24tZG9jdW1lbnQtaW5nZXN0aW9uLXJvbGUtYXJuJyk7XG4gICAgZXhwZWN0KGV4cG9ydE5hbWVzKS50b0NvbnRhaW4oJ3BkZi1jb252ZXJzYXRpb24tYmVkcm9jay12ZWN0b3JpemF0aW9uLXJvbGUtYXJuJyk7XG4gICAgZXhwZWN0KGV4cG9ydE5hbWVzKS50b0NvbnRhaW4oJ3BkZi1jb252ZXJzYXRpb24tcXVlcnktcHJvY2Vzc2luZy1yb2xlLWFybicpO1xuICAgIGV4cGVjdChleHBvcnROYW1lcykudG9Db250YWluKCdwZGYtY29udmVyc2F0aW9uLXRleHRyYWN0LXNlcnZpY2Utcm9sZS1hcm4nKTtcbiAgICBleHBlY3QoZXhwb3J0TmFtZXMpLnRvQ29udGFpbigncGRmLWNvbnZlcnNhdGlvbi1jb252ZXJzYXRpb24tZnVuY3Rpb24tcm9sZS1hcm4nKTtcbiAgfSk7XG59KTtcblxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbi8vIEluZnJhU3RhY2tcbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbmRlc2NyaWJlKCdQZGZDb252ZXJzYXRpb25JbmZyYVN0YWNrJywgKCkgPT4ge1xuICBsZXQgdGVtcGxhdGU6IFRlbXBsYXRlO1xuXG4gIGJlZm9yZUFsbCgoKSA9PiB7XG4gICAgY29uc3QgYXBwID0gbWFrZUFwcCgpO1xuICAgIGNvbnN0IHNlY3VyaXR5ID0gYnVpbGRTZWN1cml0eVN0YWNrKGFwcCk7XG4gICAgY29uc3QgaW5mcmEgPSBidWlsZEluZnJhU3RhY2soYXBwLCBzZWN1cml0eSk7XG4gICAgdGVtcGxhdGUgPSBUZW1wbGF0ZS5mcm9tU3RhY2soaW5mcmEpO1xuICB9KTtcblxuICB0ZXN0KCdjcmVhdGVzIDMgUzMgYnVja2V0cyAocHJvY2Vzc2luZywgZGlnZXN0cywgdmVjdG9ycy1qc29uKScsICgpID0+IHtcbiAgICB0ZW1wbGF0ZS5yZXNvdXJjZUNvdW50SXMoJ0FXUzo6UzM6OkJ1Y2tldCcsIDMpO1xuICB9KTtcblxuICB0ZXN0KCdwcm9jZXNzaW5nIGJ1Y2tldCBoYXMgUzNfTUFOQUdFRCBlbmNyeXB0aW9uIGFuZCBibG9ja3MgcHVibGljIGFjY2VzcycsICgpID0+IHtcbiAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoJ0FXUzo6UzM6OkJ1Y2tldCcsIHtcbiAgICAgIEJ1Y2tldE5hbWU6IGBwZGYtY29udmVyc2F0aW9uLXByb2Nlc3NpbmctJHtBQ0NPVU5UX0lEfWAsXG4gICAgICBCdWNrZXRFbmNyeXB0aW9uOiB7XG4gICAgICAgIFNlcnZlclNpZGVFbmNyeXB0aW9uQ29uZmlndXJhdGlvbjogTWF0Y2guYXJyYXlXaXRoKFtcbiAgICAgICAgICBNYXRjaC5vYmplY3RMaWtlKHtcbiAgICAgICAgICAgIFNlcnZlclNpZGVFbmNyeXB0aW9uQnlEZWZhdWx0OiB7IFNTRUFsZ29yaXRobTogJ0FFUzI1NicgfSxcbiAgICAgICAgICB9KSxcbiAgICAgICAgXSksXG4gICAgICB9LFxuICAgICAgUHVibGljQWNjZXNzQmxvY2tDb25maWd1cmF0aW9uOiB7XG4gICAgICAgIEJsb2NrUHVibGljQWNsczogdHJ1ZSxcbiAgICAgICAgQmxvY2tQdWJsaWNQb2xpY3k6IHRydWUsXG4gICAgICAgIElnbm9yZVB1YmxpY0FjbHM6IHRydWUsXG4gICAgICAgIFJlc3RyaWN0UHVibGljQnVja2V0czogdHJ1ZSxcbiAgICAgIH0sXG4gICAgfSk7XG4gIH0pO1xuXG4gIHRlc3QoJ2RpZ2VzdHMgYnVja2V0IGhhcyBTM19NQU5BR0VEIGVuY3J5cHRpb24nLCAoKSA9PiB7XG4gICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKCdBV1M6OlMzOjpCdWNrZXQnLCB7XG4gICAgICBCdWNrZXROYW1lOiBgcGRmLWNvbnZlcnNhdGlvbi1kaWdlc3RzLSR7QUNDT1VOVF9JRH1gLFxuICAgICAgQnVja2V0RW5jcnlwdGlvbjoge1xuICAgICAgICBTZXJ2ZXJTaWRlRW5jcnlwdGlvbkNvbmZpZ3VyYXRpb246IE1hdGNoLmFycmF5V2l0aChbXG4gICAgICAgICAgTWF0Y2gub2JqZWN0TGlrZSh7XG4gICAgICAgICAgICBTZXJ2ZXJTaWRlRW5jcnlwdGlvbkJ5RGVmYXVsdDogeyBTU0VBbGdvcml0aG06ICdBRVMyNTYnIH0sXG4gICAgICAgICAgfSksXG4gICAgICAgIF0pLFxuICAgICAgfSxcbiAgICB9KTtcbiAgfSk7XG5cbiAgdGVzdCgndmVjdG9ycy1qc29uIGJ1Y2tldCBoYXMgUzNfTUFOQUdFRCBlbmNyeXB0aW9uJywgKCkgPT4ge1xuICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcygnQVdTOjpTMzo6QnVja2V0Jywge1xuICAgICAgQnVja2V0TmFtZTogYHBkZi1jb252ZXJzYXRpb24tdmVjdG9ycy1qc29uLSR7QUNDT1VOVF9JRH1gLFxuICAgIH0pO1xuICB9KTtcblxuICB0ZXN0KCdjcmVhdGVzIDQgRHluYW1vREIgdGFibGVzJywgKCkgPT4ge1xuICAgIHRlbXBsYXRlLnJlc291cmNlQ291bnRJcygnQVdTOjpEeW5hbW9EQjo6VGFibGUnLCA0KTtcbiAgfSk7XG5cbiAgdGVzdCgnbWV0YWRhdGEgdGFibGUgaGFzIGNvcnJlY3QgbmFtZSBhbmQgUEFZX1BFUl9SRVFVRVNUIGJpbGxpbmcnLCAoKSA9PiB7XG4gICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKCdBV1M6OkR5bmFtb0RCOjpUYWJsZScsIHtcbiAgICAgIFRhYmxlTmFtZTogJ3BkZi1jb252ZXJzYXRpb24tbWV0YWRhdGEnLFxuICAgICAgQmlsbGluZ01vZGU6ICdQQVlfUEVSX1JFUVVFU1QnLFxuICAgICAgS2V5U2NoZW1hOiBNYXRjaC5hcnJheVdpdGgoW1xuICAgICAgICB7IEF0dHJpYnV0ZU5hbWU6ICdkb2N1bWVudF9pZCcsIEtleVR5cGU6ICdIQVNIJyB9LFxuICAgICAgXSksXG4gICAgfSk7XG4gIH0pO1xuXG4gIHRlc3QoJ3F1ZXJ5LWxvZ3MgdGFibGUgaGFzIFRUTCBhdHRyaWJ1dGUnLCAoKSA9PiB7XG4gICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKCdBV1M6OkR5bmFtb0RCOjpUYWJsZScsIHtcbiAgICAgIFRhYmxlTmFtZTogJ3BkZi1jb252ZXJzYXRpb24tcXVlcnktbG9ncycsXG4gICAgICBUaW1lVG9MaXZlU3BlY2lmaWNhdGlvbjogeyBBdHRyaWJ1dGVOYW1lOiAndHRsJywgRW5hYmxlZDogdHJ1ZSB9LFxuICAgIH0pO1xuICB9KTtcblxuICB0ZXN0KCdjb252ZXJzYXRpb25zIHRhYmxlIGhhcyBjb3JyZWN0IHBhcnRpdGlvbiBrZXknLCAoKSA9PiB7XG4gICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKCdBV1M6OkR5bmFtb0RCOjpUYWJsZScsIHtcbiAgICAgIFRhYmxlTmFtZTogJ3BkZi1jb252ZXJzYXRpb24tY29udmVyc2F0aW9ucycsXG4gICAgICBLZXlTY2hlbWE6IE1hdGNoLmFycmF5V2l0aChbXG4gICAgICAgIHsgQXR0cmlidXRlTmFtZTogJ2NvbnZlcnNhdGlvbl9pZCcsIEtleVR5cGU6ICdIQVNIJyB9LFxuICAgICAgXSksXG4gICAgfSk7XG4gIH0pO1xuXG4gIHRlc3QoJ2hhcyBmb2xpby11c2FnZSBEeW5hbW9EQiB0YWJsZSB3aXRoIFRUTCcsICgpID0+IHtcbiAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoJ0FXUzo6RHluYW1vREI6OlRhYmxlJywge1xuICAgICAgVGFibGVOYW1lOiAnZm9saW8tdXNhZ2UnLFxuICAgICAgVGltZVRvTGl2ZVNwZWNpZmljYXRpb246IHsgQXR0cmlidXRlTmFtZTogJ3R0bCcsIEVuYWJsZWQ6IHRydWUgfSxcbiAgICAgIEtleVNjaGVtYTogTWF0Y2guYXJyYXlXaXRoKFtcbiAgICAgICAgeyBBdHRyaWJ1dGVOYW1lOiAndXNlcl9pZCcsIEtleVR5cGU6ICdIQVNIJyB9LFxuICAgICAgICB7IEF0dHJpYnV0ZU5hbWU6ICdtb250aF9rZXknLCBLZXlUeXBlOiAnUkFOR0UnIH0sXG4gICAgICBdKSxcbiAgICB9KTtcbiAgfSk7XG5cbiAgdGVzdCgnRG9jdW1lbnRJbmdlc3Rpb25GdW5jdGlvbiBoYXMgVVNBR0VfVEFCTEUgZW52IHZhcicsICgpID0+IHtcbiAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoJ0FXUzo6TGFtYmRhOjpGdW5jdGlvbicsIHtcbiAgICAgIEZ1bmN0aW9uTmFtZTogJ0RvY3VtZW50SW5nZXN0aW9uRnVuY3Rpb24nLFxuICAgICAgRW52aXJvbm1lbnQ6IHtcbiAgICAgICAgVmFyaWFibGVzOiBNYXRjaC5vYmplY3RMaWtlKHsgVVNBR0VfVEFCTEU6IE1hdGNoLmFueVZhbHVlKCkgfSksXG4gICAgICB9LFxuICAgIH0pO1xuICB9KTtcblxuICB0ZXN0KCdjcmVhdGVzIDIgU05TIHRvcGljcyAodGV4dHJhY3QtY29tcGxldGlvbiBhbmQgdmVjdG9yaXphdGlvbi1jb21wbGV0ZSknLCAoKSA9PiB7XG4gICAgdGVtcGxhdGUucmVzb3VyY2VDb3VudElzKCdBV1M6OlNOUzo6VG9waWMnLCAyKTtcbiAgfSk7XG5cbiAgdGVzdCgndGV4dHJhY3QtY29tcGxldGlvbiBTTlMgdG9waWMgZXhpc3RzJywgKCkgPT4ge1xuICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcygnQVdTOjpTTlM6OlRvcGljJywge1xuICAgICAgVG9waWNOYW1lOiAndGV4dHJhY3QtY29tcGxldGlvbicsXG4gICAgfSk7XG4gIH0pO1xuXG4gIHRlc3QoJ3ZlY3Rvcml6YXRpb24tY29tcGxldGUgU05TIHRvcGljIGV4aXN0cycsICgpID0+IHtcbiAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoJ0FXUzo6U05TOjpUb3BpYycsIHtcbiAgICAgIFRvcGljTmFtZTogJ3ZlY3Rvcml6YXRpb24tY29tcGxldGUnLFxuICAgIH0pO1xuICB9KTtcblxuICB0ZXN0KCdTdHVkeUJvb2tRdWV1ZSBTUVMgcXVldWUgZXhpc3RzIHdpdGggY29ycmVjdCB2aXNpYmlsaXR5IHRpbWVvdXQnLCAoKSA9PiB7XG4gICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKCdBV1M6OlNRUzo6UXVldWUnLCB7XG4gICAgICBRdWV1ZU5hbWU6ICdTdHVkeUJvb2tRdWV1ZScsXG4gICAgICBWaXNpYmlsaXR5VGltZW91dDogOTYwLFxuICAgIH0pO1xuICB9KTtcblxuICB0ZXN0KCdEb2N1bWVudEluZ2VzdGlvbkZ1bmN0aW9uIGhhcyBjb3JyZWN0IG5hbWUgYW5kIHJ1bnRpbWUnLCAoKSA9PiB7XG4gICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKCdBV1M6OkxhbWJkYTo6RnVuY3Rpb24nLCB7XG4gICAgICBGdW5jdGlvbk5hbWU6ICdEb2N1bWVudEluZ2VzdGlvbkZ1bmN0aW9uJyxcbiAgICAgIFJ1bnRpbWU6ICdweXRob24zLjEzJyxcbiAgICAgIEhhbmRsZXI6ICdpbmRleC5sYW1iZGFfaGFuZGxlcicsXG4gICAgICBUaW1lb3V0OiAzMDAsXG4gICAgICBNZW1vcnlTaXplOiA1MTIsXG4gICAgfSk7XG4gIH0pO1xuXG4gIHRlc3QoJ1RleHRyYWN0UmVzdWx0c1Byb2Nlc3NvckZ1bmN0aW9uIGhhcyBjb3JyZWN0IG5hbWUgYW5kIHRpbWVvdXQnLCAoKSA9PiB7XG4gICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKCdBV1M6OkxhbWJkYTo6RnVuY3Rpb24nLCB7XG4gICAgICBGdW5jdGlvbk5hbWU6ICdUZXh0cmFjdFJlc3VsdHNQcm9jZXNzb3JGdW5jdGlvbicsXG4gICAgICBSdW50aW1lOiAncHl0aG9uMy4xMycsXG4gICAgICBUaW1lb3V0OiA5MDAsXG4gICAgICBNZW1vcnlTaXplOiAxMDI0LFxuICAgIH0pO1xuICB9KTtcblxuICB0ZXN0KCdCZWRyb2NrVG9TM1ZlY3Rvcml6YXRpb24gZnVuY3Rpb24gZXhpc3RzJywgKCkgPT4ge1xuICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcygnQVdTOjpMYW1iZGE6OkZ1bmN0aW9uJywge1xuICAgICAgRnVuY3Rpb25OYW1lOiAnQmVkcm9ja1RvUzNWZWN0b3JpemF0aW9uJyxcbiAgICAgIFJ1bnRpbWU6ICdweXRob24zLjknLFxuICAgIH0pO1xuICB9KTtcblxuICB0ZXN0KCdEb2N1bWVudFNlYXJjaEZ1bmN0aW9uIGV4aXN0cyB3aXRoIGNvcnJlY3QgY29uZmlndXJhdGlvbicsICgpID0+IHtcbiAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoJ0FXUzo6TGFtYmRhOjpGdW5jdGlvbicsIHtcbiAgICAgIEZ1bmN0aW9uTmFtZTogJ1F1ZXJ5UHJvY2Vzc2luZ0Z1bmN0aW9uJyxcbiAgICAgIFJ1bnRpbWU6ICdweXRob24zLjEzJyxcbiAgICAgIFRpbWVvdXQ6IDMwLFxuICAgICAgTWVtb3J5U2l6ZTogNTEyLFxuICAgICAgRW52aXJvbm1lbnQ6IE1hdGNoLm9iamVjdExpa2Uoe1xuICAgICAgICBWYXJpYWJsZXM6IE1hdGNoLm9iamVjdExpa2Uoe1xuICAgICAgICAgIE1BWF9SRVNVTFRTX0xJTUlUOiAnMTAwJyxcbiAgICAgICAgICBTM19WRUNUT1JTX0JVQ0tFVDogYHBkZi1jb252ZXJzYXRpb24tdmVjdG9ycy0ke0FDQ09VTlRfSUR9YCxcbiAgICAgICAgICBTM19WRUNUT1JfSU5ERVhfTkFNRTogJ2RvY3VtZW50LWNodW5rcy1pbmRleCcsXG4gICAgICAgIH0pLFxuICAgICAgfSksXG4gICAgfSk7XG4gIH0pO1xuXG4gIHRlc3QoJ1N0dWR5Qm9va0Z1bmN0aW9uIGV4aXN0cyB3aXRoIGNvcnJlY3QgY29uZmlndXJhdGlvbicsICgpID0+IHtcbiAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoJ0FXUzo6TGFtYmRhOjpGdW5jdGlvbicsIHtcbiAgICAgIEZ1bmN0aW9uTmFtZTogJ1N0dWR5Qm9va0Z1bmN0aW9uJyxcbiAgICAgIFJ1bnRpbWU6ICdweXRob24zLjEzJyxcbiAgICAgIFRpbWVvdXQ6IDkwMCxcbiAgICAgIE1lbW9yeVNpemU6IDEwMjQsXG4gICAgICBFbnZpcm9ubWVudDogTWF0Y2gub2JqZWN0TGlrZSh7XG4gICAgICAgIFZhcmlhYmxlczogTWF0Y2gub2JqZWN0TGlrZSh7XG4gICAgICAgICAgSEFJS1VfTU9ERUxfSUQ6ICd1cy5hbnRocm9waWMuY2xhdWRlLWhhaWt1LTQtNS0yMDI1MTAwMS12MTowJyxcbiAgICAgICAgICBDSFVOS1NfUEVSX0dST1VQOiAnMTAnLFxuICAgICAgICB9KSxcbiAgICAgIH0pLFxuICAgIH0pO1xuICB9KTtcblxuICB0ZXN0KCdDb252ZXJzYXRpb25GdW5jdGlvbiBleGlzdHMgd2l0aCBjb3JyZWN0IG5hbWUnLCAoKSA9PiB7XG4gICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKCdBV1M6OkxhbWJkYTo6RnVuY3Rpb24nLCB7XG4gICAgICBGdW5jdGlvbk5hbWU6ICdDb252ZXJzYXRpb25GdW5jdGlvbicsXG4gICAgICBSdW50aW1lOiAncHl0aG9uMy45JyxcbiAgICB9KTtcbiAgfSk7XG5cbiAgdGVzdCgnZXhwb3J0cyBwcm9jZXNzaW5nIGJ1Y2tldCBuYW1lJywgKCkgPT4ge1xuICAgIGNvbnN0IG91dHB1dHMgPSB0ZW1wbGF0ZS5maW5kT3V0cHV0cygnKicpO1xuICAgIGNvbnN0IGV4cG9ydE5hbWVzID0gT2JqZWN0LnZhbHVlcyhvdXRwdXRzKVxuICAgICAgLm1hcCgobzogeyBFeHBvcnQ/OiB7IE5hbWU/OiBzdHJpbmcgfSB9KSA9PiBvLkV4cG9ydD8uTmFtZSlcbiAgICAgIC5maWx0ZXIoQm9vbGVhbik7XG4gICAgZXhwZWN0KGV4cG9ydE5hbWVzKS50b0NvbnRhaW4oJ3BkZi1jb252ZXJzYXRpb24tcHJvY2Vzc2luZy1idWNrZXQnKTtcbiAgfSk7XG5cbiAgdGVzdCgnZXhwb3J0cyBtZXRhZGF0YSB0YWJsZSBuYW1lJywgKCkgPT4ge1xuICAgIGNvbnN0IG91dHB1dHMgPSB0ZW1wbGF0ZS5maW5kT3V0cHV0cygnKicpO1xuICAgIGNvbnN0IGV4cG9ydE5hbWVzID0gT2JqZWN0LnZhbHVlcyhvdXRwdXRzKVxuICAgICAgLm1hcCgobzogeyBFeHBvcnQ/OiB7IE5hbWU/OiBzdHJpbmcgfSB9KSA9PiBvLkV4cG9ydD8uTmFtZSlcbiAgICAgIC5maWx0ZXIoQm9vbGVhbik7XG4gICAgZXhwZWN0KGV4cG9ydE5hbWVzKS50b0NvbnRhaW4oJ3BkZi1jb252ZXJzYXRpb24tbWV0YWRhdGEtdGFibGUnKTtcbiAgfSk7XG59KTtcblxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbi8vIE1vbml0b3JpbmdTdGFja1xuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuZGVzY3JpYmUoJ1BkZkNvbnZlcnNhdGlvbk1vbml0b3JpbmdTdGFjaycsICgpID0+IHtcbiAgbGV0IHRlbXBsYXRlOiBUZW1wbGF0ZTtcblxuICBiZWZvcmVBbGwoKCkgPT4ge1xuICAgIGNvbnN0IGFwcCA9IG1ha2VBcHAoKTtcbiAgICBjb25zdCBzZWN1cml0eSA9IGJ1aWxkU2VjdXJpdHlTdGFjayhhcHApO1xuICAgIGNvbnN0IGluZnJhID0gYnVpbGRJbmZyYVN0YWNrKGFwcCwgc2VjdXJpdHkpO1xuICAgIGJ1aWxkTW9uaXRvcmluZ1N0YWNrKGFwcCwgaW5mcmEpO1xuICAgIHRlbXBsYXRlID0gVGVtcGxhdGUuZnJvbVN0YWNrKGFwcC5ub2RlLmZpbmRDaGlsZCgnTW9uaXRvcmluZ1N0YWNrJykgYXMgY2RrLlN0YWNrKTtcbiAgfSk7XG5cbiAgdGVzdCgnY3JlYXRlcyBDbG91ZFdhdGNoIGRhc2hib2FyZCBuYW1lZCBQREYtQ29udmVyc2F0aW9uLVN5c3RlbS1PdmVydmlldycsICgpID0+IHtcbiAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoJ0FXUzo6Q2xvdWRXYXRjaDo6RGFzaGJvYXJkJywge1xuICAgICAgRGFzaGJvYXJkTmFtZTogJ1BERi1Db252ZXJzYXRpb24tU3lzdGVtLU92ZXJ2aWV3JyxcbiAgICB9KTtcbiAgfSk7XG5cbiAgdGVzdCgnY3JlYXRlcyBleGFjdGx5IDEgQ2xvdWRXYXRjaCBkYXNoYm9hcmQnLCAoKSA9PiB7XG4gICAgdGVtcGxhdGUucmVzb3VyY2VDb3VudElzKCdBV1M6OkNsb3VkV2F0Y2g6OkRhc2hib2FyZCcsIDEpO1xuICB9KTtcblxuICB0ZXN0KCdjcmVhdGVzIHN5c3RlbS1hbGVydHMgU05TIHRvcGljJywgKCkgPT4ge1xuICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcygnQVdTOjpTTlM6OlRvcGljJywge1xuICAgICAgVG9waWNOYW1lOiAncGRmLWNvbnZlcnNhdGlvbi1zeXN0ZW0tYWxlcnRzJyxcbiAgICB9KTtcbiAgfSk7XG5cbiAgdGVzdCgnY3JlYXRlcyBDbG91ZFdhdGNoIGFsYXJtcyBmb3IgTGFtYmRhIGZ1bmN0aW9ucycsICgpID0+IHtcbiAgICBjb25zdCBhbGFybXMgPSB0ZW1wbGF0ZS5maW5kUmVzb3VyY2VzKCdBV1M6OkNsb3VkV2F0Y2g6OkFsYXJtJyk7XG4gICAgZXhwZWN0KE9iamVjdC5rZXlzKGFsYXJtcykubGVuZ3RoKS50b0JlR3JlYXRlclRoYW5PckVxdWFsKDExKTtcbiAgfSk7XG5cbiAgdGVzdCgnRG9jdW1lbnRJbmdlc3Rpb24gaGlnaC1lcnJvci1yYXRlIGFsYXJtIGV4aXN0cycsICgpID0+IHtcbiAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoJ0FXUzo6Q2xvdWRXYXRjaDo6QWxhcm0nLCB7XG4gICAgICBBbGFybU5hbWU6ICdQREYtQ29udmVyc2F0aW9uLURvY3VtZW50SW5nZXN0aW9uLUhpZ2hFcnJvclJhdGUnLFxuICAgICAgVGhyZXNob2xkOiA1LFxuICAgICAgRXZhbHVhdGlvblBlcmlvZHM6IDIsXG4gICAgfSk7XG4gIH0pO1xuXG4gIHRlc3QoJ0RvY3VtZW50U2VhcmNoIGhpZ2gtZHVyYXRpb24gYWxhcm0gZXhpc3RzJywgKCkgPT4ge1xuICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcygnQVdTOjpDbG91ZFdhdGNoOjpBbGFybScsIHtcbiAgICAgIEFsYXJtTmFtZTogJ1BERi1Db252ZXJzYXRpb24tRG9jdW1lbnRTZWFyY2gtSGlnaER1cmF0aW9uJyxcbiAgICB9KTtcbiAgfSk7XG5cbiAgdGVzdCgnU3R1ZHlCb29rIERMUSBkZXB0aCBhbGFybSBleGlzdHMnLCAoKSA9PiB7XG4gICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKCdBV1M6OkNsb3VkV2F0Y2g6OkFsYXJtJywge1xuICAgICAgQWxhcm1OYW1lOiAnUERGLUNvbnZlcnNhdGlvbi1TdHVkeUJvb2stRExRLURlcHRoJyxcbiAgICAgIFRocmVzaG9sZDogMSxcbiAgICAgIEV2YWx1YXRpb25QZXJpb2RzOiAxLFxuICAgIH0pO1xuICB9KTtcblxuICB0ZXN0KCdEeW5hbW9EQiByZWFkLXRocm90dGxpbmcgYWxhcm1zIGV4aXN0IGZvciBib3RoIHRhYmxlcycsICgpID0+IHtcbiAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoJ0FXUzo6Q2xvdWRXYXRjaDo6QWxhcm0nLCB7XG4gICAgICBBbGFybU5hbWU6ICdQREYtQ29udmVyc2F0aW9uLU1ldGFkYXRhLVJlYWRUaHJvdHRsaW5nJyxcbiAgICB9KTtcbiAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoJ0FXUzo6Q2xvdWRXYXRjaDo6QWxhcm0nLCB7XG4gICAgICBBbGFybU5hbWU6ICdQREYtQ29udmVyc2F0aW9uLVF1ZXJ5TG9ncy1SZWFkVGhyb3R0bGluZycsXG4gICAgfSk7XG4gIH0pO1xuXG4gIHRlc3QoJ291dHB1dHMgZGFzaGJvYXJkIFVSTCcsICgpID0+IHtcbiAgICBjb25zdCBvdXRwdXRzID0gdGVtcGxhdGUuZmluZE91dHB1dHMoJ0Rhc2hib2FyZFVSTCcpO1xuICAgIGV4cGVjdChPYmplY3Qua2V5cyhvdXRwdXRzKS5sZW5ndGgpLnRvQmUoMSk7XG4gIH0pO1xuXG4gIHRlc3QoJ2hhcyBlcnJvciBhbGFybSBmb3IgQ29udmVyc2F0aW9uRnVuY3Rpb24nLCAoKSA9PiB7XG4gICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKCdBV1M6OkNsb3VkV2F0Y2g6OkFsYXJtJywge1xuICAgICAgQWxhcm1OYW1lOiBNYXRjaC5zdHJpbmdMaWtlUmVnZXhwKCdDb252ZXJzYXRpb25GdW5jdGlvbi4qSGlnaEVycm9yUmF0ZScpLFxuICAgICAgTmFtZXNwYWNlOiAnQVdTL0xhbWJkYScsXG4gICAgICBNZXRyaWNOYW1lOiAnRXJyb3JzJyxcbiAgICB9KTtcbiAgfSk7XG59KTtcblxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbi8vIEF1dGhTdGFja1xuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuZGVzY3JpYmUoJ1BkZkNvbnZlcnNhdGlvbkF1dGhTdGFjaycsICgpID0+IHtcbiAgbGV0IHRlbXBsYXRlOiBUZW1wbGF0ZTtcblxuICBiZWZvcmVBbGwoKCkgPT4ge1xuICAgIGNvbnN0IGFwcCA9IG1ha2VBcHAoKTtcbiAgICBjb25zdCBzZWN1cml0eSA9IGJ1aWxkU2VjdXJpdHlTdGFjayhhcHApO1xuICAgIGNvbnN0IGluZnJhID0gYnVpbGRJbmZyYVN0YWNrKGFwcCwgc2VjdXJpdHkpO1xuICAgIGJ1aWxkQXV0aFN0YWNrKGFwcCwgaW5mcmEpO1xuICAgIHRlbXBsYXRlID0gVGVtcGxhdGUuZnJvbVN0YWNrKGFwcC5ub2RlLmZpbmRDaGlsZCgnQXV0aFN0YWNrJykgYXMgY2RrLlN0YWNrKTtcbiAgfSk7XG5cbiAgdGVzdCgnY3JlYXRlcyAxIENvZ25pdG8gdXNlciBwb29sJywgKCkgPT4ge1xuICAgIHRlbXBsYXRlLnJlc291cmNlQ291bnRJcygnQVdTOjpDb2duaXRvOjpVc2VyUG9vbCcsIDEpO1xuICB9KTtcblxuICB0ZXN0KCd1c2VyIHBvb2wgaGFzIGNvcnJlY3QgbmFtZSBhbmQgc2VsZi1zaWduLXVwIGVuYWJsZWQnLCAoKSA9PiB7XG4gICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKCdBV1M6OkNvZ25pdG86OlVzZXJQb29sJywge1xuICAgICAgVXNlclBvb2xOYW1lOiAncGRmLWNvbnZlcnNhdGlvbi11c2VycycsXG4gICAgICBBZG1pbkNyZWF0ZVVzZXJDb25maWc6IHsgQWxsb3dBZG1pbkNyZWF0ZVVzZXJPbmx5OiBmYWxzZSB9LFxuICAgIH0pO1xuICB9KTtcblxuICB0ZXN0KCd1c2VyIHBvb2wgY2xpZW50IGV4aXN0cycsICgpID0+IHtcbiAgICB0ZW1wbGF0ZS5yZXNvdXJjZUNvdW50SXMoJ0FXUzo6Q29nbml0bzo6VXNlclBvb2xDbGllbnQnLCAxKTtcbiAgfSk7XG5cbiAgdGVzdCgnaWRlbnRpdHkgcG9vbCBhbGxvd3Mgb25seSBhdXRoZW50aWNhdGVkIGlkZW50aXRpZXMnLCAoKSA9PiB7XG4gICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKCdBV1M6OkNvZ25pdG86OklkZW50aXR5UG9vbCcsIHtcbiAgICAgIElkZW50aXR5UG9vbE5hbWU6ICdwZGZfY29udmVyc2F0aW9uX2lkZW50aXR5X3Bvb2wnLFxuICAgICAgQWxsb3dVbmF1dGhlbnRpY2F0ZWRJZGVudGl0aWVzOiBmYWxzZSxcbiAgICB9KTtcbiAgfSk7XG5cbiAgdGVzdCgnY3JlYXRlcyAxIFJFU1QgQVBJIEdhdGV3YXknLCAoKSA9PiB7XG4gICAgdGVtcGxhdGUucmVzb3VyY2VDb3VudElzKCdBV1M6OkFwaUdhdGV3YXk6OlJlc3RBcGknLCAxKTtcbiAgfSk7XG5cbiAgdGVzdCgnQVBJIEdhdGV3YXkgaGFzIGNvcnJlY3QgbmFtZScsICgpID0+IHtcbiAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoJ0FXUzo6QXBpR2F0ZXdheTo6UmVzdEFwaScsIHtcbiAgICAgIE5hbWU6ICdQREYgQ29udmVyc2F0aW9uIEFQSScsXG4gICAgfSk7XG4gIH0pO1xuXG4gIHRlc3QoJ0FQSSBHYXRld2F5IGRlcGxveW1lbnQgc3RhZ2UgaXMgdjEnLCAoKSA9PiB7XG4gICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKCdBV1M6OkFwaUdhdGV3YXk6OlN0YWdlJywge1xuICAgICAgU3RhZ2VOYW1lOiAndjEnLFxuICAgIH0pO1xuICB9KTtcblxuICB0ZXN0KCdMaXN0RG9jdW1lbnRzIExhbWJkYSBmdW5jdGlvbiBleGlzdHMgd2l0aCBjb3JyZWN0IG5hbWUnLCAoKSA9PiB7XG4gICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKCdBV1M6OkxhbWJkYTo6RnVuY3Rpb24nLCB7XG4gICAgICBGdW5jdGlvbk5hbWU6ICdMaXN0RG9jdW1lbnRzJyxcbiAgICAgIFJ1bnRpbWU6ICdweXRob24zLjknLFxuICAgIH0pO1xuICB9KTtcblxuICB0ZXN0KCdHZW5lcmF0ZVByZXNpZ25lZFVybCBMYW1iZGEgZnVuY3Rpb24gZXhpc3RzJywgKCkgPT4ge1xuICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcygnQVdTOjpMYW1iZGE6OkZ1bmN0aW9uJywge1xuICAgICAgRnVuY3Rpb25OYW1lOiAnR2VuZXJhdGVQcmVzaWduZWRVcmwnLFxuICAgICAgUnVudGltZTogJ3B5dGhvbjMuOScsXG4gICAgfSk7XG4gIH0pO1xuXG4gIHRlc3QoJ0dldERvY3VtZW50U3VtbWFyeSBMYW1iZGEgZnVuY3Rpb24gZXhpc3RzJywgKCkgPT4ge1xuICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcygnQVdTOjpMYW1iZGE6OkZ1bmN0aW9uJywge1xuICAgICAgRnVuY3Rpb25OYW1lOiAnR2V0RG9jdW1lbnRTdW1tYXJ5JyxcbiAgICAgIFJ1bnRpbWU6ICdweXRob24zLjknLFxuICAgIH0pO1xuICB9KTtcblxuICB0ZXN0KCdDb2duaXRvIGF1dGhvcml6ZXIgaXMgYXR0YWNoZWQnLCAoKSA9PiB7XG4gICAgdGVtcGxhdGUucmVzb3VyY2VDb3VudElzKCdBV1M6OkFwaUdhdGV3YXk6OkF1dGhvcml6ZXInLCAxKTtcbiAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoJ0FXUzo6QXBpR2F0ZXdheTo6QXV0aG9yaXplcicsIHtcbiAgICAgIE5hbWU6ICdDb2duaXRvQXV0aG9yaXplcicsXG4gICAgICBUeXBlOiAnQ09HTklUT19VU0VSX1BPT0xTJyxcbiAgICB9KTtcbiAgfSk7XG5cbiAgdGVzdCgnZXhwb3J0cyB1c2VyIHBvb2wgSUQgYW5kIGNsaWVudCBJRCcsICgpID0+IHtcbiAgICBjb25zdCBvdXRwdXRzID0gdGVtcGxhdGUuZmluZE91dHB1dHMoJyonKTtcbiAgICBjb25zdCBleHBvcnROYW1lcyA9IE9iamVjdC52YWx1ZXMob3V0cHV0cylcbiAgICAgIC5tYXAoKG86IHsgRXhwb3J0PzogeyBOYW1lPzogc3RyaW5nIH0gfSkgPT4gby5FeHBvcnQ/Lk5hbWUpXG4gICAgICAuZmlsdGVyKEJvb2xlYW4pO1xuICAgIGV4cGVjdChleHBvcnROYW1lcykudG9Db250YWluKCdQZGZDb252ZXJzYXRpb24tVXNlclBvb2xJZCcpO1xuICAgIGV4cGVjdChleHBvcnROYW1lcykudG9Db250YWluKCdQZGZDb252ZXJzYXRpb24tVXNlclBvb2xDbGllbnRJZCcpO1xuICAgIGV4cGVjdChleHBvcnROYW1lcykudG9Db250YWluKCdQZGZDb252ZXJzYXRpb24tSWRlbnRpdHlQb29sSWQnKTtcbiAgICBleHBlY3QoZXhwb3J0TmFtZXMpLnRvQ29udGFpbignUGRmQ29udmVyc2F0aW9uLUFwaUVuZHBvaW50Jyk7XG4gIH0pO1xuXG4gIHRlc3QoJ1VzZXJQb29sRG9tYWluIHJlc291cmNlIGV4aXN0cyB3aXRoIGZvbGlvIHByZWZpeCBmb3IgcHJvZCcsICgpID0+IHtcbiAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoJ0FXUzo6Q29nbml0bzo6VXNlclBvb2xEb21haW4nLCB7XG4gICAgICBEb21haW46ICdmb2xpbycsXG4gICAgfSk7XG4gIH0pO1xuXG4gIHRlc3QoJ0dvb2dsZSBJZGVudGl0eSBQcm92aWRlciByZXNvdXJjZSBleGlzdHMnLCAoKSA9PiB7XG4gICAgdGVtcGxhdGUucmVzb3VyY2VDb3VudElzKCdBV1M6OkNvZ25pdG86OlVzZXJQb29sSWRlbnRpdHlQcm92aWRlcicsIDEpO1xuICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcygnQVdTOjpDb2duaXRvOjpVc2VyUG9vbElkZW50aXR5UHJvdmlkZXInLCB7XG4gICAgICBQcm92aWRlck5hbWU6ICdHb29nbGUnLFxuICAgICAgUHJvdmlkZXJUeXBlOiAnR29vZ2xlJyxcbiAgICAgIEF0dHJpYnV0ZU1hcHBpbmc6IE1hdGNoLm9iamVjdExpa2Uoe1xuICAgICAgICBlbWFpbDogJ2VtYWlsJyxcbiAgICAgICAgZ2l2ZW5fbmFtZTogJ2dpdmVuX25hbWUnLFxuICAgICAgICBmYW1pbHlfbmFtZTogJ2ZhbWlseV9uYW1lJyxcbiAgICAgICAgbmFtZTogJ25hbWUnLFxuICAgICAgfSksXG4gICAgfSk7XG4gIH0pO1xuXG4gIHRlc3QoJ1ByZVNpZ25VcCBMYW1iZGEgZnVuY3Rpb24gZXhpc3RzJywgKCkgPT4ge1xuICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcygnQVdTOjpMYW1iZGE6OkZ1bmN0aW9uJywge1xuICAgICAgRnVuY3Rpb25OYW1lOiAnUHJlU2lnblVwVHJpZ2dlcicsXG4gICAgICBSdW50aW1lOiAncHl0aG9uMy45JyxcbiAgICB9KTtcbiAgfSk7XG5cbiAgdGVzdCgnQ3VzdG9tIE1lc3NhZ2UgTGFtYmRhIGZ1bmN0aW9uIGV4aXN0cycsICgpID0+IHtcbiAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoJ0FXUzo6TGFtYmRhOjpGdW5jdGlvbicsIHtcbiAgICAgIEZ1bmN0aW9uTmFtZTogJ0N1c3RvbU1lc3NhZ2VUcmlnZ2VyJyxcbiAgICAgIFJ1bnRpbWU6ICdweXRob24zLjknLFxuICAgIH0pO1xuICB9KTtcblxuICB0ZXN0KCdVc2VyUG9vbENsaWVudCBoYXMgQ09HTklUTyBhbmQgR29vZ2xlIGluIFN1cHBvcnRlZElkZW50aXR5UHJvdmlkZXJzJywgKCkgPT4ge1xuICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcygnQVdTOjpDb2duaXRvOjpVc2VyUG9vbENsaWVudCcsIHtcbiAgICAgIFN1cHBvcnRlZElkZW50aXR5UHJvdmlkZXJzOiBNYXRjaC5hcnJheVdpdGgoWydDT0dOSVRPJywgJ0dvb2dsZSddKSxcbiAgICB9KTtcbiAgfSk7XG5cbiAgdGVzdCgnVXNlclBvb2xEb21haW4gQ2ZuT3V0cHV0IGV4aXN0cyB3aXRoIGNvcnJlY3QgZXhwb3J0IG5hbWUnLCAoKSA9PiB7XG4gICAgY29uc3Qgb3V0cHV0cyA9IHRlbXBsYXRlLmZpbmRPdXRwdXRzKCcqJyk7XG4gICAgY29uc3QgZXhwb3J0TmFtZXMgPSBPYmplY3QudmFsdWVzKG91dHB1dHMpXG4gICAgICAubWFwKChvOiB7IEV4cG9ydD86IHsgTmFtZT86IHN0cmluZyB9IH0pID0+IG8uRXhwb3J0Py5OYW1lKVxuICAgICAgLmZpbHRlcihCb29sZWFuKTtcbiAgICBleHBlY3QoZXhwb3J0TmFtZXMpLnRvQ29udGFpbignUGRmQ29udmVyc2F0aW9uLVVzZXJQb29sRG9tYWluJyk7XG4gIH0pO1xuXG4gIHRlc3QoJ1VzZXJQb29sIGxhbWJkYUNvbmZpZyByZWZlcmVuY2VzIFByZVNpZ25VcCBhbmQgQ3VzdG9tTWVzc2FnZSB0cmlnZ2VycycsICgpID0+IHtcbiAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoJ0FXUzo6Q29nbml0bzo6VXNlclBvb2wnLCB7XG4gICAgICBMYW1iZGFDb25maWc6IE1hdGNoLm9iamVjdExpa2Uoe1xuICAgICAgICBQcmVTaWduVXA6IE1hdGNoLmFueVZhbHVlKCksXG4gICAgICAgIEN1c3RvbU1lc3NhZ2U6IE1hdGNoLmFueVZhbHVlKCksXG4gICAgICB9KSxcbiAgICB9KTtcbiAgfSk7XG5cbiAgdGVzdCgndXNlciBwb29sIHNjaGVtYSBpbmNsdWRlcyBtdXRhYmxlIG5hbWUgYXR0cmlidXRlJywgKCkgPT4ge1xuICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcygnQVdTOjpDb2duaXRvOjpVc2VyUG9vbCcsIHtcbiAgICAgIFNjaGVtYTogTWF0Y2guYXJyYXlXaXRoKFtcbiAgICAgICAgTWF0Y2gub2JqZWN0TGlrZSh7IE5hbWU6ICduYW1lJywgTXV0YWJsZTogdHJ1ZSwgUmVxdWlyZWQ6IGZhbHNlIH0pLFxuICAgICAgXSksXG4gICAgfSk7XG4gIH0pO1xuXG4gIHRlc3QoJ0RlbGV0ZUFjY291bnQgTGFtYmRhIGZ1bmN0aW9uIGV4aXN0cycsICgpID0+IHtcbiAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoJ0FXUzo6TGFtYmRhOjpGdW5jdGlvbicsIHtcbiAgICAgIEZ1bmN0aW9uTmFtZTogJ0RlbGV0ZUFjY291bnQnLFxuICAgICAgUnVudGltZTogJ3B5dGhvbjMuOScsXG4gICAgfSk7XG4gIH0pO1xuXG4gIHRlc3QoJ1VzZXJQb29sIGhhcyBjdXN0b206cm9sZSBhdHRyaWJ1dGUnLCAoKSA9PiB7XG4gICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKCdBV1M6OkNvZ25pdG86OlVzZXJQb29sJywge1xuICAgICAgU2NoZW1hOiBNYXRjaC5hcnJheVdpdGgoW1xuICAgICAgICBNYXRjaC5vYmplY3RMaWtlKHtcbiAgICAgICAgICBBdHRyaWJ1dGVEYXRhVHlwZTogJ1N0cmluZycsXG4gICAgICAgICAgTmFtZTogJ3JvbGUnLFxuICAgICAgICAgIE11dGFibGU6IHRydWUsXG4gICAgICAgIH0pLFxuICAgICAgXSksXG4gICAgfSk7XG4gIH0pO1xuXG4gIHRlc3QoJ2hhcyBHRVQgL3VzZXJzL21lL3VzYWdlIEFQSSByb3V0ZScsICgpID0+IHtcbiAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoJ0FXUzo6QXBpR2F0ZXdheTo6UmVzb3VyY2UnLCB7XG4gICAgICBQYXRoUGFydDogJ3VzYWdlJyxcbiAgICB9KTtcbiAgfSk7XG59KTtcblxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbi8vIEZyb250ZW5kU3RhY2tcbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbmRlc2NyaWJlKCdQZGZDb252ZXJzYXRpb25Gcm9udGVuZFN0YWNrJywgKCkgPT4ge1xuICBsZXQgdGVtcGxhdGU6IFRlbXBsYXRlO1xuXG4gIGJlZm9yZUFsbCgoKSA9PiB7XG4gICAgY29uc3QgYXBwID0gbWFrZUFwcCgpO1xuICAgIG5ldyBQZGZDb252ZXJzYXRpb25Gcm9udGVuZFN0YWNrKGFwcCwgJ0Zyb250ZW5kU3RhY2snLCB7IGVudjogRU5WIH0pO1xuICAgIHRlbXBsYXRlID0gVGVtcGxhdGUuZnJvbVN0YWNrKGFwcC5ub2RlLmZpbmRDaGlsZCgnRnJvbnRlbmRTdGFjaycpIGFzIGNkay5TdGFjayk7XG4gIH0pO1xuXG4gIHRlc3QoJ2NyZWF0ZXMgZXhhY3RseSAxIFMzIGJ1Y2tldCcsICgpID0+IHtcbiAgICB0ZW1wbGF0ZS5yZXNvdXJjZUNvdW50SXMoJ0FXUzo6UzM6OkJ1Y2tldCcsIDEpO1xuICB9KTtcblxuICB0ZXN0KCdmcm9udGVuZCBidWNrZXQgaGFzIGNvcnJlY3QgbmFtZSBhbmQgUzNfTUFOQUdFRCBlbmNyeXB0aW9uJywgKCkgPT4ge1xuICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcygnQVdTOjpTMzo6QnVja2V0Jywge1xuICAgICAgQnVja2V0TmFtZTogYHBkZi1jb252ZXJzYXRpb24tZnJvbnRlbmQtJHtBQ0NPVU5UX0lEfWAsXG4gICAgICBCdWNrZXRFbmNyeXB0aW9uOiB7XG4gICAgICAgIFNlcnZlclNpZGVFbmNyeXB0aW9uQ29uZmlndXJhdGlvbjogTWF0Y2guYXJyYXlXaXRoKFtcbiAgICAgICAgICBNYXRjaC5vYmplY3RMaWtlKHtcbiAgICAgICAgICAgIFNlcnZlclNpZGVFbmNyeXB0aW9uQnlEZWZhdWx0OiB7IFNTRUFsZ29yaXRobTogJ0FFUzI1NicgfSxcbiAgICAgICAgICB9KSxcbiAgICAgICAgXSksXG4gICAgICB9LFxuICAgICAgUHVibGljQWNjZXNzQmxvY2tDb25maWd1cmF0aW9uOiB7XG4gICAgICAgIEJsb2NrUHVibGljQWNsczogdHJ1ZSxcbiAgICAgICAgQmxvY2tQdWJsaWNQb2xpY3k6IHRydWUsXG4gICAgICAgIElnbm9yZVB1YmxpY0FjbHM6IHRydWUsXG4gICAgICAgIFJlc3RyaWN0UHVibGljQnVja2V0czogdHJ1ZSxcbiAgICAgIH0sXG4gICAgfSk7XG4gIH0pO1xuXG4gIHRlc3QoJ2NyZWF0ZXMgZXhhY3RseSAxIENsb3VkRnJvbnQgZGlzdHJpYnV0aW9uJywgKCkgPT4ge1xuICAgIHRlbXBsYXRlLnJlc291cmNlQ291bnRJcygnQVdTOjpDbG91ZEZyb250OjpEaXN0cmlidXRpb24nLCAxKTtcbiAgfSk7XG5cbiAgdGVzdCgnQ2xvdWRGcm9udCBkaXN0cmlidXRpb24gcmVkaXJlY3RzIEhUVFAgdG8gSFRUUFMnLCAoKSA9PiB7XG4gICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKCdBV1M6OkNsb3VkRnJvbnQ6OkRpc3RyaWJ1dGlvbicsIHtcbiAgICAgIERpc3RyaWJ1dGlvbkNvbmZpZzogTWF0Y2gub2JqZWN0TGlrZSh7XG4gICAgICAgIERlZmF1bHRDYWNoZUJlaGF2aW9yOiBNYXRjaC5vYmplY3RMaWtlKHtcbiAgICAgICAgICBWaWV3ZXJQcm90b2NvbFBvbGljeTogJ3JlZGlyZWN0LXRvLWh0dHBzJyxcbiAgICAgICAgfSksXG4gICAgICAgIERlZmF1bHRSb290T2JqZWN0OiAnaW5kZXguaHRtbCcsXG4gICAgICAgIFByaWNlQ2xhc3M6ICdQcmljZUNsYXNzXzEwMCcsXG4gICAgICB9KSxcbiAgICB9KTtcbiAgfSk7XG5cbiAgdGVzdCgnQ2xvdWRGcm9udCBoYXMgU1BBIGVycm9yIHJlc3BvbnNlcyBmb3IgNDAzIGFuZCA0MDQnLCAoKSA9PiB7XG4gICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKCdBV1M6OkNsb3VkRnJvbnQ6OkRpc3RyaWJ1dGlvbicsIHtcbiAgICAgIERpc3RyaWJ1dGlvbkNvbmZpZzogTWF0Y2gub2JqZWN0TGlrZSh7XG4gICAgICAgIEN1c3RvbUVycm9yUmVzcG9uc2VzOiBNYXRjaC5hcnJheVdpdGgoW1xuICAgICAgICAgIE1hdGNoLm9iamVjdExpa2UoeyBFcnJvckNvZGU6IDQwMywgUmVzcG9uc2VDb2RlOiAyMDAsIFJlc3BvbnNlUGFnZVBhdGg6ICcvaW5kZXguaHRtbCcgfSksXG4gICAgICAgICAgTWF0Y2gub2JqZWN0TGlrZSh7IEVycm9yQ29kZTogNDA0LCBSZXNwb25zZUNvZGU6IDIwMCwgUmVzcG9uc2VQYWdlUGF0aDogJy9pbmRleC5odG1sJyB9KSxcbiAgICAgICAgXSksXG4gICAgICB9KSxcbiAgICB9KTtcbiAgfSk7XG5cbiAgdGVzdCgnUzMgT3JpZ2luIEFjY2VzcyBDb250cm9sIGlzIGNyZWF0ZWQnLCAoKSA9PiB7XG4gICAgdGVtcGxhdGUucmVzb3VyY2VDb3VudElzKCdBV1M6OkNsb3VkRnJvbnQ6Ok9yaWdpbkFjY2Vzc0NvbnRyb2wnLCAxKTtcbiAgfSk7XG5cbiAgdGVzdCgnb3V0cHV0cyBDbG91ZEZyb250IGRvbWFpbiBuYW1lJywgKCkgPT4ge1xuICAgIGNvbnN0IG91dHB1dHMgPSB0ZW1wbGF0ZS5maW5kT3V0cHV0cygnQ2xvdWRGcm9udERvbWFpbk5hbWUnKTtcbiAgICBleHBlY3QoT2JqZWN0LmtleXMob3V0cHV0cykubGVuZ3RoKS50b0JlKDEpO1xuICB9KTtcbn0pO1xuXG5kZXNjcmliZSgnUGRmQ29udmVyc2F0aW9uRnJvbnRlbmRTdGFjayB3aXRoIGRvbWFpbicsICgpID0+IHtcbiAgbGV0IGRvbWFpblRlbXBsYXRlOiBUZW1wbGF0ZTtcblxuICBiZWZvcmVBbGwoKCkgPT4ge1xuICAgIGNvbnN0IGFwcCA9IG1ha2VBcHAoKTtcbiAgICBuZXcgUGRmQ29udmVyc2F0aW9uRnJvbnRlbmRTdGFjayhhcHAsICdGcm9udGVuZFN0YWNrV2l0aERvbWFpbicsIHtcbiAgICAgIGVudjogRU5WLFxuICAgICAgZG9tYWluTmFtZTogJ2ZvbGlvLnp1a29uYXJ5YS5jb20nLFxuICAgICAgc3NtRW52TmFtZTogJ3Byb2QnLFxuICAgICAgZW52Q29uZmlnOiBwcm9kRW52Q29uZmlnLFxuICAgIH0pO1xuICAgIGRvbWFpblRlbXBsYXRlID0gVGVtcGxhdGUuZnJvbVN0YWNrKGFwcC5ub2RlLmZpbmRDaGlsZCgnRnJvbnRlbmRTdGFja1dpdGhEb21haW4nKSBhcyBjZGsuU3RhY2spO1xuICB9KTtcblxuICB0ZXN0KCdDbG91ZEZyb250IGRpc3RyaWJ1dGlvbiBoYXMgY3VzdG9tIGRvbWFpbiBhbGlhcycsICgpID0+IHtcbiAgICBkb21haW5UZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoJ0FXUzo6Q2xvdWRGcm9udDo6RGlzdHJpYnV0aW9uJywge1xuICAgICAgRGlzdHJpYnV0aW9uQ29uZmlnOiBNYXRjaC5vYmplY3RMaWtlKHtcbiAgICAgICAgQWxpYXNlczogWydmb2xpby56dWtvbmFyeWEuY29tJ10sXG4gICAgICB9KSxcbiAgICB9KTtcbiAgfSk7XG5cbiAgdGVzdCgnUm91dGU1MyBBUmVjb3JkIGlzIGNyZWF0ZWQnLCAoKSA9PiB7XG4gICAgZG9tYWluVGVtcGxhdGUucmVzb3VyY2VDb3VudElzKCdBV1M6OlJvdXRlNTM6OlJlY29yZFNldCcsIDEpO1xuICB9KTtcbn0pO1xuXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuLy8gRG5zU3RhY2tcbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbmRlc2NyaWJlKCdQZGZDb252ZXJzYXRpb25EbnNTdGFjaycsICgpID0+IHtcbiAgbGV0IHRlbXBsYXRlOiBUZW1wbGF0ZTtcblxuICBiZWZvcmVBbGwoKCkgPT4ge1xuICAgIGNvbnN0IGFwcCA9IG1ha2VBcHAoKTtcbiAgICBuZXcgUGRmQ29udmVyc2F0aW9uRG5zU3RhY2soYXBwLCAnRG5zU3RhY2snLCB7XG4gICAgICBlbnY6IHsgYWNjb3VudDogQUNDT1VOVF9JRCwgcmVnaW9uOiAndXMtZWFzdC0xJyB9LFxuICAgICAgZG9tYWluTmFtZTogJ2ZvbGlvLnp1a29uYXJ5YS5jb20nLFxuICAgICAgZW52TmFtZTogJ3Byb2QnLFxuICAgIH0pO1xuICAgIHRlbXBsYXRlID0gVGVtcGxhdGUuZnJvbVN0YWNrKGFwcC5ub2RlLmZpbmRDaGlsZCgnRG5zU3RhY2snKSBhcyBjZGsuU3RhY2spO1xuICB9KTtcblxuICB0ZXN0KCdjcmVhdGVzIDEgUm91dGU1MyBob3N0ZWQgem9uZSBmb3IgZm9saW8uenVrb25hcnlhLmNvbScsICgpID0+IHtcbiAgICB0ZW1wbGF0ZS5yZXNvdXJjZUNvdW50SXMoJ0FXUzo6Um91dGU1Mzo6SG9zdGVkWm9uZScsIDEpO1xuICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcygnQVdTOjpSb3V0ZTUzOjpIb3N0ZWRab25lJywge1xuICAgICAgTmFtZTogJ2ZvbGlvLnp1a29uYXJ5YS5jb20uJyxcbiAgICB9KTtcbiAgfSk7XG5cbiAgdGVzdCgnY3JlYXRlcyAxIEFDTSBjZXJ0aWZpY2F0ZScsICgpID0+IHtcbiAgICB0ZW1wbGF0ZS5yZXNvdXJjZUNvdW50SXMoJ0FXUzo6Q2VydGlmaWNhdGVNYW5hZ2VyOjpDZXJ0aWZpY2F0ZScsIDEpO1xuICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcygnQVdTOjpDZXJ0aWZpY2F0ZU1hbmFnZXI6OkNlcnRpZmljYXRlJywge1xuICAgICAgRG9tYWluTmFtZTogJ2ZvbGlvLnp1a29uYXJ5YS5jb20nLFxuICAgICAgVmFsaWRhdGlvbk1ldGhvZDogJ0ROUycsXG4gICAgfSk7XG4gIH0pO1xuXG4gIHRlc3QoJ291dHB1dHMgaG9zdGVkIHpvbmUgSUQsIG5hbWUgc2VydmVycywgYW5kIGNlcnRpZmljYXRlIEFSTicsICgpID0+IHtcbiAgICBjb25zdCBvdXRwdXRzID0gdGVtcGxhdGUuZmluZE91dHB1dHMoJyonKTtcbiAgICBleHBlY3Qob3V0cHV0cykudG9IYXZlUHJvcGVydHkoJ1N1YmRvbWFpbkhvc3RlZFpvbmVJZCcpO1xuICAgIGV4cGVjdChvdXRwdXRzKS50b0hhdmVQcm9wZXJ0eSgnU3ViZG9tYWluTmFtZVNlcnZlcnMnKTtcbiAgICBleHBlY3Qob3V0cHV0cykudG9IYXZlUHJvcGVydHkoJ0FjbUNlcnRpZmljYXRlQXJuJyk7XG4gIH0pO1xuXG4gIHRlc3QoJ2NyZWF0ZXMgQXdzQ3VzdG9tUmVzb3VyY2UgTGFtYmRhLWJhY2tlZCBjdXN0b20gcmVzb3VyY2VzIGZvciBTU00gd3JpdGVzJywgKCkgPT4ge1xuICAgIHRlbXBsYXRlLnJlc291cmNlQ291bnRJcygnQ3VzdG9tOjpBV1MnLCAyKTtcbiAgfSk7XG5cbiAgdGVzdCgnQXdzQ3VzdG9tUmVzb3VyY2UgSUFNIHJvbGUgaGFzIFNTTSB3cml0ZSBwZXJtaXNzaW9ucyB0byB1cy13ZXN0LTInLCAoKSA9PiB7XG4gICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKCdBV1M6OklBTTo6UG9saWN5Jywge1xuICAgICAgUG9saWN5RG9jdW1lbnQ6IE1hdGNoLm9iamVjdExpa2Uoe1xuICAgICAgICBTdGF0ZW1lbnQ6IE1hdGNoLmFycmF5V2l0aChbXG4gICAgICAgICAgTWF0Y2gub2JqZWN0TGlrZSh7XG4gICAgICAgICAgICBBY3Rpb246IE1hdGNoLmFycmF5V2l0aChbJ3NzbTpQdXRQYXJhbWV0ZXInLCAnc3NtOkRlbGV0ZVBhcmFtZXRlciddKSxcbiAgICAgICAgICAgIFJlc291cmNlOiBNYXRjaC5zdHJpbmdMaWtlUmVnZXhwKCdhcm46YXdzOnNzbTp1cy13ZXN0LTIuKnBkZmNvbnYnKSxcbiAgICAgICAgICB9KSxcbiAgICAgICAgXSksXG4gICAgICB9KSxcbiAgICB9KTtcbiAgfSk7XG59KTtcblxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbi8vIFByb2QgZW52aXJvbm1lbnQ6IHVucHJlZml4ZWQgcmVzb3VyY2UgbmFtZXNcbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbmRlc2NyaWJlKCdQcm9kIGVudmlyb25tZW50IHJlc291cmNlIG5hbWVzJywgKCkgPT4ge1xuICB0ZXN0KCdEeW5hbW9EQiB0YWJsZSBuYW1lcyBhcmUgdW5wcmVmaXhlZCAobm8gc3RhY2sgbmFtZSBwcmVmaXgpJywgKCkgPT4ge1xuICAgIGNvbnN0IGFwcCA9IG1ha2VBcHAoKTtcbiAgICBjb25zdCBzZWN1cml0eSA9IGJ1aWxkU2VjdXJpdHlTdGFjayhhcHApO1xuICAgIGNvbnN0IGluZnJhID0gYnVpbGRJbmZyYVN0YWNrKGFwcCwgc2VjdXJpdHkpO1xuICAgIGNvbnN0IHRlbXBsYXRlID0gVGVtcGxhdGUuZnJvbVN0YWNrKGluZnJhKTtcblxuICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcygnQVdTOjpEeW5hbW9EQjo6VGFibGUnLCB7XG4gICAgICBUYWJsZU5hbWU6ICdwZGYtY29udmVyc2F0aW9uLW1ldGFkYXRhJyxcbiAgICB9KTtcbiAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoJ0FXUzo6RHluYW1vREI6OlRhYmxlJywge1xuICAgICAgVGFibGVOYW1lOiAncGRmLWNvbnZlcnNhdGlvbi1xdWVyeS1sb2dzJyxcbiAgICB9KTtcbiAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoJ0FXUzo6RHluYW1vREI6OlRhYmxlJywge1xuICAgICAgVGFibGVOYW1lOiAncGRmLWNvbnZlcnNhdGlvbi1jb252ZXJzYXRpb25zJyxcbiAgICB9KTtcbiAgfSk7XG5cbiAgdGVzdCgnTGFtYmRhIGZ1bmN0aW9uIG5hbWVzIGFyZSB1bnByZWZpeGVkJywgKCkgPT4ge1xuICAgIGNvbnN0IGFwcCA9IG1ha2VBcHAoKTtcbiAgICBjb25zdCBzZWN1cml0eSA9IGJ1aWxkU2VjdXJpdHlTdGFjayhhcHApO1xuICAgIGNvbnN0IGluZnJhID0gYnVpbGRJbmZyYVN0YWNrKGFwcCwgc2VjdXJpdHkpO1xuICAgIGNvbnN0IHRlbXBsYXRlID0gVGVtcGxhdGUuZnJvbVN0YWNrKGluZnJhKTtcblxuICAgIGNvbnN0IGV4cGVjdGVkTmFtZXMgPSBbXG4gICAgICAnRG9jdW1lbnRJbmdlc3Rpb25GdW5jdGlvbicsXG4gICAgICAnVGV4dHJhY3RSZXN1bHRzUHJvY2Vzc29yRnVuY3Rpb24nLFxuICAgICAgJ0JlZHJvY2tUb1MzVmVjdG9yaXphdGlvbicsXG4gICAgICAnUXVlcnlQcm9jZXNzaW5nRnVuY3Rpb24nLFxuICAgICAgJ0NvbnZlcnNhdGlvbkZ1bmN0aW9uJyxcbiAgICBdO1xuXG4gICAgZXhwZWN0ZWROYW1lcy5mb3JFYWNoKChuYW1lKSA9PiB7XG4gICAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoJ0FXUzo6TGFtYmRhOjpGdW5jdGlvbicsIHsgRnVuY3Rpb25OYW1lOiBuYW1lIH0pO1xuICAgIH0pO1xuICB9KTtcblxuICB0ZXN0KCdJQU0gcm9sZSBuYW1lcyBhcmUgdW5wcmVmaXhlZCcsICgpID0+IHtcbiAgICBjb25zdCBhcHAgPSBtYWtlQXBwKCk7XG4gICAgY29uc3Qgc2VjdXJpdHkgPSBidWlsZFNlY3VyaXR5U3RhY2soYXBwKTtcbiAgICBjb25zdCB0ZW1wbGF0ZSA9IFRlbXBsYXRlLmZyb21TdGFjayhzZWN1cml0eSk7XG5cbiAgICBjb25zdCBleHBlY3RlZFJvbGVOYW1lcyA9IFtcbiAgICAgICdUZXh0cmFjdFNlcnZpY2VSb2xlJyxcbiAgICAgICdEb2N1bWVudEluZ2VzdGlvbkZ1bmN0aW9uLXJvbGUnLFxuICAgICAgJ1RleHRyYWN0UmVzdWx0c1Byb2Nlc3NvckZ1bmN0aW9uLXJvbGUnLFxuICAgICAgJ0JlZHJvY2tUb1MzVmVjdG9yaXphdGlvbi1MYW1iZGEnLFxuICAgICAgJ1F1ZXJ5UHJvY2Vzc2luZ0Z1bmN0aW9uLXJvbGUnLFxuICAgICAgJ0NvbnZlcnNhdGlvbkZ1bmN0aW9uLXJvbGUnLFxuICAgIF07XG5cbiAgICBleHBlY3RlZFJvbGVOYW1lcy5mb3JFYWNoKChyb2xlTmFtZSkgPT4ge1xuICAgICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKCdBV1M6OklBTTo6Um9sZScsIHsgUm9sZU5hbWU6IHJvbGVOYW1lIH0pO1xuICAgIH0pO1xuICB9KTtcblxuICB0ZXN0KCdTMyBidWNrZXQgbmFtZXMgaW5jbHVkZSBhY2NvdW50IElEIHN1ZmZpeCAobm90IHN0YWNrLWdlbmVyYXRlZCknLCAoKSA9PiB7XG4gICAgY29uc3QgYXBwID0gbWFrZUFwcCgpO1xuICAgIGNvbnN0IHNlY3VyaXR5ID0gYnVpbGRTZWN1cml0eVN0YWNrKGFwcCk7XG4gICAgY29uc3QgaW5mcmEgPSBidWlsZEluZnJhU3RhY2soYXBwLCBzZWN1cml0eSk7XG4gICAgY29uc3QgdGVtcGxhdGUgPSBUZW1wbGF0ZS5mcm9tU3RhY2soaW5mcmEpO1xuXG4gICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKCdBV1M6OlMzOjpCdWNrZXQnLCB7XG4gICAgICBCdWNrZXROYW1lOiBgcGRmLWNvbnZlcnNhdGlvbi1wcm9jZXNzaW5nLSR7QUNDT1VOVF9JRH1gLFxuICAgIH0pO1xuICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcygnQVdTOjpTMzo6QnVja2V0Jywge1xuICAgICAgQnVja2V0TmFtZTogYHBkZi1jb252ZXJzYXRpb24tZGlnZXN0cy0ke0FDQ09VTlRfSUR9YCxcbiAgICB9KTtcbiAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoJ0FXUzo6UzM6OkJ1Y2tldCcsIHtcbiAgICAgIEJ1Y2tldE5hbWU6IGBwZGYtY29udmVyc2F0aW9uLXZlY3RvcnMtanNvbi0ke0FDQ09VTlRfSUR9YCxcbiAgICB9KTtcbiAgfSk7XG5cbiAgdGVzdCgnUXVlcnlQcm9jZXNzaW5nUm9sZSBoYXMgY3Jvc3MtcmVnaW9uIGZvdW5kYXRpb24gbW9kZWwgc3RhdGVtZW50IGZvciBIYWlrdSBpbmZlcmVuY2UgcHJvZmlsZScsICgpID0+IHtcbiAgICBjb25zdCBhcHAgPSBtYWtlQXBwKCk7XG4gICAgY29uc3Qgc2VjdXJpdHkgPSBidWlsZFNlY3VyaXR5U3RhY2soYXBwKTtcbiAgICBjb25zdCB0ZW1wbGF0ZSA9IFRlbXBsYXRlLmZyb21TdGFjayhzZWN1cml0eSk7XG5cbiAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoJ0FXUzo6SUFNOjpSb2xlJywge1xuICAgICAgUm9sZU5hbWU6ICdRdWVyeVByb2Nlc3NpbmdGdW5jdGlvbi1yb2xlJyxcbiAgICAgIFBvbGljaWVzOiBNYXRjaC5hcnJheVdpdGgoW1xuICAgICAgICBNYXRjaC5vYmplY3RMaWtlKHtcbiAgICAgICAgICBQb2xpY3lOYW1lOiAnUXVlcnlQcm9jZXNzaW5nUG9saWN5JyxcbiAgICAgICAgICBQb2xpY3lEb2N1bWVudDogTWF0Y2gub2JqZWN0TGlrZSh7XG4gICAgICAgICAgICBTdGF0ZW1lbnQ6IE1hdGNoLmFycmF5V2l0aChbXG4gICAgICAgICAgICAgIE1hdGNoLm9iamVjdExpa2Uoe1xuICAgICAgICAgICAgICAgIEVmZmVjdDogJ0FsbG93JyxcbiAgICAgICAgICAgICAgICBBY3Rpb246ICdiZWRyb2NrOkludm9rZU1vZGVsJyxcbiAgICAgICAgICAgICAgICBSZXNvdXJjZTogW1xuICAgICAgICAgICAgICAgICAgYGFybjphd3M6YmVkcm9jazp1cy1lYXN0LTE6OmZvdW5kYXRpb24tbW9kZWwvYW50aHJvcGljLmNsYXVkZS1oYWlrdS00LTUtMjAyNTEwMDEtdjE6MGAsXG4gICAgICAgICAgICAgICAgICBgYXJuOmF3czpiZWRyb2NrOnVzLWVhc3QtMjo6Zm91bmRhdGlvbi1tb2RlbC9hbnRocm9waWMuY2xhdWRlLWhhaWt1LTQtNS0yMDI1MTAwMS12MTowYCxcbiAgICAgICAgICAgICAgICAgIGBhcm46YXdzOmJlZHJvY2s6dXMtd2VzdC0yOjpmb3VuZGF0aW9uLW1vZGVsL2FudGhyb3BpYy5jbGF1ZGUtaGFpa3UtNC01LTIwMjUxMDAxLXYxOjBgLFxuICAgICAgICAgICAgICAgIF0sXG4gICAgICAgICAgICAgICAgQ29uZGl0aW9uOiB7XG4gICAgICAgICAgICAgICAgICBTdHJpbmdFcXVhbHM6IHtcbiAgICAgICAgICAgICAgICAgICAgJ2JlZHJvY2s6SW5mZXJlbmNlUHJvZmlsZUFybic6IGBhcm46YXdzOmJlZHJvY2s6dXMtd2VzdC0yOiR7QUNDT1VOVF9JRH06aW5mZXJlbmNlLXByb2ZpbGUvdXMuYW50aHJvcGljLmNsYXVkZS1oYWlrdS00LTUtMjAyNTEwMDEtdjE6MGAsXG4gICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgIH0pLFxuICAgICAgICAgICAgXSksXG4gICAgICAgICAgfSksXG4gICAgICAgIH0pLFxuICAgICAgXSksXG4gICAgfSk7XG4gIH0pO1xuXG4gIHRlc3QoJ0NvbnZlcnNhdGlvbkZ1bmN0aW9uUm9sZSBoYXMgY3Jvc3MtcmVnaW9uIGZvdW5kYXRpb24gbW9kZWwgc3RhdGVtZW50IGZvciBIYWlrdSBpbmZlcmVuY2UgcHJvZmlsZScsICgpID0+IHtcbiAgICBjb25zdCBhcHAgPSBtYWtlQXBwKCk7XG4gICAgY29uc3Qgc2VjdXJpdHkgPSBidWlsZFNlY3VyaXR5U3RhY2soYXBwKTtcbiAgICBjb25zdCB0ZW1wbGF0ZSA9IFRlbXBsYXRlLmZyb21TdGFjayhzZWN1cml0eSk7XG5cbiAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoJ0FXUzo6SUFNOjpSb2xlJywge1xuICAgICAgUm9sZU5hbWU6ICdDb252ZXJzYXRpb25GdW5jdGlvbi1yb2xlJyxcbiAgICAgIFBvbGljaWVzOiBNYXRjaC5hcnJheVdpdGgoW1xuICAgICAgICBNYXRjaC5vYmplY3RMaWtlKHtcbiAgICAgICAgICBQb2xpY3lOYW1lOiAnQ29udmVyc2F0aW9uRnVuY3Rpb25Qb2xpY3knLFxuICAgICAgICAgIFBvbGljeURvY3VtZW50OiBNYXRjaC5vYmplY3RMaWtlKHtcbiAgICAgICAgICAgIFN0YXRlbWVudDogTWF0Y2guYXJyYXlXaXRoKFtcbiAgICAgICAgICAgICAgTWF0Y2gub2JqZWN0TGlrZSh7XG4gICAgICAgICAgICAgICAgRWZmZWN0OiAnQWxsb3cnLFxuICAgICAgICAgICAgICAgIEFjdGlvbjogJ2JlZHJvY2s6SW52b2tlTW9kZWwnLFxuICAgICAgICAgICAgICAgIFJlc291cmNlOiBbXG4gICAgICAgICAgICAgICAgICBgYXJuOmF3czpiZWRyb2NrOnVzLWVhc3QtMTo6Zm91bmRhdGlvbi1tb2RlbC9hbnRocm9waWMuY2xhdWRlLWhhaWt1LTQtNS0yMDI1MTAwMS12MTowYCxcbiAgICAgICAgICAgICAgICAgIGBhcm46YXdzOmJlZHJvY2s6dXMtZWFzdC0yOjpmb3VuZGF0aW9uLW1vZGVsL2FudGhyb3BpYy5jbGF1ZGUtaGFpa3UtNC01LTIwMjUxMDAxLXYxOjBgLFxuICAgICAgICAgICAgICAgICAgYGFybjphd3M6YmVkcm9jazp1cy13ZXN0LTI6OmZvdW5kYXRpb24tbW9kZWwvYW50aHJvcGljLmNsYXVkZS1oYWlrdS00LTUtMjAyNTEwMDEtdjE6MGAsXG4gICAgICAgICAgICAgICAgXSxcbiAgICAgICAgICAgICAgICBDb25kaXRpb246IHtcbiAgICAgICAgICAgICAgICAgIFN0cmluZ0VxdWFsczoge1xuICAgICAgICAgICAgICAgICAgICAnYmVkcm9jazpJbmZlcmVuY2VQcm9maWxlQXJuJzogYGFybjphd3M6YmVkcm9jazp1cy13ZXN0LTI6JHtBQ0NPVU5UX0lEfTppbmZlcmVuY2UtcHJvZmlsZS91cy5hbnRocm9waWMuY2xhdWRlLWhhaWt1LTQtNS0yMDI1MTAwMS12MTowYCxcbiAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgfSksXG4gICAgICAgICAgICBdKSxcbiAgICAgICAgICB9KSxcbiAgICAgICAgfSksXG4gICAgICBdKSxcbiAgICB9KTtcbiAgfSk7XG5cbn0pO1xuIl19