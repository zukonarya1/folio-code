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
                                        'bedrock:InferenceProfileArn': `arn:aws:bedrock:us-west-2:${prodEnvConfig.accountId}:inference-profile/us.anthropic.claude-haiku-4-5-20251001-v1:0`,
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
                                        'bedrock:InferenceProfileArn': `arn:aws:bedrock:us-west-2:${prodEnvConfig.accountId}:inference-profile/us.anthropic.claude-haiku-4-5-20251001-v1:0`,
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2RrLnRlc3QuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJjZGsudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUEsaURBQW1DO0FBQ25DLHVEQUF5RDtBQUN6RCw0RkFBc0Y7QUFDdEYsc0ZBQWdGO0FBQ2hGLGdHQUEwRjtBQUMxRixvRkFBOEU7QUFDOUUsNEZBQXNGO0FBQ3RGLGtGQUE0RTtBQUM1RSxrRUFBbUU7QUFFbkUsTUFBTSxVQUFVLEdBQUcsT0FBTyxDQUFDLEdBQUcsQ0FBQyxtQkFBbUIsSUFBSSxjQUFjLENBQUM7QUFDckUsTUFBTSxNQUFNLEdBQUcsV0FBVyxDQUFDO0FBQzNCLE1BQU0sR0FBRyxHQUFHLEVBQUUsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLEVBQUUsTUFBTSxFQUFFLENBQUM7QUFDcEQsTUFBTSxhQUFhLEdBQUcsSUFBQSwyQ0FBc0IsRUFBQyxNQUFNLENBQUMsQ0FBQztBQUVyRCxTQUFTLE9BQU87SUFDZCxPQUFPLElBQUksR0FBRyxDQUFDLEdBQUcsQ0FBQztRQUNqQixPQUFPLEVBQUUsRUFBRSx5QkFBeUIsRUFBRSxFQUFFLEVBQUU7S0FDM0MsQ0FBQyxDQUFDO0FBQ0wsQ0FBQztBQUVELFNBQVMsa0JBQWtCLENBQUMsR0FBWTtJQUN0QyxPQUFPLElBQUksOERBQTRCLENBQUMsR0FBRyxFQUFFLGVBQWUsRUFBRTtRQUM1RCxHQUFHLEVBQUUsR0FBRztRQUNSLFNBQVMsRUFBRSxhQUFhO0tBQ3pCLENBQUMsQ0FBQztBQUNMLENBQUM7QUFFRCxTQUFTLGVBQWUsQ0FBQyxHQUFZLEVBQUUsUUFBc0M7SUFDM0UsT0FBTyxJQUFJLHdEQUF5QixDQUFDLEdBQUcsRUFBRSxZQUFZLEVBQUU7UUFDdEQsR0FBRyxFQUFFLEdBQUc7UUFDUixxQkFBcUIsRUFBRSxRQUFRLENBQUMscUJBQXFCO1FBQ3JELHFCQUFxQixFQUFFLFFBQVEsQ0FBQyxxQkFBcUI7UUFDckQs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QUFLLENBQUMsU0FBUyxDQUFDO2dCQUN4QixrQkFBSyxDQUFDLFVBQVUsQ0FBQztvQkFDZixVQUFVLEVBQUUsNEJBQTRCO29CQUN4QyxjQUFjLEVBQUUsa0JBQUssQ0FBQyxVQUFVLENBQUM7d0JBQy9CLFNBQVMsRUFBRSxrQkFBSyxDQUFDLFNBQVMsQ0FBQzs0QkFDekIsa0JBQUssQ0FBQyxVQUFVLENBQUM7Z0NBQ2YsTUFBTSxFQUFFLE9BQU87Z0NBQ2YsTUFBTSxFQUFFLHFCQUFxQjtnQ0FDN0IsUUFBUSxFQUFFO29DQUNSLHNGQUFzRjtvQ0FDdEYsc0ZBQXNGO29DQUN0RixzRkFBc0Y7aUNBQ3ZGO2dDQUNELFNBQVMsRUFBRTtvQ0FDVCxZQUFZLEVBQUU7d0NBQ1osNkJBQTZCLEVBQUUsNkJBQTZCLGFBQWEsQ0FBQyxTQUFTLGdFQUFnRTtxQ0FDcEo7aUNBQ0Y7NkJBQ0YsQ0FBQzt5QkFDSCxDQUFDO3FCQUNILENBQUM7aUJBQ0gsQ0FBQzthQUNILENBQUM7U0FDSCxDQUFDLENBQUM7SUFDTCxDQUFDLENBQUMsQ0FBQztBQUVMLENBQUMsQ0FBQyxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgY2RrIGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCB7IFRlbXBsYXRlLCBNYXRjaCB9IGZyb20gJ2F3cy1jZGstbGliL2Fzc2VydGlvbnMnO1xuaW1wb3J0IHsgUGRmQ29udmVyc2F0aW9uU2VjdXJpdHlTdGFjayB9IGZyb20gJy4uL2xpYi9wZGYtY29udmVyc2F0aW9uLXNlY3VyaXR5LXN0YWNrJztcbmltcG9ydCB7IFBkZkNvbnZlcnNhdGlvbkluZnJhU3RhY2sgfSBmcm9tICcuLi9saWIvcGRmLWNvbnZlcnNhdGlvbi1pbmZyYS1zdGFjayc7XG5pbXBvcnQgeyBQZGZDb252ZXJzYXRpb25Nb25pdG9yaW5nU3RhY2sgfSBmcm9tICcuLi9saWIvcGRmLWNvbnZlcnNhdGlvbi1tb25pdG9yaW5nLXN0YWNrJztcbmltcG9ydCB7IFBkZkNvbnZlcnNhdGlvbkF1dGhTdGFjayB9IGZyb20gJy4uL2xpYi9wZGYtY29udmVyc2F0aW9uLWF1dGgtc3RhY2snO1xuaW1wb3J0IHsgUGRmQ29udmVyc2F0aW9uRnJvbnRlbmRTdGFjayB9IGZyb20gJy4uL2xpYi9wZGYtY29udmVyc2F0aW9uLWZyb250ZW5kLXN0YWNrJztcbmltcG9ydCB7IFBkZkNvbnZlcnNhdGlvbkRuc1N0YWNrIH0gZnJvbSAnLi4vbGliL3BkZi1jb252ZXJzYXRpb24tZG5zLXN0YWNrJztcbmltcG9ydCB7IGJ1aWxkRW52aXJvbm1lbnRDb25maWcgfSBmcm9tICcuLi9saWIvZW52aXJvbm1lbnQtY29uZmlnJztcblxuY29uc3QgQUNDT1VOVF9JRCA9IHByb2Nlc3MuZW52LkNES19ERUZBVUxUX0FDQ09VTlQgfHwgJzEyMzQ1Njc4OTAxMic7XG5jb25zdCBSRUdJT04gPSAndXMtd2VzdC0yJztcbmNvbnN0IEVOViA9IHsgYWNjb3VudDogQUNDT1VOVF9JRCwgcmVnaW9uOiBSRUdJT04gfTtcbmNvbnN0IHByb2RFbnZDb25maWcgPSBidWlsZEVudmlyb25tZW50Q29uZmlnKCdwcm9kJyk7XG5cbmZ1bmN0aW9uIG1ha2VBcHAoKTogY2RrLkFwcCB7XG4gIHJldHVybiBuZXcgY2RrLkFwcCh7XG4gICAgY29udGV4dDogeyAnYXdzOmNkazpidW5kbGluZy1zdGFja3MnOiBbXSB9LFxuICB9KTtcbn1cblxuZnVuY3Rpb24gYnVpbGRTZWN1cml0eVN0YWNrKGFwcDogY2RrLkFwcCk6IFBkZkNvbnZlcnNhdGlvblNlY3VyaXR5U3RhY2sge1xuICByZXR1cm4gbmV3IFBkZkNvbnZlcnNhdGlvblNlY3VyaXR5U3RhY2soYXBwLCAnU2VjdXJpdHlTdGFjaycsIHtcbiAgICBlbnY6IEVOVixcbiAgICBlbnZDb25maWc6IHByb2RFbnZDb25maWcsXG4gIH0pO1xufVxuXG5mdW5jdGlvbiBidWlsZEluZnJhU3RhY2soYXBwOiBjZGsuQXBwLCBzZWN1cml0eTogUGRmQ29udmVyc2F0aW9uU2VjdXJpdHlTdGFjayk6IFBkZkNvbnZlcnNhdGlvbkluZnJhU3RhY2sge1xuICByZXR1cm4gbmV3IFBkZkNvbnZlcnNhdGlvbkluZnJhU3RhY2soYXBwLCAnSW5mcmFTdGFjaycsIHtcbiAgICBlbnY6IEVOVixcbiAgICBkb2N1bWVudEluZ2VzdGlvblJvbGU6IHNlY3VyaXR5LmRvY3VtZW50SW5nZXN0aW9uUm9sZSxcbiAgICB0ZXh0cmFjdFByb2Nlc3NvclJvbGU6IHNlY3VyaXR5LnRleHRyYWN0UHJvY2Vzc29yUm9sZSxcbiAgICB0ZXh0cmFjdFJlc3VsdHNQcm9jZXNzb3JSb2xlOiBzZWN1cml0eS50ZXh0cmFjdFJlc3VsdHNQcm9jZXNzb3JSb2xlLFxuICAgIGJlZHJvY2tWZWN0b3JpemF0aW9uUm9sZTogc2VjdXJpdHkuYmVkcm9ja1ZlY3Rvcml6YXRpb25Sb2xlLFxuICAgIHF1ZXJ5UHJvY2Vzc2luZ1JvbGU6IHNlY3VyaXR5LnF1ZXJ5UHJvY2Vzc2luZ1JvbGUsXG4gICAgY29udmVyc2F0aW9uRnVuY3Rpb25Sb2xlOiBzZWN1cml0eS5jb252ZXJzYXRpb25GdW5jdGlvblJvbGUsXG4gICAgdXNhZ2VGdW5jdGlvblJvbGU6IHNlY3VyaXR5LnVzYWdlRnVuY3Rpb25Sb2xlLFxuICAgIGVudkNvbmZpZzogcHJvZEVudkNvbmZpZyxcbiAgfSk7XG59XG5cbmZ1bmN0aW9uIGJ1aWxkTW9uaXRvcmluZ1N0YWNrKGFwcDogY2RrLkFwcCwgaW5mcmE6IFBkZkNvbnZlcnNhdGlvbkluZnJhU3RhY2spOiBQZGZDb252ZXJzYXRpb25Nb25pdG9yaW5nU3RhY2sge1xuICByZXR1cm4gbmV3IFBkZkNvbnZlcnNhdGlvbk1vbml0b3JpbmdTdGFjayhhcHAsICdNb25pdG9yaW5nU3RhY2snLCB7XG4gICAgZW52OiBFTlYsXG4gICAgZG9jdW1lbnRJbmdlc3Rpb25GdW5jdGlvbjogaW5mcmEuZG9jdW1lbnRJbmdlc3Rpb25GdW5jdGlvbixcbiAgICBxdWVyeVByb2Nlc3NpbmdGdW5jdGlvbjogaW5mcmEucXVlcnlQcm9jZXNzaW5nRnVuY3Rpb24sXG4gICAgc3R1ZHlCb29rRnVuY3Rpb246IGluZnJhLnN0dWR5Qm9va0Z1bmN0aW9uLFxuICAgIHN0dWR5Qm9va0RscTogaW5mcmEuc3R1ZHlCb29rRGxxLFxuICAgIHRleHRyYWN0UmVzdWx0c1Byb2Nlc3NvckZ1bmN0aW9uOiBpbmZyYS50ZXh0cmFjdFJlc3VsdHNQcm9jZXNzb3JGdW5jdGlvbixcbiAgICBiZWRyb2NrVmVjdG9yaXphdGlvbkZ1bmN0aW9uOiBpbmZyYS5iZWRyb2NrVmVjdG9yaXphdGlvbkZ1bmN0aW9uLFxuICAgIGNvbnZlcnNhdGlvbkZ1bmN0aW9uOiBpbmZyYS5jb252ZXJzYXRpb25GdW5jdGlvbixcbiAgICBtZXRhZGF0YVRhYmxlOiBpbmZyYS5tZXRhZGF0YVRhYmxlLFxuICAgIHF1ZXJ5TG9nc1RhYmxlOiBpbmZyYS5xdWVyeUxvZ3NUYWJsZSxcbiAgICBwcm9jZXNzaW5nQnVja2V0OiBpbmZyYS5wcm9jZXNzaW5nQnVja2V0LFxuICAgIHZlY3RvcnNKc29uQnVja2V0OiBpbmZyYS52ZWN0b3JzSnNvbkJ1Y2tldCxcbiAgICBlbnZDb25maWc6IHByb2RFbnZDb25maWcsXG4gIH0pO1xufVxuXG5mdW5jdGlvbiBidWlsZEF1dGhTdGFjayhhcHA6IGNkay5BcHAsIGluZnJhOiBQZGZDb252ZXJzYXRpb25JbmZyYVN0YWNrKTogUGRmQ29udmVyc2F0aW9uQXV0aFN0YWNrIHtcbiAgcmV0dXJuIG5ldyBQZGZDb252ZXJzYXRpb25BdXRoU3RhY2soYXBwLCAnQXV0aFN0YWNrJywge1xuICAgIGVudjogRU5WLFxuICAgIHF1ZXJ5UHJvY2Vzc2luZ0Z1bmN0aW9uOiBpbmZyYS5xdWVyeVByb2Nlc3NpbmdGdW5jdGlvbixcbiAgICBkb2N1bWVudEluZ2VzdGlvbkZ1bmN0aW9uOiBpbmZyYS5kb2N1bWVudEluZ2VzdGlvbkZ1bmN0aW9uLFxuICAgIHByb2Nlc3NpbmdCdWNrZXQ6IGluZnJhLnByb2Nlc3NpbmdCdWNrZXQsXG4gICAgbWV0YWRhdGFUYWJsZU5hbWU6IGluZnJhLm1ldGFkYXRhVGFibGUudGFibGVOYW1lLFxuICAgIGNvbnZlcnNhdGlvbkZ1bmN0aW9uOiBpbmZyYS5jb252ZXJzYXRpb25GdW5jdGlvbixcbiAgICB1c2FnZUZ1bmN0aW9uOiBpbmZyYS51c2FnZUZ1bmN0aW9uLFxuICAgIGVudkNvbmZpZzogcHJvZEVudkNvbmZpZyxcbiAgfSk7XG59XG5cbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4vLyBTZWN1cml0eVN0YWNrXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG5kZXNjcmliZSgnUGRmQ29udmVyc2F0aW9uU2VjdXJpdHlTdGFjaycsICgpID0+IHtcbiAgbGV0IHRlbXBsYXRlOiBUZW1wbGF0ZTtcblxuICBiZWZvcmVBbGwoKCkgPT4ge1xuICAgIGNvbnN0IGFwcCA9IG1ha2VBcHAoKTtcbiAgICBjb25zdCBzdGFjayA9IGJ1aWxkU2VjdXJpdHlTdGFjayhhcHApO1xuICAgIHRlbXBsYXRlID0gVGVtcGxhdGUuZnJvbVN0YWNrKHN0YWNrKTtcbiAgfSk7XG5cbiAgdGVzdCgnY3JlYXRlcyBleGFjdGx5IDggSUFNIHJvbGVzJywgKCkgPT4ge1xuICAgIHRlbXBsYXRlLnJlc291cmNlQ291bnRJcygnQVdTOjpJQU06OlJvbGUnLCA4KTtcbiAgfSk7XG5cbiAgdGVzdCgnVGV4dHJhY3RTZXJ2aWNlUm9sZSBoYXMgY29ycmVjdCB0cnVzdCBwcmluY2lwYWwnLCAoKSA9PiB7XG4gICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKCdBV1M6OklBTTo6Um9sZScsIHtcbiAgICAgIFJvbGVOYW1lOiAnVGV4dHJhY3RTZXJ2aWNlUm9sZScsXG4gICAgICBBc3N1bWVSb2xlUG9saWN5RG9jdW1lbnQ6IE1hdGNoLm9iamVjdExpa2Uoe1xuICAgICAgICBTdGF0ZW1lbnQ6IE1hdGNoLmFycmF5V2l0aChbXG4gICAgICAgICAgTWF0Y2gub2JqZWN0TGlrZSh7XG4gICAgICAgICAgICBQcmluY2lwYWw6IHsgU2VydmljZTogJ3RleHRyYWN0LmFtYXpvbmF3cy5jb20nIH0sXG4gICAgICAgICAgICBBY3Rpb246ICdzdHM6QXNzdW1lUm9sZScsXG4gICAgICAgICAgfSksXG4gICAgICAgIF0pLFxuICAgICAgfSksXG4gICAgfSk7XG4gIH0pO1xuXG4gIHRlc3QoJ0RvY3VtZW50SW5nZXN0aW9uUm9sZSBoYXMgY29ycmVjdCByb2xlIG5hbWUnLCAoKSA9PiB7XG4gICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKCdBV1M6OklBTTo6Um9sZScsIHtcbiAgICAgIFJvbGVOYW1lOiAnRG9jdW1lbnRJbmdlc3Rpb25GdW5jdGlvbi1yb2xlJyxcbiAgICB9KTtcbiAgfSk7XG5cbiAgdGVzdCgnQmVkcm9ja1ZlY3Rvcml6YXRpb25Sb2xlIGhhcyBjb3JyZWN0IHJvbGUgbmFtZScsICgpID0+IHtcbiAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoJ0FXUzo6SUFNOjpSb2xlJywge1xuICAgICAgUm9sZU5hbWU6ICdCZWRyb2NrVG9TM1ZlY3Rvcml6YXRpb24tTGFtYmRhJyxcbiAgICB9KTtcbiAgfSk7XG5cbiAgdGVzdCgnUXVlcnlQcm9jZXNzaW5nUm9sZSBoYXMgY29ycmVjdCByb2xlIG5hbWUnLCAoKSA9PiB7XG4gICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKCdBV1M6OklBTTo6Um9sZScsIHtcbiAgICAgIFJvbGVOYW1lOiAnUXVlcnlQcm9jZXNzaW5nRnVuY3Rpb24tcm9sZScsXG4gICAgfSk7XG4gIH0pO1xuXG4gIHRlc3QoJ0NvbnZlcnNhdGlvbkZ1bmN0aW9uUm9sZSBoYXMgY29ycmVjdCByb2xlIG5hbWUnLCAoKSA9PiB7XG4gICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKCdBV1M6OklBTTo6Um9sZScsIHtcbiAgICAgIFJvbGVOYW1lOiAnQ29udmVyc2F0aW9uRnVuY3Rpb24tcm9sZScsXG4gICAgfSk7XG4gIH0pO1xuXG4gIHRlc3QoJ1RleHRyYWN0UmVzdWx0c1Byb2Nlc3NvclJvbGUgaGFzIGNvcnJlY3Qgcm9sZSBuYW1lJywgKCkgPT4ge1xuICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcygnQVdTOjpJQU06OlJvbGUnLCB7XG4gICAgICBSb2xlTmFtZTogJ1RleHRyYWN0UmVzdWx0c1Byb2Nlc3NvckZ1bmN0aW9uLXJvbGUnLFxuICAgIH0pO1xuICB9KTtcblxuICB0ZXN0KCdhbGwgTGFtYmRhIHJvbGVzIHVzZSBBV1NMYW1iZGFCYXNpY0V4ZWN1dGlvblJvbGUgbWFuYWdlZCBwb2xpY3knLCAoKSA9PiB7XG4gICAgY29uc3QgbGFtYmRhUm9sZU5hbWVzID0gW1xuICAgICAgJ0RvY3VtZW50SW5nZXN0aW9uRnVuY3Rpb24tcm9sZScsXG4gICAgICAnVGV4dHJhY3RQcm9jZXNzb3JGdW5jdGlvbi1yb2xlJyxcbiAgICAgICdUZXh0cmFjdFJlc3VsdHNQcm9jZXNzb3JGdW5jdGlvbi1yb2xlJyxcbiAgICAgICdCZWRyb2NrVG9TM1ZlY3Rvcml6YXRpb24tTGFtYmRhJyxcbiAgICAgICdRdWVyeVByb2Nlc3NpbmdGdW5jdGlvbi1yb2xlJyxcbiAgICAgICdDb252ZXJzYXRpb25GdW5jdGlvbi1yb2xlJyxcbiAgICBdO1xuXG4gICAgbGFtYmRhUm9sZU5hbWVzLmZvckVhY2goKHJvbGVOYW1lKSA9PiB7XG4gICAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoJ0FXUzo6SUFNOjpSb2xlJywge1xuICAgICAgICBSb2xlTmFtZTogcm9sZU5hbWUsXG4gICAgICAgIE1hbmFnZWRQb2xpY3lBcm5zOiBNYXRjaC5hcnJheVdpdGgoW1xuICAgICAgICAgIE1hdGNoLm9iamVjdExpa2Uoe1xuICAgICAgICAgICAgJ0ZuOjpKb2luJzogTWF0Y2guYXJyYXlXaXRoKFtcbiAgICAgICAgICAgICAgTWF0Y2guYXJyYXlXaXRoKFtcbiAgICAgICAgICAgICAgICBNYXRjaC5zdHJpbmdMaWtlUmVnZXhwKCdBV1NMYW1iZGFCYXNpY0V4ZWN1dGlvblJvbGUnKSxcbiAgICAgICAgICAgICAgXSksXG4gICAgICAgICAgICBdKSxcbiAgICAgICAgICB9KSxcbiAgICAgICAgXSksXG4gICAgICB9KTtcbiAgICB9KTtcbiAgfSk7XG5cbiAgdGVzdCgnZXhwb3J0cyA3IHJvbGUgQVJOcyBhcyBDbG91ZEZvcm1hdGlvbiBvdXRwdXRzJywgKCkgPT4ge1xuICAgIGNvbnN0IG91dHB1dHMgPSB0ZW1wbGF0ZS5maW5kT3V0cHV0cygnKicpO1xuICAgIGNvbnN0IGV4cG9ydE5hbWVzID0gT2JqZWN0LnZhbHVlcyhvdXRwdXRzKVxuICAgICAgLm1hcCgobzogeyBFeHBvcnQ/OiB7IE5hbWU/OiBzdHJpbmcgfSB9KSA9PiBvLkV4cG9ydD8uTmFtZSlcbiAgICAgIC5maWx0ZXIoQm9vbGVhbik7XG5cbiAgICBleHBlY3QoZXhwb3J0TmFtZXMpLnRvQ29udGFpbigncGRmLWNvbnZlcnNhdGlvbi1kb2N1bWVudC1pbmdlc3Rpb24tcm9sZS1hcm4nKTtcbiAgICBleHBlY3QoZXhwb3J0TmFtZXMpLnRvQ29udGFpbigncGRmLWNvbnZlcnNhdGlvbi1iZWRyb2NrLXZlY3Rvcml6YXRpb24tcm9sZS1hcm4nKTtcbiAgICBleHBlY3QoZXhwb3J0TmFtZXMpLnRvQ29udGFpbigncGRmLWNvbnZlcnNhdGlvbi1xdWVyeS1wcm9jZXNzaW5nLXJvbGUtYXJuJyk7XG4gICAgZXhwZWN0KGV4cG9ydE5hbWVzKS50b0NvbnRhaW4oJ3BkZi1jb252ZXJzYXRpb24tdGV4dHJhY3Qtc2VydmljZS1yb2xlLWFybicpO1xuICAgIGV4cGVjdChleHBvcnROYW1lcykudG9Db250YWluKCdwZGYtY29udmVyc2F0aW9uLWNvbnZlcnNhdGlvbi1mdW5jdGlvbi1yb2xlLWFybicpO1xuICB9KTtcbn0pO1xuXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuLy8gSW5mcmFTdGFja1xuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuZGVzY3JpYmUoJ1BkZkNvbnZlcnNhdGlvbkluZnJhU3RhY2snLCAoKSA9PiB7XG4gIGxldCB0ZW1wbGF0ZTogVGVtcGxhdGU7XG5cbiAgYmVmb3JlQWxsKCgpID0+IHtcbiAgICBjb25zdCBhcHAgPSBtYWtlQXBwKCk7XG4gICAgY29uc3Qgc2VjdXJpdHkgPSBidWlsZFNlY3VyaXR5U3RhY2soYXBwKTtcbiAgICBjb25zdCBpbmZyYSA9IGJ1aWxkSW5mcmFTdGFjayhhcHAsIHNlY3VyaXR5KTtcbiAgICB0ZW1wbGF0ZSA9IFRlbXBsYXRlLmZyb21TdGFjayhpbmZyYSk7XG4gIH0pO1xuXG4gIHRlc3QoJ2NyZWF0ZXMgMyBTMyBidWNrZXRzIChwcm9jZXNzaW5nLCBkaWdlc3RzLCB2ZWN0b3JzLWpzb24pJywgKCkgPT4ge1xuICAgIHRlbXBsYXRlLnJlc291cmNlQ291bnRJcygnQVdTOjpTMzo6QnVja2V0JywgMyk7XG4gIH0pO1xuXG4gIHRlc3QoJ3Byb2Nlc3NpbmcgYnVja2V0IGhhcyBTM19NQU5BR0VEIGVuY3J5cHRpb24gYW5kIGJsb2NrcyBwdWJsaWMgYWNjZXNzJywgKCkgPT4ge1xuICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcygnQVdTOjpTMzo6QnVja2V0Jywge1xuICAgICAgQnVja2V0TmFtZTogYHBkZi1jb252ZXJzYXRpb24tcHJvY2Vzc2luZy0ke0FDQ09VTlRfSUR9YCxcbiAgICAgIEJ1Y2tldEVuY3J5cHRpb246IHtcbiAgICAgICAgU2VydmVyU2lkZUVuY3J5cHRpb25Db25maWd1cmF0aW9uOiBNYXRjaC5hcnJheVdpdGgoW1xuICAgICAgICAgIE1hdGNoLm9iamVjdExpa2Uoe1xuICAgICAgICAgICAgU2VydmVyU2lkZUVuY3J5cHRpb25CeURlZmF1bHQ6IHsgU1NFQWxnb3JpdGhtOiAnQUVTMjU2JyB9LFxuICAgICAgICAgIH0pLFxuICAgICAgICBdKSxcbiAgICAgIH0sXG4gICAgICBQdWJsaWNBY2Nlc3NCbG9ja0NvbmZpZ3VyYXRpb246IHtcbiAgICAgICAgQmxvY2tQdWJsaWNBY2xzOiB0cnVlLFxuICAgICAgICBCbG9ja1B1YmxpY1BvbGljeTogdHJ1ZSxcbiAgICAgICAgSWdub3JlUHVibGljQWNsczogdHJ1ZSxcbiAgICAgICAgUmVzdHJpY3RQdWJsaWNCdWNrZXRzOiB0cnVlLFxuICAgICAgfSxcbiAgICB9KTtcbiAgfSk7XG5cbiAgdGVzdCgnZGlnZXN0cyBidWNrZXQgaGFzIFMzX01BTkFHRUQgZW5jcnlwdGlvbicsICgpID0+IHtcbiAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoJ0FXUzo6UzM6OkJ1Y2tldCcsIHtcbiAgICAgIEJ1Y2tldE5hbWU6IGBwZGYtY29udmVyc2F0aW9uLWRpZ2VzdHMtJHtBQ0NPVU5UX0lEfWAsXG4gICAgICBCdWNrZXRFbmNyeXB0aW9uOiB7XG4gICAgICAgIFNlcnZlclNpZGVFbmNyeXB0aW9uQ29uZmlndXJhdGlvbjogTWF0Y2guYXJyYXlXaXRoKFtcbiAgICAgICAgICBNYXRjaC5vYmplY3RMaWtlKHtcbiAgICAgICAgICAgIFNlcnZlclNpZGVFbmNyeXB0aW9uQnlEZWZhdWx0OiB7IFNTRUFsZ29yaXRobTogJ0FFUzI1NicgfSxcbiAgICAgICAgICB9KSxcbiAgICAgICAgXSksXG4gICAgICB9LFxuICAgIH0pO1xuICB9KTtcblxuICB0ZXN0KCd2ZWN0b3JzLWpzb24gYnVja2V0IGhhcyBTM19NQU5BR0VEIGVuY3J5cHRpb24nLCAoKSA9PiB7XG4gICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKCdBV1M6OlMzOjpCdWNrZXQnLCB7XG4gICAgICBCdWNrZXROYW1lOiBgcGRmLWNvbnZlcnNhdGlvbi12ZWN0b3JzLWpzb24tJHtBQ0NPVU5UX0lEfWAsXG4gICAgfSk7XG4gIH0pO1xuXG4gIHRlc3QoJ2NyZWF0ZXMgNCBEeW5hbW9EQiB0YWJsZXMnLCAoKSA9PiB7XG4gICAgdGVtcGxhdGUucmVzb3VyY2VDb3VudElzKCdBV1M6OkR5bmFtb0RCOjpUYWJsZScsIDQpO1xuICB9KTtcblxuICB0ZXN0KCdtZXRhZGF0YSB0YWJsZSBoYXMgY29ycmVjdCBuYW1lIGFuZCBQQVlfUEVSX1JFUVVFU1QgYmlsbGluZycsICgpID0+IHtcbiAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoJ0FXUzo6RHluYW1vREI6OlRhYmxlJywge1xuICAgICAgVGFibGVOYW1lOiAncGRmLWNvbnZlcnNhdGlvbi1tZXRhZGF0YScsXG4gICAgICBCaWxsaW5nTW9kZTogJ1BBWV9QRVJfUkVRVUVTVCcsXG4gICAgICBLZXlTY2hlbWE6IE1hdGNoLmFycmF5V2l0aChbXG4gICAgICAgIHsgQXR0cmlidXRlTmFtZTogJ2RvY3VtZW50X2lkJywgS2V5VHlwZTogJ0hBU0gnIH0sXG4gICAgICBdKSxcbiAgICB9KTtcbiAgfSk7XG5cbiAgdGVzdCgncXVlcnktbG9ncyB0YWJsZSBoYXMgVFRMIGF0dHJpYnV0ZScsICgpID0+IHtcbiAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoJ0FXUzo6RHluYW1vREI6OlRhYmxlJywge1xuICAgICAgVGFibGVOYW1lOiAncGRmLWNvbnZlcnNhdGlvbi1xdWVyeS1sb2dzJyxcbiAgICAgIFRpbWVUb0xpdmVTcGVjaWZpY2F0aW9uOiB7IEF0dHJpYnV0ZU5hbWU6ICd0dGwnLCBFbmFibGVkOiB0cnVlIH0sXG4gICAgfSk7XG4gIH0pO1xuXG4gIHRlc3QoJ2NvbnZlcnNhdGlvbnMgdGFibGUgaGFzIGNvcnJlY3QgcGFydGl0aW9uIGtleScsICgpID0+IHtcbiAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoJ0FXUzo6RHluYW1vREI6OlRhYmxlJywge1xuICAgICAgVGFibGVOYW1lOiAncGRmLWNvbnZlcnNhdGlvbi1jb252ZXJzYXRpb25zJyxcbiAgICAgIEtleVNjaGVtYTogTWF0Y2guYXJyYXlXaXRoKFtcbiAgICAgICAgeyBBdHRyaWJ1dGVOYW1lOiAnY29udmVyc2F0aW9uX2lkJywgS2V5VHlwZTogJ0hBU0gnIH0sXG4gICAgICBdKSxcbiAgICB9KTtcbiAgfSk7XG5cbiAgdGVzdCgnaGFzIGZvbGlvLXVzYWdlIER5bmFtb0RCIHRhYmxlIHdpdGggVFRMJywgKCkgPT4ge1xuICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcygnQVdTOjpEeW5hbW9EQjo6VGFibGUnLCB7XG4gICAgICBUYWJsZU5hbWU6ICdmb2xpby11c2FnZScsXG4gICAgICBUaW1lVG9MaXZlU3BlY2lmaWNhdGlvbjogeyBBdHRyaWJ1dGVOYW1lOiAndHRsJywgRW5hYmxlZDogdHJ1ZSB9LFxuICAgICAgS2V5U2NoZW1hOiBNYXRjaC5hcnJheVdpdGgoW1xuICAgICAgICB7IEF0dHJpYnV0ZU5hbWU6ICd1c2VyX2lkJywgS2V5VHlwZTogJ0hBU0gnIH0sXG4gICAgICAgIHsgQXR0cmlidXRlTmFtZTogJ21vbnRoX2tleScsIEtleVR5cGU6ICdSQU5HRScgfSxcbiAgICAgIF0pLFxuICAgIH0pO1xuICB9KTtcblxuICB0ZXN0KCdEb2N1bWVudEluZ2VzdGlvbkZ1bmN0aW9uIGhhcyBVU0FHRV9UQUJMRSBlbnYgdmFyJywgKCkgPT4ge1xuICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcygnQVdTOjpMYW1iZGE6OkZ1bmN0aW9uJywge1xuICAgICAgRnVuY3Rpb25OYW1lOiAnRG9jdW1lbnRJbmdlc3Rpb25GdW5jdGlvbicsXG4gICAgICBFbnZpcm9ubWVudDoge1xuICAgICAgICBWYXJpYWJsZXM6IE1hdGNoLm9iamVjdExpa2UoeyBVU0FHRV9UQUJMRTogTWF0Y2guYW55VmFsdWUoKSB9KSxcbiAgICAgIH0sXG4gICAgfSk7XG4gIH0pO1xuXG4gIHRlc3QoJ2NyZWF0ZXMgMiBTTlMgdG9waWNzICh0ZXh0cmFjdC1jb21wbGV0aW9uIGFuZCB2ZWN0b3JpemF0aW9uLWNvbXBsZXRlKScsICgpID0+IHtcbiAgICB0ZW1wbGF0ZS5yZXNvdXJjZUNvdW50SXMoJ0FXUzo6U05TOjpUb3BpYycsIDIpO1xuICB9KTtcblxuICB0ZXN0KCd0ZXh0cmFjdC1jb21wbGV0aW9uIFNOUyB0b3BpYyBleGlzdHMnLCAoKSA9PiB7XG4gICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKCdBV1M6OlNOUzo6VG9waWMnLCB7XG4gICAgICBUb3BpY05hbWU6ICd0ZXh0cmFjdC1jb21wbGV0aW9uJyxcbiAgICB9KTtcbiAgfSk7XG5cbiAgdGVzdCgndmVjdG9yaXphdGlvbi1jb21wbGV0ZSBTTlMgdG9waWMgZXhpc3RzJywgKCkgPT4ge1xuICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcygnQVdTOjpTTlM6OlRvcGljJywge1xuICAgICAgVG9waWNOYW1lOiAndmVjdG9yaXphdGlvbi1jb21wbGV0ZScsXG4gICAgfSk7XG4gIH0pO1xuXG4gIHRlc3QoJ1N0dWR5Qm9va1F1ZXVlIFNRUyBxdWV1ZSBleGlzdHMgd2l0aCBjb3JyZWN0IHZpc2liaWxpdHkgdGltZW91dCcsICgpID0+IHtcbiAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoJ0FXUzo6U1FTOjpRdWV1ZScsIHtcbiAgICAgIFF1ZXVlTmFtZTogJ1N0dWR5Qm9va1F1ZXVlJyxcbiAgICAgIFZpc2liaWxpdHlUaW1lb3V0OiA5NjAsXG4gICAgfSk7XG4gIH0pO1xuXG4gIHRlc3QoJ0RvY3VtZW50SW5nZXN0aW9uRnVuY3Rpb24gaGFzIGNvcnJlY3QgbmFtZSBhbmQgcnVudGltZScsICgpID0+IHtcbiAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoJ0FXUzo6TGFtYmRhOjpGdW5jdGlvbicsIHtcbiAgICAgIEZ1bmN0aW9uTmFtZTogJ0RvY3VtZW50SW5nZXN0aW9uRnVuY3Rpb24nLFxuICAgICAgUnVudGltZTogJ3B5dGhvbjMuMTMnLFxuICAgICAgSGFuZGxlcjogJ2luZGV4LmxhbWJkYV9oYW5kbGVyJyxcbiAgICAgIFRpbWVvdXQ6IDMwMCxcbiAgICAgIE1lbW9yeVNpemU6IDUxMixcbiAgICB9KTtcbiAgfSk7XG5cbiAgdGVzdCgnVGV4dHJhY3RSZXN1bHRzUHJvY2Vzc29yRnVuY3Rpb24gaGFzIGNvcnJlY3QgbmFtZSBhbmQgdGltZW91dCcsICgpID0+IHtcbiAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoJ0FXUzo6TGFtYmRhOjpGdW5jdGlvbicsIHtcbiAgICAgIEZ1bmN0aW9uTmFtZTogJ1RleHRyYWN0UmVzdWx0c1Byb2Nlc3NvckZ1bmN0aW9uJyxcbiAgICAgIFJ1bnRpbWU6ICdweXRob24zLjEzJyxcbiAgICAgIFRpbWVvdXQ6IDkwMCxcbiAgICAgIE1lbW9yeVNpemU6IDEwMjQsXG4gICAgfSk7XG4gIH0pO1xuXG4gIHRlc3QoJ0JlZHJvY2tUb1MzVmVjdG9yaXphdGlvbiBmdW5jdGlvbiBleGlzdHMnLCAoKSA9PiB7XG4gICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKCdBV1M6OkxhbWJkYTo6RnVuY3Rpb24nLCB7XG4gICAgICBGdW5jdGlvbk5hbWU6ICdCZWRyb2NrVG9TM1ZlY3Rvcml6YXRpb24nLFxuICAgICAgUnVudGltZTogJ3B5dGhvbjMuOScsXG4gICAgfSk7XG4gIH0pO1xuXG4gIHRlc3QoJ0RvY3VtZW50U2VhcmNoRnVuY3Rpb24gZXhpc3RzIHdpdGggY29ycmVjdCBjb25maWd1cmF0aW9uJywgKCkgPT4ge1xuICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcygnQVdTOjpMYW1iZGE6OkZ1bmN0aW9uJywge1xuICAgICAgRnVuY3Rpb25OYW1lOiAnUXVlcnlQcm9jZXNzaW5nRnVuY3Rpb24nLFxuICAgICAgUnVudGltZTogJ3B5dGhvbjMuMTMnLFxuICAgICAgVGltZW91dDogMzAsXG4gICAgICBNZW1vcnlTaXplOiA1MTIsXG4gICAgICBFbnZpcm9ubWVudDogTWF0Y2gub2JqZWN0TGlrZSh7XG4gICAgICAgIFZhcmlhYmxlczogTWF0Y2gub2JqZWN0TGlrZSh7XG4gICAgICAgICAgTUFYX1JFU1VMVFNfTElNSVQ6ICcxMDAnLFxuICAgICAgICAgIFMzX1ZFQ1RPUlNfQlVDS0VUOiBgcGRmLWNvbnZlcnNhdGlvbi12ZWN0b3JzLSR7QUNDT1VOVF9JRH1gLFxuICAgICAgICAgIFMzX1ZFQ1RPUl9JTkRFWF9OQU1FOiAnZG9jdW1lbnQtY2h1bmtzLWluZGV4JyxcbiAgICAgICAgfSksXG4gICAgICB9KSxcbiAgICB9KTtcbiAgfSk7XG5cbiAgdGVzdCgnU3R1ZHlCb29rRnVuY3Rpb24gZXhpc3RzIHdpdGggY29ycmVjdCBjb25maWd1cmF0aW9uJywgKCkgPT4ge1xuICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcygnQVdTOjpMYW1iZGE6OkZ1bmN0aW9uJywge1xuICAgICAgRnVuY3Rpb25OYW1lOiAnU3R1ZHlCb29rRnVuY3Rpb24nLFxuICAgICAgUnVudGltZTogJ3B5dGhvbjMuMTMnLFxuICAgICAgVGltZW91dDogOTAwLFxuICAgICAgTWVtb3J5U2l6ZTogMTAyNCxcbiAgICAgIEVudmlyb25tZW50OiBNYXRjaC5vYmplY3RMaWtlKHtcbiAgICAgICAgVmFyaWFibGVzOiBNYXRjaC5vYmplY3RMaWtlKHtcbiAgICAgICAgICBIQUlLVV9NT0RFTF9JRDogJ3VzLmFudGhyb3BpYy5jbGF1ZGUtaGFpa3UtNC01LTIwMjUxMDAxLXYxOjAnLFxuICAgICAgICAgIENIVU5LU19QRVJfR1JPVVA6ICcxMCcsXG4gICAgICAgIH0pLFxuICAgICAgfSksXG4gICAgfSk7XG4gIH0pO1xuXG4gIHRlc3QoJ0NvbnZlcnNhdGlvbkZ1bmN0aW9uIGV4aXN0cyB3aXRoIGNvcnJlY3QgbmFtZScsICgpID0+IHtcbiAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoJ0FXUzo6TGFtYmRhOjpGdW5jdGlvbicsIHtcbiAgICAgIEZ1bmN0aW9uTmFtZTogJ0NvbnZlcnNhdGlvbkZ1bmN0aW9uJyxcbiAgICAgIFJ1bnRpbWU6ICdweXRob24zLjknLFxuICAgIH0pO1xuICB9KTtcblxuICB0ZXN0KCdleHBvcnRzIHByb2Nlc3NpbmcgYnVja2V0IG5hbWUnLCAoKSA9PiB7XG4gICAgY29uc3Qgb3V0cHV0cyA9IHRlbXBsYXRlLmZpbmRPdXRwdXRzKCcqJyk7XG4gICAgY29uc3QgZXhwb3J0TmFtZXMgPSBPYmplY3QudmFsdWVzKG91dHB1dHMpXG4gICAgICAubWFwKChvOiB7IEV4cG9ydD86IHsgTmFtZT86IHN0cmluZyB9IH0pID0+IG8uRXhwb3J0Py5OYW1lKVxuICAgICAgLmZpbHRlcihCb29sZWFuKTtcbiAgICBleHBlY3QoZXhwb3J0TmFtZXMpLnRvQ29udGFpbigncGRmLWNvbnZlcnNhdGlvbi1wcm9jZXNzaW5nLWJ1Y2tldCcpO1xuICB9KTtcblxuICB0ZXN0KCdleHBvcnRzIG1ldGFkYXRhIHRhYmxlIG5hbWUnLCAoKSA9PiB7XG4gICAgY29uc3Qgb3V0cHV0cyA9IHRlbXBsYXRlLmZpbmRPdXRwdXRzKCcqJyk7XG4gICAgY29uc3QgZXhwb3J0TmFtZXMgPSBPYmplY3QudmFsdWVzKG91dHB1dHMpXG4gICAgICAubWFwKChvOiB7IEV4cG9ydD86IHsgTmFtZT86IHN0cmluZyB9IH0pID0+IG8uRXhwb3J0Py5OYW1lKVxuICAgICAgLmZpbHRlcihCb29sZWFuKTtcbiAgICBleHBlY3QoZXhwb3J0TmFtZXMpLnRvQ29udGFpbigncGRmLWNvbnZlcnNhdGlvbi1tZXRhZGF0YS10YWJsZScpO1xuICB9KTtcbn0pO1xuXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuLy8gTW9uaXRvcmluZ1N0YWNrXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG5kZXNjcmliZSgnUGRmQ29udmVyc2F0aW9uTW9uaXRvcmluZ1N0YWNrJywgKCkgPT4ge1xuICBsZXQgdGVtcGxhdGU6IFRlbXBsYXRlO1xuXG4gIGJlZm9yZUFsbCgoKSA9PiB7XG4gICAgY29uc3QgYXBwID0gbWFrZUFwcCgpO1xuICAgIGNvbnN0IHNlY3VyaXR5ID0gYnVpbGRTZWN1cml0eVN0YWNrKGFwcCk7XG4gICAgY29uc3QgaW5mcmEgPSBidWlsZEluZnJhU3RhY2soYXBwLCBzZWN1cml0eSk7XG4gICAgYnVpbGRNb25pdG9yaW5nU3RhY2soYXBwLCBpbmZyYSk7XG4gICAgdGVtcGxhdGUgPSBUZW1wbGF0ZS5mcm9tU3RhY2soYXBwLm5vZGUuZmluZENoaWxkKCdNb25pdG9yaW5nU3RhY2snKSBhcyBjZGsuU3RhY2spO1xuICB9KTtcblxuICB0ZXN0KCdjcmVhdGVzIENsb3VkV2F0Y2ggZGFzaGJvYXJkIG5hbWVkIFBERi1Db252ZXJzYXRpb24tU3lzdGVtLU92ZXJ2aWV3JywgKCkgPT4ge1xuICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcygnQVdTOjpDbG91ZFdhdGNoOjpEYXNoYm9hcmQnLCB7XG4gICAgICBEYXNoYm9hcmROYW1lOiAnUERGLUNvbnZlcnNhdGlvbi1TeXN0ZW0tT3ZlcnZpZXcnLFxuICAgIH0pO1xuICB9KTtcblxuICB0ZXN0KCdjcmVhdGVzIGV4YWN0bHkgMSBDbG91ZFdhdGNoIGRhc2hib2FyZCcsICgpID0+IHtcbiAgICB0ZW1wbGF0ZS5yZXNvdXJjZUNvdW50SXMoJ0FXUzo6Q2xvdWRXYXRjaDo6RGFzaGJvYXJkJywgMSk7XG4gIH0pO1xuXG4gIHRlc3QoJ2NyZWF0ZXMgc3lzdGVtLWFsZXJ0cyBTTlMgdG9waWMnLCAoKSA9PiB7XG4gICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKCdBV1M6OlNOUzo6VG9waWMnLCB7XG4gICAgICBUb3BpY05hbWU6ICdwZGYtY29udmVyc2F0aW9uLXN5c3RlbS1hbGVydHMnLFxuICAgIH0pO1xuICB9KTtcblxuICB0ZXN0KCdjcmVhdGVzIENsb3VkV2F0Y2ggYWxhcm1zIGZvciBMYW1iZGEgZnVuY3Rpb25zJywgKCkgPT4ge1xuICAgIGNvbnN0IGFsYXJtcyA9IHRlbXBsYXRlLmZpbmRSZXNvdXJjZXMoJ0FXUzo6Q2xvdWRXYXRjaDo6QWxhcm0nKTtcbiAgICBleHBlY3QoT2JqZWN0LmtleXMoYWxhcm1zKS5sZW5ndGgpLnRvQmVHcmVhdGVyVGhhbk9yRXF1YWwoMTEpO1xuICB9KTtcblxuICB0ZXN0KCdEb2N1bWVudEluZ2VzdGlvbiBoaWdoLWVycm9yLXJhdGUgYWxhcm0gZXhpc3RzJywgKCkgPT4ge1xuICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcygnQVdTOjpDbG91ZFdhdGNoOjpBbGFybScsIHtcbiAgICAgIEFsYXJtTmFtZTogJ1BERi1Db252ZXJzYXRpb24tRG9jdW1lbnRJbmdlc3Rpb24tSGlnaEVycm9yUmF0ZScsXG4gICAgICBUaHJlc2hvbGQ6IDUsXG4gICAgICBFdmFsdWF0aW9uUGVyaW9kczogMixcbiAgICB9KTtcbiAgfSk7XG5cbiAgdGVzdCgnRG9jdW1lbnRTZWFyY2ggaGlnaC1kdXJhdGlvbiBhbGFybSBleGlzdHMnLCAoKSA9PiB7XG4gICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKCdBV1M6OkNsb3VkV2F0Y2g6OkFsYXJtJywge1xuICAgICAgQWxhcm1OYW1lOiAnUERGLUNvbnZlcnNhdGlvbi1Eb2N1bWVudFNlYXJjaC1IaWdoRHVyYXRpb24nLFxuICAgIH0pO1xuICB9KTtcblxuICB0ZXN0KCdTdHVkeUJvb2sgRExRIGRlcHRoIGFsYXJtIGV4aXN0cycsICgpID0+IHtcbiAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoJ0FXUzo6Q2xvdWRXYXRjaDo6QWxhcm0nLCB7XG4gICAgICBBbGFybU5hbWU6ICdQREYtQ29udmVyc2F0aW9uLVN0dWR5Qm9vay1ETFEtRGVwdGgnLFxuICAgICAgVGhyZXNob2xkOiAxLFxuICAgICAgRXZhbHVhdGlvblBlcmlvZHM6IDEsXG4gICAgfSk7XG4gIH0pO1xuXG4gIHRlc3QoJ0R5bmFtb0RCIHJlYWQtdGhyb3R0bGluZyBhbGFybXMgZXhpc3QgZm9yIGJvdGggdGFibGVzJywgKCkgPT4ge1xuICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcygnQVdTOjpDbG91ZFdhdGNoOjpBbGFybScsIHtcbiAgICAgIEFsYXJtTmFtZTogJ1BERi1Db252ZXJzYXRpb24tTWV0YWRhdGEtUmVhZFRocm90dGxpbmcnLFxuICAgIH0pO1xuICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcygnQVdTOjpDbG91ZFdhdGNoOjpBbGFybScsIHtcbiAgICAgIEFsYXJtTmFtZTogJ1BERi1Db252ZXJzYXRpb24tUXVlcnlMb2dzLVJlYWRUaHJvdHRsaW5nJyxcbiAgICB9KTtcbiAgfSk7XG5cbiAgdGVzdCgnb3V0cHV0cyBkYXNoYm9hcmQgVVJMJywgKCkgPT4ge1xuICAgIGNvbnN0IG91dHB1dHMgPSB0ZW1wbGF0ZS5maW5kT3V0cHV0cygnRGFzaGJvYXJkVVJMJyk7XG4gICAgZXhwZWN0KE9iamVjdC5rZXlzKG91dHB1dHMpLmxlbmd0aCkudG9CZSgxKTtcbiAgfSk7XG5cbiAgdGVzdCgnaGFzIGVycm9yIGFsYXJtIGZvciBDb252ZXJzYXRpb25GdW5jdGlvbicsICgpID0+IHtcbiAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoJ0FXUzo6Q2xvdWRXYXRjaDo6QWxhcm0nLCB7XG4gICAgICBBbGFybU5hbWU6IE1hdGNoLnN0cmluZ0xpa2VSZWdleHAoJ0NvbnZlcnNhdGlvbkZ1bmN0aW9uLipIaWdoRXJyb3JSYXRlJyksXG4gICAgICBOYW1lc3BhY2U6ICdBV1MvTGFtYmRhJyxcbiAgICAgIE1ldHJpY05hbWU6ICdFcnJvcnMnLFxuICAgIH0pO1xuICB9KTtcbn0pO1xuXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuLy8gQXV0aFN0YWNrXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG5kZXNjcmliZSgnUGRmQ29udmVyc2F0aW9uQXV0aFN0YWNrJywgKCkgPT4ge1xuICBsZXQgdGVtcGxhdGU6IFRlbXBsYXRlO1xuXG4gIGJlZm9yZUFsbCgoKSA9PiB7XG4gICAgY29uc3QgYXBwID0gbWFrZUFwcCgpO1xuICAgIGNvbnN0IHNlY3VyaXR5ID0gYnVpbGRTZWN1cml0eVN0YWNrKGFwcCk7XG4gICAgY29uc3QgaW5mcmEgPSBidWlsZEluZnJhU3RhY2soYXBwLCBzZWN1cml0eSk7XG4gICAgYnVpbGRBdXRoU3RhY2soYXBwLCBpbmZyYSk7XG4gICAgdGVtcGxhdGUgPSBUZW1wbGF0ZS5mcm9tU3RhY2soYXBwLm5vZGUuZmluZENoaWxkKCdBdXRoU3RhY2snKSBhcyBjZGsuU3RhY2spO1xuICB9KTtcblxuICB0ZXN0KCdjcmVhdGVzIDEgQ29nbml0byB1c2VyIHBvb2wnLCAoKSA9PiB7XG4gICAgdGVtcGxhdGUucmVzb3VyY2VDb3VudElzKCdBV1M6OkNvZ25pdG86OlVzZXJQb29sJywgMSk7XG4gIH0pO1xuXG4gIHRlc3QoJ3VzZXIgcG9vbCBoYXMgY29ycmVjdCBuYW1lIGFuZCBzZWxmLXNpZ24tdXAgZW5hYmxlZCcsICgpID0+IHtcbiAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoJ0FXUzo6Q29nbml0bzo6VXNlclBvb2wnLCB7XG4gICAgICBVc2VyUG9vbE5hbWU6ICdwZGYtY29udmVyc2F0aW9uLXVzZXJzJyxcbiAgICAgIEFkbWluQ3JlYXRlVXNlckNvbmZpZzogeyBBbGxvd0FkbWluQ3JlYXRlVXNlck9ubHk6IGZhbHNlIH0sXG4gICAgfSk7XG4gIH0pO1xuXG4gIHRlc3QoJ3VzZXIgcG9vbCBjbGllbnQgZXhpc3RzJywgKCkgPT4ge1xuICAgIHRlbXBsYXRlLnJlc291cmNlQ291bnRJcygnQVdTOjpDb2duaXRvOjpVc2VyUG9vbENsaWVudCcsIDEpO1xuICB9KTtcblxuICB0ZXN0KCdpZGVudGl0eSBwb29sIGFsbG93cyBvbmx5IGF1dGhlbnRpY2F0ZWQgaWRlbnRpdGllcycsICgpID0+IHtcbiAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoJ0FXUzo6Q29nbml0bzo6SWRlbnRpdHlQb29sJywge1xuICAgICAgSWRlbnRpdHlQb29sTmFtZTogJ3BkZl9jb252ZXJzYXRpb25faWRlbnRpdHlfcG9vbCcsXG4gICAgICBBbGxvd1VuYXV0aGVudGljYXRlZElkZW50aXRpZXM6IGZhbHNlLFxuICAgIH0pO1xuICB9KTtcblxuICB0ZXN0KCdjcmVhdGVzIDEgUkVTVCBBUEkgR2F0ZXdheScsICgpID0+IHtcbiAgICB0ZW1wbGF0ZS5yZXNvdXJjZUNvdW50SXMoJ0FXUzo6QXBpR2F0ZXdheTo6UmVzdEFwaScsIDEpO1xuICB9KTtcblxuICB0ZXN0KCdBUEkgR2F0ZXdheSBoYXMgY29ycmVjdCBuYW1lJywgKCkgPT4ge1xuICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcygnQVdTOjpBcGlHYXRld2F5OjpSZXN0QXBpJywge1xuICAgICAgTmFtZTogJ1BERiBDb252ZXJzYXRpb24gQVBJJyxcbiAgICB9KTtcbiAgfSk7XG5cbiAgdGVzdCgnQVBJIEdhdGV3YXkgZGVwbG95bWVudCBzdGFnZSBpcyB2MScsICgpID0+IHtcbiAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoJ0FXUzo6QXBpR2F0ZXdheTo6U3RhZ2UnLCB7XG4gICAgICBTdGFnZU5hbWU6ICd2MScsXG4gICAgfSk7XG4gIH0pO1xuXG4gIHRlc3QoJ0xpc3REb2N1bWVudHMgTGFtYmRhIGZ1bmN0aW9uIGV4aXN0cyB3aXRoIGNvcnJlY3QgbmFtZScsICgpID0+IHtcbiAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoJ0FXUzo6TGFtYmRhOjpGdW5jdGlvbicsIHtcbiAgICAgIEZ1bmN0aW9uTmFtZTogJ0xpc3REb2N1bWVudHMnLFxuICAgICAgUnVudGltZTogJ3B5dGhvbjMuOScsXG4gICAgfSk7XG4gIH0pO1xuXG4gIHRlc3QoJ0dlbmVyYXRlUHJlc2lnbmVkVXJsIExhbWJkYSBmdW5jdGlvbiBleGlzdHMnLCAoKSA9PiB7XG4gICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKCdBV1M6OkxhbWJkYTo6RnVuY3Rpb24nLCB7XG4gICAgICBGdW5jdGlvbk5hbWU6ICdHZW5lcmF0ZVByZXNpZ25lZFVybCcsXG4gICAgICBSdW50aW1lOiAncHl0aG9uMy45JyxcbiAgICB9KTtcbiAgfSk7XG5cbiAgdGVzdCgnR2V0RG9jdW1lbnRTdW1tYXJ5IExhbWJkYSBmdW5jdGlvbiBleGlzdHMnLCAoKSA9PiB7XG4gICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKCdBV1M6OkxhbWJkYTo6RnVuY3Rpb24nLCB7XG4gICAgICBGdW5jdGlvbk5hbWU6ICdHZXREb2N1bWVudFN1bW1hcnknLFxuICAgICAgUnVudGltZTogJ3B5dGhvbjMuOScsXG4gICAgfSk7XG4gIH0pO1xuXG4gIHRlc3QoJ0NvZ25pdG8gYXV0aG9yaXplciBpcyBhdHRhY2hlZCcsICgpID0+IHtcbiAgICB0ZW1wbGF0ZS5yZXNvdXJjZUNvdW50SXMoJ0FXUzo6QXBpR2F0ZXdheTo6QXV0aG9yaXplcicsIDEpO1xuICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcygnQVdTOjpBcGlHYXRld2F5OjpBdXRob3JpemVyJywge1xuICAgICAgTmFtZTogJ0NvZ25pdG9BdXRob3JpemVyJyxcbiAgICAgIFR5cGU6ICdDT0dOSVRPX1VTRVJfUE9PTFMnLFxuICAgIH0pO1xuICB9KTtcblxuICB0ZXN0KCdleHBvcnRzIHVzZXIgcG9vbCBJRCBhbmQgY2xpZW50IElEJywgKCkgPT4ge1xuICAgIGNvbnN0IG91dHB1dHMgPSB0ZW1wbGF0ZS5maW5kT3V0cHV0cygnKicpO1xuICAgIGNvbnN0IGV4cG9ydE5hbWVzID0gT2JqZWN0LnZhbHVlcyhvdXRwdXRzKVxuICAgICAgLm1hcCgobzogeyBFeHBvcnQ/OiB7IE5hbWU/OiBzdHJpbmcgfSB9KSA9PiBvLkV4cG9ydD8uTmFtZSlcbiAgICAgIC5maWx0ZXIoQm9vbGVhbik7XG4gICAgZXhwZWN0KGV4cG9ydE5hbWVzKS50b0NvbnRhaW4oJ1BkZkNvbnZlcnNhdGlvbi1Vc2VyUG9vbElkJyk7XG4gICAgZXhwZWN0KGV4cG9ydE5hbWVzKS50b0NvbnRhaW4oJ1BkZkNvbnZlcnNhdGlvbi1Vc2VyUG9vbENsaWVudElkJyk7XG4gICAgZXhwZWN0KGV4cG9ydE5hbWVzKS50b0NvbnRhaW4oJ1BkZkNvbnZlcnNhdGlvbi1JZGVudGl0eVBvb2xJZCcpO1xuICAgIGV4cGVjdChleHBvcnROYW1lcykudG9Db250YWluKCdQZGZDb252ZXJzYXRpb24tQXBpRW5kcG9pbnQnKTtcbiAgfSk7XG5cbiAgdGVzdCgnVXNlclBvb2xEb21haW4gcmVzb3VyY2UgZXhpc3RzIHdpdGggZm9saW8gcHJlZml4IGZvciBwcm9kJywgKCkgPT4ge1xuICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcygnQVdTOjpDb2duaXRvOjpVc2VyUG9vbERvbWFpbicsIHtcbiAgICAgIERvbWFpbjogJ2ZvbGlvJyxcbiAgICB9KTtcbiAgfSk7XG5cbiAgdGVzdCgnR29vZ2xlIElkZW50aXR5IFByb3ZpZGVyIHJlc291cmNlIGV4aXN0cycsICgpID0+IHtcbiAgICB0ZW1wbGF0ZS5yZXNvdXJjZUNvdW50SXMoJ0FXUzo6Q29nbml0bzo6VXNlclBvb2xJZGVudGl0eVByb3ZpZGVyJywgMSk7XG4gICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKCdBV1M6OkNvZ25pdG86OlVzZXJQb29sSWRlbnRpdHlQcm92aWRlcicsIHtcbiAgICAgIFByb3ZpZGVyTmFtZTogJ0dvb2dsZScsXG4gICAgICBQcm92aWRlclR5cGU6ICdHb29nbGUnLFxuICAgICAgQXR0cmlidXRlTWFwcGluZzogTWF0Y2gub2JqZWN0TGlrZSh7XG4gICAgICAgIGVtYWlsOiAnZW1haWwnLFxuICAgICAgICBnaXZlbl9uYW1lOiAnZ2l2ZW5fbmFtZScsXG4gICAgICAgIGZhbWlseV9uYW1lOiAnZmFtaWx5X25hbWUnLFxuICAgICAgICBuYW1lOiAnbmFtZScsXG4gICAgICB9KSxcbiAgICB9KTtcbiAgfSk7XG5cbiAgdGVzdCgnUHJlU2lnblVwIExhbWJkYSBmdW5jdGlvbiBleGlzdHMnLCAoKSA9PiB7XG4gICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKCdBV1M6OkxhbWJkYTo6RnVuY3Rpb24nLCB7XG4gICAgICBGdW5jdGlvbk5hbWU6ICdQcmVTaWduVXBUcmlnZ2VyJyxcbiAgICAgIFJ1bnRpbWU6ICdweXRob24zLjknLFxuICAgIH0pO1xuICB9KTtcblxuICB0ZXN0KCdDdXN0b20gTWVzc2FnZSBMYW1iZGEgZnVuY3Rpb24gZXhpc3RzJywgKCkgPT4ge1xuICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcygnQVdTOjpMYW1iZGE6OkZ1bmN0aW9uJywge1xuICAgICAgRnVuY3Rpb25OYW1lOiAnQ3VzdG9tTWVzc2FnZVRyaWdnZXInLFxuICAgICAgUnVudGltZTogJ3B5dGhvbjMuOScsXG4gICAgfSk7XG4gIH0pO1xuXG4gIHRlc3QoJ1VzZXJQb29sQ2xpZW50IGhhcyBDT0dOSVRPIGFuZCBHb29nbGUgaW4gU3VwcG9ydGVkSWRlbnRpdHlQcm92aWRlcnMnLCAoKSA9PiB7XG4gICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKCdBV1M6OkNvZ25pdG86OlVzZXJQb29sQ2xpZW50Jywge1xuICAgICAgU3VwcG9ydGVkSWRlbnRpdHlQcm92aWRlcnM6IE1hdGNoLmFycmF5V2l0aChbJ0NPR05JVE8nLCAnR29vZ2xlJ10pLFxuICAgIH0pO1xuICB9KTtcblxuICB0ZXN0KCdVc2VyUG9vbERvbWFpbiBDZm5PdXRwdXQgZXhpc3RzIHdpdGggY29ycmVjdCBleHBvcnQgbmFtZScsICgpID0+IHtcbiAgICBjb25zdCBvdXRwdXRzID0gdGVtcGxhdGUuZmluZE91dHB1dHMoJyonKTtcbiAgICBjb25zdCBleHBvcnROYW1lcyA9IE9iamVjdC52YWx1ZXMob3V0cHV0cylcbiAgICAgIC5tYXAoKG86IHsgRXhwb3J0PzogeyBOYW1lPzogc3RyaW5nIH0gfSkgPT4gby5FeHBvcnQ/Lk5hbWUpXG4gICAgICAuZmlsdGVyKEJvb2xlYW4pO1xuICAgIGV4cGVjdChleHBvcnROYW1lcykudG9Db250YWluKCdQZGZDb252ZXJzYXRpb24tVXNlclBvb2xEb21haW4nKTtcbiAgfSk7XG5cbiAgdGVzdCgnVXNlclBvb2wgbGFtYmRhQ29uZmlnIHJlZmVyZW5jZXMgUHJlU2lnblVwIGFuZCBDdXN0b21NZXNzYWdlIHRyaWdnZXJzJywgKCkgPT4ge1xuICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcygnQVdTOjpDb2duaXRvOjpVc2VyUG9vbCcsIHtcbiAgICAgIExhbWJkYUNvbmZpZzogTWF0Y2gub2JqZWN0TGlrZSh7XG4gICAgICAgIFByZVNpZ25VcDogTWF0Y2guYW55VmFsdWUoKSxcbiAgICAgICAgQ3VzdG9tTWVzc2FnZTogTWF0Y2guYW55VmFsdWUoKSxcbiAgICAgIH0pLFxuICAgIH0pO1xuICB9KTtcblxuICB0ZXN0KCd1c2VyIHBvb2wgc2NoZW1hIGluY2x1ZGVzIG11dGFibGUgbmFtZSBhdHRyaWJ1dGUnLCAoKSA9PiB7XG4gICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKCdBV1M6OkNvZ25pdG86OlVzZXJQb29sJywge1xuICAgICAgU2NoZW1hOiBNYXRjaC5hcnJheVdpdGgoW1xuICAgICAgICBNYXRjaC5vYmplY3RMaWtlKHsgTmFtZTogJ25hbWUnLCBNdXRhYmxlOiB0cnVlLCBSZXF1aXJlZDogZmFsc2UgfSksXG4gICAgICBdKSxcbiAgICB9KTtcbiAgfSk7XG5cbiAgdGVzdCgnRGVsZXRlQWNjb3VudCBMYW1iZGEgZnVuY3Rpb24gZXhpc3RzJywgKCkgPT4ge1xuICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcygnQVdTOjpMYW1iZGE6OkZ1bmN0aW9uJywge1xuICAgICAgRnVuY3Rpb25OYW1lOiAnRGVsZXRlQWNjb3VudCcsXG4gICAgICBSdW50aW1lOiAncHl0aG9uMy45JyxcbiAgICB9KTtcbiAgfSk7XG5cbiAgdGVzdCgnVXNlclBvb2wgaGFzIGN1c3RvbTpyb2xlIGF0dHJpYnV0ZScsICgpID0+IHtcbiAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoJ0FXUzo6Q29nbml0bzo6VXNlclBvb2wnLCB7XG4gICAgICBTY2hlbWE6IE1hdGNoLmFycmF5V2l0aChbXG4gICAgICAgIE1hdGNoLm9iamVjdExpa2Uoe1xuICAgICAgICAgIEF0dHJpYnV0ZURhdGFUeXBlOiAnU3RyaW5nJyxcbiAgICAgICAgICBOYW1lOiAncm9sZScsXG4gICAgICAgICAgTXV0YWJsZTogdHJ1ZSxcbiAgICAgICAgfSksXG4gICAgICBdKSxcbiAgICB9KTtcbiAgfSk7XG5cbiAgdGVzdCgnaGFzIEdFVCAvdXNlcnMvbWUvdXNhZ2UgQVBJIHJvdXRlJywgKCkgPT4ge1xuICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcygnQVdTOjpBcGlHYXRld2F5OjpSZXNvdXJjZScsIHtcbiAgICAgIFBhdGhQYXJ0OiAndXNhZ2UnLFxuICAgIH0pO1xuICB9KTtcbn0pO1xuXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuLy8gRnJvbnRlbmRTdGFja1xuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuZGVzY3JpYmUoJ1BkZkNvbnZlcnNhdGlvbkZyb250ZW5kU3RhY2snLCAoKSA9PiB7XG4gIGxldCB0ZW1wbGF0ZTogVGVtcGxhdGU7XG5cbiAgYmVmb3JlQWxsKCgpID0+IHtcbiAgICBjb25zdCBhcHAgPSBtYWtlQXBwKCk7XG4gICAgbmV3IFBkZkNvbnZlcnNhdGlvbkZyb250ZW5kU3RhY2soYXBwLCAnRnJvbnRlbmRTdGFjaycsIHsgZW52OiBFTlYgfSk7XG4gICAgdGVtcGxhdGUgPSBUZW1wbGF0ZS5mcm9tU3RhY2soYXBwLm5vZGUuZmluZENoaWxkKCdGcm9udGVuZFN0YWNrJykgYXMgY2RrLlN0YWNrKTtcbiAgfSk7XG5cbiAgdGVzdCgnY3JlYXRlcyBleGFjdGx5IDEgUzMgYnVja2V0JywgKCkgPT4ge1xuICAgIHRlbXBsYXRlLnJlc291cmNlQ291bnRJcygnQVdTOjpTMzo6QnVja2V0JywgMSk7XG4gIH0pO1xuXG4gIHRlc3QoJ2Zyb250ZW5kIGJ1Y2tldCBoYXMgY29ycmVjdCBuYW1lIGFuZCBTM19NQU5BR0VEIGVuY3J5cHRpb24nLCAoKSA9PiB7XG4gICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKCdBV1M6OlMzOjpCdWNrZXQnLCB7XG4gICAgICBCdWNrZXROYW1lOiBgcGRmLWNvbnZlcnNhdGlvbi1mcm9udGVuZC0ke0FDQ09VTlRfSUR9YCxcbiAgICAgIEJ1Y2tldEVuY3J5cHRpb246IHtcbiAgICAgICAgU2VydmVyU2lkZUVuY3J5cHRpb25Db25maWd1cmF0aW9uOiBNYXRjaC5hcnJheVdpdGgoW1xuICAgICAgICAgIE1hdGNoLm9iamVjdExpa2Uoe1xuICAgICAgICAgICAgU2VydmVyU2lkZUVuY3J5cHRpb25CeURlZmF1bHQ6IHsgU1NFQWxnb3JpdGhtOiAnQUVTMjU2JyB9LFxuICAgICAgICAgIH0pLFxuICAgICAgICBdKSxcbiAgICAgIH0sXG4gICAgICBQdWJsaWNBY2Nlc3NCbG9ja0NvbmZpZ3VyYXRpb246IHtcbiAgICAgICAgQmxvY2tQdWJsaWNBY2xzOiB0cnVlLFxuICAgICAgICBCbG9ja1B1YmxpY1BvbGljeTogdHJ1ZSxcbiAgICAgICAgSWdub3JlUHVibGljQWNsczogdHJ1ZSxcbiAgICAgICAgUmVzdHJpY3RQdWJsaWNCdWNrZXRzOiB0cnVlLFxuICAgICAgfSxcbiAgICB9KTtcbiAgfSk7XG5cbiAgdGVzdCgnY3JlYXRlcyBleGFjdGx5IDEgQ2xvdWRGcm9udCBkaXN0cmlidXRpb24nLCAoKSA9PiB7XG4gICAgdGVtcGxhdGUucmVzb3VyY2VDb3VudElzKCdBV1M6OkNsb3VkRnJvbnQ6OkRpc3RyaWJ1dGlvbicsIDEpO1xuICB9KTtcblxuICB0ZXN0KCdDbG91ZEZyb250IGRpc3RyaWJ1dGlvbiByZWRpcmVjdHMgSFRUUCB0byBIVFRQUycsICgpID0+IHtcbiAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoJ0FXUzo6Q2xvdWRGcm9udDo6RGlzdHJpYnV0aW9uJywge1xuICAgICAgRGlzdHJpYnV0aW9uQ29uZmlnOiBNYXRjaC5vYmplY3RMaWtlKHtcbiAgICAgICAgRGVmYXVsdENhY2hlQmVoYXZpb3I6IE1hdGNoLm9iamVjdExpa2Uoe1xuICAgICAgICAgIFZpZXdlclByb3RvY29sUG9saWN5OiAncmVkaXJlY3QtdG8taHR0cHMnLFxuICAgICAgICB9KSxcbiAgICAgICAgRGVmYXVsdFJvb3RPYmplY3Q6ICdpbmRleC5odG1sJyxcbiAgICAgICAgUHJpY2VDbGFzczogJ1ByaWNlQ2xhc3NfMTAwJyxcbiAgICAgIH0pLFxuICAgIH0pO1xuICB9KTtcblxuICB0ZXN0KCdDbG91ZEZyb250IGhhcyBTUEEgZXJyb3IgcmVzcG9uc2VzIGZvciA0MDMgYW5kIDQwNCcsICgpID0+IHtcbiAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoJ0FXUzo6Q2xvdWRGcm9udDo6RGlzdHJpYnV0aW9uJywge1xuICAgICAgRGlzdHJpYnV0aW9uQ29uZmlnOiBNYXRjaC5vYmplY3RMaWtlKHtcbiAgICAgICAgQ3VzdG9tRXJyb3JSZXNwb25zZXM6IE1hdGNoLmFycmF5V2l0aChbXG4gICAgICAgICAgTWF0Y2gub2JqZWN0TGlrZSh7IEVycm9yQ29kZTogNDAzLCBSZXNwb25zZUNvZGU6IDIwMCwgUmVzcG9uc2VQYWdlUGF0aDogJy9pbmRleC5odG1sJyB9KSxcbiAgICAgICAgICBNYXRjaC5vYmplY3RMaWtlKHsgRXJyb3JDb2RlOiA0MDQsIFJlc3BvbnNlQ29kZTogMjAwLCBSZXNwb25zZVBhZ2VQYXRoOiAnL2luZGV4Lmh0bWwnIH0pLFxuICAgICAgICBdKSxcbiAgICAgIH0pLFxuICAgIH0pO1xuICB9KTtcblxuICB0ZXN0KCdTMyBPcmlnaW4gQWNjZXNzIENvbnRyb2wgaXMgY3JlYXRlZCcsICgpID0+IHtcbiAgICB0ZW1wbGF0ZS5yZXNvdXJjZUNvdW50SXMoJ0FXUzo6Q2xvdWRGcm9udDo6T3JpZ2luQWNjZXNzQ29udHJvbCcsIDEpO1xuICB9KTtcblxuICB0ZXN0KCdvdXRwdXRzIENsb3VkRnJvbnQgZG9tYWluIG5hbWUnLCAoKSA9PiB7XG4gICAgY29uc3Qgb3V0cHV0cyA9IHRlbXBsYXRlLmZpbmRPdXRwdXRzKCdDbG91ZEZyb250RG9tYWluTmFtZScpO1xuICAgIGV4cGVjdChPYmplY3Qua2V5cyhvdXRwdXRzKS5sZW5ndGgpLnRvQmUoMSk7XG4gIH0pO1xufSk7XG5cbmRlc2NyaWJlKCdQZGZDb252ZXJzYXRpb25Gcm9udGVuZFN0YWNrIHdpdGggZG9tYWluJywgKCkgPT4ge1xuICBsZXQgZG9tYWluVGVtcGxhdGU6IFRlbXBsYXRlO1xuXG4gIGJlZm9yZUFsbCgoKSA9PiB7XG4gICAgY29uc3QgYXBwID0gbWFrZUFwcCgpO1xuICAgIG5ldyBQZGZDb252ZXJzYXRpb25Gcm9udGVuZFN0YWNrKGFwcCwgJ0Zyb250ZW5kU3RhY2tXaXRoRG9tYWluJywge1xuICAgICAgZW52OiBFTlYsXG4gICAgICBkb21haW5OYW1lOiAnZm9saW8uenVrb25hcnlhLmNvbScsXG4gICAgICBzc21FbnZOYW1lOiAncHJvZCcsXG4gICAgICBlbnZDb25maWc6IHByb2RFbnZDb25maWcsXG4gICAgfSk7XG4gICAgZG9tYWluVGVtcGxhdGUgPSBUZW1wbGF0ZS5mcm9tU3RhY2soYXBwLm5vZGUuZmluZENoaWxkKCdGcm9udGVuZFN0YWNrV2l0aERvbWFpbicpIGFzIGNkay5TdGFjayk7XG4gIH0pO1xuXG4gIHRlc3QoJ0Nsb3VkRnJvbnQgZGlzdHJpYnV0aW9uIGhhcyBjdXN0b20gZG9tYWluIGFsaWFzJywgKCkgPT4ge1xuICAgIGRvbWFpblRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcygnQVdTOjpDbG91ZEZyb250OjpEaXN0cmlidXRpb24nLCB7XG4gICAgICBEaXN0cmlidXRpb25Db25maWc6IE1hdGNoLm9iamVjdExpa2Uoe1xuICAgICAgICBBbGlhc2VzOiBbJ2ZvbGlvLnp1a29uYXJ5YS5jb20nXSxcbiAgICAgIH0pLFxuICAgIH0pO1xuICB9KTtcblxuICB0ZXN0KCdSb3V0ZTUzIEFSZWNvcmQgaXMgY3JlYXRlZCcsICgpID0+IHtcbiAgICBkb21haW5UZW1wbGF0ZS5yZXNvdXJjZUNvdW50SXMoJ0FXUzo6Um91dGU1Mzo6UmVjb3JkU2V0JywgMSk7XG4gIH0pO1xufSk7XG5cbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4vLyBEbnNTdGFja1xuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuZGVzY3JpYmUoJ1BkZkNvbnZlcnNhdGlvbkRuc1N0YWNrJywgKCkgPT4ge1xuICBsZXQgdGVtcGxhdGU6IFRlbXBsYXRlO1xuXG4gIGJlZm9yZUFsbCgoKSA9PiB7XG4gICAgY29uc3QgYXBwID0gbWFrZUFwcCgpO1xuICAgIG5ldyBQZGZDb252ZXJzYXRpb25EbnNTdGFjayhhcHAsICdEbnNTdGFjaycsIHtcbiAgICAgIGVudjogeyBhY2NvdW50OiBBQ0NPVU5UX0lELCByZWdpb246ICd1cy1lYXN0LTEnIH0sXG4gICAgICBkb21haW5OYW1lOiAnZm9saW8uenVrb25hcnlhLmNvbScsXG4gICAgICBlbnZOYW1lOiAncHJvZCcsXG4gICAgfSk7XG4gICAgdGVtcGxhdGUgPSBUZW1wbGF0ZS5mcm9tU3RhY2soYXBwLm5vZGUuZmluZENoaWxkKCdEbnNTdGFjaycpIGFzIGNkay5TdGFjayk7XG4gIH0pO1xuXG4gIHRlc3QoJ2NyZWF0ZXMgMSBSb3V0ZTUzIGhvc3RlZCB6b25lIGZvciBmb2xpby56dWtvbmFyeWEuY29tJywgKCkgPT4ge1xuICAgIHRlbXBsYXRlLnJlc291cmNlQ291bnRJcygnQVdTOjpSb3V0ZTUzOjpIb3N0ZWRab25lJywgMSk7XG4gICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKCdBV1M6OlJvdXRlNTM6Okhvc3RlZFpvbmUnLCB7XG4gICAgICBOYW1lOiAnZm9saW8uenVrb25hcnlhLmNvbS4nLFxuICAgIH0pO1xuICB9KTtcblxuICB0ZXN0KCdjcmVhdGVzIDEgQUNNIGNlcnRpZmljYXRlJywgKCkgPT4ge1xuICAgIHRlbXBsYXRlLnJlc291cmNlQ291bnRJcygnQVdTOjpDZXJ0aWZpY2F0ZU1hbmFnZXI6OkNlcnRpZmljYXRlJywgMSk7XG4gICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKCdBV1M6OkNlcnRpZmljYXRlTWFuYWdlcjo6Q2VydGlmaWNhdGUnLCB7XG4gICAgICBEb21haW5OYW1lOiAnZm9saW8uenVrb25hcnlhLmNvbScsXG4gICAgICBWYWxpZGF0aW9uTWV0aG9kOiAnRE5TJyxcbiAgICB9KTtcbiAgfSk7XG5cbiAgdGVzdCgnb3V0cHV0cyBob3N0ZWQgem9uZSBJRCwgbmFtZSBzZXJ2ZXJzLCBhbmQgY2VydGlmaWNhdGUgQVJOJywgKCkgPT4ge1xuICAgIGNvbnN0IG91dHB1dHMgPSB0ZW1wbGF0ZS5maW5kT3V0cHV0cygnKicpO1xuICAgIGV4cGVjdChvdXRwdXRzKS50b0hhdmVQcm9wZXJ0eSgnU3ViZG9tYWluSG9zdGVkWm9uZUlkJyk7XG4gICAgZXhwZWN0KG91dHB1dHMpLnRvSGF2ZVByb3BlcnR5KCdTdWJkb21haW5OYW1lU2VydmVycycpO1xuICAgIGV4cGVjdChvdXRwdXRzKS50b0hhdmVQcm9wZXJ0eSgnQWNtQ2VydGlmaWNhdGVBcm4nKTtcbiAgfSk7XG5cbiAgdGVzdCgnY3JlYXRlcyBBd3NDdXN0b21SZXNvdXJjZSBMYW1iZGEtYmFja2VkIGN1c3RvbSByZXNvdXJjZXMgZm9yIFNTTSB3cml0ZXMnLCAoKSA9PiB7XG4gICAgdGVtcGxhdGUucmVzb3VyY2VDb3VudElzKCdDdXN0b206OkFXUycsIDIpO1xuICB9KTtcblxuICB0ZXN0KCdBd3NDdXN0b21SZXNvdXJjZSBJQU0gcm9sZSBoYXMgU1NNIHdyaXRlIHBlcm1pc3Npb25zIHRvIHVzLXdlc3QtMicsICgpID0+IHtcbiAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoJ0FXUzo6SUFNOjpQb2xpY3knLCB7XG4gICAgICBQb2xpY3lEb2N1bWVudDogTWF0Y2gub2JqZWN0TGlrZSh7XG4gICAgICAgIFN0YXRlbWVudDogTWF0Y2guYXJyYXlXaXRoKFtcbiAgICAgICAgICBNYXRjaC5vYmplY3RMaWtlKHtcbiAgICAgICAgICAgIEFjdGlvbjogTWF0Y2guYXJyYXlXaXRoKFsnc3NtOlB1dFBhcmFtZXRlcicsICdzc206RGVsZXRlUGFyYW1ldGVyJ10pLFxuICAgICAgICAgICAgUmVzb3VyY2U6IE1hdGNoLnN0cmluZ0xpa2VSZWdleHAoJ2Fybjphd3M6c3NtOnVzLXdlc3QtMi4qcGRmY29udicpLFxuICAgICAgICAgIH0pLFxuICAgICAgICBdKSxcbiAgICAgIH0pLFxuICAgIH0pO1xuICB9KTtcbn0pO1xuXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuLy8gUHJvZCBlbnZpcm9ubWVudDogdW5wcmVmaXhlZCByZXNvdXJjZSBuYW1lc1xuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuZGVzY3JpYmUoJ1Byb2QgZW52aXJvbm1lbnQgcmVzb3VyY2UgbmFtZXMnLCAoKSA9PiB7XG4gIHRlc3QoJ0R5bmFtb0RCIHRhYmxlIG5hbWVzIGFyZSB1bnByZWZpeGVkIChubyBzdGFjayBuYW1lIHByZWZpeCknLCAoKSA9PiB7XG4gICAgY29uc3QgYXBwID0gbWFrZUFwcCgpO1xuICAgIGNvbnN0IHNlY3VyaXR5ID0gYnVpbGRTZWN1cml0eVN0YWNrKGFwcCk7XG4gICAgY29uc3QgaW5mcmEgPSBidWlsZEluZnJhU3RhY2soYXBwLCBzZWN1cml0eSk7XG4gICAgY29uc3QgdGVtcGxhdGUgPSBUZW1wbGF0ZS5mcm9tU3RhY2soaW5mcmEpO1xuXG4gICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKCdBV1M6OkR5bmFtb0RCOjpUYWJsZScsIHtcbiAgICAgIFRhYmxlTmFtZTogJ3BkZi1jb252ZXJzYXRpb24tbWV0YWRhdGEnLFxuICAgIH0pO1xuICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcygnQVdTOjpEeW5hbW9EQjo6VGFibGUnLCB7XG4gICAgICBUYWJsZU5hbWU6ICdwZGYtY29udmVyc2F0aW9uLXF1ZXJ5LWxvZ3MnLFxuICAgIH0pO1xuICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcygnQVdTOjpEeW5hbW9EQjo6VGFibGUnLCB7XG4gICAgICBUYWJsZU5hbWU6ICdwZGYtY29udmVyc2F0aW9uLWNvbnZlcnNhdGlvbnMnLFxuICAgIH0pO1xuICB9KTtcblxuICB0ZXN0KCdMYW1iZGEgZnVuY3Rpb24gbmFtZXMgYXJlIHVucHJlZml4ZWQnLCAoKSA9PiB7XG4gICAgY29uc3QgYXBwID0gbWFrZUFwcCgpO1xuICAgIGNvbnN0IHNlY3VyaXR5ID0gYnVpbGRTZWN1cml0eVN0YWNrKGFwcCk7XG4gICAgY29uc3QgaW5mcmEgPSBidWlsZEluZnJhU3RhY2soYXBwLCBzZWN1cml0eSk7XG4gICAgY29uc3QgdGVtcGxhdGUgPSBUZW1wbGF0ZS5mcm9tU3RhY2soaW5mcmEpO1xuXG4gICAgY29uc3QgZXhwZWN0ZWROYW1lcyA9IFtcbiAgICAgICdEb2N1bWVudEluZ2VzdGlvbkZ1bmN0aW9uJyxcbiAgICAgICdUZXh0cmFjdFJlc3VsdHNQcm9jZXNzb3JGdW5jdGlvbicsXG4gICAgICAnQmVkcm9ja1RvUzNWZWN0b3JpemF0aW9uJyxcbiAgICAgICdRdWVyeVByb2Nlc3NpbmdGdW5jdGlvbicsXG4gICAgICAnQ29udmVyc2F0aW9uRnVuY3Rpb24nLFxuICAgIF07XG5cbiAgICBleHBlY3RlZE5hbWVzLmZvckVhY2goKG5hbWUpID0+IHtcbiAgICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcygnQVdTOjpMYW1iZGE6OkZ1bmN0aW9uJywgeyBGdW5jdGlvbk5hbWU6IG5hbWUgfSk7XG4gICAgfSk7XG4gIH0pO1xuXG4gIHRlc3QoJ0lBTSByb2xlIG5hbWVzIGFyZSB1bnByZWZpeGVkJywgKCkgPT4ge1xuICAgIGNvbnN0IGFwcCA9IG1ha2VBcHAoKTtcbiAgICBjb25zdCBzZWN1cml0eSA9IGJ1aWxkU2VjdXJpdHlTdGFjayhhcHApO1xuICAgIGNvbnN0IHRlbXBsYXRlID0gVGVtcGxhdGUuZnJvbVN0YWNrKHNlY3VyaXR5KTtcblxuICAgIGNvbnN0IGV4cGVjdGVkUm9sZU5hbWVzID0gW1xuICAgICAgJ1RleHRyYWN0U2VydmljZVJvbGUnLFxuICAgICAgJ0RvY3VtZW50SW5nZXN0aW9uRnVuY3Rpb24tcm9sZScsXG4gICAgICAnVGV4dHJhY3RSZXN1bHRzUHJvY2Vzc29yRnVuY3Rpb24tcm9sZScsXG4gICAgICAnQmVkcm9ja1RvUzNWZWN0b3JpemF0aW9uLUxhbWJkYScsXG4gICAgICAnUXVlcnlQcm9jZXNzaW5nRnVuY3Rpb24tcm9sZScsXG4gICAgICAnQ29udmVyc2F0aW9uRnVuY3Rpb24tcm9sZScsXG4gICAgXTtcblxuICAgIGV4cGVjdGVkUm9sZU5hbWVzLmZvckVhY2goKHJvbGVOYW1lKSA9PiB7XG4gICAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoJ0FXUzo6SUFNOjpSb2xlJywgeyBSb2xlTmFtZTogcm9sZU5hbWUgfSk7XG4gICAgfSk7XG4gIH0pO1xuXG4gIHRlc3QoJ1MzIGJ1Y2tldCBuYW1lcyBpbmNsdWRlIGFjY291bnQgSUQgc3VmZml4IChub3Qgc3RhY2stZ2VuZXJhdGVkKScsICgpID0+IHtcbiAgICBjb25zdCBhcHAgPSBtYWtlQXBwKCk7XG4gICAgY29uc3Qgc2VjdXJpdHkgPSBidWlsZFNlY3VyaXR5U3RhY2soYXBwKTtcbiAgICBjb25zdCBpbmZyYSA9IGJ1aWxkSW5mcmFTdGFjayhhcHAsIHNlY3VyaXR5KTtcbiAgICBjb25zdCB0ZW1wbGF0ZSA9IFRlbXBsYXRlLmZyb21TdGFjayhpbmZyYSk7XG5cbiAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoJ0FXUzo6UzM6OkJ1Y2tldCcsIHtcbiAgICAgIEJ1Y2tldE5hbWU6IGBwZGYtY29udmVyc2F0aW9uLXByb2Nlc3NpbmctJHtBQ0NPVU5UX0lEfWAsXG4gICAgfSk7XG4gICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKCdBV1M6OlMzOjpCdWNrZXQnLCB7XG4gICAgICBCdWNrZXROYW1lOiBgcGRmLWNvbnZlcnNhdGlvbi1kaWdlc3RzLSR7QUNDT1VOVF9JRH1gLFxuICAgIH0pO1xuICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcygnQVdTOjpTMzo6QnVja2V0Jywge1xuICAgICAgQnVja2V0TmFtZTogYHBkZi1jb252ZXJzYXRpb24tdmVjdG9ycy1qc29uLSR7QUNDT1VOVF9JRH1gLFxuICAgIH0pO1xuICB9KTtcblxuICB0ZXN0KCdRdWVyeVByb2Nlc3NpbmdSb2xlIGhhcyBjcm9zcy1yZWdpb24gZm91bmRhdGlvbiBtb2RlbCBzdGF0ZW1lbnQgZm9yIEhhaWt1IGluZmVyZW5jZSBwcm9maWxlJywgKCkgPT4ge1xuICAgIGNvbnN0IGFwcCA9IG1ha2VBcHAoKTtcbiAgICBjb25zdCBzZWN1cml0eSA9IGJ1aWxkU2VjdXJpdHlTdGFjayhhcHApO1xuICAgIGNvbnN0IHRlbXBsYXRlID0gVGVtcGxhdGUuZnJvbVN0YWNrKHNlY3VyaXR5KTtcblxuICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcygnQVdTOjpJQU06OlJvbGUnLCB7XG4gICAgICBSb2xlTmFtZTogJ1F1ZXJ5UHJvY2Vzc2luZ0Z1bmN0aW9uLXJvbGUnLFxuICAgICAgUG9saWNpZXM6IE1hdGNoLmFycmF5V2l0aChbXG4gICAgICAgIE1hdGNoLm9iamVjdExpa2Uoe1xuICAgICAgICAgIFBvbGljeU5hbWU6ICdRdWVyeVByb2Nlc3NpbmdQb2xpY3knLFxuICAgICAgICAgIFBvbGljeURvY3VtZW50OiBNYXRjaC5vYmplY3RMaWtlKHtcbiAgICAgICAgICAgIFN0YXRlbWVudDogTWF0Y2guYXJyYXlXaXRoKFtcbiAgICAgICAgICAgICAgTWF0Y2gub2JqZWN0TGlrZSh7XG4gICAgICAgICAgICAgICAgRWZmZWN0OiAnQWxsb3cnLFxuICAgICAgICAgICAgICAgIEFjdGlvbjogJ2JlZHJvY2s6SW52b2tlTW9kZWwnLFxuICAgICAgICAgICAgICAgIFJlc291cmNlOiBbXG4gICAgICAgICAgICAgICAgICBgYXJuOmF3czpiZWRyb2NrOnVzLWVhc3QtMTo6Zm91bmRhdGlvbi1tb2RlbC9hbnRocm9waWMuY2xhdWRlLWhhaWt1LTQtNS0yMDI1MTAwMS12MTowYCxcbiAgICAgICAgICAgICAgICAgIGBhcm46YXdzOmJlZHJvY2s6dXMtZWFzdC0yOjpmb3VuZGF0aW9uLW1vZGVsL2FudGhyb3BpYy5jbGF1ZGUtaGFpa3UtNC01LTIwMjUxMDAxLXYxOjBgLFxuICAgICAgICAgICAgICAgICAgYGFybjphd3M6YmVkcm9jazp1cy13ZXN0LTI6OmZvdW5kYXRpb24tbW9kZWwvYW50aHJvcGljLmNsYXVkZS1oYWlrdS00LTUtMjAyNTEwMDEtdjE6MGAsXG4gICAgICAgICAgICAgICAgXSxcbiAgICAgICAgICAgICAgICBDb25kaXRpb246IHtcbiAgICAgICAgICAgICAgICAgIFN0cmluZ0VxdWFsczoge1xuICAgICAgICAgICAgICAgICAgICAnYmVkcm9jazpJbmZlcmVuY2VQcm9maWxlQXJuJzogYGFybjphd3M6YmVkcm9jazp1cy13ZXN0LTI6JHtwcm9kRW52Q29uZmlnLmFjY291bnRJZH06aW5mZXJlbmNlLXByb2ZpbGUvdXMuYW50aHJvcGljLmNsYXVkZS1oYWlrdS00LTUtMjAyNTEwMDEtdjE6MGAsXG4gICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgIH0pLFxuICAgICAgICAgICAgXSksXG4gICAgICAgICAgfSksXG4gICAgICAgIH0pLFxuICAgICAgXSksXG4gICAgfSk7XG4gIH0pO1xuXG4gIHRlc3QoJ0NvbnZlcnNhdGlvbkZ1bmN0aW9uUm9sZSBoYXMgY3Jvc3MtcmVnaW9uIGZvdW5kYXRpb24gbW9kZWwgc3RhdGVtZW50IGZvciBIYWlrdSBpbmZlcmVuY2UgcHJvZmlsZScsICgpID0+IHtcbiAgICBjb25zdCBhcHAgPSBtYWtlQXBwKCk7XG4gICAgY29uc3Qgc2VjdXJpdHkgPSBidWlsZFNlY3VyaXR5U3RhY2soYXBwKTtcbiAgICBjb25zdCB0ZW1wbGF0ZSA9IFRlbXBsYXRlLmZyb21TdGFjayhzZWN1cml0eSk7XG5cbiAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoJ0FXUzo6SUFNOjpSb2xlJywge1xuICAgICAgUm9sZU5hbWU6ICdDb252ZXJzYXRpb25GdW5jdGlvbi1yb2xlJyxcbiAgICAgIFBvbGljaWVzOiBNYXRjaC5hcnJheVdpdGgoW1xuICAgICAgICBNYXRjaC5vYmplY3RMaWtlKHtcbiAgICAgICAgICBQb2xpY3lOYW1lOiAnQ29udmVyc2F0aW9uRnVuY3Rpb25Qb2xpY3knLFxuICAgICAgICAgIFBvbGljeURvY3VtZW50OiBNYXRjaC5vYmplY3RMaWtlKHtcbiAgICAgICAgICAgIFN0YXRlbWVudDogTWF0Y2guYXJyYXlXaXRoKFtcbiAgICAgICAgICAgICAgTWF0Y2gub2JqZWN0TGlrZSh7XG4gICAgICAgICAgICAgICAgRWZmZWN0OiAnQWxsb3cnLFxuICAgICAgICAgICAgICAgIEFjdGlvbjogJ2JlZHJvY2s6SW52b2tlTW9kZWwnLFxuICAgICAgICAgICAgICAgIFJlc291cmNlOiBbXG4gICAgICAgICAgICAgICAgICBgYXJuOmF3czpiZWRyb2NrOnVzLWVhc3QtMTo6Zm91bmRhdGlvbi1tb2RlbC9hbnRocm9waWMuY2xhdWRlLWhhaWt1LTQtNS0yMDI1MTAwMS12MTowYCxcbiAgICAgICAgICAgICAgICAgIGBhcm46YXdzOmJlZHJvY2s6dXMtZWFzdC0yOjpmb3VuZGF0aW9uLW1vZGVsL2FudGhyb3BpYy5jbGF1ZGUtaGFpa3UtNC01LTIwMjUxMDAxLXYxOjBgLFxuICAgICAgICAgICAgICAgICAgYGFybjphd3M6YmVkcm9jazp1cy13ZXN0LTI6OmZvdW5kYXRpb24tbW9kZWwvYW50aHJvcGljLmNsYXVkZS1oYWlrdS00LTUtMjAyNTEwMDEtdjE6MGAsXG4gICAgICAgICAgICAgICAgXSxcbiAgICAgICAgICAgICAgICBDb25kaXRpb246IHtcbiAgICAgICAgICAgICAgICAgIFN0cmluZ0VxdWFsczoge1xuICAgICAgICAgICAgICAgICAgICAnYmVkcm9jazpJbmZlcmVuY2VQcm9maWxlQXJuJzogYGFybjphd3M6YmVkcm9jazp1cy13ZXN0LTI6JHtwcm9kRW52Q29uZmlnLmFjY291bnRJZH06aW5mZXJlbmNlLXByb2ZpbGUvdXMuYW50aHJvcGljLmNsYXVkZS1oYWlrdS00LTUtMjAyNTEwMDEtdjE6MGAsXG4gICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgIH0pLFxuICAgICAgICAgICAgXSksXG4gICAgICAgICAgfSksXG4gICAgICAgIH0pLFxuICAgICAgXSksXG4gICAgfSk7XG4gIH0pO1xuXG59KTtcbiJdfQ==