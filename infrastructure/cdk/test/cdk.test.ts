import * as cdk from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { PdfConversationSecurityStack } from '../lib/pdf-conversation-security-stack';
import { PdfConversationInfraStack } from '../lib/pdf-conversation-infra-stack';
import { PdfConversationMonitoringStack } from '../lib/pdf-conversation-monitoring-stack';
import { PdfConversationAuthStack } from '../lib/pdf-conversation-auth-stack';
import { PdfConversationFrontendStack } from '../lib/pdf-conversation-frontend-stack';
import { PdfConversationDnsStack } from '../lib/pdf-conversation-dns-stack';
import { buildEnvironmentConfig } from '../lib/environment-config';

const ACCOUNT_ID = process.env.CDK_DEFAULT_ACCOUNT || '123456789012';
const REGION = 'us-west-2';
const ENV = { account: ACCOUNT_ID, region: REGION };
const prodEnvConfig = buildEnvironmentConfig('prod');

function makeApp(): cdk.App {
  return new cdk.App({
    context: { 'aws:cdk:bundling-stacks': [] },
  });
}

function buildSecurityStack(app: cdk.App): PdfConversationSecurityStack {
  return new PdfConversationSecurityStack(app, 'SecurityStack', {
    env: ENV,
    envConfig: prodEnvConfig,
  });
}

function buildInfraStack(app: cdk.App, security: PdfConversationSecurityStack): PdfConversationInfraStack {
  return new PdfConversationInfraStack(app, 'InfraStack', {
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

function buildMonitoringStack(app: cdk.App, infra: PdfConversationInfraStack): PdfConversationMonitoringStack {
  return new PdfConversationMonitoringStack(app, 'MonitoringStack', {
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

function buildAuthStack(app: cdk.App, infra: PdfConversationInfraStack): PdfConversationAuthStack {
  return new PdfConversationAuthStack(app, 'AuthStack', {
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
  let template: Template;

  beforeAll(() => {
    const app = makeApp();
    const stack = buildSecurityStack(app);
    template = Template.fromStack(stack);
  });

  test('creates exactly 8 IAM roles', () => {
    template.resourceCountIs('AWS::IAM::Role', 8);
  });

  test('TextractServiceRole has correct trust principal', () => {
    template.hasResourceProperties('AWS::IAM::Role', {
      RoleName: 'TextractServiceRole',
      AssumeRolePolicyDocument: Match.objectLike({
        Statement: Match.arrayWith([
          Match.objectLike({
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
        ManagedPolicyArns: Match.arrayWith([
          Match.objectLike({
            'Fn::Join': Match.arrayWith([
              Match.arrayWith([
                Match.stringLikeRegexp('AWSLambdaBasicExecutionRole'),
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
      .map((o: { Export?: { Name?: string } }) => o.Export?.Name)
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
  let template: Template;

  beforeAll(() => {
    const app = makeApp();
    const security = buildSecurityStack(app);
    const infra = buildInfraStack(app, security);
    template = Template.fromStack(infra);
  });

  test('creates 3 S3 buckets (processing, digests, vectors-json)', () => {
    template.resourceCountIs('AWS::S3::Bucket', 3);
  });

  test('processing bucket has S3_MANAGED encryption and blocks public access', () => {
    template.hasResourceProperties('AWS::S3::Bucket', {
      BucketName: `pdf-conversation-processing-${ACCOUNT_ID}`,
      BucketEncryption: {
        ServerSideEncryptionConfiguration: Match.arrayWith([
          Match.objectLike({
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
        ServerSideEncryptionConfiguration: Match.arrayWith([
          Match.objectLike({
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
      KeySchema: Match.arrayWith([
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
      KeySchema: Match.arrayWith([
        { AttributeName: 'conversation_id', KeyType: 'HASH' },
      ]),
    });
  });

  test('has folio-usage DynamoDB table with TTL', () => {
    template.hasResourceProperties('AWS::DynamoDB::Table', {
      TableName: 'folio-usage',
      TimeToLiveSpecification: { AttributeName: 'ttl', Enabled: true },
      KeySchema: Match.arrayWith([
        { AttributeName: 'user_id', KeyType: 'HASH' },
        { AttributeName: 'month_key', KeyType: 'RANGE' },
      ]),
    });
  });

  test('DocumentIngestionFunction has USAGE_TABLE env var', () => {
    template.hasResourceProperties('AWS::Lambda::Function', {
      FunctionName: 'DocumentIngestionFunction',
      Environment: {
        Variables: Match.objectLike({ USAGE_TABLE: Match.anyValue() }),
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
      Environment: Match.objectLike({
        Variables: Match.objectLike({
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
      Environment: Match.objectLike({
        Variables: Match.objectLike({
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
      .map((o: { Export?: { Name?: string } }) => o.Export?.Name)
      .filter(Boolean);
    expect(exportNames).toContain('pdf-conversation-processing-bucket');
  });

  test('exports metadata table name', () => {
    const outputs = template.findOutputs('*');
    const exportNames = Object.values(outputs)
      .map((o: { Export?: { Name?: string } }) => o.Export?.Name)
      .filter(Boolean);
    expect(exportNames).toContain('pdf-conversation-metadata-table');
  });
});

// =============================================================================
// MonitoringStack
// =============================================================================

describe('PdfConversationMonitoringStack', () => {
  let template: Template;

  beforeAll(() => {
    const app = makeApp();
    const security = buildSecurityStack(app);
    const infra = buildInfraStack(app, security);
    buildMonitoringStack(app, infra);
    template = Template.fromStack(app.node.findChild('MonitoringStack') as cdk.Stack);
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
      AlarmName: Match.stringLikeRegexp('ConversationFunction.*HighErrorRate'),
      Namespace: 'AWS/Lambda',
      MetricName: 'Errors',
    });
  });
});

// =============================================================================
// AuthStack
// =============================================================================

describe('PdfConversationAuthStack', () => {
  let template: Template;

  beforeAll(() => {
    const app = makeApp();
    const security = buildSecurityStack(app);
    const infra = buildInfraStack(app, security);
    buildAuthStack(app, infra);
    template = Template.fromStack(app.node.findChild('AuthStack') as cdk.Stack);
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
      .map((o: { Export?: { Name?: string } }) => o.Export?.Name)
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
      AttributeMapping: Match.objectLike({
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
      SupportedIdentityProviders: Match.arrayWith(['COGNITO', 'Google']),
    });
  });

  test('UserPoolDomain CfnOutput exists with correct export name', () => {
    const outputs = template.findOutputs('*');
    const exportNames = Object.values(outputs)
      .map((o: { Export?: { Name?: string } }) => o.Export?.Name)
      .filter(Boolean);
    expect(exportNames).toContain('PdfConversation-UserPoolDomain');
  });

  test('UserPool lambdaConfig references PreSignUp and CustomMessage triggers', () => {
    template.hasResourceProperties('AWS::Cognito::UserPool', {
      LambdaConfig: Match.objectLike({
        PreSignUp: Match.anyValue(),
        CustomMessage: Match.anyValue(),
      }),
    });
  });

  test('user pool schema includes mutable name attribute', () => {
    template.hasResourceProperties('AWS::Cognito::UserPool', {
      Schema: Match.arrayWith([
        Match.objectLike({ Name: 'name', Mutable: true, Required: false }),
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
      Schema: Match.arrayWith([
        Match.objectLike({
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
  let template: Template;

  beforeAll(() => {
    const app = makeApp();
    new PdfConversationFrontendStack(app, 'FrontendStack', { env: ENV });
    template = Template.fromStack(app.node.findChild('FrontendStack') as cdk.Stack);
  });

  test('creates exactly 1 S3 bucket', () => {
    template.resourceCountIs('AWS::S3::Bucket', 1);
  });

  test('frontend bucket has correct name and S3_MANAGED encryption', () => {
    template.hasResourceProperties('AWS::S3::Bucket', {
      BucketName: `pdf-conversation-frontend-${ACCOUNT_ID}`,
      BucketEncryption: {
        ServerSideEncryptionConfiguration: Match.arrayWith([
          Match.objectLike({
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
      DistributionConfig: Match.objectLike({
        DefaultCacheBehavior: Match.objectLike({
          ViewerProtocolPolicy: 'redirect-to-https',
        }),
        DefaultRootObject: 'index.html',
        PriceClass: 'PriceClass_100',
      }),
    });
  });

  test('CloudFront has SPA error responses for 403 and 404', () => {
    template.hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: Match.objectLike({
        CustomErrorResponses: Match.arrayWith([
          Match.objectLike({ ErrorCode: 403, ResponseCode: 200, ResponsePagePath: '/index.html' }),
          Match.objectLike({ ErrorCode: 404, ResponseCode: 200, ResponsePagePath: '/index.html' }),
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
  let domainTemplate: Template;

  beforeAll(() => {
    const app = makeApp();
    new PdfConversationFrontendStack(app, 'FrontendStackWithDomain', {
      env: ENV,
      domainName: 'folio.zukonarya.com',
      ssmEnvName: 'prod',
      envConfig: prodEnvConfig,
    });
    domainTemplate = Template.fromStack(app.node.findChild('FrontendStackWithDomain') as cdk.Stack);
  });

  test('CloudFront distribution has custom domain alias', () => {
    domainTemplate.hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: Match.objectLike({
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
  let template: Template;

  beforeAll(() => {
    const app = makeApp();
    new PdfConversationDnsStack(app, 'DnsStack', {
      env: { account: ACCOUNT_ID, region: 'us-east-1' },
      domainName: 'folio.zukonarya.com',
      envName: 'prod',
    });
    template = Template.fromStack(app.node.findChild('DnsStack') as cdk.Stack);
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
      PolicyDocument: Match.objectLike({
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: Match.arrayWith(['ssm:PutParameter', 'ssm:DeleteParameter']),
            Resource: Match.stringLikeRegexp('arn:aws:ssm:us-west-2.*pdfconv'),
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
    const template = Template.fromStack(infra);

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
    const template = Template.fromStack(infra);

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
    const template = Template.fromStack(security);

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
    const template = Template.fromStack(infra);

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
    const template = Template.fromStack(security);

    template.hasResourceProperties('AWS::IAM::Role', {
      RoleName: 'QueryProcessingFunction-role',
      Policies: Match.arrayWith([
        Match.objectLike({
          PolicyName: 'QueryProcessingPolicy',
          PolicyDocument: Match.objectLike({
            Statement: Match.arrayWith([
              Match.objectLike({
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
    const template = Template.fromStack(security);

    template.hasResourceProperties('AWS::IAM::Role', {
      RoleName: 'ConversationFunction-role',
      Policies: Match.arrayWith([
        Match.objectLike({
          PolicyName: 'ConversationFunctionPolicy',
          PolicyDocument: Match.objectLike({
            Statement: Match.arrayWith([
              Match.objectLike({
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
