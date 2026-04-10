#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { PdfConversationInfraStack } from '../lib/pdf-conversation-infra-stack';
import { PdfConversationSecurityStack } from '../lib/pdf-conversation-security-stack';
import { PdfConversationMonitoringStack } from '../lib/pdf-conversation-monitoring-stack';
import { PdfConversationAuthStack } from '../lib/pdf-conversation-auth-stack';
import { PdfConversationFrontendStack } from '../lib/pdf-conversation-frontend-stack';
import { PdfConversationDnsStack } from '../lib/pdf-conversation-dns-stack';
import { buildEnvironmentConfig, EnvironmentName } from '../lib/environment-config';

const app = new cdk.App();

const envName = (app.node.tryGetContext('environment') ?? 'prod') as string;
const validEnvs: EnvironmentName[] = ['dev', 'staging', 'prod'];
if (!validEnvs.includes(envName as EnvironmentName)) {
  throw new Error(`Invalid environment "${envName}". Must be one of: ${validEnvs.join(', ')}`);
}
const envConfig = buildEnvironmentConfig(envName as EnvironmentName);
const p = envConfig.prefix;

const awsEnv = {
  account: envConfig.accountId,
  region: envConfig.region,
};

const usEast1Env = {
  account: envConfig.accountId,
  region: 'us-east-1',
};

const securityStack = new PdfConversationSecurityStack(app, `${p}PdfConversationSecurityStack`, {
  env: awsEnv,
  envConfig,
  description: `IAM roles and policies for PDF Conversation system (${envConfig.name})`,
});

const infraStack = new PdfConversationInfraStack(app, `${p}PdfConversationInfraStack`, {
  env: awsEnv,
  documentIngestionRole: securityStack.documentIngestionRole,
  textractProcessorRole: securityStack.textractProcessorRole,
  textractResultsProcessorRole: securityStack.textractResultsProcessorRole,
  bedrockVectorizationRole: securityStack.bedrockVectorizationRole,
  queryProcessingRole: securityStack.queryProcessingRole,
  conversationFunctionRole: securityStack.conversationFunctionRole,
  usageFunctionRole: securityStack.usageFunctionRole,
  envConfig,
  description: `Core infrastructure and Lambda functions for PDF Conversation system (${envConfig.name})`,
});
infraStack.addDependency(securityStack);

const monitoringStack = new PdfConversationMonitoringStack(app, `${p}PdfConversationMonitoringStack`, {
  env: awsEnv,
  documentIngestionFunction: infraStack.documentIngestionFunction,
  queryProcessingFunction: infraStack.queryProcessingFunction,
  studyBookFunction: infraStack.studyBookFunction,
  studyBookDlq: infraStack.studyBookDlq,
  textractResultsProcessorFunction: infraStack.textractResultsProcessorFunction,
  bedrockVectorizationFunction: infraStack.bedrockVectorizationFunction,
  conversationFunction: infraStack.conversationFunction,
  metadataTable: infraStack.metadataTable,
  queryLogsTable: infraStack.queryLogsTable,
  processingBucket: infraStack.processingBucket,
  vectorsJsonBucket: infraStack.vectorsJsonBucket,
  envConfig,
  description: `CloudWatch monitoring and alerting for PDF Conversation system (${envConfig.name})`,
});
monitoringStack.addDependency(infraStack);

let frontendStack: PdfConversationFrontendStack;

if (envConfig.domainName) {
  const dnsStack = new PdfConversationDnsStack(app, `${p}PdfConversationDnsStack`, {
    env: usEast1Env,
    domainName: envConfig.domainName,
    envName: envConfig.name,
    description: `Route 53 hosted zone and ACM certificate for ${envConfig.domainName}`,
  });

  frontendStack = new PdfConversationFrontendStack(app, `${p}PdfConversationFrontendStack`, {
    env: awsEnv,
    domainName: envConfig.domainName,
    ssmEnvName: envConfig.name,
    envConfig,
    description: `S3 and CloudFront hosting for PDF Conversation frontend (${envConfig.name})`,
  });
  frontendStack.addDependency(dnsStack);
} else {
  frontendStack = new PdfConversationFrontendStack(app, `${p}PdfConversationFrontendStack`, {
    env: awsEnv,
    envConfig,
    description: `S3 and CloudFront hosting for PDF Conversation frontend (${envConfig.name})`,
  });
}

const authStack = new PdfConversationAuthStack(app, `${p}PdfConversationAuthStack`, {
  env: awsEnv,
  queryProcessingFunction: infraStack.queryProcessingFunction,
  documentIngestionFunction: infraStack.documentIngestionFunction,
  processingBucket: infraStack.processingBucket,
  metadataTableName: infraStack.metadataTable.tableName,
  conversationFunction: infraStack.conversationFunction,
  usageFunction: infraStack.usageFunction,
  cloudFrontDomain: frontendStack.distribution.distributionDomainName,
  customDomainName: envConfig.domainName,
  envConfig,
  description: `Cognito authentication and API Gateway for PDF Conversation system (${envConfig.name})`,
});
authStack.addDependency(infraStack);
authStack.addDependency(frontendStack);
