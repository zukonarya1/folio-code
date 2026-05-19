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
exports.PdfConversationAuthStack = void 0;
const cdk = __importStar(require("aws-cdk-lib"));
const cognito = __importStar(require("aws-cdk-lib/aws-cognito"));
const apigateway = __importStar(require("aws-cdk-lib/aws-apigateway"));
const lambda = __importStar(require("aws-cdk-lib/aws-lambda"));
const iam = __importStar(require("aws-cdk-lib/aws-iam"));
class PdfConversationAuthStack extends cdk.Stack {
    userPool;
    userPoolClient;
    api;
    identityPool;
    constructor(scope, id, props) {
        super(scope, id, props);
        const p = props.envConfig.prefix;
        const domainPrefixMap = {
            prod: 'folio',
            staging: 'folio-staging',
            dev: 'folio-dev',
        };
        const domainPrefix = domainPrefixMap[props.envConfig.name] ?? `folio-${props.envConfig.name}`;
        const allowedOrigins = [
            'http://localhost:3000',
            ...(props.cloudFrontDomain ? [`https://${props.cloudFrontDomain}`] : []),
            ...(props.customDomainName ? [`https://${props.customDomainName}`] : []),
        ].join(',');
        // =================================================================
        // COGNITO LAMBDA TRIGGERS
        // =================================================================
        const customMessageFn = new lambda.Function(this, 'CustomMessageFunction', {
            functionName: `${p}CustomMessageTrigger`,
            runtime: lambda.Runtime.PYTHON_3_9,
            handler: 'index.lambda_handler',
            timeout: cdk.Duration.seconds(5),
            code: lambda.Code.fromInline(`
import json

HTML_TEMPLATE = """<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0C0D10;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#0C0D10;min-height:100vh;">
  <tr>
    <td align="center" style="padding:40px 16px;">
      <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">
        <tr>
          <td align="center" style="padding:32px 0 24px;">
            <svg width="28" height="28" viewBox="0 0 28 28" xmlns="http://www.w3.org/2000/svg" style="display:inline-block;vertical-align:middle;margin-right:10px;">
              <polygon points="14,1 27,14 14,27 1,14" fill="none" stroke="#F56565" stroke-width="1.5"/>
              <polygon points="14,6 22,14 14,22 6,14" fill="#F56565" opacity="0.15"/>
              <line x1="14" y1="1" x2="14" y2="27" stroke="#F56565" opacity="0.4"/>
            </svg>
            <span style="font-family:'Courier New',monospace;font-weight:bold;font-size:18px;letter-spacing:3px;color:#E8ECF0;vertical-align:middle;">FOLIO</span>
          </td>
        </tr>
        <tr>
          <td style="background:#151720;border:1px solid #2A2D3A;border-radius:8px;padding:32px;">
            <h1 style="margin:0 0 16px;font-family:Arial,sans-serif;font-size:20px;font-weight:600;color:#E8ECF0;line-height:1.3;">Verify your Folio account.</h1>
            <p style="margin:0 0 24px;font-family:Arial,sans-serif;font-size:14px;color:#C4C9D4;line-height:1.6;">Use the code below to complete your sign-up. It expires in 24 hours.</p>
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td align="center" style="background:#1C1F2B;border:2px solid #F56565;border-radius:6px;padding:24px;">
                  <span style="font-family:'Courier New',monospace;font-size:32px;font-weight:bold;color:#F56565;letter-spacing:0.2em;">{code}</span>
                </td>
              </tr>
            </table>
            <p style="margin:24px 0 0;font-family:Arial,sans-serif;font-size:12px;color:#555B6E;line-height:1.5;">If you didn&#39;t create a Folio account, ignore this email.</p>
          </td>
        </tr>
        <tr>
          <td align="center" style="padding:20px 0 0;">
            <p style="margin:0;font-family:Arial,sans-serif;font-size:11px;color:#555B6E;">folio.zukonarya.com &middot; ZukoNarya</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>"""

def lambda_handler(event, context):
    if event.get('triggerSource') == 'CustomMessage_SignUp':
        code = event['request'].get('codeParameter', '{####}')
        event['response']['emailSubject'] = 'Verify your Folio account'
        event['response']['emailMessage'] = HTML_TEMPLATE.replace('{code}', code)
    return event
`),
        });
        const preSignUpFn = new lambda.Function(this, 'PreSignUpFunction', {
            functionName: `${p}PreSignUpTrigger`,
            runtime: lambda.Runtime.PYTHON_3_9,
            handler: 'index.lambda_handler',
            timeout: cdk.Duration.seconds(5),
            code: lambda.Code.fromInline(`
import json
import boto3
import logging

logger = logging.getLogger()
logger.setLevel(logging.INFO)

cognito_client = boto3.client('cognito-idp')

def lambda_handler(event, context):
    try:
        if event.get('triggerSource') != 'PreSignUp_ExternalProvider':
            return event

        user_pool_id = event['userPoolId']
        email = event['request']['userAttributes'].get('email', '')

        if not email:
            logger.warning('No email found in external provider sign-up attributes')
            return event

        list_response = cognito_client.list_users(
            UserPoolId=user_pool_id,
            Filter=f'email = "{email}"',
            Limit=1,
        )

        existing_users = list_response.get('Users', [])
        if not existing_users:
            return event

        existing_user = existing_users[0]
        existing_username = existing_user['Username']

        username_parts = event['userName'].split('_', 1)
        if len(username_parts) != 2:
            logger.warning(f'Unexpected userName format: {event["userName"]}')
            return event

        provider_name = username_parts[0]
        provider_user_id = username_parts[1]

        cognito_client.admin_link_provider_for_user(
            UserPoolId=user_pool_id,
            DestinationUser={
                'ProviderName': 'Cognito',
                'ProviderAttributeName': 'cognito:username',
                'ProviderAttributeValue': existing_username,
            },
            SourceUser={
                'ProviderName': provider_name,
                'ProviderAttributeName': 'Cognito_Subject',
                'ProviderAttributeValue': provider_user_id,
            },
        )

        logger.info(f'Linked {provider_name} identity to existing user {existing_username}')
    except Exception as e:
        logger.error(f'PreSignUp linking error: {e}')
    return event
`),
        });
        // =================================================================
        // COGNITO USER POOL
        // =================================================================
        this.userPool = new cognito.UserPool(this, 'PdfConversationUserPool', {
            userPoolName: `${p}pdf-conversation-users`,
            selfSignUpEnabled: true,
            signInAliases: {
                email: true,
                username: false,
            },
            autoVerify: {
                email: true,
            },
            standardAttributes: {
                email: {
                    required: true,
                    mutable: true,
                },
                givenName: {
                    required: false,
                    mutable: true,
                },
                familyName: {
                    required: false,
                    mutable: true,
                },
                fullname: {
                    required: false,
                    mutable: true,
                },
            },
            customAttributes: {
                'organization': new cognito.StringAttribute({ mutable: true }),
                'role': new cognito.StringAttribute({ mutable: true }),
            },
            passwordPolicy: {
                minLength: 8,
                requireLowercase: true,
                requireUppercase: true,
                requireDigits: true,
                requireSymbols: false,
                tempPasswordValidity: cdk.Duration.days(7),
            },
            accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
            removalPolicy: cdk.RemovalPolicy.RETAIN,
            // Email verification
            userVerification: {
                emailSubject: 'Verify your PDF Conversation account',
                emailBody: 'Thanks for signing up! Your verification code is {####}',
                emailStyle: cognito.VerificationEmailStyle.CODE,
            },
        });
        const cfnUserPool = this.userPool.node.defaultChild;
        cfnUserPool.lambdaConfig = {
            preSignUp: preSignUpFn.functionArn,
            customMessage: customMessageFn.functionArn,
        };
        preSignUpFn.addToRolePolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: [
                'cognito-idp:AdminGetUser',
                'cognito-idp:ListUsers',
                'cognito-idp:AdminLinkProviderForUser',
            ],
            resources: [`arn:aws:cognito-idp:${props.envConfig.region}:${props.envConfig.accountId}:userpool/*`],
        }));
        customMessageFn.addPermission('CognitoInvokeCustomMessage', {
            principal: new iam.ServicePrincipal('cognito-idp.amazonaws.com'),
            action: 'lambda:InvokeFunction',
            sourceAccount: this.account,
        });
        preSignUpFn.addPermission('CognitoInvokePreSignUp', {
            principal: new iam.ServicePrincipal('cognito-idp.amazonaws.com'),
            action: 'lambda:InvokeFunction',
            sourceAccount: this.account,
        });
        // =================================================================
        // GOOGLE IDENTITY PROVIDER
        // =================================================================
        const googleIdP = new cognito.UserPoolIdentityProviderGoogle(this, 'GoogleIdentityProvider', {
            userPool: this.userPool,
            clientId: cdk.SecretValue.secretsManager(`/pdfconv/${props.envConfig.name}/google-client-id`).unsafeUnwrap(),
            clientSecret: cdk.SecretValue.secretsManager(`/pdfconv/${props.envConfig.name}/google-client-secret`).unsafeUnwrap(),
            scopes: ['email', 'profile', 'openid'],
            attributeMapping: {
                email: cognito.ProviderAttribute.GOOGLE_EMAIL,
                givenName: cognito.ProviderAttribute.GOOGLE_GIVEN_NAME,
                familyName: cognito.ProviderAttribute.GOOGLE_FAMILY_NAME,
                fullname: cognito.ProviderAttribute.GOOGLE_NAME,
            },
        });
        // =================================================================
        // USER POOL DOMAIN
        // =================================================================
        new cognito.UserPoolDomain(this, 'UserPoolDomain', {
            userPool: this.userPool,
            cognitoDomain: {
                domainPrefix,
            },
        });
        // =================================================================
        // USER POOL CLIENT
        // =================================================================
        // User Pool Client (for frontend app)
        this.userPoolClient = this.userPool.addClient('PdfConversationWebClient', {
            userPoolClientName: `${p}pdf-conversation-web-client`,
            authFlows: {
                userPassword: true,
                userSrp: true,
            },
            supportedIdentityProviders: [
                cognito.UserPoolClientIdentityProvider.COGNITO,
                cognito.UserPoolClientIdentityProvider.GOOGLE,
            ],
            oAuth: {
                flows: {
                    authorizationCodeGrant: true,
                    implicitCodeGrant: false,
                },
                scopes: [
                    cognito.OAuthScope.EMAIL,
                    cognito.OAuthScope.OPENID,
                    cognito.OAuthScope.PROFILE,
                ],
                callbackUrls: [
                    'http://localhost:3000/callback',
                    'http://localhost:3000/',
                    'http://localhost:3000/login',
                    ...(props.cloudFrontDomain ? [
                        `https://${props.cloudFrontDomain}/callback`,
                        `https://${props.cloudFrontDomain}/`,
                        `https://${props.cloudFrontDomain}/login`,
                    ] : []),
                    ...(props.customDomainName ? [
                        `https://${props.customDomainName}/callback`,
                        `https://${props.customDomainName}/`,
                        `https://${props.customDomainName}/login`,
                    ] : []),
                ],
                logoutUrls: [
                    'http://localhost:3000/',
                    ...(props.cloudFrontDomain ? [
                        `https://${props.cloudFrontDomain}/`,
                    ] : []),
                    ...(props.customDomainName ? [
                        `https://${props.customDomainName}/`,
                    ] : []),
                ],
            },
            preventUserExistenceErrors: true,
            accessTokenValidity: cdk.Duration.hours(1),
            idTokenValidity: cdk.Duration.hours(1),
            refreshTokenValidity: cdk.Duration.days(30),
            readAttributes: new cognito.ClientAttributes()
                .withStandardAttributes({ email: true, givenName: true, familyName: true, fullname: true })
                .withCustomAttributes('organization', 'role'),
        });
        this.userPoolClient.node.addDependency(googleIdP);
        // =================================================================
        // COGNITO IDENTITY POOL (for S3 direct upload)
        // =================================================================
        this.identityPool = new cognito.CfnIdentityPool(this, 'PdfConversationIdentityPool', {
            identityPoolName: `${p.replace(/-/g, '_')}pdf_conversation_identity_pool`,
            allowUnauthenticatedIdentities: false,
            cognitoIdentityProviders: [
                {
                    clientId: this.userPoolClient.userPoolClientId,
                    providerName: this.userPool.userPoolProviderName,
                },
            ],
        });
        // IAM Role for authenticated users
        const authenticatedRole = new iam.Role(this, 'CognitoAuthenticatedRole', {
            roleName: `${p}PdfConversation-CognitoAuthRole`,
            assumedBy: new iam.FederatedPrincipal('cognito-identity.amazonaws.com', {
                StringEquals: {
                    'cognito-identity.amazonaws.com:aud': this.identityPool.ref,
                },
                'ForAnyValue:StringLike': {
                    'cognito-identity.amazonaws.com:amr': 'authenticated',
                },
            }, 'sts:AssumeRoleWithWebIdentity'),
        });
        // Allow authenticated users to upload to their own folder in S3
        authenticatedRole.addToPolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: [
                's3:PutObject',
                's3:GetObject',
                's3:DeleteObject',
            ],
            resources: [
                `${props.processingBucket.bucketArn}/users/\${cognito-identity.amazonaws.com:sub}/*`,
            ],
        }));
        // Allow authenticated users to list their own folder
        authenticatedRole.addToPolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: [
                's3:ListBucket',
            ],
            resources: [props.processingBucket.bucketArn],
            conditions: {
                StringLike: {
                    's3:prefix': ['users/${cognito-identity.amazonaws.com:sub}/*'],
                },
            },
        }));
        // Attach role to identity pool
        new cognito.CfnIdentityPoolRoleAttachment(this, 'IdentityPoolRoleAttachment', {
            identityPoolId: this.identityPool.ref,
            roles: {
                authenticated: authenticatedRole.roleArn,
            },
        });
        // =================================================================
        // API GATEWAY
        // =================================================================
        this.api = new apigateway.RestApi(this, 'PdfConversationApi', {
            restApiName: 'PDF Conversation API',
            description: 'API for PDF Conversation System',
            deployOptions: {
                stageName: 'v1',
                throttlingBurstLimit: 100,
                throttlingRateLimit: 50,
            },
            defaultCorsPreflightOptions: {
                allowOrigins: [
                    'http://localhost:3000',
                    ...(props.cloudFrontDomain ? [`https://${props.cloudFrontDomain}`] : []),
                    ...(props.customDomainName ? [`https://${props.customDomainName}`] : []),
                ],
                allowMethods: apigateway.Cors.ALL_METHODS,
                allowHeaders: [
                    'Content-Type',
                    'X-Amz-Date',
                    'Authorization',
                    'X-Api-Key',
                    'X-Amz-Security-Token',
                ],
                allowCredentials: true,
            },
        });
        // Cognito Authorizer
        const authorizer = new apigateway.CognitoUserPoolsAuthorizer(this, 'CognitoAuthorizer', {
            cognitoUserPools: [this.userPool],
            authorizerName: 'CognitoAuthorizer',
            identitySource: 'method.request.header.Authorization',
        });
        // =================================================================
        // API ENDPOINTS
        // =================================================================
        // Query endpoint - POST /query
        const queryResource = this.api.root.addResource('query');
        queryResource.addMethod('POST', new apigateway.LambdaIntegration(props.queryProcessingFunction), {
            authorizer,
            authorizationType: apigateway.AuthorizationType.COGNITO,
        });
        // Documents endpoint - GET /documents (list user's documents)
        const documentsResource = this.api.root.addResource('documents');
        // Lambda for listing documents
        const listDocumentsFunction = new lambda.Function(this, 'ListDocumentsFunction', {
            functionName: `${p}ListDocuments`,
            runtime: lambda.Runtime.PYTHON_3_9,
            handler: 'index.lambda_handler',
            code: lambda.Code.fromInline(`
import json
import boto3
import os
from boto3.dynamodb.conditions import Key

dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table(os.environ['METADATA_TABLE'])

ALLOWED_ORIGINS = os.environ.get('ALLOWED_ORIGINS', 'http://localhost:3000').split(',')

def get_cors_origin(event):
    origin = (event.get('headers') or {}).get('origin') or (event.get('headers') or {}).get('Origin', '')
    return origin if origin in ALLOWED_ORIGINS else ALLOWED_ORIGINS[0]

def cors_headers(event):
    return {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': get_cors_origin(event),
        'Access-Control-Allow-Credentials': 'true'
    }

def lambda_handler(event, context):
    print(f"Event: {json.dumps(event)}")

    # Get user_id from Cognito claims
    claims = event.get('requestContext', {}).get('authorizer', {}).get('claims', {})
    user_id = claims.get('sub', '')

    if not user_id:
        return {
            'statusCode': 401,
            'headers': cors_headers(event),
            'body': json.dumps({'error': 'Unauthorized'})
        }

    def _extract_title(item):
        try:
            gs = item.get('generated_summary')
            if not gs:
                return None
            if isinstance(gs, str):
                gs = json.loads(gs)
            return gs.get('title')
        except Exception:
            return None

    try:
        response = table.scan(
            FilterExpression=Key('user_id').eq(user_id),
            ProjectionExpression='document_id, original_filename, #s, created_at, vector_count, generated_summary',
            ExpressionAttributeNames={'#s': 'status'}
        )

        documents = [{
            'document_id': item['document_id'],
            'filename': item.get('original_filename', 'Unknown'),
            'status': item.get('status', 'unknown'),
            'created_at': item.get('created_at', ''),
            'vector_count': int(item.get('vector_count', 0)) if item.get('vector_count') else 0,
            'title': _extract_title(item)
        } for item in response.get('Items', [])]

        return {
            'statusCode': 200,
            'headers': cors_headers(event),
            'body': json.dumps({
                'documents': documents,
                'count': len(documents)
            })
        }
    except Exception as e:
        print(f"Error: {str(e)}")
        return {
            'statusCode': 500,
            'headers': cors_headers(event),
            'body': json.dumps({'error': str(e)})
        }
`),
            environment: {
                METADATA_TABLE: props.metadataTableName,
                ALLOWED_ORIGINS: allowedOrigins,
            },
            timeout: cdk.Duration.seconds(30),
        });
        // Grant DynamoDB read access
        listDocumentsFunction.addToRolePolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: [
                'dynamodb:Scan',
                'dynamodb:Query',
            ],
            resources: [`arn:aws:dynamodb:${this.region}:${this.account}:table/${props.metadataTableName}`],
        }));
        documentsResource.addMethod('GET', new apigateway.LambdaIntegration(listDocumentsFunction), {
            authorizer,
            authorizationType: apigateway.AuthorizationType.COGNITO,
        });
        // Upload presigned URL endpoint - POST /upload/presigned
        const uploadResource = this.api.root.addResource('upload');
        const presignedResource = uploadResource.addResource('presigned');
        const presignedUrlFunction = new lambda.Function(this, 'PresignedUrlFunction', {
            functionName: `${p}GeneratePresignedUrl`,
            runtime: lambda.Runtime.PYTHON_3_9,
            handler: 'index.lambda_handler',
            code: lambda.Code.fromInline(`
import json
import boto3
import os
import re
import uuid
from datetime import datetime

s3_client = boto3.client('s3')
dynamodb = boto3.resource('dynamodb')
BUCKET_NAME = os.environ['BUCKET_NAME']
METADATA_TABLE = os.environ['METADATA_TABLE']

ALLOWED_ORIGINS = os.environ.get('ALLOWED_ORIGINS', 'http://localhost:3000').split(',')

def get_cors_origin(event):
    origin = (event.get('headers') or {}).get('origin') or (event.get('headers') or {}).get('Origin', '')
    return origin if origin in ALLOWED_ORIGINS else ALLOWED_ORIGINS[0]

def cors_headers(event):
    return {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': get_cors_origin(event),
        'Access-Control-Allow-Credentials': 'true'
    }

def lambda_handler(event, context):
    print(f"Event: {json.dumps(event)}")

    claims = event.get('requestContext', {}).get('authorizer', {}).get('claims', {})
    user_id = claims.get('sub', '')

    if not user_id:
        return {
            'statusCode': 401,
            'headers': cors_headers(event),
            'body': json.dumps({'error': 'Unauthorized'})
        }

    try:
        body = json.loads(event.get('body', '{}'))
        original_filename = body.get('filename', 'document.pdf')
        original_filename = re.sub(r'[/\\\\<>:"|?*\\x00-\\x1f]', '_', original_filename)
        if len(original_filename) > 255:
            original_filename = original_filename[:255]
        content_type = body.get('content_type', 'application/pdf')

        document_id = str(uuid.uuid4())
        s3_key = f"users/{user_id}/{document_id}.pdf"

        table = dynamodb.Table(METADATA_TABLE)
        table.put_item(Item={
            'document_id': document_id,
            'user_id': user_id,
            'original_filename': original_filename,
            'original_s3_location': {'bucket': BUCKET_NAME, 'key': s3_key},
            'status': 'uploading',
            'created_at': datetime.utcnow().isoformat(),
            'processing_metadata': {}
        })

        presigned_url = s3_client.generate_presigned_url(
            'put_object',
            Params={
                'Bucket': BUCKET_NAME,
                'Key': s3_key,
                'ContentType': content_type,
            },
            ExpiresIn=3600
        )

        return {
            'statusCode': 200,
            'headers': cors_headers(event),
            'body': json.dumps({
                'presigned_url': presigned_url,
                'document_id': document_id,
                'expires_in': 3600
            })
        }
    except Exception as e:
        print(f"Error: {str(e)}")
        return {
            'statusCode': 500,
            'headers': cors_headers(event),
            'body': json.dumps({'error': 'Failed to generate upload URL'})
        }
`),
            environment: {
                BUCKET_NAME: props.processingBucket.bucketName,
                METADATA_TABLE: props.metadataTableName,
                ALLOWED_ORIGINS: allowedOrigins,
            },
            timeout: cdk.Duration.seconds(30),
        });
        // Grant S3 permissions for presigned URLs
        presignedUrlFunction.addToRolePolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ['s3:PutObject'],
            resources: [`${props.processingBucket.bucketArn}/*`],
        }));
        presignedUrlFunction.addToRolePolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ['dynamodb:PutItem'],
            resources: [`arn:aws:dynamodb:${this.region}:${this.account}:table/${props.metadataTableName}`],
        }));
        presignedResource.addMethod('POST', new apigateway.LambdaIntegration(presignedUrlFunction), {
            authorizer,
            authorizationType: apigateway.AuthorizationType.COGNITO,
        });
        const getDocumentSummaryFunction = new lambda.Function(this, 'GetDocumentSummaryFunction', {
            functionName: `${p}GetDocumentSummary`,
            runtime: lambda.Runtime.PYTHON_3_9,
            handler: 'index.lambda_handler',
            code: lambda.Code.fromInline(`
import json
import boto3
import os
from decimal import Decimal

dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table(os.environ['METADATA_TABLE'])

ALLOWED_ORIGINS = os.environ.get('ALLOWED_ORIGINS', 'http://localhost:3000').split(',')

def get_cors_origin(event):
    origin = (event.get('headers') or {}).get('origin') or (event.get('headers') or {}).get('Origin', '')
    return origin if origin in ALLOWED_ORIGINS else ALLOWED_ORIGINS[0]

def cors_headers(event):
    return {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': get_cors_origin(event),
        'Access-Control-Allow-Credentials': 'true'
    }

def decimal_default(obj):
    if isinstance(obj, Decimal):
        return int(obj) if obj % 1 == 0 else float(obj)
    raise TypeError

def lambda_handler(event, context):
    claims = event.get('requestContext', {}).get('authorizer', {}).get('claims', {})
    user_id = claims.get('sub', '')

    if not user_id:
        return {
            'statusCode': 401,
            'headers': cors_headers(event),
            'body': json.dumps({'error': 'Unauthorized'})
        }

    path_params = event.get('pathParameters') or {}
    document_id = path_params.get('id', '')

    if not document_id:
        return {
            'statusCode': 400,
            'headers': cors_headers(event),
            'body': json.dumps({'error': 'Missing document ID'})
        }

    try:
        response = table.get_item(Key={'document_id': document_id})

        if 'Item' not in response:
            return {
                'statusCode': 404,
                'headers': cors_headers(event),
                'body': json.dumps({'error': 'Document not found'})
            }

        item = response['Item']

        if item.get('user_id', '') != user_id:
            return {
                'statusCode': 404,
                'headers': cors_headers(event),
                'body': json.dumps({'error': 'Document not found'})
            }

        result = {
            'document_id': item['document_id'],
            'filename': item.get('original_filename', 'Unknown'),
            'status': item.get('status', 'unknown'),
            'generated_summary': item.get('generated_summary')
        }

        if 'summary_generated_at' in item:
            result['summary_generated_at'] = item['summary_generated_at']

        return {
            'statusCode': 200,
            'headers': cors_headers(event),
            'body': json.dumps(result, default=decimal_default)
        }
    except Exception as e:
        print(f"Error: {str(e)}")
        return {
            'statusCode': 500,
            'headers': cors_headers(event),
            'body': json.dumps({'error': str(e)})
        }
`),
            environment: {
                METADATA_TABLE: props.metadataTableName,
                ALLOWED_ORIGINS: allowedOrigins,
            },
            timeout: cdk.Duration.seconds(30),
        });
        getDocumentSummaryFunction.addToRolePolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ['dynamodb:GetItem'],
            resources: [`arn:aws:dynamodb:${this.region}:${this.account}:table/${props.metadataTableName}`],
        }));
        const documentIdResource = documentsResource.addResource('{id}');
        const summaryResource = documentIdResource.addResource('summary');
        summaryResource.addMethod('GET', new apigateway.LambdaIntegration(getDocumentSummaryFunction), {
            authorizer,
            authorizationType: apigateway.AuthorizationType.COGNITO,
        });
        const conversationsResource = documentIdResource.addResource('conversations');
        conversationsResource.addMethod('GET', new apigateway.LambdaIntegration(props.conversationFunction), {
            authorizer,
            authorizationType: apigateway.AuthorizationType.COGNITO,
        });
        conversationsResource.addMethod('POST', new apigateway.LambdaIntegration(props.conversationFunction), {
            authorizer,
            authorizationType: apigateway.AuthorizationType.COGNITO,
        });
        const conversationIdResource = conversationsResource.addResource('{convId}');
        conversationIdResource.addMethod('GET', new apigateway.LambdaIntegration(props.conversationFunction), {
            authorizer,
            authorizationType: apigateway.AuthorizationType.COGNITO,
        });
        // Delete account endpoint - DELETE /users/me
        const deleteAccountFunction = new lambda.Function(this, 'DeleteAccountFunction', {
            functionName: `${p}DeleteAccount`,
            runtime: lambda.Runtime.PYTHON_3_9,
            handler: 'index.lambda_handler',
            code: lambda.Code.fromInline(`
import json
import boto3
import os
from boto3.dynamodb.conditions import Attr

s3_client = boto3.client('s3')
dynamodb = boto3.resource('dynamodb')
BUCKET_NAME = os.environ['BUCKET_NAME']
METADATA_TABLE = os.environ['METADATA_TABLE']

ALLOWED_ORIGINS = os.environ.get('ALLOWED_ORIGINS', 'http://localhost:3000').split(',')

def get_cors_origin(event):
    origin = (event.get('headers') or {}).get('origin') or (event.get('headers') or {}).get('Origin', '')
    return origin if origin in ALLOWED_ORIGINS else ALLOWED_ORIGINS[0]

def cors_headers(event):
    return {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': get_cors_origin(event),
        'Access-Control-Allow-Credentials': 'true'
    }

def lambda_handler(event, context):
    claims = event.get('requestContext', {}).get('authorizer', {}).get('claims', {})
    user_id = claims.get('sub', '')

    if not user_id:
        return {
            'statusCode': 401,
            'headers': cors_headers(event),
            'body': json.dumps({'error': 'Unauthorized'})
        }

    try:
        table = dynamodb.Table(METADATA_TABLE)

        # Scan for all documents belonging to this user
        response = table.scan(FilterExpression=Attr('user_id').eq(user_id))
        items = response.get('Items', [])
        while 'LastEvaluatedKey' in response:
            response = table.scan(
                FilterExpression=Attr('user_id').eq(user_id),
                ExclusiveStartKey=response['LastEvaluatedKey']
            )
            items.extend(response.get('Items', []))

        # Delete each tracked S3 object
        for item in items:
            s3_loc = item.get('original_s3_location', {})
            key = s3_loc.get('key', '')
            if key:
                s3_client.delete_object(Bucket=BUCKET_NAME, Key=key)

        # Delete any orphaned objects under users/{user_id}/
        paginator = s3_client.get_paginator('list_objects_v2')
        for page in paginator.paginate(Bucket=BUCKET_NAME, Prefix=f'users/{user_id}/'):
            objects = [{'Key': obj['Key']} for obj in page.get('Contents', [])]
            if objects:
                s3_client.delete_objects(Bucket=BUCKET_NAME, Delete={'Objects': objects})

        # Batch-delete DynamoDB records
        with table.batch_writer() as batch:
            for item in items:
                batch.delete_item(Key={'document_id': item['document_id']})

        return {
            'statusCode': 200,
            'headers': cors_headers(event),
            'body': json.dumps({'message': 'Account data deleted'})
        }
    except Exception as e:
        print(f"Error: {str(e)}")
        return {
            'statusCode': 500,
            'headers': cors_headers(event),
            'body': json.dumps({'error': str(e)})
        }
`),
            environment: {
                BUCKET_NAME: props.processingBucket.bucketName,
                METADATA_TABLE: props.metadataTableName,
                ALLOWED_ORIGINS: allowedOrigins,
            },
            timeout: cdk.Duration.seconds(60),
        });
        deleteAccountFunction.addToRolePolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ['dynamodb:Scan', 'dynamodb:DeleteItem', 'dynamodb:BatchWriteItem'],
            resources: [`arn:aws:dynamodb:${this.region}:${this.account}:table/${props.metadataTableName}`],
        }));
        deleteAccountFunction.addToRolePolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ['s3:DeleteObject', 's3:ListBucket'],
            resources: [props.processingBucket.bucketArn, `${props.processingBucket.bucketArn}/*`],
        }));
        const usersResource = this.api.root.addResource('users');
        const meResource = usersResource.addResource('me');
        meResource.addMethod('DELETE', new apigateway.LambdaIntegration(deleteAccountFunction), {
            authorizer,
            authorizationType: apigateway.AuthorizationType.COGNITO,
        });
        const usageResource = meResource.addResource('usage');
        usageResource.addMethod('GET', new apigateway.LambdaIntegration(props.usageFunction), {
            authorizer,
            authorizationType: apigateway.AuthorizationType.COGNITO,
        });
        // =================================================================
        // OUTPUTS
        // =================================================================
        new cdk.CfnOutput(this, 'UserPoolId', {
            value: this.userPool.userPoolId,
            description: 'Cognito User Pool ID',
            exportName: `${p}PdfConversation-UserPoolId`,
        });
        new cdk.CfnOutput(this, 'UserPoolClientId', {
            value: this.userPoolClient.userPoolClientId,
            description: 'Cognito User Pool Client ID',
            exportName: `${p}PdfConversation-UserPoolClientId`,
        });
        new cdk.CfnOutput(this, 'IdentityPoolId', {
            value: this.identityPool.ref,
            description: 'Cognito Identity Pool ID',
            exportName: `${p}PdfConversation-IdentityPoolId`,
        });
        new cdk.CfnOutput(this, 'ApiEndpoint', {
            value: this.api.url,
            description: 'API Gateway Endpoint URL',
            exportName: `${p}PdfConversation-ApiEndpoint`,
        });
        new cdk.CfnOutput(this, 'CognitoRegion', {
            value: this.region,
            description: 'AWS Region for Cognito',
            exportName: `${p}PdfConversation-CognitoRegion`,
        });
        new cdk.CfnOutput(this, 'UserPoolDomainOutput', {
            value: `${domainPrefix}.auth.${this.region}.amazoncognito.com`,
            description: 'Cognito User Pool Domain',
            exportName: `${p}PdfConversation-UserPoolDomain`,
        });
    }
}
exports.PdfConversationAuthStack = PdfConversationAuthStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicGRmLWNvbnZlcnNhdGlvbi1hdXRoLXN0YWNrLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsicGRmLWNvbnZlcnNhdGlvbi1hdXRoLXN0YWNrLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUEsaURBQW1DO0FBRW5DLGlFQUFtRDtBQUNuRCx1RUFBeUQ7QUFDekQsK0RBQWlEO0FBQ2pELHlEQUEyQztBQWdCM0MsTUFBYSx3QkFBeUIsU0FBUSxHQUFHLENBQUMsS0FBSztJQUNyQyxRQUFRLENBQW1CO0lBQzNCLGNBQWMsQ0FBeUI7SUFDdkMsR0FBRyxDQUFxQjtJQUN4QixZQUFZLENBQTBCO0lBRXRELFlBQVksS0FBZ0IsRUFBRSxFQUFVLEVBQUUsS0FBb0M7UUFDNUUsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFFeEIsTUFBTSxDQUFDLEdBQUcsS0FBSyxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUM7UUFFakMsTUFBTSxlQUFlLEdBQTJCO1lBQzlDLElBQUksRUFBRSxPQUFPO1lBQ2IsT0FBTyxFQUFFLGVBQWU7WUFDeEIsR0FBRyxFQUFFLFdBQVc7U0FDakIsQ0FBQztRQUNGLE1BQU0sWUFBWSxHQUFHLGVBQWUsQ0FBQyxLQUFLLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxJQUFJLFNBQVMsS0FBSyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsQ0FBQztRQUU5RixNQUFNLGNBQWMsR0FBRztZQUNyQix1QkFBdUI7WUFDdkIsR0FBRyxDQUFDLEtBQUssQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDLENBQUMsQ0FBQyxXQUFXLEtBQUssQ0FBQyxnQkFBZ0IsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQztZQUN4RSxHQUFHLENBQUMsS0FBSyxDQUFDLGdCQUFnQixDQUFDLENBQUMsQ0FBQyxDQUFDLFdBQVcsS0FBSyxDQUFDLGdCQUFnQixFQUFFLENB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VSxFQUFFLEdBQUcsQ0FBQyxnQ0FBZ0M7U0FDakQsQ0FBQyxDQUFDO1FBRUgsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxhQUFhLEVBQUU7WUFDckMsS0FBSyxFQUFFLElBQUksQ0FBQyxHQUFHLENBQUMsR0FBRztZQUNuQixXQUFXLEVBQUUsMEJBQTBCO1lBQ3ZDLFVBQVUsRUFBRSxHQUFHLENBQUMsNkJBQTZCO1NBQzlDLENBQUMsQ0FBQztRQUVILElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsZUFBZSxFQUFFO1lBQ3ZDLEtBQUssRUFBRSxJQUFJLENBQUMsTUFBTTtZQUNsQixXQUFXLEVBQUUsd0JBQXdCO1lBQ3JDLFVBQVUsRUFBRSxHQUFHLENBQUMsK0JBQStCO1NBQ2hELENBQUMsQ0FBQztRQUVILElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsc0JBQXNCLEVBQUU7WUFDOUMsS0FBSyxFQUFFLEdBQUcsWUFBWSxTQUFTLElBQUksQ0FBQyxNQUFNLG9CQUFvQjtZQUM5RCxXQUFXLEVBQUUsMEJBQTBCO1lBQ3ZDLFVBQVUsRUFBRSxHQUFHLENBQUMsZ0NBQWdDO1NBQ2pELENBQUMsQ0FBQztJQUNMLENBQUM7Q0FDRjtBQXA4QkQsNERBbzhCQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIGNkayBmcm9tICdhd3MtY2RrLWxpYic7XG5pbXBvcnQgeyBDb25zdHJ1Y3QgfSBmcm9tICdjb25zdHJ1Y3RzJztcbmltcG9ydCAqIGFzIGNvZ25pdG8gZnJvbSAnYXdzLWNkay1saWIvYXdzLWNvZ25pdG8nO1xuaW1wb3J0ICogYXMgYXBpZ2F0ZXdheSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtYXBpZ2F0ZXdheSc7XG5pbXBvcnQgKiBhcyBsYW1iZGEgZnJvbSAnYXdzLWNkay1saWIvYXdzLWxhbWJkYSc7XG5pbXBvcnQgKiBhcyBpYW0gZnJvbSAnYXdzLWNkay1saWIvYXdzLWlhbSc7XG5pbXBvcnQgKiBhcyBzMyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtczMnO1xuaW1wb3J0IHsgRW52aXJvbm1lbnRDb25maWcgfSBmcm9tICcuL2Vudmlyb25tZW50LWNvbmZpZyc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgUGRmQ29udmVyc2F0aW9uQXV0aFN0YWNrUHJvcHMgZXh0ZW5kcyBjZGsuU3RhY2tQcm9wcyB7XG4gIHJlYWRvbmx5IHF1ZXJ5UHJvY2Vzc2luZ0Z1bmN0aW9uOiBsYW1iZGEuSUZ1bmN0aW9uO1xuICByZWFkb25seSBkb2N1bWVudEluZ2VzdGlvbkZ1bmN0aW9uOiBsYW1iZGEuSUZ1bmN0aW9uO1xuICByZWFkb25seSBwcm9jZXNzaW5nQnVja2V0OiBzMy5JQnVja2V0O1xuICByZWFkb25seSBtZXRhZGF0YVRhYmxlTmFtZTogc3RyaW5nO1xuICByZWFkb25seSBjb252ZXJzYXRpb25GdW5jdGlvbjogbGFtYmRhLklGdW5jdGlvbjtcbiAgcmVhZG9ubHkgdXNhZ2VGdW5jdGlvbjogbGFtYmRhLklGdW5jdGlvbjtcbiAgcmVhZG9ubHkgY2xvdWRGcm9udERvbWFpbj86IHN0cmluZztcbiAgcmVhZG9ubHkgY3VzdG9tRG9tYWluTmFtZT86IHN0cmluZztcbiAgcmVhZG9ubHkgZW52Q29uZmlnOiBFbnZpcm9ubWVudENvbmZpZztcbn1cblxuZXhwb3J0IGNsYXNzIFBkZkNvbnZlcnNhdGlvbkF1dGhTdGFjayBleHRlbmRzIGNkay5TdGFjayB7XG4gIHB1YmxpYyByZWFkb25seSB1c2VyUG9vbDogY29nbml0by5Vc2VyUG9vbDtcbiAgcHVibGljIHJlYWRvbmx5IHVzZXJQb29sQ2xpZW50OiBjb2duaXRvLlVzZXJQb29sQ2xpZW50O1xuICBwdWJsaWMgcmVhZG9ubHkgYXBpOiBhcGlnYXRld2F5LlJlc3RBcGk7XG4gIHB1YmxpYyByZWFkb25seSBpZGVudGl0eVBvb2w6IGNvZ25pdG8uQ2ZuSWRlbnRpdHlQb29sO1xuXG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzOiBQZGZDb252ZXJzYXRpb25BdXRoU3RhY2tQcm9wcykge1xuICAgIHN1cGVyKHNjb3BlLCBpZCwgcHJvcHMpO1xuXG4gICAgY29uc3QgcCA9IHByb3BzLmVudkNvbmZpZy5wcmVmaXg7XG5cbiAgICBjb25zdCBkb21haW5QcmVmaXhNYXA6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7XG4gICAgICBwcm9kOiAnZm9saW8nLFxuICAgICAgc3RhZ2luZzogJ2ZvbGlvLXN0YWdpbmcnLFxuICAgICAgZGV2OiAnZm9saW8tZGV2JyxcbiAgICB9O1xuICAgIGNvbnN0IGRvbWFpblByZWZpeCA9IGRvbWFpblByZWZpeE1hcFtwcm9wcy5lbnZDb25maWcubmFtZV0gPz8gYGZvbGlvLSR7cHJvcHMuZW52Q29uZmlnLm5hbWV9YDtcblxuICAgIGNvbnN0IGFsbG93ZWRPcmlnaW5zID0gW1xuICAgICAgJ2h0dHA6Ly9sb2NhbGhvc3Q6MzAwMCcsXG4gICAgICAuLi4ocHJvcHMuY2xvdWRGcm9udERvbWFpbiA/IFtgaHR0cHM6Ly8ke3Byb3BzLmNsb3VkRnJvbnREb21haW59YF0gOiBbXSksXG4gICAgICAuLi4ocHJvcHMuY3VzdG9tRG9tYWluTmFtZSA/IFtgaHR0cHM6Ly8ke3Byb3BzLmN1c3RvbURvbWFpbk5hbWV9YF0gOiBbXSksXG4gICAgXS5qb2luKCcsJyk7XG5cbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAgIC8vIENPR05JVE8gTEFNQkRBIFRSSUdHRVJTXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuICAgIGNvbnN0IGN1c3RvbU1lc3NhZ2VGbiA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgJ0N1c3RvbU1lc3NhZ2VGdW5jdGlvbicsIHtcbiAgICAgIGZ1bmN0aW9uTmFtZTogYCR7cH1DdXN0b21NZXNzYWdlVHJpZ2dlcmAsXG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5QWVRIT05fM185LFxuICAgICAgaGFuZGxlcjogJ2luZGV4LmxhbWJkYV9oYW5kbGVyJyxcbiAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDUpLFxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUlubGluZShgXG5pbXBvcnQganNvblxuXG5IVE1MX1RFTVBMQVRFID0gXCJcIlwiPCFET0NUWVBFIGh0bWw+XG48aHRtbCBsYW5nPVwiZW5cIj5cbjxoZWFkPjxtZXRhIGNoYXJzZXQ9XCJVVEYtOFwiPjxtZXRhIG5hbWU9XCJ2aWV3cG9ydFwiIGNvbnRlbnQ9XCJ3aWR0aD1kZXZpY2Utd2lkdGgsaW5pdGlhbC1zY2FsZT0xXCI+PC9oZWFkPlxuPGJvZHkgc3R5bGU9XCJtYXJnaW46MDtwYWRkaW5nOjA7YmFja2dyb3VuZDojMEMwRDEwO2ZvbnQtZmFtaWx5OkFyaWFsLHNhbnMtc2VyaWY7XCI+XG48dGFibGUgd2lkdGg9XCIxMDAlXCIgY2VsbHBhZGRpbmc9XCIwXCIgY2VsbHNwYWNpbmc9XCIwXCIgYm9yZGVyPVwiMFwiIHN0eWxlPVwiYmFja2dyb3VuZDojMEMwRDEwO21pbi1oZWlnaHQ6MTAwdmg7XCI+XG4gIDx0cj5cbiAgICA8dGQgYWxpZ249XCJjZW50ZXJcIiBzdHlsZT1cInBhZGRpbmc6NDBweCAxNnB4O1wiPlxuICAgICAgPHRhYmxlIHdpZHRoPVwiNjAwXCIgY2VsbHBhZGRpbmc9XCIwXCIgY2VsbHNwYWNpbmc9XCIwXCIgYm9yZGVyPVwiMFwiIHN0eWxlPVwibWF4LXdpZHRoOjYwMHB4O3dpZHRoOjEwMCU7XCI+XG4gICAgICAgIDx0cj5cbiAgICAgICAgICA8dGQgYWxpZ249XCJjZW50ZXJcIiBzdHlsZT1cInBhZGRpbmc6MzJweCAwIDI0cHg7XCI+XG4gICAgICAgICAgICA8c3ZnIHdpZHRoPVwiMjhcIiBoZWlnaHQ9XCIyOFwiIHZpZXdCb3g9XCIwIDAgMjggMjhcIiB4bWxucz1cImh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnXCIgc3R5bGU9XCJkaXNwbGF5OmlubGluZS1ibG9jazt2ZXJ0aWNhbC1hbGlnbjptaWRkbGU7bWFyZ2luLXJpZ2h0OjEwcHg7XCI+XG4gICAgICAgICAgICAgIDxwb2x5Z29uIHBvaW50cz1cIjE0LDEgMjcsMTQgMTQsMjcgMSwxNFwiIGZpbGw9XCJub25lXCIgc3Ryb2tlPVwiI0Y1NjU2NVwiIHN0cm9rZS13aWR0aD1cIjEuNVwiLz5cbiAgICAgICAgICAgICAgPHBvbHlnb24gcG9pbnRzPVwiMTQsNiAyMiwxNCAxNCwyMiA2LDE0XCIgZmlsbD1cIiNGNTY1NjVcIiBvcGFjaXR5PVwiMC4xNVwiLz5cbiAgICAgICAgICAgICAgPGxpbmUgeDE9XCIxNFwiIHkxPVwiMVwiIHgyPVwiMTRcIiB5Mj1cIjI3XCIgc3Ryb2tlPVwiI0Y1NjU2NVwiIG9wYWNpdHk9XCIwLjRcIi8+XG4gICAgICAgICAgICA8L3N2Zz5cbiAgICAgICAgICAgIDxzcGFuIHN0eWxlPVwiZm9udC1mYW1pbHk6J0NvdXJpZXIgTmV3Jyxtb25vc3BhY2U7Zm9udC13ZWlnaHQ6Ym9sZDtmb250LXNpemU6MThweDtsZXR0ZXItc3BhY2luZzozcHg7Y29sb3I6I0U4RUNGMDt2ZXJ0aWNhbC1hbGlnbjptaWRkbGU7XCI+Rk9MSU88L3NwYW4+XG4gICAgICAgICAgPC90ZD5cbiAgICAgICAgPC90cj5cbiAgICAgICAgPHRyPlxuICAgICAgICAgIDx0ZCBzdHlsZT1cImJhY2tncm91bmQ6IzE1MTcyMDtib3JkZXI6MXB4IHNvbGlkICMyQTJEM0E7Ym9yZGVyLXJhZGl1czo4cHg7cGFkZGluZzozMnB4O1wiPlxuICAgICAgICAgICAgPGgxIHN0eWxlPVwibWFyZ2luOjAgMCAxNnB4O2ZvbnQtZmFtaWx5OkFyaWFsLHNhbnMtc2VyaWY7Zm9udC1zaXplOjIwcHg7Zm9udC13ZWlnaHQ6NjAwO2NvbG9yOiNFOEVDRjA7bGluZS1oZWlnaHQ6MS4zO1wiPlZlcmlmeSB5b3VyIEZvbGlvIGFjY291bnQuPC9oMT5cbiAgICAgICAgICAgIDxwIHN0eWxlPVwibWFyZ2luOjAgMCAyNHB4O2ZvbnQtZmFtaWx5OkFyaWFsLHNhbnMtc2VyaWY7Zm9udC1zaXplOjE0cHg7Y29sb3I6I0M0QzlENDtsaW5lLWhlaWdodDoxLjY7XCI+VXNlIHRoZSBjb2RlIGJlbG93IHRvIGNvbXBsZXRlIHlvdXIgc2lnbi11cC4gSXQgZXhwaXJlcyBpbiAyNCBob3Vycy48L3A+XG4gICAgICAgICAgICA8dGFibGUgd2lkdGg9XCIxMDAlXCIgY2VsbHBhZGRpbmc9XCIwXCIgY2VsbHNwYWNpbmc9XCIwXCIgYm9yZGVyPVwiMFwiPlxuICAgICAgICAgICAgICA8dHI+XG4gICAgICAgICAgICAgICAgPHRkIGFsaWduPVwiY2VudGVyXCIgc3R5bGU9XCJiYWNrZ3JvdW5kOiMxQzFGMkI7Ym9yZGVyOjJweCBzb2xpZCAjRjU2NTY1O2JvcmRlci1yYWRpdXM6NnB4O3BhZGRpbmc6MjRweDtcIj5cbiAgICAgICAgICAgICAgICAgIDxzcGFuIHN0eWxlPVwiZm9udC1mYW1pbHk6J0NvdXJpZXIgTmV3Jyxtb25vc3BhY2U7Zm9udC1zaXplOjMycHg7Zm9udC13ZWlnaHQ6Ym9sZDtjb2xvcjojRjU2NTY1O2xldHRlci1zcGFjaW5nOjAuMmVtO1wiPntjb2RlfTwvc3Bhbj5cbiAgICAgICAgICAgICAgICA8L3RkPlxuICAgICAgICAgICAgICA8L3RyPlxuICAgICAgICAgICAgPC90YWJsZT5cbiAgICAgICAgICAgIDxwIHN0eWxlPVwibWFyZ2luOjI0cHggMCAwO2ZvbnQtZmFtaWx5OkFyaWFsLHNhbnMtc2VyaWY7Zm9udC1zaXplOjEycHg7Y29sb3I6IzU1NUI2RTtsaW5lLWhlaWdodDoxLjU7XCI+SWYgeW91IGRpZG4mIzM5O3QgY3JlYXRlIGEgRm9saW8gYWNjb3VudCwgaWdub3JlIHRoaXMgZW1haWwuPC9wPlxuICAgICAgICAgIDwvdGQ+XG4gICAgICAgIDwvdHI+XG4gICAgICAgIDx0cj5cbiAgICAgICAgICA8dGQgYWxpZ249XCJjZW50ZXJcIiBzdHlsZT1cInBhZGRpbmc6MjBweCAwIDA7XCI+XG4gICAgICAgICAgICA8cCBzdHlsZT1cIm1hcmdpbjowO2ZvbnQtZmFtaWx5OkFyaWFsLHNhbnMtc2VyaWY7Zm9udC1zaXplOjExcHg7Y29sb3I6IzU1NUI2RTtcIj5mb2xpby56dWtvbmFyeWEuY29tICZtaWRkb3Q7IFp1a29OYXJ5YTwvcD5cbiAgICAgICAgICA8L3RkPlxuICAgICAgICA8L3RyPlxuICAgICAgPC90YWJsZT5cbiAgICA8L3RkPlxuICA8L3RyPlxuPC90YWJsZT5cbjwvYm9keT5cbjwvaHRtbD5cIlwiXCJcblxuZGVmIGxhbWJkYV9oYW5kbGVyKGV2ZW50LCBjb250ZXh0KTpcbiAgICBpZiBldmVudC5nZXQoJ3RyaWdnZXJTb3VyY2UnKSA9PSAnQ3VzdG9tTWVzc2FnZV9TaWduVXAnOlxuICAgICAgICBjb2RlID0gZXZlbnRbJ3JlcXVlc3QnXS5nZXQoJ2NvZGVQYXJhbWV0ZXInLCAneyMjIyN9JylcbiAgICAgICAgZXZlbnRbJ3Jlc3BvbnNlJ11bJ2VtYWlsU3ViamVjdCddID0gJ1ZlcmlmeSB5b3VyIEZvbGlvIGFjY291bnQnXG4gICAgICAgIGV2ZW50WydyZXNwb25zZSddWydlbWFpbE1lc3NhZ2UnXSA9IEhUTUxfVEVNUExBVEUucmVwbGFjZSgne2NvZGV9JywgY29kZSlcbiAgICByZXR1cm4gZXZlbnRcbmApLFxuICAgIH0pO1xuXG4gICAgY29uc3QgcHJlU2lnblVwRm4gPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsICdQcmVTaWduVXBGdW5jdGlvbicsIHtcbiAgICAgIGZ1bmN0aW9uTmFtZTogYCR7cH1QcmVTaWduVXBUcmlnZ2VyYCxcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLlBZVEhPTl8zXzksXG4gICAgICBoYW5kbGVyOiAnaW5kZXgubGFtYmRhX2hhbmRsZXInLFxuICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLnNlY29uZHMoNSksXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tSW5saW5lKGBcbmltcG9ydCBqc29uXG5pbXBvcnQgYm90bzNcbmltcG9ydCBsb2dnaW5nXG5cbmxvZ2dlciA9IGxvZ2dpbmcuZ2V0TG9nZ2VyKClcbmxvZ2dlci5zZXRMZXZlbChsb2dnaW5nLklORk8pXG5cbmNvZ25pdG9fY2xpZW50ID0gYm90bzMuY2xpZW50KCdjb2duaXRvLWlkcCcpXG5cbmRlZiBsYW1iZGFfaGFuZGxlcihldmVudCwgY29udGV4dCk6XG4gICAgdHJ5OlxuICAgICAgICBpZiBldmVudC5nZXQoJ3RyaWdnZXJTb3VyY2UnKSAhPSAnUHJlU2lnblVwX0V4dGVybmFsUHJvdmlkZXInOlxuICAgICAgICAgICAgcmV0dXJuIGV2ZW50XG5cbiAgICAgICAgdXNlcl9wb29sX2lkID0gZXZlbnRbJ3VzZXJQb29sSWQnXVxuICAgICAgICBlbWFpbCA9IGV2ZW50WydyZXF1ZXN0J11bJ3VzZXJBdHRyaWJ1dGVzJ10uZ2V0KCdlbWFpbCcsICcnKVxuXG4gICAgICAgIGlmIG5vdCBlbWFpbDpcbiAgICAgICAgICAgIGxvZ2dlci53YXJuaW5nKCdObyBlbWFpbCBmb3VuZCBpbiBleHRlcm5hbCBwcm92aWRlciBzaWduLXVwIGF0dHJpYnV0ZXMnKVxuICAgICAgICAgICAgcmV0dXJuIGV2ZW50XG5cbiAgICAgICAgbGlzdF9yZXNwb25zZSA9IGNvZ25pdG9fY2xpZW50Lmxpc3RfdXNlcnMoXG4gICAgICAgICAgICBVc2VyUG9vbElkPXVzZXJfcG9vbF9pZCxcbiAgICAgICAgICAgIEZpbHRlcj1mJ2VtYWlsID0gXCJ7ZW1haWx9XCInLFxuICAgICAgICAgICAgTGltaXQ9MSxcbiAgICAgICAgKVxuXG4gICAgICAgIGV4aXN0aW5nX3VzZXJzID0gbGlzdF9yZXNwb25zZS5nZXQoJ1VzZXJzJywgW10pXG4gICAgICAgIGlmIG5vdCBleGlzdGluZ191c2VyczpcbiAgICAgICAgICAgIHJldHVybiBldmVudFxuXG4gICAgICAgIGV4aXN0aW5nX3VzZXIgPSBleGlzdGluZ191c2Vyc1swXVxuICAgICAgICBleGlzdGluZ191c2VybmFtZSA9IGV4aXN0aW5nX3VzZXJbJ1VzZXJuYW1lJ11cblxuICAgICAgICB1c2VybmFtZV9wYXJ0cyA9IGV2ZW50Wyd1c2VyTmFtZSddLnNwbGl0KCdfJywgMSlcbiAgICAgICAgaWYgbGVuKHVzZXJuYW1lX3BhcnRzKSAhPSAyOlxuICAgICAgICAgICAgbG9nZ2VyLndhcm5pbmcoZidVbmV4cGVjdGVkIHVzZXJOYW1lIGZvcm1hdDoge2V2ZW50W1widXNlck5hbWVcIl19JylcbiAgICAgICAgICAgIHJldHVybiBldmVudFxuXG4gICAgICAgIHByb3ZpZGVyX25hbWUgPSB1c2VybmFtZV9wYXJ0c1swXVxuICAgICAgICBwcm92aWRlcl91c2VyX2lkID0gdXNlcm5hbWVfcGFydHNbMV1cblxuICAgICAgICBjb2duaXRvX2NsaWVudC5hZG1pbl9saW5rX3Byb3ZpZGVyX2Zvcl91c2VyKFxuICAgICAgICAgICAgVXNlclBvb2xJZD11c2VyX3Bvb2xfaWQsXG4gICAgICAgICAgICBEZXN0aW5hdGlvblVzZXI9e1xuICAgICAgICAgICAgICAgICdQcm92aWRlck5hbWUnOiAnQ29nbml0bycsXG4gICAgICAgICAgICAgICAgJ1Byb3ZpZGVyQXR0cmlidXRlTmFtZSc6ICdjb2duaXRvOnVzZXJuYW1lJyxcbiAgICAgICAgICAgICAgICAnUHJvdmlkZXJBdHRyaWJ1dGVWYWx1ZSc6IGV4aXN0aW5nX3VzZXJuYW1lLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIFNvdXJjZVVzZXI9e1xuICAgICAgICAgICAgICAgICdQcm92aWRlck5hbWUnOiBwcm92aWRlcl9uYW1lLFxuICAgICAgICAgICAgICAgICdQcm92aWRlckF0dHJpYnV0ZU5hbWUnOiAnQ29nbml0b19TdWJqZWN0JyxcbiAgICAgICAgICAgICAgICAnUHJvdmlkZXJBdHRyaWJ1dGVWYWx1ZSc6IHByb3ZpZGVyX3VzZXJfaWQsXG4gICAgICAgICAgICB9LFxuICAgICAgICApXG5cbiAgICAgICAgbG9nZ2VyLmluZm8oZidMaW5rZWQge3Byb3ZpZGVyX25hbWV9IGlkZW50aXR5IHRvIGV4aXN0aW5nIHVzZXIge2V4aXN0aW5nX3VzZXJuYW1lfScpXG4gICAgZXhjZXB0IEV4Y2VwdGlvbiBhcyBlOlxuICAgICAgICBsb2dnZXIuZXJyb3IoZidQcmVTaWduVXAgbGlua2luZyBlcnJvcjoge2V9JylcbiAgICByZXR1cm4gZXZlbnRcbmApLFxuICAgIH0pO1xuXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgICAvLyBDT0dOSVRPIFVTRVIgUE9PTFxuICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbiAgICB0aGlzLnVzZXJQb29sID0gbmV3IGNvZ25pdG8uVXNlclBvb2wodGhpcywgJ1BkZkNvbnZlcnNhdGlvblVzZXJQb29sJywge1xuICAgICAgdXNlclBvb2xOYW1lOiBgJHtwfXBkZi1jb252ZXJzYXRpb24tdXNlcnNgLFxuICAgICAgc2VsZlNpZ25VcEVuYWJsZWQ6IHRydWUsXG4gICAgICBzaWduSW5BbGlhc2VzOiB7XG4gICAgICAgIGVtYWlsOiB0cnVlLFxuICAgICAgICB1c2VybmFtZTogZmFsc2UsXG4gICAgICB9LFxuICAgICAgYXV0b1ZlcmlmeToge1xuICAgICAgICBlbWFpbDogdHJ1ZSxcbiAgICAgIH0sXG4gICAgICBzdGFuZGFyZEF0dHJpYnV0ZXM6IHtcbiAgICAgICAgZW1haWw6IHtcbiAgICAgICAgICByZXF1aXJlZDogdHJ1ZSxcbiAgICAgICAgICBtdXRhYmxlOiB0cnVlLFxuICAgICAgICB9LFxuICAgICAgICBnaXZlbk5hbWU6IHtcbiAgICAgICAgICByZXF1aXJlZDogZmFsc2UsXG4gICAgICAgICAgbXV0YWJsZTogdHJ1ZSxcbiAgICAgICAgfSxcbiAgICAgICAgZmFtaWx5TmFtZToge1xuICAgICAgICAgIHJlcXVpcmVkOiBmYWxzZSxcbiAgICAgICAgICBtdXRhYmxlOiB0cnVlLFxuICAgICAgICB9LFxuICAgICAgICBmdWxsbmFtZToge1xuICAgICAgICAgIHJlcXVpcmVkOiBmYWxzZSxcbiAgICAgICAgICBtdXRhYmxlOiB0cnVlLFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICAgIGN1c3RvbUF0dHJpYnV0ZXM6IHtcbiAgICAgICAgJ29yZ2FuaXphdGlvbic6IG5ldyBjb2duaXRvLlN0cmluZ0F0dHJpYnV0ZSh7IG11dGFibGU6IHRydWUgfSksXG4gICAgICAgICdyb2xlJzogbmV3IGNvZ25pdG8uU3RyaW5nQXR0cmlidXRlKHsgbXV0YWJsZTogdHJ1ZSB9KSxcbiAgICAgIH0sXG4gICAgICBwYXNzd29yZFBvbGljeToge1xuICAgICAgICBtaW5MZW5ndGg6IDgsXG4gICAgICAgIHJlcXVpcmVMb3dlcmNhc2U6IHRydWUsXG4gICAgICAgIHJlcXVpcmVVcHBlcmNhc2U6IHRydWUsXG4gICAgICAgIHJlcXVpcmVEaWdpdHM6IHRydWUsXG4gICAgICAgIHJlcXVpcmVTeW1ib2xzOiBmYWxzZSxcbiAgICAgICAgdGVtcFBhc3N3b3JkVmFsaWRpdHk6IGNkay5EdXJhdGlvbi5kYXlzKDcpLFxuICAgICAgfSxcbiAgICAgIGFjY291bnRSZWNvdmVyeTogY29nbml0by5BY2NvdW50UmVjb3ZlcnkuRU1BSUxfT05MWSxcbiAgICAgIHJlbW92YWxQb2xpY3k6IGNkay5SZW1vdmFsUG9saWN5LlJFVEFJTixcbiAgICAgIC8vIEVtYWlsIHZlcmlmaWNhdGlvblxuICAgICAgdXNlclZlcmlmaWNhdGlvbjoge1xuICAgICAgICBlbWFpbFN1YmplY3Q6ICdWZXJpZnkgeW91ciBQREYgQ29udmVyc2F0aW9uIGFjY291bnQnLFxuICAgICAgICBlbWFpbEJvZHk6ICdUaGFua3MgZm9yIHNpZ25pbmcgdXAhIFlvdXIgdmVyaWZpY2F0aW9uIGNvZGUgaXMgeyMjIyN9JyxcbiAgICAgICAgZW1haWxTdHlsZTogY29nbml0by5WZXJpZmljYXRpb25FbWFpbFN0eWxlLkNPREUsXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgY29uc3QgY2ZuVXNlclBvb2wgPSB0aGlzLnVzZXJQb29sLm5vZGUuZGVmYXVsdENoaWxkIGFzIGNvZ25pdG8uQ2ZuVXNlclBvb2w7XG4gICAgY2ZuVXNlclBvb2wubGFtYmRhQ29uZmlnID0ge1xuICAgICAgcHJlU2lnblVwOiBwcmVTaWduVXBGbi5mdW5jdGlvbkFybixcbiAgICAgIGN1c3RvbU1lc3NhZ2U6IGN1c3RvbU1lc3NhZ2VGbi5mdW5jdGlvbkFybixcbiAgICB9O1xuXG4gICAgcHJlU2lnblVwRm4uYWRkVG9Sb2xlUG9saWN5KG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgJ2NvZ25pdG8taWRwOkFkbWluR2V0VXNlcicsXG4gICAgICAgICdjb2duaXRvLWlkcDpMaXN0VXNlcnMnLFxuICAgICAgICAnY29nbml0by1pZHA6QWRtaW5MaW5rUHJvdmlkZXJGb3JVc2VyJyxcbiAgICAgIF0sXG4gICAgICByZXNvdXJjZXM6IFtgYXJuOmF3czpjb2duaXRvLWlkcDoke3Byb3BzLmVudkNvbmZpZy5yZWdpb259OiR7cHJvcHMuZW52Q29uZmlnLmFjY291bnRJZH06dXNlcnBvb2wvKmBdLFxuICAgIH0pKTtcblxuICAgIGN1c3RvbU1lc3NhZ2VGbi5hZGRQZXJtaXNzaW9uKCdDb2duaXRvSW52b2tlQ3VzdG9tTWVzc2FnZScsIHtcbiAgICAgIHByaW5jaXBhbDogbmV3IGlhbS5TZXJ2aWNlUHJpbmNpcGFsKCdjb2duaXRvLWlkcC5hbWF6b25hd3MuY29tJyksXG4gICAgICBhY3Rpb246ICdsYW1iZGE6SW52b2tlRnVuY3Rpb24nLFxuICAgICAgc291cmNlQWNjb3VudDogdGhpcy5hY2NvdW50LFxuICAgIH0pO1xuXG4gICAgcHJlU2lnblVwRm4uYWRkUGVybWlzc2lvbignQ29nbml0b0ludm9rZVByZVNpZ25VcCcsIHtcbiAgICAgIHByaW5jaXBhbDogbmV3IGlhbS5TZXJ2aWNlUHJpbmNpcGFsKCdjb2duaXRvLWlkcC5hbWF6b25hd3MuY29tJyksXG4gICAgICBhY3Rpb246ICdsYW1iZGE6SW52b2tlRnVuY3Rpb24nLFxuICAgICAgc291cmNlQWNjb3VudDogdGhpcy5hY2NvdW50LFxuICAgIH0pO1xuXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgICAvLyBHT09HTEUgSURFTlRJVFkgUFJPVklERVJcbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG4gICAgY29uc3QgZ29vZ2xlSWRQID0gbmV3IGNvZ25pdG8uVXNlclBvb2xJZGVudGl0eVByb3ZpZGVyR29vZ2xlKHRoaXMsICdHb29nbGVJZGVudGl0eVByb3ZpZGVyJywge1xuICAgICAgdXNlclBvb2w6IHRoaXMudXNlclBvb2wsXG4gICAgICBjbGllbnRJZDogY2RrLlNlY3JldFZhbHVlLnNlY3JldHNNYW5hZ2VyKGAvcGRmY29udi8ke3Byb3BzLmVudkNvbmZpZy5uYW1lfS9nb29nbGUtY2xpZW50LWlkYCkudW5zYWZlVW53cmFwKCksXG4gICAgICBjbGllbnRTZWNyZXQ6IGNkay5TZWNyZXRWYWx1ZS5zZWNyZXRzTWFuYWdlcihgL3BkZmNvbnYvJHtwcm9wcy5lbnZDb25maWcubmFtZX0vZ29vZ2xlLWNsaWVudC1zZWNyZXRgKS51bnNhZmVVbndyYXAoKSxcbiAgICAgIHNjb3BlczogWydlbWFpbCcsICdwcm9maWxlJywgJ29wZW5pZCddLFxuICAgICAgYXR0cmlidXRlTWFwcGluZzoge1xuICAgICAgICBlbWFpbDogY29nbml0by5Qcm92aWRlckF0dHJpYnV0ZS5HT09HTEVfRU1BSUwsXG4gICAgICAgIGdpdmVuTmFtZTogY29nbml0by5Qcm92aWRlckF0dHJpYnV0ZS5HT09HTEVfR0lWRU5fTkFNRSxcbiAgICAgICAgZmFtaWx5TmFtZTogY29nbml0by5Qcm92aWRlckF0dHJpYnV0ZS5HT09HTEVfRkFNSUxZX05BTUUsXG4gICAgICAgIGZ1bGxuYW1lOiBjb2duaXRvLlByb3ZpZGVyQXR0cmlidXRlLkdPT0dMRV9OQU1FLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gICAgLy8gVVNFUiBQT09MIERPTUFJTlxuICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbiAgICBuZXcgY29nbml0by5Vc2VyUG9vbERvbWFpbih0aGlzLCAnVXNlclBvb2xEb21haW4nLCB7XG4gICAgICB1c2VyUG9vbDogdGhpcy51c2VyUG9vbCxcbiAgICAgIGNvZ25pdG9Eb21haW46IHtcbiAgICAgICAgZG9tYWluUHJlZml4LFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gICAgLy8gVVNFUiBQT09MIENMSUVOVFxuICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbiAgICAvLyBVc2VyIFBvb2wgQ2xpZW50IChmb3IgZnJvbnRlbmQgYXBwKVxuICAgIHRoaXMudXNlclBvb2xDbGllbnQgPSB0aGlzLnVzZXJQb29sLmFkZENsaWVudCgnUGRmQ29udmVyc2F0aW9uV2ViQ2xpZW50Jywge1xuICAgICAgdXNlclBvb2xDbGllbnROYW1lOiBgJHtwfXBkZi1jb252ZXJzYXRpb24td2ViLWNsaWVudGAsXG4gICAgICBhdXRoRmxvd3M6IHtcbiAgICAgICAgdXNlclBhc3N3b3JkOiB0cnVlLFxuICAgICAgICB1c2VyU3JwOiB0cnVlLFxuICAgICAgfSxcbiAgICAgIHN1cHBvcnRlZElkZW50aXR5UHJvdmlkZXJzOiBbXG4gICAgICAgIGNvZ25pdG8uVXNlclBvb2xDbGllbnRJZGVudGl0eVByb3ZpZGVyLkNPR05JVE8sXG4gICAgICAgIGNvZ25pdG8uVXNlclBvb2xDbGllbnRJZGVudGl0eVByb3ZpZGVyLkdPT0dMRSxcbiAgICAgIF0sXG4gICAgICBvQXV0aDoge1xuICAgICAgICBmbG93czoge1xuICAgICAgICAgIGF1dGhvcml6YXRpb25Db2RlR3JhbnQ6IHRydWUsXG4gICAgICAgICAgaW1wbGljaXRDb2RlR3JhbnQ6IGZhbHNlLFxuICAgICAgICB9LFxuICAgICAgICBzY29wZXM6IFtcbiAgICAgICAgICBjb2duaXRvLk9BdXRoU2NvcGUuRU1BSUwsXG4gICAgICAgICAgY29nbml0by5PQXV0aFNjb3BlLk9QRU5JRCxcbiAgICAgICAgICBjb2duaXRvLk9BdXRoU2NvcGUuUFJPRklMRSxcbiAgICAgICAgXSxcbiAgICAgICAgY2FsbGJhY2tVcmxzOiBbXG4gICAgICAgICAgJ2h0dHA6Ly9sb2NhbGhvc3Q6MzAwMC9jYWxsYmFjaycsXG4gICAgICAgICAgJ2h0dHA6Ly9sb2NhbGhvc3Q6MzAwMC8nLFxuICAgICAgICAgICdodHRwOi8vbG9jYWxob3N0OjMwMDAvbG9naW4nLFxuICAgICAgICAgIC4uLihwcm9wcy5jbG91ZEZyb250RG9tYWluID8gW1xuICAgICAgICAgICAgYGh0dHBzOi8vJHtwcm9wcy5jbG91ZEZyb250RG9tYWlufS9jYWxsYmFja2AsXG4gICAgICAgICAgICBgaHR0cHM6Ly8ke3Byb3BzLmNsb3VkRnJvbnREb21haW59L2AsXG4gICAgICAgICAgICBgaHR0cHM6Ly8ke3Byb3BzLmNsb3VkRnJvbnREb21haW59L2xvZ2luYCxcbiAgICAgICAgICBdIDogW10pLFxuICAgICAgICAgIC4uLihwcm9wcy5jdXN0b21Eb21haW5OYW1lID8gW1xuICAgICAgICAgICAgYGh0dHBzOi8vJHtwcm9wcy5jdXN0b21Eb21haW5OYW1lfS9jYWxsYmFja2AsXG4gICAgICAgICAgICBgaHR0cHM6Ly8ke3Byb3BzLmN1c3RvbURvbWFpbk5hbWV9L2AsXG4gICAgICAgICAgICBgaHR0cHM6Ly8ke3Byb3BzLmN1c3RvbURvbWFpbk5hbWV9L2xvZ2luYCxcbiAgICAgICAgICBdIDogW10pLFxuICAgICAgICBdLFxuICAgICAgICBsb2dvdXRVcmxzOiBbXG4gICAgICAgICAgJ2h0dHA6Ly9sb2NhbGhvc3Q6MzAwMC8nLFxuICAgICAgICAgIC4uLihwcm9wcy5jbG91ZEZyb250RG9tYWluID8gW1xuICAgICAgICAgICAgYGh0dHBzOi8vJHtwcm9wcy5jbG91ZEZyb250RG9tYWlufS9gLFxuICAgICAgICAgIF0gOiBbXSksXG4gICAgICAgICAgLi4uKHByb3BzLmN1c3RvbURvbWFpbk5hbWUgPyBbXG4gICAgICAgICAgICBgaHR0cHM6Ly8ke3Byb3BzLmN1c3RvbURvbWFpbk5hbWV9L2AsXG4gICAgICAgICAgXSA6IFtdKSxcbiAgICAgICAgXSxcbiAgICAgIH0sXG4gICAgICBwcmV2ZW50VXNlckV4aXN0ZW5jZUVycm9yczogdHJ1ZSxcbiAgICAgIGFjY2Vzc1Rva2VuVmFsaWRpdHk6IGNkay5EdXJhdGlvbi5ob3VycygxKSxcbiAgICAgIGlkVG9rZW5WYWxpZGl0eTogY2RrLkR1cmF0aW9uLmhvdXJzKDEpLFxuICAgICAgcmVmcmVzaFRva2VuVmFsaWRpdHk6IGNkay5EdXJhdGlvbi5kYXlzKDMwKSxcbiAgICAgIHJlYWRBdHRyaWJ1dGVzOiBuZXcgY29nbml0by5DbGllbnRBdHRyaWJ1dGVzKClcbiAgICAgICAgLndpdGhTdGFuZGFyZEF0dHJpYnV0ZXMoeyBlbWFpbDogdHJ1ZSwgZ2l2ZW5OYW1lOiB0cnVlLCBmYW1pbHlOYW1lOiB0cnVlLCBmdWxsbmFtZTogdHJ1ZSB9KVxuICAgICAgICAud2l0aEN1c3RvbUF0dHJpYnV0ZXMoJ29yZ2FuaXphdGlvbicsICdyb2xlJyksXG4gICAgfSk7XG5cbiAgICB0aGlzLnVzZXJQb29sQ2xpZW50Lm5vZGUuYWRkRGVwZW5kZW5jeShnb29nbGVJZFApO1xuXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgICAvLyBDT0dOSVRPIElERU5USVRZIFBPT0wgKGZvciBTMyBkaXJlY3QgdXBsb2FkKVxuICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbiAgICB0aGlzLmlkZW50aXR5UG9vbCA9IG5ldyBjb2duaXRvLkNmbklkZW50aXR5UG9vbCh0aGlzLCAnUGRmQ29udmVyc2F0aW9uSWRlbnRpdHlQb29sJywge1xuICAgICAgaWRlbnRpdHlQb29sTmFtZTogYCR7cC5yZXBsYWNlKC8tL2csICdfJyl9cGRmX2NvbnZlcnNhdGlvbl9pZGVudGl0eV9wb29sYCxcbiAgICAgIGFsbG93VW5hdXRoZW50aWNhdGVkSWRlbnRpdGllczogZmFsc2UsXG4gICAgICBjb2duaXRvSWRlbnRpdHlQcm92aWRlcnM6IFtcbiAgICAgICAge1xuICAgICAgICAgIGNsaWVudElkOiB0aGlzLnVzZXJQb29sQ2xpZW50LnVzZXJQb29sQ2xpZW50SWQsXG4gICAgICAgICAgcHJvdmlkZXJOYW1lOiB0aGlzLnVzZXJQb29sLnVzZXJQb29sUHJvdmlkZXJOYW1lLFxuICAgICAgICB9LFxuICAgICAgXSxcbiAgICB9KTtcblxuICAgIC8vIElBTSBSb2xlIGZvciBhdXRoZW50aWNhdGVkIHVzZXJzXG4gICAgY29uc3QgYXV0aGVudGljYXRlZFJvbGUgPSBuZXcgaWFtLlJvbGUodGhpcywgJ0NvZ25pdG9BdXRoZW50aWNhdGVkUm9sZScsIHtcbiAgICAgIHJvbGVOYW1lOiBgJHtwfVBkZkNvbnZlcnNhdGlvbi1Db2duaXRvQXV0aFJvbGVgLFxuICAgICAgYXNzdW1lZEJ5OiBuZXcgaWFtLkZlZGVyYXRlZFByaW5jaXBhbChcbiAgICAgICAgJ2NvZ25pdG8taWRlbnRpdHkuYW1hem9uYXdzLmNvbScsXG4gICAgICAgIHtcbiAgICAgICAgICBTdHJpbmdFcXVhbHM6IHtcbiAgICAgICAgICAgICdjb2duaXRvLWlkZW50aXR5LmFtYXpvbmF3cy5jb206YXVkJzogdGhpcy5pZGVudGl0eVBvb2wucmVmLFxuICAgICAgICAgIH0sXG4gICAgICAgICAgJ0ZvckFueVZhbHVlOlN0cmluZ0xpa2UnOiB7XG4gICAgICAgICAgICAnY29nbml0by1pZGVudGl0eS5hbWF6b25hd3MuY29tOmFtcic6ICdhdXRoZW50aWNhdGVkJyxcbiAgICAgICAgICB9LFxuICAgICAgICB9LFxuICAgICAgICAnc3RzOkFzc3VtZVJvbGVXaXRoV2ViSWRlbnRpdHknXG4gICAgICApLFxuICAgIH0pO1xuXG4gICAgLy8gQWxsb3cgYXV0aGVudGljYXRlZCB1c2VycyB0byB1cGxvYWQgdG8gdGhlaXIgb3duIGZvbGRlciBpbiBTM1xuICAgIGF1dGhlbnRpY2F0ZWRSb2xlLmFkZFRvUG9saWN5KG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgJ3MzOlB1dE9iamVjdCcsXG4gICAgICAgICdzMzpHZXRPYmplY3QnLFxuICAgICAgICAnczM6RGVsZXRlT2JqZWN0JyxcbiAgICAgIF0sXG4gICAgICByZXNvdXJjZXM6IFtcbiAgICAgICAgYCR7cHJvcHMucHJvY2Vzc2luZ0J1Y2tldC5idWNrZXRBcm59L3VzZXJzL1xcJHtjb2duaXRvLWlkZW50aXR5LmFtYXpvbmF3cy5jb206c3VifS8qYCxcbiAgICAgIF0sXG4gICAgfSkpO1xuXG4gICAgLy8gQWxsb3cgYXV0aGVudGljYXRlZCB1c2VycyB0byBsaXN0IHRoZWlyIG93biBmb2xkZXJcbiAgICBhdXRoZW50aWNhdGVkUm9sZS5hZGRUb1BvbGljeShuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICBhY3Rpb25zOiBbXG4gICAgICAgICdzMzpMaXN0QnVja2V0JyxcbiAgICAgIF0sXG4gICAgICByZXNvdXJjZXM6IFtwcm9wcy5wcm9jZXNzaW5nQnVja2V0LmJ1Y2tldEFybl0sXG4gICAgICBjb25kaXRpb25zOiB7XG4gICAgICAgIFN0cmluZ0xpa2U6IHtcbiAgICAgICAgICAnczM6cHJlZml4JzogWyd1c2Vycy8ke2NvZ25pdG8taWRlbnRpdHkuYW1hem9uYXdzLmNvbTpzdWJ9LyonXSxcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgfSkpO1xuXG4gICAgLy8gQXR0YWNoIHJvbGUgdG8gaWRlbnRpdHkgcG9vbFxuICAgIG5ldyBjb2duaXRvLkNmbklkZW50aXR5UG9vbFJvbGVBdHRhY2htZW50KHRoaXMsICdJZGVudGl0eVBvb2xSb2xlQXR0YWNobWVudCcsIHtcbiAgICAgIGlkZW50aXR5UG9vbElkOiB0aGlzLmlkZW50aXR5UG9vbC5yZWYsXG4gICAgICByb2xlczoge1xuICAgICAgICBhdXRoZW50aWNhdGVkOiBhdXRoZW50aWNhdGVkUm9sZS5yb2xlQXJuLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gICAgLy8gQVBJIEdBVEVXQVlcbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG4gICAgdGhpcy5hcGkgPSBuZXcgYXBpZ2F0ZXdheS5SZXN0QXBpKHRoaXMsICdQZGZDb252ZXJzYXRpb25BcGknLCB7XG4gICAgICByZXN0QXBpTmFtZTogJ1BERiBDb252ZXJzYXRpb24gQVBJJyxcbiAgICAgIGRlc2NyaXB0aW9uOiAnQVBJIGZvciBQREYgQ29udmVyc2F0aW9uIFN5c3RlbScsXG4gICAgICBkZXBsb3lPcHRpb25zOiB7XG4gICAgICAgIHN0YWdlTmFtZTogJ3YxJyxcbiAgICAgICAgdGhyb3R0bGluZ0J1cnN0TGltaXQ6IDEwMCxcbiAgICAgICAgdGhyb3R0bGluZ1JhdGVMaW1pdDogNTAsXG4gICAgICB9LFxuICAgICAgZGVmYXVsdENvcnNQcmVmbGlnaHRPcHRpb25zOiB7XG4gICAgICAgIGFsbG93T3JpZ2luczogW1xuICAgICAgICAgICdodHRwOi8vbG9jYWxob3N0OjMwMDAnLFxuICAgICAgICAgIC4uLihwcm9wcy5jbG91ZEZyb250RG9tYWluID8gW2BodHRwczovLyR7cHJvcHMuY2xvdWRGcm9udERvbWFpbn1gXSA6IFtdKSxcbiAgICAgICAgICAuLi4ocHJvcHMuY3VzdG9tRG9tYWluTmFtZSA/IFtgaHR0cHM6Ly8ke3Byb3BzLmN1c3RvbURvbWFpbk5hbWV9YF0gOiBbXSksXG4gICAgICAgIF0sXG4gICAgICAgIGFsbG93TWV0aG9kczogYXBpZ2F0ZXdheS5Db3JzLkFMTF9NRVRIT0RTLFxuICAgICAgICBhbGxvd0hlYWRlcnM6IFtcbiAgICAgICAgICAnQ29udGVudC1UeXBlJyxcbiAgICAgICAgICAnWC1BbXotRGF0ZScsXG4gICAgICAgICAgJ0F1dGhvcml6YXRpb24nLFxuICAgICAgICAgICdYLUFwaS1LZXknLFxuICAgICAgICAgICdYLUFtei1TZWN1cml0eS1Ub2tlbicsXG4gICAgICAgIF0sXG4gICAgICAgIGFsbG93Q3JlZGVudGlhbHM6IHRydWUsXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgLy8gQ29nbml0byBBdXRob3JpemVyXG4gICAgY29uc3QgYXV0aG9yaXplciA9IG5ldyBhcGlnYXRld2F5LkNvZ25pdG9Vc2VyUG9vbHNBdXRob3JpemVyKHRoaXMsICdDb2duaXRvQXV0aG9yaXplcicsIHtcbiAgICAgIGNvZ25pdG9Vc2VyUG9vbHM6IFt0aGlzLnVzZXJQb29sXSxcbiAgICAgIGF1dGhvcml6ZXJOYW1lOiAnQ29nbml0b0F1dGhvcml6ZXInLFxuICAgICAgaWRlbnRpdHlTb3VyY2U6ICdtZXRob2QucmVxdWVzdC5oZWFkZXIuQXV0aG9yaXphdGlvbicsXG4gICAgfSk7XG5cbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAgIC8vIEFQSSBFTkRQT0lOVFNcbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG4gICAgLy8gUXVlcnkgZW5kcG9pbnQgLSBQT1NUIC9xdWVyeVxuICAgIGNvbnN0IHF1ZXJ5UmVzb3VyY2UgPSB0aGlzLmFwaS5yb290LmFkZFJlc291cmNlKCdxdWVyeScpO1xuICAgIHF1ZXJ5UmVzb3VyY2UuYWRkTWV0aG9kKCdQT1NUJywgbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24ocHJvcHMucXVlcnlQcm9jZXNzaW5nRnVuY3Rpb24pLCB7XG4gICAgICBhdXRob3JpemVyLFxuICAgICAgYXV0aG9yaXphdGlvblR5cGU6IGFwaWdhdGV3YXkuQXV0aG9yaXphdGlvblR5cGUuQ09HTklUTyxcbiAgICB9KTtcblxuICAgIC8vIERvY3VtZW50cyBlbmRwb2ludCAtIEdFVCAvZG9jdW1lbnRzIChsaXN0IHVzZXIncyBkb2N1bWVudHMpXG4gICAgY29uc3QgZG9jdW1lbnRzUmVzb3VyY2UgPSB0aGlzLmFwaS5yb290LmFkZFJlc291cmNlKCdkb2N1bWVudHMnKTtcblxuICAgIC8vIExhbWJkYSBmb3IgbGlzdGluZyBkb2N1bWVudHNcbiAgICBjb25zdCBsaXN0RG9jdW1lbnRzRnVuY3Rpb24gPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsICdMaXN0RG9jdW1lbnRzRnVuY3Rpb24nLCB7XG4gICAgICBmdW5jdGlvbk5hbWU6IGAke3B9TGlzdERvY3VtZW50c2AsXG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5QWVRIT05fM185LFxuICAgICAgaGFuZGxlcjogJ2luZGV4LmxhbWJkYV9oYW5kbGVyJyxcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21JbmxpbmUoYFxuaW1wb3J0IGpzb25cbmltcG9ydCBib3RvM1xuaW1wb3J0IG9zXG5mcm9tIGJvdG8zLmR5bmFtb2RiLmNvbmRpdGlvbnMgaW1wb3J0IEtleVxuXG5keW5hbW9kYiA9IGJvdG8zLnJlc291cmNlKCdkeW5hbW9kYicpXG50YWJsZSA9IGR5bmFtb2RiLlRhYmxlKG9zLmVudmlyb25bJ01FVEFEQVRBX1RBQkxFJ10pXG5cbkFMTE9XRURfT1JJR0lOUyA9IG9zLmVudmlyb24uZ2V0KCdBTExPV0VEX09SSUdJTlMnLCAnaHR0cDovL2xvY2FsaG9zdDozMDAwJykuc3BsaXQoJywnKVxuXG5kZWYgZ2V0X2NvcnNfb3JpZ2luKGV2ZW50KTpcbiAgICBvcmlnaW4gPSAoZXZlbnQuZ2V0KCdoZWFkZXJzJykgb3Ige30pLmdldCgnb3JpZ2luJykgb3IgKGV2ZW50LmdldCgnaGVhZGVycycpIG9yIHt9KS5nZXQoJ09yaWdpbicsICcnKVxuICAgIHJldHVybiBvcmlnaW4gaWYgb3JpZ2luIGluIEFMTE9XRURfT1JJR0lOUyBlbHNlIEFMTE9XRURfT1JJR0lOU1swXVxuXG5kZWYgY29yc19oZWFkZXJzKGV2ZW50KTpcbiAgICByZXR1cm4ge1xuICAgICAgICAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nLFxuICAgICAgICAnQWNjZXNzLUNvbnRyb2wtQWxsb3ctT3JpZ2luJzogZ2V0X2NvcnNfb3JpZ2luKGV2ZW50KSxcbiAgICAgICAgJ0FjY2Vzcy1Db250cm9sLUFsbG93LUNyZWRlbnRpYWxzJzogJ3RydWUnXG4gICAgfVxuXG5kZWYgbGFtYmRhX2hhbmRsZXIoZXZlbnQsIGNvbnRleHQpOlxuICAgIHByaW50KGZcIkV2ZW50OiB7anNvbi5kdW1wcyhldmVudCl9XCIpXG5cbiAgICAjIEdldCB1c2VyX2lkIGZyb20gQ29nbml0byBjbGFpbXNcbiAgICBjbGFpbXMgPSBldmVudC5nZXQoJ3JlcXVlc3RDb250ZXh0Jywge30pLmdldCgnYXV0aG9yaXplcicsIHt9KS5nZXQoJ2NsYWltcycsIHt9KVxuICAgIHVzZXJfaWQgPSBjbGFpbXMuZ2V0KCdzdWInLCAnJylcblxuICAgIGlmIG5vdCB1c2VyX2lkOlxuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgJ3N0YXR1c0NvZGUnOiA0MDEsXG4gICAgICAgICAgICAnaGVhZGVycyc6IGNvcnNfaGVhZGVycyhldmVudCksXG4gICAgICAgICAgICAnYm9keSc6IGpzb24uZHVtcHMoeydlcnJvcic6ICdVbmF1dGhvcml6ZWQnfSlcbiAgICAgICAgfVxuXG4gICAgZGVmIF9leHRyYWN0X3RpdGxlKGl0ZW0pOlxuICAgICAgICB0cnk6XG4gICAgICAgICAgICBncyA9IGl0ZW0uZ2V0KCdnZW5lcmF0ZWRfc3VtbWFyeScpXG4gICAgICAgICAgICBpZiBub3QgZ3M6XG4gICAgICAgICAgICAgICAgcmV0dXJuIE5vbmVcbiAgICAgICAgICAgIGlmIGlzaW5zdGFuY2UoZ3MsIHN0cik6XG4gICAgICAgICAgICAgICAgZ3MgPSBqc29uLmxvYWRzKGdzKVxuICAgICAgICAgICAgcmV0dXJuIGdzLmdldCgndGl0bGUnKVxuICAgICAgICBleGNlcHQgRXhjZXB0aW9uOlxuICAgICAgICAgICAgcmV0dXJuIE5vbmVcblxuICAgIHRyeTpcbiAgICAgICAgcmVzcG9uc2UgPSB0YWJsZS5zY2FuKFxuICAgICAgICAgICAgRmlsdGVyRXhwcmVzc2lvbj1LZXkoJ3VzZXJfaWQnKS5lcSh1c2VyX2lkKSxcbiAgICAgICAgICAgIFByb2plY3Rpb25FeHByZXNzaW9uPSdkb2N1bWVudF9pZCwgb3JpZ2luYWxfZmlsZW5hbWUsICNzLCBjcmVhdGVkX2F0LCB2ZWN0b3JfY291bnQsIGdlbmVyYXRlZF9zdW1tYXJ5JyxcbiAgICAgICAgICAgIEV4cHJlc3Npb25BdHRyaWJ1dGVOYW1lcz17JyNzJzogJ3N0YXR1cyd9XG4gICAgICAgIClcblxuICAgICAgICBkb2N1bWVudHMgPSBbe1xuICAgICAgICAgICAgJ2RvY3VtZW50X2lkJzogaXRlbVsnZG9jdW1lbnRfaWQnXSxcbiAgICAgICAgICAgICdmaWxlbmFtZSc6IGl0ZW0uZ2V0KCdvcmlnaW5hbF9maWxlbmFtZScsICdVbmtub3duJyksXG4gICAgICAgICAgICAnc3RhdHVzJzogaXRlbS5nZXQoJ3N0YXR1cycsICd1bmtub3duJyksXG4gICAgICAgICAgICAnY3JlYXRlZF9hdCc6IGl0ZW0uZ2V0KCdjcmVhdGVkX2F0JywgJycpLFxuICAgICAgICAgICAgJ3ZlY3Rvcl9jb3VudCc6IGludChpdGVtLmdldCgndmVjdG9yX2NvdW50JywgMCkpIGlmIGl0ZW0uZ2V0KCd2ZWN0b3JfY291bnQnKSBlbHNlIDAsXG4gICAgICAgICAgICAndGl0bGUnOiBfZXh0cmFjdF90aXRsZShpdGVtKVxuICAgICAgICB9IGZvciBpdGVtIGluIHJlc3BvbnNlLmdldCgnSXRlbXMnLCBbXSldXG5cbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICdzdGF0dXNDb2RlJzogMjAwLFxuICAgICAgICAgICAgJ2hlYWRlcnMnOiBjb3JzX2hlYWRlcnMoZXZlbnQpLFxuICAgICAgICAgICAgJ2JvZHknOiBqc29uLmR1bXBzKHtcbiAgICAgICAgICAgICAgICAnZG9jdW1lbnRzJzogZG9jdW1lbnRzLFxuICAgICAgICAgICAgICAgICdjb3VudCc6IGxlbihkb2N1bWVudHMpXG4gICAgICAgICAgICB9KVxuICAgICAgICB9XG4gICAgZXhjZXB0IEV4Y2VwdGlvbiBhcyBlOlxuICAgICAgICBwcmludChmXCJFcnJvcjoge3N0cihlKX1cIilcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICdzdGF0dXNDb2RlJzogNTAwLFxuICAgICAgICAgICAgJ2hlYWRlcnMnOiBjb3JzX2hlYWRlcnMoZXZlbnQpLFxuICAgICAgICAgICAgJ2JvZHknOiBqc29uLmR1bXBzKHsnZXJyb3InOiBzdHIoZSl9KVxuICAgICAgICB9XG5gKSxcbiAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgIE1FVEFEQVRBX1RBQkxFOiBwcm9wcy5tZXRhZGF0YVRhYmxlTmFtZSxcbiAgICAgICAgQUxMT1dFRF9PUklHSU5TOiBhbGxvd2VkT3JpZ2lucyxcbiAgICAgIH0sXG4gICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24uc2Vjb25kcygzMCksXG4gICAgfSk7XG5cbiAgICAvLyBHcmFudCBEeW5hbW9EQiByZWFkIGFjY2Vzc1xuICAgIGxpc3REb2N1bWVudHNGdW5jdGlvbi5hZGRUb1JvbGVQb2xpY3kobmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgYWN0aW9uczogW1xuICAgICAgICAnZHluYW1vZGI6U2NhbicsXG4gICAgICAgICdkeW5hbW9kYjpRdWVyeScsXG4gICAgICBdLFxuICAgICAgcmVzb3VyY2VzOiBbYGFybjphd3M6ZHluYW1vZGI6JHt0aGlzLnJlZ2lvbn06JHt0aGlzLmFjY291bnR9OnRhYmxlLyR7cHJvcHMubWV0YWRhdGFUYWJsZU5hbWV9YF0sXG4gICAgfSkpO1xuXG4gICAgZG9jdW1lbnRzUmVzb3VyY2UuYWRkTWV0aG9kKCdHRVQnLCBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbihsaXN0RG9jdW1lbnRzRnVuY3Rpb24pLCB7XG4gICAgICBhdXRob3JpemVyLFxuICAgICAgYXV0aG9yaXphdGlvblR5cGU6IGFwaWdhdGV3YXkuQXV0aG9yaXphdGlvblR5cGUuQ09HTklUTyxcbiAgICB9KTtcblxuICAgIC8vIFVwbG9hZCBwcmVzaWduZWQgVVJMIGVuZHBvaW50IC0gUE9TVCAvdXBsb2FkL3ByZXNpZ25lZFxuICAgIGNvbnN0IHVwbG9hZFJlc291cmNlID0gdGhpcy5hcGkucm9vdC5hZGRSZXNvdXJjZSgndXBsb2FkJyk7XG4gICAgY29uc3QgcHJlc2lnbmVkUmVzb3VyY2UgPSB1cGxvYWRSZXNvdXJjZS5hZGRSZXNvdXJjZSgncHJlc2lnbmVkJyk7XG5cbiAgICBjb25zdCBwcmVzaWduZWRVcmxGdW5jdGlvbiA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgJ1ByZXNpZ25lZFVybEZ1bmN0aW9uJywge1xuICAgICAgZnVuY3Rpb25OYW1lOiBgJHtwfUdlbmVyYXRlUHJlc2lnbmVkVXJsYCxcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLlBZVEhPTl8zXzksXG4gICAgICBoYW5kbGVyOiAnaW5kZXgubGFtYmRhX2hhbmRsZXInLFxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUlubGluZShgXG5pbXBvcnQganNvblxuaW1wb3J0IGJvdG8zXG5pbXBvcnQgb3NcbmltcG9ydCByZVxuaW1wb3J0IHV1aWRcbmZyb20gZGF0ZXRpbWUgaW1wb3J0IGRhdGV0aW1lXG5cbnMzX2NsaWVudCA9IGJvdG8zLmNsaWVudCgnczMnKVxuZHluYW1vZGIgPSBib3RvMy5yZXNvdXJjZSgnZHluYW1vZGInKVxuQlVDS0VUX05BTUUgPSBvcy5lbnZpcm9uWydCVUNLRVRfTkFNRSddXG5NRVRBREFUQV9UQUJMRSA9IG9zLmVudmlyb25bJ01FVEFEQVRBX1RBQkxFJ11cblxuQUxMT1dFRF9PUklHSU5TID0gb3MuZW52aXJvbi5nZXQoJ0FMTE9XRURfT1JJR0lOUycsICdodHRwOi8vbG9jYWxob3N0OjMwMDAnKS5zcGxpdCgnLCcpXG5cbmRlZiBnZXRfY29yc19vcmlnaW4oZXZlbnQpOlxuICAgIG9yaWdpbiA9IChldmVudC5nZXQoJ2hlYWRlcnMnKSBvciB7fSkuZ2V0KCdvcmlnaW4nKSBvciAoZXZlbnQuZ2V0KCdoZWFkZXJzJykgb3Ige30pLmdldCgnT3JpZ2luJywgJycpXG4gICAgcmV0dXJuIG9yaWdpbiBpZiBvcmlnaW4gaW4gQUxMT1dFRF9PUklHSU5TIGVsc2UgQUxMT1dFRF9PUklHSU5TWzBdXG5cbmRlZiBjb3JzX2hlYWRlcnMoZXZlbnQpOlxuICAgIHJldHVybiB7XG4gICAgICAgICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicsXG4gICAgICAgICdBY2Nlc3MtQ29udHJvbC1BbGxvdy1PcmlnaW4nOiBnZXRfY29yc19vcmlnaW4oZXZlbnQpLFxuICAgICAgICAnQWNjZXNzLUNvbnRyb2wtQWxsb3ctQ3JlZGVudGlhbHMnOiAndHJ1ZSdcbiAgICB9XG5cbmRlZiBsYW1iZGFfaGFuZGxlcihldmVudCwgY29udGV4dCk6XG4gICAgcHJpbnQoZlwiRXZlbnQ6IHtqc29uLmR1bXBzKGV2ZW50KX1cIilcblxuICAgIGNsYWltcyA9IGV2ZW50LmdldCgncmVxdWVzdENvbnRleHQnLCB7fSkuZ2V0KCdhdXRob3JpemVyJywge30pLmdldCgnY2xhaW1zJywge30pXG4gICAgdXNlcl9pZCA9IGNsYWltcy5nZXQoJ3N1YicsICcnKVxuXG4gICAgaWYgbm90IHVzZXJfaWQ6XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAnc3RhdHVzQ29kZSc6IDQwMSxcbiAgICAgICAgICAgICdoZWFkZXJzJzogY29yc19oZWFkZXJzKGV2ZW50KSxcbiAgICAgICAgICAgICdib2R5JzoganNvbi5kdW1wcyh7J2Vycm9yJzogJ1VuYXV0aG9yaXplZCd9KVxuICAgICAgICB9XG5cbiAgICB0cnk6XG4gICAgICAgIGJvZHkgPSBqc29uLmxvYWRzKGV2ZW50LmdldCgnYm9keScsICd7fScpKVxuICAgICAgICBvcmlnaW5hbF9maWxlbmFtZSA9IGJvZHkuZ2V0KCdmaWxlbmFtZScsICdkb2N1bWVudC5wZGYnKVxuICAgICAgICBvcmlnaW5hbF9maWxlbmFtZSA9IHJlLnN1YihyJ1svXFxcXFxcXFw8PjpcInw/KlxcXFx4MDAtXFxcXHgxZl0nLCAnXycsIG9yaWdpbmFsX2ZpbGVuYW1lKVxuICAgICAgICBpZiBsZW4ob3JpZ2luYWxfZmlsZW5hbWUpID4gMjU1OlxuICAgICAgICAgICAgb3JpZ2luYWxfZmlsZW5hbWUgPSBvcmlnaW5hbF9maWxlbmFtZVs6MjU1XVxuICAgICAgICBjb250ZW50X3R5cGUgPSBib2R5LmdldCgnY29udGVudF90eXBlJywgJ2FwcGxpY2F0aW9uL3BkZicpXG5cbiAgICAgICAgZG9jdW1lbnRfaWQgPSBzdHIodXVpZC51dWlkNCgpKVxuICAgICAgICBzM19rZXkgPSBmXCJ1c2Vycy97dXNlcl9pZH0ve2RvY3VtZW50X2lkfS5wZGZcIlxuXG4gICAgICAgIHRhYmxlID0gZHluYW1vZGIuVGFibGUoTUVUQURBVEFfVEFCTEUpXG4gICAgICAgIHRhYmxlLnB1dF9pdGVtKEl0ZW09e1xuICAgICAgICAgICAgJ2RvY3VtZW50X2lkJzogZG9jdW1lbnRfaWQsXG4gICAgICAgICAgICAndXNlcl9pZCc6IHVzZXJfaWQsXG4gICAgICAgICAgICAnb3JpZ2luYWxfZmlsZW5hbWUnOiBvcmlnaW5hbF9maWxlbmFtZSxcbiAgICAgICAgICAgICdvcmlnaW5hbF9zM19sb2NhdGlvbic6IHsnYnVja2V0JzogQlVDS0VUX05BTUUsICdrZXknOiBzM19rZXl9LFxuICAgICAgICAgICAgJ3N0YXR1cyc6ICd1cGxvYWRpbmcnLFxuICAgICAgICAgICAgJ2NyZWF0ZWRfYXQnOiBkYXRldGltZS51dGNub3coKS5pc29mb3JtYXQoKSxcbiAgICAgICAgICAgICdwcm9jZXNzaW5nX21ldGFkYXRhJzoge31cbiAgICAgICAgfSlcblxuICAgICAgICBwcmVzaWduZWRfdXJsID0gczNfY2xpZW50LmdlbmVyYXRlX3ByZXNpZ25lZF91cmwoXG4gICAgICAgICAgICAncHV0X29iamVjdCcsXG4gICAgICAgICAgICBQYXJhbXM9e1xuICAgICAgICAgICAgICAgICdCdWNrZXQnOiBCVUNLRVRfTkFNRSxcbiAgICAgICAgICAgICAgICAnS2V5JzogczNfa2V5LFxuICAgICAgICAgICAgICAgICdDb250ZW50VHlwZSc6IGNvbnRlbnRfdHlwZSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBFeHBpcmVzSW49MzYwMFxuICAgICAgICApXG5cbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICdzdGF0dXNDb2RlJzogMjAwLFxuICAgICAgICAgICAgJ2hlYWRlcnMnOiBjb3JzX2hlYWRlcnMoZXZlbnQpLFxuICAgICAgICAgICAgJ2JvZHknOiBqc29uLmR1bXBzKHtcbiAgICAgICAgICAgICAgICAncHJlc2lnbmVkX3VybCc6IHByZXNpZ25lZF91cmwsXG4gICAgICAgICAgICAgICAgJ2RvY3VtZW50X2lkJzogZG9jdW1lbnRfaWQsXG4gICAgICAgICAgICAgICAgJ2V4cGlyZXNfaW4nOiAzNjAwXG4gICAgICAgICAgICB9KVxuICAgICAgICB9XG4gICAgZXhjZXB0IEV4Y2VwdGlvbiBhcyBlOlxuICAgICAgICBwcmludChmXCJFcnJvcjoge3N0cihlKX1cIilcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICdzdGF0dXNDb2RlJzogNTAwLFxuICAgICAgICAgICAgJ2hlYWRlcnMnOiBjb3JzX2hlYWRlcnMoZXZlbnQpLFxuICAgICAgICAgICAgJ2JvZHknOiBqc29uLmR1bXBzKHsnZXJyb3InOiAnRmFpbGVkIHRvIGdlbmVyYXRlIHVwbG9hZCBVUkwnfSlcbiAgICAgICAgfVxuYCksXG4gICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICBCVUNLRVRfTkFNRTogcHJvcHMucHJvY2Vzc2luZ0J1Y2tldC5idWNrZXROYW1lLFxuICAgICAgICBNRVRBREFUQV9UQUJMRTogcHJvcHMubWV0YWRhdGFUYWJsZU5hbWUsXG4gICAgICAgIEFMTE9XRURfT1JJR0lOUzogYWxsb3dlZE9yaWdpbnMsXG4gICAgICB9LFxuICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLnNlY29uZHMoMzApLFxuICAgIH0pO1xuXG4gICAgLy8gR3JhbnQgUzMgcGVybWlzc2lvbnMgZm9yIHByZXNpZ25lZCBVUkxzXG4gICAgcHJlc2lnbmVkVXJsRnVuY3Rpb24uYWRkVG9Sb2xlUG9saWN5KG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgIGFjdGlvbnM6IFsnczM6UHV0T2JqZWN0J10sXG4gICAgICByZXNvdXJjZXM6IFtgJHtwcm9wcy5wcm9jZXNzaW5nQnVja2V0LmJ1Y2tldEFybn0vKmBdLFxuICAgIH0pKTtcblxuICAgIHByZXNpZ25lZFVybEZ1bmN0aW9uLmFkZFRvUm9sZVBvbGljeShuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICBhY3Rpb25zOiBbJ2R5bmFtb2RiOlB1dEl0ZW0nXSxcbiAgICAgIHJlc291cmNlczogW2Bhcm46YXdzOmR5bmFtb2RiOiR7dGhpcy5yZWdpb259OiR7dGhpcy5hY2NvdW50fTp0YWJsZS8ke3Byb3BzLm1ldGFkYXRhVGFibGVOYW1lfWBdLFxuICAgIH0pKTtcblxuICAgIHByZXNpZ25lZFJlc291cmNlLmFkZE1ldGhvZCgnUE9TVCcsIG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKHByZXNpZ25lZFVybEZ1bmN0aW9uKSwge1xuICAgICAgYXV0aG9yaXplcixcbiAgICAgIGF1dGhvcml6YXRpb25UeXBlOiBhcGlnYXRld2F5LkF1dGhvcml6YXRpb25UeXBlLkNPR05JVE8sXG4gICAgfSk7XG5cbiAgICBjb25zdCBnZXREb2N1bWVudFN1bW1hcnlGdW5jdGlvbiA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgJ0dldERvY3VtZW50U3VtbWFyeUZ1bmN0aW9uJywge1xuICAgICAgZnVuY3Rpb25OYW1lOiBgJHtwfUdldERvY3VtZW50U3VtbWFyeWAsXG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5QWVRIT05fM185LFxuICAgICAgaGFuZGxlcjogJ2luZGV4LmxhbWJkYV9oYW5kbGVyJyxcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21JbmxpbmUoYFxuaW1wb3J0IGpzb25cbmltcG9ydCBib3RvM1xuaW1wb3J0IG9zXG5mcm9tIGRlY2ltYWwgaW1wb3J0IERlY2ltYWxcblxuZHluYW1vZGIgPSBib3RvMy5yZXNvdXJjZSgnZHluYW1vZGInKVxudGFibGUgPSBkeW5hbW9kYi5UYWJsZShvcy5lbnZpcm9uWydNRVRBREFUQV9UQUJMRSddKVxuXG5BTExPV0VEX09SSUdJTlMgPSBvcy5lbnZpcm9uLmdldCgnQUxMT1dFRF9PUklHSU5TJywgJ2h0dHA6Ly9sb2NhbGhvc3Q6MzAwMCcpLnNwbGl0KCcsJylcblxuZGVmIGdldF9jb3JzX29yaWdpbihldmVudCk6XG4gICAgb3JpZ2luID0gKGV2ZW50LmdldCgnaGVhZGVycycpIG9yIHt9KS5nZXQoJ29yaWdpbicpIG9yIChldmVudC5nZXQoJ2hlYWRlcnMnKSBvciB7fSkuZ2V0KCdPcmlnaW4nLCAnJylcbiAgICByZXR1cm4gb3JpZ2luIGlmIG9yaWdpbiBpbiBBTExPV0VEX09SSUdJTlMgZWxzZSBBTExPV0VEX09SSUdJTlNbMF1cblxuZGVmIGNvcnNfaGVhZGVycyhldmVudCk6XG4gICAgcmV0dXJuIHtcbiAgICAgICAgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyxcbiAgICAgICAgJ0FjY2Vzcy1Db250cm9sLUFsbG93LU9yaWdpbic6IGdldF9jb3JzX29yaWdpbihldmVudCksXG4gICAgICAgICdBY2Nlc3MtQ29udHJvbC1BbGxvdy1DcmVkZW50aWFscyc6ICd0cnVlJ1xuICAgIH1cblxuZGVmIGRlY2ltYWxfZGVmYXVsdChvYmopOlxuICAgIGlmIGlzaW5zdGFuY2Uob2JqLCBEZWNpbWFsKTpcbiAgICAgICAgcmV0dXJuIGludChvYmopIGlmIG9iaiAlIDEgPT0gMCBlbHNlIGZsb2F0KG9iailcbiAgICByYWlzZSBUeXBlRXJyb3JcblxuZGVmIGxhbWJkYV9oYW5kbGVyKGV2ZW50LCBjb250ZXh0KTpcbiAgICBjbGFpbXMgPSBldmVudC5nZXQoJ3JlcXVlc3RDb250ZXh0Jywge30pLmdldCgnYXV0aG9yaXplcicsIHt9KS5nZXQoJ2NsYWltcycsIHt9KVxuICAgIHVzZXJfaWQgPSBjbGFpbXMuZ2V0KCdzdWInLCAnJylcblxuICAgIGlmIG5vdCB1c2VyX2lkOlxuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgJ3N0YXR1c0NvZGUnOiA0MDEsXG4gICAgICAgICAgICAnaGVhZGVycyc6IGNvcnNfaGVhZGVycyhldmVudCksXG4gICAgICAgICAgICAnYm9keSc6IGpzb24uZHVtcHMoeydlcnJvcic6ICdVbmF1dGhvcml6ZWQnfSlcbiAgICAgICAgfVxuXG4gICAgcGF0aF9wYXJhbXMgPSBldmVudC5nZXQoJ3BhdGhQYXJhbWV0ZXJzJykgb3Ige31cbiAgICBkb2N1bWVudF9pZCA9IHBhdGhfcGFyYW1zLmdldCgnaWQnLCAnJylcblxuICAgIGlmIG5vdCBkb2N1bWVudF9pZDpcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICdzdGF0dXNDb2RlJzogNDAwLFxuICAgICAgICAgICAgJ2hlYWRlcnMnOiBjb3JzX2hlYWRlcnMoZXZlbnQpLFxuICAgICAgICAgICAgJ2JvZHknOiBqc29uLmR1bXBzKHsnZXJyb3InOiAnTWlzc2luZyBkb2N1bWVudCBJRCd9KVxuICAgICAgICB9XG5cbiAgICB0cnk6XG4gICAgICAgIHJlc3BvbnNlID0gdGFibGUuZ2V0X2l0ZW0oS2V5PXsnZG9jdW1lbnRfaWQnOiBkb2N1bWVudF9pZH0pXG5cbiAgICAgICAgaWYgJ0l0ZW0nIG5vdCBpbiByZXNwb25zZTpcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgJ3N0YXR1c0NvZGUnOiA0MDQsXG4gICAgICAgICAgICAgICAgJ2hlYWRlcnMnOiBjb3JzX2hlYWRlcnMoZXZlbnQpLFxuICAgICAgICAgICAgICAgICdib2R5JzoganNvbi5kdW1wcyh7J2Vycm9yJzogJ0RvY3VtZW50IG5vdCBmb3VuZCd9KVxuICAgICAgICAgICAgfVxuXG4gICAgICAgIGl0ZW0gPSByZXNwb25zZVsnSXRlbSddXG5cbiAgICAgICAgaWYgaXRlbS5nZXQoJ3VzZXJfaWQnLCAnJykgIT0gdXNlcl9pZDpcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgJ3N0YXR1c0NvZGUnOiA0MDQsXG4gICAgICAgICAgICAgICAgJ2hlYWRlcnMnOiBjb3JzX2hlYWRlcnMoZXZlbnQpLFxuICAgICAgICAgICAgICAgICdib2R5JzoganNvbi5kdW1wcyh7J2Vycm9yJzogJ0RvY3VtZW50IG5vdCBmb3VuZCd9KVxuICAgICAgICAgICAgfVxuXG4gICAgICAgIHJlc3VsdCA9IHtcbiAgICAgICAgICAgICdkb2N1bWVudF9pZCc6IGl0ZW1bJ2RvY3VtZW50X2lkJ10sXG4gICAgICAgICAgICAnZmlsZW5hbWUnOiBpdGVtLmdldCgnb3JpZ2luYWxfZmlsZW5hbWUnLCAnVW5rbm93bicpLFxuICAgICAgICAgICAgJ3N0YXR1cyc6IGl0ZW0uZ2V0KCdzdGF0dXMnLCAndW5rbm93bicpLFxuICAgICAgICAgICAgJ2dlbmVyYXRlZF9zdW1tYXJ5JzogaXRlbS5nZXQoJ2dlbmVyYXRlZF9zdW1tYXJ5JylcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICdzdW1tYXJ5X2dlbmVyYXRlZF9hdCcgaW4gaXRlbTpcbiAgICAgICAgICAgIHJlc3VsdFsnc3VtbWFyeV9nZW5lcmF0ZWRfYXQnXSA9IGl0ZW1bJ3N1bW1hcnlfZ2VuZXJhdGVkX2F0J11cblxuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgJ3N0YXR1c0NvZGUnOiAyMDAsXG4gICAgICAgICAgICAnaGVhZGVycyc6IGNvcnNfaGVhZGVycyhldmVudCksXG4gICAgICAgICAgICAnYm9keSc6IGpzb24uZHVtcHMocmVzdWx0LCBkZWZhdWx0PWRlY2ltYWxfZGVmYXVsdClcbiAgICAgICAgfVxuICAgIGV4Y2VwdCBFeGNlcHRpb24gYXMgZTpcbiAgICAgICAgcHJpbnQoZlwiRXJyb3I6IHtzdHIoZSl9XCIpXG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAnc3RhdHVzQ29kZSc6IDUwMCxcbiAgICAgICAgICAgICdoZWFkZXJzJzogY29yc19oZWFkZXJzKGV2ZW50KSxcbiAgICAgICAgICAgICdib2R5JzoganNvbi5kdW1wcyh7J2Vycm9yJzogc3RyKGUpfSlcbiAgICAgICAgfVxuYCksXG4gICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICBNRVRBREFUQV9UQUJMRTogcHJvcHMubWV0YWRhdGFUYWJsZU5hbWUsXG4gICAgICAgIEFMTE9XRURfT1JJR0lOUzogYWxsb3dlZE9yaWdpbnMsXG4gICAgICB9LFxuICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLnNlY29uZHMoMzApLFxuICAgIH0pO1xuXG4gICAgZ2V0RG9jdW1lbnRTdW1tYXJ5RnVuY3Rpb24uYWRkVG9Sb2xlUG9saWN5KG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgIGFjdGlvbnM6IFsnZHluYW1vZGI6R2V0SXRlbSddLFxuICAgICAgcmVzb3VyY2VzOiBbYGFybjphd3M6ZHluYW1vZGI6JHt0aGlzLnJlZ2lvbn06JHt0aGlzLmFjY291bnR9OnRhYmxlLyR7cHJvcHMubWV0YWRhdGFUYWJsZU5hbWV9YF0sXG4gICAgfSkpO1xuXG4gICAgY29uc3QgZG9jdW1lbnRJZFJlc291cmNlID0gZG9jdW1lbnRzUmVzb3VyY2UuYWRkUmVzb3VyY2UoJ3tpZH0nKTtcbiAgICBjb25zdCBzdW1tYXJ5UmVzb3VyY2UgPSBkb2N1bWVudElkUmVzb3VyY2UuYWRkUmVzb3VyY2UoJ3N1bW1hcnknKTtcblxuICAgIHN1bW1hcnlSZXNvdXJjZS5hZGRNZXRob2QoJ0dFVCcsIG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKGdldERvY3VtZW50U3VtbWFyeUZ1bmN0aW9uKSwge1xuICAgICAgYXV0aG9yaXplcixcbiAgICAgIGF1dGhvcml6YXRpb25UeXBlOiBhcGlnYXRld2F5LkF1dGhvcml6YXRpb25UeXBlLkNPR05JVE8sXG4gICAgfSk7XG5cbiAgICBjb25zdCBjb252ZXJzYXRpb25zUmVzb3VyY2UgPSBkb2N1bWVudElkUmVzb3VyY2UuYWRkUmVzb3VyY2UoJ2NvbnZlcnNhdGlvbnMnKTtcbiAgICBjb252ZXJzYXRpb25zUmVzb3VyY2UuYWRkTWV0aG9kKCdHRVQnLCBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbihwcm9wcy5jb252ZXJzYXRpb25GdW5jdGlvbiksIHtcbiAgICAgIGF1dGhvcml6ZXIsXG4gICAgICBhdXRob3JpemF0aW9uVHlwZTogYXBpZ2F0ZXdheS5BdXRob3JpemF0aW9uVHlwZS5DT0dOSVRPLFxuICAgIH0pO1xuICAgIGNvbnZlcnNhdGlvbnNSZXNvdXJjZS5hZGRNZXRob2QoJ1BPU1QnLCBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbihwcm9wcy5jb252ZXJzYXRpb25GdW5jdGlvbiksIHtcbiAgICAgIGF1dGhvcml6ZXIsXG4gICAgICBhdXRob3JpemF0aW9uVHlwZTogYXBpZ2F0ZXdheS5BdXRob3JpemF0aW9uVHlwZS5DT0dOSVRPLFxuICAgIH0pO1xuXG4gICAgY29uc3QgY29udmVyc2F0aW9uSWRSZXNvdXJjZSA9IGNvbnZlcnNhdGlvbnNSZXNvdXJjZS5hZGRSZXNvdXJjZSgne2NvbnZJZH0nKTtcbiAgICBjb252ZXJzYXRpb25JZFJlc291cmNlLmFkZE1ldGhvZCgnR0VUJywgbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24ocHJvcHMuY29udmVyc2F0aW9uRnVuY3Rpb24pLCB7XG4gICAgICBhdXRob3JpemVyLFxuICAgICAgYXV0aG9yaXphdGlvblR5cGU6IGFwaWdhdGV3YXkuQXV0aG9yaXphdGlvblR5cGUuQ09HTklUTyxcbiAgICB9KTtcblxuICAgIC8vIERlbGV0ZSBhY2NvdW50IGVuZHBvaW50IC0gREVMRVRFIC91c2Vycy9tZVxuICAgIGNvbnN0IGRlbGV0ZUFjY291bnRGdW5jdGlvbiA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgJ0RlbGV0ZUFjY291bnRGdW5jdGlvbicsIHtcbiAgICAgIGZ1bmN0aW9uTmFtZTogYCR7cH1EZWxldGVBY2NvdW50YCxcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLlBZVEhPTl8zXzksXG4gICAgICBoYW5kbGVyOiAnaW5kZXgubGFtYmRhX2hhbmRsZXInLFxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUlubGluZShgXG5pbXBvcnQganNvblxuaW1wb3J0IGJvdG8zXG5pbXBvcnQgb3NcbmZyb20gYm90bzMuZHluYW1vZGIuY29uZGl0aW9ucyBpbXBvcnQgQXR0clxuXG5zM19jbGllbnQgPSBib3RvMy5jbGllbnQoJ3MzJylcbmR5bmFtb2RiID0gYm90bzMucmVzb3VyY2UoJ2R5bmFtb2RiJylcbkJVQ0tFVF9OQU1FID0gb3MuZW52aXJvblsnQlVDS0VUX05BTUUnXVxuTUVUQURBVEFfVEFCTEUgPSBvcy5lbnZpcm9uWydNRVRBREFUQV9UQUJMRSddXG5cbkFMTE9XRURfT1JJR0lOUyA9IG9zLmVudmlyb24uZ2V0KCdBTExPV0VEX09SSUdJTlMnLCAnaHR0cDovL2xvY2FsaG9zdDozMDAwJykuc3BsaXQoJywnKVxuXG5kZWYgZ2V0X2NvcnNfb3JpZ2luKGV2ZW50KTpcbiAgICBvcmlnaW4gPSAoZXZlbnQuZ2V0KCdoZWFkZXJzJykgb3Ige30pLmdldCgnb3JpZ2luJykgb3IgKGV2ZW50LmdldCgnaGVhZGVycycpIG9yIHt9KS5nZXQoJ09yaWdpbicsICcnKVxuICAgIHJldHVybiBvcmlnaW4gaWYgb3JpZ2luIGluIEFMTE9XRURfT1JJR0lOUyBlbHNlIEFMTE9XRURfT1JJR0lOU1swXVxuXG5kZWYgY29yc19oZWFkZXJzKGV2ZW50KTpcbiAgICByZXR1cm4ge1xuICAgICAgICAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nLFxuICAgICAgICAnQWNjZXNzLUNvbnRyb2wtQWxsb3ctT3JpZ2luJzogZ2V0X2NvcnNfb3JpZ2luKGV2ZW50KSxcbiAgICAgICAgJ0FjY2Vzcy1Db250cm9sLUFsbG93LUNyZWRlbnRpYWxzJzogJ3RydWUnXG4gICAgfVxuXG5kZWYgbGFtYmRhX2hhbmRsZXIoZXZlbnQsIGNvbnRleHQpOlxuICAgIGNsYWltcyA9IGV2ZW50LmdldCgncmVxdWVzdENvbnRleHQnLCB7fSkuZ2V0KCdhdXRob3JpemVyJywge30pLmdldCgnY2xhaW1zJywge30pXG4gICAgdXNlcl9pZCA9IGNsYWltcy5nZXQoJ3N1YicsICcnKVxuXG4gICAgaWYgbm90IHVzZXJfaWQ6XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAnc3RhdHVzQ29kZSc6IDQwMSxcbiAgICAgICAgICAgICdoZWFkZXJzJzogY29yc19oZWFkZXJzKGV2ZW50KSxcbiAgICAgICAgICAgICdib2R5JzoganNvbi5kdW1wcyh7J2Vycm9yJzogJ1VuYXV0aG9yaXplZCd9KVxuICAgICAgICB9XG5cbiAgICB0cnk6XG4gICAgICAgIHRhYmxlID0gZHluYW1vZGIuVGFibGUoTUVUQURBVEFfVEFCTEUpXG5cbiAgICAgICAgIyBTY2FuIGZvciBhbGwgZG9jdW1lbnRzIGJlbG9uZ2luZyB0byB0aGlzIHVzZXJcbiAgICAgICAgcmVzcG9uc2UgPSB0YWJsZS5zY2FuKEZpbHRlckV4cHJlc3Npb249QXR0cigndXNlcl9pZCcpLmVxKHVzZXJfaWQpKVxuICAgICAgICBpdGVtcyA9IHJlc3BvbnNlLmdldCgnSXRlbXMnLCBbXSlcbiAgICAgICAgd2hpbGUgJ0xhc3RFdmFsdWF0ZWRLZXknIGluIHJlc3BvbnNlOlxuICAgICAgICAgICAgcmVzcG9uc2UgPSB0YWJsZS5zY2FuKFxuICAgICAgICAgICAgICAgIEZpbHRlckV4cHJlc3Npb249QXR0cigndXNlcl9pZCcpLmVxKHVzZXJfaWQpLFxuICAgICAgICAgICAgICAgIEV4Y2x1c2l2ZVN0YXJ0S2V5PXJlc3BvbnNlWydMYXN0RXZhbHVhdGVkS2V5J11cbiAgICAgICAgICAgIClcbiAgICAgICAgICAgIGl0ZW1zLmV4dGVuZChyZXNwb25zZS5nZXQoJ0l0ZW1zJywgW10pKVxuXG4gICAgICAgICMgRGVsZXRlIGVhY2ggdHJhY2tlZCBTMyBvYmplY3RcbiAgICAgICAgZm9yIGl0ZW0gaW4gaXRlbXM6XG4gICAgICAgICAgICBzM19sb2MgPSBpdGVtLmdldCgnb3JpZ2luYWxfczNfbG9jYXRpb24nLCB7fSlcbiAgICAgICAgICAgIGtleSA9IHMzX2xvYy5nZXQoJ2tleScsICcnKVxuICAgICAgICAgICAgaWYga2V5OlxuICAgICAgICAgICAgICAgIHMzX2NsaWVudC5kZWxldGVfb2JqZWN0KEJ1Y2tldD1CVUNLRVRfTkFNRSwgS2V5PWtleSlcblxuICAgICAgICAjIERlbGV0ZSBhbnkgb3JwaGFuZWQgb2JqZWN0cyB1bmRlciB1c2Vycy97dXNlcl9pZH0vXG4gICAgICAgIHBhZ2luYXRvciA9IHMzX2NsaWVudC5nZXRfcGFnaW5hdG9yKCdsaXN0X29iamVjdHNfdjInKVxuICAgICAgICBmb3IgcGFnZSBpbiBwYWdpbmF0b3IucGFnaW5hdGUoQnVja2V0PUJVQ0tFVF9OQU1FLCBQcmVmaXg9Zid1c2Vycy97dXNlcl9pZH0vJyk6XG4gICAgICAgICAgICBvYmplY3RzID0gW3snS2V5Jzogb2JqWydLZXknXX0gZm9yIG9iaiBpbiBwYWdlLmdldCgnQ29udGVudHMnLCBbXSldXG4gICAgICAgICAgICBpZiBvYmplY3RzOlxuICAgICAgICAgICAgICAgIHMzX2NsaWVudC5kZWxldGVfb2JqZWN0cyhCdWNrZXQ9QlVDS0VUX05BTUUsIERlbGV0ZT17J09iamVjdHMnOiBvYmplY3RzfSlcblxuICAgICAgICAjIEJhdGNoLWRlbGV0ZSBEeW5hbW9EQiByZWNvcmRzXG4gICAgICAgIHdpdGggdGFibGUuYmF0Y2hfd3JpdGVyKCkgYXMgYmF0Y2g6XG4gICAgICAgICAgICBmb3IgaXRlbSBpbiBpdGVtczpcbiAgICAgICAgICAgICAgICBiYXRjaC5kZWxldGVfaXRlbShLZXk9eydkb2N1bWVudF9pZCc6IGl0ZW1bJ2RvY3VtZW50X2lkJ119KVxuXG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAnc3RhdHVzQ29kZSc6IDIwMCxcbiAgICAgICAgICAgICdoZWFkZXJzJzogY29yc19oZWFkZXJzKGV2ZW50KSxcbiAgICAgICAgICAgICdib2R5JzoganNvbi5kdW1wcyh7J21lc3NhZ2UnOiAnQWNjb3VudCBkYXRhIGRlbGV0ZWQnfSlcbiAgICAgICAgfVxuICAgIGV4Y2VwdCBFeGNlcHRpb24gYXMgZTpcbiAgICAgICAgcHJpbnQoZlwiRXJyb3I6IHtzdHIoZSl9XCIpXG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAnc3RhdHVzQ29kZSc6IDUwMCxcbiAgICAgICAgICAgICdoZWFkZXJzJzogY29yc19oZWFkZXJzKGV2ZW50KSxcbiAgICAgICAgICAgICdib2R5JzoganNvbi5kdW1wcyh7J2Vycm9yJzogc3RyKGUpfSlcbiAgICAgICAgfVxuYCksXG4gICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICBCVUNLRVRfTkFNRTogcHJvcHMucHJvY2Vzc2luZ0J1Y2tldC5idWNrZXROYW1lLFxuICAgICAgICBNRVRBREFUQV9UQUJMRTogcHJvcHMubWV0YWRhdGFUYWJsZU5hbWUsXG4gICAgICAgIEFMTE9XRURfT1JJR0lOUzogYWxsb3dlZE9yaWdpbnMsXG4gICAgICB9LFxuICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLnNlY29uZHMoNjApLFxuICAgIH0pO1xuXG4gICAgZGVsZXRlQWNjb3VudEZ1bmN0aW9uLmFkZFRvUm9sZVBvbGljeShuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICBhY3Rpb25zOiBbJ2R5bmFtb2RiOlNjYW4nLCAnZHluYW1vZGI6RGVsZXRlSXRlbScsICdkeW5hbW9kYjpCYXRjaFdyaXRlSXRlbSddLFxuICAgICAgcmVzb3VyY2VzOiBbYGFybjphd3M6ZHluYW1vZGI6JHt0aGlzLnJlZ2lvbn06JHt0aGlzLmFjY291bnR9OnRhYmxlLyR7cHJvcHMubWV0YWRhdGFUYWJsZU5hbWV9YF0sXG4gICAgfSkpO1xuXG4gICAgZGVsZXRlQWNjb3VudEZ1bmN0aW9uLmFkZFRvUm9sZVBvbGljeShuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICBhY3Rpb25zOiBbJ3MzOkRlbGV0ZU9iamVjdCcsICdzMzpMaXN0QnVja2V0J10sXG4gICAgICByZXNvdXJjZXM6IFtwcm9wcy5wcm9jZXNzaW5nQnVja2V0LmJ1Y2tldEFybiwgYCR7cHJvcHMucHJvY2Vzc2luZ0J1Y2tldC5idWNrZXRBcm59LypgXSxcbiAgICB9KSk7XG5cbiAgICBjb25zdCB1c2Vyc1Jlc291cmNlID0gdGhpcy5hcGkucm9vdC5hZGRSZXNvdXJjZSgndXNlcnMnKTtcbiAgICBjb25zdCBtZVJlc291cmNlID0gdXNlcnNSZXNvdXJjZS5hZGRSZXNvdXJjZSgnbWUnKTtcbiAgICBtZVJlc291cmNlLmFkZE1ldGhvZCgnREVMRVRFJywgbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24oZGVsZXRlQWNjb3VudEZ1bmN0aW9uKSwge1xuICAgICAgYXV0aG9yaXplcixcbiAgICAgIGF1dGhvcml6YXRpb25UeXBlOiBhcGlnYXRld2F5LkF1dGhvcml6YXRpb25UeXBlLkNPR05JVE8sXG4gICAgfSk7XG5cbiAgICBjb25zdCB1c2FnZVJlc291cmNlID0gbWVSZXNvdXJjZS5hZGRSZXNvdXJjZSgndXNhZ2UnKTtcbiAgICB1c2FnZVJlc291cmNlLmFkZE1ldGhvZCgnR0VUJywgbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24ocHJvcHMudXNhZ2VGdW5jdGlvbiksIHtcbiAgICAgIGF1dGhvcml6ZXIsXG4gICAgICBhdXRob3JpemF0aW9uVHlwZTogYXBpZ2F0ZXdheS5BdXRob3JpemF0aW9uVHlwZS5DT0dOSVRPLFxuICAgIH0pO1xuXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgICAvLyBPVVRQVVRTXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdVc2VyUG9vbElkJywge1xuICAgICAgdmFsdWU6IHRoaXMudXNlclBvb2wudXNlclBvb2xJZCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnQ29nbml0byBVc2VyIFBvb2wgSUQnLFxuICAgICAgZXhwb3J0TmFtZTogYCR7cH1QZGZDb252ZXJzYXRpb24tVXNlclBvb2xJZGAsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnVXNlclBvb2xDbGllbnRJZCcsIHtcbiAgICAgIHZhbHVlOiB0aGlzLnVzZXJQb29sQ2xpZW50LnVzZXJQb29sQ2xpZW50SWQsXG4gICAgICBkZXNjcmlwdGlvbjogJ0NvZ25pdG8gVXNlciBQb29sIENsaWVudCBJRCcsXG4gICAgICBleHBvcnROYW1lOiBgJHtwfVBkZkNvbnZlcnNhdGlvbi1Vc2VyUG9vbENsaWVudElkYCxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdJZGVudGl0eVBvb2xJZCcsIHtcbiAgICAgIHZhbHVlOiB0aGlzLmlkZW50aXR5UG9vbC5yZWYsXG4gICAgICBkZXNjcmlwdGlvbjogJ0NvZ25pdG8gSWRlbnRpdHkgUG9vbCBJRCcsXG4gICAgICBleHBvcnROYW1lOiBgJHtwfVBkZkNvbnZlcnNhdGlvbi1JZGVudGl0eVBvb2xJZGAsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnQXBpRW5kcG9pbnQnLCB7XG4gICAgICB2YWx1ZTogdGhpcy5hcGkudXJsLFxuICAgICAgZGVzY3JpcHRpb246ICdBUEkgR2F0ZXdheSBFbmRwb2ludCBVUkwnLFxuICAgICAgZXhwb3J0TmFtZTogYCR7cH1QZGZDb252ZXJzYXRpb24tQXBpRW5kcG9pbnRgLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0NvZ25pdG9SZWdpb24nLCB7XG4gICAgICB2YWx1ZTogdGhpcy5yZWdpb24sXG4gICAgICBkZXNjcmlwdGlvbjogJ0FXUyBSZWdpb24gZm9yIENvZ25pdG8nLFxuICAgICAgZXhwb3J0TmFtZTogYCR7cH1QZGZDb252ZXJzYXRpb24tQ29nbml0b1JlZ2lvbmAsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnVXNlclBvb2xEb21haW5PdXRwdXQnLCB7XG4gICAgICB2YWx1ZTogYCR7ZG9tYWluUHJlZml4fS5hdXRoLiR7dGhpcy5yZWdpb259LmFtYXpvbmNvZ25pdG8uY29tYCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnQ29nbml0byBVc2VyIFBvb2wgRG9tYWluJyxcbiAgICAgIGV4cG9ydE5hbWU6IGAke3B9UGRmQ29udmVyc2F0aW9uLVVzZXJQb29sRG9tYWluYCxcbiAgICB9KTtcbiAgfVxufVxuIl19